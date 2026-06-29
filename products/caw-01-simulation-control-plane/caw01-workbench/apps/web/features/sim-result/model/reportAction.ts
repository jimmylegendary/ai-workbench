"use server";

import { spawn } from "node:child_process";
import type { ResultMetric, RunSummary } from "./types";

/**
 * AI report Server Action (B5). Builds a prompt from the run's results and asks
 * a backend chosen by env — then ALWAYS returns markdown, even with nothing
 * configured (deterministic template). Secrets stay server-only: this file is
 * 'use server', so OPENAI_API_KEY / base URLs never reach the client bundle.
 *
 *   AI_BACKEND = 'openai'      → POST {OPENAI_BASEURL||api.openai.com/v1}/chat/completions
 *                                with Bearer OPENAI_API_KEY (model OPENAI_MODEL||gpt-4o-mini)
 *              = 'claude-cli'  → spawn `claude -p <prompt>`     (node:child_process)
 *              = 'openclaw-cli'→ spawn `openclaw -p <prompt>`   (node:child_process)
 *              = (unset/other) → deterministic templated markdown summary
 */

export interface ReportInput {
  /** Human context for the prompt header. */
  experimentLabel?: string;
  /** The runs in view (picker order). */
  runs: RunSummary[];
  /** The run the user is focused on (its id), if any. */
  focusRunId?: string;
  /** Latest-per-series values used for the comparison narrative. */
  latest: Array<{
    runId: string;
    axis: ResultMetric["axis"];
    name: string;
    value: number;
    unit: string | null;
  }>;
}

export interface ReportResult {
  ok: boolean;
  backend: "openai" | "claude-cli" | "openclaw-cli" | "template";
  markdown: string;
  error?: string;
}

const SYSTEM_PROMPT =
  "You are a simulation-results analyst for an LLM-serving hardware control " +
  "plane. Given comparable run metrics, write a concise markdown report: a " +
  "one-line verdict, a short comparison of the runs, notable real-vs-sim " +
  "deltas, and 2-3 next-step recommendations. Use compact prose and bullet " +
  "lists. Do not invent numbers beyond those provided.";

export async function generateReport(input: ReportInput): Promise<ReportResult> {
  const prompt = buildPrompt(input);
  const backend = (process.env.AI_BACKEND ?? "").trim().toLowerCase();

  try {
    if (backend === "openai" && process.env.OPENAI_API_KEY) {
      const markdown = await callOpenAI(prompt);
      return { ok: true, backend: "openai", markdown };
    }
    if (backend === "claude-cli") {
      const markdown = await callCli("claude", ["-p", prompt]);
      return { ok: true, backend: "claude-cli", markdown };
    }
    if (backend === "openclaw-cli") {
      const markdown = await callCli("openclaw", ["-p", prompt]);
      return { ok: true, backend: "openclaw-cli", markdown };
    }
  } catch (err) {
    // Backend configured but failed → fall back to the template, surface why.
    return {
      ok: true,
      backend: "template",
      markdown: templateReport(input),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Nothing configured → deterministic, always-works summary.
  return { ok: true, backend: "template", markdown: templateReport(input) };
}

// ── prompt construction ──────────────────────────────────────────────────────
function buildPrompt(input: ReportInput): string {
  const lines: string[] = [];
  lines.push(SYSTEM_PROMPT, "");
  lines.push(`# Results for ${input.experimentLabel ?? "experiment"}`);
  lines.push("", "## Runs");
  for (const r of input.runs) {
    const focus = r.runId === input.focusRunId ? " (focus)" : "";
    lines.push(`- ${r.label} [${r.status}]${focus}`);
  }
  lines.push("", "## Latest metric values (per run · axis · metric)");
  for (const m of input.latest) {
    const label = labelFor(input.runs, m.runId);
    lines.push(
      `- ${label} | ${m.axis} | ${m.name} = ${m.value}${m.unit ? " " + m.unit : ""}`,
    );
  }
  lines.push("", "Write the markdown report now.");
  return lines.join("\n");
}

// ── OpenAI-compatible chat completions ───────────────────────────────────────
async function callOpenAI(prompt: string): Promise<string> {
  const base = process.env.OPENAI_BASEURL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned no content");
  return content;
}

// ── CLI backends (claude / openclaw) ─────────────────────────────────────────
function callCli(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // No shell → args are passed literally, so the prompt can't be re-parsed.
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out`));
    }, 120_000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`${cmd} exited ${code}: ${err || "no output"}`));
    });
  });
}

// ── deterministic template (the always-works path) ───────────────────────────
function templateReport(input: ReportInput): string {
  const { runs, latest } = input;
  const byMetric = new Map<string, typeof latest>();
  for (const m of latest) {
    const arr = byMetric.get(m.name) ?? [];
    arr.push(m);
    byMetric.set(m.name, arr);
  }

  const out: string[] = [];
  out.push(`# Simulation Result Report`);
  out.push(
    `_${input.experimentLabel ?? "experiment"} · ${runs.length} run${runs.length === 1 ? "" : "s"} · generated locally (no AI backend configured)._`,
  );
  out.push("");
  out.push("## Verdict");
  const verdict = pickVerdict(input);
  out.push(verdict);
  out.push("");

  out.push("## Runs");
  for (const r of runs) {
    out.push(`- **${r.label}** — ${r.status}`);
  }
  out.push("");

  out.push("## Metric comparison (latest value per run)");
  for (const [name, samples] of byMetric) {
    // Prefer the 'sim' axis for the headline comparison.
    const sim = samples.filter((s) => s.axis === "sim");
    const set = sim.length ? sim : samples;
    const unit = set[0]?.unit ? ` ${set[0].unit}` : "";
    out.push(`- **${name}**`);
    for (const s of set.sort((a, b) => a.value - b.value)) {
      out.push(`  - ${labelFor(runs, s.runId)}: ${s.value}${unit}`);
    }
  }
  out.push("");

  // real-vs-sim fidelity callout
  const deltas = realVsSim(latest, runs);
  if (deltas.length) {
    out.push("## Real vs sim fidelity");
    for (const d of deltas) out.push(`- ${d}`);
    out.push("");
  }

  out.push("## Recommendations");
  out.push(
    "- Promote the best-throughput configuration to a confirmation run on real hardware.",
  );
  out.push(
    "- Investigate any metric where the real/sim gap exceeds ~10% before trusting the projection.",
  );
  out.push(
    "- Re-run the leading configuration with a larger batch to find the throughput knee.",
  );
  return out.join("\n");
}

function pickVerdict(input: ReportInput): string {
  const tput = input.latest.filter(
    (m) => m.name === "throughput_tok_s" && m.axis === "sim",
  );
  if (tput.length >= 2) {
    const best = tput.reduce((a, b) => (b.value > a.value ? b : a));
    const worst = tput.reduce((a, b) => (b.value < a.value ? b : a));
    const gain =
      worst.value > 0
        ? Math.round(((best.value - worst.value) / worst.value) * 100)
        : 0;
    return `**${labelFor(input.runs, best.runId)}** leads on simulated throughput (${best.value} tok/s), ~${gain}% over the slowest run.`;
  }
  return "Comparable readouts collected; see metric comparison below.";
}

function realVsSim(latest: ReportInput["latest"], runs: RunSummary[]): string[] {
  const out: string[] = [];
  const key = (runId: string, name: string) => `${runId}::${name}`;
  const real = new Map<string, number>();
  const sim = new Map<string, number>();
  for (const m of latest) {
    if (m.axis === "real") real.set(key(m.runId, m.name), m.value);
    if (m.axis === "sim") sim.set(key(m.runId, m.name), m.value);
  }
  for (const [k, rv] of real) {
    const sv = sim.get(k);
    if (sv == null || rv === 0) continue;
    const pct = Math.round(((sv - rv) / rv) * 100);
    const [runId, name] = k.split("::");
    out.push(
      `${labelFor(runs, runId)} · ${name}: sim is ${pct >= 0 ? "+" : ""}${pct}% vs real.`,
    );
  }
  return out;
}

function labelFor(runs: RunSummary[], runId: string): string {
  return runs.find((r) => r.runId === runId)?.label ?? runId.slice(0, 8);
}

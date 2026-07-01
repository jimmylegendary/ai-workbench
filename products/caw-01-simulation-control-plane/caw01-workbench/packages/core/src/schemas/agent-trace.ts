import { z } from "zod";

/**
 * Canonical AGENT-TRACE model — the workbench-internal shape the Workload (C1)
 * viewer renders. A company trace file (JSON/JSONL, structure shareable) is
 * mapped onto this by a `TraceAdapter`; the viewer never sees the raw format.
 *
 * Load unit = one SESSION file that contains many TURNS (interview 2026-07). One
 * turn = one agent turn = Canvas-1's unit = the REAL evidence axis (ADR-0005 §6).
 * A turn's `server` steps are what drive the Serving pipeline (synthetic/sim).
 *
 * All timestamps are ISO strings and all fields JSON-serialisable so a session
 * can cross the seam / be stored as a blob-by-URI (ADR-0002 / ADR-0008).
 */

/** What a step is. `server` = a server-side serving/LLM call → Serving pipeline. */
export const StepKind = z.enum([
  "io",
  "router",
  "llm",
  "tool",
  "memory",
  "server",
]);
export type StepKind = z.infer<typeof StepKind>;

/** Where the step ran (C1 exec-location badge; llm→server via serving framework). */
export const ExecLocation = z.enum(["client", "server"]);
export type ExecLocation = z.infer<typeof ExecLocation>;

export const StepStatus = z.enum(["ok", "error", "running", "unknown"]);
export type StepStatus = z.infer<typeof StepStatus>;

/** One step within a turn — a node in the harness graph. */
export const AgentStep = z.object({
  id: z.string(),
  kind: StepKind,
  name: z.string(),
  /** parent step (control-flow tree); null/undefined = turn root. */
  parentId: z.string().nullish(),
  /** explicit downstream steps (data/control edges) if the trace provides them. */
  next: z.array(z.string()).optional(),
  startedAt: z.string().optional(), // ISO
  endedAt: z.string().optional(), // ISO
  durationMs: z.number().optional(),
  execLocation: ExecLocation.optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  costUsd: z.number().optional(),
  /** free-form call inputs — any JSON (object OR scalar, e.g. a prompt string). */
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  status: StepStatus.default("unknown"),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type AgentStep = z.infer<typeof AgentStep>;

/** Rollup shown in the turn list + turn header (derivable from steps). */
export const TurnSummary = z.object({
  stepCount: z.number(),
  toolCalls: z.number(),
  serverCalls: z.number(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  totalMs: z.number().optional(),
  status: StepStatus.default("unknown"),
});
export type TurnSummary = z.infer<typeof TurnSummary>;

export const AgentTurn = z.object({
  id: z.string(),
  index: z.number(), // position in the session (0-based)
  label: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMs: z.number().optional(),
  steps: z.array(AgentStep),
  summary: TurnSummary.optional(),
});
export type AgentTurn = z.infer<typeof AgentTurn>;

export const AgentSession = z.object({
  id: z.string(),
  /** origin hint (filename / exporter / adapter name). */
  source: z.string().optional(),
  createdAt: z.string().optional(),
  turns: z.array(AgentTurn),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type AgentSession = z.infer<typeof AgentSession>;

/**
 * Adapter seam: a company trace format → canonical `AgentSession`. The web app
 * ships a best-effort generic adapter + fixtures; the in-company AI writes the
 * real adapter against actual trace data (see the workload-serving-trace plan).
 */
export interface TraceAdapter {
  /** stable adapter id, e.g. "generic-json", "acme-v2". */
  name: string;
  /** cheap check: can this adapter parse `raw`? */
  detect(raw: unknown): boolean;
  /** map raw parsed JSON/JSONL into the canonical session (throws on shape error). */
  parseSession(raw: unknown): AgentSession;
}

/** Derive a TurnSummary from a turn's steps (viewer + adapters share this). */
export function summariseTurn(steps: AgentStep[]): TurnSummary {
  const num = (f: (s: AgentStep) => number | undefined) =>
    steps.reduce((a, s) => a + (f(s) ?? 0), 0);
  const anyErr = steps.some((s) => s.status === "error");
  const running = steps.some((s) => s.status === "running");
  return {
    stepCount: steps.length,
    toolCalls: steps.filter((s) => s.kind === "tool").length,
    // server-side calls = anything executed on the server (llm/server steps run
    // on the serving framework). The OTel adapter maps llm rows to kind "llm"
    // with execLocation "server", so count by execLocation, not kind.
    serverCalls: steps.filter((s) => s.execLocation === "server").length,
    tokensIn: num((s) => s.tokensIn) || undefined,
    tokensOut: num((s) => s.tokensOut) || undefined,
    totalMs: num((s) => s.durationMs) || undefined,
    status: anyErr ? "error" : running ? "running" : "ok",
  };
}

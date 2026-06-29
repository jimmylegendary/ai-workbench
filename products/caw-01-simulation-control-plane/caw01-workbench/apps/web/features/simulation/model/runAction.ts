"use server";

import { randomUUID } from "node:crypto";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { StartRunInput, type EvidenceAxis } from "@caw/core";
import type { SimLogEntry } from "./fixtures/simlog";

/**
 * The RESULTS LOOP entry point (TASK RL).
 *
 * The Python engine port is still a stub, so this Server Action SYNTHESISES a
 * plausible result set for an experiment: per-axis (real/synthetic/sim) samples
 * across a few comparable metrics, plus a handful of log lines. Results are the
 * SAME shape the real engine would append to `sim_result_metric` (0002), so the
 * Sim Result page reads them with no change.
 *
 * Persistence is best-effort and server-only:
 *   • If SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL are configured AND
 *     the experiment resolves to a real owner, we insert a `simulation_run` row
 *     and its `sim_result_metric` samples (service-role, RLS-bypassing — owned
 *     by the experiment's owner so the user's RLS read picks them up).
 *   • Otherwise (no config / placeholder experiment / any error) we skip the
 *     write and return the metrics in-memory. The Sim Result page already falls
 *     back to its example dataset, so the loop still demonstrates end-to-end.
 *
 * Secrets stay server-only: this file is 'use server', so the service-role key
 * never reaches the client bundle.
 */

/** One synthesized sample — mirrors a `sim_result_metric` row (minus ids). */
export interface SynthMetric {
  runId: string;
  axis: EvidenceAxis; // 'real' | 'synthetic' | 'sim'
  name: string;
  value: number;
  unit: string | null;
  ts: string; // ISO timestamp
}

export interface RunSimulationResult {
  ok: true;
  runId: string;
  /** True only when the rows were actually written to Supabase. */
  persisted: boolean;
  metrics: SynthMetric[];
  logs: SimLogEntry[];
}

/** Metric blueprint: base value per axis + unit. Sim is the optimistic lane. */
const METRICS: Array<{
  name: string;
  unit: string;
  base: Record<"real" | "synthetic" | "sim", number>;
  /** per-sample drift (improving series) */
  drift: number;
}> = [
  {
    name: "latency_ms",
    unit: "ms",
    base: { real: 13.1, synthetic: 12.7, sim: 12.0 },
    drift: -0.15,
  },
  {
    name: "bytes_moved",
    unit: "GiB",
    base: { real: 1.79, synthetic: 1.81, sim: 1.83 },
    drift: 0.02,
  },
  {
    name: "hbm_residency",
    unit: "%",
    base: { real: 72.4, synthetic: 73.1, sim: 74.2 },
    drift: 0.3,
  },
  {
    name: "tokens_s",
    unit: "tok/s",
    base: { real: 1790, synthetic: 1825, sim: 1862 },
    drift: 14,
  },
];

const AXES = ["real", "synthetic", "sim"] as const;
const SAMPLES = 6; // samples per (axis, metric) series
const STEP_MS = 60_000;

const round = (v: number) => Math.round(v * 100) / 100;

/** Synthesize a full result set + log lines for one run. Small random wobble. */
function synthesize(runId: string): {
  metrics: SynthMetric[];
  logs: SimLogEntry[];
} {
  const t0 = Date.now() - SAMPLES * STEP_MS;
  const metrics: SynthMetric[] = [];

  for (const axis of AXES) {
    for (const m of METRICS) {
      const start = m.base[axis];
      for (let i = 0; i < SAMPLES; i++) {
        // gentle drift + small per-sample variation (±2% of the base)
        const wobble = (Math.random() - 0.5) * Math.abs(start) * 0.04;
        metrics.push({
          runId,
          axis,
          name: m.name,
          unit: m.unit,
          value: round(start + m.drift * i + wobble),
          ts: new Date(t0 + i * STEP_MS).toISOString(),
        });
      }
    }
  }

  // Headline figures (the last sim sample of each series) for the log summary.
  const lastSim = (name: string) =>
    metrics
      .filter((x) => x.axis === "sim" && x.name === name)
      .at(-1)?.value ?? 0;

  const logs: SimLogEntry[] = [
    { level: "info", msg: `run ${runId.slice(0, 8)} — synthesizing 3-axis projection` },
    { level: "debug", msg: `axes: real · synthetic · sim · ${METRICS.length} metrics × ${SAMPLES} samples` },
    { level: "info", msg: `sim latency p50 ${lastSim("latency_ms")} ms · ${lastSim("tokens_s")} tok/s` },
    { level: "info", msg: `HBM residency ${lastSim("hbm_residency")}% · ${lastSim("bytes_moved")} GiB moved` },
    { level: "ok", msg: `run ${runId.slice(0, 8)} complete — projection ready` },
  ];

  return { metrics, logs };
}

/** Best-effort persist to Supabase via the service-role client. */
async function persist(
  experimentId: string,
  runId: string,
  metrics: SynthMetric[],
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  const supabase = createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the experiment's owner — both the run row and the samples must be
  // owned by that user for the user's RLS-scoped read to surface them. If the
  // experiment isn't real (placeholder id), bail out and return in-memory.
  const { data: exp, error: expErr } = await supabase
    .from("experiment")
    .select("id, created_by")
    .eq("id", experimentId)
    .maybeSingle();
  if (expErr || !exp) return false;

  const ownerId = (exp as { created_by?: string }).created_by ?? null;
  if (!ownerId) return false;

  const { error: runErr } = await supabase.from("simulation_run").insert({
    id: runId,
    experiment_id: experimentId,
    status: "succeeded",
    started_at: new Date(Date.now() - SAMPLES * STEP_MS).toISOString(),
    finished_at: new Date().toISOString(),
    created_by: ownerId,
  });
  if (runErr) return false;

  const { error: metricErr } = await supabase.from("sim_result_metric").insert(
    metrics.map((m) => ({
      run_id: m.runId,
      axis: m.axis,
      name: m.name,
      value: m.value,
      unit: m.unit,
      ts: m.ts,
      created_by: ownerId,
    })),
  );
  if (metricErr) return false;

  return true;
}

/**
 * Run a simulation for `experimentId`: synthesize results, try to persist them,
 * and return the run id + metrics + log lines for the ViewModel to fan out.
 */
export async function runSimulation(
  experimentId: string,
): Promise<RunSimulationResult> {
  // Validate the same way the (stubbed) real start path would.
  StartRunInput.parse({ experiment_id: experimentId });

  const runId = randomUUID();
  const { metrics, logs } = synthesize(runId);

  let persisted = false;
  try {
    persisted = await persist(experimentId, runId, metrics);
  } catch {
    persisted = false; // never let a write failure break the loop (non-blocking)
  }

  const finalLogs: SimLogEntry[] = persisted
    ? [...logs, { level: "ok", msg: `persisted ${metrics.length} samples → sim_result_metric` }]
    : [...logs, { level: "debug", msg: "supabase not configured — results held in-memory" }];

  return { ok: true, runId, persisted, metrics, logs: finalLogs };
}

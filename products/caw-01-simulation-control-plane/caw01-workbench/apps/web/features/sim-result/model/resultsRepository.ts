import { createClient } from "@/lib/supabase/server";
import { exampleDataset } from "./example";
import type { ResultAxis, ResultMetric, ResultsDataset, RunSummary } from "./types";

/**
 * Results model layer — the only place that knows the Supabase result rows
 * exist (RLS-guarded reads via the server client; see 0002_results.sql).
 *
 * "Results accumulate in Supabase" interface
 * ─────────────────────────────────────────
 * The engine (or any RLS-authenticated writer) APPENDS rows to
 * `sim_result_metric` as a run progresses — one row per (run, axis, metric, ts)
 * sample. This repository only ever READS:
 *   • `sim_run_summary`  → the run picker / run list
 *   • `sim_result_metric`→ the comparison bars + over-time series
 * Reads are owner-scoped by RLS (run → experiment → project.created_by).
 *
 * If Supabase returns no result rows (fresh project, or the migration is
 * applied but nothing has run yet) — or the result tables don't exist yet —
 * we fall back to {@link exampleDataset} so the page ALWAYS renders something.
 * The returned shape is identical either way; only `source` differs.
 */
export const resultsRepository = {
  /** Read the full result set for an experiment (or the whole owner scope). */
  async getResults(experimentId?: string): Promise<ResultsDataset> {
    try {
      const supabase = await createClient();

      let summaryQ = supabase
        .from("sim_run_summary")
        .select("run_id, experiment_id, status, created_at")
        .order("created_at", { ascending: false });
      if (experimentId) summaryQ = summaryQ.eq("experiment_id", experimentId);

      const { data: summaryRows, error: summaryErr } = await summaryQ;
      if (summaryErr) throw summaryErr;
      if (!summaryRows || summaryRows.length === 0) return exampleDataset;

      const runIds = summaryRows.map((r) => r.run_id as string);

      const { data: metricRows, error: metricErr } = await supabase
        .from("sim_result_metric")
        .select("run_id, axis, name, value, unit, ts")
        .in("run_id", runIds)
        .order("ts", { ascending: true });
      if (metricErr) throw metricErr;
      if (!metricRows || metricRows.length === 0) return exampleDataset;

      const runs: RunSummary[] = summaryRows.map((r) => ({
        runId: r.run_id as string,
        // No human label column yet; synthesize a stable one from id + status.
        label: `run ${(r.run_id as string).slice(0, 8)} · ${r.status}`,
        status: r.status as RunSummary["status"],
        createdAt: r.created_at as string,
      }));

      const metrics: ResultMetric[] = metricRows.map((m) => ({
        runId: m.run_id as string,
        axis: m.axis as ResultAxis,
        name: m.name as string,
        value: Number(m.value),
        unit: (m.unit as string | null) ?? null,
        ts: m.ts as string,
      }));

      return { source: "supabase", runs, metrics };
    } catch {
      // Tables missing / RLS denied / offline → still show the example data.
      return exampleDataset;
    }
  },
};

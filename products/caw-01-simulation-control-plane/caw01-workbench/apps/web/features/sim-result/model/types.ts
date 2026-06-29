/**
 * Sim-result domain shapes shared by the repository, the example fixture, the
 * View, and the report action. Deliberately flat + serialisable so a Server
 * Component can fetch them and hand them to the 'use client' screen as props.
 *
 * These mirror packages/db/migrations/0002_results.sql (sim_result_metric +
 * sim_run_summary) and reuse the @caw/core EvidenceAxis / RunStatus semantics.
 */
import type { EvidenceAxis, RunStatus } from "@caw/core";

/** Evidence lane a sample belongs to — see result_axis enum. */
export type ResultAxis = EvidenceAxis; // 'real' | 'synthetic' | 'sim'

/** One sample: a (run, axis, metric) value at a point in time. */
export interface ResultMetric {
  runId: string;
  axis: ResultAxis;
  name: string;
  value: number;
  unit: string | null;
  ts: string; // ISO timestamp (series x-axis)
}

/** Per-run rollup powering the run picker (from sim_run_summary). */
export interface RunSummary {
  runId: string;
  label: string;
  status: RunStatus;
  createdAt: string;
}

/** Everything the page needs in one read. `source` only drives a UI notice. */
export interface ResultsDataset {
  source: "supabase" | "example";
  runs: RunSummary[];
  metrics: ResultMetric[];
}

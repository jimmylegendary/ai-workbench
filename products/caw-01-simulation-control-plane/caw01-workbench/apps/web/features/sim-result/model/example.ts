/**
 * Example results dataset — the page's "always shows something" fallback.
 *
 * Returned by resultsRepository.getResults() when Supabase has no rows yet
 * (fresh project, migration applied but engine hasn't appended any
 * sim_result_metric rows). Shapes are IDENTICAL to the Supabase-backed reads,
 * so the View never branches on `source` for rendering — only for a small
 * "example data" notice.
 *
 * Mirrors the 0002_results.sql contract: per-(run, axis, metric, ts) samples
 * plus a per-run summary. Numbers are plausible LLM-serving readouts so the
 * charts look like real evidence rather than lorem.
 */
import type {
  ResultAxis,
  ResultMetric,
  ResultsDataset,
  RunSummary,
} from "./types";

const T0 = Date.parse("2026-06-29T09:00:00Z");
const step = 60_000; // 1 sample / minute

/** Build a falling/rising time series for one (run, axis, metric). */
function series(
  runId: string,
  axis: ResultAxis,
  name: string,
  unit: string,
  start: number,
  drift: number,
  n = 8,
): ResultMetric[] {
  return Array.from({ length: n }, (_, i) => ({
    runId,
    axis,
    name,
    unit,
    // gentle drift + a little deterministic wobble (no Math.random → stable SSR)
    value: round(start + drift * i + Math.sin(i * 1.3) * Math.abs(drift) * 0.4),
    ts: new Date(T0 + i * step).toISOString(),
  }));
}

const round = (v: number) => Math.round(v * 100) / 100;

const RUN_A = "00000000-0000-0000-0000-0000000000a1";
const RUN_B = "00000000-0000-0000-0000-0000000000b2";
const RUN_C = "00000000-0000-0000-0000-0000000000c3";

const runs: RunSummary[] = [
  {
    runId: RUN_A,
    label: "baseline · A100×8 · vLLM",
    status: "succeeded",
    createdAt: "2026-06-29T09:08:00Z",
  },
  {
    runId: RUN_B,
    label: "cxl-pool · A100×8 · vLLM",
    status: "succeeded",
    createdAt: "2026-06-29T11:22:00Z",
  },
  {
    runId: RUN_C,
    label: "h100-scaleout · H100×16",
    status: "succeeded",
    createdAt: "2026-06-30T02:40:00Z",
  },
];

// Three metric series per run, across the real/synthetic/sim evidence axes.
const metrics: ResultMetric[] = [
  // RUN A — modest baseline
  ...series(RUN_A, "sim", "ttft_ms", "ms", 240, -6),
  ...series(RUN_A, "real", "ttft_ms", "ms", 262, -5),
  ...series(RUN_A, "synthetic", "ttft_ms", "ms", 250, -5.5),
  ...series(RUN_A, "sim", "throughput_tok_s", "tok/s", 1850, 22),
  ...series(RUN_A, "real", "throughput_tok_s", "tok/s", 1790, 18),
  ...series(RUN_A, "sim", "gpu_util_pct", "%", 71, 1.2),
  // RUN B — CXL pool: better TTFT, similar throughput
  ...series(RUN_B, "sim", "ttft_ms", "ms", 198, -5),
  ...series(RUN_B, "real", "ttft_ms", "ms", 210, -4.5),
  ...series(RUN_B, "synthetic", "ttft_ms", "ms", 205, -4.7),
  ...series(RUN_B, "sim", "throughput_tok_s", "tok/s", 1920, 25),
  ...series(RUN_B, "real", "throughput_tok_s", "tok/s", 1880, 20),
  ...series(RUN_B, "sim", "gpu_util_pct", "%", 76, 1.0),
  // RUN C — H100 scale-out: best throughput, lowest TTFT
  ...series(RUN_C, "sim", "ttft_ms", "ms", 132, -3),
  ...series(RUN_C, "real", "ttft_ms", "ms", 141, -2.8),
  ...series(RUN_C, "synthetic", "ttft_ms", "ms", 137, -2.9),
  ...series(RUN_C, "sim", "throughput_tok_s", "tok/s", 4120, 60),
  ...series(RUN_C, "real", "throughput_tok_s", "tok/s", 4010, 52),
  ...series(RUN_C, "sim", "gpu_util_pct", "%", 83, 0.8),
];

export const exampleDataset: ResultsDataset = {
  source: "example",
  runs,
  metrics,
};

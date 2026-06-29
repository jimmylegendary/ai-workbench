"use client";

import { create } from "zustand";
import type { ResultMetric, RunSummary } from "./types";

/**
 * In-session results store. A simulation Run (useSimulationVM) pushes its
 * synthesized results here; SimResultScreen merges this over the server-read
 * dataset (preferring live) so the page reflects the run you just executed —
 * even in the no-auth preview where nothing is persisted to Supabase yet.
 */
interface ResultState {
  runs: RunSummary[];
  metrics: ResultMetric[];
  /** Record a finished run (newest first). Metrics are SynthMetric≡ResultMetric. */
  addRun: (runId: string, metrics: ResultMetric[], label?: string) => void;
  clear: () => void;
}

export const useResultStore = create<ResultState>((set) => ({
  runs: [],
  metrics: [],
  addRun: (runId, metrics, label) =>
    set((s) => {
      if (s.runs.some((r) => r.runId === runId)) return s;
      const summary: RunSummary = {
        runId,
        label: label ?? `run ${runId.slice(0, 8)}`,
        status: "succeeded",
        createdAt: new Date().toISOString(),
      };
      // newest first; cap to a sane number of in-session runs.
      return {
        runs: [summary, ...s.runs].slice(0, 12),
        metrics: [...metrics, ...s.metrics].slice(0, 2000),
      };
    }),
  clear: () => set({ runs: [], metrics: [] }),
}));

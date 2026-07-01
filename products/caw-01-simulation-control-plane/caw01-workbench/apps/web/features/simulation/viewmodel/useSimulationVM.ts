"use client";

import { useMutation } from "@tanstack/react-query";
import type { AxisStatus } from "@caw/core";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { stopRunAction, saveAction } from "../model/actions";
import { runSimulation } from "../model/runAction";
import { useLogStore } from "../model/logStore";
import { useResultStore } from "@/features/sim-result/model/resultStore";
import { useServingRunStore } from "@/features/serving/store";
import { useRunStatus } from "./useRunStatus";

const AXES = ["real", "synthetic", "sim"] as const;
/** Build a uniform per-axis status frame (the synthesized run advances in lockstep). */
const allAxes = (
  status: AxisStatus["status"],
  progress: number,
): AxisStatus[] => AXES.map((axis) => ({ axis, status, progress }));

/**
 * ViewModel for the Simulation screen. The single place interaction-state
 * (Zustand) and server-state (TanStack mutations + SSE) meet, exposed to the
 * View as a flat, typed API. The View never imports the store, repositories,
 * or actions directly — only this hook (app-architecture-mvvm.md).
 *
 * RESULTS LOOP (TASK RL): the Run intent drives {@link runSimulation}, which
 * synthesizes results server-side. The VM fans the result out non-blockingly:
 *   • per-axis status: queued → running (onMutate) → succeeded (onSuccess)
 *   • emitted log lines pushed into the shared {@link useLogStore} (→ SimLog)
 *   • runId recorded so the SSE stream + Stop reflect the live run
 */
export function useSimulationVM(experimentId: string) {
  const selection = useWorkbenchStore((s) => s.selection);
  const dirty = useWorkbenchStore((s) => s.dirty);
  const perAxis = useWorkbenchStore((s) => s.run.perAxis);
  const runId = useWorkbenchStore((s) => s.run.runId);
  const select = useWorkbenchStore((s) => s.select);
  const markDirty = useWorkbenchStore((s) => s.markDirty);
  const setRun = useWorkbenchStore((s) => s.setRun);
  const setAxisStatus = useWorkbenchStore((s) => s.setAxisStatus);

  const appendLog = useLogStore((s) => s.append);
  const setLogRunning = useLogStore((s) => s.setRunning);
  const clearLog = useLogStore((s) => s.clear);
  const addResult = useResultStore((s) => s.addRun);

  // live status (SSE)
  useRunStatus(runId);

  const run = useMutation({
    mutationFn: () => runSimulation(experimentId),
    onMutate: () => {
      // Fresh console buffer + optimistic "running" across all three axes.
      clearLog();
      setLogRunning(true);
      appendLog({ level: "info", msg: "run start — synthesizing results" });
      setAxisStatus(allAxes("running", 0.1));
    },
    onSuccess: (res) => {
      appendLog(res.logs);
      setAxisStatus(allAxes("succeeded", 1));
      setLogRunning(false);
      // Push the synthesized results to the in-session store so /sim-result
      // reflects this run (SynthMetric ≡ ResultMetric).
      addResult(res.runId, res.metrics);
      setRun(res.runId); // records runId so Stop can target this run
    },
    onError: (err) => {
      appendLog({
        level: "error",
        msg: `run failed — ${err instanceof Error ? err.message : String(err)}`,
      });
      setAxisStatus(allAxes("failed", 0));
      setLogRunning(false);
    },
  });
  const stop = useMutation({
    mutationFn: () => stopRunAction(runId ?? ""),
  });
  const save = useMutation({
    mutationFn: (kind: "item" | "full") => saveAction(kind),
    onSuccess: () => markDirty(false),
  });

  const status = run.isPending
    ? "starting"
    : perAxis.some((a) => a.status === "running")
      ? "running"
      : "ready";

  return {
    // state for the View
    selection,
    dirty,
    perAxis,
    status,
    // intents
    select,
    // Unified Run: drive the CONFIGURED serving pipeline when one is registered
    // (a workload turn is selected in the Serving tab); else the synth demo.
    onRun: () => {
      const { runner, canRun } = useServingRunStore.getState();
      if (runner && canRun) {
        void runner();
        return;
      }
      run.mutate();
    },
    onStop: () => stop.mutate(),
    onSaveItem: () => save.mutate("item"),
    onSaveAll: () => save.mutate("full"),
    isRunning: status === "running" || status === "starting",
  };
}

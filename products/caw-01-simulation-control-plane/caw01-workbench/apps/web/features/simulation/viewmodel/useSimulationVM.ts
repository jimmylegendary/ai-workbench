"use client";

import { useMutation } from "@tanstack/react-query";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { startRunAction, stopRunAction, saveAction } from "../model/actions";
import { useRunStatus } from "./useRunStatus";

/**
 * ViewModel for the Simulation screen. The single place interaction-state
 * (Zustand) and server-state (TanStack mutations + SSE) meet, exposed to the
 * View as a flat, typed API. The View never imports the store, repositories,
 * or actions directly — only this hook (app-architecture-mvvm.md).
 */
export function useSimulationVM(experimentId: string) {
  const selection = useWorkbenchStore((s) => s.selection);
  const dirty = useWorkbenchStore((s) => s.dirty);
  const perAxis = useWorkbenchStore((s) => s.run.perAxis);
  const runId = useWorkbenchStore((s) => s.run.runId);
  const select = useWorkbenchStore((s) => s.select);
  const markDirty = useWorkbenchStore((s) => s.markDirty);
  const setRun = useWorkbenchStore((s) => s.setRun);

  // live status (SSE)
  useRunStatus(runId);

  const run = useMutation({
    mutationFn: () => startRunAction({ experiment_id: experimentId }),
    onSuccess: (res) => {
      if ("queued" in res) setRun(runId); // TODO: setRun(res.runId) once wired
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
    onRun: () => run.mutate(),
    onStop: () => stop.mutate(),
    onSaveItem: () => save.mutate("item"),
    onSaveAll: () => save.mutate("full"),
    isRunning: status === "running" || status === "starting",
  };
}

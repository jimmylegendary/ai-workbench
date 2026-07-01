"use client";

import { create } from "zustand";

/**
 * Run registry — the one seam that unifies the two Run affordances. The Serving
 * options panel (which holds the granularity + serving config + the selected
 * workload turn) registers its `runPipeline` here; the ControlPanel's primary
 * Run (via useSimulationVM) invokes it when a run is available, so the prominent
 * Run drives the CONFIGURED pipeline instead of a disconnected synth. When no
 * pipeline run is registered (no workload turn selected) the VM falls back to
 * the synthesize-demo path.
 */
interface ServingRunStore {
  /** stable wrapper that runs the currently-configured serving pipeline. */
  runner: (() => void | Promise<void>) | null;
  /** whether a run is currently possible (a turn is selected, not already running). */
  canRun: boolean;
  register: (runner: ServingRunStore["runner"], canRun: boolean) => void;
}

export const useServingRunStore = create<ServingRunStore>((set) => ({
  runner: null,
  canRun: false,
  register: (runner, canRun) => set({ runner, canRun }),
}));

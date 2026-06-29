"use client";

import { create } from "zustand";
import type { SimLogEntry, SimLogLine } from "./fixtures/simlog";

/**
 * Live sim-log store = the interaction-state sink for run output.
 *
 * runSimulation() (via the ViewModel) appends real emitted lines here; SimLog
 * consumes them and renders them in place of its idle fixture stream. Lines are
 * stamped with a monotonic id + epoch-ms timestamp at append time (mirroring
 * the SSE contract — the engine sends level+msg, the client stamps the clock).
 *
 * This is interaction state, not server source-of-truth: it is a transient
 * console buffer, capped to keep the DOM light, cleared on a fresh run.
 */

/** Ring-buffer cap so a long-lived stream keeps the DOM light (matches SimLog). */
const MAX_LINES = 200;

interface LogState {
  /** Real emitted lines (empty = idle → SimLog shows its fixture stream). */
  lines: SimLogLine[];
  /** Whether a run is currently in flight (drives the header indicator). */
  running: boolean;
  /** Monotonic id source for appended lines. */
  nextId: number;
  /** Append one or many entries; stamps id + timestamp, caps to MAX_LINES. */
  append: (entries: SimLogEntry | SimLogEntry[]) => void;
  /** Mark the run in-flight / finished (header pulse). */
  setRunning: (running: boolean) => void;
  /** Reset the buffer (e.g. at the start of a fresh run). */
  clear: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  lines: [],
  running: false,
  nextId: 0,
  append: (entries) =>
    set((s) => {
      const batch = Array.isArray(entries) ? entries : [entries];
      const now = Date.now();
      let id = s.nextId;
      const stamped: SimLogLine[] = batch.map((e) => ({
        ...e,
        id: id++,
        t: now,
      }));
      const next = [...s.lines, ...stamped];
      return {
        lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next,
        nextId: id,
      };
    }),
  setRunning: (running) => set({ running }),
  clear: () => set({ lines: [], running: false }),
}));

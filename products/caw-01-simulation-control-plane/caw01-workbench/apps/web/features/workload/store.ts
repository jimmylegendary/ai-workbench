"use client";

import { create } from "zustand";
import type { AgentSession } from "@caw/core";
import { exampleSession } from "@/features/workload/model/fixtures/session.example";
import { loadSession } from "@/features/workload/model/loadSession";

/**
 * Shared Workload (C1) store — Agent 1 owns it; the turn list, the harness
 * graph, and the step inspector (Agents 2 + 3) all read from here.
 *
 * Selecting a turn always resets the selected step to null (a turn's steps are
 * a fresh set). `loadFromText` never throws: parse/shape failures land in
 * `error` so the UI can show a message and keep the previous session.
 */
export interface WorkloadState {
  session: AgentSession | null;
  selectedTurnId: string | null;
  selectedStepId: string | null;
  error: string | null;

  /** Parse trace text via the generic adapter; select the first turn on success. */
  loadFromText: (text: string, filename?: string) => void;
  /** Load the bundled example fixture. */
  loadExample: () => void;
  selectTurn: (id: string) => void;
  selectStep: (id: string | null) => void;
  reset: () => void;
}

export const useWorkloadStore = create<WorkloadState>((set) => ({
  session: null,
  selectedTurnId: null,
  selectedStepId: null,
  error: null,

  loadFromText: (text, filename) => {
    try {
      const session = loadSession(text, filename);
      set({
        session,
        selectedTurnId: session.turns[0]?.id ?? null,
        selectedStepId: null,
        error: null,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  loadExample: () => {
    set({
      session: exampleSession,
      selectedTurnId: exampleSession.turns[0]?.id ?? null,
      selectedStepId: null,
      error: null,
    });
  },

  selectTurn: (id) => set({ selectedTurnId: id, selectedStepId: null }),

  selectStep: (id) => set({ selectedStepId: id }),

  reset: () =>
    set({
      session: null,
      selectedTurnId: null,
      selectedStepId: null,
      error: null,
    }),
}));

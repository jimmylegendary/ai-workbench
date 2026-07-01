"use client";

import { create } from "zustand";
import type { AgentSession, AgentTurn } from "@caw/core";
import { loadSession } from "@/features/workload/model/loadSession";

/**
 * Shared Workload (C1) store. Holds ANY number of loaded trace SESSIONS (a load
 * = one session file; you can load several) plus the active session/turn/step.
 * The C1 canvas, the Serving-input builder, and the WorkloadPanel tree all read
 * from here.
 *
 * A "turn" = one user input → final answer (many llm/tool calls; an llm call may
 * fan out to several tool calls). Nothing is loaded at startup — the panel shows
 * an empty state until a file/example is loaded; Reset clears everything.
 */
export interface WorkloadState {
  sessions: AgentSession[];
  activeSessionId: string | null;
  activeTurnId: string | null;
  selectedStepId: string | null;
  error: string | null;

  /** Parse trace text (adapter registry) and ADD it as a session (dedup by id →
   *  replace); make it active with its first turn. Never throws (→ `error`). */
  loadFromText: (text: string, filename?: string) => void;
  /** Add an already-parsed session (example picker); dedup by id. */
  addSession: (session: AgentSession) => void;
  /** Select a turn within a session (also clears the selected step). */
  selectTurn: (sessionId: string, turnId: string) => void;
  selectStep: (id: string | null) => void;
  /** Remove one loaded session (re-points active if it was the removed one). */
  removeSession: (id: string) => void;
  /** Clear all loaded sessions + selections (Reset). */
  reset: () => void;
}

/** Resolve the active turn from state (null if none). */
export function activeTurnOf(s: WorkloadState): AgentTurn | null {
  const sess = s.sessions.find((x) => x.id === s.activeSessionId);
  return sess?.turns.find((t) => t.id === s.activeTurnId) ?? null;
}

export const useWorkloadStore = create<WorkloadState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeTurnId: null,
  selectedStepId: null,
  error: null,

  loadFromText: (text, filename) => {
    try {
      const session = loadSession(text, filename);
      get().addSession(session);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  addSession: (session) =>
    set((s) => ({
      sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
      activeSessionId: session.id,
      activeTurnId: session.turns[0]?.id ?? null,
      selectedStepId: null,
      error: null,
    })),

  selectTurn: (sessionId, turnId) =>
    set({ activeSessionId: sessionId, activeTurnId: turnId, selectedStepId: null }),

  selectStep: (id) => set({ selectedStepId: id }),

  removeSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      if (s.activeSessionId !== id) return { sessions };
      const next = sessions[0] ?? null;
      return {
        sessions,
        activeSessionId: next?.id ?? null,
        activeTurnId: next?.turns[0]?.id ?? null,
        selectedStepId: null,
      };
    }),

  reset: () =>
    set({
      sessions: [],
      activeSessionId: null,
      activeTurnId: null,
      selectedStepId: null,
      error: null,
    }),
}));

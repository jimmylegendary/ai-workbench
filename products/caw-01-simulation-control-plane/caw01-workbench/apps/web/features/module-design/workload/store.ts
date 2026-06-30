"use client";

import { create } from "zustand";
import type { HarnessKind } from "@/features/simulation/model/fixtures/c1";

/**
 * WORKLOAD module design editing state. The working module is an agent-turn
 * HARNESS graph: free-floating nodes (io/router/llm/tool/memory — matching
 * c1.ts HarnessKind) wired by directed edges. Unlike the HW editor's immutable
 * tree, this is a flat editable graph so the live React Flow canvas can mutate
 * positions and connections in place.
 */

export type WorkloadNode = {
  id: string;
  kind: HarnessKind;
  label: string;
  x: number;
  y: number;
};

export type WorkloadEdge = {
  id: string;
  from: string;
  to: string;
};

interface WorkloadDesignState {
  nodes: WorkloadNode[];
  edges: WorkloadEdge[];
  selectedId: string | null;
  seq: number;

  /** Append a node of `kind`; positions it on a gentle cascade. Returns nothing
   *  but selects the new node so the inspector opens on it. */
  addNode: (kind: HarnessKind) => void;
  /** Remove a node and any edges touching it. */
  removeNode: (id: string) => void;
  /** Move a node (React Flow drag commits final position here). */
  moveNode: (id: string, x: number, y: number) => void;
  /** Wire from → to (dedup; no self-loops). */
  connect: (from: string, to: string) => void;
  /** Remove a single edge by id. */
  removeEdge: (id: string) => void;
  /** Rename / patch a node's label. */
  updateNode: (id: string, patch: Partial<Pick<WorkloadNode, "label">>) => void;
  /** Inspector selection. */
  select: (id: string | null) => void;
  /** Replace the working graph wholesale (load a saved module back in). The
   *  sequence counter is advanced past any existing numeric id so freshly-added
   *  nodes/edges never collide with the loaded ones. */
  loadGraph: (nodes: WorkloadNode[], edges: WorkloadEdge[]) => void;
  /** Clear the whole composer. */
  reset: () => void;
}

/** Highest trailing integer across a set of `kind-N` / `e-N` ids (0 if none). */
function maxSeq(ids: string[]): number {
  return ids.reduce((max, id) => {
    const m = /(\d+)$/.exec(id);
    const n = m ? Number(m[1]) : 0;
    return n > max ? n : max;
  }, 0);
}

/** Default label per kind for freshly-added palette nodes. */
const KIND_LABEL: Record<HarnessKind, string> = {
  io: "io",
  router: "router",
  llm: "LLM call",
  tool: "tool call",
  memory: "memory",
};

export const useWorkloadDesignStore = create<WorkloadDesignState>((set) => ({
  nodes: [],
  edges: [],
  selectedId: null,
  seq: 0,

  addNode: (kind) =>
    set((s) => {
      const seq = s.seq + 1;
      const id = `${kind}-${seq}`;
      // cascade so successive adds don't stack exactly on top of each other.
      const step = (s.nodes.length % 6) * 28;
      const node: WorkloadNode = {
        id,
        kind,
        label: KIND_LABEL[kind],
        x: 80 + step,
        y: 80 + step,
      };
      return { nodes: [...s.nodes, node], seq, selectedId: id };
    }),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.from !== id && e.to !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  moveNode: (id, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    })),

  connect: (from, to) =>
    set((s) => {
      if (from === to) return s;
      if (s.edges.some((e) => e.from === from && e.to === to)) return s;
      const seq = s.seq + 1;
      const edge: WorkloadEdge = { id: `e-${seq}`, from, to };
      return { edges: [...s.edges, edge], seq };
    }),

  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),

  select: (id) => set({ selectedId: id }),

  loadGraph: (nodes, edges) =>
    set({
      nodes,
      edges,
      selectedId: null,
      seq: maxSeq([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]),
    }),

  reset: () => set({ nodes: [], edges: [], selectedId: null, seq: 0 }),
}));

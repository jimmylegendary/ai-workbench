"use client";

import { create } from "zustand";
import type {
  ServingEdgeData,
  ServingFlowEdge,
  ServingFlowNode,
  ServingKind,
} from "@/features/simulation/model/fixtures/c2";

/**
 * SERVING Module Design editing state. The working module is an editable graph
 * of serving-stage nodes + typed edges (same shape as the workload composer:
 * nodes/edges + add/remove/connect/reset). Every edit produces NEW arrays so the
 * live React Flow canvas in ServingDesign re-renders immediately.
 *
 * Grammar (mirrors features/simulation/model/fixtures/c2.ts):
 *   serving → representation → simulator
 * Edges carry { valid, reason } so the canvas can draw grammar violations inline.
 */

// ---- grammar ---------------------------------------------------------------

/** Pipeline ordering of stage kinds; an edge is valid only when it advances one
 *  stage forward (serving→representation, representation→simulator). */
const STAGE_RANK: Record<ServingKind, number> = {
  serving: 0,
  representation: 1,
  simulator: 2,
};

/** Classify a candidate edge against the pipeline grammar. */
export function classifyEdge(
  from: ServingKind,
  to: ServingKind,
): ServingEdgeData {
  if (STAGE_RANK[to] === STAGE_RANK[from] + 1) return { valid: true };
  return { valid: false, reason: `${from} → ${to} illegal` };
}

// ---- store -----------------------------------------------------------------

export type ServingDesignState = {
  nodes: ServingFlowNode[];
  edges: ServingFlowEdge[];
  selectedId: string | null;

  /** Append a new stage node of `kind` (auto-positioned by stage column). */
  add: (kind: ServingKind, label: string) => void;
  /** Remove a node and any edges touching it. */
  removeNode: (id: string) => void;
  /** Connect source → target, classifying validity against the grammar. */
  connect: (source: string, target: string) => void;
  /** Remove a single edge by id. */
  removeEdge: (id: string) => void;
  /** Open a node in the inspector (or clear with null). */
  select: (id: string | null) => void;
  /** Clear the whole working graph. */
  reset: () => void;
};

let seq = 0;
const nextId = (kind: ServingKind) => `${kind}-${++seq}`;

export const useServingDesignStore = create<ServingDesignState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,

  add: (kind, label) => {
    const id = nextId(kind);
    // Lay nodes out in stage columns; stack vertically within a column.
    const col = STAGE_RANK[kind];
    const inCol = get().nodes.filter((n) => n.data.kind === kind).length;
    const node: ServingFlowNode = {
      id,
      type: "serving",
      position: { x: col * 300, y: inCol * 130 },
      data: { label, kind },
    };
    set((s) => ({ nodes: [...s.nodes, node], selectedId: id }));
  },

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  connect: (source, target) => {
    if (source === target) return;
    const { nodes, edges } = get();
    const from = nodes.find((n) => n.id === source);
    const to = nodes.find((n) => n.id === target);
    if (!from || !to) return;
    const id = `e-${source}-${target}`;
    if (edges.some((e) => e.id === id)) return; // dedup
    const edge: ServingFlowEdge = {
      id,
      source,
      target,
      sourceHandle: "out",
      targetHandle: "in",
      data: classifyEdge(from.data.kind, to.data.kind),
    };
    set((s) => ({ edges: [...s.edges, edge] }));
  },

  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

  select: (id) => set({ selectedId: id }),

  reset: () => set({ nodes: [], edges: [], selectedId: null }),
}));

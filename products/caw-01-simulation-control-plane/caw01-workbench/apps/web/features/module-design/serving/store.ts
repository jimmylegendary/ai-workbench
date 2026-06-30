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

  /** Append a new stage node of `kind`. When `pos` is given (a drag-and-drop
   *  drop point in flow coords) the node lands THERE; otherwise it auto-lays
   *  out by stage column. */
  add: (kind: ServingKind, label: string, pos?: { x: number; y: number }) => void;
  /** Remove a node and any edges touching it. */
  removeNode: (id: string) => void;
  /** Move a node (React Flow drag commits final position here). */
  moveNode: (id: string, x: number, y: number) => void;
  /** Connect source → target, classifying validity against the grammar. */
  connect: (source: string, target: string) => void;
  /** Remove a single edge by id. */
  removeEdge: (id: string) => void;
  /** Open a node in the inspector (or clear with null). */
  select: (id: string | null) => void;
  /** Replace the working graph wholesale (load a saved module back in). The
   *  sequence counter advances past any loaded `kind-N` id so freshly-added
   *  nodes never collide with the loaded ones. */
  loadGraph: (nodes: ServingFlowNode[], edges: ServingFlowEdge[]) => void;
  /** Clear the whole working graph. */
  reset: () => void;
};

let seq = 0;
const nextId = (kind: ServingKind) => `${kind}-${++seq}`;

/** Highest trailing integer across a set of `kind-N` ids (0 if none). */
function maxSeq(ids: string[]): number {
  return ids.reduce((max, id) => {
    const m = /(\d+)$/.exec(id);
    const n = m ? Number(m[1]) : 0;
    return n > max ? n : max;
  }, 0);
}

export const useServingDesignStore = create<ServingDesignState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,

  add: (kind, label, pos) => {
    const id = nextId(kind);
    // Lay nodes out in stage columns; stack vertically within a column unless a
    // drop point was supplied (drag-and-drop overrides the column layout).
    const col = STAGE_RANK[kind];
    const inCol = get().nodes.filter((n) => n.data.kind === kind).length;
    const node: ServingFlowNode = {
      id,
      type: "serving",
      position: pos ?? { x: col * 300, y: inCol * 130 },
      data: { label, kind },
    };
    set((s) => ({ nodes: [...s.nodes, node], selectedId: id }));
  },

  moveNode: (id, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, position: { x, y } } : n,
      ),
    })),

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

  loadGraph: (nodes, edges) => {
    seq = maxSeq(nodes.map((n) => n.id));
    set({ nodes, edges, selectedId: null });
  },

  reset: () => set({ nodes: [], edges: [], selectedId: null }),
}));

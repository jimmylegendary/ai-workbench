import type { Node, Edge } from "@xyflow/react";

/**
 * Canvas 1 sample op graph (one agent-turn → L0 op/tensor/movement view).
 * Local fixtures only — no shared fixtures file (design/05 canvas-1-ai-workload-flow.md).
 *
 * Each `op` node maps to an L0 `op`; `data` carries the readout fields the
 * OpNode renders (label = op_class, dtype + shape = tensor summary).
 * Edges are tensor flow (L0 DataMovementEdge), wired strictly left → right.
 */
export type OpNodeData = {
  /** op_class, e.g. 'embed' | 'matmul' | 'softmax' | 'add' | 'proj' */
  label: string;
  /** tensor element type, e.g. 'bf16' */
  dtype: string;
  /** logical tensor shape, e.g. '[B,S,H]' */
  shape: string;
};

/** The single node variant on Canvas 1. */
export type OpFlowNode = Node<OpNodeData, "op">;

const COL = 200; // px between op columns (left → right tensor flow)
const ROW_Y = 80;

export const c1Nodes: OpFlowNode[] = [
  {
    id: "op-embed",
    type: "op",
    position: { x: 0, y: ROW_Y },
    data: { label: "embed", dtype: "bf16", shape: "[B,S,H]" },
  },
  {
    id: "op-matmul",
    type: "op",
    position: { x: COL, y: ROW_Y },
    data: { label: "matmul", dtype: "bf16", shape: "[B,S,H]" },
  },
  {
    id: "op-softmax",
    type: "op",
    position: { x: COL * 2, y: ROW_Y },
    data: { label: "softmax", dtype: "bf16", shape: "[B,S,S]" },
  },
  {
    id: "op-add",
    type: "op",
    position: { x: COL * 3, y: ROW_Y },
    data: { label: "add", dtype: "bf16", shape: "[B,S,H]" },
  },
  {
    id: "op-proj",
    type: "op",
    position: { x: COL * 4, y: ROW_Y },
    data: { label: "proj", dtype: "bf16", shape: "[B,S,V]" },
  },
];

export const c1Edges: Edge[] = [
  {
    id: "e-embed-matmul",
    source: "op-embed",
    target: "op-matmul",
    sourceHandle: "out",
    targetHandle: "in",
  },
  {
    id: "e-matmul-softmax",
    source: "op-matmul",
    target: "op-softmax",
    sourceHandle: "out",
    targetHandle: "in",
  },
  {
    id: "e-softmax-add",
    source: "op-softmax",
    target: "op-add",
    sourceHandle: "out",
    targetHandle: "in",
  },
  {
    id: "e-add-proj",
    source: "op-add",
    target: "op-proj",
    sourceHandle: "out",
    targetHandle: "in",
  },
];

import type { Edge, Node } from "@xyflow/react";

/**
 * Canvas 2 — Serving / representation sample graph.
 * Pipeline grammar (design/05-.../canvas-2-serving-representation.md):
 *   serving (vLLM | LLMServingSim) → representation (torch | syntorch) → simulator (ASTRA-sim)
 * Edges carry { valid } so the canvas can render grammar violations inline.
 * Local fixtures only — never import a shared fixtures file (per task rules).
 */

/** Stage kind. Drives the kind Badge tone on ServingNode. */
export type ServingKind = "serving" | "representation" | "simulator";

/** Data payload for every node (React Flow node type === "serving"). */
export type ServingNodeData = {
  label: string;
  kind: ServingKind;
};

/** Typed node: React Flow `type` is always "serving"; `kind` lives in data. */
export type ServingFlowNode = Node<ServingNodeData, "serving">;

/** Edge payload: grammar validity + optional human reason for invalid wiring. */
export type ServingEdgeData = {
  valid: boolean;
  reason?: string;
};

export type ServingFlowEdge = Edge<ServingEdgeData>;

export const c2Nodes: ServingFlowNode[] = [
  {
    id: "vllm",
    type: "serving",
    position: { x: 0, y: 0 },
    data: { label: "vLLM", kind: "serving" },
  },
  {
    id: "serving-sim",
    type: "serving",
    position: { x: 0, y: 150 },
    data: { label: "LLMServingSim", kind: "serving" },
  },
  {
    id: "torch",
    type: "serving",
    position: { x: 280, y: 0 },
    data: { label: "torch", kind: "representation" },
  },
  {
    id: "syntorch",
    type: "serving",
    position: { x: 280, y: 150 },
    data: { label: "syntorch", kind: "representation" },
  },
  {
    id: "astra-sim",
    type: "serving",
    position: { x: 560, y: 75 },
    data: { label: "ASTRA-sim", kind: "simulator" },
  },
];

export const c2Edges: ServingFlowEdge[] = [
  {
    id: "e-vllm-torch",
    source: "vllm",
    target: "torch",
    sourceHandle: "out",
    targetHandle: "in",
    data: { valid: true },
  },
  {
    id: "e-servingsim-syntorch",
    source: "serving-sim",
    target: "syntorch",
    sourceHandle: "out",
    targetHandle: "in",
    data: { valid: true },
  },
  {
    id: "e-torch-astra",
    source: "torch",
    target: "astra-sim",
    sourceHandle: "out",
    targetHandle: "in",
    data: { valid: true },
  },
  {
    id: "e-syntorch-astra",
    source: "syntorch",
    target: "astra-sim",
    sourceHandle: "out",
    targetHandle: "in",
    data: { valid: true },
  },
  // INVALID: representation → serving violates the pipeline grammar.
  {
    id: "e-torch-servingsim",
    source: "torch",
    target: "serving-sim",
    sourceHandle: "out",
    targetHandle: "in",
    data: { valid: false, reason: "repr → serving illegal" },
  },
];

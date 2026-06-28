import type { Edge, Node } from "@xyflow/react";
import type { FractalGraph } from "@/features/simulation/model/fractal";

/**
 * Canvas 2 — Serving / representation, as a FRACTAL graph.
 * Pipeline grammar (design/05-.../canvas-2-serving-representation.md):
 *   serving (vLLM | LLMServingSim) → representation (torch | syntorch) → simulator (ASTRA-sim)
 * Edges carry { valid } so the canvas renders grammar violations inline.
 * Nodes with data.drillTo descend (Ctrl+click) into a sub-level (fractal).
 */

export type ServingKind = "serving" | "representation" | "simulator";

export type ServingNodeData = {
  label: string;
  kind: ServingKind;
  /** If set, Ctrl+click descends into this sub-level id. */
  drillTo?: string;
};

export type ServingFlowNode = Node<ServingNodeData, "serving">;

export type ServingEdgeData = { valid: boolean; reason?: string };
export type ServingFlowEdge = Edge<ServingEdgeData>;

const e = (
  id: string,
  source: string,
  target: string,
  data: ServingEdgeData = { valid: true },
): ServingFlowEdge => ({
  id,
  source,
  target,
  sourceHandle: "out",
  targetHandle: "in",
  data,
});

export const c2Graph: FractalGraph<ServingFlowNode, ServingFlowEdge> = {
  root: {
    id: "root",
    label: "serving",
    nodes: [
      { id: "vllm", type: "serving", position: { x: 0, y: 0 }, data: { label: "vLLM", kind: "serving" } },
      { id: "serving-sim", type: "serving", position: { x: 0, y: 150 }, data: { label: "LLMServingSim", kind: "serving" } },
      { id: "torch", type: "serving", position: { x: 280, y: 0 }, data: { label: "torch", kind: "representation" } },
      { id: "syntorch", type: "serving", position: { x: 280, y: 150 }, data: { label: "syntorch", kind: "representation", drillTo: "syntorch" } },
      { id: "astra-sim", type: "serving", position: { x: 560, y: 75 }, data: { label: "ASTRA-sim", kind: "simulator", drillTo: "astra" } },
    ],
    edges: [
      e("e-vllm-torch", "vllm", "torch"),
      e("e-servingsim-syntorch", "serving-sim", "syntorch"),
      e("e-torch-astra", "torch", "astra-sim"),
      e("e-syntorch-astra", "syntorch", "astra-sim"),
      // INVALID: representation → serving violates the pipeline grammar.
      e("e-torch-servingsim", "torch", "serving-sim", { valid: false, reason: "repr → serving illegal" }),
    ],
  },

  // ASTRA-sim internals (descend from astra-sim).
  astra: {
    id: "astra",
    label: "ASTRA-sim",
    nodes: [
      { id: "workload", type: "serving", position: { x: 0, y: 60 }, data: { label: "workload layer", kind: "simulator" } },
      { id: "system", type: "serving", position: { x: 260, y: 0 }, data: { label: "system layer", kind: "simulator" } },
      { id: "network", type: "serving", position: { x: 260, y: 130 }, data: { label: "network sim (ns3/analytical)", kind: "simulator" } },
      { id: "compute", type: "serving", position: { x: 520, y: 60 }, data: { label: "compute model", kind: "simulator" } },
    ],
    edges: [
      e("a-w-s", "workload", "system"),
      e("a-s-n", "system", "network"),
      e("a-s-c", "system", "compute"),
    ],
  },

  // syntorch internals (descend from syntorch).
  syntorch: {
    id: "syntorch",
    label: "syntorch",
    nodes: [
      { id: "capture", type: "serving", position: { x: 0, y: 60 }, data: { label: "capture", kind: "representation" } },
      { id: "lower", type: "serving", position: { x: 260, y: 60 }, data: { label: "Chakra lowering", kind: "representation" } },
      { id: "et", type: "serving", position: { x: 520, y: 60 }, data: { label: "Chakra ET", kind: "representation" } },
    ],
    edges: [e("s-c-l", "capture", "lower"), e("s-l-e", "lower", "et")],
  },
};

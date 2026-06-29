import type { Edge, Node } from "@xyflow/react";
import type { FractalGraph } from "@/features/simulation/model/fractal";

/**
 * Canvas 1 — top-level HARNESS / agent-turn graph, as a FRACTAL graph.
 * ROOT = one agent turn: routing, LLM calls, tool calls and memory wired
 * left→right into a graph (this is harness engineering, not torch ops).
 * Nodes with data.drillTo descend (Ctrl+click) into an interior sub-level:
 *   "llm"  = the interior of an LLM call (prompt → decode → stream → parse)
 *   "tool" = the interior of a tool call (args → execute → result parse)
 */

export type HarnessKind = "io" | "router" | "llm" | "tool" | "memory";

/** Where a harness step executes — maps to a Canvas-3 root (server=data center). */
export type ExecLocation = "server" | "client";

export type HarnessNodeData = {
  label: string;
  kind: HarnessKind;
  /** If set, Ctrl+click descends into this sub-level id (fractal). */
  drillTo?: string;
  /**
   * Execution location (overridable per node). Default policy: `llm` → server
   * (invoked through the C2 serving framework, running in the data center);
   * everything else → client. See canvas-1-ai-workload-flow.md.
   */
  location?: ExecLocation;
};

/** Default exec location by kind (when not explicitly set on a node). */
export const defaultLocation = (kind: HarnessKind): ExecLocation =>
  kind === "llm" ? "server" : "client";

export type HarnessFlowNode = Node<HarnessNodeData, "harness">;

const e = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  sourceHandle: "out",
  targetHandle: "in",
});

const n = (
  id: string,
  x: number,
  y: number,
  data: HarnessNodeData,
): HarnessFlowNode => ({ id, type: "harness", position: { x, y }, data });

export const c1Graph: FractalGraph<HarnessFlowNode, Edge> = {
  root: {
    id: "root",
    label: "agent turn",
    nodes: [
      n("user-input", 0, 140, { label: "user input", kind: "io" }),
      n("router", 200, 140, { label: "planner / router", kind: "router" }),
      n("llm-plan", 400, 140, { label: "LLM call", kind: "llm", drillTo: "llm" }),
      n("tool-search", 620, 0, { label: "search", kind: "tool", drillTo: "tool" }),
      n("tool-retrieval", 620, 140, { label: "retrieval", kind: "tool" }),
      n("tool-code", 620, 280, { label: "code-exec", kind: "tool" }),
      n("memory-write", 840, 140, { label: "memory write", kind: "memory" }),
      n("llm-final", 1040, 140, { label: "LLM call", kind: "llm", drillTo: "llm" }),
      n("final-output", 1240, 140, { label: "final output", kind: "io" }),
    ],
    edges: [
      e("e-input-router", "user-input", "router"),
      e("e-router-llm", "router", "llm-plan"),
      // LLM fans out to a couple of tool branches.
      e("e-llm-search", "llm-plan", "tool-search"),
      e("e-llm-retrieval", "llm-plan", "tool-retrieval"),
      e("e-llm-code", "llm-plan", "tool-code"),
      e("e-search-mem", "tool-search", "memory-write"),
      e("e-retrieval-mem", "tool-retrieval", "memory-write"),
      e("e-code-mem", "tool-code", "memory-write"),
      e("e-mem-llm", "memory-write", "llm-final"),
      e("e-llm-output", "llm-final", "final-output"),
    ],
  },

  // Interior of an LLM call (descend from an llm node).
  llm: {
    id: "llm",
    label: "LLM call",
    nodes: [
      n("prompt-assembly", 0, 60, { label: "prompt assembly", kind: "io" }),
      n("model-decode", 240, 60, { label: "model decode", kind: "llm" }),
      n("token-stream", 480, 60, { label: "token stream", kind: "llm" }),
      n("parse", 720, 60, { label: "parse", kind: "io" }),
    ],
    edges: [
      e("l-pa-md", "prompt-assembly", "model-decode"),
      e("l-md-ts", "model-decode", "token-stream"),
      e("l-ts-pr", "token-stream", "parse"),
    ],
  },

  // Interior of a tool call (descend from a tool node).
  tool: {
    id: "tool",
    label: "tool call",
    nodes: [
      n("args-build", 0, 60, { label: "args build", kind: "io" }),
      n("execute", 240, 60, { label: "execute", kind: "tool" }),
      n("result-parse", 480, 60, { label: "result parse", kind: "io" }),
    ],
    edges: [
      e("t-ab-ex", "args-build", "execute"),
      e("t-ex-rp", "execute", "result-parse"),
    ],
  },
};

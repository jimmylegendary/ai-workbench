"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import type { AgentStep, AgentTurn, StepKind } from "@caw/core";
import { cn } from "@/lib/utils";

/**
 * Step-kind → CATEGORICAL hue class (mirrors C1's OpNode palette; OFF the status
 * hues). `server` has its own hue (cat-server) + kind label — distinct from llm.
 */
const kindBar: Record<StepKind, string> = {
  io: "bg-cat-io",
  router: "bg-cat-router",
  llm: "bg-cat-llm",
  tool: "bg-cat-tool",
  memory: "bg-cat-memory",
  server: "bg-cat-server",
};
const kindText: Record<StepKind, string> = {
  io: "text-cat-io",
  router: "text-cat-router",
  llm: "text-cat-llm",
  tool: "text-cat-tool",
  memory: "text-cat-memory",
  server: "text-cat-server",
};

type StepFlowNode = Node<{ step: AgentStep }, "step">;

/** One step tile — matches C1 OpNode: white tile, kind bar, exec badge, readout. */
function StepNode({ data, selected }: NodeProps<StepFlowNode>) {
  const { step } = data;
  const loc = step.execLocation;
  const isErr = step.status === "error";
  const tokens =
    step.tokensIn != null || step.tokensOut != null
      ? `${step.tokensIn ?? 0}↓ ${step.tokensOut ?? 0}↑`
      : null;

  return (
    <div
      className={cn(
        "relative min-w-[168px] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface py-2 pl-3.5 pr-3 shadow-sm",
        isErr && "border-danger/60 bg-danger/5",
        selected && "ring-2 ring-accent",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", kindBar[step.kind])} />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!h-2 !w-2 !border-border !bg-text-muted"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="font-readout text-xs text-text">{step.name}</span>
        {isErr && (
          <span className="font-readout text-[9px] uppercase text-danger">error</span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-readout text-[10px] uppercase tracking-wide",
            kindText[step.kind],
          )}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          {step.kind}
        </span>
        {loc && (
          <span
            title={`runs on ${loc}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-border px-1 font-readout text-[9px] uppercase text-text-muted"
          >
            <span aria-hidden>{loc === "server" ? "▤" : "▢"}</span>
            {loc}
          </span>
        )}
      </div>

      {(step.durationMs != null || tokens) && (
        <div className="mt-1 flex items-center justify-between gap-2 font-readout text-[9px] text-text-muted">
          <span>{step.durationMs != null ? `${step.durationMs} ms` : ""}</span>
          {tokens && <span>{tokens}</span>}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!h-2 !w-2 !border-border !bg-primary"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = { step: StepNode };

const NODE_W = 200;
const NODE_H = 92;
const X_GAP = 72;
const Y_GAP = 24;

/** Directed edges from parentId AND next[], de-duplicated (only within the turn). */
function buildEdges(steps: AgentStep[]): Array<{ source: string; target: string }> {
  const ids = new Set(steps.map((s) => s.id));
  const seen = new Set<string>();
  const out: Array<{ source: string; target: string }> = [];
  const push = (source: string, target: string) => {
    if (!ids.has(source) || !ids.has(target) || source === target) return;
    const key = `${source}->${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ source, target });
  };
  for (const s of steps) {
    if (s.parentId) push(s.parentId, s.id);
    for (const n of s.next ?? []) push(s.id, n);
  }
  // Fallback: a trace with no explicit parent/next links (flat event streams,
  // spans whose parent key we couldn't map) would render as disconnected nodes.
  // Chain steps in sequence order so the harness graph is always connected.
  if (out.length === 0 && steps.length > 1) {
    for (let i = 0; i < steps.length - 1; i++) push(steps[i].id, steps[i + 1].id);
  }
  return out;
}

/** Longest-path layering (depth = longest chain from a root) via Kahn topo sort. */
function layer(
  steps: AgentStep[],
  edges: Array<{ source: string; target: string }>,
): Map<string, number> {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const s of steps) {
    indeg.set(s.id, 0);
    adj.set(s.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const depth = new Map<string, number>();
  const queue = steps.filter((s) => (indeg.get(s.id) ?? 0) === 0).map((s) => s.id);
  for (const id of queue) depth.set(id, 0);
  const q = [...queue];
  while (q.length) {
    const u = q.shift()!;
    const du = depth.get(u) ?? 0;
    for (const v of adj.get(u) ?? []) {
      depth.set(v, Math.max(depth.get(v) ?? 0, du + 1));
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if ((indeg.get(v) ?? 0) === 0) q.push(v);
    }
  }
  // Any node left without a depth (cycle) falls back to sequence order.
  steps.forEach((s, i) => {
    if (!depth.has(s.id)) depth.set(s.id, i);
  });
  return depth;
}

/**
 * A1's turn as a React Flow DAG — one node per step (kind-colored, exec badge,
 * duration/token readout, error tint), edges from parentId AND next[], directed
 * with arrowheads, auto-laid-out left→right by longest-path depth. Click selects.
 */
export function TurnGraph({
  turn,
  selectedStepId,
  onSelectStep,
}: {
  turn: AgentTurn;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}) {
  const steps = turn.steps;

  const { nodes, edges } = useMemo(() => {
    if (steps.length === 0) return { nodes: [] as StepFlowNode[], edges: [] as Edge[] };
    const rawEdges = buildEdges(steps);
    const depth = layer(steps, rawEdges);

    // group by depth to assign a row within each column
    const byDepth = new Map<number, string[]>();
    for (const s of steps) {
      const d = depth.get(s.id) ?? 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(s.id);
    }
    const rowOf = new Map<string, number>();
    for (const [, list] of byDepth) list.forEach((id, i) => rowOf.set(id, i));

    const nodes: StepFlowNode[] = steps.map((step) => {
      const d = depth.get(step.id) ?? 0;
      const r = rowOf.get(step.id) ?? 0;
      return {
        id: step.id,
        type: "step",
        position: { x: d * (NODE_W + X_GAP), y: r * (NODE_H + Y_GAP) },
        data: { step },
        selected: step.id === selectedStepId,
      };
    });

    const edges: Edge[] = rawEdges.map((e) => ({
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      style: { stroke: "var(--primary)", strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: "var(--primary)",
      },
    }));

    return { nodes, edges };
  }, [steps, selectedStepId]);

  const onNodeClick = useCallback<NodeMouseHandler<StepFlowNode>>(
    (_, node) => onSelectStep(node.id),
    [onSelectStep],
  );

  if (steps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas-bg p-4 text-sm text-canvas-muted">
        No steps in this turn.
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-full w-full bg-canvas-bg">
        <ReactFlow<StepFlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodesChange={() => {}}
          onEdgesChange={() => {}}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-canvas-bg"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="var(--canvas-grid)"
          />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { c1Graph, type HarnessFlowNode } from "@/features/simulation/model/fixtures/c1";
import { resolveLevel } from "@/features/simulation/model/fractal";
import { OpNode } from "./nodes/OpNode";
import { CanvasFrame } from "../CanvasFrame";
import { DrillHint } from "../DrillHint";

const nodeTypes: NodeTypes = { harness: OpNode };

/** Style a harness edge as a directed primary wire with an arrowhead. */
function styleEdge(edge: Edge): Edge {
  const stroke = "var(--primary)";
  return {
    ...edge,
    style: { stroke, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
  };
}

/**
 * Canvas 1 — AI workload flow (fractal React Flow). Renders the top-level
 * agent-turn harness graph: routing, LLM calls, tool calls and memory wired
 * left→right. Plain click selects a node (cross-canvas); Ctrl/⌘+click on a
 * node with data.drillTo descends into its interior level (fractal), shown via
 * the CanvasFrame breadcrumb. Read-only instrument layout (mirrors C2).
 */
export function FlowCanvasC1() {
  const selection = useWorkbenchStore((s) => s.selection);
  const select = useWorkbenchStore((s) => s.select);
  const drill = useWorkbenchStore((s) => s.drill.c1);
  const drillInto = useWorkbenchStore((s) => s.drillInto);
  const drillTo = useWorkbenchStore((s) => s.drillTo);
  const drillUp = useWorkbenchStore((s) => s.drillUp);

  const { level, crumbs } = useMemo(() => resolveLevel(c1Graph, drill), [drill]);

  const nodes = useMemo<HarnessFlowNode[]>(
    () =>
      level.nodes.map((node) => ({
        ...node,
        selected: selection.canvas === "c1" && selection.nodeId === node.id,
      })),
    [level, selection.canvas, selection.nodeId],
  );
  const edges = useMemo<Edge[]>(() => level.edges.map(styleEdge), [level]);

  const onNodeClick = useCallback<NodeMouseHandler<HarnessFlowNode>>(
    (event, node) => {
      const sub = node.data?.drillTo;
      if ((event.ctrlKey || event.metaKey) && sub) drillInto("c1", sub);
      else select({ canvas: "c1", nodeId: node.id });
    },
    [select, drillInto],
  );

  const frameCrumbs = crumbs.map((c, i) => ({
    label: c.label,
    onClick: () => drillTo("c1", i - 1),
  }));

  return (
    <CanvasFrame
      title="C1 · AI workload flow"
      crumbs={frameCrumbs}
      focused={selection.canvas === "c1"}
      canBack={drill.length > 0}
      onBack={() => drillUp("c1")}
      onActivate={() => select({ canvas: "c1" })}
    >
      <ReactFlowProvider>
        <div className="h-full w-full bg-canvas-bg">
          <ReactFlow<HarnessFlowNode, Edge>
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
          <DrillHint />
        </div>
      </ReactFlowProvider>
    </CanvasFrame>
  );
}

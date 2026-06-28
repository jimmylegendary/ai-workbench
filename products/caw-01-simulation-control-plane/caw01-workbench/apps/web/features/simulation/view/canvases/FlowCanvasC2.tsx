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
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import { useWorkbenchStore } from "@/store/workbenchStore";
import {
  c2Graph,
  type ServingFlowEdge,
  type ServingFlowNode,
} from "@/features/simulation/model/fixtures/c2";
import { resolveLevel } from "@/features/simulation/model/fractal";
import { ServingNode } from "./nodes/ServingNode";
import { CanvasFrame } from "../CanvasFrame";
import { DrillHint } from "../DrillHint";

const nodeTypes: NodeTypes = { serving: ServingNode };

/** Style an edge from its grammar validity: primary solid vs. danger dashed. */
function styleEdge(edge: ServingFlowEdge): ServingFlowEdge {
  const valid = edge.data?.valid ?? true;
  const stroke = valid ? "var(--primary)" : "var(--danger)";
  return {
    ...edge,
    style: {
      stroke,
      strokeWidth: 1.5,
      ...(valid ? {} : { strokeDasharray: "5 4" }),
    },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
    label: valid ? undefined : (edge.data?.reason ?? "invalid"),
    labelStyle: valid ? undefined : { fill: "var(--danger)", fontSize: 10 },
    labelBgStyle: valid ? undefined : { fill: "var(--canvas-bg)", fillOpacity: 0.9 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 2,
  };
}

/**
 * Canvas 2 — Serving / representation (fractal React Flow). Click selects a
 * node (cross-canvas); Ctrl/⌘+click descends into a node's interior level
 * (fractal), shown via the CanvasFrame breadcrumb. Read-only instrument layout.
 */
export function FlowCanvasC2() {
  const selection = useWorkbenchStore((s) => s.selection);
  const select = useWorkbenchStore((s) => s.select);
  const drill = useWorkbenchStore((s) => s.drill.c2);
  const drillInto = useWorkbenchStore((s) => s.drillInto);
  const drillTo = useWorkbenchStore((s) => s.drillTo);
  const drillUp = useWorkbenchStore((s) => s.drillUp);

  const { level, crumbs } = useMemo(() => resolveLevel(c2Graph, drill), [drill]);

  const nodes = useMemo<ServingFlowNode[]>(
    () =>
      level.nodes.map((n) => ({
        ...n,
        selected: selection.canvas === "c2" && selection.nodeId === n.id,
      })),
    [level, selection.canvas, selection.nodeId],
  );
  const edges = useMemo<ServingFlowEdge[]>(() => level.edges.map(styleEdge), [level]);

  const onNodeClick = useCallback<NodeMouseHandler<ServingFlowNode>>(
    (event, node) => {
      const sub = node.data?.drillTo;
      if ((event.ctrlKey || event.metaKey) && sub) drillInto("c2", sub);
      else select({ canvas: "c2", nodeId: node.id });
    },
    [select, drillInto],
  );

  const frameCrumbs = crumbs.map((c, i) => ({
    label: c.label,
    onClick: () => drillTo("c2", i - 1),
  }));

  return (
    <CanvasFrame
      title="C2 · Serving / representation"
      crumbs={frameCrumbs}
      focused={selection.canvas === "c2"}
      canBack={drill.length > 0}
      onBack={() => drillUp("c2")}
      onActivate={() => select({ canvas: "c2" })}
    >
      <ReactFlowProvider>
        <div className="h-full w-full bg-canvas-bg">
          <ReactFlow<ServingFlowNode, ServingFlowEdge>
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

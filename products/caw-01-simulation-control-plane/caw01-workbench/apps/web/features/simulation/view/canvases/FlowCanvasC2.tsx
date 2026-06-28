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
  c2Edges,
  c2Nodes,
  type ServingFlowEdge,
  type ServingFlowNode,
} from "@/features/simulation/model/fixtures/c2";
import { ServingNode } from "./nodes/ServingNode";

const nodeTypes: NodeTypes = { serving: ServingNode };

/** Style an edge from its grammar validity: primary solid vs. danger dashed. */
function styleEdge(edge: ServingFlowEdge): ServingFlowEdge {
  const valid = edge.data?.valid ?? true;
  const stroke = valid ? "var(--primary)" : "var(--danger)";
  return {
    ...edge,
    // No ambient animation: DESIGN.md §7 reserves motion (cyan) for a running
    // stream only. Valid = primary solid; invalid = danger dashed + reason.
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
 * Canvas 2 — Serving / representation composition (React Flow v12).
 * Valid edges = primary solid + animated; invalid edges = danger dashed with an
 * inline reason label. Clicking a node publishes the cross-canvas selection.
 */
export function FlowCanvasC2() {
  const selection = useWorkbenchStore((s) => s.selection);
  const select = useWorkbenchStore((s) => s.select);

  // Controlled like C1: the `selected` ring is driven by the shared store, so a
  // cross-canvas selection highlights here too (selection flows in AND out).
  const nodes = useMemo<ServingFlowNode[]>(
    () =>
      c2Nodes.map((n) => ({
        ...n,
        selected: selection.canvas === "c2" && selection.nodeId === n.id,
      })),
    [selection.canvas, selection.nodeId],
  );

  const edges = useMemo<ServingFlowEdge[]>(() => c2Edges.map(styleEdge), []);

  const onNodeClick = useCallback<NodeMouseHandler<ServingFlowNode>>(
    (_event, node) => {
      select({ canvas: "c2", nodeId: node.id });
    },
    [select],
  );

  return (
    <ReactFlowProvider>
      <div className="h-full w-full bg-canvas-bg">
        <ReactFlow<ServingFlowNode, ServingFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          /* Read-only instrument graph (fixed layout); no-op change handlers
             silence RF's controlled-without-handler warning. */
          onNodesChange={() => {}}
          onEdgesChange={() => {}}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-canvas-bg"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--canvas-grid)" />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

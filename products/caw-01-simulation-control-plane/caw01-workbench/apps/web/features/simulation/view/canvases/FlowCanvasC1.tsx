"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkbenchStore } from "@/store/workbenchStore";
import { OpNode } from "@/features/simulation/view/canvases/nodes/OpNode";
import {
  c1Nodes,
  c1Edges,
  type OpFlowNode,
} from "@/features/simulation/model/fixtures/c1";

// Stable identity (React Flow re-warns if nodeTypes is recreated per render).
const nodeTypes = { op: OpNode };

/**
 * Canvas 1 — AI workload flow. Renders the agent-turn op graph (left → right
 * tensor flow). Selection is driven by the shared store, not React Flow's
 * internal selection: clicking a node writes select({canvas:'c1', nodeId}),
 * and we mirror that back onto the node's `selected` flag so OpNode rings cyan
 * (and so a selection from another canvas could highlight here too).
 */
export function FlowCanvasC1() {
  const selection = useWorkbenchStore((s) => s.selection);
  const select = useWorkbenchStore((s) => s.select);

  const nodes = useMemo<OpFlowNode[]>(
    () =>
      c1Nodes.map((n) => ({
        ...n,
        selected: selection.canvas === "c1" && selection.nodeId === n.id,
      })),
    [selection.canvas, selection.nodeId],
  );

  return (
    <div className="h-full w-full bg-canvas-bg">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={c1Edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => select({ canvas: "c1", nodeId: node.id })}
          /* Read-only instrument graph: layout is fixed, selection is the only
             interaction (no-op change handlers silence RF's controlled warning). */
          onNodesChange={() => {}}
          onEdgesChange={() => {}}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--canvas-grid)" gap={16} />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  type HarnessFlowNode,
  type HarnessKind,
} from "@/features/simulation/model/fixtures/c1";
import { OpNode } from "@/features/simulation/view/canvases/nodes/OpNode";
import {
  graphModuleRepository,
  type SavedFlowModule,
} from "@/features/module-design/model/graphModuleRepository";
import {
  useWorkloadDesignStore,
  type WorkloadEdge,
  type WorkloadNode,
} from "./store";

type SavedWorkloadModule = SavedFlowModule<WorkloadNode, WorkloadEdge>;

/**
 * WORKLOAD module design composer — compose an agent-turn HARNESS graph
 * (io/router/llm/tool/memory, matching c1.ts HarnessKind). Left palette adds
 * nodes (they appear on the canvas immediately); the center is a LIVE React
 * Flow canvas (drag to reposition, drag handle → handle to wire two nodes);
 * the right inspector renames / removes the selected node and offers a
 * "Save as workload module" stub. Read-only-ish: positions are editable but
 * the graph itself is the deliverable.
 */

const nodeTypes: NodeTypes = { harness: OpNode };

// Palette — the five harness kinds + their categorical token (OFF status hues).
const PALETTE: Array<{ kind: HarnessKind; label: string; dot: string }> = [
  { kind: "io", label: "I/O", dot: "bg-cat-io" },
  { kind: "router", label: "Router", dot: "bg-cat-router" },
  { kind: "llm", label: "LLM call", dot: "bg-cat-llm" },
  { kind: "tool", label: "Tool call", dot: "bg-cat-tool" },
  { kind: "memory", label: "Memory", dot: "bg-cat-memory" },
];

/** Style a harness edge as a directed primary wire with an arrowhead (mirrors
 *  the read-only C1 canvas). */
function styleEdge(edge: Edge): Edge {
  const stroke = "var(--primary)";
  return {
    ...edge,
    style: { stroke, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
  };
}

export function WorkloadDesign() {
  const nodes = useWorkloadDesignStore((s) => s.nodes);
  const edges = useWorkloadDesignStore((s) => s.edges);
  const selectedId = useWorkloadDesignStore((s) => s.selectedId);

  const addNode = useWorkloadDesignStore((s) => s.addNode);
  const removeNode = useWorkloadDesignStore((s) => s.removeNode);
  const moveNode = useWorkloadDesignStore((s) => s.moveNode);
  const connect = useWorkloadDesignStore((s) => s.connect);
  const removeEdge = useWorkloadDesignStore((s) => s.removeEdge);
  const updateNode = useWorkloadDesignStore((s) => s.updateNode);
  const select = useWorkloadDesignStore((s) => s.select);
  const reset = useWorkloadDesignStore((s) => s.reset);
  const loadGraph = useWorkloadDesignStore((s) => s.loadGraph);

  // ephemeral status banner (no toast lib in this app — keep it self-contained).
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // module name + saved-module library (persisted via graphModuleRepository).
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedWorkloadModule[]>([]);

  const refresh = useCallback(() => {
    graphModuleRepository
      .list<WorkloadNode, WorkloadEdge>("workload")
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // store graph → React Flow shapes (store stays the single source of truth).
  const flowNodes = useMemo<HarnessFlowNode[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "harness",
        position: { x: n.x, y: n.y },
        data: { label: n.label, kind: n.kind },
        selected: n.id === selectedId,
      })),
    [nodes, selectedId],
  );
  const flowEdges = useMemo<Edge[]>(
    () => edges.map((e) => styleEdge({ id: e.id, source: e.from, target: e.to })),
    [edges],
  );

  // live drag / select / remove → commit straight back into the store.
  const onNodesChange = useCallback(
    (changes: NodeChange<HarnessFlowNode>[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position)
          moveNode(c.id, c.position.x, c.position.y);
        else if (c.type === "remove") removeNode(c.id);
        else if (c.type === "select") select(c.selected ? c.id : null);
      }
    },
    [moveNode, removeNode, select],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) if (c.type === "remove") removeEdge(c.id);
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target);
    },
    [connect],
  );

  const onNodeClick = useCallback<NodeMouseHandler<HarnessFlowNode>>(
    (_event, node) => select(node.id),
    [select],
  );

  const onSave = useCallback(async () => {
    if (nodes.length === 0 || saving) return;
    const moduleName = name.trim() || "Untitled workload";
    setSaving(true);
    try {
      const rec = await graphModuleRepository.save<WorkloadNode, WorkloadEdge>({
        name: moduleName,
        kind: "workload",
        graph: { nodes, edges },
      });
      setToast(`Saved “${rec.name}”`);
      setName("");
      refresh();
    } catch {
      setToast("Save failed — please retry");
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, name, saving, refresh]);

  const onLoad = useCallback(
    (mod: SavedWorkloadModule) => {
      loadGraph(mod.graph.nodes, mod.graph.edges);
      setName(mod.name);
      setToast(`Loaded “${mod.name}”`);
    },
    [loadGraph],
  );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[15rem_minmax(0,1fr)_19rem]">
      {/* ---- left: palette ---- */}
      <aside className="flex min-h-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Palette
          </h2>
          <p className="mt-0.5 text-xs text-text">Compose an agent-turn harness</p>
        </div>
        <div className="flex-1 space-y-2 overflow-auto p-3">
          {PALETTE.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => addNode(p.kind)}
              className="block w-full rounded-[var(--radius-md)] border border-border bg-surface p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-text-muted hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 rounded-full", p.dot)}
                  />
                  {p.label}
                </span>
                <span className="font-readout text-[9px] uppercase text-text-muted">
                  + add
                </span>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-border p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Saved modules
          </h3>
          {saved.length === 0 ? (
            <p className="font-readout text-[10px] text-text-muted">
              none yet — compose a harness and save it
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-auto">
              {saved.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onLoad(m)}
                    className="block w-full truncate rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-left text-xs transition-colors hover:border-text-muted"
                    title={`Load “${m.name}”`}
                  >
                    {m.name}
                    <span className="ml-1 font-readout text-[9px] text-text-muted">
                      {m.graph.nodes?.length ?? 0}n · {m.graph.edges?.length ?? 0}e
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ---- center: live React Flow canvas ---- */}
      <section className="relative flex min-h-0 flex-col bg-canvas-bg">
        <ReactFlowProvider>
          <div className="h-full w-full bg-canvas-bg">
            <ReactFlow<HarnessFlowNode, Edge>
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={() => select(null)}
              defaultEdgeOptions={{
                markerEnd: { type: MarkerType.ArrowClosed },
              }}
              nodesDraggable
              nodesConnectable
              elementsSelectable
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

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
            <span className="font-readout text-xs text-canvas-text-dim">
              empty — add harness steps from the palette
            </span>
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-[var(--radius-md)] border border-canvas-grid bg-surface px-3 py-1.5 shadow-lg">
            <span className="font-readout text-xs text-success">{toast}</span>
          </div>
        )}
      </section>

      {/* ---- right: inspector ---- */}
      <aside className="flex min-h-0 flex-col border-l border-border bg-surface">
        <div className="border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Inspector
          </h2>
        </div>

        <div className="flex-1 overflow-auto">
          {!selected ? (
            <p className="p-3 font-readout text-xs text-text-muted">
              Select a node on the canvas to edit it.
            </p>
          ) : (
            <div className="space-y-3 p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 font-readout text-[9px] uppercase text-text-muted">
                  {selected.kind}
                </span>
                <span className="truncate font-readout text-[10px] text-text-muted">
                  {selected.id}
                </span>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-muted">
                  Label
                </span>
                <input
                  className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1 text-sm"
                  value={selected.label}
                  onChange={(e) =>
                    updateNode(selected.id, { label: e.target.value })
                  }
                />
              </label>

              <Button
                variant="danger"
                className="w-full"
                onClick={() => removeNode(selected.id)}
              >
                Remove
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <input
            className="mb-2 w-full rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1 text-sm"
            placeholder="Module name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={onSave}
              disabled={saving || nodes.length === 0}
            >
              {saving ? "Saving…" : "Save as workload module"}
            </Button>
            <Button variant="ghost" onClick={reset} title="clear the composer">
              Clear
            </Button>
          </div>
          <p className="mt-2 font-readout text-[10px] text-text-muted">
            {nodes.length} node{nodes.length === 1 ? "" : "s"} · {edges.length}{" "}
            edge{edges.length === 1 ? "" : "s"}
          </p>
        </div>
      </aside>
    </div>
  );
}

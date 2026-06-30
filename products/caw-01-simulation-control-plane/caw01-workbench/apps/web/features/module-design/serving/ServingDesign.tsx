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
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ServingNode } from "@/features/simulation/view/canvases/nodes/ServingNode";
import type {
  ServingFlowEdge,
  ServingFlowNode,
  ServingKind,
} from "@/features/simulation/model/fixtures/c2";
import {
  graphModuleRepository,
  type SavedFlowModule,
} from "@/features/module-design/model/graphModuleRepository";
import { useServingDesignStore } from "./store";

type SavedServingModule = SavedFlowModule<ServingFlowNode, ServingFlowEdge>;

/**
 * SERVING MODULE DESIGN — live composer. The working module is an editable graph
 * in the store (features/module-design/serving/store.ts); every edit produces
 * NEW arrays, so the center React Flow canvas re-renders IMMEDIATELY.
 *
 * Compose a serving stack: serving → representation → simulator (matching
 * c2.ts ServingKind). Drag from a node's right ("out") handle to another node's
 * left ("in") handle to connect; edges are typed valid (solid) vs invalid
 * (dashed, labelled) by the pipeline grammar. Mirrors the HW composer's
 * palette / canvas / inspector layout for consistency.
 */

const nodeTypes: NodeTypes = { serving: ServingNode };

// ---- palette ---------------------------------------------------------------

type PaletteItem = { kind: ServingKind; label: string; blurb: string };

/** Stage presets, grouped by kind (mirrors c2.ts seed graph). */
const PALETTE: Array<{ kind: ServingKind; title: string; items: PaletteItem[] }> = [
  {
    kind: "serving",
    title: "Serving",
    items: [
      { kind: "serving", label: "vLLM", blurb: "production LLM server" },
      { kind: "serving", label: "LLMServingSim", blurb: "serving simulator" },
    ],
  },
  {
    kind: "representation",
    title: "Representation",
    items: [
      { kind: "representation", label: "torch", blurb: "eager graph capture" },
      { kind: "representation", label: "syntorch", blurb: "synthetic → Chakra ET" },
    ],
  },
  {
    kind: "simulator",
    title: "Simulator",
    items: [
      { kind: "simulator", label: "ASTRA-sim", blurb: "system + network sim" },
    ],
  },
];

const KIND_TONE = {
  serving: "running",
  representation: "warning",
  simulator: "success",
} as const satisfies Record<
  ServingKind,
  "neutral" | "running" | "success" | "danger" | "warning"
>;

// ---- edge styling (mirrors FlowCanvasC2.styleEdge) -------------------------

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
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 2,
  };
}

// ---- screen ----------------------------------------------------------------

export function ServingDesign() {
  const nodes = useServingDesignStore((s) => s.nodes);
  const edges = useServingDesignStore((s) => s.edges);
  const selectedId = useServingDesignStore((s) => s.selectedId);
  const add = useServingDesignStore((s) => s.add);
  const removeNode = useServingDesignStore((s) => s.removeNode);
  const connect = useServingDesignStore((s) => s.connect);
  const removeEdge = useServingDesignStore((s) => s.removeEdge);
  const select = useServingDesignStore((s) => s.select);
  const reset = useServingDesignStore((s) => s.reset);
  const loadGraph = useServingDesignStore((s) => s.loadGraph);

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  // module name + saved-module library (persisted via graphModuleRepository).
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMods, setSavedMods] = useState<SavedServingModule[]>([]);

  // ephemeral status banner (no toast lib in this app — keep it self-contained).
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(() => {
    graphModuleRepository
      .list<ServingFlowNode, ServingFlowEdge>("serving")
      .then(setSavedMods)
      .catch(() => setSavedMods([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const onSave = useCallback(async () => {
    if (nodes.length === 0 || saving) return;
    const moduleName = name.trim() || "Untitled serving stack";
    setSaving(true);
    try {
      const rec = await graphModuleRepository.save<
        ServingFlowNode,
        ServingFlowEdge
      >({ name: moduleName, kind: "serving", graph: { nodes, edges } });
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
    (mod: SavedServingModule) => {
      loadGraph(mod.graph.nodes, mod.graph.edges);
      setName(mod.name);
      setToast(`Loaded “${mod.name}”`);
    },
    [loadGraph],
  );

  // Decorate store nodes/edges for the controlled React Flow canvas.
  const rfNodes = useMemo<ServingFlowNode[]>(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  );
  const rfEdges = useMemo<ServingFlowEdge[]>(() => edges.map(styleEdge), [edges]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target);
    },
    [connect],
  );

  const onNodeClick = useCallback<NodeMouseHandler<ServingFlowNode>>(
    (_e, node) => select(node.id),
    [select],
  );

  const onEdgeClick = useCallback<EdgeMouseHandler<ServingFlowEdge>>(
    (_e, edge) => removeEdge(edge.id),
    [removeEdge],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-[var(--radius-md)] border border-canvas-grid bg-surface px-3 py-1.5 shadow-lg">
          <span className="font-readout text-xs text-success">{toast}</span>
        </div>
      )}
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <h1 className="text-sm font-semibold">Serving Module Design</h1>
        <span className="font-readout text-xs text-text-muted">
          serving → representation → simulator
        </span>
        {nodes.length > 0 && (
          <Button variant="ghost" className="ml-auto" onClick={reset}>
            New / reset
          </Button>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <Palette onAdd={add} saved={savedMods} onLoad={onLoad} />
        <CanvasPane
          empty={nodes.length === 0}
          nodes={rfNodes}
          edges={rfEdges}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
        />
        <Inspector
          selected={selected}
          edges={edges}
          nodes={nodes}
          onRemove={removeNode}
          name={name}
          onNameChange={setName}
          saving={saving}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

// ---- left palette ----------------------------------------------------------

function Palette({
  onAdd,
  saved,
  onLoad,
}: {
  onAdd: (kind: ServingKind, label: string) => void;
  saved: SavedServingModule[];
  onLoad: (mod: SavedServingModule) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Palette
        </h2>
        <p className="mt-0.5 text-xs text-text">Compose a serving stack</p>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-3">
        {PALETTE.map((group) => (
          <div key={group.kind} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone={KIND_TONE[group.kind]}>{group.title}</Badge>
            </div>
            {group.items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onAdd(item.kind, item.label)}
                className="block w-full rounded-[var(--radius-md)] border border-border bg-surface p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-text-muted hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="font-readout text-[9px] uppercase text-text-muted">
                    + add
                  </span>
                </div>
                <p className="mt-0.5 truncate font-readout text-xs text-text-muted">
                  {item.blurb}
                </p>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-border p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Saved modules
        </h3>
        {saved.length === 0 ? (
          <p className="font-readout text-[10px] text-text-muted">
            none yet — compose a stack and save it
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
  );
}

// ---- center canvas ---------------------------------------------------------

function CanvasPane({
  empty,
  nodes,
  edges,
  onConnect,
  onNodeClick,
  onEdgeClick,
}: {
  empty: boolean;
  nodes: ServingFlowNode[];
  edges: ServingFlowEdge[];
  onConnect: (c: Connection) => void;
  onNodeClick: NodeMouseHandler<ServingFlowNode>;
  onEdgeClick: EdgeMouseHandler<ServingFlowEdge>;
}) {
  return (
    <section className="flex min-h-0 flex-col bg-canvas-bg">
      <div className="flex items-center gap-2 border-b border-canvas-grid px-3 py-2">
        <span className="font-readout text-xs text-canvas-text-muted">
          Drag a node&apos;s right handle to another&apos;s left handle to connect ·
          click an edge to remove it
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ReactFlowProvider>
          <div className="h-full w-full bg-canvas-bg">
            <ReactFlow<ServingFlowNode, ServingFlowEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onNodesChange={() => {}}
              onEdgesChange={() => {}}
              nodesDraggable={false}
              nodesConnectable
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
        {empty && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
            <span className="font-readout text-xs text-canvas-text-dim">
              empty — add serving stages from the palette
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- right inspector -------------------------------------------------------

function Inspector({
  selected,
  edges,
  nodes,
  onRemove,
  name,
  onNameChange,
  saving,
  onSave,
}: {
  selected: ServingFlowNode | null;
  edges: ServingFlowEdge[];
  nodes: ServingFlowNode[];
  onRemove: (id: string) => void;
  name: string;
  onNameChange: (name: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? id;
  const invalid = edges.filter((e) => e.data?.valid === false).length;

  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Inspector
        </h2>
      </div>

      <div className="flex-1 overflow-auto">
        {!selected ? (
          <p className="p-3 font-readout text-xs text-text-muted">
            Select a stage on the canvas to inspect it.
          </p>
        ) : (
          <div className="space-y-3 p-3">
            <div className="flex items-center gap-2">
              <Badge tone={KIND_TONE[selected.data.kind]}>
                {selected.data.kind}
              </Badge>
              <span className="truncate font-readout text-[10px] text-text-muted">
                {selected.id}
              </span>
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Label
              </span>
              <p className="font-readout text-sm text-text">
                {selected.data.label}
              </p>
            </div>

            <Button
              variant="danger"
              className="w-full"
              onClick={() => onRemove(selected.id)}
            >
              Remove
            </Button>
          </div>
        )}

        {/* edge summary */}
        <div className="border-t border-border p-3">
          <p className="mb-1 font-readout text-[10px] uppercase tracking-wide text-text-muted">
            Connections {invalid > 0 && `· ${invalid} invalid`}
          </p>
          {edges.length === 0 ? (
            <p className="font-readout text-xs text-text-muted">no connections</p>
          ) : (
            <ul className="space-y-0.5">
              {edges.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "flex items-center gap-1 font-readout text-[10px]",
                    e.data?.valid === false ? "text-danger" : "text-text",
                  )}
                >
                  <span className="truncate">
                    {nameOf(e.source)} → {nameOf(e.target)}
                  </span>
                  {e.data?.valid === false && (
                    <span className="ml-auto shrink-0">invalid</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* save */}
      <div className="border-t border-border p-3">
        <input
          className="mb-2 w-full rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1 text-sm"
          placeholder="Module name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <Button
          variant="primary"
          onClick={onSave}
          disabled={saving || nodes.length === 0}
        >
          {saving ? "Saving…" : "Save as serving module"}
        </Button>
      </div>
    </aside>
  );
}

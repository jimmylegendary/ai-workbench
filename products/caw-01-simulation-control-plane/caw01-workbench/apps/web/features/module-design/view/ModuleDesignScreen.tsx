"use client";

import { useEffect, useRef, useState } from "react";
import * as yaml from "js-yaml";
import type { HwLevel, ClusterType } from "@caw/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  CompKind,
  HwLink,
  HwSpec,
  HwTreeNode,
  InterconnectKind,
  TrayKind,
} from "@/features/simulation/model/fixtures/c3";
import { IsoScene } from "@/features/simulation/view/canvases/iso/IsoScene";
import { useDoubleDrillPick } from "@/features/simulation/view/useDoubleDrillPick";
import { useModuleDesignStore } from "../store";
import {
  CHILD_LEVEL,
  DESIGN_LEVELS,
  FABRIC_KINDS,
  paletteFor,
  type Asset,
} from "../assets";

/**
 * HW MODULE DESIGN — live editor. The working module is a HwTreeNode tree in the
 * store; every edit produces a NEW tree, so the center twin canvas (IsoScene)
 * re-renders IMMEDIATELY (this component subscribes to `root`/`focusId`, then
 * re-derives focusNode()/focusPath() each render).
 *
 * Workload / Serving modes are stubs ("coming soon"); only HW is interactive.
 */

// ---- local helpers ---------------------------------------------------------

/** Find a node by partId anywhere in the tree (inspector target lookup). */
function findById(node: HwTreeNode, id: string): HwTreeNode | undefined {
  if (node.partId === id) return node;
  for (const c of node.children ?? []) {
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return undefined;
}

/** Serialize the working tree → YAML for the editable pane (round-trips with
 *  the parser below). undefined-valued keys are omitted by js-yaml. */
const dumpYaml = (node: HwTreeNode): string =>
  yaml.dump(node, { indent: 2, lineWidth: 100, sortKeys: false, noRefs: true });

/* ---- YAML → HwTreeNode (validate shape; throw a readable error) ----------- */

const VALID_LEVELS: readonly HwLevel[] = [
  "data_center",
  "client",
  "cluster",
  "rack",
  "tray",
  "package",
  "die",
  "chip",
  "component",
];

/** Coerce a YAML scalar to a string (numbers/bools allowed in spec values). */
const scalar = (v: unknown): string | undefined =>
  typeof v === "string"
    ? v
    : typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : undefined;

function parseSpec(v: unknown, path: string): HwSpec {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v))
    throw new Error(`${path}.spec must be a mapping`);
  const out: HwSpec = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const s = scalar(val);
    if (s == null) throw new Error(`${path}.spec.${k} must be a scalar`);
    out[k] = s;
  }
  return out;
}

function parseLinks(v: unknown, path: string): HwLink[] | undefined {
  if (v == null) return undefined;
  if (!Array.isArray(v)) throw new Error(`${path}.links must be a list`);
  return v.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error(`${path}.links[${i}] must be a mapping`);
    const o = raw as Record<string, unknown>;
    const from = scalar(o.from);
    const to = scalar(o.to);
    const kind = scalar(o.kind);
    if (!from || !to)
      throw new Error(`${path}.links[${i}] needs 'from' and 'to'`);
    if (!kind || !FABRIC_KINDS.some((f) => f.kind === kind))
      throw new Error(`${path}.links[${i}].kind is invalid ('${kind ?? ""}')`);
    const label = scalar(o.label);
    return {
      from,
      to,
      kind: kind as InterconnectKind,
      ...(label ? { label } : {}),
    };
  });
}

/** Parse one node (recursively). Throws Error with a path-prefixed message. */
function asTree(x: unknown, path: string): HwTreeNode {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error(`${path} must be a mapping`);
  const o = x as Record<string, unknown>;
  const name = scalar(o.name);
  const partId = scalar(o.partId);
  const level = scalar(o.level);
  if (!name) throw new Error(`${path}.name is required`);
  if (!partId) throw new Error(`${path}.partId is required`);
  if (!level || !VALID_LEVELS.includes(level as HwLevel))
    throw new Error(`${path}.level is invalid ('${level ?? ""}')`);

  const node: HwTreeNode = {
    partId,
    name,
    level: level as HwLevel,
    spec: parseSpec(o.spec, path),
  };

  const role = scalar(o.role);
  if (role) node.role = role;
  if (o.count != null) {
    const c = Number(o.count);
    if (!Number.isFinite(c)) throw new Error(`${path}.count must be a number`);
    node.count = c;
  }
  const comp = scalar(o.comp);
  if (comp) node.comp = comp as CompKind;
  const trayKind = scalar(o.trayKind);
  if (trayKind) node.trayKind = trayKind as TrayKind;
  const clusterType = scalar(o.clusterType);
  if (clusterType) node.clusterType = clusterType as ClusterType;
  const links = parseLinks(o.links, path);
  if (links) node.links = links;
  if (o.children != null) {
    if (!Array.isArray(o.children))
      throw new Error(`${path}.children must be a list`);
    node.children = o.children.map((c, i) =>
      asTree(c, `${path}.children[${i}]`),
    );
  }
  return node;
}

// ---- mode tabs -------------------------------------------------------------

const MODES: Array<{ key: string; label: string; enabled: boolean }> = [
  { key: "hw", label: "HW", enabled: true },
  { key: "workload", label: "Workload", enabled: false },
  { key: "serving", label: "Serving", enabled: false },
];

// ---- screen ----------------------------------------------------------------

export function ModuleDesignScreen() {
  const designLevel = useModuleDesignStore((s) => s.designLevel);
  const root = useModuleDesignStore((s) => s.root);
  const selectedId = useModuleDesignStore((s) => s.selectedId);
  // subscribe to focusId so focusNode()/focusPath() re-derive on every drill.
  useModuleDesignStore((s) => s.focusId);

  const startDesign = useModuleDesignStore((s) => s.startDesign);
  const setRoot = useModuleDesignStore((s) => s.setRoot);
  const addChild = useModuleDesignStore((s) => s.addChild);
  const addLink = useModuleDesignStore((s) => s.addLink);
  const removeLink = useModuleDesignStore((s) => s.removeLink);
  const updateNode = useModuleDesignStore((s) => s.updateNode);
  const removeNode = useModuleDesignStore((s) => s.removeNode);
  const select = useModuleDesignStore((s) => s.select);
  const focusInto = useModuleDesignStore((s) => s.focusInto);
  const focusTo = useModuleDesignStore((s) => s.focusTo);
  const reset = useModuleDesignStore((s) => s.reset);
  const focusNode = useModuleDesignStore((s) => s.focusNode);
  const focusPath = useModuleDesignStore((s) => s.focusPath);

  // The palette + canvas key off the FOCUSED node (drill to compose deeper), not
  // the static top design level — so each level offers its correct child assets.
  const focus = focusNode();

  // ---- canvas picking: single = select, double / Ctrl = drill in -----------
  const drillPick = useDoubleDrillPick(select, focusInto);

  // ---- "Connect" mode (drag is impractical across SVG scenes): click source,
  // then target, then pick a fabric kind → addLink on the focused node. --------
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<string | null>(null);

  // Reset any in-progress connection when the drill focus changes.
  const focusId = focus?.partId;
  useEffect(() => {
    setConnectFrom(null);
    setMenuTarget(null);
  }, [focusId]);

  const handlePick = (id: string, modifier: boolean) => {
    if (!connectMode) {
      drillPick(id, modifier);
      return;
    }
    if (!connectFrom) {
      setConnectFrom(id);
      select(id);
      return;
    }
    if (id === connectFrom) {
      setConnectFrom(null); // re-clicking the source cancels
      return;
    }
    setMenuTarget(id);
  };

  const chooseKind = (kind: InterconnectKind) => {
    if (connectFrom && menuTarget) addLink(connectFrom, menuTarget, kind);
    setMenuTarget(null);
    setConnectFrom(null); // stay in connect mode for chaining
  };

  const toggleConnect = () => {
    setConnectMode((m) => !m);
    setConnectFrom(null);
    setMenuTarget(null);
  };

  const cancelConnect = () => {
    setConnectFrom(null);
    setMenuTarget(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        designLevel={designLevel}
        onPick={startDesign}
        onReset={reset}
        hasRoot={!!root}
      />
      {!root ? (
        <Chooser onPick={startDesign} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_19rem]">
          <Palette designLevel={focus?.level ?? designLevel} onAdd={addChild} />
          <CanvasPane
            focus={focus}
            crumbs={focusPath()}
            selectedId={selectedId}
            onPick={handlePick}
            onCrumb={(id) => focusTo(id)}
            connectMode={connectMode}
            connectFrom={connectFrom}
            menuOpen={!!menuTarget}
            onToggleConnect={toggleConnect}
            onChooseKind={chooseKind}
            onCancelConnect={cancelConnect}
            onRemoveLink={removeLink}
          />
          <Inspector
            root={root}
            selectedId={selectedId}
            onUpdate={updateNode}
            onRemove={removeNode}
            onSetRoot={setRoot}
          />
        </div>
      )}
    </div>
  );
}

// ---- top bar ---------------------------------------------------------------

function TopBar({
  designLevel,
  onPick,
  onReset,
  hasRoot,
}: {
  designLevel: HwLevel | null;
  onPick: (level: HwLevel) => void;
  onReset: () => void;
  hasRoot: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
      <h1 className="text-sm font-semibold">HW Module Design</h1>

      {/* mode tabs */}
      <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border p-0.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={!m.enabled}
            title={m.enabled ? undefined : "coming soon"}
            className={cn(
              "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
              m.enabled
                ? "bg-text text-background"
                : "cursor-not-allowed text-text-muted opacity-60",
            )}
          >
            {m.label}
            {!m.enabled && (
              <span className="ml-1 text-[9px] uppercase tracking-wide">soon</span>
            )}
          </button>
        ))}
      </div>

      {/* level picker */}
      <div className="ml-2 flex items-center gap-1.5">
        <span className="text-xs text-text-muted">Design:</span>
        {DESIGN_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onPick(level)}
            className={cn(
              "rounded-[var(--radius-sm)] border px-2 py-1 font-readout text-xs capitalize transition-colors",
              designLevel === level
                ? "border-text bg-text text-background"
                : "border-border text-text-muted hover:bg-surface-muted",
            )}
          >
            {level}
          </button>
        ))}
      </div>

      {hasRoot && (
        <Button variant="ghost" className="ml-auto" onClick={onReset}>
          New / reset
        </Button>
      )}
    </header>
  );
}

// ---- center chooser (before a level is chosen) -----------------------------

const LEVEL_BLURB: Record<HwLevel, string> = {
  data_center: "a room of clusters",
  client: "a client device",
  cluster: "racks",
  rack: "trays",
  tray: "packages",
  package: "dies",
  die: "components",
  chip: "components",
  component: "—",
};

function Chooser({ onPick }: { onPick: (level: HwLevel) => void }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl">
        <h2 className="text-center text-lg font-semibold">Choose what to design</h2>
        <p className="mt-1 text-center text-sm text-text-muted">
          Pick a level — you compose it top-down from the level below.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DESIGN_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onPick(level)}
              className="flex flex-col items-start gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-text-muted hover:shadow-md"
            >
              <span className="text-sm font-semibold capitalize">{level}</span>
              <span className="font-readout text-xs text-text-muted">
                from {LEVEL_BLURB[level]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- left palette ----------------------------------------------------------

function Palette({
  designLevel,
  onAdd,
}: {
  designLevel: HwLevel | null;
  onAdd: (asset: Asset) => void;
}) {
  const assets = designLevel ? paletteFor(designLevel) : [];
  const child = designLevel ? CHILD_LEVEL[designLevel] : undefined;

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Palette
        </h2>
        <p className="mt-0.5 text-xs text-text">
          {designLevel && child
            ? `Compose a ${designLevel} from ${child}s`
            : `Compose a ${designLevel ?? "module"}`}
        </p>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {assets.length === 0 ? (
          <p className="font-readout text-xs text-text-muted">
            — {designLevel} has no composable parts —
          </p>
        ) : (
          assets.map((asset) => (
            <button
              key={asset.key}
              type="button"
              onClick={() => onAdd(asset)}
              className="block w-full rounded-[var(--radius-md)] border border-border bg-surface p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-text-muted hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{asset.label}</span>
                <span className="font-readout text-[9px] uppercase text-text-muted">
                  + add
                </span>
              </div>
              {asset.template.role && (
                <p className="mt-0.5 truncate font-readout text-xs text-text-muted">
                  {asset.template.role}
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

// ---- center canvas ---------------------------------------------------------

function CanvasPane({
  focus,
  crumbs,
  selectedId,
  onPick,
  onCrumb,
  connectMode,
  connectFrom,
  menuOpen,
  onToggleConnect,
  onChooseKind,
  onCancelConnect,
  onRemoveLink,
}: {
  focus: HwTreeNode | null;
  crumbs: HwTreeNode[];
  selectedId: string | null;
  onPick: (id: string, drill: boolean) => void;
  onCrumb: (id: string) => void;
  connectMode: boolean;
  connectFrom: string | null;
  menuOpen: boolean;
  onToggleConnect: () => void;
  onChooseKind: (kind: InterconnectKind) => void;
  onCancelConnect: () => void;
  onRemoveLink: (index: number) => void;
}) {
  if (!focus) return <div className="bg-canvas-bg" />;

  // child partId → display name (for the connect prompt + connections list).
  const nameOf = (id: string): string =>
    focus.children?.find((c) => c.partId === id)?.name ?? id;
  const links = focus.links ?? [];

  return (
    <section className="flex min-h-0 flex-col bg-canvas-bg">
      {/* breadcrumb + connect toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-canvas-grid px-3 py-2">
        {crumbs.map((node, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={node.partId} className="flex items-center gap-1">
              {i > 0 && (
                <span className="font-readout text-xs text-canvas-text-dim">/</span>
              )}
              <button
                type="button"
                onClick={() => onCrumb(node.partId)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-1.5 py-0.5 font-readout text-xs transition-colors",
                  last
                    ? "text-canvas-text"
                    : "text-canvas-text-muted hover:bg-canvas-tile",
                )}
              >
                {node.name}
              </button>
            </span>
          );
        })}

        <button
          type="button"
          onClick={onToggleConnect}
          className={cn(
            "ml-auto rounded-[var(--radius-sm)] border px-2 py-0.5 font-readout text-xs transition-colors",
            connectMode
              ? "border-accent text-accent"
              : "border-canvas-grid text-canvas-text-muted hover:bg-canvas-tile",
          )}
          title="Create an interconnect: click a source part, then a target, then pick a fabric."
        >
          {connectMode ? "Connecting…" : "Connect"}
        </button>
      </div>

      {/* connect-mode prompt */}
      {connectMode && (
        <div className="flex items-center gap-2 border-b border-canvas-grid bg-canvas-tile px-3 py-1.5">
          <span className="font-readout text-xs text-canvas-text-muted">
            {connectFrom
              ? `Source: ${nameOf(connectFrom)} — click a target part`
              : "Click a source part to connect"}
          </span>
          {connectFrom && (
            <button
              type="button"
              onClick={onCancelConnect}
              className="rounded-[var(--radius-sm)] px-1.5 py-0.5 font-readout text-xs text-canvas-text-dim hover:bg-canvas-bg"
            >
              cancel
            </button>
          )}
        </div>
      )}

      {/* live twin canvas — re-renders on every store edit */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <IsoScene
          container={focus}
          parts={focus.children ?? []}
          selectedId={selectedId ?? undefined}
          onPick={onPick}
        />
        {(focus.children?.length ?? 0) === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
            <span className="font-readout text-xs text-canvas-text-dim">
              empty — add parts from the palette
            </span>
          </div>
        )}

        {/* fabric-type menu (after a source + target have been picked) */}
        {menuOpen && (
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-canvas-grid bg-surface p-3 shadow-lg">
            <p className="mb-2 text-xs font-semibold text-text-muted">
              Fabric type
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {FABRIC_KINDS.map((f) => (
                <button
                  key={f.kind}
                  type="button"
                  onClick={() => onChooseKind(f.kind)}
                  className="rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-left font-readout text-xs hover:bg-surface-muted"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onCancelConnect}
              className="mt-2 w-full rounded-[var(--radius-sm)] px-2 py-1 font-readout text-xs text-text-muted hover:bg-surface-muted"
            >
              cancel
            </button>
          </div>
        )}

        {/* existing interconnects on the focused node (remove individually) */}
        {links.length > 0 && (
          <div className="absolute bottom-2 left-2 max-h-40 w-64 overflow-auto rounded-[var(--radius-md)] border border-canvas-grid bg-surface/95 p-2">
            <p className="mb-1 font-readout text-[10px] uppercase tracking-wide text-text-muted">
              Interconnects
            </p>
            <ul className="space-y-0.5">
              {links.map((l, i) => (
                <li
                  key={`${l.from}-${l.to}-${l.kind}-${i}`}
                  className="flex items-center gap-1 font-readout text-[10px] text-text"
                >
                  <span className="truncate">
                    {nameOf(l.from)} → {nameOf(l.to)}
                  </span>
                  <span className="text-text-muted">[{l.kind}]</span>
                  <button
                    type="button"
                    onClick={() => onRemoveLink(i)}
                    className="ml-auto rounded-[var(--radius-sm)] px-1 text-text-muted hover:bg-surface-muted"
                    title="remove interconnect"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- right inspector + YAML mirror -----------------------------------------

function Inspector({
  root,
  selectedId,
  onUpdate,
  onRemove,
  onSetRoot,
}: {
  root: HwTreeNode;
  selectedId: string | null;
  onUpdate: (id: string, patch: Partial<HwTreeNode>) => void;
  onRemove: (id: string) => void;
  onSetRoot: (root: HwTreeNode) => void;
}) {
  const [saved, setSaved] = useState(false);
  const node = selectedId ? findById(root, selectedId) : undefined;
  const isRoot = node?.partId === root.partId;

  const onSave = () => {
    // stub: a real save would POST the subtree to the module library.
    // eslint-disable-next-line no-console
    console.log("[module-design] save as module (stub):", root);
    setSaved(true);
  };

  const specEntries = node ? Object.entries(node.spec) : [];

  const setSpecKey = (i: number, key: string) => {
    if (!node) return;
    const next: HwSpec = {};
    specEntries.forEach(([k, v], idx) => {
      next[idx === i ? key : k] = v;
    });
    onUpdate(node.partId, { spec: next });
  };
  const setSpecVal = (i: number, val: string) => {
    if (!node) return;
    const next: HwSpec = {};
    specEntries.forEach(([k, v], idx) => {
      next[k] = idx === i ? val : v;
    });
    onUpdate(node.partId, { spec: next });
  };
  const removeSpec = (i: number) => {
    if (!node) return;
    const next: HwSpec = {};
    specEntries.forEach(([k, v], idx) => {
      if (idx !== i) next[k] = v;
    });
    onUpdate(node.partId, { spec: next });
  };
  const addSpec = () => {
    if (!node) return;
    onUpdate(node.partId, {
      spec: { ...node.spec, [`field${specEntries.length + 1}`]: "" },
    });
  };

  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Inspector
        </h2>
      </div>

      <div className="flex-1 overflow-auto">
        {!node ? (
          <p className="p-3 font-readout text-xs text-text-muted">
            Select a part on the canvas to edit it.
          </p>
        ) : (
          <div className="space-y-3 p-3">
            <div className="flex items-center gap-2">
              <span className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 font-readout text-[9px] uppercase text-text-muted">
                {node.level}
              </span>
              <span className="truncate font-readout text-[10px] text-text-muted">
                {node.partId}
              </span>
            </div>

            <Field label="Name">
              <input
                className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1 text-sm"
                value={node.name}
                onChange={(e) => onUpdate(node.partId, { name: e.target.value })}
              />
            </Field>

            <Field label="Count">
              <input
                type="number"
                min={1}
                className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1 font-readout text-sm"
                value={node.count ?? ""}
                placeholder="1"
                onChange={(e) => {
                  const v = e.target.value;
                  onUpdate(node.partId, {
                    count: v === "" ? undefined : Math.max(1, Number(v) || 1),
                  });
                }}
              />
            </Field>

            <Field label="Spec">
              <div className="space-y-1.5">
                {specEntries.length === 0 && (
                  <p className="font-readout text-xs text-text-muted">no spec fields</p>
                )}
                {specEntries.map(([k, v], i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      className="w-2/5 rounded-[var(--radius-sm)] border border-border bg-background px-1.5 py-1 font-readout text-xs"
                      value={k}
                      onChange={(e) => setSpecKey(i, e.target.value)}
                    />
                    <input
                      className="flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-1.5 py-1 font-readout text-xs"
                      value={v}
                      onChange={(e) => setSpecVal(i, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeSpec(i)}
                      className="rounded-[var(--radius-sm)] px-1.5 py-1 text-xs text-text-muted hover:bg-surface-muted"
                      title="remove field"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  className="w-full text-xs"
                  onClick={addSpec}
                >
                  + spec field
                </Button>
              </div>
            </Field>

            <Button
              variant="danger"
              className="w-full"
              disabled={isRoot}
              onClick={() => onRemove(node.partId)}
              title={isRoot ? "the root module cannot be removed" : undefined}
            >
              Remove
            </Button>
          </div>
        )}
      </div>

      {/* save + live YAML mirror */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onSave}>
            Save as module
          </Button>
          {saved && (
            <span className="font-readout text-xs text-success">saved (stub)</span>
          )}
        </div>
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-text-muted">
            YAML (editable)
          </summary>
          <YamlEditor root={root} onApply={onSetRoot} />
        </details>
      </div>
    </aside>
  );
}

/**
 * Editable YAML mirror of the working tree (two-way). Typing parses + validates
 * the YAML and, when valid, pushes the new tree to the store (live canvas);
 * invalid YAML shows an inline error and leaves the canvas untouched. External
 * edits (palette / inspector) re-serialize back into the textarea.
 */
function YamlEditor({
  root,
  onApply,
}: {
  root: HwTreeNode;
  onApply: (tree: HwTreeNode) => void;
}) {
  const [text, setText] = useState(() => dumpYaml(root));
  const [error, setError] = useState<string | null>(null);
  // when WE caused the root change, skip the re-serialize so typing isn't fought.
  const selfEdit = useRef(false);

  useEffect(() => {
    if (selfEdit.current) {
      selfEdit.current = false;
      return;
    }
    setText(dumpYaml(root));
    setError(null);
  }, [root]);

  const onChange = (value: string) => {
    setText(value);
    let parsed: unknown;
    try {
      parsed = yaml.load(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "invalid YAML");
      return;
    }
    try {
      const tree = asTree(parsed, "root");
      setError(null);
      selfEdit.current = true;
      onApply(tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : "invalid shape");
    }
  };

  return (
    <div className="mt-2">
      <textarea
        value={text}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-64 w-full resize-y rounded-[var(--radius-sm)] border bg-background p-2 font-readout text-[10px] leading-relaxed text-text",
          error ? "border-danger" : "border-border",
        )}
      />
      {error ? (
        <p className="mt-1 font-readout text-[10px] text-danger">{error}</p>
      ) : (
        <p className="mt-1 font-readout text-[10px] text-text-muted">
          valid — canvas is live
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}

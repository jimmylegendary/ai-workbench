"use client";

import { useState } from "react";
import type { HwLevel } from "@caw/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { HwSpec, HwTreeNode } from "@/features/simulation/model/fixtures/c3";
import { IsoScene } from "@/features/simulation/view/canvases/iso/IsoScene";
import { useModuleDesignStore } from "../store";
import { CHILD_LEVEL, DESIGN_LEVELS, paletteFor, type Asset } from "../assets";

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

/** Quote a scalar if it contains YAML-special chars (read-only mirror only). */
const yamlScalar = (x: string): string =>
  /[:#\n"'{}[\]]|^[\s-]|\s$/.test(x) ? JSON.stringify(x) : x;

/** Tiny tree → YAML serializer (no new dependency). Read-only mirror of root. */
function toYaml(node: HwTreeNode, depth: number): string {
  const p = "  ".repeat(depth);
  let out = "";
  out += `${p}name: ${yamlScalar(node.name)}\n`;
  out += `${p}partId: ${yamlScalar(node.partId)}\n`;
  out += `${p}level: ${node.level}\n`;
  if (node.comp) out += `${p}comp: ${node.comp}\n`;
  if (node.trayKind) out += `${p}trayKind: ${node.trayKind}\n`;
  if (node.clusterType) out += `${p}clusterType: ${node.clusterType}\n`;
  if (node.count != null) out += `${p}count: ${node.count}\n`;
  const spec = Object.entries(node.spec);
  if (spec.length) {
    out += `${p}spec:\n`;
    for (const [k, v] of spec) out += `${p}  ${yamlScalar(k)}: ${yamlScalar(v)}\n`;
  }
  if (node.links?.length) {
    out += `${p}links:\n`;
    for (const l of node.links)
      out +=
        `${p}  - { from: ${yamlScalar(l.from)}, to: ${yamlScalar(l.to)}, ` +
        `kind: ${l.kind}${l.label ? `, label: ${yamlScalar(l.label)}` : ""} }\n`;
  }
  if (node.children?.length) {
    out += `${p}children:\n`;
    const cp = "  ".repeat(depth + 1);
    for (const c of node.children) out += `${cp}-\n${toYaml(c, depth + 2)}`;
  }
  return out;
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
  const addChild = useModuleDesignStore((s) => s.addChild);
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
            onPick={(id, drill) => (drill ? focusInto(id) : select(id))}
            onCrumb={(id) => focusTo(id)}
          />
          <Inspector
            root={root}
            selectedId={selectedId}
            onUpdate={updateNode}
            onRemove={removeNode}
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
}: {
  focus: HwTreeNode | null;
  crumbs: HwTreeNode[];
  selectedId: string | null;
  onPick: (id: string, drill: boolean) => void;
  onCrumb: (id: string) => void;
}) {
  if (!focus) return <div className="bg-canvas-bg" />;

  return (
    <section className="flex min-h-0 flex-col bg-canvas-bg">
      {/* breadcrumb */}
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
      </div>

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
}: {
  root: HwTreeNode;
  selectedId: string | null;
  onUpdate: (id: string, patch: Partial<HwTreeNode>) => void;
  onRemove: (id: string) => void;
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
            YAML
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-sm)] border border-border bg-background p-2 font-readout text-[10px] leading-relaxed text-text">
            {toYaml(root, 0)}
          </pre>
        </details>
      </div>
    </aside>
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

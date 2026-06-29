"use client";

import { useMemo, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { useWorkbenchStore } from "@/store/workbenchStore";
import {
  c3PartsById,
  resolveC3Level,
  type HwTreeNode,
} from "@/features/simulation/model/fixtures/c3";
import { CanvasFrame } from "../CanvasFrame";
import { DrillHint } from "../DrillHint";
import { LevelTag, TwinObject } from "./TwinObject";

/**
 * Canvas 3 — Hardware design, as a FRACTAL hardware schematic / floorplan.
 * The current drill level (store: drill.c3) renders its child parts as nested
 * rectangles on the dark canvas — a board/package/die layout, sized to fill —
 * each labelled with a mono spec readout.
 *
 *   Plain click       → select({canvas:'c3', partId})  (cross-canvas pick)
 *   Ctrl/⌘+click       → drillInto('c3', partId)        (descend; parts WITH children)
 *   breadcrumb crumb i → drillTo('c3', i-1)             (ascend)  ·  ← / Backspace = up one
 *
 * Color rule: tiles + text use CANVAS tokens (the canvas is always dark);
 * hierarchy level is shown with a NEUTRAL tag — the reserved status hues
 * (success/warning/danger/cyan) are kept for run-state / validity / selection.
 */

/** Near-square column count to lay N twin objects out to fill the area. */
const gridCols = (n: number): number => Math.max(1, Math.ceil(Math.sqrt(n)));

export function HardwareTreeC3() {
  const selection = useWorkbenchStore((s) => s.selection);
  const select = useWorkbenchStore((s) => s.select);
  const drill = useWorkbenchStore((s) => s.drill.c3);
  const drillInto = useWorkbenchStore((s) => s.drillInto);
  const drillTo = useWorkbenchStore((s) => s.drillTo);
  const drillUp = useWorkbenchStore((s) => s.drillUp);

  const { parts, crumbs } = useMemo(() => resolveC3Level(drill), [drill]);

  const selectedPart =
    selection.canvas === "c3" && selection.partId
      ? c3PartsById[selection.partId]
      : undefined;

  const onPartClick = (
    event: MouseEvent<HTMLButtonElement>,
    part: HwTreeNode,
  ): void => {
    const hasChildren = !!part.children && part.children.length > 0;
    if ((event.ctrlKey || event.metaKey) && hasChildren)
      drillInto("c3", part.partId);
    else select({ canvas: "c3", partId: part.partId });
  };

  const frameCrumbs = crumbs.map((c, i) => ({
    label: c.label,
    onClick: () => drillTo("c3", i - 1),
  }));

  const cols = gridCols(parts.length);

  return (
    <CanvasFrame
      title="C3 · Hardware"
      crumbs={frameCrumbs}
      focused={selection.canvas === "c3"}
      canBack={drill.length > 0}
      onBack={() => drillUp("c3")}
      onActivate={() => select({ canvas: "c3" })}
    >
      <div className="relative h-full w-full overflow-hidden bg-canvas-bg">
        {parts.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-readout text-xs text-canvas-text-dim">
              — leaf part: no interior —
            </p>
          </div>
        ) : (
          <div
            className="grid h-full w-full gap-2 p-2"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridAutoRows: "minmax(0, 1fr)",
            }}
          >
            {parts.map((part) => {
              const hasChildren = !!part.children && part.children.length > 0;
              const isSelected =
                selection.canvas === "c3" && selection.partId === part.partId;
              return (
                <button
                  key={part.partId}
                  type="button"
                  onClick={(e) => onPartClick(e, part)}
                  title={
                    hasChildren
                      ? `${part.partId} — Ctrl/⌘+click to drill in`
                      : part.partId
                  }
                  className={cn(
                    "group relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)]",
                    "border bg-canvas-tile p-2 text-left shadow-sm transition-all",
                    "hover:-translate-y-0.5 hover:shadow-md",
                    isSelected
                      ? "border-accent ring-2 ring-accent"
                      : "border-canvas-grid hover:border-canvas-text-muted",
                  )}
                >
                  <TwinObject
                    part={part}
                    isSelected={isSelected}
                    hasChildren={hasChildren}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* selected-part spec readout (inline; PartInspector reads the same partId) */}
        {selectedPart && (
          <div className="pointer-events-none absolute bottom-1.5 left-2 z-10 max-w-[60%] rounded-[var(--radius-sm)] border border-canvas-grid bg-canvas-bg/90 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <LevelTag level={selectedPart.level} />
              <span className="font-readout truncate text-xs text-accent">
                {selectedPart.name}
              </span>
              <span className="font-readout shrink-0 text-[9px] text-canvas-text-dim">
                {selectedPart.partId}
              </span>
            </div>
            <dl className="mt-1 flex flex-col gap-0.5 font-readout text-[10px]">
              {Object.entries(selectedPart.spec).map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-3">
                  <dt className="text-canvas-text-muted">{key}</dt>
                  <dd className="ml-auto tabular-nums text-canvas-text">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <DrillHint />
      </div>
    </CanvasFrame>
  );
}

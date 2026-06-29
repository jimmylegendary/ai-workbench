"use client";

import { useMemo } from "react";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { c3PartsById, resolveC3Level } from "@/features/simulation/model/fixtures/c3";
import { CanvasFrame } from "../CanvasFrame";
import { DrillHint } from "../DrillHint";
import { LevelTag } from "./TwinObject";
import { IsoScene } from "./iso/IsoScene";
import { useDoubleDrillPick } from "../useDoubleDrillPick";

/**
 * Canvas 3 — Hardware design, as a FRACTAL isometric digital twin. The current
 * drill level (store: drill.c3) resolves to a `container` + its child `parts`;
 * IsoScene picks the level-appropriate 2.5D renderer (room · rack · tray · gpu ·
 * or a generic twin row) and draws the children as clickable iso hit regions.
 *
 *   Plain click       → select({canvas:'c3', partId})  (cross-canvas pick)
 *   Ctrl/⌘+click       → drillInto('c3', partId)        (descend; parts WITH children)
 *   breadcrumb crumb i → drillTo('c3', i-1)             (ascend)  ·  ← / Backspace = up one
 *
 * Color rule: scene faces use fixed metal greys (the canvas is always dark);
 * hierarchy/taxonomy uses the categorical palette and the NEUTRAL level tag —
 * the reserved status hues (success/warning/danger/cyan) stay for run-state /
 * validity / selection (var(--accent) = the selection outline only).
 */
export function HardwareTreeC3() {
  const selection = useWorkbenchStore((s) => s.selection);
  const select = useWorkbenchStore((s) => s.select);
  const drill = useWorkbenchStore((s) => s.drill.c3);
  const drillInto = useWorkbenchStore((s) => s.drillInto);
  const drillTo = useWorkbenchStore((s) => s.drillTo);
  const drillUp = useWorkbenchStore((s) => s.drillUp);

  const { container, parts, crumbs } = useMemo(() => resolveC3Level(drill), [drill]);

  const selectedPart =
    selection.canvas === "c3" && selection.partId
      ? c3PartsById[selection.partId]
      : undefined;

  const frameCrumbs = crumbs.map((c, i) => ({
    label: c.label,
    onClick: () => drillTo("c3", i - 1),
  }));

  // Single click selects; double-click (or Ctrl/⌘+click) drills into a node
  // that has an interior.
  const onPick = useDoubleDrillPick(
    (id) => select({ canvas: "c3", partId: id }),
    (id) => drillInto("c3", id),
    (id) => !!c3PartsById[id]?.children?.length,
  );

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
        <IsoScene
          container={container}
          parts={parts}
          selectedId={selection.canvas === "c3" ? selection.partId : undefined}
          onPick={onPick}
        />

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

import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";
import { TwinObject } from "../TwinObject";
import { RoomScene } from "./RoomScene";
import { RackScene } from "./RackScene";
import { TrayScene } from "./TrayScene";
import { GpuScene } from "./GpuScene";

/**
 * IsoScene — the Canvas-3 scene DISPATCHER. Given the current drill `container`
 * and its child `parts`, it picks the level-appropriate isometric renderer and
 * passes the picking props straight through. Every scene shares one contract:
 *
 *   { container, parts, selectedId, onPick(partId, drill) }
 *
 *   data_center · cluster        → RoomScene  (room of zones / rack cabinets)
 *   rack                         → RackScene  (rack elevation, tray slots)
 *   tray                         → TrayScene  (board topology, cuboids)
 *   package · die · chip · gpu   → GpuScene   (memory-hierarchy schematic)
 *   else                         → IsoFallback (a simple isometric row of twins)
 *
 * The ROOT chooser (Server / Client) also uses the fallback — its `container`
 * happens to carry level `data_center`, so we special-case it by partId so the
 * two top-level twin objects render as big cards rather than a data-center room.
 */
export interface IsoSceneProps {
  container: HwTreeNode;
  parts: HwTreeNode[];
  selectedId?: string;
  onPick: (partId: string, drill: boolean) => void;
  /**
   * OPTIONAL drag-to-connect hooks. When supplied, every part hit region also
   * fires these on pointer down/up so a caller (the Module Design editor) can
   * draw a rubber-band connection between two parts. Default `undefined` → no
   * pointer handlers are attached, so the read-only C3 viewer is UNAFFECTED.
   */
  onPartPointerDown?: (partId: string, e: ScenePointerEvent) => void;
  onPartPointerUp?: (partId: string, e: ScenePointerEvent) => void;
}

/** Pointer event covering both SVG-group scenes and the HTML fallback cards. */
export type ScenePointerEvent = import("react").PointerEvent<Element>;

export function IsoScene({
  container,
  parts,
  selectedId,
  onPick,
  onPartPointerDown,
  onPartPointerUp,
}: IsoSceneProps) {
  const drag = { onPartPointerDown, onPartPointerUp };

  // Root: the Server/Client chooser — two big twin objects (not a room).
  if (container.partId === "root") {
    return (
      <IsoFallback
        container={container}
        parts={parts}
        selectedId={selectedId}
        onPick={onPick}
        {...drag}
      />
    );
  }

  switch (container.level) {
    case "data_center":
    case "cluster":
      return (
        <RoomScene container={container} parts={parts} selectedId={selectedId} onPick={onPick} {...drag} />
      );
    case "rack":
      return (
        <RackScene container={container} parts={parts} selectedId={selectedId} onPick={onPick} {...drag} />
      );
    case "tray":
      return (
        <TrayScene container={container} parts={parts} selectedId={selectedId} onPick={onPick} {...drag} />
      );
    case "package":
    case "die":
    case "chip":
      return (
        <GpuScene container={container} parts={parts} selectedId={selectedId} onPick={onPick} {...drag} />
      );
    default:
      // leaf-ish levels (component, client device, …) → generic twin row.
      return (
        <IsoFallback
          container={container}
          parts={parts}
          selectedId={selectedId}
          onPick={onPick}
          {...drag}
        />
      );
  }
}

/**
 * Generic fallback — a simple isometric row of TwinObject cards. Used for the
 * root chooser (two big objects) and any level without a dedicated scene. Each
 * card is a clickable hit region: plain click selects, Ctrl/⌘+click drills (when
 * the part has children).
 */
function IsoFallback({
  container,
  parts,
  selectedId,
  onPick,
  onPartPointerDown,
  onPartPointerUp,
}: IsoSceneProps) {
  if (parts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-readout text-xs text-canvas-text-dim">
          — leaf part: no interior —
        </p>
      </div>
    );
  }

  // Two-up gets large "big object" cards; otherwise a wrapping row of twins.
  const big = parts.length <= 2;

  const onCardClick = (event: MouseEvent<HTMLButtonElement>, part: HwTreeNode): void => {
    // Pass the drill flag unconditionally (consistent with the dedicated scenes).
    // The C3 viewer re-gates on hasChildren in HardwareTreeC3.onPick; the module
    // composer wants to drill into an empty node to compose its interior.
    onPick(part.partId, event.ctrlKey || event.metaKey);
  };

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center gap-4 overflow-auto p-4",
        big ? "flex-row" : "flex-row flex-wrap content-center",
      )}
    >
      {parts.map((part) => {
        const hasChildren = !!part.children && part.children.length > 0;
        const isSelected = part.partId === selectedId;
        return (
          <button
            key={part.partId}
            type="button"
            onClick={(e) => onCardClick(e, part)}
            onPointerDown={onPartPointerDown ? (e) => onPartPointerDown(part.partId, e) : undefined}
            onPointerUp={onPartPointerUp ? (e) => onPartPointerUp(part.partId, e) : undefined}
            title={hasChildren ? `${part.partId} — Ctrl/⌘+click to drill in` : part.partId}
            className={cn(
              "group relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)]",
              "border bg-canvas-tile p-3 text-left shadow-sm transition-all",
              "hover:-translate-y-0.5 hover:shadow-md",
              big ? "h-3/4 flex-1 basis-0" : "h-44 w-44",
              isSelected
                ? "border-accent ring-2 ring-accent"
                : "border-canvas-grid hover:border-canvas-text-muted",
            )}
          >
            <TwinObject part={part} isSelected={isSelected} hasChildren={hasChildren} />
          </button>
        );
      })}
    </div>
  );
}

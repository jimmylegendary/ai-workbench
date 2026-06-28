import { create } from "zustand";
import type { AxisStatus } from "@caw/core";

/**
 * The single Zustand store = the interaction-state half of the ViewModel
 * (design/06-frontend/state-management.md). Server source-of-truth lives in
 * Supabase/engine and is fetched via TanStack Query; this store is a cache +
 * interaction layer, never the source of truth for committed data.
 */
export type CanvasId = "c1" | "c2" | "c3";

/** Workspace view mode: `split` = tabbed (one canvas, large); `all` = 3-up grid. */
export type ViewMode = "split" | "all";

interface Selection {
  canvas: CanvasId;
  nodeId?: string;
  partId?: string;
}

interface WorkbenchState {
  selection: Selection;
  dirty: boolean;
  run: { runId?: string; perAxis: AxisStatus[] };
  layout: { dividerRatio: number; focus?: CanvasId };

  /** Workspace view mode + the active tab when mode === 'split'. */
  view: { mode: ViewMode; activeTab: CanvasId };

  /**
   * Fractal drill path per canvas. Each entry is a container key (C1/C2: a
   * subgraph id; C3: a partId) the user has Ctrl+clicked into. Empty = root.
   * The current level is the last entry (or root).
   */
  drill: Record<CanvasId, string[]>;

  select: (sel: Partial<Selection>) => void;
  markDirty: (dirty: boolean) => void;
  setRun: (runId: string | undefined) => void;
  setAxisStatus: (perAxis: AxisStatus[]) => void;
  setDividerRatio: (ratio: number) => void;

  setViewMode: (mode: ViewMode) => void;
  setActiveTab: (canvas: CanvasId) => void;

  /** Ctrl+click: descend into a node's interior (fractal). */
  drillInto: (canvas: CanvasId, key: string) => void;
  /** Jump the drill path to a breadcrumb depth (-1 = root). */
  drillTo: (canvas: CanvasId, depth: number) => void;
  /** Back: pop one fractal level (the step just before the last zoom-in). */
  drillUp: (canvas: CanvasId) => void;
  /** Reset to the initial view: all drill paths to root, default mode/tab. */
  resetView: () => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  selection: { canvas: "c1" },
  dirty: false,
  run: { perAxis: [] },
  layout: { dividerRatio: 0.08 }, // control panel : workspace — workspace dominates
  view: { mode: "split", activeTab: "c1" },
  drill: { c1: [], c2: [], c3: [] },

  // A single active selection target: switching canvas clears the other
  // discriminant so two canvases can never appear selected at once. A bare
  // select({canvas}) (e.g. a work-tree subtree click) clears node/part focus.
  select: (sel) =>
    set((s) => ({
      selection: {
        canvas: sel.canvas ?? s.selection.canvas,
        nodeId: "nodeId" in sel ? sel.nodeId : undefined,
        partId: "partId" in sel ? sel.partId : undefined,
      },
    })),
  markDirty: (dirty) => set({ dirty }),
  setRun: (runId) => set((s) => ({ run: { ...s.run, runId } })),
  setAxisStatus: (perAxis) => set((s) => ({ run: { ...s.run, perAxis } })),
  setDividerRatio: (dividerRatio) =>
    set((s) => ({ layout: { ...s.layout, dividerRatio } })),

  setViewMode: (mode) => set((s) => ({ view: { ...s.view, mode } })),
  setActiveTab: (activeTab) =>
    set((s) => ({
      view: { ...s.view, activeTab },
      selection: { ...s.selection, canvas: activeTab },
    })),

  drillInto: (canvas, key) =>
    set((s) => ({ drill: { ...s.drill, [canvas]: [...s.drill[canvas], key] } })),
  drillTo: (canvas, depth) =>
    set((s) => ({
      drill: { ...s.drill, [canvas]: s.drill[canvas].slice(0, Math.max(0, depth + 1)) },
    })),
  drillUp: (canvas) =>
    set((s) => ({ drill: { ...s.drill, [canvas]: s.drill[canvas].slice(0, -1) } })),
  resetView: () =>
    set({
      drill: { c1: [], c2: [], c3: [] },
      selection: { canvas: "c1" },
      view: { mode: "split", activeTab: "c1" },
    }),
}));

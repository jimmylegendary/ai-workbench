import { create } from "zustand";
import type { AxisStatus } from "@caw/core";

/**
 * The single Zustand store = the interaction-state half of the ViewModel
 * (design/06-frontend/state-management.md). Server source-of-truth lives in
 * Supabase/engine and is fetched via TanStack Query; this store is a cache +
 * interaction layer, never the source of truth for committed data.
 */
type CanvasId = "c1" | "c2" | "c3";

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

  select: (sel: Partial<Selection>) => void;
  markDirty: (dirty: boolean) => void;
  setRun: (runId: string | undefined) => void;
  setAxisStatus: (perAxis: AxisStatus[]) => void;
  setDividerRatio: (ratio: number) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  selection: { canvas: "c1" },
  dirty: false,
  run: { perAxis: [] },
  layout: { dividerRatio: 0.1 }, // 1:9

  select: (sel) => set((s) => ({ selection: { ...s.selection, ...sel } })),
  markDirty: (dirty) => set({ dirty }),
  setRun: (runId) => set((s) => ({ run: { ...s.run, runId } })),
  setAxisStatus: (perAxis) => set((s) => ({ run: { ...s.run, perAxis } })),
  setDividerRatio: (dividerRatio) =>
    set((s) => ({ layout: { ...s.layout, dividerRatio } })),
}));

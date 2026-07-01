"use client";

import { cn } from "@/lib/utils";
import {
  useWorkbenchStore,
  type CanvasId,
  type ViewMode,
} from "@/store/workbenchStore";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "split", label: "Split" },
  { id: "all", label: "All" },
];

const TABS: { id: CanvasId; label: string }[] = [
  { id: "c1", label: "C1 · Workload" },
  { id: "c2", label: "C2 · Serving" },
  { id: "c3", label: "C3 · Hardware" },
];

/**
 * Workspace view-mode controls. `Split` = one canvas at a time via tabs (large);
 * `All` = the three canvases at once. Lives on the light chrome above the
 * (dark) canvas area.
 */
export function ViewToolbar() {
  const mode = useWorkbenchStore((s) => s.view.mode);
  const activeTab = useWorkbenchStore((s) => s.view.activeTab);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setActiveTab = useWorkbenchStore((s) => s.setActiveTab);
  const resetView = useWorkbenchStore((s) => s.resetView);

  return (
    <div className="flex shrink-0 items-center gap-2 px-2 py-1.5">
      <div className="inline-flex rounded-[var(--radius-sm)] border border-border p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setViewMode(m.id)}
            className={cn(
              "rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium transition-colors",
              mode === m.id
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Tabs: in 'split' they pick the visible canvas; in 'all' they switch the
          right-hand context rail (Workload / Serving / HW). Always shown. */}
      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "rounded-[var(--radius-sm)] px-2 py-0.5 text-xs transition-colors",
              activeTab === t.id
                ? "bg-surface-muted font-medium text-text"
                : "text-text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={resetView}
        title="Reset to the initial view"
        className="rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text"
      >
        Reset view
      </button>

      <span className="ml-auto font-readout text-[10px] text-text-muted">
        Ctrl/⌘+click a node → drill in · ← / Backspace → back · ⤢ fullscreen
      </span>
    </div>
  );
}

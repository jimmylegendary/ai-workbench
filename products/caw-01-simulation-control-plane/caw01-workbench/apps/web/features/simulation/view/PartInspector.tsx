"use client";

import { useWorkbenchStore } from "@/store/workbenchStore";
import { c3PartsById } from "@/features/simulation/model/fixtures/c3";
import { LevelTag } from "./canvases/TwinObject";

/**
 * Inspector for the Canvas-3 part currently picked in the shared store
 * (selection.partId). Pure View (app-architecture-mvvm.md): reads the selected
 * partId, resolves it against the C3 fixture, and renders its level + spec as a
 * compact mono readout. Editing a spec field would emit a `c3_part` change_blob
 * (change-management-worktree.md) — stubbed read-only here until WorkTreeService
 * is wired.
 */
export function PartInspector() {
  const partId = useWorkbenchStore((s) => s.selection.partId);
  const part = partId ? c3PartsById[partId] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="font-readout text-[10px] uppercase tracking-wide text-text-muted">
          Part inspector
        </span>
        {part ? <LevelTag level={part.level} /> : null}
      </div>

      {!part ? (
        <div className="flex flex-1 items-center justify-center p-3">
          <p className="font-readout text-xs text-text-muted">
            — select a part on Canvas 3 —
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-2">
            <div className="flex items-baseline gap-2">
              <span className="font-readout text-sm text-text">{part.name}</span>
              {part.count ? (
                <span className="font-readout text-[10px] text-text-muted">
                  ×{part.count}
                </span>
              ) : null}
              {part.comp ? (
                <span className="ml-auto font-readout text-[10px] uppercase tracking-wide text-text-muted">
                  {part.comp}
                </span>
              ) : null}
            </div>
            <div className="font-readout text-[10px] text-text-muted">
              {part.partId}
            </div>
            {part.role ? (
              <div className="mt-1 text-[11px] text-text-muted">{part.role}</div>
            ) : null}
          </div>

          <dl className="font-readout flex flex-col gap-1 text-xs">
            {Object.entries(part.spec).map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2">
                <dt className="shrink-0 text-text-muted">{key}</dt>
                <span
                  aria-hidden="true"
                  className="-translate-y-0.5 min-w-4 flex-1 border-b border-dotted border-border"
                />
                <dd className="shrink-0 tabular-nums text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

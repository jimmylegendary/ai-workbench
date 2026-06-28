"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { worktree } from "@/features/simulation/model/fixtures/worktree";
import { BranchBar } from "./BranchBar";
import { DiffView } from "./DiffView";
import { HistoryList } from "./HistoryList";

/**
 * Bottom strip of the Simulation screen: the git-like work-tree.
 * Composes BranchBar + a row of the three canvas subtrees (with dirty markers)
 * + DiffView + HistoryList. Compact, dense, instrument-like.
 *
 * Cross-canvas: the selected subtree/diff target drives the shared
 * `selection.canvas`, so clicking here focuses the matching canvas (cyan =
 * text-accent / ring-2 ring-accent), and the current canvas is highlighted here.
 */
export function WorkTreeView() {
  const selectedCanvas = useWorkbenchStore((s) => s.selection.canvas);
  const select = useWorkbenchStore((s) => s.select);

  // head ref is interaction state; committed branch data is server-owned.
  const [head, setHead] = useState(worktree.head);

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface text-text">
      <BranchBar
        branches={worktree.branches}
        head={head}
        onSwitch={setHead}
        onCreateBranch={() => {
          /* stub — opens branch dialog once WorkTreeService is wired */
        }}
      />

      {/* Three-subtree row with dirty markers */}
      <div className="flex items-stretch gap-2 border-b border-border px-2 py-1.5">
        {worktree.subtrees.map((t) => {
          const active = selectedCanvas === t.canvas;
          return (
            <button
              key={t.canvas}
              type="button"
              onClick={() => select({ canvas: t.canvas })}
              title={`${t.path}${t.dirty ? ` · ${t.changes} change(s)` : " · clean"}`}
              className={cn(
                "flex flex-1 items-center justify-between gap-2 rounded-[var(--radius-sm)] border px-2 py-1 text-left",
                "transition-colors duration-150",
                active
                  ? "border-accent bg-accent/15 ring-2 ring-accent"
                  : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "font-readout text-xs",
                    t.dirty ? "text-warning" : "text-success",
                  )}
                >
                  {t.dirty ? "●" : "✓"}
                </span>
                <span className="font-readout text-xs text-text">{t.label}</span>
                <span className="font-readout text-[10px] uppercase text-text-muted">
                  {t.canvas}
                </span>
              </span>
              {t.dirty ? (
                <Badge tone="warning">{t.changes} Δ</Badge>
              ) : (
                <Badge tone="success">clean</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Diff + history, side by side */}
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
        <DiffView
          from={worktree.diffRange.from}
          to={worktree.diffRange.to}
          diff={worktree.diff}
          selectedCanvas={selectedCanvas}
          onSelect={(target) => select({ canvas: target })}
        />
        <HistoryList commits={worktree.commits} />
      </div>
    </section>
  );
}

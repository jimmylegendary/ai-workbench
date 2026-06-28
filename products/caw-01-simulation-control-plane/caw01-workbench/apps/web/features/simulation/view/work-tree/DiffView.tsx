"use client";

import { cn } from "@/lib/utils";
import type {
  DiffEntry,
  DiffOp,
  WorkTreeCanvasId,
} from "@/features/simulation/model/fixtures/worktree";

const OP_MARK: Record<DiffOp, string> = {
  added: "+",
  modified: "~",
  removed: "-",
};

const OP_COLOR: Record<DiffOp, string> = {
  added: "text-success",
  modified: "text-warning",
  removed: "text-danger",
};

const CANVAS_LABEL: Record<WorkTreeCanvasId, string> = {
  c1: "workload",
  c2: "serving",
  c3: "hardware",
};

/**
 * ref↔ref change list, rendered in font-readout. Each row leads with a
 * +/~/- mark (text) plus color so the op is readable without hue.
 * `onSelect` lets the strip jump the matching canvas into focus.
 */
export function DiffView(props: {
  from: string;
  to: string;
  diff: DiffEntry[];
  onSelect?: (target: WorkTreeCanvasId) => void;
  selectedCanvas?: WorkTreeCanvasId;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
          diff
        </h3>
        <span className="font-readout text-[11px] text-text-muted">
          {props.from} → {props.to}
        </span>
      </div>

      {props.diff.length === 0 ? (
        <p className="px-2 py-2 font-readout text-xs text-text-muted">
          — no changes —
        </p>
      ) : (
        <ul className="min-h-0 overflow-auto py-1">
          {props.diff.map((d, i) => {
            const active = props.selectedCanvas === d.target;
            return (
              <li key={`${d.target}-${i}`}>
                <button
                  type="button"
                  onClick={() => props.onSelect?.(d.target)}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-2 py-0.5 text-left font-readout text-xs",
                    "transition-colors duration-150 hover:bg-surface-muted",
                    active && "bg-accent/15 ring-2 ring-accent",
                  )}
                >
                  <span aria-hidden className={cn("w-2 shrink-0", OP_COLOR[d.op])}>
                    {OP_MARK[d.op]}
                  </span>
                  <span className="w-16 shrink-0 text-text-muted">
                    {CANVAS_LABEL[d.target]}
                  </span>
                  <span className="truncate text-text">{d.summary}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

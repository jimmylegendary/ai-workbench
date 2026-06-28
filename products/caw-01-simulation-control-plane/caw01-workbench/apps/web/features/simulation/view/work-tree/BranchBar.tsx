"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Branch } from "@/features/simulation/model/fixtures/worktree";

/**
 * Branch switcher for the work-tree strip: current head + the branch list +
 * a "+ branch" stub. Clean/dirty is carried by text (✓ / ●) AND color
 * (text-success / text-warning) so hue is never the only signal.
 */
export function BranchBar(props: {
  branches: Branch[];
  /** name of the checked-out branch */
  head: string;
  onSwitch?: (name: string) => void;
  /** "+ branch" stub — wiring lands with WorkTreeService */
  onCreateBranch?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
        branch
      </span>

      <ul className="flex items-center gap-1">
        {props.branches.map((b) => {
          const active = b.name === props.head;
          return (
            <li key={b.name}>
              <button
                type="button"
                onClick={() => props.onSwitch?.(b.name)}
                aria-pressed={active}
                title={`${b.name} @ ${b.head}${b.dirty ? " (dirty)" : " (clean)"}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs",
                  "transition-colors duration-150",
                  active
                    ? "bg-accent/15 text-accent ring-2 ring-accent"
                    : "text-text hover:bg-surface-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "font-readout",
                    b.dirty ? "text-warning" : "text-success",
                  )}
                >
                  {b.dirty ? "●" : "✓"}
                </span>
                <span className="font-readout">{b.name}</span>
                <span className="font-readout text-[10px] text-text-muted">
                  {b.head}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button
        variant="ghost"
        className="ml-auto px-2 py-0.5 text-xs"
        onClick={props.onCreateBranch}
        title="create branch (stub)"
      >
        + branch
      </Button>
    </div>
  );
}

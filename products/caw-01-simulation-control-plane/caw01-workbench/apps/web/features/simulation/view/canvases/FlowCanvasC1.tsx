"use client";

import { useMemo, useState } from "react";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { useWorkloadStore } from "@/features/workload/store";
import { TurnGraph } from "@/features/workload/view/TurnGraph";
import { TurnTimeline } from "@/features/workload/view/TurnTimeline";
import { CanvasFrame } from "../CanvasFrame";
import { cn } from "@/lib/utils";

/**
 * Canvas 1 — AI workload flow. Renders the WORKLOAD store's currently selected
 * agent turn as a step DAG (kind-colored tiles, exec badges, duration/token
 * readouts) via the shared <TurnGraph>. The turn/step selection is the single
 * source of truth held by useWorkloadStore; the C1 rail (WorkloadPanel) loads
 * traces and picks the turn. Read-only instrument layout (mirrors C2).
 */
export function FlowCanvasC1() {
  const selection = useWorkbenchStore((s) => s.selection);
  const select = useWorkbenchStore((s) => s.select);

  const sessions = useWorkloadStore((s) => s.sessions);
  const activeSessionId = useWorkloadStore((s) => s.activeSessionId);
  const activeTurnId = useWorkloadStore((s) => s.activeTurnId);
  const selectedStepId = useWorkloadStore((s) => s.selectedStepId);
  const selectStep = useWorkloadStore((s) => s.selectStep);

  const selectedTurn = useMemo(() => {
    const sess = sessions.find((x) => x.id === activeSessionId);
    return sess?.turns.find((t) => t.id === activeTurnId) ?? null;
  }, [sessions, activeSessionId, activeTurnId]);

  const [view, setView] = useState<"graph" | "timeline">("graph");

  return (
    <CanvasFrame
      title="C1 · AI workload flow"
      focused={selection.canvas === "c1"}
      onActivate={() => select({ canvas: "c1" })}
    >
      {selectedTurn ? (
        <div className="flex h-full min-h-0 flex-col bg-canvas-bg">
          <div className="flex shrink-0 items-center gap-1 border-b border-canvas-grid px-2 py-1">
            {(["graph", "timeline"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] capitalize transition-colors",
                  view === v
                    ? "bg-surface-muted font-medium text-text"
                    : "text-canvas-muted hover:text-canvas-text",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {view === "graph" ? (
              <TurnGraph
                key={selectedTurn.id}
                turn={selectedTurn}
                selectedStepId={selectedStepId}
                onSelectStep={selectStep}
              />
            ) : (
              <TurnTimeline
                turn={selectedTurn}
                selectedStepId={selectedStepId}
                onSelectStep={selectStep}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center bg-canvas-bg p-4 text-sm text-canvas-muted">
          Load a workload trace in the panel →
        </div>
      )}
    </CanvasFrame>
  );
}

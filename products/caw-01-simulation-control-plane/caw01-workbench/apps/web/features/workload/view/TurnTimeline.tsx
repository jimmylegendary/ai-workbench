"use client";

import { useMemo } from "react";
import type { AgentStep, AgentTurn, StepKind } from "@caw/core";
import { cn } from "@/lib/utils";

/** Step-kind → categorical bar hue. Each kind (incl. server) has its own hue,
 *  and every row also carries the kind as TEXT — hue is never the sole signal. */
const kindBar: Record<StepKind, string> = {
  io: "bg-cat-io",
  router: "bg-cat-router",
  llm: "bg-cat-llm",
  tool: "bg-cat-tool",
  memory: "bg-cat-memory",
  server: "bg-cat-server",
};
const kindText: Record<StepKind, string> = {
  io: "text-cat-io",
  router: "text-cat-router",
  llm: "text-cat-llm",
  tool: "text-cat-tool",
  memory: "text-cat-memory",
  server: "text-cat-server",
};
const ALL_KINDS: StepKind[] = ["io", "router", "llm", "tool", "memory", "server"];

type Row = { step: AgentStep; leftPct: number; widthPct: number };

/**
 * Compute each step's [left%, width%] within the turn window. Uses startedAt +
 * durationMs when any timestamps exist; otherwise falls back to a sequential
 * layout (cumulative durations, min 1ms each) so the GANTT always renders.
 */
function layout(steps: AgentStep[]): Row[] {
  const haveTs = steps.some((s) => s.startedAt && !Number.isNaN(Date.parse(s.startedAt)));

  if (haveTs) {
    const spans = steps.map((s) => {
      const start =
        s.startedAt && !Number.isNaN(Date.parse(s.startedAt))
          ? Date.parse(s.startedAt)
          : null;
      const dur = s.durationMs ?? 0;
      return { s, start, dur };
    });
    const starts = spans.filter((x) => x.start != null).map((x) => x.start!);
    const w0 = Math.min(...starts);
    const w1 = Math.max(...spans.map((x) => (x.start ?? w0) + x.dur));
    const total = Math.max(w1 - w0, 1);
    return spans.map(({ s, start, dur }) => {
      const st = start ?? w0;
      return {
        step: s,
        leftPct: ((st - w0) / total) * 100,
        widthPct: Math.max((dur / total) * 100, 1.5),
      };
    });
  }

  // sequential fallback
  const durs = steps.map((s) => Math.max(s.durationMs ?? 1, 1));
  const total = durs.reduce((a, d) => a + d, 0) || 1;
  let cursor = 0;
  return steps.map((s, i) => {
    const leftPct = (cursor / total) * 100;
    const widthPct = Math.max((durs[i] / total) * 100, 1.5);
    cursor += durs[i];
    return { step: s, leftPct, widthPct };
  });
}

/**
 * Compact GANTT of a turn — one row per step, bar positioned by startedAt/
 * durationMs relative to the turn window (sequential fallback when timestamps are
 * missing). Kind-colored; click selects; the selected row is highlighted.
 */
export function TurnTimeline({
  turn,
  selectedStepId,
  onSelectStep,
}: {
  turn: AgentTurn;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}) {
  const rows = useMemo(() => layout(turn.steps), [turn.steps]);

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-text-muted">
        No steps in this turn.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 overflow-auto p-2">
      {/* kinds legend — hue is never the sole encoding */}
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[9px] text-text-muted">
        {ALL_KINDS.filter((k) => turn.steps.some((s) => s.kind === k)).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", kindBar[k])} />
            <span className={kindText[k]}>{k}</span>
          </span>
        ))}
      </div>
      {rows.map(({ step, leftPct, widthPct }) => {
        const isSel = step.id === selectedStepId;
        const isErr = step.status === "error";
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelectStep(step.id)}
            title={`${step.name} · ${step.kind}${step.durationMs != null ? ` · ${step.durationMs} ms` : ""}`}
            className={cn(
              "grid grid-cols-[9rem_1fr] items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left transition-colors",
              isSel ? "bg-surface-muted ring-1 ring-accent" : "hover:bg-surface-muted",
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "shrink-0 font-readout text-[9px] font-semibold uppercase tracking-wide",
                  kindText[step.kind],
                )}
              >
                {step.kind}
              </span>
              <span className="truncate font-readout text-[11px] text-text">
                {step.name}
              </span>
            </span>
            <span className="relative block h-3 w-full rounded-[var(--radius-sm)] bg-surface-muted">
              <span
                className={cn(
                  "absolute inset-y-0 rounded-[var(--radius-sm)]",
                  kindBar[step.kind],
                  isErr && "ring-1 ring-danger",
                )}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

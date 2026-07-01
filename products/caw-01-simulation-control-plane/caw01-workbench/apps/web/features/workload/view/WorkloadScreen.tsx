"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { summariseTurn, type AgentStep, type AgentTurn, type TurnSummary } from "@caw/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkloadStore } from "../store";
import { TurnGraph } from "./TurnGraph";
import { StepInspector } from "./StepInspector";
import { TurnTimeline } from "./TurnTimeline";

/**
 * Workload — agent-trace viewer (client island). Three panes:
 *  LEFT   session loader (file / example) + the turn list.
 *  CENTER the selected turn as a Graph or Timeline, plus a summary header.
 *  RIGHT  the selected step's inspector.
 * Store (A1) is the single source of truth; the graph/timeline/inspector (A2)
 * are pure views driven by selectedStepId + onSelectStep.
 */

type ViewMode = "graph" | "timeline";

export function WorkloadScreen() {
  // Mount gate: SSR + first client render match; after mount we seed the
  // example if nothing is loaded (see settings/page.tsx idiom).
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<ViewMode>("graph");

  const session = useWorkloadStore((s) => s.session);
  const selectedTurnId = useWorkloadStore((s) => s.selectedTurnId);
  const selectedStepId = useWorkloadStore((s) => s.selectedStepId);
  const error = useWorkloadStore((s) => s.error);
  const loadFromText = useWorkloadStore((s) => s.loadFromText);
  const loadExample = useWorkloadStore((s) => s.loadExample);
  const selectTurn = useWorkloadStore((s) => s.selectTurn);
  const selectStep = useWorkloadStore((s) => s.selectStep);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !session) loadExample();
  }, [mounted, session, loadExample]);

  const selectedTurn = useMemo(
    () => session?.turns.find((t) => t.id === selectedTurnId) ?? null,
    [session, selectedTurnId],
  );
  const selectedStep = useMemo(
    () => selectedTurn?.steps.find((s) => s.id === selectedStepId) ?? null,
    [selectedTurn, selectedStepId],
  );

  if (!mounted) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Workload</h1>
        <p className="mt-4 text-sm text-text-muted">Loading trace…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* LEFT — loader + turn list ------------------------------------------ */}
      <aside className="flex w-72 min-w-64 shrink-0 flex-col border-r border-border bg-surface">
        <SessionLoader
          onFile={loadFromText}
          onExample={loadExample}
          error={error}
          source={session?.source}
        />
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <TurnList
            turns={session?.turns ?? []}
            selectedTurnId={selectedTurnId}
            onSelect={selectTurn}
          />
        </div>
      </aside>

      {/* CENTER — selected turn -------------------------------------------- */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selectedTurn ? (
          <>
            <TurnHeader
              turn={selectedTurn}
              view={view}
              onView={setView}
            />
            <div className="min-h-0 flex-1 overflow-auto p-4">
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
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-sm text-text-muted">
              {session
                ? "Select a turn to view its trace."
                : "Load a session to begin."}
            </p>
          </div>
        )}
      </main>

      {/* RIGHT — step inspector -------------------------------------------- */}
      <aside className="flex w-80 min-w-72 shrink-0 flex-col border-l border-border bg-surface">
        <div className="border-b border-border px-3 py-2">
          <h2 className="text-sm font-medium">Step inspector</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <StepInspector step={selectedStep} />
        </div>
      </aside>
    </div>
  );
}

// ── LEFT: session loader ─────────────────────────────────────────────────────
function SessionLoader({
  onFile,
  onExample,
  error,
  source,
}: {
  onFile: (text: string, filename?: string) => void;
  onExample: () => void;
  error: string | null;
  source?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onFile(text, file.name);
    // allow re-selecting the same file
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Workload</h1>
        {source ? (
          <span className="font-readout text-[10px] text-text-muted" title={source}>
            {source}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-text-muted">
        Load an agent trace (JSON) or explore the example.
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json,text/plain"
          onChange={onChange}
          className="hidden"
        />
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => inputRef.current?.click()}
        >
          Load file…
        </Button>
        <Button variant="ghost" onClick={onExample}>
          Example
        </Button>
      </div>
      {error ? (
        <Badge tone="danger">{error}</Badge>
      ) : null}
    </div>
  );
}

// ── LEFT: turn list ──────────────────────────────────────────────────────────
function TurnList({
  turns,
  selectedTurnId,
  onSelect,
}: {
  turns: AgentTurn[];
  selectedTurnId: string | null;
  onSelect: (id: string) => void;
}) {
  if (turns.length === 0) {
    return (
      <p className="px-2 py-4 text-xs text-text-muted">No turns in this session.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {turns.map((turn) => (
        <li key={turn.id}>
          <TurnRow
            turn={turn}
            active={turn.id === selectedTurnId}
            onSelect={() => onSelect(turn.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function TurnRow({
  turn,
  active,
  onSelect,
}: {
  turn: AgentTurn;
  active: boolean;
  onSelect: () => void;
}) {
  const summary: TurnSummary = turn.summary ?? summariseTurn(turn.steps);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-accent bg-accent/10"
          : "border-transparent hover:bg-surface-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">
          <span className="mr-1.5 font-readout text-xs text-text-muted">
            #{turn.index + 1}
          </span>
          {turn.label ?? "turn"}
        </span>
        <StatusBadge status={summary.status} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 font-readout text-[10px] text-text-muted">
        <MiniStat label="steps" value={summary.stepCount} />
        <MiniStat label="tool" value={summary.toolCalls} />
        <MiniStat label="server" value={summary.serverCalls} />
        {summary.tokensIn != null || summary.tokensOut != null ? (
          <MiniStat
            label="tok"
            value={`${summary.tokensIn ?? 0}/${summary.tokensOut ?? 0}`}
          />
        ) : null}
        {summary.totalMs != null ? (
          <MiniStat label="" value={fmtMs(summary.totalMs)} />
        ) : null}
      </div>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-surface-muted px-1.5 py-0.5">
      {label ? <span className="text-text-muted">{label}</span> : null}
      <span className="tabular-nums text-text">{value}</span>
    </span>
  );
}

// ── CENTER: turn header (summary + view toggle) ──────────────────────────────
function TurnHeader({
  turn,
  view,
  onView,
}: {
  turn: AgentTurn;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  const summary: TurnSummary = turn.summary ?? summariseTurn(turn.steps);
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
      <h2 className="text-sm font-semibold">
        <span className="mr-1.5 font-readout text-xs text-text-muted">
          #{turn.index + 1}
        </span>
        {turn.label ?? "turn"}
      </h2>
      <StatusBadge status={summary.status} />
      <span className="font-readout text-xs text-text-muted">
        {summary.stepCount} step{summary.stepCount === 1 ? "" : "s"} ·{" "}
        {summary.toolCalls} tool · {summary.serverCalls} server
        {summary.totalMs != null ? ` · ${fmtMs(summary.totalMs)}` : ""}
        {summary.tokensIn != null || summary.tokensOut != null
          ? ` · ${summary.tokensIn ?? 0}/${summary.tokensOut ?? 0} tok`
          : ""}
      </span>
      <div className="ml-auto">
        <ViewToggle view={view} onView={onView} />
      </div>
    </header>
  );
}

function ViewToggle({
  view,
  onView,
}: {
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  const opts: { value: ViewMode; label: string }[] = [
    { value: "graph", label: "Graph" },
    { value: "timeline", label: "Timeline" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Turn view"
      className="inline-flex rounded-[var(--radius-md)] border border-border p-0.5"
    >
      {opts.map((o) => {
        const active = o.value === view;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onView(o.value)}
            className={cn(
              "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-surface-muted text-text"
                : "text-text-muted hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── shared ───────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AgentStep["status"] | TurnSummary["status"] }) {
  const tone =
    status === "error"
      ? "danger"
      : status === "running"
        ? "running"
        : status === "ok"
          ? "success"
          : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}s`;
  return `${Math.round(ms)}ms`;
}

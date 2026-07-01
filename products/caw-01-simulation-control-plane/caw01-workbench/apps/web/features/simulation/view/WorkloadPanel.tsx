"use client";

import { useEffect, useRef, useState } from "react";
import {
  summariseTurn,
  type AgentSession,
  type AgentStep,
  type AgentTurn,
  type TurnSummary,
} from "@caw/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkloadStore } from "@/features/workload/store";
import { StepInspector } from "@/features/workload/view/StepInspector";
import {
  listServerTraces,
  readServerTrace,
  listStorageTraces,
  readStorageTrace,
} from "@/features/workload/model/serverTraceActions";
import {
  otelExamples,
  exampleJsonl,
} from "@/features/workload/model/fixtures/otel-examples";

type OtelExample = (typeof otelExamples)[number];

/** Filename stamped as `session.source` when an example is loaded. */
function exampleFilename(ex: OtelExample): string {
  return `${ex.id}.main.jsonl`;
}

/* ----------------------------------------------------------------------- *
 * WorkloadPanel — the right rail shown when the Workload / C1 tab is active.
 *
 * A compact, self-contained rail (matching the ServingOptions idiom):
 *   1. TOP — a fixed LOADER block (never shifts on load): a trace SOURCE
 *      selector (PC | Server | Supabase) + the chosen sub-loader, a Reset
 *      button, and an "Example traces" row.
 *   2. BELOW — a collapsible SESSIONS → TURNS → STEPS tree from the store.
 *   3. the selected step inspector at the bottom.
 *
 * The store (Agent 1) holds any number of loaded sessions and is the single
 * source of truth; loads funnel through loadFromText so parse failures surface
 * in the store's `error`. Nothing is loaded at startup — the tree shows an
 * empty state until an example/file is loaded, and Reset clears everything.
 * ----------------------------------------------------------------------- */

type Source = "pc" | "server" | "supabase";

const SOURCES: { v: Source; label: string }[] = [
  { v: "pc", label: "PC" },
  { v: "server", label: "Server" },
  { v: "supabase", label: "Supabase" },
];

export function WorkloadPanel() {
  const sessions = useWorkloadStore((s) => s.sessions);
  const activeSessionId = useWorkloadStore((s) => s.activeSessionId);
  const activeTurnId = useWorkloadStore((s) => s.activeTurnId);
  const selectedStepId = useWorkloadStore((s) => s.selectedStepId);
  const error = useWorkloadStore((s) => s.error);
  const loadFromText = useWorkloadStore((s) => s.loadFromText);
  const selectTurn = useWorkloadStore((s) => s.selectTurn);
  const selectStep = useWorkloadStore((s) => s.selectStep);
  const removeSession = useWorkloadStore((s) => s.removeSession);
  const reset = useWorkloadStore((s) => s.reset);

  const [source, setSource] = useState<Source>("pc");

  // Local collapse/expand state — default: the active session + turn expanded.
  const [openSessions, setOpenSessions] = useState<Set<string>>(new Set());
  const [openTurns, setOpenTurns] = useState<Set<string>>(new Set());

  // Keep the active session/turn revealed as loads/selections change (without
  // clobbering any manual collapse/expand the user has already done elsewhere).
  useEffect(() => {
    if (activeSessionId) {
      setOpenSessions((prev) =>
        prev.has(activeSessionId) ? prev : new Set(prev).add(activeSessionId),
      );
    }
  }, [activeSessionId]);
  useEffect(() => {
    if (activeTurnId) {
      setOpenTurns((prev) =>
        prev.has(activeTurnId) ? prev : new Set(prev).add(activeTurnId),
      );
    }
  }, [activeTurnId]);

  const toggleSession = (id: string) =>
    setOpenSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleTurn = (id: string) =>
    setOpenTurns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const activeTurn =
    sessions
      .find((x) => x.id === activeSessionId)
      ?.turns.find((t) => t.id === activeTurnId) ?? null;
  const selectedStep =
    activeTurn?.steps.find((s) => s.id === selectedStepId) ?? null;

  const loadedSources = new Set(
    sessions.map((s) => s.source).filter((v): v is string => v != null),
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="font-readout text-[10px] uppercase tracking-wide text-text-muted">
          Workload · trace
        </span>
        <span className="font-readout text-[10px] text-text-muted tabular-nums">
          {sessions.length} loaded
        </span>
      </div>

      {/* 1. LOADER BLOCK (always at the very top) ------------------------- */}
      <div className="shrink-0 border-b border-border p-2">
        <div className="flex items-center justify-between">
          <div
            role="tablist"
            aria-label="Trace source"
            className="inline-flex rounded-[var(--radius-md)] border border-border p-0.5"
          >
            {SOURCES.map((o) => {
              const on = o.v === source;
              return (
                <button
                  key={o.v}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSource(o.v)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-2 py-1 font-readout text-[11px] font-medium transition-colors",
                    on
                      ? "bg-surface-muted text-text"
                      : "text-text-muted hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            onClick={reset}
            disabled={sessions.length === 0 && !error}
            title="Clear all loaded sessions"
          >
            Reset
          </Button>
        </div>

        <div className="mt-2">
          {source === "pc" ? (
            <PcLoader onLoad={loadFromText} />
          ) : source === "server" ? (
            <ServerLoader onLoad={loadFromText} />
          ) : (
            <SupabaseLoader onLoad={loadFromText} />
          )}
        </div>

        {error ? (
          <div className="mt-2">
            <Badge tone="danger">{error}</Badge>
          </div>
        ) : null}

        {/* Example traces */}
        <ExampleTraces loadedSources={loadedSources} onLoad={loadFromText} />
      </div>

      {/* 2. SESSIONS TREE ------------------------------------------------- */}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-text-muted">
            No trace loaded — pick an example or load a file above.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionNode
                  session={session}
                  open={openSessions.has(session.id)}
                  onToggle={() => toggleSession(session.id)}
                  onRemove={() => removeSession(session.id)}
                  openTurns={openTurns}
                  onToggleTurn={toggleTurn}
                  activeTurnId={
                    activeSessionId === session.id ? activeTurnId : null
                  }
                  selectedStepId={selectedStepId}
                  onSelectTurn={(turnId) => selectTurn(session.id, turnId)}
                  onSelectStep={selectStep}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 3. STEP INSPECTOR ------------------------------------------------ */}
      <div className="max-h-[45%] min-h-0 shrink-0 overflow-auto border-t border-border">
        <StepInspector step={selectedStep} />
      </div>
    </div>
  );
}

/* --- example traces ------------------------------------------------------ */

function ExampleTraces({
  loadedSources,
  onLoad,
}: {
  loadedSources: Set<string>;
  onLoad: (text: string, filename?: string) => void;
}) {
  if (otelExamples.length === 0) {
    return (
      <div className="mt-2">
        <Note text="No bundled examples." />
      </div>
    );
  }
  return (
    <div className="mt-2">
      <span className="font-readout text-[10px] uppercase tracking-wide text-text-muted">
        Example traces
      </span>
      <ul className="mt-1 flex flex-col gap-1">
        {otelExamples.map((ex) => {
          const loaded = loadedSources.has(exampleFilename(ex));
          return (
            <li key={ex.id}>
              <button
                type="button"
                title={ex.description}
                onClick={() => onLoad(exampleJsonl(ex), exampleFilename(ex))}
                className={cn(
                  "w-full rounded-[var(--radius-md)] border px-2.5 py-1 text-left transition-colors",
                  loaded
                    ? "border-border bg-surface-muted"
                    : "border-transparent hover:bg-surface-muted",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-text">
                    {ex.label}
                  </span>
                  {loaded ? (
                    <span className="font-readout text-[9px] text-text-muted">
                      loaded
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate font-readout text-[10px] text-text-muted">
                  {ex.description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --- sessions tree ------------------------------------------------------- */

function SessionNode({
  session,
  open,
  onToggle,
  onRemove,
  openTurns,
  onToggleTurn,
  activeTurnId,
  selectedStepId,
  onSelectTurn,
  onSelectStep,
}: {
  session: AgentSession;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  openTurns: Set<string>;
  onToggleTurn: (id: string) => void;
  activeTurnId: string | null;
  selectedStepId: string | null;
  onSelectTurn: (turnId: string) => void;
  onSelectStep: (id: string | null) => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border">
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Chevron open={open} />
          <span className="truncate text-xs font-medium text-text">
            {session.source ?? session.id}
          </span>
          <span className="ml-auto shrink-0 font-readout text-[10px] text-text-muted tabular-nums">
            {session.turns.length} turn{session.turns.length === 1 ? "" : "s"}
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remove session"
          className="shrink-0 rounded-[var(--radius-sm)] px-1 font-readout text-xs text-text-muted hover:bg-surface-muted hover:text-text"
        >
          ×
        </button>
      </div>

      {open ? (
        session.turns.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-text-muted">No turns.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 border-t border-border p-1">
            {session.turns.map((turn) => (
              <li key={turn.id}>
                <TurnNode
                  turn={turn}
                  active={turn.id === activeTurnId}
                  open={openTurns.has(turn.id)}
                  onToggle={() => onToggleTurn(turn.id)}
                  onSelect={() => onSelectTurn(turn.id)}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function TurnNode({
  turn,
  active,
  open,
  onToggle,
  onSelect,
  selectedStepId,
  onSelectStep,
}: {
  turn: AgentTurn;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: () => void;
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
}) {
  const summary: TurnSummary = turn.summary ?? summariseTurn(turn.steps);
  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border",
        active ? "border-accent bg-accent/10" : "border-transparent",
      )}
    >
      <div className="flex items-center gap-1 px-1 py-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title={open ? "Collapse steps" : "Expand steps"}
          className="shrink-0 rounded-[var(--radius-sm)] px-0.5 text-text-muted hover:text-text"
        >
          <Chevron open={open} />
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-text">
              {turn.label ?? `turn ${turn.index + 1}`}
            </span>
            <StatusBadge status={summary.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1 font-readout text-[10px] text-text-muted">
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
      </div>

      {open ? (
        turn.steps.length === 0 ? (
          <p className="px-3 py-1 text-[11px] text-text-muted">No steps.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 px-1 pb-1">
            {turn.steps.map((step) => (
              <li key={step.id}>
                <StepRow
                  step={step}
                  selected={active && step.id === selectedStepId}
                  onSelect={() => {
                    // Activate this turn first (the inspector resolves the step
                    // from the ACTIVE turn), then select the step.
                    if (!active) onSelect();
                    onSelectStep(step.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

const kindDot: Record<AgentStep["kind"], string> = {
  io: "bg-cat-io",
  router: "bg-cat-router",
  llm: "bg-cat-llm",
  tool: "bg-cat-tool",
  memory: "bg-cat-memory",
  server: "bg-cat-server",
};

function StepRow({
  step,
  selected,
  onSelect,
}: {
  step: AgentStep;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 text-left transition-colors",
        selected
          ? "border-accent bg-accent/10"
          : "border-transparent hover:bg-surface-muted",
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", kindDot[step.kind])}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-[11px] text-text">
        {step.name}
      </span>
      {step.durationMs != null ? (
        <span className="shrink-0 font-readout text-[10px] text-text-muted tabular-nums">
          {fmtMs(step.durationMs)}
        </span>
      ) : null}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block w-3 shrink-0 text-center font-readout text-[10px] text-text-muted"
    >
      {open ? "▾" : "▸"}
    </span>
  );
}

/* --- loaders ------------------------------------------------------------- */

function PcLoader({
  onLoad,
}: {
  onLoad: (text: string, filename?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onLoad(text, file.name);
    e.target.value = ""; // allow re-selecting the same file
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept=".json,.jsonl,application/json,application/x-ndjson,text/plain"
        onChange={onChange}
        className="hidden"
      />
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => inputRef.current?.click()}
      >
        Load file…
      </Button>
      <Note text="Pick a session trace from your machine (.json / .jsonl)." />
    </div>
  );
}

function ServerLoader({
  onLoad,
}: {
  onLoad: (text: string, filename?: string) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    const res = await listServerTraces();
    setConfigured(res.configured);
    setFiles(res.files);
    setSelected(res.files[0] ?? "");
    setNote(res.error ?? null);
    setBusy(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  async function onLoadClick() {
    if (!selected) return;
    setBusy(true);
    const res = await readServerTrace(selected);
    setBusy(false);
    if (res.ok) {
      setNote(null);
      onLoad(res.text, selected);
    } else {
      setNote(res.error);
    }
  }

  if (!configured) {
    return <Note text="Set WORKLOAD_TRACE_DIR to serve trace files from disk." />;
  }

  return (
    <div className="space-y-1">
      <FilePicker
        files={files}
        value={selected}
        onChange={setSelected}
        emptyLabel="No traces in WORKLOAD_TRACE_DIR"
      />
      <div className="flex gap-1">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy || !selected}
          onClick={onLoadClick}
        >
          Load
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
          ↻
        </Button>
      </div>
      {note ? <Note text={note} /> : null}
    </div>
  );
}

function SupabaseLoader({
  onLoad,
}: {
  onLoad: (text: string, filename?: string) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    const res = await listStorageTraces();
    setConfigured(res.configured);
    setFiles(res.files);
    setSelected(res.files[0] ?? "");
    setNote(res.error ?? null);
    setBusy(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  async function onLoadClick() {
    if (!selected) return;
    setBusy(true);
    const res = await readStorageTrace(selected);
    setBusy(false);
    if (res.ok) {
      setNote(null);
      onLoad(res.text, selected);
    } else {
      setNote(res.error);
    }
  }

  if (!configured) {
    return (
      <Note text="Supabase not configured (local mode) — add env + a workload-traces bucket." />
    );
  }

  return (
    <div className="space-y-1">
      <FilePicker
        files={files}
        value={selected}
        onChange={setSelected}
        emptyLabel="No traces in the bucket"
      />
      <div className="flex gap-1">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy || !selected}
          onClick={onLoadClick}
        >
          Load
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
          ↻
        </Button>
      </div>
      {note ? <Note text={note} /> : null}
    </div>
  );
}

function FilePicker({
  files,
  value,
  onChange,
  emptyLabel,
}: {
  files: string[];
  value: string;
  onChange: (v: string) => void;
  emptyLabel: string;
}) {
  if (files.length === 0) {
    return <Note text={emptyLabel} />;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-1.5 py-1 font-readout text-[11px] text-text"
    >
      {files.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );
}

function Note({ text }: { text: string }) {
  return <p className="font-readout text-[10px] text-text-muted">{text}</p>;
}

/* --- shared bits --------------------------------------------------------- */

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-surface-muted px-1.5 py-0.5">
      {label ? <span className="text-text-muted">{label}</span> : null}
      <span className="tabular-nums text-text">{value}</span>
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: AgentStep["status"] | TurnSummary["status"];
}) {
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
  if (ms >= 1000)
    return `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}s`;
  return `${Math.round(ms)}ms`;
}

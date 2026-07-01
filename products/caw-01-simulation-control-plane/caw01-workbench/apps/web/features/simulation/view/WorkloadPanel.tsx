"use client";

import { useEffect, useRef, useState } from "react";
import {
  summariseTurn,
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

/* ----------------------------------------------------------------------- *
 * WorkloadPanel — the right rail shown when the Workload / C1 tab is active.
 *
 * A compact, self-contained rail (matching the ServingOptions idiom) with:
 *   1. a trace SOURCE selector (PC | Server | Supabase),
 *   2. the loader for the chosen source,
 *   3. the turn list (from the shared Workload store),
 *   4. the selected step inspector below.
 *
 * The store (Agent 1) is the single source of truth; loads funnel through
 * loadFromText so parse failures surface in the store's `error`. Server/Supabase
 * reads go through server actions that never throw — their messages land in a
 * small local note.
 * ----------------------------------------------------------------------- */

type Source = "pc" | "server" | "supabase";

const SOURCES: { v: Source; label: string }[] = [
  { v: "pc", label: "PC" },
  { v: "server", label: "Server" },
  { v: "supabase", label: "Supabase" },
];

export function WorkloadPanel() {
  const session = useWorkloadStore((s) => s.session);
  const selectedTurnId = useWorkloadStore((s) => s.selectedTurnId);
  const selectedStepId = useWorkloadStore((s) => s.selectedStepId);
  const error = useWorkloadStore((s) => s.error);
  const loadFromText = useWorkloadStore((s) => s.loadFromText);
  const loadExample = useWorkloadStore((s) => s.loadExample);
  const selectTurn = useWorkloadStore((s) => s.selectTurn);
  const selectStep = useWorkloadStore((s) => s.selectStep);

  const [source, setSource] = useState<Source>("pc");

  // Seed the bundled example once if nothing has been loaded yet.
  useEffect(() => {
    if (!session) loadExample();
  }, [session, loadExample]);

  const selectedTurn = session?.turns.find((t) => t.id === selectedTurnId) ?? null;
  const selectedStep =
    selectedTurn?.steps.find((s) => s.id === selectedStepId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="font-readout text-[10px] uppercase tracking-wide text-text-muted">
          Workload · trace
        </span>
        {session?.source ? (
          <span
            className="font-readout text-[10px] text-text-muted"
            title={session.source}
          >
            {session.source}
          </span>
        ) : null}
      </div>

      {/* SOURCE selector -------------------------------------------------- */}
      <div className="shrink-0 border-b border-border p-2">
        <div
          role="tablist"
          aria-label="Trace source"
          className="inline-flex w-full rounded-[var(--radius-md)] border border-border p-0.5"
        >
          {SOURCES.map((o) => {
            const active = o.v === source;
            return (
              <button
                key={o.v}
                role="tab"
                aria-selected={active}
                onClick={() => setSource(o.v)}
                className={cn(
                  "flex-1 rounded-[var(--radius-sm)] px-2 py-1 font-readout text-[11px] font-medium transition-colors",
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
      </div>

      {/* TURN LIST -------------------------------------------------------- */}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <TurnList
          turns={session?.turns ?? []}
          selectedTurnId={selectedTurnId}
          onSelect={selectTurn}
        />
      </div>

      {/* STEP INSPECTOR --------------------------------------------------- */}
      <div className="max-h-[45%] min-h-0 shrink-0 overflow-auto border-t border-border">
        <StepInspector step={selectedStep} />
      </div>
    </div>
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

/* --- turn list ----------------------------------------------------------- */

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

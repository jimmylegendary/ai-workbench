"use client";

import { useState, type ReactNode } from "react";
import type { AgentStep, StepStatus } from "@caw/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  asSideRef,
  type SideRef,
  type SideResult,
} from "@/features/workload/model/sideFiles";

const statusTone: Record<StepStatus, "success" | "danger" | "running" | "neutral"> = {
  ok: "success",
  error: "danger",
  running: "running",
  unknown: "neutral",
};

const kindDot: Record<AgentStep["kind"], string> = {
  io: "bg-cat-io",
  router: "bg-cat-router",
  llm: "bg-cat-llm",
  tool: "bg-cat-tool",
  memory: "bg-cat-memory",
  server: "bg-cat-server",
};

/** Guarded pretty-print — never throws on cyclic/odd values. */
function pretty(value: unknown): string {
  try {
    const s = JSON.stringify(value, null, 2);
    return s ?? String(value);
  } catch {
    return String(value);
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="text-right font-readout text-xs text-text">{children}</span>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>
      <pre className="max-h-56 overflow-auto rounded-[var(--radius-sm)] border border-border bg-surface-muted p-2 font-readout text-[11px] leading-relaxed text-text">
        {pretty(value)}
      </pre>
    </div>
  );
}

/** The four side-file refs a step may carry, in display order. */
const SIDE_REFS: { metaKey: string; label: string }[] = [
  { metaKey: "raw_ref", label: "raw messages" },
  { metaKey: "token_ids_ref", label: "token ids" },
  { metaKey: "hash_ref", label: "hash blocks" },
  { metaKey: "tool_ref", label: "tool io" },
];

/** Compact per-ref count summary for the row header. */
function refCounts(metaKey: string, ref: SideRef): string {
  switch (metaKey) {
    case "raw_ref":
      return `${ref.message_count ?? "?"} msgs · ${ref.chars ?? "?"} chars`;
    case "token_ids_ref":
      return `${ref.prompt_count ?? "?"} prompt · ${ref.out_count ?? "?"} out`;
    case "hash_ref":
      return `${ref.n_blocks ?? "?"} blocks`;
    case "tool_ref":
      return `${ref.input_chars ?? "?"} in · ${ref.output_chars ?? "?"} out chars`;
    default:
      return "";
  }
}

type LoadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: SideResult };

/** Render a loaded side row readably — messages / tool io / arrays / fallback. */
function SideData({ data, note }: { data: Record<string, unknown>; note?: string }) {
  const messages = Array.isArray(data.messages) ? data.messages : null;
  const hasToolIo = "input" in data || "output" in data;
  return (
    <div className="space-y-2">
      {note ? (
        <p className="font-readout text-[10px] italic text-text-muted">{note}</p>
      ) : null}

      {messages ? (
        <div className="space-y-1.5">
          {messages.map((m, i) => {
            const rec = (typeof m === "object" && m !== null ? m : {}) as Record<
              string,
              unknown
            >;
            const role = typeof rec.role === "string" ? rec.role : "message";
            const content =
              typeof rec.content === "string" ? rec.content : pretty(rec.content);
            return (
              <div key={i} className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">
                  {role}
                </span>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-border bg-surface-muted p-2 font-readout text-[11px] leading-relaxed text-text">
                  {content}
                </pre>
              </div>
            );
          })}
          {typeof data.output_text === "string" ? (
            <JsonBlock label="output_text" value={data.output_text} />
          ) : null}
        </div>
      ) : hasToolIo ? (
        <div className="space-y-1.5">
          <JsonBlock label="input" value={data.input} />
          <JsonBlock label="output" value={data.output} />
        </div>
      ) : (
        <JsonBlock label="data" value={data} />
      )}
    </div>
  );
}

/** One collapsible ref row with a Load button + loading/error/data states. */
function SideRefRow({
  metaKey,
  label,
  sideRef,
  onResolveRef,
}: {
  metaKey: string;
  label: string;
  sideRef: SideRef;
  onResolveRef?: (ref: SideRef) => Promise<SideResult>;
}) {
  const [state, setState] = useState<LoadState>({ phase: "idle" });

  async function load() {
    if (!onResolveRef) return;
    setState({ phase: "loading" });
    const result = await onResolveRef(sideRef);
    setState({ phase: "done", result });
  }

  const loading = state.phase === "loading";

  return (
    <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-medium text-text">{label}</span>
          <span className="ml-1.5 font-readout text-[10px] text-text-muted">
            {refCounts(metaKey, sideRef)}
          </span>
          <span className="block truncate font-readout text-[10px] text-text-muted">
            {sideRef.file} · {sideRef.key}
          </span>
        </div>
        <Button
          variant="secondary"
          className="shrink-0 px-2 py-1 text-[11px]"
          disabled={loading || !onResolveRef}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : state.phase === "done" ? "Reload" : "Load"}
        </Button>
      </div>

      {!onResolveRef ? (
        <p className="font-readout text-[10px] text-text-muted">
          No resolver available for this session.
        </p>
      ) : null}

      {state.phase === "done" ? (
        state.result.ok ? (
          <SideData data={state.result.data} note={state.result.note} />
        ) : (
          <p className="font-readout text-[11px] leading-relaxed text-danger">
            {state.result.error}
          </p>
        )
      ) : null}
    </div>
  );
}

/**
 * Details panel for the selected step — kind + name + status badges, exec
 * location, timing, tokens/cost, and pretty-printed args/result. Present
 * side-file refs get a lazy Load button (never fetched eagerly). Empty state
 * when nothing is selected.
 */
export function StepInspector({
  step,
  onResolveRef,
}: {
  step: AgentStep | null;
  onResolveRef?: (ref: SideRef) => Promise<SideResult>;
}) {
  if (!step) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-muted">
        Select a step to inspect its inputs, outputs and timing.
      </div>
    );
  }

  const hasTokens =
    step.tokensIn != null || step.tokensOut != null || step.costUsd != null;

  const meta = step.meta ?? {};
  const sideRefs = SIDE_REFS.map(({ metaKey, label }) => ({
    metaKey,
    label,
    ref: asSideRef(meta[metaKey]),
  })).filter(
    (x): x is { metaKey: string; label: string; ref: SideRef } => x.ref !== null,
  );

  return (
    <div className="flex flex-col gap-4 overflow-auto p-4">
      {/* header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("h-2.5 w-2.5 rounded-full", kindDot[step.kind])}
          />
          <span className="font-readout text-sm text-text">{step.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{step.kind}</Badge>
          {typeof (step.meta as { model?: unknown } | undefined)?.model === "string" && (
            <Badge tone="neutral">{(step.meta as { model: string }).model}</Badge>
          )}
          <Badge tone={statusTone[step.status]}>{step.status}</Badge>
          {step.execLocation && <Badge tone="neutral">{step.execLocation}</Badge>}
        </div>
      </div>

      {/* meta / timing */}
      <div className="border-t border-border pt-1">
        <Field label="id">{step.id}</Field>
        {step.parentId && <Field label="parent">{step.parentId}</Field>}
        {step.startedAt && <Field label="started">{step.startedAt}</Field>}
        {step.endedAt && <Field label="ended">{step.endedAt}</Field>}
        {step.durationMs != null && <Field label="duration">{step.durationMs} ms</Field>}
      </div>

      {hasTokens && (
        <div className="border-t border-border pt-1">
          {step.tokensIn != null && <Field label="tokens in">{step.tokensIn}</Field>}
          {step.tokensOut != null && <Field label="tokens out">{step.tokensOut}</Field>}
          {step.costUsd != null && (
            <Field label="cost">${step.costUsd.toFixed(4)}</Field>
          )}
        </div>
      )}

      {sideRefs.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <span className="text-[11px] uppercase tracking-wide text-text-muted">
            side files
          </span>
          {sideRefs.map(({ metaKey, label, ref }) => (
            <SideRefRow
              // Identity-bearing key → remount (reset load state) when the
              // selected step changes, so a row never shows another step's payload.
              key={`${metaKey}:${ref.file}:${ref.key}`}
              metaKey={metaKey}
              label={label}
              sideRef={ref}
              onResolveRef={onResolveRef}
            />
          ))}
        </div>
      )}

      {step.args != null && (
        <div className="border-t border-border pt-3">
          <JsonBlock label="args" value={step.args} />
        </div>
      )}
      {step.result != null && (
        <div className={cn(step.args == null && "border-t border-border pt-3")}>
          <JsonBlock label="result" value={step.result} />
        </div>
      )}
      {step.meta != null && (
        <div>
          <JsonBlock label="meta" value={step.meta} />
        </div>
      )}
    </div>
  );
}

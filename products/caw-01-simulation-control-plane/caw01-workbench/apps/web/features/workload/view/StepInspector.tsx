"use client";

import type { ReactNode } from "react";
import type { AgentStep, StepStatus } from "@caw/core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

/**
 * Details panel for the selected step — kind + name + status badges, exec
 * location, timing, tokens/cost, and pretty-printed args/result. Empty state
 * when nothing is selected.
 */
export function StepInspector({ step }: { step: AgentStep | null }) {
  if (!step) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-muted">
        Select a step to inspect its inputs, outputs and timing.
      </div>
    );
  }

  const hasTokens =
    step.tokensIn != null || step.tokensOut != null || step.costUsd != null;

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

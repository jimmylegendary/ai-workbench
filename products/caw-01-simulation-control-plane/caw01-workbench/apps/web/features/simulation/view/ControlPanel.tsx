"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AxisStatus } from "@caw/core";
import { ProjectionReadout } from "./ProjectionReadout";

/** A single comparable metric in the projection readout. */
export type ProjectionRow = { name: string; value: string; unit?: string };

/** One evidence pointer backing a claim (ref is a run_id/uri, never free text). */
export type EvidenceRow = {
  label: string;
  boundary: "public" | "internal" | "confidential";
  trust: 0 | 1 | 2 | 3;
  ref: string;
};

const AXES: AxisStatus["axis"][] = ["real", "synthetic", "sim"];

type Tone = "neutral" | "running" | "success" | "danger" | "warning";

function toneFor(status: string): Tone {
  switch (status) {
    case "running":
      return "running";
    case "succeeded":
      return "success";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

/** Boundary → Badge tone. Color is always paired with the boundary text below
 * (color-blind-safe per DESIGN.md anti-patterns). */
function boundaryTone(boundary: EvidenceRow["boundary"]): Tone {
  switch (boundary) {
    case "public":
      return "success";
    case "internal":
      return "warning";
    case "confidential":
      return "danger";
  }
}

/**
 * Left "1" of the 1:9 split. Pure View: renders VM state, raises VM intents.
 * No data access here (app-architecture-mvvm.md).
 */
export function ControlPanel(props: {
  perAxis: AxisStatus[];
  dirty: boolean;
  isRunning: boolean;
  projection: ProjectionRow[];
  evidence: EvidenceRow[];
  onRun: () => void;
  onStop: () => void;
  onSaveItem: () => void;
  onSaveAll: () => void;
}) {
  const byAxis = (axis: string): string =>
    props.perAxis.find((x) => x.axis === axis)?.status ?? "queued";

  const nextHint = props.isRunning
    ? "Running… Stop to cancel."
    : props.dirty
      ? "Unsaved changes — Save item or Save full."
      : "Next: compose an experiment, then Run. (honest-next-step)";

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* RunControls */}
      <div className="flex gap-2">
        <Button onClick={props.onRun} disabled={props.isRunning}>
          Run
        </Button>
        <Button
          variant="secondary"
          onClick={props.onStop}
          disabled={!props.isRunning}
        >
          Stop
        </Button>
      </div>

      {/* RunStatus — per-axis */}
      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-2">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Run status
        </h3>
        <ul className="space-y-1">
          {AXES.map((axis) => {
            const status = byAxis(axis);
            const running = status === "running";
            return (
              <li
                key={axis}
                className="flex items-center justify-between text-sm"
              >
                <span
                  className={cn(
                    "font-readout",
                    running && "text-accent animate-pulse",
                  )}
                >
                  {axis}
                </span>
                <Badge tone={toneFor(status)}>{status}</Badge>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ProjectionReadout */}
      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-2">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Projection
        </h3>
        <ProjectionReadout projection={props.projection} />
      </section>

      {/* Evidence */}
      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-2">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Evidence
        </h3>
        {props.evidence.length === 0 ? (
          <p className="font-readout text-xs text-text-muted">— none —</p>
        ) : (
          <ul className="space-y-1.5">
            {props.evidence.map((ev) => (
              <li
                key={`${ev.ref}:${ev.label}`}
                className="flex items-center gap-2 text-xs"
              >
                <Badge tone={boundaryTone(ev.boundary)}>{ev.boundary}</Badge>
                <span className="min-w-0 truncate text-text" title={ev.label}>
                  {ev.label}
                </span>
                <span className="ml-auto shrink-0 font-readout text-text-muted">
                  T{ev.trust}
                </span>
                <span
                  className="max-w-32 shrink-0 truncate font-readout text-text-muted"
                  title={ev.ref}
                >
                  {ev.ref}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* SaveControls */}
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={props.onSaveItem}>
          Save item
        </Button>
        <Button variant="secondary" onClick={props.onSaveAll}>
          Save full
        </Button>
        {props.dirty && (
          <span
            className="ml-auto inline-block h-2 w-2 rounded-full bg-warning"
            title="unsaved changes"
            aria-label="unsaved changes"
          />
        )}
      </div>

      {/* NextActionHint */}
      <p className="text-xs text-text-muted">{nextHint}</p>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AxisStatus } from "@caw/core";

const AXES: AxisStatus["axis"][] = ["real", "synthetic", "sim"];

function toneFor(status: string) {
  switch (status) {
    case "running":
      return "running" as const;
    case "succeeded":
      return "success" as const;
    case "failed":
      return "danger" as const;
    default:
      return "neutral" as const;
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
  onRun: () => void;
  onStop: () => void;
  onSaveItem: () => void;
  onSaveAll: () => void;
}) {
  const byAxis = (a: string) =>
    props.perAxis.find((x) => x.axis === a)?.status ?? "queued";

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* RunControls */}
      <div className="flex gap-2">
        <Button onClick={props.onRun} disabled={props.isRunning}>
          Run
        </Button>
        <Button variant="secondary" onClick={props.onStop} disabled={!props.isRunning}>
          Stop
        </Button>
        <Button variant="ghost">Configure</Button>
      </div>

      {/* RunStatus — per-axis */}
      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-2">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Run status
        </h3>
        <ul className="space-y-1">
          {AXES.map((axis) => (
            <li key={axis} className="flex items-center justify-between text-sm">
              <span className="font-readout">{axis}</span>
              <Badge tone={toneFor(byAxis(axis))}>{byAxis(axis)}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* ProjectionReadout (stub) */}
      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-2">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Projection
        </h3>
        <pre className="font-readout text-xs text-text-muted">— no run yet —</pre>
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
          <span className="ml-auto inline-block h-2 w-2 rounded-full bg-warning" title="unsaved changes" />
        )}
      </div>

      {/* NextActionHint */}
      <p className="text-xs text-text-muted">
        Next: compose an experiment, then Run. (honest-next-step)
      </p>
    </div>
  );
}

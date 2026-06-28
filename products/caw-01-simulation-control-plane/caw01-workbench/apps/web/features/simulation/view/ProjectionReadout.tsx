"use client";

import type { ProjectionRow } from "./ControlPanel";

/**
 * Compact mono metric block (the "comparable readout"). Renders each
 * ProjectionRow as `name … value unit`, tabular-aligned via .font-readout.
 * Pure View (app-architecture-mvvm.md): no data access, no intents.
 */
export function ProjectionReadout({
  projection,
}: {
  projection: ProjectionRow[];
}) {
  if (projection.length === 0) {
    return (
      <pre className="font-readout text-xs text-text-muted">— no run yet —</pre>
    );
  }

  return (
    <dl className="font-readout flex flex-col gap-1 text-xs">
      {projection.map((row) => (
        <div key={row.name} className="flex items-baseline gap-2">
          <dt className="shrink-0 text-text-muted">{row.name}</dt>
          {/* dotted leader keeps the readout instrument-like */}
          <span
            aria-hidden="true"
            className="-translate-y-0.5 min-w-4 flex-1 border-b border-dotted border-border"
          />
          <dd className="shrink-0 tabular-nums text-text">
            {row.value}
            {row.unit ? (
              <span className="ml-1 text-text-muted">{row.unit}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

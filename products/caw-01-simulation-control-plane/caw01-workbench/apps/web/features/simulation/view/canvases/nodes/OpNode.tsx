"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  defaultLocation,
  type HarnessFlowNode,
  type HarnessKind,
} from "@/features/simulation/model/fixtures/c1";

/**
 * Kind → CATEGORICAL color (a dedicated palette, OFF the status hues). Color
 * here encodes the harness role (io/router/llm/tool/memory), never run-state —
 * status green/amber/red/cyan stay reserved (DESIGN.md §2/§9).
 */
const kindText: Record<HarnessKind, string> = {
  io: "text-cat-io",
  router: "text-cat-router",
  llm: "text-cat-llm",
  tool: "text-cat-tool",
  memory: "text-cat-memory",
};
const kindBar: Record<HarnessKind, string> = {
  io: "bg-cat-io",
  router: "bg-cat-router",
  llm: "bg-cat-llm",
  tool: "bg-cat-tool",
  memory: "bg-cat-memory",
};

/**
 * Canvas-1 custom node = one harness step (io | router | llm | tool | memory).
 * White tile on the dark canvas; a left bar + chip carry the (categorical) kind.
 * Rings cyan when selected; a "⤢" affordance marks a drillable node.
 */
export function OpNode({ data, selected }: NodeProps<HarnessFlowNode>) {
  const loc = data.location ?? defaultLocation(data.kind);
  return (
    <div
      className={cn(
        "relative min-w-[160px] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface py-2 pl-3.5 pr-3 shadow-sm",
        selected && "ring-2 ring-accent",
      )}
    >
      {/* categorical kind accent bar */}
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", kindBar[data.kind])}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!h-2 !w-2 !border-border !bg-text-muted"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="font-readout text-xs text-text">{data.label}</span>
        {data.drillTo && (
          <span
            title="Ctrl/⌘+click to drill in"
            aria-label="drillable"
            className="font-readout text-[10px] leading-none text-text-muted"
          >
            ⤢
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-readout text-[10px] uppercase tracking-wide",
            kindText[data.kind],
          )}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          {data.kind}
        </span>
        <span
          title={`runs on ${loc}${loc === "server" ? " (via serving framework)" : ""}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-border px-1 font-readout text-[9px] uppercase text-text-muted"
        >
          <span aria-hidden>{loc === "server" ? "▤" : "▢"}</span>
          {loc}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!h-2 !w-2 !border-border !bg-primary"
      />
    </div>
  );
}

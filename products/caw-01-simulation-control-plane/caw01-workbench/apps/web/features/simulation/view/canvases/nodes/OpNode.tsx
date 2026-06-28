"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  HarnessFlowNode,
  HarnessKind,
} from "@/features/simulation/model/fixtures/c1";

/** Kind → Badge tone. Color is the only thing carrying the role distinction. */
const kindTone = {
  io: "neutral",
  router: "warning",
  llm: "running",
  tool: "success",
  memory: "danger",
} as const satisfies Record<
  HarnessKind,
  "neutral" | "running" | "success" | "danger" | "warning"
>;

/**
 * Canvas-1 custom node = one harness step (io | router | llm | tool | memory).
 * Renders the label + a kind Badge, with typed handles (left target "in",
 * right source "out"). Rings cyan when selected; if data.drillTo is set it
 * shows a subtle "⤢" affordance (Ctrl+click descends into its sub-level).
 */
export function OpNode({ data, selected }: NodeProps<HarnessFlowNode>) {
  return (
    <div
      className={cn(
        "min-w-[150px] rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 shadow-sm",
        selected && "ring-2 ring-accent",
      )}
    >
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
            title="Ctrl+click to drill in"
            aria-label="drillable"
            className="font-readout text-[10px] leading-none text-text-muted"
          >
            ⤢
          </span>
        )}
      </div>
      <div className="mt-1">
        <Badge tone={kindTone[data.kind]}>{data.kind}</Badge>
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

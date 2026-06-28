"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ServingFlowNode,
  ServingKind,
} from "@/features/simulation/model/fixtures/c2";

/** Kind → Badge tone. Color is the only thing carrying the stage distinction. */
const kindTone = {
  serving: "running",
  representation: "warning",
  simulator: "success",
} as const satisfies Record<
  ServingKind,
  "neutral" | "running" | "success" | "danger" | "warning"
>;

/**
 * Canvas-2 custom node: stage label + kind Badge, with typed handles
 * (left target "in", right source "out"). Highlights cyan when selected.
 */
export function ServingNode({ data, selected }: NodeProps<ServingFlowNode>) {
  return (
    <div
      className={cn(
        "min-w-[140px] rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 shadow-sm",
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

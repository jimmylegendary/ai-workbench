"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { OpFlowNode } from "@/features/simulation/model/fixtures/c1";

/**
 * Canvas 1 custom node = one L0 `op`.
 * Renders op label + a mono readout (dtype · shape) and exposes typed
 * TensorPorts: a Left target ('in') and a Right source ('out').
 * Cyan ports + selected ring carry meaning; the body stays dark-canvas friendly.
 */

// TensorPort — small cyan dot, contrasted against the dark canvas grid.
const portStyle: CSSProperties = {
  width: 8,
  height: 8,
  background: "var(--accent)",
  border: "1px solid var(--canvas-bg)",
  borderRadius: 9999,
};

export function OpNode({ data, selected }: NodeProps<OpFlowNode>) {
  return (
    <div
      className={cn(
        "min-w-[96px] rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 shadow-sm",
        selected && "ring-2 ring-accent",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" style={portStyle} />

      <div className="text-sm font-medium leading-tight text-text">
        {data.label}
      </div>
      <div className="font-readout text-[10px] leading-tight text-text-muted">
        {data.dtype} · {data.shape}
      </div>

      <Handle type="source" position={Position.Right} id="out" style={portStyle} />
    </div>
  );
}

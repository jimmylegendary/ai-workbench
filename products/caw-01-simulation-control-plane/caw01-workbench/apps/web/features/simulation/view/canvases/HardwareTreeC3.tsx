"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useWorkbenchStore } from "@/store/workbenchStore";
import {
  c3Tree,
  type HwTreeNode,
} from "@/features/simulation/model/fixtures/c3";

/**
 * Canvas 3 — Hardware design (2D drill-down fallback per ADR-0004; the r3f 3D
 * scene is a phase-2 spike). Renders the hardware hierarchy
 * (cluster ─► rack ─► tray ─► package ─► die ─► chip ─► component) as a compact,
 * instrument-like tree. Picking a row publishes the domain `partId` to the
 * shared store via select({canvas:'c3', partId}) — never a raw renderer object.
 * The selected part rings cyan here (and is read back by PartInspector +
 * highlighted on Canvas 1/2 through the shared selection).
 */

/** Level → Badge tone. Color pairs with the level text (color-blind-safe). */
const levelTone = {
  cluster: "running",
  rack: "running",
  tray: "warning",
  package: "warning",
  die: "neutral",
  chip: "success",
  component: "success",
} as const satisfies Record<
  HwTreeNode["level"],
  "neutral" | "running" | "success" | "danger" | "warning"
>;

/** Collect every partId that has children, so the tree starts fully drilled. */
function collectExpandable(node: HwTreeNode, acc: Set<string>): Set<string> {
  if (node.children && node.children.length > 0) {
    acc.add(node.partId);
    node.children.forEach((c) => collectExpandable(c, acc));
  }
  return acc;
}

export function HardwareTreeC3() {
  const selectedPartId = useWorkbenchStore((s) => s.selection.partId);
  const selectedCanvas = useWorkbenchStore((s) => s.selection.canvas);
  const select = useWorkbenchStore((s) => s.select);

  const [expanded, setExpanded] = useState<Set<string>>(() =>
    collectExpandable(c3Tree, new Set<string>()),
  );

  const toggle = (partId: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });

  const rows: HwTreeNode[] = [];
  const depthOf = new Map<string, number>();
  const flatten = (node: HwTreeNode, depth: number): void => {
    rows.push(node);
    depthOf.set(node.partId, depth);
    if (expanded.has(node.partId)) {
      node.children?.forEach((c) => flatten(c, depth + 1));
    }
  };
  flatten(c3Tree, 0);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-canvas-grid bg-canvas-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-canvas-grid px-2 py-1">
        <span className="font-readout text-[10px] uppercase tracking-wide text-[#8b96a5]">
          C3 · Hardware
        </span>
        <span className="font-readout text-[10px] text-[#566273]">
          2D fallback
        </span>
      </div>

      <ul className="min-h-0 flex-1 overflow-auto p-1">
        {rows.map((node) => {
          const depth = depthOf.get(node.partId) ?? 0;
          const hasChildren = !!node.children && node.children.length > 0;
          const isOpen = expanded.has(node.partId);
          const isSelected =
            selectedCanvas === "c3" && selectedPartId === node.partId;
          return (
            <li key={node.partId}>
              <div
                className={cn(
                  "group flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-1",
                  "transition-colors duration-150",
                  isSelected
                    ? "border-accent bg-accent/15 ring-2 ring-accent"
                    : "border-transparent bg-surface/95 hover:bg-surface",
                )}
                style={{ marginLeft: depth * 12 }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(node.partId)}
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    aria-expanded={isOpen}
                    className="font-readout w-3 shrink-0 text-[10px] text-text-muted hover:text-text"
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                ) : (
                  <span aria-hidden className="w-3 shrink-0" />
                )}

                <button
                  type="button"
                  onClick={() => select({ canvas: "c3", partId: node.partId })}
                  title={node.partId}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Badge tone={levelTone[node.level]}>{node.level}</Badge>
                  <span
                    className={cn(
                      "font-readout truncate text-xs",
                      isSelected ? "text-accent" : "text-text",
                    )}
                  >
                    {node.name}
                  </span>
                  <span className="font-readout ml-auto shrink-0 text-[10px] text-text-muted">
                    {node.partId}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { c3PartsById, type HwTreeNode } from "../model/fixtures/c3";
import { hwCapability, defaultHwNode } from "../model/hwCapability";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------- *
 * HwPanel — the right rail when the HW / Canvas-3 tab is active.
 *
 * Lets the user CHOOSE the hardware context the simulation runs against. The
 * picker offers a few notable C3 nodes (the data-center root, the two GPU
 * clusters, and whatever C3 part is currently selected on the canvas). Clicking
 * one writes the store selection ({canvas:'c3', partId}) so ServingOptions and
 * the serving orchestrator read the same node. Below, a capability readout —
 * derived from hwCapability(node) — shows the exact HW terms (GPUs, HBM,
 * NVLink domain, nodes, precision, CXL) that drive the serving ranges.
 * ----------------------------------------------------------------------- */

/** Stable "notable" HW contexts always offered by the picker. */
const NOTABLE: { partId: string; label: string; hint: string }[] = [
  { partId: "server:dc", label: "Data center", hint: "whole ~100 MW room" },
  { partId: "cluster:gpu-gb200", label: "GB200 NVL72", hint: "Blackwell rack-scale" },
  { partId: "cluster:gpu-hgx", label: "HGX H100", hint: "Hopper 8-GPU nodes" },
];

interface PickItem {
  partId: string;
  label: string;
  hint: string;
  node: HwTreeNode;
}

export function HwPanel() {
  const partId = useWorkbenchStore((s) => s.selection.partId);
  const canvas = useWorkbenchStore((s) => s.selection.canvas);
  const select = useWorkbenchStore((s) => s.select);

  // The active HW node: a live C3 selection, else the default rack fixture.
  const activePartId = canvas === "c3" && partId ? partId : undefined;
  const node = useMemo(() => {
    const picked = activePartId ? c3PartsById[activePartId] : undefined;
    return picked ?? defaultHwNode();
  }, [activePartId]);

  const cap = useMemo(() => hwCapability(node), [node]);

  // Picker rows: the notable nodes + (if the current C3 part is not one of
  // them) the currently-selected part, so the user can always re-pick it.
  const items = useMemo<PickItem[]>(() => {
    const rows: PickItem[] = [];
    for (const n of NOTABLE) {
      const twin = c3PartsById[n.partId];
      if (twin) rows.push({ ...n, node: twin });
    }
    if (activePartId && !NOTABLE.some((n) => n.partId === activePartId)) {
      const sel = c3PartsById[activePartId];
      if (sel) {
        rows.push({
          partId: activePartId,
          label: sel.name,
          hint: `selected ${sel.level.replace(/_/g, " ")}`,
          node: sel,
        });
      }
    }
    return rows;
  }, [activePartId]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="font-readout text-[10px] uppercase tracking-wide text-text-muted">
          HW context · Canvas 3
        </span>
        <span className="font-readout text-[10px] text-text-muted">{node.name}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        {/* HW picker — clicking sets the store's C3 selection. */}
        <div className="space-y-1">
          <span className="font-readout text-[11px] font-medium text-text">
            Hardware target
          </span>
          <div className="flex flex-col gap-1">
            {items.map((it) => {
              const active = node.partId === it.node.partId;
              return (
                <button
                  key={it.partId}
                  type="button"
                  title={it.partId}
                  onClick={() => select({ canvas: "c3", partId: it.partId })}
                  className={cn(
                    "flex flex-col items-start rounded-[var(--radius-sm)] border px-1.5 py-1 text-left transition-colors",
                    active
                      ? "border-accent text-accent"
                      : "border-border text-text hover:bg-surface-muted",
                  )}
                >
                  <span className="font-readout text-[11px] font-medium">{it.label}</span>
                  <span
                    className={cn(
                      "font-readout text-[10px]",
                      active ? "text-accent/80" : "text-text-muted",
                    )}
                  >
                    {it.hint}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="font-readout text-[10px] text-text-muted">
            drives ServingOptions + the serving run
          </p>
        </div>

        {/* Capability readout — the same values that set the serving ranges. */}
        <div className="space-y-1 border-t border-border pt-2">
          <span className="font-readout text-[11px] font-medium text-text">
            Capability readout
          </span>
          <div className="flex flex-wrap gap-1">
            <Badge>{cap.gpus} GPU</Badge>
            <Badge>{cap.hbmGbPerGpu} GB HBM</Badge>
            <Badge>NVLink ×{cap.nvlinkDomain}</Badge>
            <Badge>{cap.nodes} nodes</Badge>
            {cap.fp8 ? <Badge tone="success">FP8</Badge> : null}
            {cap.fp4 ? <Badge tone="success">FP4</Badge> : null}
            {cap.hasCxl ? <Badge tone="success">CXL</Badge> : null}
          </div>
          <dl className="mt-1 space-y-0.5">
            <ReadoutRow label="GPU model" value={cap.gpuName} />
            <ReadoutRow label="GPUs in subtree" value={String(cap.gpus)} />
            <ReadoutRow label="HBM / GPU" value={`${cap.hbmGbPerGpu} GB`} />
            <ReadoutRow label="NVLink domain" value={`${cap.nvlinkDomain} GPU`} />
            <ReadoutRow label="Compute nodes" value={String(cap.nodes)} />
            <ReadoutRow label="FP8 datapath" value={cap.fp8 ? "yes" : "no"} />
            <ReadoutRow label="FP4 / NVFP4" value={cap.fp4 ? "yes" : "no"} />
            <ReadoutRow label="CXL memory tier" value={cap.hasCxl ? "reachable" : "none"} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-readout text-[10px] text-text-muted">{label}</dt>
      <dd className="truncate font-readout text-[10px] tabular-nums text-text">{value}</dd>
    </div>
  );
}

import type { HwLevel } from "@caw/core";

/**
 * Canvas 3 — Hardware design sample hierarchy (design/05-…/canvas-3-hw-design.md).
 *
 *   cluster ─► rack ─► tray ─► package ─► die ─► chip ─► component
 *
 * Canvas 3's v1 ships the **2D drill-down fallback** (ADR-0004 decision guard:
 * the r3f 3D scene is a phase-2 spike). HardwareTreeC3 renders this tree and a
 * pick returns a domain `partId` (never a raw renderer object), published to the
 * shared store as selection.partId. PartInspector reads that id back here.
 *
 * Local fixtures only — never import a shared fixtures file (per task rules).
 * Mirrors the core `HwNode` shape (level + spec + part_id) without the
 * server-only id/experiment_id/parent_id columns.
 */

/** A spec field set is opaque JSONB on the server; here a flat readout map. */
export type HwSpec = Record<string, string>;

/** One node in the hardware tree (UI projection of a core `HwNode`). */
export interface HwTreeNode {
  /** stable picking identity (Canvas 3) — what select({canvas:'c3', partId}) carries */
  partId: string;
  level: HwLevel;
  name: string;
  spec: HwSpec;
  children?: HwTreeNode[];
}

export const c3Tree: HwTreeNode = {
  partId: "cluster:astra",
  level: "cluster",
  name: "astra-cluster",
  spec: { nodes: "256", interconnect: "rail-optimized", topology: "fat-tree" },
  children: [
    {
      partId: "rack:r0",
      level: "rack",
      name: "rack-0",
      spec: { trays: "8", power_kw: "120", coolant: "DLC" },
      children: [
        {
          partId: "tray:r0-t0",
          level: "tray",
          name: "tray-0",
          spec: { packages: "4", height_u: "8" },
          children: [
            {
              partId: "pkg:r0-t0-accel0",
              level: "package",
              name: "accel-pkg-0",
              spec: { dies: "2", tdp_w: "700", noc_bisection_bw: "3.2 TB/s" },
              children: [
                {
                  partId: "die:accel0-die0",
                  level: "die",
                  name: "die0",
                  spec: { process: "TSMC N3", area_mm2: "826" },
                  children: [
                    {
                      partId: "chip:accel0-die0-compute",
                      level: "chip",
                      name: "compute-chip",
                      spec: { sm_count: "132", clock_ghz: "1.98" },
                      children: [
                        {
                          partId: "comp:accel0-die0-tca",
                          level: "component",
                          name: "tensor-core-array",
                          spec: { cores: "528", dtype: "bf16/fp8", tflops: "1979" },
                        },
                        {
                          partId: "comp:accel0-die0-hbm",
                          level: "component",
                          name: "hbm3e-stack",
                          spec: { capacity: "192 GiB", bandwidth: "8.0 TB/s", stacks: "8" },
                        },
                      ],
                    },
                  ],
                },
                {
                  partId: "die:accel0-die1",
                  level: "die",
                  name: "die1",
                  spec: { process: "TSMC N3", area_mm2: "826" },
                  children: [
                    {
                      partId: "chip:accel0-die1-compute",
                      level: "chip",
                      name: "compute-chip",
                      spec: { sm_count: "132", clock_ghz: "1.98" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      partId: "rack:r1",
      level: "rack",
      name: "rack-1",
      spec: { trays: "8", power_kw: "118", coolant: "DLC" },
    },
  ],
};

/** Flat partId → node lookup, walked once at module load (for PartInspector). */
export const c3PartsById: Record<string, HwTreeNode> = (() => {
  const index: Record<string, HwTreeNode> = {};
  const walk = (node: HwTreeNode): void => {
    index[node.partId] = node;
    node.children?.forEach(walk);
  };
  walk(c3Tree);
  return index;
})();

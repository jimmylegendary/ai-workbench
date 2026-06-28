import type { HwLevel } from "@caw/core";

/**
 * Canvas 3 — Hardware design sample hierarchy (design/05-…/canvas-3-hw-design.md).
 *
 *   cluster ─► rack ─► tray ─► package ─► die ─► chip ─► component
 *
 * Canvas 3 renders this as a FRACTAL hardware schematic / floorplan: the current
 * drill level shows its child parts as nested rectangles (a board/package/die
 * layout), not a tree list. Ctrl+click a part WITH children descends one level
 * (HardwareTreeC3 + resolveC3Level below); the per-canvas drill path (store) is
 * an array of `partId`s. A plain pick returns a domain `partId` (never a raw
 * renderer object), published to the shared store as selection.partId, which
 * PartInspector reads back here.
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
  name: string;
  level: HwLevel;
  spec: HwSpec;
  children?: HwTreeNode[];
}

/** Build a compute-chip's component leaves (tensor + memory floorplan). */
const computeComponents = (chip: string): HwTreeNode[] => [
  {
    partId: `comp:${chip}-tca`,
    name: "tensor-core-array",
    level: "component",
    spec: { cores: "528", dtype: "bf16/fp8", tflops: "1979" },
  },
  {
    partId: `comp:${chip}-hbm`,
    name: "hbm3e-stack",
    level: "component",
    spec: { capacity: "192 GiB", bandwidth: "8.0 TB/s", stacks: "8" },
  },
];

/** A minimal compute chip carrying tensor + memory components. */
const computeChip = (die: string): HwTreeNode => ({
  partId: `chip:${die}-compute`,
  name: "compute-chip",
  level: "chip",
  spec: { role: "compute", clock_ghz: "1.98", voltage_v: "0.78" },
  children: computeComponents(`${die}-compute`),
});

/** A minimal die → compute-chip subtree, reused across shallow packages. */
const computeDie = (pkg: string): HwTreeNode => ({
  partId: `die:${pkg}-d0`,
  name: "die-0",
  level: "die",
  spec: { process: "TSMC N3", area_mm2: "826", transistors: "208 B" },
  children: [computeChip(`${pkg}-d0`)],
});

/** A shallow package (1 die → 1 compute chip), reused across thin trays. */
const computePackage = (tray: string): HwTreeNode => ({
  partId: `pkg:${tray}-p0`,
  name: "accel-pkg-0",
  level: "package",
  spec: { dies: "1", tdp_w: "700", substrate: "CoWoS-L", noc_bisection_bw: "3.2 TB/s" },
  children: [computeDie(`${tray}-p0`)],
});

/** A thin tray with a single accelerator package. */
const thinTray = (rack: string, idx: number): HwTreeNode => ({
  partId: `tray:${rack}-t${idx}`,
  name: `tray-${idx}`,
  level: "tray",
  spec: { packages: "1", height_u: "8", power_w: "780" },
  children: [computePackage(`${rack}-t${idx}`)],
});

export const c3Tree: HwTreeNode = {
  partId: "cluster:astra",
  name: "astra-cluster",
  level: "cluster",
  spec: {
    nodes: "256",
    interconnect: "rail-optimized",
    topology: "fat-tree",
    fabric: "NVLink5 + IB-NDR",
  },
  children: [
    {
      partId: "rack:r0",
      name: "rack-0",
      level: "rack",
      spec: { trays: "3", power_kw: "120", coolant: "DLC", weight_kg: "1360" },
      children: [
        {
          partId: "tray:r0-t0",
          name: "tray-0",
          level: "tray",
          spec: { packages: "2", height_u: "8", power_w: "1560" },
          children: [
            {
              partId: "pkg:r0-t0-p0",
              name: "accel-pkg-0",
              level: "package",
              spec: {
                dies: "2",
                tdp_w: "1000",
                substrate: "CoWoS-L",
                noc_bisection_bw: "3.2 TB/s",
              },
              children: [
                {
                  partId: "die:r0-t0-p0-d0",
                  name: "die-0",
                  level: "die",
                  spec: { process: "TSMC N3", area_mm2: "826", transistors: "208 B" },
                  children: [
                    {
                      partId: "chip:r0-t0-p0-d0-compute",
                      name: "compute-chip",
                      level: "chip",
                      spec: { role: "compute", clock_ghz: "1.98", voltage_v: "0.78" },
                      children: [
                        {
                          partId: "comp:r0-t0-p0-d0-tca",
                          name: "tensor-core-array",
                          level: "component",
                          spec: { cores: "528", dtype: "bf16/fp8", tflops: "1979" },
                        },
                        {
                          partId: "comp:r0-t0-p0-d0-vec",
                          name: "vector-unit",
                          level: "component",
                          spec: { lanes: "128", dtype: "fp32", gflops: "67000" },
                        },
                        {
                          partId: "comp:r0-t0-p0-d0-hbm",
                          name: "hbm3e-stack",
                          level: "component",
                          spec: { capacity: "192 GiB", bandwidth: "8.0 TB/s", stacks: "8" },
                        },
                        {
                          partId: "comp:r0-t0-p0-d0-sram",
                          name: "sram-bank",
                          level: "component",
                          spec: { capacity: "256 MiB", banks: "64", latency_ns: "12" },
                        },
                      ],
                    },
                    {
                      partId: "chip:r0-t0-p0-d0-io",
                      name: "io-chip",
                      level: "chip",
                      spec: { role: "io", clock_ghz: "1.20", voltage_v: "0.85" },
                      children: [
                        {
                          partId: "comp:r0-t0-p0-d0-nvlink",
                          name: "nvlink-phy",
                          level: "component",
                          spec: { lanes: "18", bandwidth: "1.8 TB/s", gen: "5" },
                        },
                        {
                          partId: "comp:r0-t0-p0-d0-pcie",
                          name: "pcie-gen6-phy",
                          level: "component",
                          spec: { lanes: "16", bandwidth: "256 GB/s", gen: "6" },
                        },
                      ],
                    },
                  ],
                },
                {
                  partId: "die:r0-t0-p0-d1",
                  name: "die-1",
                  level: "die",
                  spec: { process: "TSMC N3", area_mm2: "826", transistors: "208 B" },
                  children: [computeChip("r0-t0-p0-d1")],
                },
              ],
            },
            computePackage("r0-t0"),
          ],
        },
        thinTray("r0", 1),
        thinTray("r0", 2),
      ],
    },
    {
      partId: "rack:r1",
      name: "rack-1",
      level: "rack",
      spec: { trays: "2", power_kw: "118", coolant: "DLC", weight_kg: "1340" },
      children: [thinTray("r1", 0), thinTray("r1", 1)],
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

/** A breadcrumb hop on the C3 drill path. */
export interface C3Crumb {
  partId: string;
  label: string;
}

/** The resolved C3 schematic level for a drill path. */
export interface C3Level {
  /** The container part whose interior the schematic is showing. */
  container: HwTreeNode;
  /** The child parts laid out as nested rectangles at this level. */
  parts: HwTreeNode[];
  /** root (cluster) + each drilled part — feeds the CanvasFrame breadcrumb. */
  crumbs: C3Crumb[];
}

/**
 * Resolve the current schematic level + breadcrumb from a C3 drill path (an
 * array of `partId`s). Mirrors fractal.ts/resolveLevel, but walks the HW tree
 * by `partId` instead of a named-level graph. Empty drill = the cluster root;
 * its children (the racks) are the rectangles rendered first.
 */
export function resolveC3Level(drill: readonly string[]): C3Level {
  let container = c3Tree;
  const crumbs: C3Crumb[] = [{ partId: c3Tree.partId, label: c3Tree.name }];
  for (const partId of drill) {
    const next = container.children?.find((c) => c.partId === partId);
    if (next) {
      container = next;
      crumbs.push({ partId: next.partId, label: next.name });
    }
  }
  return { container, parts: container.children ?? [], crumbs };
}

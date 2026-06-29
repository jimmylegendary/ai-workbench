import type { HwLevel, ClusterType } from "@caw/core";

/**
 * Canvas 3 — Hardware digital twin (RESEARCHED instance).
 *
 *   data_center ─► cluster (zone) ─► rack ─► tray ─► package ─► die ─► chip ─► component
 *
 * Grounded in shipping NVIDIA-class systems (GB200 NVL72 + HGX/DGX H100 + Hopper
 * GH100 internals). The canonical drill path the designers want to demo:
 *   data center (zones per cluster type)
 *     → GPU cluster
 *       → GB200-style rack (18 compute trays + 9 NVLink-switch trays + PSU)
 *         → compute tray (2 CPU + 8 GPU + 4 NVSwitch + ConnectX-7 NICs + OSFP)
 *           → GPU (SM array + tensor cores + L2 + HBM stacks)
 *
 * Canvas 3 renders this as a FRACTAL hardware schematic / floorplan: the current
 * drill level shows its child parts as nested rectangles. Ctrl+click a part WITH
 * children descends one level (resolveC3Level below). The full validation schema
 * lives in @caw/core `schemas/hardware.ts`; this is the lean UI projection.
 *
 * Local fixtures only. Mirrors the core `HwNode` shape (level + spec + part_id)
 * plus optional twin fields (role/count/trayKind/comp) the renderers read.
 */

/** A spec field set is opaque JSONB on the server; here a flat readout map. */
export type HwSpec = Record<string, string>;

/** Sub-classifier for a tray's function (drives the tray glyph). */
export type TrayKind = "compute" | "nvlink-switch" | "power" | "network";

/**
 * Component kind for leaf/silicon parts (drives the part glyph). NOT a level —
 * `level` stays within @caw/core `HwLevel`; `comp` adds the twin's finer type.
 */
export type CompKind =
  | "gpu"
  | "cpu"
  | "nvswitch"
  | "nic"
  | "dpu"
  | "osfp"
  | "hbm"
  | "sm"
  | "tensor"
  | "l2"
  | "cache"
  | "register-file"
  | "nvlink"
  | "pcie"
  | "psu";

/** One node in the hardware tree (UI projection of a core `HwNode`). */
export interface HwTreeNode {
  /** stable picking identity (Canvas 3) — what select({canvas:'c3', partId}) carries */
  partId: string;
  name: string;
  level: HwLevel;
  /** free-form role/function shown in PartInspector. */
  role?: string;
  /** how many identical instances this node stands for (e.g. 16 more trays). */
  count?: number;
  /** taxonomy for `cluster` nodes — drives the twin glyph accent (not status). */
  clusterType?: ClusterType;
  /** tray function classifier (only on `tray` nodes). */
  trayKind?: TrayKind;
  /** silicon/leaf component kind (gpu|cpu|nvswitch|nic|hbm|sm|l2|…). */
  comp?: CompKind;
  spec: HwSpec;
  children?: HwTreeNode[];
}

/* ----------------------------------------------------------------------- *
 * GPU internals — NVIDIA Hopper GH100 (H100 SXM5): SM array + tensor cores
 * + L2 + HBM3 stacks. Built once per GPU id; SMs use count + a representative.
 * ----------------------------------------------------------------------- */

/** A representative Streaming Multiprocessor (1 of 132 on H100 SXM5). */
const representativeSm = (gpu: string): HwTreeNode => ({
  partId: `comp:${gpu}-sm0`,
  name: "sm (representative)",
  level: "component",
  comp: "sm",
  role: "streaming multiprocessor — 4 processing blocks",
  spec: { fp32: "128", fp64: "64", tensor_cores: "4", l1_shared: "256 KiB", warp_schedulers: "4" },
  children: [
    {
      partId: `comp:${gpu}-sm0-tc`,
      name: "tensor-core",
      level: "component",
      comp: "tensor",
      count: 4,
      role: "4th-gen tensor core (MMA / Transformer Engine FP8)",
      spec: { dtypes: "FP8/FP16/BF16/TF32/FP64", per_sm: "4" },
    },
    {
      partId: `comp:${gpu}-sm0-rf`,
      name: "register-file",
      level: "component",
      comp: "register-file",
      role: "fastest tier (Tier 0)",
      spec: { size: "256 KiB", regs: "65,536 x 32-bit" },
    },
    {
      partId: `comp:${gpu}-sm0-l1`,
      name: "l1 / shared (unified)",
      level: "component",
      comp: "cache",
      role: "SM-local scratchpad + L1 (Tier 1)",
      spec: { size: "256 KiB", max_shared_per_block: "227 KiB" },
    },
  ],
});

/** GH100 compute chip: SM array (132) + L2 + HBM. */
const gh100ComputeChip = (gpu: string): HwTreeNode => ({
  partId: `chip:${gpu}-compute`,
  name: "compute-chip (GH100)",
  level: "chip",
  spec: { role: "compute", sms: "132", gpcs: "8", clock_ghz: "1.83" },
  children: [
    {
      partId: `comp:${gpu}-smarray`,
      name: "sm-array",
      level: "component",
      comp: "sm",
      count: 132,
      role: "132 SMs / 66 TPCs / 8 GPCs (H100 SXM5)",
      spec: { sms: "132", fp32_cores: "16,896", tensor_cores: "528", fp16_tc: "989 TFLOPS" },
      children: [representativeSm(gpu)],
    },
    {
      partId: `comp:${gpu}-l2`,
      name: "l2-cache",
      level: "component",
      comp: "l2",
      role: "chip-wide last-level cache (Tier 2), 2 partitions + crossbar",
      spec: { size: "50 MiB", partitions: "2" },
    },
    {
      partId: `comp:${gpu}-hbm`,
      name: "hbm3-stack",
      level: "component",
      comp: "hbm",
      count: 5,
      role: "global memory (Tier 3), 5 active stacks",
      spec: { capacity: "80 GiB", bandwidth: "3.35 TB/s", per_stack: "16 GiB", ecc: "SECDED" },
    },
  ],
});

/** GH100 I/O chip: NVLink-4 + PCIe Gen5 PHYs. */
const gh100IoChip = (gpu: string): HwTreeNode => ({
  partId: `chip:${gpu}-io`,
  name: "io-chip",
  level: "chip",
  spec: { role: "io" },
  children: [
    {
      partId: `comp:${gpu}-nvlink`,
      name: "nvlink-4 phy",
      level: "component",
      comp: "nvlink",
      role: "18 links → NVSwitch fabric",
      spec: { links: "18", bandwidth: "900 GB/s", gen: "4", signaling: "PAM4" },
    },
    {
      partId: `comp:${gpu}-pcie`,
      name: "pcie-gen5 x16",
      level: "component",
      comp: "pcie",
      role: "host link",
      spec: { lanes: "16", bandwidth: "128 GB/s", gen: "5" },
    },
  ],
});

/** A full H100 SXM5 GPU package → die → chips → internals. */
const h100Gpu = (node: string, idx: number): HwTreeNode => {
  const gpu = `${node}-gpu${idx}`;
  return {
    partId: `pkg:${gpu}`,
    name: `h100-sxm5-${idx}`,
    level: "package",
    comp: "gpu",
    role: "Hopper accelerator (GH100, TSMC 4N, 80B transistors)",
    spec: { memory: "80 GiB HBM3", mem_bw: "3.35 TB/s", tdp_w: "700", fp8_sparse: "3,958 TFLOPS" },
    children: [
      {
        partId: `die:${gpu}`,
        name: "gh100-die",
        level: "die",
        spec: { process: "TSMC 4N", area_mm2: "814", transistors: "80 B", full_sms: "144", enabled_sms: "132" },
        children: [gh100ComputeChip(gpu), gh100IoChip(gpu)],
      },
    ],
  };
};

/* ----------------------------------------------------------------------- *
 * Compute tray (HGX H100-class node): 8 GPU + 4 NVSwitch + 2 CPU + 8 CX7 +
 * 2 BlueField-3 + OSFP cages. The unit the GPU rack is built from.
 * ----------------------------------------------------------------------- */

const computeTray = (rack: string, idx: number, expand: boolean): HwTreeNode => {
  const node = `${rack}-t${idx}`;
  const gpus: HwTreeNode[] = expand
    ? [
        h100Gpu(node, 0),
        { ...h100Gpu(node, 1), count: 7, name: "h100-sxm5-1..7 (x7 more)", children: undefined },
      ]
    : [{ ...h100Gpu(node, 0), count: 8, name: "h100-sxm5 x8", children: undefined }];
  return {
    partId: `tray:${node}`,
    name: `compute-tray-${idx}`,
    level: "tray",
    trayKind: "compute",
    role: "HGX 8-GPU baseboard node (Sapphire Rapids host)",
    spec: { height_u: "8", gpus: "8", power_w: "10,200", system_memory: "2 TB DDR5" },
    children: [
      ...gpus,
      {
        partId: `pkg:${node}-cpu0`,
        name: "xeon-8480c",
        level: "package",
        comp: "cpu",
        count: 2,
        role: "host CPU (Sapphire Rapids)",
        spec: { cores: "56", total_cores: "112", memory: "2 TB DDR5" },
      },
      {
        partId: `pkg:${node}-nvsw0`,
        name: "nvswitch (3rd-gen)",
        level: "package",
        comp: "nvswitch",
        count: 4,
        role: "on-baseboard all-to-all NVLink crossbar",
        spec: { generation: "3rd-gen", aggregate: "7.2 TB/s", bisection: "3.6 TB/s" },
      },
      {
        partId: `pkg:${node}-cx7`,
        name: "connectx-7 400G",
        level: "package",
        comp: "nic",
        count: 8,
        role: "scale-out NIC (1 per GPU, rail-optimized)",
        spec: { speed: "400 Gb/s", fabric: "NDR IB / 400GbE", phy: "OSFP via DensiLink" },
      },
      {
        partId: `pkg:${node}-bf3`,
        name: "bluefield-3 dpu",
        level: "package",
        comp: "dpu",
        count: 2,
        role: "storage + in-band management offload",
        spec: { speed: "400 Gb/s", ports: "dual" },
      },
      {
        partId: `comp:${node}-osfp`,
        name: "osfp cage",
        level: "component",
        comp: "osfp",
        count: 4,
        role: "optical scale-out ports (twin-port 400G)",
        spec: { type: "OSFP", lanes: "100G/lane" },
      },
    ],
  };
};

/** A GB200-style rack skeleton: 18 compute + 9 NVLink-switch trays + PSU. */
const gpuRack = (rack: string, label: string, expandFirst: boolean): HwTreeNode => ({
  partId: `rack:${rack}`,
  name: label,
  level: "rack",
  role: "GB200 NVL72-style rack-scale unit (OCP ORv3 / MGX, 48U)",
  spec: { trays: "27", gpus: "72", power_kw: "120", coolant: "DLC", weight_kg: "1360" },
  children: [
    computeTray(rack, 0, expandFirst),
    { ...computeTray(rack, 1, false), count: 17, name: "compute-tray-1..17 (x17 more)" },
    {
      partId: `tray:${rack}-sw0`,
      name: "nvlink-switch-tray-0",
      level: "tray",
      trayKind: "nvlink-switch",
      role: "rack NVLink fabric (5th-gen NVSwitch)",
      spec: { height_u: "1", nvswitch_chips: "2", tray_bw: "14.4 TB/s" },
      children: [
        {
          partId: `pkg:${rack}-sw0-c0`,
          name: "nvswitch (5th-gen)",
          level: "package",
          comp: "nvswitch",
          count: 2,
          role: "72-port NVLink crossbar",
          spec: { ports: "72", throughput: "7.2 TB/s", sharp: "NVLink SHARP" },
        },
      ],
    },
    {
      partId: `tray:${rack}-sw1`,
      name: "nvlink-switch-tray-1..8 (x8 more)",
      level: "tray",
      trayKind: "nvlink-switch",
      count: 8,
      role: "9 NVLink-switch trays total = 18 NVSwitch chips/rack",
      spec: { height_u: "1", nvswitch_chips: "2" },
    },
    {
      partId: `tray:${rack}-psu`,
      name: "power-shelf",
      level: "tray",
      trayKind: "power",
      count: 8,
      role: "AC→DC conversion to the ~50V busbar (N+N)",
      spec: { psus: "6 x 5.5 kW", shelf_kw: "33", redundancy: "N+N" },
    },
  ],
});

/* ----------------------------------------------------------------------- *
 * Zones (clusters) of the ~100 MW room.
 * ----------------------------------------------------------------------- */

const gpuCluster: HwTreeNode = {
  partId: "cluster:gpu",
  name: "gpu-compute-zone",
  level: "cluster",
  clusterType: "gpu",
  role: "primary AI training/inference fabric (~80-85% of IT power)",
  spec: {
    racks: "~500-650",
    gpus: "~40,000-47,000",
    rack_unit: "GB200 NVL72",
    pod_su: "8-9 NVL72 racks (~576 GPUs)",
    interconnect: "rail-optimized fat-tree",
    fabric: "NVLink5 (scale-up) + Quantum-X800 IB / Spectrum-X (scale-out)",
  },
  children: [gpuRack("gpu-r0", "rack-0 (GB200 NVL72)", true), gpuRack("gpu-r1", "rack-1..N", false)],
};

const headCluster: HwTreeNode = {
  partId: "cluster:cpu",
  name: "cpu-head-zone",
  level: "cluster",
  clusterType: "cpu",
  role: "orchestration, login/head nodes, dataloaders, pre/post-processing",
  spec: { racks: "~20-50", rack_power_kw: "10-18", control_plane: "Slurm / Kubernetes" },
  children: [
    {
      partId: "rack:cpu-r0",
      name: "rack-0",
      level: "rack",
      spec: { trays: "16", power_kw: "16", servers: "2-socket x86 (Xeon/EPYC)" },
      children: [
        {
          partId: "tray:cpu-r0-t0",
          name: "head-node",
          level: "tray",
          trayKind: "compute",
          spec: { sockets: "2", height_u: "2" },
          children: [
            {
              partId: "pkg:cpu-r0-t0-cpu0",
              name: "epyc / xeon",
              level: "package",
              comp: "cpu",
              count: 2,
              spec: { cores: "96-192", memory: "12-ch DDR5" },
            },
          ],
        },
      ],
    },
  ],
};

const cxlCluster: HwTreeNode = {
  partId: "cluster:cxl",
  name: "cxl-memory-zone",
  level: "cluster",
  clusterType: "cxl",
  role: "disaggregated/pooled memory tier: expansion + KV-cache offload",
  spec: { capacity: "100+ TB coherent", protocol: "CXL 3.x (4.0 emerging)", use_case: "KV-cache offload, pooling" },
  children: [
    {
      partId: "rack:cxl-r0",
      name: "rack-0",
      level: "rack",
      spec: { trays: "8", power_kw: "18" },
      children: [
        {
          partId: "tray:cxl-r0-t0",
          name: "cmm-b memory box",
          level: "tray",
          trayKind: "compute",
          role: "CXL pooling appliance",
          spec: { height_u: "2", devices: "many Type-3 DIMM slots" },
          children: [
            {
              partId: "pkg:cxl-r0-t0-sw",
              name: "cxl switch",
              level: "package",
              comp: "nvswitch",
              role: "hybrid CXL/PCIe switch (e.g. XConn Apollo)",
              spec: { phy: "PCIe 6.0 (64 GT/s)", latency: "~150-400 ns CXL.mem" },
            },
            {
              partId: "comp:cxl-r0-t0-mem",
              name: "ddr5 module",
              level: "component",
              comp: "hbm",
              count: 16,
              role: "pooled DRAM",
              spec: { media: "DDR5", capacity: "per-device 64-512 GiB" },
            },
          ],
        },
      ],
    },
  ],
};

const storageCluster: HwTreeNode = {
  partId: "cluster:storage",
  name: "storage-zone",
  level: "cluster",
  clusterType: "storage",
  role: "all-flash data lake via GPUDirect Storage on a dedicated fabric",
  spec: { vendors: "VAST / WEKA / DDN / Pure", media: "all-flash NVMe", protocol: "NVMe-oF + GPUDirect", fabric: "200-400G (decoupled)" },
  children: [
    {
      partId: "rack:stor-r0",
      name: "rack-0",
      level: "rack",
      spec: { trays: "10", power_kw: "22" },
      children: [
        {
          partId: "tray:stor-r0-t0",
          name: "nvme-jbof",
          level: "tray",
          trayKind: "compute",
          spec: { height_u: "2", drives: "E1.S / E3.S NVMe (Gen5)" },
          children: [
            {
              partId: "comp:stor-r0-t0-nvme",
              name: "nvme ssd",
              level: "component",
              comp: "hbm",
              count: 24,
              role: "TLC/QLC flash",
              spec: { media: "NVMe Gen5", seq_read: "~14.5 GB/s" },
            },
          ],
        },
      ],
    },
  ],
};

const cxmtCluster: HwTreeNode = {
  partId: "cluster:cxmt",
  name: "cxmt-memory-centric-zone",
  level: "cluster",
  clusterType: "cxmt",
  role: "experimental processing-near-memory (PIM/PNM) — INTERNAL/custom, confirm definition",
  spec: { status: "experimental (few racks)", grounding: "Samsung HBM-PIM / CXL-PNM (CMM-DC) / CMM-B", alt: "could denote ChangXin Memory Technologies DRAM" },
  children: [
    {
      partId: "rack:cxmt-r0",
      name: "rack-0",
      level: "rack",
      spec: { trays: "4", power_kw: "12" },
      children: [
        {
          partId: "tray:cxmt-r0-t0",
          name: "pnm appliance",
          level: "tray",
          trayKind: "compute",
          role: "near-data compute offload (KV-cache / embeddings)",
          spec: { height_u: "2", tech: "HBM-PIM / CXL-PNM" },
          children: [
            {
              partId: "comp:cxmt-r0-t0-pim",
              name: "hbm-pim stack",
              level: "component",
              comp: "hbm",
              count: 8,
              role: "16-lane FP16 SIMD at the bank (Aquabolt-XL)",
              spec: { media: "HBM3", compute: "in-bank SIMD" },
            },
          ],
        },
      ],
    },
  ],
};

const specialCluster: HwTreeNode = {
  partId: "cluster:special",
  name: "special-infra-zone",
  level: "cluster",
  clusterType: "special",
  role: "management, network core/spine, DPU services, observability, bastion",
  spec: { contents: "spine/core switches, OOB mgmt, telemetry, jump hosts", mgmt_fabric: "1/10G OOB to every zone" },
  children: [
    {
      partId: "rack:spec-r0",
      name: "rack-0",
      level: "rack",
      spec: { trays: "6", power_kw: "14" },
      children: [
        {
          partId: "tray:spec-r0-sn5600",
          name: "spectrum-4 sn5600 (spine)",
          level: "tray",
          trayKind: "network",
          role: "800GbE AI fabric spine (Spectrum-X)",
          spec: { height_u: "2", ports: "64 x 800GbE", throughput: "51.2 Tbps" },
          children: [
            {
              partId: "pkg:spec-r0-sn5600-asic",
              name: "spectrum-4 asic",
              level: "package",
              comp: "nvswitch",
              role: "RoCEv2 lossless Ethernet switch",
              spec: { throughput: "51.2 Tbps", latency: "sub-us cut-through" },
            },
          ],
        },
        {
          partId: "tray:spec-r0-q3400",
          name: "quantum-x800 q3400",
          level: "tray",
          trayKind: "network",
          role: "800G XDR InfiniBand spine",
          spec: { height_u: "4", ports: "144 x 800G", asic: "Quantum-3" },
        },
      ],
    },
  ],
};

/** SERVER entry == the data center (root): a ~100 MW room of zones per cluster. */
const dataCenter: HwTreeNode = {
  partId: "server:dc",
  name: "Server · Data center",
  level: "data_center",
  role: "~100 MW AI room organised into zones by cluster type",
  spec: { it_power_mw: "91", facility_mw: "100", pue: "1.1", cooling: "~70% liquid / 30% air", zones: "6" },
  children: [gpuCluster, headCluster, cxlCluster, storageCluster, cxmtCluster, specialCluster],
};

/* ----------------------------------------------------------------------- *
 * Client subtree (a separate configuration / digital-twin root).
 * ----------------------------------------------------------------------- */

const clientDevice: HwTreeNode = {
  partId: "client:dev",
  name: "Client · device",
  level: "client",
  role: "operator workstation issuing control-plane requests",
  spec: { form: "workstation", soc: "1", ram: "128 GiB" },
  children: [
    {
      partId: "board:client-0",
      name: "main-board",
      level: "tray",
      trayKind: "compute",
      spec: { sockets: "1", pcie: "gen5 x16" },
      children: [
        {
          partId: "pkg:client-soc",
          name: "client-soc",
          level: "package",
          comp: "cpu",
          role: "consumer CPU + integrated NPU",
          spec: { cpu_cores: "24", npu_tops: "120", tdp_w: "120" },
          children: [
            {
              partId: "die:client-soc",
              name: "soc-die",
              level: "die",
              spec: { process: "TSMC N3" },
              children: [
                {
                  partId: "chip:client-soc-compute",
                  name: "compute-chip",
                  level: "chip",
                  spec: { role: "compute", cores: "24" },
                  children: [
                    {
                      partId: "comp:client-soc-npu",
                      name: "npu",
                      level: "component",
                      comp: "tensor",
                      role: "on-die inference accelerator",
                      spec: { tops: "120", dtype: "int8/fp16" },
                    },
                    {
                      partId: "comp:client-soc-lpddr",
                      name: "lpddr5x",
                      level: "component",
                      comp: "hbm",
                      role: "unified system memory",
                      spec: { capacity: "128 GiB", speed: "8533 MT/s" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Root chooser: the first C3 view (empty drill) shows two digital-twin objects —
 * Server (the data center) and Client — and you drill into one. The root node
 * itself is never rendered as an object; only its children are.
 */
export const c3Root: HwTreeNode = {
  partId: "root",
  name: "Infra",
  level: "data_center",
  spec: {},
  children: [dataCenter, clientDevice],
};

/** Flat partId → node lookup, walked once at module load (for PartInspector). */
export const c3PartsById: Record<string, HwTreeNode> = (() => {
  const index: Record<string, HwTreeNode> = {};
  const walk = (node: HwTreeNode): void => {
    index[node.partId] = node;
    node.children?.forEach(walk);
  };
  walk(c3Root);
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
 * by `partId` instead of a named-level graph. Empty drill = the root; its
 * children (the twin objects) are the rectangles rendered first.
 */
export function resolveC3Level(drill: readonly string[]): C3Level {
  let container = c3Root;
  const crumbs: C3Crumb[] = [{ partId: c3Root.partId, label: c3Root.name }];
  for (const partId of drill) {
    const next = container.children?.find((c) => c.partId === partId);
    if (next) {
      container = next;
      crumbs.push({ partId: next.partId, label: next.name });
    }
  }
  return { container, parts: container.children ?? [], crumbs };
}

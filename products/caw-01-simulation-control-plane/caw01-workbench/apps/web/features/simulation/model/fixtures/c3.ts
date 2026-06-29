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

/** A typed interconnect edge between two child parts of a node (for the twin). */
export type InterconnectKind =
  | "nvlink"
  | "c2c"
  | "pcie"
  | "cxl"
  | "osfp"
  | "ib"
  | "ethernet";

export interface HwLink {
  /** child partId (or comp glyph) the edge starts at */
  from: string;
  /** child partId the edge ends at */
  to: string;
  kind: InterconnectKind;
  label?: string;
}

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
  /** typed interconnects between this node's children (rendered as edges). */
  links?: HwLink[];
  spec: HwSpec;
  children?: HwTreeNode[];
}

/* ----------------------------------------------------------------------- *
 * SHARED SILICON INTERNALS — researched, reusable interiors so EVERY package
 * and silicon component is drillable all the way to a true leaf (CPU cores +
 * ALUs, switch crossbars + SerDes, NIC/DPU engines, optical transceivers,
 * DRAM cell arrays, NAND planes). Each builder returns a `children` array off
 * a unique `base` id; huge fan-outs use `count` + ONE representative child.
 * Grounded in the same NVIDIA-class research as the GPU tree below.
 * ----------------------------------------------------------------------- */

/** NVLink / PCIe PHY interior: link controller + a representative SerDes lane. */
const phyChildren = (
  base: string,
  kind: "nvlink" | "pcie",
  o: { links: number; per_link: string; signaling: string },
): HwTreeNode[] => [
  {
    partId: `comp:${base}-lc`,
    name: "link controller",
    level: "component",
    comp: kind,
    role: "framing, CRC/replay, flow-control",
    spec: { links: String(o.links) },
  },
  {
    partId: `comp:${base}-serdes`,
    name: "serdes lane",
    level: "component",
    comp: kind,
    count: o.links,
    role: "high-speed transceiver lane (representative)",
    spec: { per_link: o.per_link, signaling: o.signaling },
  },
];

/** HBM stack interior: base logic die + a representative DRAM die → channel →
 *  bank array → 1T1C cell (the true storage leaf). */
const hbmStackChildren = (
  base: string,
  o: { gen: string; perStack: string; channels: number },
): HwTreeNode[] => [
  {
    partId: `comp:${base}-logic`,
    name: "base logic die",
    level: "component",
    comp: "cache",
    role: "PHY + ECC/RAS + channel routing under the stack",
    spec: { gen: o.gen },
  },
  {
    partId: `comp:${base}-dramdie`,
    name: "dram die (representative)",
    level: "component",
    comp: "hbm",
    count: 8,
    role: "8-/12-Hi stack bonded by TSV + microbump",
    spec: { gen: o.gen, per_stack: o.perStack },
    children: [
      {
        partId: `comp:${base}-chan`,
        name: "channel",
        level: "component",
        comp: "hbm",
        count: o.channels,
        role: "independent DRAM channel (1024-bit / stack)",
        spec: { channels: String(o.channels) },
        children: [
          {
            partId: `comp:${base}-bank`,
            name: "bank array",
            level: "component",
            comp: "hbm",
            count: 32,
            role: "rows × columns of cells (bank groups)",
            spec: { organization: "32 banks × 2 KiB page" },
            children: [
              {
                partId: `comp:${base}-cell`,
                name: "1T1C cell (leaf)",
                level: "component",
                comp: "hbm",
                role: "one-transistor / one-capacitor bit cell",
                spec: { type: "1T1C", state: "charge on capacitor" },
              },
            ],
          },
        ],
      },
    ],
  },
];

/** DDR5 / LPDDR module interior: RCD + DRAM package → die → bank → 1T1C cell. */
const dimmChildren = (
  base: string,
  o: { media: string; capacity: string; dies: number },
): HwTreeNode[] => [
  {
    partId: `comp:${base}-rcd`,
    name: "register clock driver",
    level: "component",
    comp: "cache",
    role: "buffers command/address to the DRAM dies (RDIMM)",
    spec: { media: o.media },
  },
  {
    partId: `comp:${base}-pkg`,
    name: "dram package",
    level: "component",
    comp: "hbm",
    count: o.dies,
    role: "DDR5/LPDDR DRAM die",
    spec: { media: o.media, capacity: o.capacity },
    children: [
      {
        partId: `comp:${base}-bank`,
        name: "bank / sub-array",
        level: "component",
        comp: "hbm",
        count: 32,
        role: "2 × 32-bit sub-channels → bank groups",
        spec: { node: "~1β (12-14 nm class)" },
        children: [
          {
            partId: `comp:${base}-cell`,
            name: "1T1C cell (leaf)",
            level: "component",
            comp: "hbm",
            role: "one-transistor / one-capacitor bit cell",
            spec: { type: "1T1C" },
          },
        ],
      },
    ],
  },
];

/** CPU package interior: die → compute-tile (core-array → representative core →
 *  L1/L2/regfile/vector leaves) + shared L3, plus an io/memory die. */
const cpuPackageChildren = (
  base: string,
  o: {
    arch: string;
    process: string;
    core: string;
    isa: string;
    cores: number;
    l2: string;
    l3: string;
    vec: string;
    mem: string;
    io: string;
  },
): HwTreeNode[] => [
  {
    partId: `die:${base}`,
    name: `${o.arch} die`,
    level: "die",
    spec: { arch: o.arch, process: o.process, cores: String(o.cores) },
    children: [
      {
        partId: `chip:${base}-compute`,
        name: "compute-tile",
        level: "chip",
        spec: { role: "compute", cores: String(o.cores), l3: o.l3 },
        children: [
          {
            partId: `comp:${base}-cores`,
            name: "core-array",
            level: "component",
            comp: "cpu",
            count: o.cores,
            role: `${o.core} cores on a coherent mesh`,
            spec: { cores: String(o.cores), isa: o.isa, vector: o.vec },
            children: [
              {
                partId: `comp:${base}-core0`,
                name: "core (representative)",
                level: "component",
                comp: "cpu",
                role: `${o.core} — out-of-order superscalar`,
                spec: { isa: o.isa, l1i: "64 KiB", l1d: "64 KiB", l2: o.l2 },
                children: [
                  {
                    partId: `comp:${base}-core0-l1`,
                    name: "l1 i/d cache (leaf)",
                    level: "component",
                    comp: "cache",
                    role: "per-core first-level cache",
                    spec: { l1i: "64 KiB", l1d: "64 KiB" },
                  },
                  {
                    partId: `comp:${base}-core0-l2`,
                    name: "l2 cache (leaf)",
                    level: "component",
                    comp: "cache",
                    role: "private unified second-level cache",
                    spec: { size: o.l2 },
                  },
                  {
                    partId: `comp:${base}-core0-rf`,
                    name: "register file (leaf)",
                    level: "component",
                    comp: "register-file",
                    role: "integer + vector renamed registers",
                    spec: { type: "physical register file" },
                  },
                  {
                    partId: `comp:${base}-core0-vec`,
                    name: "vector / matrix unit (leaf)",
                    level: "component",
                    comp: "tensor",
                    role: o.vec,
                    spec: { units: o.vec },
                  },
                ],
              },
            ],
          },
          {
            partId: `comp:${base}-l3`,
            name: "l3 / system-level cache",
            level: "component",
            comp: "l2",
            role: "shared last-level cache on the coherency fabric",
            spec: { size: o.l3 },
          },
        ],
      },
      {
        partId: `chip:${base}-io`,
        name: "io / memory die",
        level: "chip",
        spec: { role: "io" },
        children: [
          {
            partId: `comp:${base}-mc`,
            name: "memory controllers (leaf)",
            level: "component",
            comp: "cache",
            role: "DRAM controllers + PHY",
            spec: { memory: o.mem },
          },
          {
            partId: `comp:${base}-io`,
            name: "host i/o (leaf)",
            level: "component",
            comp: "pcie",
            role: "host + device interconnect",
            spec: { io: o.io },
          },
        ],
      },
    ],
  },
];

/** NVLink crossbar (NVSwitch) ASIC interior. */
const nvswitchChildren = (
  base: string,
  o: { gen: string; ports: number; throughput: string; process: string },
): HwTreeNode[] => [
  {
    partId: `die:${base}`,
    name: `nvswitch asic (${o.gen})`,
    level: "die",
    spec: { process: o.process, ports: String(o.ports), throughput: o.throughput },
    children: [
      {
        partId: `comp:${base}-xbar`,
        name: "nvlink crossbar",
        level: "component",
        comp: "nvswitch",
        role: "non-blocking all-to-all switch core",
        spec: { ports: String(o.ports), throughput: o.throughput },
      },
      {
        partId: `comp:${base}-port`,
        name: "nvlink port block",
        level: "component",
        comp: "nvlink",
        count: o.ports,
        role: "per-port link logic + PAM4 SerDes (representative)",
        spec: { per_link: "100 GB/s", signaling: "224G PAM4" },
      },
      {
        partId: `comp:${base}-sharp`,
        name: "sharp engine (leaf)",
        level: "component",
        comp: "tensor",
        role: "in-network reduction (all-reduce / multicast)",
        spec: { feature: "NVLink-SHARP" },
      },
      {
        partId: `comp:${base}-mgmt`,
        name: "mgmt + telemetry (leaf)",
        level: "component",
        comp: "pcie",
        role: "control plane (ALI, NVLink management)",
        spec: { link: "PCIe / I2C sideband" },
      },
    ],
  },
];

/** Ethernet / InfiniBand / CXL switch ASIC interior (Spectrum-4, Quantum-3,
 *  ToR leaf, CXL switch). */
const switchAsicChildren = (
  base: string,
  o: { asic: string; throughput: string; ports: string; fabric: string; process: string; sharp?: boolean },
): HwTreeNode[] => [
  {
    partId: `die:${base}`,
    name: `${o.asic} asic`,
    level: "die",
    spec: { process: o.process, throughput: o.throughput, ports: o.ports },
    children: [
      {
        partId: `comp:${base}-fab`,
        name: "switch fabric / crossbar",
        level: "component",
        comp: "nvswitch",
        role: `shared-buffer ${o.fabric} switch core`,
        spec: { throughput: o.throughput },
      },
      {
        partId: `comp:${base}-port`,
        name: "port serdes",
        level: "component",
        comp: "osfp",
        role: "per-port PAM4 SerDes → OSFP cages (representative)",
        spec: { ports: o.ports, signaling: "100G/200G per lane" },
      },
      {
        partId: `comp:${base}-buf`,
        name: "packet buffer (leaf)",
        level: "component",
        comp: "cache",
        role: "shared on-chip packet memory + schedulers",
        spec: { feature: "adaptive routing, congestion control" },
      },
      ...(o.sharp
        ? [
            {
              partId: `comp:${base}-sharp`,
              name: "sharp / in-network compute (leaf)",
              level: "component" as const,
              comp: "tensor" as const,
              role: "collective reduction offload",
              spec: { feature: "SHARP" },
            },
          ]
        : []),
      {
        partId: `comp:${base}-mgmt`,
        name: "mgmt cpu (leaf)",
        level: "component",
        comp: "cpu",
        role: "switch control-plane CPU",
        spec: { fabric: o.fabric },
      },
    ],
  },
];

/** Scale-out NIC (ConnectX) interior. */
const nicChildren = (
  base: string,
  o: { model: string; speed: string; fabric: string; pcie: string },
): HwTreeNode[] => [
  {
    partId: `die:${base}`,
    name: `${o.model} asic`,
    level: "die",
    spec: { speed: o.speed, fabric: o.fabric, host: o.pcie },
    children: [
      {
        partId: `comp:${base}-pipe`,
        name: "packet pipeline (leaf)",
        level: "component",
        comp: "nic",
        role: "L2-L4 parse/match/action, flow steering",
        spec: { speed: o.speed },
      },
      {
        partId: `comp:${base}-rdma`,
        name: "rdma / roce engine (leaf)",
        level: "component",
        comp: "nic",
        role: "hardware RDMA transport offload",
        spec: { fabric: o.fabric },
      },
      {
        partId: `comp:${base}-serdes`,
        name: "network serdes (leaf)",
        level: "component",
        comp: "osfp",
        role: "network PHY → OSFP",
        spec: { speed: o.speed },
      },
      {
        partId: `comp:${base}-pcie`,
        name: "pcie host interface (leaf)",
        level: "component",
        comp: "pcie",
        role: "host attach (integrated PCIe switch)",
        spec: { host: o.pcie },
      },
      {
        partId: `comp:${base}-buf`,
        name: "on-chip buffer (leaf)",
        level: "component",
        comp: "cache",
        role: "packet + descriptor memory",
        spec: {},
      },
    ],
  },
];

/** DPU (BlueField-3) interior: Arm cores + DPA + ConnectX + DDR5 + PCIe switch. */
const dpuChildren = (base: string, o: { speed: string }): HwTreeNode[] => [
  {
    partId: `die:${base}`,
    name: "bluefield-3 soc",
    level: "die",
    spec: { speed: o.speed, arm: "16x A78", process: "TSMC 7nm" },
    children: [
      {
        partId: `comp:${base}-arm`,
        name: "arm core-array",
        level: "component",
        comp: "cpu",
        count: 16,
        role: "16x Cortex-A78 (coherent mesh) — representative",
        spec: { cores: "16", isa: "Armv8.2-A" },
        children: [
          {
            partId: `comp:${base}-arm0`,
            name: "a78 core (representative)",
            level: "component",
            comp: "cpu",
            role: "out-of-order Arm core",
            spec: { l1: "64 KiB", l2: "512 KiB" },
            children: [
              {
                partId: `comp:${base}-arm0-l2`,
                name: "l2 cache (leaf)",
                level: "component",
                comp: "cache",
                role: "private L2",
                spec: { size: "512 KiB" },
              },
            ],
          },
        ],
      },
      {
        partId: `comp:${base}-dpa`,
        name: "data-path accelerator (leaf)",
        level: "component",
        comp: "tensor",
        role: "16 hyperthreaded DPA cores for IO offload",
        spec: { cores: "16 DPA" },
      },
      {
        partId: `comp:${base}-net`,
        name: "connectx-7 net engine (leaf)",
        level: "component",
        comp: "nic",
        role: "integrated 400G networking",
        spec: { speed: o.speed },
      },
      {
        partId: `comp:${base}-ddr`,
        name: "ddr5 controller (leaf)",
        level: "component",
        comp: "cache",
        role: "dual-channel DDR5-5600 (~80 GB/s)",
        spec: { mem: "DDR5-5600" },
      },
      {
        partId: `comp:${base}-pcie`,
        name: "pcie gen5 switch (leaf)",
        level: "component",
        comp: "pcie",
        role: "32-lane integrated switch / root complex",
        spec: { lanes: "32", gen: "5" },
      },
      {
        partId: `comp:${base}-accel`,
        name: "crypto / storage accel (leaf)",
        level: "component",
        comp: "tensor",
        role: "encryption, compression, NVMe-oF offload",
        spec: {},
      },
    ],
  },
];

/** Optical transceiver interior inside an OSFP cage. */
const osfpChildren = (base: string, o: { rate: string }): HwTreeNode[] => [
  {
    partId: `comp:${base}-dsp`,
    name: "dsp / retimer (leaf)",
    level: "component",
    comp: "pcie",
    role: "electrical PAM4 DSP + clock recovery",
    spec: { rate: o.rate },
  },
  {
    partId: `comp:${base}-laser`,
    name: "laser driver + EML (leaf)",
    level: "component",
    comp: "osfp",
    role: "electro-absorption modulated laser TX",
    spec: { lanes: "8 × 100G" },
  },
  {
    partId: `comp:${base}-pd`,
    name: "photodiode + TIA (leaf)",
    level: "component",
    comp: "osfp",
    role: "optical RX front-end",
    spec: {},
  },
  {
    partId: `comp:${base}-mpo`,
    name: "mpo fiber connector (leaf)",
    level: "component",
    comp: "osfp",
    role: "optical media interface",
    spec: { media: "MPO / single-mode" },
  },
];

/** NVMe SSD interior: controller (Arm-R + ECC + flash PHY) + NAND + DRAM cache. */
const ssdChildren = (base: string, o: { gen: string }): HwTreeNode[] => [
  {
    partId: `comp:${base}-ctrl`,
    name: "ssd controller asic",
    level: "component",
    comp: "cpu",
    role: "Arm-R FTL + LDPC ECC + multi-channel flash PHY",
    spec: { host: o.gen, node: "~6 nm" },
    children: [
      {
        partId: `comp:${base}-ctrl-cpu`,
        name: "arm-r cores (leaf)",
        level: "component",
        comp: "cpu",
        role: "firmware / FTL (Cortex-R)",
        spec: {},
      },
      {
        partId: `comp:${base}-ctrl-ecc`,
        name: "ldpc ecc engine (leaf)",
        level: "component",
        comp: "tensor",
        role: "hard + soft-decision error correction",
        spec: {},
      },
      {
        partId: `comp:${base}-ctrl-phy`,
        name: "flash channel phy (leaf)",
        level: "component",
        comp: "osfp",
        role: "16 ONFI/Toggle channels @ 2400 MT/s",
        spec: { channels: "16" },
      },
    ],
  },
  {
    partId: `comp:${base}-nand`,
    name: "3d-nand package",
    level: "component",
    comp: "hbm",
    count: 16,
    role: "TLC 3D-NAND (representative)",
    spec: { layers: "232", bits_per_cell: "3 (TLC)" },
    children: [
      {
        partId: `comp:${base}-nand-die`,
        name: "nand die → plane",
        level: "component",
        comp: "hbm",
        count: 6,
        role: "string-stacked die, 6 planes for parallelism",
        spec: { capacity: "1 Tb", planes: "6" },
        children: [
          {
            partId: `comp:${base}-nand-cell`,
            name: "tlc charge-trap cell (leaf)",
            level: "component",
            comp: "hbm",
            role: "3 bits/cell (8 voltage levels), CMOS-under-array",
            spec: { type: "charge-trap", levels: "8" },
          },
        ],
      },
    ],
  },
  {
    partId: `comp:${base}-dram`,
    name: "dram ftl cache (leaf)",
    level: "component",
    comp: "cache",
    role: "L2P mapping table buffer",
    spec: { media: "LPDDR4/DDR" },
  },
];

/** Processing-near-memory (HBM-PIM) stack interior. */
const pimChildren = (base: string): HwTreeNode[] => [
  {
    partId: `comp:${base}-logic`,
    name: "base logic die (leaf)",
    level: "component",
    comp: "cache",
    role: "PHY + host interface",
    spec: { media: "HBM3" },
  },
  {
    partId: `comp:${base}-pcu`,
    name: "in-bank pcu",
    level: "component",
    comp: "tensor",
    count: 8,
    role: "16-lane FP16 SIMD at the bank (Aquabolt-XL)",
    spec: { compute: "in-bank SIMD" },
    children: [
      {
        partId: `comp:${base}-pcu-cell`,
        name: "dram bank + alu (leaf)",
        level: "component",
        comp: "hbm",
        role: "DRAM cell array fused with a near-bank ALU",
        spec: { type: "1T1C + PNM ALU" },
      },
    ],
  },
];

/** Power shelf interior: AC→DC rectifier PSUs + busbar tap. */
const psuChildren = (base: string, o: { rating: string; count: number }): HwTreeNode[] => [
  {
    partId: `comp:${base}-psu`,
    name: "rectifier psu (leaf)",
    level: "component",
    comp: "psu",
    count: o.count,
    role: "AC→DC power supply unit",
    spec: { rating: o.rating },
  },
  {
    partId: `comp:${base}-bus`,
    name: "busbar tap (leaf)",
    level: "component",
    comp: "psu",
    role: "DC busbar connection",
    spec: { bus: "~50 V DC" },
  },
];

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
      children: hbmStackChildren(`${gpu}-hbm`, { gen: "HBM3", perStack: "16 GiB", channels: 16 }),
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
      children: phyChildren(`${gpu}-nvlink`, "nvlink", { links: 18, per_link: "50 GB/s", signaling: "PAM4" }),
    },
    {
      partId: `comp:${gpu}-pcie`,
      name: "pcie-gen5 x16",
      level: "component",
      comp: "pcie",
      role: "host link",
      spec: { lanes: "16", bandwidth: "128 GB/s", gen: "5" },
      children: phyChildren(`${gpu}-pcie`, "pcie", { links: 16, per_link: "4 GB/s/lane", signaling: "NRZ (Gen5)" }),
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
        { ...h100Gpu(node, 1), count: 7, name: "h100-sxm5-1..7 (x7 more)" },
      ]
    : [{ ...h100Gpu(node, 0), count: 8, name: "h100-sxm5 x8" }];
  return {
    partId: `tray:${node}`,
    name: `compute-tray-${idx}`,
    level: "tray",
    trayKind: "compute",
    role: "HGX 8-GPU baseboard node (Sapphire Rapids host)",
    spec: { height_u: "8", gpus: "8", power_w: "10,200", system_memory: "2 TB DDR5" },
    links: [
      { from: `pkg:${node}-gpu0`, to: `pkg:${node}-nvsw0`, kind: "nvlink", label: "NVLink (all-to-all)" },
      { from: `pkg:${node}-gpu0`, to: `pkg:${node}-cx7`, kind: "pcie", label: "PCIe5" },
      { from: `pkg:${node}-cx7`, to: `comp:${node}-osfp`, kind: "osfp", label: "400G" },
      { from: `pkg:${node}-cpu0`, to: `pkg:${node}-gpu0`, kind: "pcie", label: "host PCIe5" },
    ],
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
        children: cpuPackageChildren(`${node}-cpu0`, {
          arch: "Sapphire Rapids",
          process: "Intel 7",
          core: "Golden Cove",
          isa: "x86-64",
          cores: 56,
          l2: "2 MiB",
          l3: "105 MiB",
          vec: "AVX-512 + AMX",
          mem: "8-ch DDR5",
          io: "PCIe Gen5 / UPI",
        }),
      },
      {
        partId: `pkg:${node}-nvsw0`,
        name: "nvswitch (3rd-gen)",
        level: "package",
        comp: "nvswitch",
        count: 4,
        role: "on-baseboard all-to-all NVLink crossbar",
        spec: { generation: "3rd-gen", aggregate: "7.2 TB/s", bisection: "3.6 TB/s" },
        children: nvswitchChildren(`${node}-nvsw0`, {
          gen: "3rd-gen",
          ports: 64,
          throughput: "3.2 TB/s",
          process: "TSMC 4N",
        }),
      },
      {
        partId: `pkg:${node}-cx7`,
        name: "connectx-7 400G",
        level: "package",
        comp: "nic",
        count: 8,
        role: "scale-out NIC (1 per GPU, rail-optimized)",
        spec: { speed: "400 Gb/s", fabric: "NDR IB / 400GbE", phy: "OSFP via DensiLink" },
        children: nicChildren(`${node}-cx7`, {
          model: "ConnectX-7",
          speed: "400 Gb/s",
          fabric: "NDR IB / 400GbE",
          pcie: "PCIe Gen5 x16",
        }),
      },
      {
        partId: `pkg:${node}-bf3`,
        name: "bluefield-3 dpu",
        level: "package",
        comp: "dpu",
        count: 2,
        role: "storage + in-band management offload",
        spec: { speed: "400 Gb/s", ports: "dual" },
        children: dpuChildren(`${node}-bf3`, { speed: "400 Gb/s" }),
      },
      {
        partId: `comp:${node}-osfp`,
        name: "osfp cage",
        level: "component",
        comp: "osfp",
        count: 4,
        role: "optical scale-out ports (twin-port 400G)",
        spec: { type: "OSFP", lanes: "100G/lane" },
        children: osfpChildren(`${node}-osfp`, { rate: "400G" }),
      },
    ],
  };
};

/** HGX H100 rack: 8-GPU compute nodes + ToR switch + PSU. NVLink is on the
 *  baseboard (no rack NVLink-switch trays — that is a GB200 feature). */
const hgxRack = (rack: string, label: string, expandFirst: boolean): HwTreeNode => ({
  partId: `rack:${rack}`,
  name: label,
  level: "rack",
  role: "HGX H100 GPU rack — 8x 8-GPU baseboard nodes (NVLink on-baseboard)",
  spec: { compute_nodes: "8", gpus: "64", power_kw: "~82", coolant: "air + RDHx", height: "42U" },
  children: [
    computeTray(rack, 0, expandFirst),
    { ...computeTray(rack, 1, false), count: 7, name: "compute-node-1..7 (x7 more)" },
    {
      partId: `tray:${rack}-tor`,
      name: "top-of-rack switch",
      level: "tray",
      trayKind: "network",
      role: "in-rack leaf (NDR IB / 400GbE)",
      spec: { height_u: "1", ports: "32-64 x 400G" },
      children: [
        {
          partId: `pkg:${rack}-tor-asic`,
          name: "quantum-2 / spectrum asic",
          level: "package",
          comp: "nvswitch",
          role: "in-rack leaf switch ASIC",
          spec: { ports: "64 x 400G", throughput: "51.2 Tbps" },
          children: switchAsicChildren(`${rack}-tor-asic`, {
            asic: "Quantum-2",
            throughput: "51.2 Tbps",
            ports: "64 x 400G",
            fabric: "NDR IB / 400GbE",
            process: "TSMC 7nm",
            sharp: true,
          }),
        },
      ],
    },
    {
      partId: `tray:${rack}-psu`,
      name: "power-shelf",
      level: "tray",
      trayKind: "power",
      count: 4,
      role: "AC→DC PSU shelves (N+1)",
      spec: { psus: "6 x 3 kW", redundancy: "N+1" },
      children: psuChildren(`${rack}-psu`, { rating: "3 kW", count: 6 }),
    },
  ],
});

/* ----------------------------------------------------------------------- *
 * Blackwell B200 GPU + GB200 NVL72 tray/rack (2 Grace + 4 Blackwell per tray,
 * NVLink exits to the rack switch trays — NO in-tray NVSwitch).
 * ----------------------------------------------------------------------- */

const blackwellGpu = (node: string, idx: number): HwTreeNode => {
  const gpu = `${node}-b${idx}`;
  return {
    partId: `pkg:${gpu}`,
    name: `b200-${idx}`,
    level: "package",
    comp: "gpu",
    role: "Blackwell GPU (2 reticle-limit dies fused as one, TSMC 4NP)",
    spec: { memory: "192 GiB HBM3e", mem_bw: "8 TB/s", tdp_w: "~1000", fp4_sparse: "~20 PFLOPS", dies: "2" },
    children: [
      {
        partId: `die:${gpu}`,
        name: "blackwell die-pair",
        level: "die",
        spec: { process: "TSMC 4NP", transistors: "208 B", die_link: "10 TB/s NV-HBI", reticles: "2" },
        children: [
          {
            partId: `comp:${gpu}-smarray`,
            name: "sm-array",
            level: "component",
            comp: "sm",
            role: "streaming multiprocessors (5th-gen Tensor / Transformer Engine 2)",
            spec: { tensor_gen: "5th", dtypes: "FP4/FP6/FP8/BF16", note: "per-SM counts not public" },
            children: [
              {
                partId: `comp:${gpu}-tc`,
                name: "tensor-core (5th-gen)",
                level: "component",
                comp: "tensor",
                role: "FP4/FP6 microscaling (Transformer Engine 2)",
                spec: { dtypes: "FP4/FP6/FP8/BF16/TF32" },
              },
            ],
          },
          {
            partId: `comp:${gpu}-l2`,
            name: "l2-cache",
            level: "component",
            comp: "l2",
            role: "chip-wide last-level cache (unified across die-pair)",
            spec: { note: "large unified L2" },
          },
          {
            partId: `comp:${gpu}-hbm`,
            name: "hbm3e-stack",
            level: "component",
            comp: "hbm",
            count: 8,
            role: "global memory — 8 stacks",
            spec: { capacity: "192 GiB", bandwidth: "8 TB/s", per_stack: "24 GiB" },
            children: hbmStackChildren(`${gpu}-hbm`, { gen: "HBM3e", perStack: "24 GiB", channels: 16 }),
          },
          {
            partId: `comp:${gpu}-nvlink`,
            name: "nvlink-5 phy",
            level: "component",
            comp: "nvlink",
            role: "18 links → rack NVSwitch fabric",
            spec: { links: "18", bandwidth: "1.8 TB/s", gen: "5" },
            children: phyChildren(`${gpu}-nvlink`, "nvlink", { links: 18, per_link: "100 GB/s", signaling: "224G PAM4" }),
          },
        ],
      },
    ],
  };
};

const gb200ComputeTray = (rack: string, idx: number, expand: boolean): HwTreeNode => {
  const node = `${rack}-t${idx}`;
  const gpus: HwTreeNode[] = expand
    ? [blackwellGpu(node, 0), { ...blackwellGpu(node, 1), count: 3, name: "b200-1..3 (x3 more)" }]
    : [{ ...blackwellGpu(node, 0), count: 4, name: "b200 x4" }];
  return {
    partId: `tray:${node}`,
    name: `compute-tray-${idx}`,
    level: "tray",
    trayKind: "compute",
    role: "GB200 compute tray — 2 GB200 superchips (2 Grace + 4 Blackwell), DLC; no in-tray NVSwitch",
    spec: { height_u: "1", gpus: "4", cpus: "2 Grace", superchips: "2x GB200", cooling: "direct liquid" },
    links: [
      { from: `pkg:${node}-b0`, to: `pkg:${node}-grace`, kind: "c2c", label: "NVLink-C2C 900 GB/s" },
      { from: `pkg:${node}-b0`, to: `pkg:${node}-cx8`, kind: "pcie", label: "PCIe" },
      { from: `pkg:${node}-cx8`, to: `comp:${node}-osfp`, kind: "osfp", label: "800G" },
    ],
    children: [
      ...gpus,
      {
        partId: `pkg:${node}-grace`,
        name: "grace cpu",
        level: "package",
        comp: "cpu",
        count: 2,
        role: "Arm Neoverse host (NVLink-C2C to Blackwell)",
        spec: { cores: "72", lpddr5x: "480 GiB", c2c: "900 GB/s" },
        children: cpuPackageChildren(`${node}-grace`, {
          arch: "Grace",
          process: "TSMC 4N",
          core: "Arm Neoverse V2",
          isa: "Armv9.0-A + SVE2",
          cores: 72,
          l2: "1 MiB",
          l3: "117 MiB SLC",
          vec: "4 × 128-bit SVE2",
          mem: "LPDDR5X 480 GiB",
          io: "NVLink-C2C 900 GB/s / PCIe Gen5",
        }),
      },
      {
        partId: `pkg:${node}-cx8`,
        name: "connectx-8 800G",
        level: "package",
        comp: "nic",
        count: 4,
        role: "scale-out NIC (rail-optimized)",
        spec: { speed: "800 Gb/s", fabric: "XDR IB / 800GbE" },
        children: nicChildren(`${node}-cx8`, {
          model: "ConnectX-8",
          speed: "800 Gb/s",
          fabric: "XDR IB / 800GbE",
          pcie: "PCIe Gen6 x16",
        }),
      },
      {
        partId: `comp:${node}-osfp`,
        name: "osfp cage",
        level: "component",
        comp: "osfp",
        count: 4,
        role: "optical scale-out ports",
        spec: { type: "OSFP", lanes: "100G/lane" },
        children: osfpChildren(`${node}-osfp`, { rate: "800G" }),
      },
    ],
  };
};

/** One of the 9 NVLink-switch trays: 2x 5th-gen NVSwitch ASICs (drillable). */
const nvlinkSwitchTray = (rack: string, idx: number): HwTreeNode => ({
  partId: `tray:${rack}-sw${idx}`,
  name: `nvlink-switch-tray-${idx}`,
  level: "tray",
  trayKind: "nvlink-switch",
  role: "rack NVLink fabric (5th-gen NVSwitch); 9 trays = 18 chips/rack",
  spec: { height_u: "1", nvswitch_chips: "2", tray_bw: "14.4 TB/s" },
  children: [
    {
      partId: `pkg:${rack}-sw${idx}-c0`,
      name: "nvswitch (5th-gen)",
      level: "package",
      comp: "nvswitch",
      count: 2,
      role: "72-port NVLink crossbar (NVLink SHARP)",
      spec: { ports: "72", throughput: "7.2 TB/s", sharp: "yes" },
      children: nvswitchChildren(`${rack}-sw${idx}-c0`, {
        gen: "5th-gen",
        ports: 72,
        throughput: "7.2 TB/s",
        process: "TSMC 4NP",
      }),
    },
  ],
});

/** GB200 NVL72 rack: 18 compute trays + 9 NVLink-switch trays + PSU = 72 GPU. */
const gb200Rack = (rack: string, label: string, expandFirst: boolean): HwTreeNode => ({
  partId: `rack:${rack}`,
  name: label,
  level: "rack",
  role: "GB200 NVL72 — 72-GPU single NVLink domain (OCP ORv3 / MGX, ~48U)",
  spec: { compute_trays: "18", switch_trays: "9", gpus: "72", power_kw: "~120", coolant: "DLC", weight_kg: "1360" },
  children: [
    gb200ComputeTray(rack, 0, expandFirst),
    { ...gb200ComputeTray(rack, 1, false), count: 17, name: "compute-tray-1..17 (x17 more)" },
    nvlinkSwitchTray(rack, 0),
    { ...nvlinkSwitchTray(rack, 1), count: 8, name: "nvlink-switch-tray-1..8 (x8 more)" },
    {
      partId: `tray:${rack}-psu`,
      name: "power-shelf",
      level: "tray",
      trayKind: "power",
      count: 8,
      role: "AC→DC conversion to the ~50V busbar (N+N)",
      spec: { psus: "6 x 5.5 kW", shelf_kw: "33", redundancy: "N+N" },
      children: psuChildren(`${rack}-psu`, { rating: "5.5 kW", count: 6 }),
    },
  ],
});

/* ----------------------------------------------------------------------- *
 * Zones (clusters) of the ~100 MW room. Two distinct GPU systems are modelled
 * as separate clusters (they are different real products): GB200 NVL72 and
 * HGX H100 — the data center composes a mix.
 * ----------------------------------------------------------------------- */

const gb200Cluster: HwTreeNode = {
  partId: "cluster:gpu-gb200",
  name: "gpu-cluster · GB200 NVL72",
  level: "cluster",
  clusterType: "gpu",
  role: "primary Blackwell training/inference fabric (NVL72 rack-scale)",
  spec: {
    rack_unit: "GB200 NVL72 (72 GPU)",
    pod_su: "8-9 NVL72 racks (~576 GPUs)",
    racks: "~500-650",
    gpus: "~36,000-47,000",
    fabric: "NVLink5 (scale-up) + Quantum-X800 IB / Spectrum-X (scale-out)",
  },
  children: [gb200Rack("gb200-r0", "rack-0 (GB200 NVL72)", true), gb200Rack("gb200-r1", "rack-1..N", false)],
};

const hgxCluster: HwTreeNode = {
  partId: "cluster:gpu-hgx",
  name: "gpu-cluster · HGX H100",
  level: "cluster",
  clusterType: "gpu",
  role: "Hopper-generation fabric — 8-GPU HGX nodes (NVLink on-baseboard)",
  spec: {
    rack_unit: "HGX H100 8-GPU node",
    gpus_per_node: "8",
    fabric: "on-baseboard NVSwitch (scale-up) + NDR IB (scale-out)",
    note: "previous-gen GPU zone alongside the GB200 fleet",
  },
  children: [hgxRack("hgx-r0", "rack-0 (HGX H100)", true), hgxRack("hgx-r1", "rack-1..N", false)],
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
              children: cpuPackageChildren("cpu-r0-t0-cpu0", {
                arch: "Granite Rapids / Turin",
                process: "Intel 3 / TSMC N4",
                core: "Redwood Cove / Zen 5",
                isa: "x86-64",
                cores: 128,
                l2: "2 MiB",
                l3: "up to 504 MiB",
                vec: "AVX-512 + AMX",
                mem: "12-ch DDR5-6400",
                io: "PCIe Gen5 / UPI",
              }),
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
              children: switchAsicChildren("cxl-r0-t0-sw", {
                asic: "CXL 3.x switch (MXC-class)",
                throughput: "2 TB/s",
                ports: "PCIe 6.0 x8/x16",
                fabric: "CXL.mem / CXL.io",
                process: "TSMC N5",
              }),
            },
            {
              partId: "comp:cxl-r0-t0-mem",
              name: "ddr5 module",
              level: "component",
              comp: "hbm",
              count: 16,
              role: "pooled DRAM",
              spec: { media: "DDR5", capacity: "per-device 64-512 GiB" },
              children: dimmChildren("cxl-r0-t0-mem", {
                media: "DDR5 RDIMM",
                capacity: "64-512 GiB",
                dies: 36,
              }),
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
              children: ssdChildren("stor-r0-t0-nvme", { gen: "PCIe Gen5 x4" }),
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
              children: pimChildren("cxmt-r0-t0-pim"),
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
              children: switchAsicChildren("spec-r0-sn5600-asic", {
                asic: "Spectrum-4",
                throughput: "51.2 Tbps",
                ports: "64 x 800GbE",
                fabric: "Ethernet / RoCEv2",
                process: "TSMC 4N",
              }),
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
          children: [
            {
              partId: "pkg:spec-r0-q3400-asic",
              name: "quantum-3 asic",
              level: "package",
              comp: "nvswitch",
              role: "XDR InfiniBand switch (SHARPv4)",
              spec: { throughput: "115.2 Tbps", ports: "144 x 800G", latency: "<100 ns" },
              children: switchAsicChildren("spec-r0-q3400-asic", {
                asic: "Quantum-3",
                throughput: "115.2 Tbps",
                ports: "144 x 800G",
                fabric: "InfiniBand XDR",
                process: "TSMC 5nm",
                sharp: true,
              }),
            },
          ],
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
  spec: { it_power_mw: "91", facility_mw: "100", pue: "1.1", cooling: "~70% liquid / 30% air", zones: "7" },
  children: [gb200Cluster, hgxCluster, headCluster, cxlCluster, storageCluster, cxmtCluster, specialCluster],
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
                      partId: "comp:client-soc-cpu",
                      name: "cpu core-array",
                      level: "component",
                      comp: "cpu",
                      count: 24,
                      role: "P-cores + E-cores (big.LITTLE)",
                      spec: { p_cores: "wide OoO", e_cores: "efficiency" },
                      children: [
                        {
                          partId: "comp:client-soc-cpu0",
                          name: "core (representative)",
                          level: "component",
                          comp: "cpu",
                          role: "performance core",
                          spec: { l2: "shared cluster L2" },
                          children: [
                            {
                              partId: "comp:client-soc-cpu0-l2",
                              name: "cluster l2 (leaf)",
                              level: "component",
                              comp: "cache",
                              role: "shared L2 + system-level cache",
                              spec: {},
                            },
                          ],
                        },
                      ],
                    },
                    {
                      partId: "comp:client-soc-gpu",
                      name: "gpu cores (leaf)",
                      level: "component",
                      comp: "gpu",
                      count: 10,
                      role: "integrated shader cores (ray tracing)",
                      spec: { features: "mesh shading, dynamic caching" },
                    },
                    {
                      partId: "comp:client-soc-npu",
                      name: "npu / neural engine (leaf)",
                      level: "component",
                      comp: "tensor",
                      role: "on-die inference accelerator",
                      spec: { tops: "120", dtype: "int8/fp16", cores: "16" },
                    },
                    {
                      partId: "comp:client-soc-lpddr",
                      name: "lpddr5x",
                      level: "component",
                      comp: "hbm",
                      role: "unified system memory",
                      spec: { capacity: "128 GiB", speed: "8533 MT/s" },
                      children: dimmChildren("client-soc-lpddr", {
                        media: "LPDDR5X (on-package)",
                        capacity: "128 GiB",
                        dies: 8,
                      }),
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

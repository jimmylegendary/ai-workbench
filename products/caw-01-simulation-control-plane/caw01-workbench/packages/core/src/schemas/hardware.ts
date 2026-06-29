import { z } from "zod";
import { ClusterType } from "./experiment.js";

/**
 * Hardware digital-twin schema — an arbitrary HW hierarchy expressed as a tree
 * of `HwTwinNode`s. This is the validation contract behind Canvas-3's fractal
 * hardware schematic (design/04-data-layer/hw-schema.md). It is intentionally
 * recursive and level-agnostic: any node can carry children, a `spec` readout,
 * typed interconnect `ports`, and explicit `links` between sibling parts.
 *
 * It is a SUPERSET of the lean server-side `HwNode` row (experiment.ts): the row
 * persists id/experiment_id/parent_id/level/name/spec/part_id; this twin shape
 * adds the rich, denormalised composition (counts, roles, interconnects) the
 * renderers and simulators consume. The DB stays the source of truth; this is
 * the projection used to build and validate twin instances.
 *
 * Grounded in shipping NVIDIA-class systems: GB200 NVL72 (Grace Blackwell
 * rack-scale, 72-GPU NVLink domain), HGX/DGX H100 (Hopper 8-GPU baseboard) and
 * the Hopper GH100 die internals. See the doc for the full sources list.
 */

/**
 * Twin level taxonomy. Superset of @caw/core `HwLevel` (data_center … component)
 * extended with the structural and leaf levels the research surfaces: room
 * `zone`s, scalable-unit `pod`s, server `node`s, and explicit accelerator /
 * fabric leaves (`gpu`/`cpu`/`switch`/`nic`/`dpu`/`memory`/`sm`/`cache`). Kept
 * a distinct enum (not re-exported as `HwLevel`) so the core row enum stays the
 * narrow persisted contract while twins can be richer.
 */
export const HwTwinLevel = z.enum([
  // digital-twin roots
  "data_center",
  "client",
  // room / floor organisation
  "zone", // a power/cooling/network domain == one cluster type's rows
  "cluster",
  "pod", // scalable unit (e.g. 8-9 NVL72 racks, or H100 SuperPOD SU)
  "row",
  // rack-scale build blocks
  "rack",
  "tray", // 1RU compute / NVLink-switch / power / network tray
  "node", // a server/baseboard node (HGX-style)
  // package → silicon
  "package",
  "die",
  "chip",
  // accelerators & host silicon (leaf-ish)
  "gpu",
  "cpu",
  "switch", // NVSwitch / network switch ASIC
  "nic", // ConnectX / SuperNIC
  "dpu", // BlueField
  "memory", // HBM stack / DIMM / CXL device
  // GPU internals
  "gpc",
  "sm",
  "tensor_core",
  "cache", // L1 / L2 / register file
  // generic
  "component",
  "interconnect",
]);
export type HwTwinLevel = z.infer<typeof HwTwinLevel>;

/** Physical/logical interconnect families a port or link can speak. */
export const InterconnectKind = z.enum([
  "nvlink", // scale-up GPU<->GPU / GPU<->NVSwitch
  "nvlink-c2c", // coherent Grace<->Blackwell chip-to-chip
  "pcie",
  "cxl", // disaggregated/pooled memory fabric
  "osfp", // optical cage carrying IB/Ethernet
  "ib", // InfiniBand (NDR/XDR)
  "ethernet", // Spectrum-X / RoCE
  "roce",
  "nvme-of", // storage fabric (NVMe-oF + GPUDirect)
  "busbar", // DC power distribution
  "coolant", // liquid cooling loop
  "hbm", // on-package memory bus
]);
export type InterconnectKind = z.infer<typeof InterconnectKind>;

/**
 * A typed interconnect endpoint exposed by a node (e.g. a GPU's 18 NVLink links,
 * a tray's 4 OSFP cages). `bw` is a human-readable aggregate (e.g. "1.8 TB/s").
 */
export const HwPort = z.object({
  id: z.string(),
  kind: InterconnectKind,
  /** aggregate bandwidth, human-readable (e.g. "1.8 TB/s", "800 Gb/s"). */
  bw: z.string().optional(),
  /** number of physical lanes/links/ports this endpoint bundles. */
  count: z.number().int().positive().optional(),
  /** generation tag (e.g. "5" for NVLink5, "Gen5" for PCIe, "XDR" for IB). */
  gen: z.string().optional(),
  role: z.string().optional(), // "scale-up" | "scale-out" | "storage" | "mgmt" …
});
export type HwPort = z.infer<typeof HwPort>;

/**
 * An explicit interconnect between two parts addressed by `part_id`/`id`
 * (e.g. compute tray -> NVSwitch tray over the copper NVLink spine).
 */
export const HwLink = z.object({
  id: z.string(),
  from: z.string(), // node id / part_id
  to: z.string(),
  kind: InterconnectKind,
  bw: z.string().optional(),
  count: z.number().int().positive().optional(),
  note: z.string().optional(),
});
export type HwLink = z.infer<typeof HwLink>;

/** A spec readout: scalar key/value pairs (capacities, clocks, power, …). */
export const HwSpecValue = z.union([z.string(), z.number(), z.boolean()]);
export type HwSpecValue = z.infer<typeof HwSpecValue>;

/** One node in the hardware digital twin. Recursive via `children`. */
export type HwTwinNode = {
  id: string;
  name: string;
  level: HwTwinLevel;
  /** free-form role/function (e.g. "primary AI training fabric", "head node"). */
  role?: string;
  /** how many identical instances this node represents (e.g. 18 compute trays). */
  count?: number;
  /** taxonomy for cluster/zone nodes — drives the twin glyph accent. */
  clusterType?: ClusterType;
  spec: Record<string, HwSpecValue>;
  ports?: HwPort[];
  links?: HwLink[];
  children?: HwTwinNode[];
};

export const HwTwinNode: z.ZodType<HwTwinNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    level: HwTwinLevel,
    role: z.string().optional(),
    count: z.number().int().positive().optional(),
    clusterType: ClusterType.optional(),
    spec: z.record(HwSpecValue),
    ports: z.array(HwPort).optional(),
    links: z.array(HwLink).optional(),
    children: z.array(HwTwinNode).optional(),
  }),
);

/** A whole twin = a named root node plus a schema version tag. */
export const HwTwin = z.object({
  version: z.literal(1).default(1),
  root: HwTwinNode,
});
export type HwTwin = z.infer<typeof HwTwin>;

/* ------------------------------------------------------------------------- *
 * Researched reference instance — one GB200 NVL72 rack (canonical rack-node).
 * Validated against the schema below; consumed as a ground-truth fixture and
 * mirrored (UI-projected) by apps/web's Canvas-3 fixture.
 * ------------------------------------------------------------------------- */

/** A GB200 NVL72 compute tray: 2x GB200 Superchip = 2 Grace + 4 Blackwell. */
const gb200ComputeTray = (idx: number): HwTwinNode => ({
  id: `gb200/tray/compute-${idx}`,
  name: `compute-tray-${idx}`,
  level: "tray",
  role: "GB200 Grace-Blackwell compute node (1RU liquid-cooled)",
  spec: {
    form_factor: "1U DLC",
    superchips: 2,
    gpus: 4,
    cpus: 2,
    gpu_memory: "744 GB HBM3e",
    cpu_memory: "960 GB LPDDR5X",
  },
  ports: [
    { id: `gb200/tray/compute-${idx}/nvlink`, kind: "nvlink", gen: "5", count: 4, bw: "1.8 TB/s", role: "scale-up (blind-mate to NVLink spine)" },
    { id: `gb200/tray/compute-${idx}/cx7`, kind: "osfp", count: 4, bw: "400 Gb/s", role: "scale-out (ConnectX-7, IB/Ethernet)" },
    { id: `gb200/tray/compute-${idx}/bf3`, kind: "ethernet", count: 2, bw: "400 Gb/s", role: "front-end/storage (BlueField-3 DPU)" },
  ],
  children: [
    {
      id: `gb200/tray/compute-${idx}/superchip-0`,
      name: "gb200-superchip-0",
      level: "package",
      role: "1 Grace + 2 Blackwell B200, NVLink-C2C coherent",
      spec: { grace_cores: 72, b200_gpus: 2, c2c: "900 GB/s NVLink-C2C" },
      children: [
        {
          id: `gb200/tray/compute-${idx}/grace-0`,
          name: "grace-cpu",
          level: "cpu",
          spec: { arch: "Arm Neoverse V2", cores: 72, memory: "480 GB LPDDR5X" },
        },
        {
          id: `gb200/tray/compute-${idx}/b200-0`,
          name: "blackwell-b200",
          level: "gpu",
          spec: { dies: 2, die_to_die: "10 TB/s", memory: "192 GB HBM3e", mem_bw: "8 TB/s" },
          ports: [{ id: `gb200/tray/compute-${idx}/b200-0/nvlink`, kind: "nvlink", gen: "5", count: 18, bw: "1.8 TB/s" }],
        },
      ],
    },
  ],
});

/** A GB200 NVL72 NVLink-switch tray: 2x 5th-gen NVSwitch ASIC. */
const gb200NvlinkTray = (idx: number): HwTwinNode => ({
  id: `gb200/tray/nvswitch-${idx}`,
  name: `nvlink-switch-tray-${idx}`,
  level: "tray",
  role: "rack NVLink fabric (no NVSwitch in compute tray)",
  spec: { form_factor: "1U DLC", nvswitch_chips: 2, tray_bw: "14.4 TB/s" },
  children: [
    {
      id: `gb200/tray/nvswitch-${idx}/chip-0`,
      name: "nvswitch-5gen",
      level: "switch",
      spec: { generation: "5th-gen NVSwitch", ports: 72, throughput: "7.2 TB/s", sharp: "NVLink SHARP" },
    },
  ],
});

/** Canonical researched instance: one GB200 NVL72 rack (72-GPU NVLink domain). */
export const gb200Nvl72Rack: HwTwinNode = {
  id: "gb200/rack",
  name: "GB200 NVL72",
  level: "rack",
  role: "rack-scale 'one giant GPU' — 72 Blackwell + 36 Grace, single NVLink domain",
  spec: {
    standard: "OCP ORv3 / NVIDIA MGX, 48U",
    gpus: 72,
    cpus: 36,
    compute_trays: 18,
    nvlink_switch_trays: 9,
    nvswitch_chips: 18,
    power_kw: 120,
    weight: "~1.36 t",
    hbm_total: "13.4 TB HBM3e",
    fp4_inference: "~1.44 EFLOPS",
    nvlink_all_to_all: "130 TB/s",
    cooling: "direct-to-chip liquid (~90%)",
  },
  ports: [
    { id: "gb200/rack/busbar", kind: "busbar", bw: "~50 V DC", role: "8 power shelves (6x 5.5kW PSU), N+N" },
    { id: "gb200/rack/coolant", kind: "coolant", role: "in-rack manifold -> facility CDU, warm-water capable" },
  ],
  links: [
    { id: "gb200/rack/spine", from: "gb200/tray/compute-*", to: "gb200/tray/nvswitch-*", kind: "nvlink", bw: "130 TB/s", count: 5184, note: "passive copper NVLink spine cartridge (~5,000 cables), saves ~20 kW vs optics" },
  ],
  children: [
    gb200ComputeTray(0),
    gb200ComputeTray(1),
    { ...gb200ComputeTray(2), count: 16, name: "compute-tray-2..17 (x16 more)" },
    gb200NvlinkTray(0),
    { ...gb200NvlinkTray(1), count: 8, name: "nvlink-switch-tray-1..8 (x8 more)" },
    {
      id: "gb200/rack/power-shelf",
      name: "power-shelf",
      level: "component",
      role: "AC->DC conversion to the ~50V busbar",
      count: 8,
      spec: { psus: 6, psu_kw: 5.5, shelf_kw: 33, redundancy: "N+N" },
    },
  ],
};

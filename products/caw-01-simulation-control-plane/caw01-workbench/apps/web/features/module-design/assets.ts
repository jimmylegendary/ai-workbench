import type { HwLevel } from "@caw/core";
import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";

/**
 * HW Module Design asset library. You design top-down by picking a LEVEL
 * (cluster/rack/tray/package/die) and composing it from the existing assets one
 * level DOWN — e.g. a tray is built from package assets; a package from die
 * assets (compute/network/fabric/io); a die from component assets. Each asset is
 * a template subtree; instantiate() stamps a unique partId so it can be added
 * repeatedly.
 */

/** Levels the user can choose to design (top of the editor). */
export const DESIGN_LEVELS: HwLevel[] = [
  "cluster",
  "rack",
  "tray",
  "package",
  "die",
];

/** What a given design level is composed of (its child level / asset palette). */
export const CHILD_LEVEL: Partial<Record<HwLevel, HwLevel>> = {
  cluster: "rack",
  rack: "tray",
  tray: "package",
  package: "die",
  die: "component",
};

/** A palette asset = a template subtree (no partId) + a display label. */
export interface Asset {
  key: string;
  label: string;
  /** the level this asset IS (must equal CHILD_LEVEL[designLevel] to be offered) */
  level: HwLevel;
  /** template node (partId is assigned on instantiate). */
  template: Omit<HwTreeNode, "partId">;
}

const A = (
  key: string,
  label: string,
  level: HwLevel,
  template: Omit<HwTreeNode, "partId" | "level">,
): Asset => ({ key, label, level, template: { level, ...template } });

/** Asset palettes, grouped by the level they provide. */
export const ASSETS: Record<string, Asset[]> = {
  rack: [
    A("rack-gb200", "GB200 NVL72 rack", "rack", {
      name: "gb200-rack",
      role: "72-GPU NVLink domain",
      spec: { compute_trays: "18", switch_trays: "9", gpus: "72", power_kw: "~120" },
    }),
    A("rack-hgx", "HGX H100 rack", "rack", {
      name: "hgx-rack",
      role: "8x 8-GPU baseboard nodes",
      spec: { compute_nodes: "8", gpus: "64", power_kw: "~82" },
    }),
  ],
  tray: [
    A("tray-compute-gb200", "GB200 compute tray", "tray", {
      name: "compute-tray",
      trayKind: "compute",
      role: "2 Grace + 4 Blackwell",
      spec: { gpus: "4", cpus: "2 Grace", height_u: "1" },
    }),
    A("tray-compute-hgx", "HGX compute tray", "tray", {
      name: "compute-tray",
      trayKind: "compute",
      role: "2 CPU + 8 GPU + 4 NVSwitch",
      spec: { gpus: "8", height_u: "8" },
    }),
    A("tray-nvlink", "NVLink switch tray", "tray", {
      name: "nvlink-switch-tray",
      trayKind: "nvlink-switch",
      role: "rack NVLink fabric",
      spec: { nvswitch_chips: "2", tray_bw: "14.4 TB/s" },
    }),
    A("tray-network", "Network tray", "tray", {
      name: "network-tray",
      trayKind: "network",
      role: "ToR leaf / spine",
      spec: { ports: "64 x 800G" },
    }),
    A("tray-power", "Power shelf", "tray", {
      name: "power-shelf",
      trayKind: "power",
      role: "AC→DC PSU shelf",
      spec: { psus: "6", redundancy: "N+N" },
    }),
  ],
  package: [
    A("pkg-gpu-b200", "Blackwell B200 GPU", "package", {
      name: "b200", comp: "gpu", role: "Blackwell accelerator",
      spec: { memory: "192 GiB HBM3e", mem_bw: "8 TB/s", tdp_w: "~1000" },
    }),
    A("pkg-gpu-h100", "H100 SXM5 GPU", "package", {
      name: "h100-sxm5", comp: "gpu", role: "Hopper accelerator",
      spec: { memory: "80 GiB HBM3", mem_bw: "3.35 TB/s", tdp_w: "700" },
    }),
    A("pkg-cpu-grace", "Grace CPU", "package", {
      name: "grace-cpu", comp: "cpu", role: "Arm Neoverse host",
      spec: { cores: "72", lpddr5x: "480 GiB" },
    }),
    A("pkg-cpu-xeon", "Xeon CPU", "package", {
      name: "xeon", comp: "cpu", role: "x86 host",
      spec: { cores: "56" },
    }),
    A("pkg-nvswitch", "NVSwitch", "package", {
      name: "nvswitch", comp: "nvswitch", role: "NVLink crossbar",
      spec: { ports: "72", throughput: "7.2 TB/s" },
    }),
    A("pkg-nic", "ConnectX NIC", "package", {
      name: "connectx", comp: "nic", role: "scale-out NIC",
      spec: { speed: "800 Gb/s" },
    }),
    A("pkg-dpu", "BlueField DPU", "package", {
      name: "bluefield", comp: "dpu", role: "offload DPU",
      spec: { speed: "400 Gb/s" },
    }),
  ],
  die: [
    A("die-compute", "Compute die", "die", {
      name: "compute-die", role: "SMs / tensor cores",
      spec: { process: "TSMC 4N" },
    }),
    A("die-io", "I/O die", "die", {
      name: "io-die", role: "NVLink + PCIe PHYs",
      spec: {},
    }),
    A("die-network", "Network die", "die", {
      name: "network-die", role: "switch / SerDes",
      spec: {},
    }),
    A("die-fabric", "Fabric die", "die", {
      name: "fabric-die", role: "interconnect fabric",
      spec: {},
    }),
  ],
  component: [
    A("comp-sm", "SM array", "component", { name: "sm-array", comp: "sm", role: "streaming multiprocessors", spec: {} }),
    A("comp-tensor", "Tensor cores", "component", { name: "tensor-core", comp: "tensor", role: "matrix engines", spec: {} }),
    A("comp-l2", "L2 cache", "component", { name: "l2-cache", comp: "l2", role: "last-level cache", spec: {} }),
    A("comp-hbm", "HBM stack", "component", { name: "hbm-stack", comp: "hbm", role: "global memory", spec: {} }),
    A("comp-osfp", "OSFP cage", "component", { name: "osfp", comp: "osfp", role: "optical port", spec: {} }),
  ],
};

/** Palette for the level currently being designed. */
export function paletteFor(designLevel: HwLevel): Asset[] {
  const child = CHILD_LEVEL[designLevel];
  return child ? (ASSETS[child] ?? []) : [];
}

/** Stamp a template into a real node with a unique partId. */
export function instantiate(asset: Asset, seq: number): HwTreeNode {
  return { ...asset.template, partId: `${asset.key}-${seq}` };
}

/** A fresh empty root for a chosen design level. */
export function newRoot(level: HwLevel, seq: number): HwTreeNode {
  return {
    partId: `module-${level}-${seq}`,
    name: `new ${level}`,
    level,
    spec: {},
    children: [],
  };
}

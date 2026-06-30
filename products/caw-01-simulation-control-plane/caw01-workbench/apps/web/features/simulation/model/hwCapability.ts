import type { HwTreeNode } from "./fixtures/c3";
import { c3PartsById } from "./fixtures/c3";

/**
 * HW-capability derivation for the serving/representation layer (Canvas 2).
 *
 * The serving knobs (TP/PP, batch, context, quant, KV offload…) have valid
 * RANGES that depend on the underlying Canvas-3 hardware. Rather than hard-code
 * those bounds, we walk the selected C3 subtree (HwTreeNode) and reduce it to a
 * small capability struct the ServingOptions panel turns into control ranges.
 *
 * Counting rule: a node's `count` means it stands for `count` identical copies
 * (the fixture stores ONE representative child + a count), so descendant
 * contributions are multiplied by each child's `count` along the path.
 *
 * Two master equations (from the serving research) drive the numeric ranges:
 *   (A) weights/GPU shrink with TP×PP and the quant byte-width.
 *   (B) KV/token budget ≈ HBM·util − weights, which scales batch × context.
 * Here we expose the raw HW terms (HBM, #GPUs, NVLink-domain, #nodes, precision
 * floors, CXL tier) and let the panel apply the equations.
 */
export interface HwCapability {
  /** total GPU packages in the subtree. */
  gpus: number;
  /** HBM capacity (GB) per GPU — the HBM term in eq. (B). */
  hbmGbPerGpu: number;
  /** max GPUs reachable in ONE NVLink domain — the TP ceiling. */
  nvlinkDomain: number;
  /** compute trays / nodes in the subtree — the PP ceiling. */
  nodes: number;
  /** a CXL memory tier is reachable → KV-cache offload is possible. */
  hasCxl: boolean;
  /** FP8 tensor-core path (Hopper/Ada/Blackwell). */
  fp8: boolean;
  /** native FP4/NVFP4 datapath (Blackwell 5th-gen tensor cores). */
  fp4: boolean;
  /** representative GPU package name (for the panel header). */
  gpuName: string;
}

/** Is this node an actual GPU accelerator (package-level), not an iGPU core. */
const isGpuPkg = (n: HwTreeNode): boolean => n.comp === "gpu" && n.level === "package";

/** GPU packages strictly within a subtree, multiplying each child's `count`. */
function gpuCount(n: HwTreeNode): number {
  const self = isGpuPkg(n) ? 1 : 0;
  const kids = (n.children ?? []).reduce((a, c) => a + (c.count ?? 1) * gpuCount(c), 0);
  return self + kids;
}

/** Compute trays ("nodes") within a subtree, multiplying each child's `count`. */
function trayCount(n: HwTreeNode): number {
  const self = n.trayKind === "compute" ? 1 : 0;
  const kids = (n.children ?? []).reduce((a, c) => a + (c.count ?? 1) * trayCount(c), 0);
  return self + kids;
}

/** First match (depth-first) satisfying a predicate, ignoring counts. */
function findNode(n: HwTreeNode, pred: (x: HwTreeNode) => boolean): HwTreeNode | undefined {
  if (pred(n)) return n;
  for (const c of n.children ?? []) {
    const hit = findNode(c, pred);
    if (hit) return hit;
  }
  return undefined;
}

/** Visit every node once (for scans that need to inspect all of them). */
function forEachNode(n: HwTreeNode, fn: (x: HwTreeNode) => void): void {
  fn(n);
  n.children?.forEach((c) => forEachNode(c, fn));
}

/** Max gpuCount over nodes matching a predicate (e.g. one rack / one tray). */
function maxGpusWhere(n: HwTreeNode, pred: (x: HwTreeNode) => boolean): number {
  let max = 0;
  forEachNode(n, (x) => {
    if (pred(x)) max = Math.max(max, gpuCount(x));
  });
  return max;
}

/** Parse a leading capacity in GiB/GB from a spec string ("192 GiB HBM3e"). */
function parseGb(spec: string | undefined): number {
  const m = spec?.match(/([\d.]+)\s*Gi?B/i);
  return m ? Math.round(parseFloat(m[1])) : 0;
}

/** Does any spec value / tensor dtype list mention the given precision token. */
function mentions(n: HwTreeNode, token: RegExp): boolean {
  let hit = false;
  forEachNode(n, (x) => {
    if (hit) return;
    if (Object.values(x.spec).some((v) => token.test(v))) hit = true;
  });
  return hit;
}

/**
 * Derive serving capabilities from a C3 hardware node/subtree. Pass the node the
 * user has selected on Canvas 3; defaults to the GB200 NVL72 rack fixture when
 * nothing is selected (the canonical demo target).
 */
export function hwCapability(node: HwTreeNode | undefined): HwCapability {
  const root = node ?? defaultHwNode();

  const gpus = Math.max(1, gpuCount(root));

  // Rack-scale NVLink (NVL72 switch trays) → the whole rack is one NVLink
  // domain; otherwise the domain is the on-baseboard GPUs of one compute tray.
  const hasRackNvSwitch = !!findNode(root, (x) => x.trayKind === "nvlink-switch");
  const gpusPerTray = maxGpusWhere(root, (x) => x.trayKind === "compute") || gpus;
  const gpusPerRack = maxGpusWhere(root, (x) => x.level === "rack") || gpus;
  const nvlinkDomain = Math.max(1, hasRackNvSwitch ? gpusPerRack : gpusPerTray);

  const nodes = Math.max(1, trayCount(root) || 1);

  const gpu = findNode(root, isGpuPkg);
  const hbmGbPerGpu = parseGb(gpu?.spec.memory) || 80;
  const gpuName = gpu?.name ?? "gpu";

  const hasCxl = !!findNode(
    root,
    (x) => x.clusterType === "cxl" || !!x.links?.some((l) => l.kind === "cxl"),
  );

  const fp4 = mentions(root, /fp4|nvfp4/i);
  const fp8 = fp4 || mentions(root, /fp8/i);

  return { gpus, hbmGbPerGpu, nvlinkDomain, nodes, hasCxl, fp8, fp4, gpuName };
}

/** The default HW target when nothing is selected: the GB200 NVL72 rack. */
export function defaultHwNode(): HwTreeNode {
  return c3PartsById["rack:gb200-r0"] ?? c3PartsById["server:dc"];
}

/** Largest power of 2 that is ≤ n (≥ 1) — for the TP degree ladder. */
export function powersOfTwoUpTo(n: number): number[] {
  const out: number[] = [];
  for (let p = 1; p <= n; p *= 2) out.push(p);
  return out.length ? out : [1];
}

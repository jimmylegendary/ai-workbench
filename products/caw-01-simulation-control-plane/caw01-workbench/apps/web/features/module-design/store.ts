import { create } from "zustand";
import type { HwLevel } from "@caw/core";
import type {
  HwTreeNode,
  HwLink,
  CompKind,
  InterconnectKind,
} from "@/features/simulation/model/fixtures/c3";
import { type Asset, instantiate, newRoot, fabricLabel } from "./assets";

/**
 * HW Module Design editing state. The working module is a HwTreeNode tree; every
 * edit produces a NEW tree so the live twin canvas (IsoScene) re-renders
 * immediately. `focusId` is the node currently shown/composed in the canvas
 * (drill to compose deeper); `selectedId` is the node open in the inspector.
 */

// ---- immutable tree helpers ------------------------------------------------
function mapTree(
  node: HwTreeNode,
  fn: (n: HwTreeNode) => HwTreeNode,
): HwTreeNode {
  const mapped = fn(node);
  if (!mapped.children) return mapped;
  return { ...mapped, children: mapped.children.map((c) => mapTree(c, fn)) };
}

function findNode(node: HwTreeNode, id: string): HwTreeNode | undefined {
  if (node.partId === id) return node;
  for (const c of node.children ?? []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return undefined;
}

function removeFrom(node: HwTreeNode, id: string): HwTreeNode {
  if (!node.children) return node;
  return {
    ...node,
    children: node.children
      .filter((c) => c.partId !== id)
      .map((c) => removeFrom(c, id)),
  };
}

/** Derive default tray interconnects from child `comp` adjacency, so a tray
 *  composed in the editor shows fabric edges in the live twin. */
function autoLinks(node: HwTreeNode): HwTreeNode {
  if (node.level !== "tray") return node;
  const kids = node.children ?? [];
  const first = (c: CompKind) => kids.find((k) => k.comp === c);
  const sw = first("nvswitch");
  const osfp = first("osfp");
  const cpu = first("cpu");
  const links: HwLink[] = [];
  for (const g of kids.filter((k) => k.comp === "gpu")) {
    if (sw) links.push({ from: g.partId, to: sw.partId, kind: "nvlink", label: "NVLink" });
    else if (cpu) links.push({ from: g.partId, to: cpu.partId, kind: "c2c", label: "C2C" });
  }
  for (const n of kids.filter((k) => k.comp === "nic")) {
    if (osfp) links.push({ from: n.partId, to: osfp.partId, kind: "osfp", label: "scale-out" });
  }
  // MERGE (don't clobber): keep any manually-drawn links, append missing auto
  // edges, dedupe by from+to+kind. This way drag-to-connect links survive a
  // later addChild() (which re-runs withAutoLinks over the whole tree).
  const existing = node.links ?? [];
  const merged = [...existing];
  for (const al of links) {
    if (!merged.some((l) => l.from === al.from && l.to === al.to && l.kind === al.kind))
      merged.push(al);
  }
  return merged.length ? { ...node, links: merged } : node;
}

/** Recompute auto-links for every tray node in the tree. */
const withAutoLinks = (root: HwTreeNode): HwTreeNode => mapTree(root, autoLinks);

interface ModuleDesignState {
  designLevel: HwLevel | null;
  root: HwTreeNode | null;
  focusId: string | null; // node whose interior the canvas is composing
  selectedId: string | null; // node open in the inspector
  seq: number;

  startDesign: (level: HwLevel) => void;
  setRoot: (root: HwTreeNode) => void; // replace the whole tree (e.g. YAML edit)
  addChild: (asset: Asset) => void; // appends to the focused node
  addLink: (fromId: string, toId: string, kind: InterconnectKind) => void;
  removeLink: (index: number) => void; // remove the i-th link of the focused node
  updateNode: (id: string, patch: Partial<HwTreeNode>) => void;
  removeNode: (id: string) => void;
  select: (id: string | null) => void;
  focusInto: (id: string) => void;
  focusTo: (id: string) => void; // breadcrumb jump
  reset: () => void;

  // derived
  focusNode: () => HwTreeNode | null;
  focusPath: () => HwTreeNode[]; // root → … → focus (breadcrumb)
}

export const useModuleDesignStore = create<ModuleDesignState>((set, get) => ({
  designLevel: null,
  root: null,
  focusId: null,
  selectedId: null,
  seq: 0,

  startDesign: (level) =>
    set((s) => {
      const seq = s.seq + 1;
      const root = newRoot(level, seq);
      return {
        designLevel: level,
        root,
        focusId: root.partId,
        selectedId: root.partId,
        seq,
      };
    }),

  // Replace the entire working tree (the editable YAML pane calls this with a
  // freshly parsed + validated tree). Keep focus/selection valid against the new
  // tree; track the design level from the new root.
  setRoot: (root) =>
    set((s) => ({
      root,
      designLevel: root.level,
      focusId:
        s.focusId && findNode(root, s.focusId) ? s.focusId : root.partId,
      selectedId:
        s.selectedId && findNode(root, s.selectedId) ? s.selectedId : null,
    })),

  addChild: (asset) =>
    set((s) => {
      if (!s.root || !s.focusId) return s;
      const seq = s.seq + 1;
      const child = instantiate(asset, seq);
      const next = mapTree(s.root, (n) =>
        n.partId === s.focusId
          ? { ...n, children: [...(n.children ?? []), child] }
          : n,
      );
      return { root: withAutoLinks(next), seq, selectedId: child.partId };
    }),

  // Append a typed interconnect to the FOCUSED node (its children render the
  // edge via TrayScene/GpuScene). from/to are child partIds.
  addLink: (fromId, toId, kind) =>
    set((s) => {
      if (!s.root || !s.focusId || fromId === toId) return s;
      const link: HwLink = { from: fromId, to: toId, kind, label: fabricLabel(kind) };
      const root = mapTree(s.root, (n) =>
        n.partId === s.focusId
          ? { ...n, links: [...(n.links ?? []), link] }
          : n,
      );
      return { root };
    }),

  removeLink: (index) =>
    set((s) => {
      if (!s.root || !s.focusId) return s;
      const root = mapTree(s.root, (n) =>
        n.partId === s.focusId && n.links
          ? { ...n, links: n.links.filter((_, i) => i !== index) }
          : n,
      );
      return { root };
    }),

  updateNode: (id, patch) =>
    set((s) => {
      if (!s.root) return s;
      const root = mapTree(s.root, (n) =>
        n.partId === id ? { ...n, ...patch, partId: n.partId } : n,
      );
      return { root };
    }),

  removeNode: (id) =>
    set((s) => {
      if (!s.root || id === s.root.partId) return s;
      return {
        root: withAutoLinks(removeFrom(s.root, id)),
        selectedId: s.selectedId === id ? null : s.selectedId,
        focusId: s.focusId === id ? s.root.partId : s.focusId,
      };
    }),

  select: (id) => set({ selectedId: id }),
  focusInto: (id) => set({ focusId: id, selectedId: id }),
  focusTo: (id) => set({ focusId: id, selectedId: id }),
  reset: () =>
    set({ designLevel: null, root: null, focusId: null, selectedId: null }),

  focusNode: () => {
    const { root, focusId } = get();
    return root && focusId ? (findNode(root, focusId) ?? root) : null;
  },
  focusPath: () => {
    const { root, focusId } = get();
    if (!root || !focusId) return [];
    const path: HwTreeNode[] = [];
    const walk = (n: HwTreeNode): boolean => {
      path.push(n);
      if (n.partId === focusId) return true;
      for (const c of n.children ?? []) if (walk(c)) return true;
      path.pop();
      return false;
    };
    walk(root);
    return path;
  },
}));

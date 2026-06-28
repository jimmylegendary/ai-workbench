/**
 * Sample work-tree state for the git-like change-management strip
 * (design/05-…/change-management-worktree.md). Local fixtures only — the real
 * data comes from WorkTreeService via TanStack Query. Never import this into
 * shared/global fixtures.
 *
 * Canvas mapping (the three subtrees):
 *   c1 → workload/  (Canvas 1 edits)
 *   c2 → serving/   (Canvas 2 edits)
 *   c3 → hardware/  (Canvas 3 edits)
 */

/** Matches the store's Selection.canvas union (store/workbenchStore.ts). */
export type WorkTreeCanvasId = "c1" | "c2" | "c3";

/** A named line of work; `dirty` = uncommitted change_blobs on this branch. */
export interface Branch {
  name: string;
  /** commit id this branch currently points at */
  head: string;
  dirty: boolean;
}

/** One commit in the linear history (no merge view in v1). */
export interface Commit {
  id: string;
  message: string;
  author: string;
  /** ISO-8601 timestamp */
  time: string;
}

/** Per-change kind, paired with text so hue is never load-bearing alone. */
export type DiffOp = "added" | "modified" | "removed";

/** A single change in a ref↔ref diff, scoped to one canvas subtree. */
export interface DiffEntry {
  target: WorkTreeCanvasId;
  op: DiffOp;
  summary: string;
}

/** Roll-up of a canvas subtree's dirty state for the tree row. */
export interface Subtree {
  canvas: WorkTreeCanvasId;
  label: string;
  /** tree path, shown in font-readout */
  path: string;
  dirty: boolean;
  /** number of uncommitted changes in this subtree */
  changes: number;
}

/** The whole strip's view state. */
export interface WorkTree {
  branches: Branch[];
  /** name of the currently checked-out branch (the head ref) */
  head: string;
  subtrees: Subtree[];
  /** refs being compared in the diff view */
  diffRange: { from: string; to: string };
  diff: DiffEntry[];
  commits: Commit[];
}

export const worktree: WorkTree = {
  head: "astra-run",
  branches: [
    { name: "main", head: "9f1c0aa", dirty: false },
    { name: "astra-run", head: "3b7e2d4", dirty: true },
    { name: "h100-whatif", head: "c41a8e9", dirty: false },
  ],
  subtrees: [
    { canvas: "c1", label: "workload", path: "experiment/workload/", dirty: false, changes: 0 },
    { canvas: "c2", label: "serving", path: "experiment/serving/", dirty: true, changes: 1 },
    { canvas: "c3", label: "hardware", path: "experiment/hardware/", dirty: true, changes: 2 },
  ],
  diffRange: { from: "main@9f1c0aa", to: "astra-run@working" },
  diff: [
    { target: "c2", op: "modified", summary: "serving: strategy_id PD-disagg → PD-colocated" },
    { target: "c3", op: "added", summary: "hardware: add HBM3e stack to accel/die0" },
    { target: "c3", op: "modified", summary: "hardware: noc.bisection_bw 2.4TB/s → 3.2TB/s" },
  ],
  commits: [
    {
      id: "3b7e2d4",
      message: "astra: bump NoC bisection bandwidth",
      author: "jimmy",
      time: "2026-06-29T01:12:00Z",
    },
    {
      id: "a02f5c1",
      message: "serving: split prefill/decode pools",
      author: "jimmy",
      time: "2026-06-28T18:44:00Z",
    },
    {
      id: "9f1c0aa",
      message: "workload: import Llama-3-70B trace (L1)",
      author: "astra",
      time: "2026-06-28T09:03:00Z",
    },
    {
      id: "0c3d7b8",
      message: "init experiment tree",
      author: "jimmy",
      time: "2026-06-27T22:15:00Z",
    },
  ],
};

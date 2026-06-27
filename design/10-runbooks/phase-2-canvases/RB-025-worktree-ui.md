# RB-025: Work-tree UI (tree / diff / branch)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-021, RB-022, RB-012]   # canvases emit change_blobs; RB-024 integrates when ready
- Implements design: [change-management-worktree.md](../../05-caw01-simulation-control-plane/change-management-worktree.md), [../../04-data-layer/work-tree-and-versioning.md](../../04-data-layer/work-tree-and-versioning.md)
- Produces: `WorkTreeView`, `DiffView`, `BranchBar`, `HistoryList`

## Objective

The user-facing work-tree across the three canvases: a tree view with dirty markers, diff between refs/branches,
branch create/switch, and history — all over `WorkTreeService`.

## Preconditions

- [ ] RB-021 + RB-022 emit change_blobs; RB-012 save controls work. (Canvas 3 integrates once RB-024 lands.)

## Steps

1. **Do:** Build `WorkTreeView` showing the three subtrees (workload/serving/hardware) with dirty markers since last commit.
   **Verify:** `view:` editing in C1/C2 marks the right subtree dirty.
2. **Do:** Build `DiffView` using `WorkTreeService.diff(refA, refB)` (current-vs-ref and ref-vs-ref).
   **Verify:** `test:` a known change shows the expected blob-hash diff.
3. **Do:** Build `BranchBar` (create/switch branches) + `HistoryList` (commits with author/surface/message/time).
   **Verify:** `test:` branch creates a ref; commits appear in history.
4. **Do:** Integrate per-item vs full save with the tree (per-item commits only the selected subtree; structural sharing).
   **Verify:** `test:` a hardware-only per-item save reuses unchanged workload/serving subtrees.

## Acceptance criteria

- [ ] Tree view reflects dirty state per subtree.
- [ ] Diff and branch/history work over `WorkTreeService`.
- [ ] Per-item save commits only the selected subtree (structural sharing verified).

## Rollback / safety

All operations are append-only commits; nothing is destructive. Revert UI to roll back the build.

## Hand-off

The what-if workflow (UC-3) is now possible: branch → change → run both → compare. Canvas 3 edits join once RB-024
is complete.

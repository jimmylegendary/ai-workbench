# Work-Tree Change Management (UX) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning.md), [control-panel-and-run-lifecycle.md](./control-panel-and-run-lifecycle.md), [../01-decisions/ADR-0007-change-management-worktree.md](../01-decisions/ADR-0007-change-management-worktree.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Spec the **user-facing** work-tree across all three canvases: how selections/edits land as versioned changes,
and the tree/diff/branch UX with per-item and full save. The **storage** model (tables/hashing) is in
[../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning.md) — not repeated here.

## Mental model

The experiment's configuration is one **work tree** with three subtrees mirroring the canvases:

```
experiment/
├─ workload/     (Canvas 1 edits → c1_node blobs)
├─ serving/      (Canvas 2 edits → c2_wiring blobs)
└─ hardware/     (Canvas 3 edits → c3_part blobs)
```

## What the user sees

| Panel | Shows |
| --- | --- |
| **Tree view** | the three subtrees with dirty/changed markers since last commit |
| **Diff view** | changes between current state and a ref, or between two refs/branches |
| **Branch view** | the branch DAG; create/switch branches for what-if configs |
| **History** | commits with author/surface/message/time |

## Save semantics (UX)

| Button | Meaning |
| --- | --- |
| **Per-item save** | commit just the selected subtree/item (e.g. only `hardware/`) |
| **Full save** | commit the whole experiment tree |
| **Branch** | fork the current ref into a named what-if line |
| **Diff** | compare two refs/branches |

These call `WorkTreeService` ([../07-backend-api/api-surface.md](../07-backend-api/api-surface.md)); structural
sharing means a hardware-only save reuses the unchanged workload/serving subtrees.

## Edit → change capture

Every canvas edit emits an `intent_event` and produces a content-addressed `change_blob`; an uncommitted edit
shows as "dirty" until saved ([../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning.md)).

## What-if workflow (UC-3)

Branch → change a serving choice or strategy_id → run both branches → compare projections in the diff/projection
views ([../00-overview/personas-and-use-cases.md](../00-overview/personas-and-use-cases.md)).

## Open questions

Whether to show 3-way merge in v1 (leaning no — branch+diff only) — TODO(open-question).

## Implications for runbooks

Phase-2 work-tree runbook builds the tree/diff/branch panels + per-item/full save wired to `WorkTreeService`,
and makes the three canvases emit intent events + change_blobs on edit.

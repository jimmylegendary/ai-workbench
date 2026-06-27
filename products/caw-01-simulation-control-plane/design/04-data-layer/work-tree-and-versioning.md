# Work-Tree & Versioning (Storage Model) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model.md), [../05-caw01-simulation-control-plane/change-management-worktree.md](../05-caw01-simulation-control-plane/change-management-worktree.md), [../01-decisions/ADR-0007-change-management-worktree.md](../01-decisions/ADR-0007-change-management-worktree.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The **storage** model for the work-tree: the git-like object tables, the intent event log, hashing, and how
per-item/full save and branching map to commits. The **UX** view (tree/diff/branch panels) is in
[../05-caw01-simulation-control-plane/change-management-worktree.md](../05-caw01-simulation-control-plane/change-management-worktree.md) — this doc does not re-spec the UI.

## Object model (git-like, in Postgres)

```sql
change_blob(
  hash        TEXT PRIMARY KEY,         -- content address (sha256 of canonical JSON)
  kind        TEXT,                     -- 'c1_node' | 'c2_wiring' | 'c3_part' | ...
  content     JSONB                     -- immutable snapshot of ONE versioned thing
)

change_tree(
  hash        TEXT PRIMARY KEY,         -- content address of the entry map
  entries     JSONB                     -- [{name, type:'blob'|'tree', hash}]  (mirrors workload/serving/hardware subtrees)
)

change_commit(
  id          UUID PRIMARY KEY,
  root_tree   TEXT REFERENCES change_tree(hash),
  parents     TEXT[],                   -- parent commit ids (append-only DAG)
  author      TEXT, surface TEXT, message TEXT, created_at TIMESTAMPTZ
)

ref(
  experiment_id UUID, name TEXT,        -- 'main' + user branch names
  commit_id   UUID REFERENCES change_commit(id),
  PRIMARY KEY (experiment_id, name)
)

intent_event(                            -- append-only log feeding the object model
  id UUID, experiment_id UUID, surface TEXT, actor TEXT,
  op TEXT, payload JSONB, created_at TIMESTAMPTZ
)
```

## Save semantics

| Action | Effect |
| --- | --- |
| **Per-item save** | hash the edited thing → `change_blob`; rebuild the affected `change_tree` path; new `change_commit` whose `root_tree` shares unchanged subtrees (structural sharing) |
| **Full save** | commit the entire current root_tree with a message |
| **Branch (what-if)** | create a new `ref` pointing at a commit; subsequent saves advance that ref |
| **Diff** | `WorkTreeService.diff(refA, refB)` walks the two root_trees, comparing blob hashes |

## Why content-addressing

- Cheap dedup + structural sharing: a hardware-only edit reuses the workload/serving subtrees unchanged.
- Intrinsic provenance: a commit *is* who/when/from-which-surface/why ([ADR-0007](../01-decisions/ADR-0007-change-management-worktree.md)).
- Deterministic diff/merge primitives without a full VCS.

## Intent event log

Every mutation is appended to `intent_event` first (the source of truth for "what the user intended"); the
object model is derived from it. This gives an audit trail and a rebuild path if the object tables are lost.

## Concurrency

Single-writer assumption in v1 (one expert). CRDT/real-time multi-writer is **deferred**
([ADR-0007](../01-decisions/ADR-0007-change-management-worktree.md)); the event log keeps the door open.

## Open questions

Whether to expose merge (3-way) in v1 or only branch+diff — leaning branch+diff only; TODO(open-question).

## Implications for runbooks

Phase-0 creates these tables; the phase-2 work-tree runbook implements `WorkTreeService.saveItem/saveAll/branch/diff`
against them, and the canvases emit `intent_event`s on edit.

# ADR-0007: Work-tree change management — git-like object model + intent event log (CRDT deferred)

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [canvas-and-visualization-tech](../02-research/canvas-and-visualization-tech.md), [data-layer-options](../02-research/data-layer-options.md)
  - [ADR-0002 Data layer](./ADR-0002-data-layer.md) (the object model is stored in Postgres)
  - [ADR-0004 Canvas rendering](./ADR-0004-canvas-rendering.md) (client `ExperimentStore.workTree` + intents map here)
  - [ADR-0001 Product surface](./ADR-0001-product-surface.md) (one `WorkTreeService`; identical semantics on web/MCP/CLI)
  - [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning.md), [change-management-worktree](../05-caw01-simulation-control-plane/change-management-worktree.md)
  - [open-questions](../08-research-plan/open-questions.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF.md)

## Purpose

Decide the **work-tree change-management object model** (SOURCE-BRIEF §6): the structure that tracks
**every selection and change across the three canvases**, supports **per-item save** (an individual
change/subtree) and **full save** (the whole tree), and serves as the **versioning/branching model** for
an experiment's configuration. This ADR fixes the *object model and its semantics*; the **storage
substrate** is [ADR-0002](./ADR-0002-data-layer.md), the **client shape** (`ExperimentStore`, intents)
is [ADR-0004](./ADR-0004-canvas-rendering.md), and the **service surface** (`WorkTreeService` on
web/MCP/CLI) is [ADR-0001](./ADR-0001-product-surface.md).

## Context

- Every change in any of the three canvases (C1 workload, C2 serving composition, C3 HW hierarchy) must
  be one **tracked tree of changes** with **per-item** and **full** save (SOURCE-BRIEF §5–§6).
- The brief frames the work tree as the **versioning/branching model** for an experiment config and
  asks (SOURCE-BRIEF §10) whether it should be CRDT, event log, or a git-like object model.
- **Provenance is first-class** (SOURCE-BRIEF §1, §11): each change must trace back to the canvas +
  entity it came from, preserving the evidence chain; history should be **auditable / append-only**.
- The unit of value is **one reproducible experiment** (SOURCE-BRIEF §1) — branching/comparing configs
  ("what-if") and reproducing an exact `(workload, hw config, sim config)` are core.
- **Concurrency reality at v1:** CAW-01 is **single-expert scale** ([data-layer-options](../02-research/data-layer-options.md));
  the dominant pattern is one author editing one experiment, not real-time multi-cursor co-editing.
- The client already produces an **ordered stream of edit intents** appended to `workTree`
  ([ADR-0004](./ADR-0004-canvas-rendering.md)); the persisted model must consume that stream.
- The store is **Postgres-spine** ([ADR-0002](./ADR-0002-data-layer.md)); whatever model we pick must be
  expressible as PG tables with strong referential integrity to the entities it versions.

## Options considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Git-like content-addressed object model** (blob/tree/commit/ref) **+ intent event log** | Branch/merge/diff/reproduce are native; commit = provenance (who/when/why); content-addressing dedupes config subtrees; per-item save = commit a subtree, full save = commit the dirty set; auditable & append-only; maps cleanly to the canvas branch-DAG UI; storable as plain PG tables | We implement commit/tree/diff logic (not free); merge across branches is non-trivial (deferred) | **Adopt** |
| **Pure event log / event sourcing** (append intents, fold to state) | Perfect audit; the intent stream already exists; trivial append | No first-class branch/version identity; "save a subtree" and "compare two configs" need a projection layer anyway; replay cost grows | **Adopt as the input layer feeding the object model**, not the whole answer |
| **CRDT** (e.g. Yjs/Automerge) | Real-time multi-writer convergence, offline-merge | Solves a problem we don't have at v1 (single-writer); weaker explicit named-version/branch + human-reviewable diff/provenance semantics; extra runtime + storage complexity | **Defer** until real-time multi-writer collaboration is a product need |
| **Relational temporal/closure tables only** | Stays in SQL | Branching is awkward; no natural commit/diff/provenance object; reinvents git poorly | Reject as the model (still the *storage* for the chosen model) |
| **"Git for data" engine (Dolt/Doltgres)** | Branch/merge built in | Heavier, less-standard engine; couples versioning to a specific DB | Defer; revisit only if table-level branch/merge dominates (see [ADR-0002](./ADR-0002-data-layer.md)) |

## Decision

**Adopt a git-like content-addressed object model fed by an append-only intent event log, stored as
Postgres tables. Defer CRDT until real-time multi-writer collaboration is an actual requirement.**

1. **Object model (git-like):**
   - **`change_blob`** — an immutable, content-addressed (hash) snapshot of a single versioned thing's
     state: a C1 node param set, a C2 wiring, a C3 part/component config.
   - **`change_tree`** — an ordered/typed map of named entries → blobs or sub-trees, mirroring the
     experiment's structure across the three canvases (workload / serving / hardware subtrees). This is
     the literal **"work tree."**
   - **`change_commit`** — `{root_tree, parents[], author, surface, message, created_at}`; provenance is
     intrinsic (who, when, from which surface/canvas, why). Append-only.
   - **`ref`** — named, movable pointers to commits: a default line per experiment plus user **branches**
     for what-if configs (the branch DAG in [ADR-0004](./ADR-0004-canvas-rendering.md)).
2. **Intent event log (input layer):** the client's ordered edit intents
   (`addComponent`/`editPart`/`wireStage`/`setNodeParam`, [ADR-0004](./ADR-0004-canvas-rendering.md))
   are appended to an **append-only `change_event` log**, each event carrying its origin
   `{panel, entityKind, entityId, partPath}` for provenance. The current *dirty* working state is the
   fold of un-committed events over the last commit. **Saving materializes events into blobs/trees/a
   commit.** Events are never mutated or deleted (audit), satisfying the evidence-chain guardrail.
3. **Per-item save = commit a subtree.** Saving an individual change/subtree writes only the affected
   blobs + the path of trees up to the root and advances the ref — the rest of the tree is shared by
   content address (no copy). **Full save = commit the whole dirty set** in one commit.
4. **Branch / diff / reproduce are object-model operations.** Branch = new ref off a commit; diff =
   structural compare of two trees (drives the work-tree diff pane); reproduce = check out a commit's
   tree to reconstruct an exact `(workload, hw config, sim config)` for a `SimulationRun`. A run records
   the **commit id** it executed, binding evidence to an exact config (SOURCE-BRIEF §1).
5. **Merge is intentionally minimal at v1:** branches exist for comparison/what-if; **fast-forward and
   manual pick are supported; automatic 3-way merge across divergent branches is deferred** (it is the
   main thing a CRDT or Dolt would buy, and we don't need it yet).
6. **One `WorkTreeService`** ([ADR-0001](./ADR-0001-product-surface.md)) implements these semantics
   once; web/MCP/CLI get identical per-item/full save, branch, diff, and reproduce behavior.
7. **Storage** is plain Postgres tables for blob/tree/commit/ref/event
   ([ADR-0002](./ADR-0002-data-layer.md)), with FKs to the entities they version; content addresses are
   hashes; large embedded payloads (if any) follow the blob-on-FS rule.

## Consequences

- **Easy:** branch/diff/reproduce and a human-reviewable, provenance-rich history are native; per-item
  vs full save fall out of subtree-vs-root commits with structural sharing; the branch DAG reuses the
  React Flow stack ([ADR-0004](./ADR-0004-canvas-rendering.md)); a run is reproducibly pinned to a
  commit id; semantics are identical across all surfaces via one service.
- **Hard / accepted:** we implement commit/tree/diff logic and content addressing ourselves; **no
  real-time multi-writer co-editing** until CRDT is added (single-writer-per-experiment is the v1
  assumption); automatic cross-branch merge is deferred; the event-log fold must stay correct and
  bounded (compact via commits).
- **Revisit triggers:** **add CRDT** when concurrent real-time multi-writer editing of one experiment
  becomes a product need; **add automatic 3-way merge** (or reconsider **Doltgres**, coordinating with
  [ADR-0002](./ADR-0002-data-layer.md)) when branch reconciliation becomes a dominant workflow.

## Open questions / revisit triggers

- `TODO(open-question: worktree-granularity)` — exact entry granularity of `change_tree` per canvas
  (one blob per C1 node? per C3 component? per micro-edit?) — needs product definition with the canvas teams.
- `TODO(open-question: event-log-compaction)` — when/how the intent event log is compacted into commits
  to bound replay cost.
- `TODO(open-question: crdt-trigger)` — concrete condition that flips v1 single-writer → CRDT multi-writer.
- `TODO(open-question: skills-as-versioned)` — are packaged skills versioned in this same work-tree?
  (coordinate with [ADR-0001](./ADR-0001-product-surface.md) / OQ-PS-5)
- `TODO(open-question: doltgres-vs-handrolled)` — revisit Doltgres vs the hand-rolled object model if
  table-level branch/merge dominates (coordinate with [ADR-0002](./ADR-0002-data-layer.md)).
- `TODO(open-question: run-commit-binding)` — does a `SimulationRun` pin a single commit, or a
  multi-canvas commit set, when axes are composed?

## Implications for runbooks

- **phase-0/phase-5-persistence** — RB to create the `change_blob/change_tree/change_commit/ref/
  change_event` tables (Postgres-portable, per [ADR-0002](./ADR-0002-data-layer.md)) with content
  addressing + FKs to versioned entities.
- **phase-1 / core** — RB for `WorkTreeService`: append intent events, fold dirty state, per-item commit
  (subtree) + full commit, branch, structural diff, checkout/reproduce; exposed identically to
  web/MCP/CLI ([ADR-0001](./ADR-0001-product-surface.md)).
- **phase-1 app shell** — RB for the work-tree UI (virtualized change tree, per-item/full save, diff
  pane, branch DAG) wired to the client `ExperimentStore` ([ADR-0004](./ADR-0004-canvas-rendering.md)).
- **simulation** — RB ensuring each `SimulationRun` records the commit id it executed (evidence binding).

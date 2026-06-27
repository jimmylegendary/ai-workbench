# ADR-0002: Data layer — Postgres-spine polyglot with an SQLite "start-here" stack

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [data-layer-options](../02-research/data-layer-options.md)
  - [ADR-0005 Trace pipeline](./ADR-0005-trace-pipeline.md) (produces artifacts/IR this layer stores)
  - [ADR-0007 Work-tree change management](./ADR-0007-change-management-worktree.md) (versioning object model stored here)
  - [ADR-0001 Product surface](./ADR-0001-product-surface.md) (the one core reaches this layer via repositories)
  - [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning.md), [change-management-worktree](../05-caw01-simulation-control-plane/change-management-worktree.md)
  - [open-questions](../08-research-plan/open-questions.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF.md)

## Purpose

Decide the **storage substrate(s)** for the CAW-01 data needs (SOURCE-BRIEF §9): which store holds
each entity class, the boundaries between stores, and the minimal **"start here"** stack for the first
vertical slice. CAW-01 is an **independent, standalone product** — one of a family of six separate
products (CAW-01..06) with **no shared runtime substrate**; these stores are **CAW-01's own**, not a
shared data layer that other products plug into. This ADR does **not** decide the work-tree *object model*
(that is
[ADR-0007](./ADR-0007-change-management-worktree.md)), the trace-pipeline boundaries
([ADR-0005](./ADR-0005-trace-pipeline.md)), or the API/ORM surface (that is the core in
[ADR-0001](./ADR-0001-product-surface.md)). It fixes *where bytes live*.

## Context

- The data is **four substrates with different shapes** (SOURCE-BRIEF §9): a tabular **simulation**
  substrate (+ large trace blobs), a dense-graph **memory-annotated IR**
  (`MemoryAnnotatedIR/TensorNode/DataMovementEdge/FillLevel`), a containment-tree **HW design** substrate
  (chip→…→cluster), and a versioned **work-tree** substrate. Alongside these, CAW-01 keeps a **lean
  run-evidence / provenance** record for **its own runs** only (Evidence attached to runs, trust-ladder
  status, the public/internal/confidential boundary, and claim→evidence for CAW-01's **own** generated
  conclusions).
- **Knowledge scope (out of scope here):** the general knowledge repository — ingesting external
  `Source/Claim/Note/Concept/Interest/OpenQuestion` — is a **separate product (CAW-02)** and is **not**
  modeled in CAW-01's data layer. CAW-01 may **export** evidence/projections/requirements that CAW-02 (or
  other independent products such as a paper/patent product, CAW-03) can consume; this is strictly an
  **export boundary between independent products**, never a shared store/registry/DB.
- It is **graph-shaped but small and bounded** (single-expert scale: thousands to low-millions of
  nodes), so graph-*shaped* does not imply a graph-*database*.
- **Provenance and the evidence chain are first-class** (SOURCE-BRIEF §1, §9 invariant, §11 guardrail):
  CAW-01's own generated conclusions point to evidence; generated summaries are **not** evidence. This
  biases toward append-only, referentially-strong, auditable storage — a relational strength.
- The brief mandates one engine reachable from **web app + CLI + MCP** ([ADR-0001](./ADR-0001-product-surface.md));
  the store must run behind repository interfaces so the surface set is storage-agnostic, and must
  support a **zero-ops local** mode for the CLI/MCP and the first slice (SOURCE-BRIEF §11: small
  vertical slices over broad scaffolding).
- Only a *slice* of the data wants semantic recall ("find similar runs/IRs", text on CAW-01's own
  evidence/decision notes); metrics and HW hierarchy want exact filters and exact tree walks, not fuzzy
  recall.

## Options considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Single relational SQL (Postgres; SQLite for dev)** | Tabular sim substrate is native; FK enforces claim→evidence; append-only audit trivial; JSONB absorbs L0/L1/L2 (same schema, varying completeness); adjacency+recursive CTE handles bounded HW tree & shallow IR; one store to operate; `pgvector` folds in semantic search later | Deep (>3–4 hop) IR traversal degrades vs native graph; blobs must not live in rows | **Spine** |
| Vector DB as system of record (Qdrant/Chroma/LanceDB) | Great ANN recall | No integrity, no aggregation, no audit; second store + sync | Retrieval aid only |
| Graph DB (Neo4j) | Deep multi-hop / centrality ~2 orders faster | Second datastore, JVM ops, Cypher, split-brain sync vs SQL system-of-record; costs dominate at our scale | Reject now; revisit via Apache AGE first |
| md-first / git only | Human-diff-able, branchable, free provenance | No integrity/aggregation/indexed query; bad for metrics loop & dense IR | Keep for authored narrative + blobs only |
| "Git for data" (Dolt/Doltgres) | Versioned + relational in one | Heavier, less-standard engine | Defer; revisit only if table-level branch/merge dominates |

## Decision

**Adopt a Postgres-spine polyglot design with explicit store boundaries, and start the first slice on
SQLite kept Postgres-portable.**

1. **Postgres is the system of record / spine.** Everything queryable lives there; specialized concerns
   attach as **in-database extensions or sidecars**, not as separate systems.
2. **Large blobs never live in rows.** `TraceArtifact` bytes, Chakra ET, OTel traces, raw sub-torch
   dumps, raw `InputTrace` go to the **filesystem / object store**, addressed by path/URI from a PG row.
   (This is the artifact store that [ADR-0005](./ADR-0005-trace-pipeline.md) and
   [ADR-0001](./ADR-0001-product-surface.md) hand paths across the TS⇆Python seam.)
3. **Semantic search is `pgvector` inside the same Postgres** — added only when "find similar
   runs/IRs" becomes a real user need. No second vector store at single-expert scale.
4. **Graphs stay in Postgres** (adjacency/edge tables + recursive CTEs) for the bounded HW tree (~6
   levels) and shallow IR neighborhoods. If deep traversal becomes a measured hot-path problem, adopt
   **Apache AGE** (openCypher *inside* PG) before ever standing up **Neo4j**.
5. **git markdown/json stays the source of truth for authored narrative** (`Decision`, `OpenQuestion`,
   `Assumption`, `Note`, `ArchitectureProposal`) and is **projected into Postgres** (frontmatter →
   upsert) as a queryable index/derivative. PG is the index; git is the truth for prose.
6. **Generated ≠ evidence is modeled, not assumed.** Rows carry `evidence_kind` / `is_generated`; the
   claim→evidence FK may only resolve to non-generated rows (SOURCE-BRIEF §9 invariant, §11 guardrail).

### Store-boundary table (load-bearing)

| Entity / concern | Lives in | Why |
|---|---|---|
| `SimulationRun, SimulationConfig, Metric, ResultSet, WorkloadModel, InputTrace(meta), MemoryProductRequirement` | **Postgres relational** | tabular; compared/aggregated; integrity matters |
| `TraceArtifact` bytes, Chakra/OTel/sub-torch trace files, raw `InputTrace` | **FS/object store**, path in PG | blobs kill row stores; keep addressable |
| `Evidence, Claim (CAW-01's own generated conclusions), Decision, OpenQuestion, Assumption` | **Postgres rows** (+ claim→evidence FK, `is_generated`) | enforce evidence invariant for CAW-01's own runs |
| General knowledge entities (`Source, Note, Concept, Interest`, broad ingest) | **Not here — CAW-02 (separate product)** | out of scope; consumed/produced only across an export boundary |
| Authored narrative for `Decision/OpenQuestion/Assumption/Note/ArchitectureProposal` | **git md/json**, projected into PG | human-diff-able truth; PG is the index |
| Embeddings (run/IR feature vectors + CAW-01's own evidence/decision text) | **pgvector** in same PG (deferred) | semantic recall without a second store |
| `MemoryAnnotatedIR, TensorNode, DataMovementEdge, FillLevel (L0/L1/L2)` | **Postgres**: IR header row + node/edge tables, JSONB attrs | same schema across fill levels; shallow graph ops in SQL |
| HW `chip/die/package/tray/rack/cluster` + components + edits | **Postgres** adjacency tables + recursive CTE | bounded depth; drill-down by path |
| Work-tree commit/tree/blob/ref + change event log | **Postgres** tables (model = [ADR-0007](./ADR-0007-change-management-worktree.md)) | queryable history; integrity with versioned entities |

### "Start here" minimal stack (first vertical slice)

1. **SQLite** (schema authored Postgres-portable via an ORM/migration tool targeting both) holds the
   relational core + run-evidence/provenance rows + IR node/edge tables + HW adjacency tables + work-tree
   tables.
2. **Filesystem** for all blobs, referenced by path.
3. **git** for authored decisions/open-questions/assumptions, with a tiny projector upserting
   frontmatter into the DB.
4. **No vector DB, no graph engine yet.** Runs the web app, CLI, and MCP server off one file at zero
   infra cost, with a clean migration path because the schema is portable from day one.

## Consequences

- **Easy:** one store to reason about; the metrics-comparison value loop ("comparable projection") and
  the claim→evidence invariant are native; zero-ops local dev for all three surfaces; cheap path to
  semantic search (in-place `pgvector`) and to Cypher (in-place Apache AGE).
- **Hard / accepted:** deep IR analytics are awkward in SQL until/unless AGE is added; the
  L1/L2 IR extensions and trace side-channels (from [ADR-0005](./ADR-0005-trace-pipeline.md)) ride as
  JSONB/edge attrs rather than a bespoke graph schema; a git→DB projector must be built and kept one-way
  by default.
- **Escalation triggers:** **SQLite→Postgres** on concurrent multi-writer access, pgvector need,
  CTE/JSONB strain, or deploying beyond a single local process. **Add pgvector** on first real
  semantic-search need. **Add Apache AGE** only when *all* of: hot-path traversals routinely exceed
  ~3–4 hops; recursive-CTE latency is *measured* to hurt UX; graph algorithms become product features.
  **Neo4j** only if AGE proves insufficient. **Doltgres** only if table-level branch/merge becomes the
  dominant requirement (coordinate with [ADR-0007](./ADR-0007-change-management-worktree.md)).
- Follow-on: standing up the portable schema, the blob-on-FS path convention, and the git→DB projector
  (see Implications for runbooks).

## Open questions / revisit triggers

- `TODO(open-question: confirm single-expert scale ceiling — node/row counts keeping SQLite/PG-CTE viable)`
- `TODO(open-question: measured latency threshold for IR traversal that triggers Apache AGE)`
- `TODO(open-question: Doltgres vs git-projection vs PG-temporal for work-tree — coordinate with ADR-0007)`
- `TODO(open-question: embedding model + dim for pgvector, and which entities get embedded first)`
- `TODO(open-question: object-store choice for TraceArtifact blobs — local FS vs S3-compatible — retention/audit policy)`
- `TODO(open-question: does syntorch HW-design layer persist its own format we must mirror, or is PG the only HW store? — do not assume beyond SOURCE-BRIEF §7)`
- `TODO(open-question: git→DB projection direction — is git always source of truth, or can the app write back?)`

## Implications for runbooks

- **phase-0-foundations** — RB to stand up the SQLite (Postgres-portable) schema: relational core,
  run-evidence/provenance rows with claim→evidence FK + `is_generated`, IR header + node/edge tables, HW
  adjacency tables, work-tree tables; plus the blob-on-FS path convention.
- **phase-0 / phase-5** — RB for the git→DB projector (md/json frontmatter → upsert).
- **phase-5-persistence-and-api** — RB for the SQLite→Postgres switch + guarded `pgvector` enablement;
  RB for recursive-CTE drill-down queries (HW hierarchy + IR neighborhood) exposed via the core/MCP.
- Defers the versioning *object model* to [ADR-0007](./ADR-0007-change-management-worktree.md) and the
  IR fill mechanics to [ADR-0005](./ADR-0005-trace-pipeline.md).

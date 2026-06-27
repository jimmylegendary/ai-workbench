# Data Layer Options

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [ADR-0002 Data layer](../01-decisions/ADR-0002-data-layer.md), [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning.md), [change-management-worktree](../05-caw01-simulation-control-plane/change-management-worktree.md), [open-questions](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This document decides **where CAW-01's own data is stored**. CAW-01 is an **independent, standalone
product** — one of a family of six separate products (CAW-01..06), each separately implemented and
deployed with **no shared runtime substrate**. This decision is scoped to CAW-01 alone; it does not
provision storage for any other product. It compares relational SQL, vector DB, graph DB, and a
markdown/file-first + git approach honestly against *this specific* workload (SOURCE-BRIEF §9), then
proposes a concrete **polyglot design** with explicit store boundaries and a minimal **"start here"
stack** for the first vertical slice. It feeds the formal decision in
[ADR-0002](../01-decisions/ADR-0002-data-layer.md).

**Knowledge scope (important).** CAW-01 keeps only the **minimal run-evidence and provenance** it needs
for *its own* runs: Evidence attached to runs, a trust ladder, the public/internal/confidential
boundary, and a claim→evidence link for *CAW-01's own generated conclusions*. The **general knowledge
repository** — ingesting external `Source`/`Claim`/`Note`/`Concept`/`Interest`/`OpenQuestion` — is a
**separate product (CAW-02)** and is **out of scope here**. CAW-01 may *export* its evidence and
projections to CAW-02 across a product boundary, but does not model CAW-02's entities in its own data
layer.

It does **NOT** decide: the work-tree change-management object model (CRDT vs event-log vs git-like —
that is ADR-0007 / [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning.md)), the
trace pipeline boundaries (ADR-0005), or the API/ORM surface (07-backend-api). It only decides the
*storage substrate(s)* and where each entity class lives.

## What the data actually is (and why naive "just pick one" fails)

The substrates CAW-01 owns (SOURCE-BRIEF §9), with very different shapes. Note that the broad knowledge
repository is **not** here — it belongs to CAW-02 (separate product); CAW-01 keeps only lean
run-evidence + provenance:

| Substrate | Entities | Dominant shape | Read pattern |
|---|---|---|---|
| **Run evidence / provenance** | `Evidence, Provenance, GeneratedConclusion` (conclusion→evidence) + trust-ladder + public/internal/confidential boundary | small graph (conclusion→evidence) + some text | provenance traversal for *its own* runs |
| **Simulation** | `WorkloadModel, InputTrace, SimulationConfig, SimulationRun, TraceArtifact, Metric, ResultSet, ArchitectureProposal, MemoryProductRequirement` | relational/tabular (runs, configs, metrics) + large blob artifacts | filter/aggregate/compare rows |
| **Memory-annotated IR** | `MemoryAnnotatedIR, TensorNode, DataMovementEdge, FillLevel (L0/L1/L2)` | dense directed graph (tensor/op nodes, movement edges) | subgraph load, neighborhood, per-node attrs |
| **HW design** | chip→die→package→tray→rack→cluster + components + edits | strict containment tree/DAG + part overrides | drill-down by path, micro-edits on a part |
| **Work tree** | versioned change trees across the 3 canvases | version DAG / change log | diff, branch, per-item + full save |

Three honest observations that drive everything below:

1. **It is graph-shaped, but the graphs are small and bounded.** A conclusion→evidence chain, an IR for
   one agent turn, a single cluster hierarchy. This is *single-expert scale* initially — thousands to low
   millions of nodes, not billions. Graph-*shaped* does not automatically mean graph-*database*.
2. **Provenance/audit + versioning are first-class, not nice-to-have.** The brief's whole thesis is
   "preserve the evidence chain"; CAW-01's *own* generated conclusions must point to evidence and
   generated summaries are *not* evidence (§9 invariant, §11 guardrail). That biases toward
   **append-only / auditable** storage and strong referential integrity — a relational strength, not a
   vector-DB strength.
3. **Only a slice needs semantic retrieval.** Embeddings help "find similar runs/IRs" and search the
   text on CAW-01's own evidence/conclusions. The simulation metrics and HW hierarchy do **not** want
   fuzzy recall; they want exact filters and exact tree walks.

## Capability matrix — need × store class

Scoring for **this** workload at **single-expert scale**. ✓✓ strong · ✓ adequate · ~ possible-but-awkward · ✗ poor.

| Need | Relational SQL (Postgres/SQLite) | Vector DB (pgvector/Qdrant/LanceDB/Chroma) | Graph DB (Neo4j) | md-first + git |
|---|---|---|---|---|
| Tabular runs/configs/metrics, filter+aggregate+compare | ✓✓ | ✗ | ~ | ~ (grep/parse) |
| Referential integrity (conclusion→evidence must resolve) | ✓✓ | ✗ | ✓ | ✗ (manual) |
| Provenance / audit trail | ✓✓ (append-only tables, triggers) | ~ | ✓ | ✓✓ (commit history) |
| Versioning / branching of config (work tree) | ~ (closure/temporal tables) | ✗ | ~ | ✓✓ (native git) |
| Containment hierarchy (chip→…→cluster) drill-down | ✓ (adjacency + recursive CTE, ≤6 levels) | ✗ | ✓✓ | ~ |
| Dense IR graph: subgraph load, neighborhood | ✓ (edge table, shallow) | ✗ | ✓✓ (deep multi-hop) | ✗ |
| Deep multi-hop path/centrality/"how connected" | ~ (CTE, slows >3–4 hops) | ✗ | ✓✓ | ✗ |
| Semantic retrieval (similar runs/IRs + own evidence text) | ✓ via **pgvector** | ✓✓ | ~ (needs plugin) | ✗ |
| Single-process, zero-ops local dev | ✓✓ (SQLite) | ✓ (LanceDB/Chroma embedded) | ✗ (server/JVM) | ✓✓ |
| Human-readable, diff-able source of truth | ~ | ✗ | ✗ | ✓✓ |
| One store to operate (ops burden) | ✓✓ | adds one | adds one (JVM) | ✓✓ |
| Large blob artifacts (Chakra/OTel traces, GBs) | ✗ (use object store + path) | ✗ | ✗ | ~ (git-LFS) |

**Reading of the matrix:** Postgres is the only column that is *adequate-or-better across almost every
row*, and pgvector folds the semantic column into it. The graph column wins decisively only on **deep
multi-hop** queries; the md-first column wins decisively only on **human-diff-able versioned source of
truth**. Nothing wins on blobs — those belong on the filesystem/object store with a path reference.

## Per-option honest take

### Relational SQL — Postgres (prod) / SQLite (dev, embedded)
- **Why it fits:** the simulation substrate *is* tabular; metrics comparison/aggregation is the core
  value loop ("comparable projection"). Foreign keys enforce the conclusion→evidence invariant for free.
  Append-only audit is trivial. JSONB absorbs the semi-structured edges of L0/L1/L2 without schema
  churn (L0/L1/L2 are the *same schema at different completeness* per §1 — a nullable/JSONB-friendly
  fact, not three tables).
- **Graphs in Postgres:** adjacency-list edge tables + recursive CTEs handle the HW hierarchy (bounded
  6 levels) and shallow IR neighborhoods fine. Benchmarks show recursive CTEs are competitive for
  shallow neighborhood expansion but degrade past ~3–4 hops vs a native graph engine.
- **Watch-outs:** deep IR analytics get awkward; large trace blobs must NOT live in rows.
- **Embedded variant:** SQLite gives a zero-ops single-file DB for the first slice and the CLI/MCP
  surfaces; the schema can be kept Postgres-compatible to migrate later.

### Vector DB — pgvector / Qdrant / LanceDB / Chroma
- **Role:** *retrieval aid*, never system of record. Embeds feature-vectors on runs/IRs and text on
  CAW-01's own `Evidence`/`GeneratedConclusion` for "find similar."
- **pgvector** (Postgres extension, HNSW + IVFFlat, scalar/binary quantization) is the pragmatic pick
  *because we already run Postgres* — no second store, embeddings sit next to the rows they describe,
  joins stay in SQL. Single-instance HNSW handles our scale comfortably.
- **Qdrant** is faster/scales better for pure vector workloads at large scale, but adds a service and a
  sync problem; not justified at single-expert scale.
- **LanceDB / Chroma** are embedded/local-first — attractive for the dev slice, but choosing them over
  pgvector means a *second* store and a sync job for no benefit once Postgres is present.
- **Verdict:** use **pgvector inside the same Postgres**; revisit Qdrant only if vector volume or QPS
  outgrows a single PG node.

### Graph DB — Neo4j
- **Where it genuinely wins:** deep multi-hop traversal, pathfinding ("show every way conclusion X
  connects to evidence Y"), centrality/community over the IR or evidence graph — reported as ~2 orders of
  magnitude faster than recursive CTEs once depth and relationship counts grow.
- **Cost:** a second datastore, JVM/server ops, a second query language (Cypher), and a *split brain*
  between graph and the SQL system-of-record (sync + transactional consistency across stores).
- **At our scale these costs dominate the benefits.** The graphs are small and the hot queries are
  drill-down + shallow neighborhood, not fraud-ring analytics.
- **Middle path:** **Apache AGE** (openCypher *inside* Postgres) buys Cypher ergonomics without a
  second server if/when graph queries get gnarly — a much smaller step than standing up Neo4j.

### md-first / file-first + git
- **Where it genuinely wins:** human-readable, diff-able, branchable source of truth with free
  provenance (commit = who/when/why). Naturally fits CAW-01's own authored design artifacts —
  `Decision`, `OpenQuestion`, `Assumption`, and `ArchitectureProposal` — the *narrative* knowledge that
  humans author and review, and that the design repo (this very folder) already stores this way. (The
  general external-knowledge repository is CAW-02, not modeled here.)
- **Where it fails:** no integrity, no aggregation, no indexed query, terrible for the metrics
  comparison loop or dense IR graphs. git-LFS can hold trace blobs but is clunky as a primary store.
- **Verdict:** keep it for the **authored knowledge / decisions layer and large artifacts**, *projected
  into* Postgres for query — git stays source of truth for prose; Postgres is the index/derivative.
- **"Git for data" note:** Dolt/Doltgres (Prolly-tree versioned SQL) is a tempting single answer to
  "versioned + relational," but it is a heavier, less-standard engine; prefer plain Postgres + an
  explicit work-tree model (ADR-0007) and revisit Dolt only if table-level branch/merge becomes the
  dominant requirement. `TODO(open-question: evaluate Doltgres vs git-projection for work-tree)`.

## Recommended polyglot design (store boundaries)

**Postgres is the spine.** Everything queryable lives there; specialized concerns attach as extensions
or sidecars rather than separate systems.

```
                         ┌────────────────────────────────────────────┐
   git repo (md/json) ──►│  PROJECTION / INGEST                        │
   (authored knowledge,  │  parse md+frontmatter → upsert rows         │
    decisions, proposals)└───────────────┬────────────────────────────┘
                                          ▼
   ┌──────────────────────────── PostgreSQL (system of record) ───────────────────────────┐
   │  relational core          │  pgvector            │  graph-in-PG (edge tables + CTE,    │
   │  - simulation substrate   │  - embeddings on      │   optional Apache AGE later)        │
   │  - HW hierarchy (adjacency)│   Evidence/Conclusion │  - conclusion→evidence, IR          │
   │  - run-evidence rows (FKs)│   + run/IR feature     │   tensor/edge, chip→…→cluster edges │
   │  - work-tree metadata     │   vectors              │                                     │
   └──────────────┬───────────────────────────────────────────────────────────────────────┘
                  │ path/URI references (never blobs in rows)
                  ▼
   filesystem / object store:  TraceArtifact, Chakra ET, OTel traces, raw InputTrace (large blobs)
```

**Boundary rules (the load-bearing decisions):**

| Entity / concern | Lives in | Why |
|---|---|---|
| `SimulationRun, SimulationConfig, Metric, ResultSet, WorkloadModel, InputTrace(meta)` | Postgres relational | tabular, compared/aggregated; integrity matters |
| `TraceArtifact` bytes, Chakra/OTel trace files | **filesystem/object store**, path in PG | blobs kill row stores; keep them addressable |
| `Evidence, Provenance, GeneratedConclusion` (+ FK for conclusion→evidence) | Postgres rows | enforce "own conclusions point to evidence" invariant; trust ladder + public/internal/confidential boundary |
| Authored narrative for `Decision/OpenQuestion/Assumption/ArchitectureProposal` | **git md/json**, projected into PG | human-diff-able source of truth; PG is the index |
| Embeddings (run/IR feature vectors + own evidence text) | **pgvector** in same PG | semantic recall without a second store |
| `MemoryAnnotatedIR, TensorNode, DataMovementEdge, FillLevel` | PG: IR header row + node/edge tables (JSONB attrs) | same schema across L0/L1/L2; shallow graph ops in SQL |
| HW `chip/die/package/tray/rack/cluster` + components + edits | PG adjacency tables + recursive CTE | bounded depth (~6); drill-down by path |
| Work-tree change trees, per-item/full save | PG tables modeling the version DAG (model = ADR-0007) | queryable history; integrity with the entities it versions |

**Generated-vs-evidence separation (guardrail §11):** model `evidence_kind` / `is_generated` flags so
summaries can never masquerade as evidence; the conclusion→evidence FK only points at non-generated
rows. Keep the public/internal/confidential boundary on evidence so confidential data never leaks into
public outputs and public research is never conflated with internal Samsung/SAIT claims.

**Export boundary, not a shared store:** if CAW-01 hands evidence/projections/requirements to another
independent product (e.g. CAW-02's knowledge repo, or CAW-03 a paper/patent product), that crossing is
an explicit **export between products** — a serialized artifact handed over a boundary — never a shared
table, registry, or database.

## "Start here" minimal stack (first vertical slice)

Goal: prove the workflow semantics of *one reproducible experiment* end to end with the **least** ops.

1. **SQLite** (Postgres-compatible schema, via an ORM/migrations that target both) as the single store
   for the relational core + run-evidence/provenance rows + IR node/edge tables + work-tree metadata.
2. **Filesystem** for `TraceArtifact` / Chakra / OTel blobs, referenced by path.
3. **git** for authored decisions/open-questions/assumptions as md (the design repo already does this);
   a tiny projector upserts frontmatter into the DB.
4. **No vector DB, no Neo4j yet.** Add `pgvector` only when semantic search becomes a real user need
   (and at that point flip SQLite→Postgres). Add graph engine only on the trigger below.

This stack runs the web app, CLI, and MCP server off one file, costs zero infra, and keeps a clean
migration path to Postgres because the schema is kept portable from day one.

## Decision triggers (when to escalate)

**Add Postgres (from SQLite) when** any of: concurrent multi-writer access; pgvector needed; JSONB/CTE
query volume strains SQLite; deploying the web app beyond a single local process.

**Add pgvector when** users need "find similar runs/IRs" or semantic search over CAW-01's own evidence —
not before. It is an in-place extension, so this is cheap.

**Add a graph engine (Apache AGE first, Neo4j only if AGE is insufficient) when** *all* of: (a) IR or
evidence graphs routinely exceed ~3–4 hop traversals in hot paths; (b) recursive-CTE latency is
measured (not assumed) to hurt UX; (c) graph algorithms (centrality, community, all-paths) become
product features. Prefer **Apache AGE** (Cypher in PG, no second server) before standing up Neo4j with
its JVM ops and cross-store sync. `TODO(open-question: define the latency threshold that triggers AGE)`.

**Keep md-first git as source of truth for** authored narrative + large artifacts indefinitely; do not
migrate prose into DB-as-truth. Revisit **Doltgres** only if table-level branch/merge dominates.

## Open Questions

- `TODO(open-question: confirm single-expert scale ceiling — node/row counts that keep SQLite/PG-CTE viable)`
- `TODO(open-question: define measured latency threshold for IR/knowledge traversal that triggers Apache AGE)`
- `TODO(open-question: Doltgres vs git-projection vs PG-temporal for the work-tree versioning substrate — coordinate with ADR-0007)`
- `TODO(open-question: embedding model + dim for pgvector, and which entities get embedded first)`
- `TODO(open-question: object-store choice for TraceArtifact blobs — local FS vs S3-compatible — and retention/audit policy)`
- `TODO(open-question: does syntorch HW-design layer emit its own persisted format we must mirror, or is PG the only HW store? do not assume beyond SOURCE-BRIEF §7)`
- `TODO(open-question: git→DB projection direction — is git always source of truth for authored knowledge, or can the app write back?)`

## Implications for runbooks

- **phase-0-foundations** — RB to stand up the SQLite (Postgres-portable) schema: relational core,
  run-evidence/provenance rows with conclusion→evidence FK + `is_generated` flag + public/internal/
  confidential boundary, IR node/edge tables, HW adjacency tables, work-tree metadata tables; plus the
  blob-on-FS path convention.
- **phase-0/phase-5** — RB for the git→DB projector (md/json frontmatter → upsert) for authored
  decisions/proposals.
- **phase-5-persistence-and-api** — RB for the SQLite→Postgres migration switch and the pgvector
  enablement (guarded behind the "add pgvector" trigger); RB for the recursive-CTE drill-down queries
  (HW hierarchy + IR neighborhood) exposed via the backend API/MCP.
- These runbooks implement boundaries set here and defer the versioning *object model* to
  [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning.md) (ADR-0007).

---

Sources: [pgvector vs Qdrant (Tiger Data)](https://www.tigerdata.com/blog/pgvector-vs-qdrant) ·
[Vector DB benchmarks 2026](https://callsphere.ai/blog/vector-database-benchmarks-2026-pgvector-qdrant-weaviate-milvus-lancedb) ·
[Neo4j vs Postgres CTE traversal](https://www.pedroalonso.net/blog/graphrag-vs-vector-postgres/) ·
[SQLite as a graph DB (recursive CTEs)](https://dev.to/rohansx/sqlite-as-a-graph-database-recursive-ctes-semantic-search-and-why-we-ditched-neo4j-1ai) ·
[Apache AGE](https://age.apache.org/) ·
[Dolt — Git for Data](https://github.com/dolthub/dolt)

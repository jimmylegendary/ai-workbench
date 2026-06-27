# Knowledge Store Storage Options

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** ../_meta/PRODUCT-BRIEF.md, ../01-decisions/ (ADR: storage — to be written), ../08-research-plan/open-questions.md
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **v0 storage** for CAW-02's OWN knowledge store: how to physically persist the
`Source → Claim → Evidence → Note` provenance chain so it is (a) human-diffable and reconstructable, (b) cheaply
queryable, (c) portable between SQLite and Postgres, and (d) upgradable to a graph / continual-learning model
**without a rewrite**. It compares markdown-first vs SQLite vs Postgres vs hybrid, recommends a concrete v0, and
defines the graph-upgrade path. It does NOT decide retrieval ranking (keyword vs vector — separate ADR), the API/MCP/CLI
surface, or the import/export wire formats; it only fixes what those layers read/write against.

## Constraints carried from the brief
- Scale: **single curator (Jimmy) + small team** + AI agents writing via a skill interface. Not org/multi-tenant scale.
- **Reconstructability** is a hard requirement: the chain that produced a synthesis must be replayable.
- **Append-only history** preferred; generated summaries are NOT evidence and must stay structurally distinct.
- Every item carries a `boundary` (public / internal / confidential) and a **team vs Jimmy-private** flag.
- Large artifacts (imported CAW-01 projections, traces) are stored **by path/URI**, never inlined.
- **No shared substrate** — this store is private to CAW-02; other products touch it only via import/export files/APIs.
- **No heavyweight graph DB (e.g. Neo4j) in v1**, but the upgrade path must stay open.

## The core tension
Two properties pull in opposite directions:
1. **Trust & reconstructability** → favors plain files in git: human-diffable, signed history, no opaque binary, easy
   to audit "who changed this claim and why", survives the product itself being rewritten.
2. **Query & linking** → favors a relational store: enforce the `Claim → Evidence` invariant, traverse links, filter
   by boundary/trust, feed retrieval — all awkward to do over a pile of files.

The market in 2026 has converged on resolving this with a **markdown-as-source-of-truth + derived index** split
(Karpathy-style "LLM wiki", `sqlite-memory`, `memweave`, `zk_index`): files are canonical and committed; a rebuildable
SQLite index provides FTS/links/vectors. We adopt that split.

## Capability matrix

| Capability | Markdown-only (git) | SQLite-only | Postgres-only | **Hybrid: md SoT + SQLite index (recommended)** |
|---|---|---|---|---|
| Human-diffable / git-auditable | Excellent | Poor (binary) | Poor | **Excellent** (files canonical) |
| Reconstructable provenance chain | Manual/by convention | Good (FK) | Good (FK) | **Good** (files carry it; index mirrors) |
| Enforce `Claim→Evidence` invariant | None | Good (FK + CHECK) | Excellent (FK + triggers) | **Good** (validator on ingest + FK in index) |
| Link traversal / "what do we know about X" | Painful (grep) | Good (recursive CTE) | Good (CTE / ltree / AGE) | **Good** (CTE over index) |
| Append-only history | Native (commits) | Manual (event table) | Manual (event table) | **Native** (commits) + event mirror |
| Boundary/trust filtering at query time | Poor | Good | Good | **Good** (index columns) |
| Zero-infra / single-binary deploy | Excellent | Excellent | Poor (server) | **Excellent** (index is a local file) |
| Concurrent multi-writer (team + agents) | Git merge conflicts | Single-writer lock | Excellent (MVCC) | **OK** (PR/merge for files; index rebuilt) |
| Full-text search | None built-in | FTS5 | tsvector | **FTS5** now, tsvector after port |
| Vector / semantic retrieval (later) | None | sqlite-vec ext | pgvector | **sqlite-vec → pgvector** on port |
| Graph upgrade path | Rebuild required | Recursive CTE → edges table | CTE → Apache AGE / ltree | **Edge table → CTE → AGE** (no SoT rewrite) |
| Portability SQLite↔Postgres | N/A | Need disciplined SQL | N/A | **Yes** if schema stays portable-subset |
| Backup / DR | git remote | copy file | pg_dump | **git remote** (SoT) + rebuildable index |

## Recommended v0: markdown-first source of truth + rebuildable SQLite index

**Decision (proposed for ADR-storage):** Files in a git repo are the **single source of truth**. A SQLite database is a
**derived, disposable index** that any surface (API/MCP/CLI/viewer) queries but never treats as canonical. The index is
**fully reconstructable from files** at any time (`reindex` is idempotent). Schema is kept to a **portable subset** so the
exact same DDL/queries run on Postgres when team write-concurrency demands it.

### Why this and not the alternatives
- **vs markdown-only:** keeps git's trust/diff/history but adds the query/invariant layer agents need. The store's value
  is *typed provenance transactions*; pure grep cannot enforce `Claim→Evidence` or answer "with what trust level".
- **vs SQLite-only / Postgres-only:** a binary DB as SoT loses human-diffable history and ties reconstructability to the
  product's own code. If CAW-02 is rewritten, the knowledge must survive as plain files. Postgres also breaks the
  zero-infra, single-curator default and is overkill at this scale.
- **vs Postgres now:** Postgres is the **portability target**, not the v0 default. Adopt it only when concurrent team
  writers or AGE/pgvector are actually needed (revisit trigger below), porting the same portable-subset schema.

### File layout (source of truth)
```
knowledge/
  sources/<source-id>.md        # raw source descriptor (URI/path, type, boundary, imported-from)
  claims/<claim-id>.md          # one claim; frontmatter links evidence-ids (>=1 required)
  evidence/<evidence-id>.md     # points at a concrete artifact/source — never free text
  notes/<note-id>.md            # synthesis (cited); explicitly marked generated, NOT evidence
  concepts/, interests/, decisions/, open-questions/, assumptions/
  signals/<signal-id>.md        # RelatedWork / RadarSignal intake (classified, not loose summary)
  _events/<ts>-<op>.jsonl       # append-only transaction log (mirrors each skill-wrap write)
.git/                           # append-only history, signed commits, blame = provenance
```
Each `.md` = **YAML frontmatter (typed fields) + markdown body (human note)**. Frontmatter is the machine contract;
the body is for humans. IDs are stable, content-addressable-friendly slugs (e.g. `clm_2026_<hash>`).

### Minimal portable index schema (rebuilt from files)
Keep to the **SQLite∩Postgres subset**: `TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` ids, FKs, CHECK constraints; no
SQLite-specific or PG-specific types in the core tables. One generic **edge table** is the keystone of the upgrade path.

```sql
CREATE TABLE node (
  id         TEXT PRIMARY KEY,           -- = filename id; mirror of the file
  kind       TEXT NOT NULL,              -- source|claim|evidence|note|concept|interest|
                                         -- open_question|decision|assumption|signal|trace|...
  boundary   TEXT NOT NULL CHECK (boundary IN ('public','internal','confidential')),
  visibility TEXT NOT NULL CHECK (visibility IN ('team','private')),
  trust      TEXT,                       -- trust level (provenance ADR owns the vocabulary)
  artifact_uri TEXT,                     -- for evidence/trace: path/URI to the real artifact
  file_path  TEXT NOT NULL,              -- path to the canonical .md
  content_hash TEXT NOT NULL,            -- detects drift between file and index
  created_at TIMESTAMP NOT NULL
);

-- Generic typed relationship. This single table is what makes a future graph a no-op.
CREATE TABLE edge (
  src_id   TEXT NOT NULL REFERENCES node(id),
  dst_id   TEXT NOT NULL REFERENCES node(id),
  rel      TEXT NOT NULL,   -- supports|refutes|cites|extracted_from|evidence_for|relates_to|...
  PRIMARY KEY (src_id, dst_id, rel)
);

-- Append-only mirror of the _events log, for reconstructability queries without git.
CREATE TABLE event (
  seq INTEGER PRIMARY KEY, ts TIMESTAMP NOT NULL,
  op TEXT NOT NULL, node_id TEXT, payload TEXT  -- JSON
);
```
- **Invariant enforcement (`Claim→Evidence`):** every `node.kind='claim'` MUST have ≥1 `edge(rel='evidence_for')` to a
  node of kind `evidence`. Enforced by the **ingest validator** (and re-checked on `reindex`); a portable FK cannot
  express "≥1 of a typed edge", so it lives in the writer/validator, not a DB trigger. This keeps the rule identical on
  SQLite and Postgres.
- **FTS:** a separate `node_fts` (SQLite FTS5) is layered on top and is purely derived — never canonical, dropped/rebuilt
  freely. On Postgres it becomes a `tsvector` column. Keeping it out of the core tables preserves portability.
- **Vectors (deferred to retrieval ADR):** add a `node_vec` table via `sqlite-vec`; on Postgres → `pgvector`. Same
  pattern: derived, rebuildable, isolated from the portable core.

### Explicit boundaries of this design
- The index is **authoritative for nobody.** Any disagreement between file and index is resolved by `reindex` from files.
- `content_hash` mismatch on read ⇒ index is stale ⇒ trigger rebuild; never silently trust the row.
- Large artifacts (CAW-01 projections/traces) live outside `knowledge/` and are referenced by `artifact_uri`; the import
  boundary copies only **public-safe** projections and stamps `boundary` — confidential payloads never enter the repo.
- The `_events` JSONL + git commits are the two append-only ledgers; the `event` table is a convenience mirror, not a
  third source of truth.

## Provenance modeling: rows AND files, in lockstep
The chain is modeled the **same shape** in both representations, so neither drifts:

| Domain step | File (SoT) | Index rows |
|---|---|---|
| add source | `sources/<id>.md` | `node(kind=source)` |
| extract claim | `claims/<id>.md` (frontmatter: evidence ≥1) | `node(kind=claim)` + `edge(claim→evidence, evidence_for)` |
| attach evidence | `evidence/<id>.md` (artifact_uri) | `node(kind=evidence, artifact_uri)` + `edge(evidence→source, extracted_from)` |
| synthesize note | `notes/<id>.md` (marked generated) | `node(kind=note)` + `edge(note→claim, cites)` |
| classify signal | `signals/<id>.md` | `node(kind=signal)` + `edge(signal→claim, supports|refutes)` |

"Reconstruct how synthesis N was reached" = walk `note → cites → claim → evidence_for → evidence → extracted_from →
source`, available either as a recursive CTE over `edge` or as git-blame across the linked files.

## Graph-upgrade path (no source-of-truth rewrite)
Because relationships already live in a generic typed `edge` table from day 0, "going graph" is a query/engine change,
not a data migration:

1. **v0 — relational edges + recursive CTE.** SQLite recursive CTEs walk the edge table for traversal and "neighborhood
   of X" queries. Fine for single-curator + team volumes (well under the ~100k-node / deep-traversal range where SQLite
   CTE BFS degrades).
2. **v1 — Postgres port (trigger: team concurrent writers / index contention).** Same portable schema; CTEs unchanged;
   gain MVCC, `tsvector`, `pgvector`.
3. **v2 — native graph queries (trigger: traversal depth/perf or true continual-learning).** Enable **Apache AGE** on the
   same Postgres (openCypher over the existing edges) — or, only if a dedicated engine is justified, export the edge table
   to a property graph. Either way the **markdown files remain the source of truth**; the graph engine is just another
   derived index, exactly like FTS today.

Continual learning (explicitly NOT v0) slots in here: the append-only `event`/JSONL ledger + reconstructable chain are
the substrate a future learning loop reads; nothing in v0 needs to be undone to add it.

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug; tradeoff between stable links and dedup)`
- `TODO(open-question: team write-concurrency model — git PR/merge on files vs a write-through API that serializes; when does this force the Postgres port?)`
- `TODO(open-question: where exactly the Claim→Evidence "≥1" invariant is enforced — ingest validator only, or also a DB trigger on Postgres once ported?)`
- `TODO(open-question: trust-level vocabulary and whether it belongs in node row, frontmatter, or both — owned by the provenance & trust ADR)`
- `TODO(open-question: retrieval — when to introduce sqlite-vec/pgvector embeddings vs FTS-only; owned by the retrieval ADR)`
- `TODO(open-question: how _events JSONL and git history reconcile if someone edits files directly outside the skill interface)`

## Implications for runbooks
- A **`reindex` runbook** must exist first: rebuild the entire SQLite index from `knowledge/**` deterministically and
  idempotently; this is the safety net the whole design leans on. Acceptance: drop DB, rebuild, byte-identical query
  results.
- The **ingest/skill-wrap runbook** writes **file first, then mirrors to index + appends to `_events`**, and runs the
  `Claim→Evidence` validator before commit; a failed validation aborts the whole transaction (no orphan files).
- Define the **portable-subset SQL lint** as an acceptance check so no SQLite-only construct leaks into the core tables
  (keeps the Postgres port a non-event).
- Keep FTS and vector tables in **separate, droppable migrations** from the core schema, so retrieval choices never
  threaten portability.
- Import runbooks (from CAW-01/05) must stamp `boundary`/`visibility` and store artifacts by `artifact_uri` outside the
  repo — never inline confidential payloads.

## Sources
- [SQLite as a Graph Database: Recursive CTEs, and Why We Ditched Neo4j (dev.to)](https://dev.to/rohansx/sqlite-as-a-graph-database-recursive-ctes-semantic-search-and-why-we-ditched-neo4j-1ai)
- [memweave: Zero-Infra AI Agent Memory with Markdown and SQLite (Towards Data Science)](https://towardsdatascience.com/memweave-zero-infra-ai-agent-memory-with-markdown-and-sqlite-no-vector-database-required/)
- [sqliteai/sqlite-memory (GitHub)](https://github.com/sqliteai/sqlite-memory)
- [pithuene/zk_index — index markdown notes with SQLite (GitHub)](https://github.com/pithuene/zk_index)
- [Karpathy-style LLM wiki (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [SQLite recursive CTEs (sqlite.org)](https://sqlite.org/lang_with.html)
- [Modeling hierarchical tree data in PostgreSQL (ltree vs CTE)](https://leonardqmarcq.com/posts/modeling-hierarchical-tree-data)

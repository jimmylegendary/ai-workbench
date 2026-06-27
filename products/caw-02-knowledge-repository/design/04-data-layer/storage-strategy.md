# Storage Strategy — md-git source of truth + derived SQLite index

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model.md](./data-model.md)
  - [./provenance-and-boundaries.md](./provenance-and-boundaries.md)
  - [./versioning-and-events.md](./versioning-and-events.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../02-research/knowledge-store-storage-options.md](../02-research/knowledge-store-storage-options.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes **how CAW-02 physically persists** the data model: markdown-in-git as the single source of truth,
a derived disposable SQLite index, the deterministic idempotent `reindex`, FTS/vector as droppable migrations, the
artifact-by-path rule, and the SQLite→Postgres/Apache-AGE upgrade path. It elaborates
[ADR-0002](../01-decisions/ADR-0002-storage.md). It does NOT define entity fields (see [data-model](./data-model.md)),
trust/boundary semantics (see [provenance-and-boundaries](./provenance-and-boundaries.md)), or the event-log
contract (see [versioning-and-events](./versioning-and-events.md)).

## 1. Two representations, one canonical
| Representation | Role | Authority | Rebuildable? |
|---|---|---|---|
| `knowledge/**.md` in git | source of truth: human-diffable, signed history, audit | **Canonical** | n/a (it IS the data) |
| `index.sqlite` | query/link/filter/FTS for surfaces | Derived, **disposable** | Yes — fully from files |
| `knowledge/_events/*.jsonl` | append-only event mirror of each write | Append-only ledger | Replayable (see versioning) |

**Rule:** no surface (API/MCP/CLI/viewer) ever treats SQLite as canonical. On read, a `content_hash` mismatch
between a file and its `node` row means the index is stale ⇒ rebuild; never silently trust a row.

## 2. Repository layout
```
<repo-root>/
  knowledge/                 # SOURCE OF TRUTH (committed)
    sources/ claims/ evidence/ notes/ concepts/ interests/
    open-questions/ decisions/ assumptions/ signals/ _refs/
    _events/<ts>-<op>.jsonl  # append-only mirror
  artifacts/                 # large referenced payloads, by path (NOT inlined)
  .kr/
    index.sqlite             # derived, gitignored, droppable
    migrations/              # core + droppable FTS/vector migrations
  .gitignore                 # ignores .kr/index.sqlite and FTS/vector sidecars
```
`index.sqlite` is **gitignored**: it is never the artifact of record, only a local cache.

## 3. Core index schema (portable SQLite∩Postgres subset)
Only `TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` ids, FK, CHECK — no engine-specific types — so the same DDL runs on
Postgres after a port.

```sql
CREATE TABLE node (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  boundary     TEXT NOT NULL DEFAULT 'internal'
               CHECK (boundary IN ('public','internal','confidential')),
  visibility   TEXT NOT NULL DEFAULT 'private'
               CHECK (visibility IN ('team','private')),
  status       TEXT NOT NULL,
  generated    INTEGER NOT NULL DEFAULT 0,
  trust        TEXT NOT NULL DEFAULT 'T0',     -- derived; mirror of file value
  artifact_uri TEXT,
  file_path    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_via  TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL
);

CREATE TABLE edge (
  src_id  TEXT NOT NULL REFERENCES node(id),
  dst_id  TEXT NOT NULL REFERENCES node(id),
  rel     TEXT NOT NULL,
  created_via TEXT NOT NULL,
  PRIMARY KEY (src_id, dst_id, rel)
);

CREATE TABLE event (                            -- mirror of _events JSONL (versioning doc)
  seq     INTEGER PRIMARY KEY,
  ts      TIMESTAMP NOT NULL,
  op      TEXT NOT NULL,
  node_id TEXT,
  payload TEXT NOT NULL                          -- JSON
);

CREATE TABLE provenance_event (                  -- PROV activity per transaction (ADR-0004)
  id       TEXT PRIMARY KEY,
  activity TEXT NOT NULL,
  agent    TEXT NOT NULL,
  ts       TIMESTAMP NOT NULL,
  tool     TEXT,
  payload  TEXT NOT NULL                          -- inputs[]/outputs[]/notes JSON
);
```

The generic `edge` table is the **keystone of the upgrade path** — a future graph engine reads the same rows.
The `Claim→Evidence` invariant is NOT a DB constraint (a portable FK cannot express "≥1 typed edge"); it lives in
the validator and reindex re-check (see [data-model §6](./data-model.md)).

## 4. Write path (file-first, abort-on-fail)
Order is fixed so a crash never leaves an orphan:

```
1. core validates the proposed transaction (frontmatter schema + Claim→Evidence + boundary propagation)
2. write/append the .md file(s)        # source of truth first
3. mirror node/edge rows into index.sqlite
4. append knowledge/_events/<ts>-<op>.jsonl  (+ event row)
5. re-run invariant on the affected subgraph
6. git commit (signed) — the audit ledger
   any failure before commit => roll back file + index (transaction aborts, no orphan)
```
Agent writes are **confirmation-by-default** (ADR-0001): the validated transaction is staged and shown before
commit. Writes are **append-only + supersedes** — no in-place update/delete (see [versioning-and-events](./versioning-and-events.md)).

## 5. The deterministic, idempotent reindex
`reindex` is the safety net the whole design leans on: drop the index, rebuild it byte-deterministically from
`knowledge/**`, and re-check every invariant.

```
reindex():
  1. DROP/recreate index.sqlite from core migrations (empty)
  2. walk knowledge/** in a STABLE sort order (path-sorted) for determinism
  3. for each .md: parse frontmatter -> upsert node row; project links: -> edge rows
  4. replay knowledge/_events/*.jsonl -> event table (seq from ts ordering)
  5. re-run Claim->Evidence invariant + boundary monotone propagation over the full graph
  6. recompute derived trust from edges; compare to file value -> mismatch is surfaced
  7. (re)build droppable FTS/vector migrations
  -> any invariant violation FAILS LOUD; never silently indexed
```

| Property | Guarantee |
|---|---|
| Deterministic | same files ⇒ byte-identical index + identical query results (stable walk order) |
| Idempotent | running twice produces the same state; safe to re-run anytime |
| Disposable | deleting `index.sqlite` loses nothing; rebuild restores it |
| Drift-detecting | files edited outside the skill interface are caught (hash + invariant re-check) — reconciliation in [versioning-and-events](./versioning-and-events.md) |

## 6. FTS and vector as separate droppable migrations
Retrieval tech must never threaten portability, so it lives in **separate migration files** that can be dropped and
rebuilt without touching core tables (retrieval ranking itself is ADR-0006, not this doc).

```sql
-- migrations/200_fts.sqlite.sql   (DROPPABLE)
CREATE VIRTUAL TABLE node_fts USING fts5(
  id UNINDEXED, body, title, content='', tokenize='porter'
);
-- migrations/300_vector.sqlite.sql  (RESERVED, not in v0 — add on measured recall/precision trigger)
-- sqlite-vec sidecar; Postgres equivalent is pgvector. No embeddings in v0 (ADR-0006).
```

| Sidecar | v0 | Portable equivalent |
|---|---|---|
| Full-text | **FTS5 (BM25)** | Postgres `tsvector`/GIN |
| Vector | **reserved, not built** | pgvector (add only when recall/precision trigger fires) |

Dropping a sidecar and rebuilding it must change no core-table row.

## 7. Artifact-by-path
Large imported payloads (CAW-01 projections/traces, datasets) are **never inlined**. They live under `artifacts/`
(or an external URI) and are referenced from `evidence`/`_refs` nodes by `artifact_uri` + `checksum`.

| Aspect | Rule |
|---|---|
| Location | `artifacts/<origin>/<id>/...` or external `file://`/`https://` URI |
| Reference | `artifact_uri` on the node; `checksum: blake3:...` for integrity |
| Import | copy only **public-safe** payload; stamp `boundary` at the crossing (ADR-0007) |
| Resolution | `extracted_from` target must resolve at write time and at reindex (invariant layer) |

## 8. Upgrade path (no source-of-truth rewrite)
Files stay canonical at every step; each new engine is just another derived index.

| Stage | Engine | Trigger | What changes |
|---|---|---|---|
| v0 | SQLite index + recursive CTE traversal | default | — |
| v1 | **Postgres** (same portable schema) | concurrent team writers / index contention | engine swap; CTEs unchanged; gain MVCC, `tsvector`, `pgvector` |
| v2 | **Apache AGE** graph on the same Postgres | traversal depth/perf degrades (~100k-node CTE BFS) or continual learning greenlit | openCypher over the existing `edge` rows |

Because every relationship is already a generic `edge` row, the graph upgrade is a **query-engine change, not a
data migration**. Files (the SoT) and `_events` ledger are untouched.

## Open Questions
- `TODO(open-question: team write-concurrency — git PR/merge vs serializing write-through API; the Postgres-port trigger.)`
- `TODO(open-question: reconciling _events JSONL with git history when files are edited outside the skill interface — see versioning doc.)`
- `TODO(open-question: exact recall/precision trigger that justifies adding the vector sidecar — owned with ADR-0006.)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (reindex first):** deterministic idempotent rebuild from `knowledge/**`; byte-identical query results; fails loud on violation.
- **RB (schema):** core portable-subset tables + droppable FTS migration; portable-SQL lint as an acceptance check.
- **RB (write path):** file-first → index mirror → `_events` append → validate → signed commit; abort-on-fail.

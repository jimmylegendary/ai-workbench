# ADR-0002: Storage — markdown-first source of truth + rebuildable SQLite index

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../02-research/knowledge-store-storage-options.md](../02-research/knowledge-store-storage-options.md)
  - [./ADR-0004-provenance-and-trust.md](./ADR-0004-provenance-and-trust.md)
  - [./ADR-0006-retrieval.md](./ADR-0006-retrieval.md)
  - [./ADR-0007-import-export-contracts.md](./ADR-0007-import-export-contracts.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide how CAW-02 **physically persists** its OWN `Source → Claim → Evidence → Note` provenance chain for v0. It fixes
what every surface (API/MCP/CLI/viewer) reads and writes against, and the upgrade path toward Postgres / graph /
continual-learning. It does NOT decide retrieval ranking (see [ADR-0006](./ADR-0006-retrieval.md)), the trust/boundary
vocabulary (see [ADR-0004](./ADR-0004-provenance-and-trust.md)), or import/export wire formats
(see [ADR-0007](./ADR-0007-import-export-contracts.md)).

## Context
- The store is CAW-02's own; **no shared substrate** with CAW-01/03/05 (brief §1, §6).
- Scale is a single curator (Jimmy) + small team + a few AI agents, not org/multi-tenant (brief §3, §9).
- Two forces pull apart: **trust/reconstructability** wants plain, diffable, auditable files in git; **query/linking**
  wants a relational store to enforce `Claim→Evidence`, traverse links, and filter by boundary/trust.
- The schema must allow a **future graph / continual-learning upgrade without a rewrite** (brief §5, §6).
- v0 scope is **append + retrieve + skill-wrap**; continual learning is explicitly out (brief §2, §9). No Neo4j in v1.
- Large imported artifacts (CAW-01 projections/traces) are referenced **by path/URI**, never inlined (brief §6, §7).

## Options considered
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Markdown-only (git)** | Best diff/audit/history; survives a product rewrite; zero infra | Cannot enforce `Claim→Evidence`; link traversal is grep; no boundary/trust query | Trust yes, query no — insufficient alone |
| **SQLite-only** | FK + CHECK invariants; FTS5; recursive-CTE traversal; single file | Binary SoT loses human-diffable history; reconstructability tied to product code | Rejected as SoT |
| **Postgres-only** | MVCC, `tsvector`, `pgvector`, Apache AGE | Server infra breaks zero-infra single-curator default; overkill at v0 scale | It is the **portability target**, not the v0 default |
| **Hybrid: md SoT + rebuildable SQLite index** | git trust/diff/history AND query/invariant layer; index is disposable & reconstructable; portable-subset schema ports to Postgres unchanged | Two representations must stay in lockstep; team write-concurrency needs PR/merge discipline | **Chosen** |

## Decision
**Markdown files in a git repo are the single source of truth; a SQLite database is a derived, disposable index.**

1. **Files are canonical.** Each entity is one `.md` = **YAML frontmatter (machine contract) + markdown body (human
   note)** under `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/`.
   An append-only `knowledge/_events/<ts>-<op>.jsonl` mirrors every skill-wrap write; git history (signed commits, blame)
   is the second append-only ledger.
2. **SQLite is authoritative for nobody.** It is **fully reconstructable from files** via an idempotent `reindex`. A
   `content_hash` mismatch on read means the index is stale ⇒ rebuild; never silently trust a row.
3. **Portable-subset schema.** Core tables use only the SQLite∩Postgres subset (`TEXT/INTEGER/TIMESTAMP`, surrogate
   `TEXT` ids, FK, CHECK). A generic typed **`edge`** table is the keystone of the upgrade path; FTS and vectors live in
   **separate, droppable** migrations so retrieval choices never threaten portability.
4. **Core tables (rebuilt from files):** `node(id, kind, boundary, visibility, trust, artifact_uri, file_path,
   content_hash, created_at)`, `edge(src_id, dst_id, rel)`, `event(seq, ts, op, node_id, payload)`. Boundary/visibility
   are `NOT NULL` with **default-deny / default-private** defaults (see [ADR-0004](./ADR-0004-provenance-and-trust.md)).
5. **Invariant enforcement lives in the ingest validator, not a DB trigger.** A portable FK cannot express "≥1 typed
   edge", so the writer/`reindex` re-checks that every `kind='claim'` has ≥1 `edge(rel='supports')` to an `evidence`
   node — identical on SQLite and Postgres.
6. **Write order:** file first → mirror to index → append `_events` → validate → commit. A failed validation aborts the
   whole transaction (no orphan files).
7. **Large artifacts** stay outside `knowledge/` and are referenced by `artifact_uri`; imports copy only public-safe
   payloads and stamp `boundary` (see [ADR-0007](./ADR-0007-import-export-contracts.md)).

## v0 choice, stated plainly
**md-first SoT + a single local SQLite index file.** Not Postgres, not a graph DB. One deployable unit, no server.

## Consequences
- **Easy:** git-native audit/diff/blame as provenance; drop-and-rebuild the index at will; the `reindex` runbook is the
  safety net the whole design leans on; ships as one binary + a repo.
- **Easy upgrade path (no SoT rewrite):** (1) v0 relational edges + recursive CTE; (2) Postgres port when team
  concurrent writers / index contention demand it — same portable schema, CTEs unchanged, gain MVCC/`tsvector`/`pgvector`;
  (3) native graph via **Apache AGE** on the same Postgres (openCypher over the existing `edge` table) only when
  traversal depth/perf or true continual learning justifies it. Files stay canonical at every step; the graph engine is
  just another derived index, exactly like FTS.
- **Continual learning** (not v0) reads the append-only `event`/JSONL ledger + reconstructable chain; nothing in v0 is
  undone to add it later.
- **Hard:** team write-concurrency is PR/merge on files (single-writer index lock) until the Postgres port; direct file
  edits outside the skill interface can drift the `_events` ledger from git.
- **Follow-on work:** `reindex` runbook (drop DB, rebuild, byte-identical query results); ingest/skill-wrap runbook with
  the `Claim→Evidence` validator; a portable-subset SQL lint as an acceptance check.

## Open questions / revisit triggers
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug)`
- `TODO(open-question: team write-concurrency — git PR/merge vs serializing write-through API; this is the Postgres-port trigger)`
- `TODO(open-question: how _events JSONL and git history reconcile if files are edited outside the skill interface)`
- **Revisit trigger → Postgres:** concurrent team writers or index contention appear.
- **Revisit trigger → Apache AGE / graph:** traversal depth/perf degrades (SQLite CTE BFS ~100k-node range) or
  continual learning is greenlit.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (reindex first):** deterministic, idempotent rebuild of the SQLite index from `knowledge/**`.
- **RB (ingest/skill-wrap):** file-first write + index mirror + `_events` append + `Claim→Evidence` validator; abort-on-fail.
- **RB (schema):** portable-subset core tables; FTS/vector in separate droppable migrations; portable-SQL lint as acceptance.

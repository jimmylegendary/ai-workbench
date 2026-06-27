# RB-030: Build FTS5/BM25 search with first-class structured filters applied before ranking

- Status: ready
- Phase: phase-3-retrieval
- Depends on: [RB-010 (md-git writer + deterministic reindex → SQLite), RB-011 (relational index: `node` + generic `edge` tables), RB-020 (core + op manifest + evidence gate)]
- Implements design:
  - [../../01-decisions/ADR-0006-retrieval.md](../../01-decisions/ADR-0006-retrieval.md) §1, §2
  - [../../05-knowledge-core/retrieval.md](../../05-knowledge-core/retrieval.md) ("Engine decision", "Structured filters BEFORE ranking")
  - [../../07-backend-api/retrieval-service.md](../../07-backend-api/retrieval-service.md) Stages 1–3
  - [../../04-data-layer/](../../04-data-layer/) (persistence + droppable migrations, ADR-0002)
- Produces:
  - A **droppable** FTS5 migration (`fts` virtual table over `node` text/title) co-located with the relational index, rebuilt by the deterministic reindex.
  - A reserved **nullable `node_vec` sidecar** migration (created, unused in v0).
  - A `search()` candidate-selection layer: filter plan → SQL `WHERE` (boundary/visibility/kind/trust/concept/status) → BM25 ranking over the already-filtered set.
  - Tests proving filters run **before** ranking and that confidential/private items never enter a filtered-out result set.

## Objective
"Done" means: given a populated `knowledge/` corpus reindexed to SQLite, a text query plus a viewer authority and optional filters returns a ranked list of candidate node IDs where (a) the boundary/visibility/`status`/`kind`/`trust`/`concept` predicates are applied **in SQL `WHERE` before BM25 ranks anything**, (b) no `confidential`/`private` node the viewer may not see is ever scored or returned, (c) ranking is deterministic and the `bm25()` score is captured per hit, and (d) the FTS and `node_vec` schemas live in separate **droppable** migrations rebuilt purely by the deterministic reindex (deleting the SQLite file and reindexing fully reconstructs them). Provenance hydration and RAG are NOT in this runbook (see RB-031); this runbook produces the filtered, ranked seed set only.

## Preconditions
- [ ] RB-010/RB-011 acceptance met: `reindex` is deterministic + idempotent; SQLite `node` table carries `id, kind, title, text, boundary, visibility, owner, trust, status, content_hash`; generic `edge` table carries `src_id, dst_id, rel`.
- [ ] `boundary` is the **effective** (monotone-propagated) value written into `node` by the core/reindex (ADR-0004); this runbook consumes it and does not recompute it.
- [ ] The migration framework supports ordered, droppable migrations (FTS + vector live in their own files, never blocking SQLite↔Postgres portability — ADR-0002 §3).
- [ ] A test fixture corpus exists containing at least one `public`, one `internal`, one `confidential`, one `visibility=private` (owned by a non-default actor), and items across ≥2 `kind`s and ≥2 `trust` levels, with `concept` edges.

## Steps

1. **Add the FTS5 virtual table as a droppable migration.**
   - Do: Create migration `NNN_fts.sql` declaring `CREATE VIRTUAL TABLE fts USING fts5(title, text, content='node', content_rowid='rowid');` plus the rebuild trigger/command the reindex calls to repopulate it from `node`. Keep it in its own migration file so it is independently droppable. Document the Postgres analogue (`tsvector` + GIN) as a comment only — do not build it.
   - Verify: Applying then dropping the migration leaves the relational schema intact; `SELECT count(*) FROM fts` equals `SELECT count(*) FROM node WHERE text IS NOT NULL OR title IS NOT NULL` after a reindex.

2. **Reserve the nullable `node_vec` sidecar (unused in v0).**
   - Do: Create migration `NNN_node_vec.sql` with a nullable sidecar table/column for future embeddings (e.g. `node_vec(node_id PK, vec BLOB NULL, model TEXT NULL)`), in its own droppable migration. Write nothing to it; no embedding code.
   - Verify: Schema present; `SELECT count(*) FROM node_vec` returns 0; dropping it does not affect FTS or `node`; reindex recreates it empty.

3. **Wire FTS rebuild into the deterministic reindex.**
   - Do: Extend the reindex so dropping the SQLite file and re-running it recreates `node`, `edge`, `fts`, and empty `node_vec` purely from `knowledge/` md-git.
   - Verify: `rm index.sqlite && reindex` reconstructs all four; running reindex twice yields byte-identical FTS content (idempotent, per RB-010 acceptance).

4. **Define the `SearchInput` filter plan and the viewer authority split.**
   - Do: Implement the filter-plan parser per [retrieval-service.md](../../07-backend-api/retrieval-service.md) Stage 1: `{ q, filters?{ boundary[], scope[], kind[], trust[], concept[], interest[], status[] }, limit?, viewer{ actor, max_boundary, scope } }`. Treat `viewer.max_boundary`/`viewer.scope` as **authority** (always ANDed in, cannot be widened by `filters`); treat `filters` as **narrowing only** within what the viewer may already see.
   - Verify: A unit test shows a caller passing `filters.boundary=[confidential]` while `viewer.max_boundary=internal` still cannot retrieve confidential rows (authority caps the request).

5. **Compile filters to a single pre-ranking SQL `WHERE` (leak prevention).**
   - Do: Build the candidate query so all predicates are ANDed in the `WHERE` before any BM25 scoring, following the design SQL shape:
     ```sql
     SELECT node.id, node.kind, node.trust, node.boundary, node.visibility, bm25(fts) AS fts_rank
     FROM fts JOIN node ON node.rowid = fts.rowid
     WHERE fts MATCH :q
       AND node.boundary <= :viewer_max_boundary           -- public<internal<confidential ordering
       AND (node.visibility = 'team' OR node.owner = :viewer)  -- private only to owner
       AND (:kind   IS NULL OR node.kind   IN (:kind))
       AND (:trust  IS NULL OR node.trust  IN (:trust))
       AND (:status IS NULL OR node.status IN (:status))
       -- concept/interest via edge join (rel='about')
     ORDER BY fts_rank
     LIMIT :limit;
     ```
     Implement a stable total `boundary` ordering (`public<internal<confidential`) and `concept`/`interest` filtering via a join on the generic `edge` table (`rel='about'`). Default `status` to exclude un-reviewed candidates unless explicitly requested (design "exclude un-reviewed candidates by default").
   - Verify: With `EXPLAIN QUERY PLAN`, confirm the boundary/visibility/kind/trust/status predicates are part of the candidate scan, not applied after `ORDER BY bm25`. A test asserts the returned set is a subset of the WHERE-filtered set.

6. **Capture inspectable, deterministic ranking.**
   - Do: Return each candidate with `score.fts_rank = bm25(fts)`; leave `vector_sim`/`rerank` unset (reserved). Ensure `ORDER BY fts_rank` plus a deterministic tiebreaker (e.g. `node.id`) gives stable output.
   - Verify: Running the same query twice yields identical ordering and identical `fts_rank` values.

7. **Leak-prevention test matrix (the core acceptance).**
   - Do: Add tests over the fixture corpus: for viewers at each `max_boundary` and `scope`, assert (a) no node with `boundary > viewer.max_boundary` appears; (b) no `visibility=private` node owned by another actor appears; (c) `kind`/`trust`/`concept`/`status` filters narrow but never widen; (d) a confidential item is absent from every non-confidential viewer's result set even when it is the strongest BM25 match.
   - Verify: All tests pass; deliberately weakening the `WHERE` (remove the boundary predicate) makes the leak tests fail (proving they are real).

8. **Expose the candidate-selection function for RB-031.**
   - Do: Export a single `searchCandidates(input) -> { id, kind, trust, boundary, visibility, score }[]` used as the seed source by the hydration layer in RB-031. No hydration, no synthesis here.
   - Verify: Function signature is stable and unit-tested; RB-031 can import it without touching SQL.

## Acceptance criteria
- [ ] FTS5 and `node_vec` each live in their own **droppable** migration; `rm index.sqlite && reindex` fully reconstructs `node`, `edge`, `fts`, and empty `node_vec` from md-git.
- [ ] Reindex of FTS is idempotent (byte-identical on repeat runs).
- [ ] Every structured filter (`boundary`, `visibility`, `kind`, `trust`, `concept`/`interest`, `status`) is applied in SQL `WHERE` **before** BM25 ranking (verified via query plan + subset test).
- [ ] `viewer.max_boundary`/`viewer.scope` cannot be widened by caller `filters`; a confidential/private item never enters a filtered-out viewer's result set, even as top BM25 hit.
- [ ] `node_vec` is present, nullable, and empty; no embedding code exists in v0.
- [ ] `score.fts_rank` is returned per candidate; ranking is deterministic.
- [ ] Tree is green (build + lint + tests) at this checkpoint.

## Rollback / safety
- FTS and `node_vec` are **derived, disposable** (ADR-0002): on any failure, drop both migrations and re-run reindex — md-git is untouched, so no knowledge is lost.
- This runbook adds **no write path** to `knowledge/`; it is read-only over the SQLite index. A mid-way failure cannot corrupt the source of truth.
- If the boundary ordering or `WHERE` is suspect, disable the `search()` entrypoint (fail-closed: return empty rather than risk a leak) until the leak test matrix is green again.

## Hand-off
- RB-031 can assume: a deterministic, boundary-safe, filter-before-rank `searchCandidates()` returning seed nodes with `score.fts_rank`, `trust`, `boundary`, `visibility`; FTS + reserved `node_vec` migrations rebuilt by reindex; the generic `edge` table is available for chain hydration.
- The viewer-authority contract (`max_boundary`/`scope` as caps) is fixed here and must be re-applied during hydration in RB-031.

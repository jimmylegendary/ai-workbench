# RB-003: Derived SQLite index, deterministic idempotent reindex, droppable FTS5, reserved vector sidecar

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001, RB-002]
- Implements design: [storage-strategy.md §3,§5,§6](../../04-data-layer/storage-strategy.md), [component-boundaries.md §reindex, §store/index](../../03-architecture/component-boundaries.md), [repo-structure.md §migrations/, §index/](../../03-architecture/repo-structure.md), [tech-stack.md §"derived index: SQLite + FTS5"](../../03-architecture/tech-stack.md)
- Produces: portable core migration `migrations/0001_core.sql` (`node, edge, event`, + `provenance_event`); a tiny migration runner; `src/index/reindex` — a deterministic, idempotent rebuild of `index.sqlite` purely from `knowledge/**`; the droppable FTS5 migration `0002_fts.sql`; the reserved-but-unused vector sidecar `0003_vec.sql.reserved`; a portable-SQL lint and a golden-reindex (byte-identical) test

## Objective
The derived, disposable query index exists and is provably rebuildable from the canonical store. `migrations/0001_core.sql` defines the portable SQLite∩Postgres core tables (`node`, `edge`, `event`, `provenance_event`) using only `TEXT/INTEGER/TIMESTAMP`, FK, CHECK. `reindex` drops `.index/index.sqlite`, recreates it from the core migration, walks `knowledge/**` in a stable sort order, mirrors nodes + edges, replays `_events`, and re-runs the Claim→Evidence invariant — failing loud on any violation. FTS5 lives in a separate droppable migration; the vector sidecar is reserved and unused. "Done" = reindex is deterministic (re-running yields byte-identical content/results), disposable (delete the sqlite file, rebuild fully restores it), dropping/rebuilding a sidecar changes no core-table row, and the portable-SQL lint passes. Trust recompute and boundary propagation are stubbed/no-op here (full logic is phase-3); the reindex structure must leave seams for them.

## Preconditions
- [ ] RB-002 complete: typed `knowledge/**` read with `content_hash`, the `_events` JSONL ledger, deterministic serialization.
- [ ] `better-sqlite3` + bundled SQLite/FTS5 pins resolved; confirm FTS5 is compiled into the distributed build (resolve `tech-stack.md` `TODO(open-question)`).
- [ ] You have read the core schema (`storage-strategy.md` §3), the reindex algorithm (§5), and the sidecar rule (§6).

## Steps

1. **Author the portable core migration.**
   - Do: Write `migrations/0001_core.sql` with `node`, `edge`, `event`, and `provenance_event` exactly per `storage-strategy.md` §3 (portable subset: `TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` ids, FK, CHECK on `boundary`/`visibility`; the generic `edge` table is the graph-upgrade keystone). Do NOT add the Claim→Evidence constraint as a DB FK (a portable FK cannot express "≥1 typed edge") — it lives in the validator/reindex re-check.
   - Verify: applying `0001_core.sql` to a fresh sqlite file creates the four tables; `PRAGMA foreign_keys` works; CHECK constraints reject an invalid `boundary`.

2. **Write the migration runner.**
   - Do: In `src/index/`, add a tiny runner that applies numbered migrations in order against `.index/index.sqlite`, tracking which are applied. Core migration is always applied; sidecar migrations (`0002_fts`, future `0003_vec`) are applied as droppable add-ons.
   - Verify: runner applies `0001_core.sql` to an empty `.index/index.sqlite`; re-running is a no-op (idempotent migration tracking).

3. **Implement the deterministic reindex core.**
   - Do: In `src/index/reindex/`, implement `reindex(knowledge_dir)` per `storage-strategy.md` §5 / `component-boundaries.md` §reindex: (1) drop & recreate the index from `0001_core.sql`; (2) walk `knowledge/**` in a STABLE path-sorted order; (3) for each `.md`, parse frontmatter (reuse RB-002 `store/files` + schemas) → upsert a `node` row, project `edges[]` → `edge` rows; (4) replay `knowledge/_events/*.jsonl` (ordered by ts) → `event` rows with monotonic `seq`. Leave typed no-op seams for trust recompute + boundary propagation (phase-3).
   - Verify: reindex on the RB-002 fixtures populates `node`/`edge`/`event` with the expected counts; row order/content is stable across runs.

4. **Wire the invariant re-check (layer 3) using the shared validator.**
   - Do: After mirroring, re-run the Claim→Evidence invariant over the full graph using the SAME validation code that will back core validator layer 2 (no second implementation — `component-boundaries.md` determinism contract). A `claim` node with zero `supports`/evidence edges FAILS LOUD; nothing invalid is silently indexed. Also recompute `content_hash` per file and surface any mismatch (source file wins).
   - Verify: reindex on a fixture set with a valid claim+evidence passes; injecting a claim with no evidence makes reindex fail loudly with a violation report; a tampered `content_hash` is surfaced.

5. **Golden / determinism + idempotency test.**
   - Do: Add a golden-reindex test: run reindex twice on a fixed corpus and assert byte-identical index content (or identical canonical query-result snapshots); then delete `.index/index.sqlite` and rebuild, asserting full reconstruction from `knowledge/**`.
   - Verify: both runs match; post-delete rebuild equals the original (disposable + deterministic + idempotent).

6. **Author the droppable FTS5 migration.**
   - Do: Write `migrations/0002_fts.sql` creating the FTS5 virtual table (e.g. `node_fts(id UNINDEXED, body, title, ... tokenize='porter')`) plus any filter columns, per `storage-strategy.md` §6. The reindex step (re)builds it from node bodies AFTER core tables. It must be droppable without touching core rows. (BM25 ranking + structured filters are phase-5 — here only build/drop the table and populate it.)
   - Verify: applying `0002_fts.sql` then dropping it changes no `node`/`edge`/`event` row; reindex repopulates `node_fts`; a basic `MATCH` query returns the seeded fixture.

7. **Reserve the vector sidecar (unused).**
   - Do: Add `migrations/0003_vec.sql.reserved` as a RESERVED, UNUSED nullable `node_vec` sidecar placeholder (comment-only or `.reserved` so the runner does not apply it). Document the trigger (measured recall/precision) for enabling it later — `TODO(open-question: numeric recall/precision trigger; owned with ADR-0006)`. No embeddings in v0.
   - Verify: the runner does NOT apply `0003_vec.sql.reserved`; no `node_vec` table exists after reindex; the file is present and clearly marked reserved.

8. **Portable-SQL lint.**
   - Do: Add a lint (script or test) asserting `migrations/0001_core.sql` stays within the SQLite∩Postgres portable subset (only `TEXT/INTEGER/TIMESTAMP`, FK, CHECK; no engine-specific types). It must flag a non-portable type if introduced. Sidecar migrations (FTS/vector) are exempt (they are isolated by design).
   - Verify: lint passes on `0001_core.sql`; planting a non-portable type (e.g. `JSONB`) in core fails it; remove the plant.

9. **Confirm gitignore + write-direction; wire CI.**
   - Do: Confirm `.index/index.sqlite` + sidecar files are gitignored (RB-000) — the index is derived, never committed. Confirm only `reindex` and `core/ingest` write `store/index` (boundary lint / interaction matrix). Add reindex, golden, FTS drop/rebuild, and portable-SQL lint tests to CI.
   - Verify: `git check-ignore .index/index.sqlite` returns it; CI green; boundary lint still passes.

## Acceptance criteria
- [ ] `migrations/0001_core.sql` creates `node, edge, event, provenance_event` in the portable subset; portable-SQL lint passes and rejects a planted non-portable type.
- [ ] `reindex` rebuilds `.index/index.sqlite` purely from `knowledge/**`: deleting the sqlite file and re-running fully reconstructs it.
- [ ] Re-running reindex on a fixed corpus yields byte-identical content / identical query results (deterministic + idempotent).
- [ ] The Claim→Evidence invariant re-check uses the shared validator and FAILS LOUD on a claim with zero evidence; `content_hash` mismatches are surfaced (file wins).
- [ ] `0002_fts.sql` (FTS5) is a separate droppable migration; dropping+rebuilding it changes no core-table row; reindex repopulates it.
- [ ] `0003_vec.sql.reserved` is present, reserved, and NOT applied by the runner; no `node_vec` table exists in v0.
- [ ] `.index/` is gitignored; only reindex/`core/ingest` write the index (interaction matrix holds).
- [ ] Tree is green (typecheck + lint + boundary lint + tests).

## Rollback / safety
- The index is derived and disposable: deleting `.index/index.sqlite` loses nothing — `reindex` restores it. To undo this RB's code/migrations: `git reset --hard <pre-RB-003>`. Canonical `knowledge/**` is never written by reindex, so a botched reindex cannot corrupt the source of truth; it only fails loud and leaves the index unbuilt.

## Hand-off
- Phase-1/2 (core + skill-wrap → M1) can assume: a portable core schema, a deterministic idempotent `reindex` that re-checks the invariant, and an index mirror target for the write path's "mirror node/edge rows" step (`storage-strategy.md` §4 step 3) — closing the md-git → SQLite round-trip the M1 transaction needs.
- Phase-3 (provenance/trust + boundary) plugs into the trust-recompute / boundary-propagation seams left in reindex Step 3.
- Phase-5 (retrieval) builds BM25 ranking + pre-ranking structured filters on the FTS5 table from Step 6; the reserved vector sidecar from Step 7 awaits a measured trigger.

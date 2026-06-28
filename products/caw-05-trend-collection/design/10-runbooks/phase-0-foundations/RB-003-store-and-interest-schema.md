# RB-003: Files-as-truth store + rebuildable SQLite index/ledger-cache + interest artifact schema & watch-list seed

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001, RB-002]
- Implements design: [../../04-data-layer/storage-and-scheduling.md](../../04-data-layer/storage-and-scheduling.md), [../../05-radar-core/interest-model.md](../../05-radar-core/interest-model.md), [../../01-decisions/ADR-0006-storage-and-scheduling.md](../../01-decisions/ADR-0006-storage-and-scheduling.md), [../../01-decisions/ADR-0002-interest-model.md](../../01-decisions/ADR-0002-interest-model.md), [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md)
- Produces: the store I/O layer (read/write `findings/*.json`, append-only `ledger/*.jsonl`, `state/`, `runs/<run_id>.receipt.json`); the rebuildable `index.sqlite` (FTS5 + `seen` + ledger projection) with `caw05 index rebuild`; the typed interest artifact (`interests.yaml` → `interests.json` compiler + schema validation); the narrow watch-list seed from PRODUCT-BRIEF §6; the recall-priority floor flag honored downstream.

## Objective
Make CAW-05's OWN store real and prove the storage contract: **files are truth, the DB is a disposable cache** — deleting `index.sqlite` and replaying the files reproduces FTS5, the `seen` dedup set, and the ledger projection ([storage-and-scheduling.md §1, §7](../../04-data-layer/storage-and-scheduling.md)). Also author the load-bearing typed interest artifact ([interest-model.md §1](../../05-radar-core/interest-model.md)) seeded from the brief §6 watch list with `recall_priority: high`, compiled and schema-validated, so Phase 2 relevance has its inputs. "Done" means: the store round-trips a finding and a ledger row; `caw05 index rebuild` reconstructs the cache bit-equivalent for query purposes; `interests.yaml` validates, compiles to `interests.json`, and carries the seed entries with provenance; and the recall floor is a config flag the pipeline can read. No real ingestion or scoring math here (Phase 1/2); fakes supply records.

## Preconditions
- [ ] RB-002 complete: ports, registry, preflight, fakes, value objects (`RawFinding`, `Cursor`, etc.) with provenance/boundary.
- [ ] FTS5 availability decided: add a preflight check that FTS5 is compiled into the target Python/SQLite, else fall back to `rank-bm25` ([tech-stack.md §2.3 / §4](../../03-architecture/tech-stack.md)). TODO(open-question: confirm FTS5).
- [ ] YAML lib chosen (PyYAML/ruamel — TODO(open-question: pin)); `.gitignore` already excludes `index.sqlite`/`run.lock`/`artifacts/` (RB-000).

## Steps

1. **Implement the files-as-truth store I/O.**
   - Do: In `core/` add a store layer that writes one `RawFinding`/Finding per `data/findings/<finding_id>.json` (keyed by `canonical_id`-derived `finding_id`, [repo-structure.md §5](../../03-architecture/repo-structure.md)), appends `LedgerLink` rows to `data/ledger/<yyyy-ww>.jsonl` (append-only — corrections add a `superseded_by` row, never mutate), persists per-source watermarks to `data/state/<source>.cursor` (advance-on-success), and writes `data/runs/<run_id>.receipt.json` with `{window, per_source:{fetched,new,dup}, classified_counts, exports[], status}`. Large blobs go to `data/artifacts/<sha>/` BY PATH, referenced from provenance, never inlined ([storage-and-scheduling.md §1–§2](../../04-data-layer/storage-and-scheduling.md)).
   - Verify: writing then reading a fake finding round-trips identically; a ledger correction appends a new row and leaves the original untouched.

2. **Build the SQLite index (FTS5 + seen + ledger projection).**
   - Do: Create the schema builder for `data/index.sqlite`: an FTS5 table over finding `title`/`abstract`/`body` with column weights title>abstract>body (for Phase 2 `bm25()` — [interest-model.md §2](../../05-radar-core/interest-model.md)); a `seen` table (canonical id + SHA-256 content hash) for dedup layers 1–2 ([storage-and-scheduling.md §6](../../04-data-layer/storage-and-scheduling.md)); and a flattened ledger projection (`target_ref`, `relation`). Mark the DB as cache-only (never authoritative).
   - Verify: indexing fake findings populates FTS5 and `seen`; a basic FTS5 query returns the finding.

3. **Implement `caw05 index rebuild` (the consistency authority).**
   - Do: Add the op that DROPS `index.sqlite` and replays `findings/*.json` + `ledger/*.jsonl` + `state/seen.idx` to reconstruct FTS5, `seen`, and the ledger projection ([storage-and-scheduling.md §7](../../04-data-layer/storage-and-scheduling.md)). Wire it as the `index rebuild` subcommand (derive from the op-manifest where applicable).
   - Verify (negative test): delete `index.sqlite`, run `caw05 index rebuild`, and assert the rebuilt FTS5 rows, `seen` set, and ledger projection equal the pre-delete state — the §7 contract.

4. **Define the typed interest artifact schema.**
   - Do: In `core/model/` add a pydantic schema for the interest artifact matching [interest-model.md §1](../../05-radar-core/interest-model.md): top-level `version`, `updated`, `watch_lists[]` (with `id`, `label`, `default_weight`, `recall_priority`), and `interests[]` with fields `id`, `type` (enum keyword|topic|entity|author|venue), `terms`, `aliases`, `weight`, `watch_list`, `polarity` (positive|negative), `decay` (none|slow|fast), `canonical_id`, `provenance` (seed|jimmy|feedback|suggested). Do NOT invent dates — leave `updated: TODO`.
   - Verify: the schema validates a well-formed artifact and rejects an unknown `type`/`polarity`.

5. **Seed `interests.yaml` from the brief §6 watch list.**
   - Do: Author `config/interests.yaml` with `version: 1` and a `memory-centric-dse` watch list set to `recall_priority: high`, seeding the brief §6 proper nouns as typed interests with `provenance: seed-brief-§6`: memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall line; MemOS; SECDA-DSE; TTT writeback / test-time compute memory traffic; Chakra / trace-based workload modeling; LLM-serving & memory-hierarchy simulation. Use `type: author` for Minsoo Rhu (with `canonical_id: TODO(open-question: S2 authorId/ORCID)`), `type: topic`/`keyword` for the rest, and at least one negative-polarity entry to demote generic LLM hype. Also seed `config/watchlist.yaml` consistently if it is the separate seed surface ([repo-structure.md §1](../../03-architecture/repo-structure.md)).
   - Verify: `interests.yaml` validates against the RB-003 schema; every seed entry carries `provenance` and the watch list is `recall_priority: high`.

6. **Implement the interests compiler (yaml → json) with version gating.**
   - Do: Add a compiler that validates `interests.yaml` and emits machine-consumed `interests.json`, and require a `version` bump per accepted edit (git diff = full audit; rollback by version — [interest-model.md §5](../../05-radar-core/interest-model.md)). Mirror the interest rows into `index.sqlite` for later joins. No learned profile, no feedback nudging here (Phase 2+).
   - Verify: compiling produces `interests.json` semantically equal to the YAML; editing without bumping `version` is flagged.

7. **Expose the recall-first floor flag to the pipeline.**
   - Do: Surface `recall_priority: high` so the downstream noise route MUST honor surface-not-drop: a finding matching any high-priority watch-list interest is always surfaced for triage, never auto-discarded — score governs ordering, not survival ([interest-model.md §3](../../05-radar-core/interest-model.md)). Implement only the flag plumbing + a guard hook here; the scoring math is Phase 2.
   - Verify: a test asserts a fake finding tagged with a high-priority watch-list match is never dropped by the (stub) noise path.

## Acceptance criteria
- [ ] Store I/O round-trips findings (`findings/*.json`), appends ledger rows (`ledger/*.jsonl`, append-only with `superseded_by`), persists cursors and run receipts; large blobs referenced by path, never inlined.
- [ ] `index.sqlite` builds FTS5 (weighted title>abstract>body) + `seen` (id + SHA-256) + ledger projection; it is gitignored and marked cache-only.
- [ ] `caw05 index rebuild` reproduces FTS5, the `seen` set, and the ledger projection bit-equivalent for queries after deleting the DB (the §7 negative test).
- [ ] The interest schema validates the seeded `interests.yaml`; all seed entries carry `provenance: seed-brief-§6` (or `seed-jimmy`); the watch list is `recall_priority: high`.
- [ ] The compiler emits `interests.json` and gates on a `version` bump; no invented dates (`updated: TODO`).
- [ ] The recall-first floor flag is readable by the pipeline and a guard test shows high-priority matches are never auto-dropped.
- [ ] An FTS5-availability preflight check exists with a `rank-bm25` fallback path noted.
- [ ] CI green; core→ports boundary still enforced.

## Rollback / safety
- `index.sqlite` is disposable: any suspected file↔index drift is fixed by `caw05 index rebuild`, never by in-place reconciliation ([storage-and-scheduling.md §7](../../04-data-layer/storage-and-scheduling.md)).
- Ledger is append-only: never mutate or delete a row; corrections add a `superseded_by` row so the audit trail holds.
- Recall-bias rule: when uncertain, keep both / re-fetch rather than drop — a duplicate is cheap, a missed paper is existential (PRODUCT-BRIEF §1). Do not let dedup or the noise floor silently drop a high-priority match.
- Interest edits are human-gated and versioned — never auto-create/delete interests or auto-edit `terms` here.
- No real sources are contacted (legal/ToS-safe); only fakes write fixtures. Revert by discarding the branch + clearing `data/` fixtures.

## Hand-off
This completes Phase 0 / Milestone M0: a no-op Run across all surfaces, the five ports + registry + preflight + stubs, and a files-as-truth store with a rebuildable index and a seeded, validated interest artifact. Phase 1 (RB-1XX) can assume a real place to write provenance-tagged findings, persisted cursors + a `seen` dedup index in core, and a typed `recall_priority: high` watch list — and proceeds to implement the v1 SourceAdapters (arXiv/S2/GitHub/RSS/HN-light) and the interest model wiring that join before Phase 2 relevance.

# RB-030: Build the append-only related-work ledger + Semantic Scholar verification

- Status: ready
- Phase: phase-3-ledger-and-synthesis
- Depends on: [RB-200-classification-and-triage, RB-201-routing, RB-000-pipeline-core-and-store]
- Implements design:
  - [../../05-radar-core/related-work-ledger.md](../../05-radar-core/related-work-ledger.md)
  - [../../01-decisions/ADR-0005-related-work-ledger.md](../../01-decisions/ADR-0005-related-work-ledger.md)
  - [../../01-decisions/ADR-0006-storage-and-scheduling.md](../../01-decisions/ADR-0006-storage-and-scheduling.md)
  - [../../09-roadmap/dependency-graph.md](../../09-roadmap/dependency-graph.md) (invariant 4: ledger before novelty export)
- Produces: `ledger/*.jsonl` (append-only `LedgerLink` rows), `VerifiedSource`/`WatchedTarget`/`Finding` records, a Semantic Scholar (S2) `VerificationAdapter`, and the SQLite ledger-cache index that backs export (RB-040+).

## Objective
A classified, review-eligible `Finding` can be linked to a CAW-05-owned `WatchedTarget` through a **provenance-complete `LedgerLink`** that is written **append-only** to `ledger/*.jsonl`. Each link's bibliographic backing is resolved to a `VerifiedSource` by a Semantic Scholar verification pipeline (normalize → key lookup → title match → Levenshtein ≥ 0.70 + year ±1 gate → multi-key dedup), emitting `verified | ambiguous | unverified`. "Done" = a weekly re-run of the same paper produces exactly one `VerifiedSource` (dedup), ambiguous/sub-threshold matches are routed to human review and never silently dropped (recall-first), `noise` is never linked, corrections append a new row with `superseded_by` (rows never mutated), and every link carries an `evidence_locator` into the source while any generated summary is tagged `kind=generated-summary` and excluded from evidence. The negative tests N1–N7 in the design doc all hold.

## Preconditions
- [ ] RB-200/RB-201 produce triaged `Finding`s carrying `classification`, `signal_vs_hype`, `watchlist_hit`, `boundary=public`, `trust`, and routing — see [../../05-radar-core/related-work-ledger.md](../../05-radar-core/related-work-ledger.md) §2.
- [ ] The FILES-AS-TRUTH layout from P0 exists: `interests.yaml`, `findings/*.json`, `ledger/` directory, SQLite index (ADR-0006).
- [ ] `WatchedTarget` anchors can be seeded from the interest model watch list (ADR-0002 → brief §6) with opaque `foreign_ref` (e.g. `caw03://claim/...`, `caw02://concept/...`).
- [ ] Network egress to the **public** Semantic Scholar API is permitted; no paywalled/ToS-violating endpoints are configured (brief §12, design §1.4).
- [ ] Tree is green (compiles, lint-passes).

## Steps

### 1. Define the four ledger entities (CAW-05-local identities)
- **Do:** Create typed models for `Finding` (`caw05:fnd-<uuid>`), `VerifiedSource` (`caw05:src-<sha>`, content-addressed by canonical key), `WatchedTarget` (`caw05:tgt-<slug>`, holding `foreign_ref` + `label` + originating watch-list topic), and `LedgerLink` (`caw05:lnk-<uuid>`). Match the field set in [../../05-radar-core/related-work-ledger.md](../../05-radar-core/related-work-ledger.md) §2–§3. The `WatchedTarget` is the only seam to other products — it references foreign URIs, never copies foreign store contents.
- **Verify:** A unit test instantiates each entity, round-trips it through JSON, and asserts identities use the documented prefixes; a `LedgerLink` cannot be constructed without `finding_ref`, `target_ref`, `relation`, `rationale`, `evidence_locator`, and `provenance`.

### 2. Implement the append-only ledger store
- **Do:** Write a `LedgerStore` that appends `LedgerLink` rows as JSONL lines to `ledger/<run_id>.jsonl` (or a rolling file per ADR-0006). Expose `append(link)`, `read_all()`, and `supersede(old_link_id, new_link)` where `supersede` writes a **new** row and sets the new row's predecessor pointer / the chain via `superseded_by` — it MUST NOT edit or delete the original line.
- **Verify:** A test appends a link, supersedes it, then reads the file: both rows are present, the original bytes are unchanged, and the latest-state view resolves to the superseding row. Attempting an in-place mutation API does not exist / is not exposed (negative test N7).

### 3. Enforce the relation vocabulary (noise is never linked)
- **Do:** Map triage class → `relation` allowing only `novelty-threat | support | adjacent`. Reject any attempt to create a link from a `noise`-classified finding (raise, do not write a zero-strength edge). See design §3.1.
- **Verify:** A test feeding a `noise` finding to the linker raises and writes nothing to `ledger/` (negative test N5).

### 4. Build the Semantic Scholar verification pipeline
- **Do:** Implement a `VerificationAdapter` with the staged flow from design §4 / ADR-0005 §4:
  1. **NORMALIZE** — lowercase, strip punctuation/diacritics, collapse whitespace, drop arXiv `vN` suffix.
  2. **KEY LOOKUP** — if DOI/arXiv present, call S2 `/paper/DOI:{doi}` or `/paper/arXiv:{id}` (exact, cheapest).
  3. **TITLE MATCH** — else call S2 `/paper/search/match?query={norm_title}` for the single best match.
  4. **FUZZY GATE** — accept iff Levenshtein-ratio(norm_title, match_title) ≥ `0.70` AND year within `±1`.
  5. **DEDUP** — canonical-key precedence: DOI > arXiv (version-stripped) > S2 `paperId` > DBLP/ACL > normalized-title+author-surname hash.
  6. **EMIT** — `VerifiedSource` (content-addressed by canonical key) or mark `ambiguous` / `unverified`.
  Thresholds `0.70` and `±1` MUST be config values, not constants (design §4.3).
- **Verify:** Unit tests with fixtures (no live network) cover: exact DOI hit → `verified`; title ratio 0.82 + year match → `verified`; ratio 0.60 → `ambiguous`; ratio 0.40 → `unverified`. A test asserts a sub-0.55 match is never emitted as `verified` (negative test N2).

### 5. Implement the recall-first disposition table
- **Do:** Wire the decision table (design §4.1): `verified` pins metadata/`externalIds`; `ambiguous` (0.55 ≤ ratio < 0.70 or year off) is **kept and routed to human review**, never dropped; `unverified` (ratio < 0.55 or empty) keeps raw metadata flagged "could not verify"; S2 unreachable/429 → retry with backoff, cache, and **never block the Run** (status falls back to `unverified`).
- **Verify:** A test simulating an S2 timeout/429 confirms the Run completes, the candidate is cached, status is `unverified`, and a retry is scheduled (negative test N6). A test confirms an `ambiguous` result lands in a human-review queue, not the discard path.

### 6. Implement multi-key dedup across runs and adapters
- **Do:** Before emitting a `VerifiedSource`, look up the canonical key (precedence per Step 4.5) in the SQLite ledger-cache; if present, reuse the existing `VerifiedSource` and attach the new locator (a preprint and its published version collapse to one source via S2 `externalIds`, keeping both locators — design §4.2).
- **Verify:** A test ingests the same paper twice (once via arXiv adapter, once via S2 search) and asserts exactly one `VerifiedSource` row exists with two locators (negative test N4).

### 7. Assemble provenance-complete LedgerLink
- **Do:** When linking, populate `provenance{discovered_via, discovered_at, run_id, verification_status}`, `strength{score, basis}`, `rationale` (human-readable WHY, audit-only), `evidence_locator` (concrete pointer INTO the source, e.g. "p.4 §3.2 / abstract" — never the summary), and `generated_summary_ref` tagged `kind=generated-summary` (nullable, NEVER the backing). Set `review_status=proposed` by default (findings are proposals; brief §11). Persist via the append-only store (Step 2).
- **Verify:** A test asserts a `LedgerLink` whose only offered backing is a generated summary is **refused** (`evidence=false`) — the `evidence_locator` must point into the verified source (negative test N1). Schema validation rejects a link missing `provenance` or `evidence_locator`.

### 8. Index the ledger into the SQLite cache
- **Do:** On append, upsert a row into the SQLite ledger-cache (queryable by `target_ref`, `relation`, `verification_status`, `review_status`, `canonical_key`) so export (RB-040+) and read views select confirmed links without scanning JSONL. Files remain the source of truth; SQLite is a rebuildable index (ADR-0006).
- **Verify:** Delete the SQLite file, run a `reindex` command, and confirm the cache is rebuilt identically from `ledger/*.jsonl`; a query "what bears on `caw05:tgt-mc-dla-novelty`" returns the expected links.

## Acceptance criteria
- [ ] Four entities exist with CAW-05-local identities; `WatchedTarget` references foreign refs by opaque URI only (no shared store).
- [ ] `ledger/*.jsonl` is append-only; corrections add a `superseded_by` row; originals are never mutated (N7).
- [ ] `noise` findings are never linked (N5); relation vocabulary is `novelty-threat | support | adjacent` only.
- [ ] Verification emits `verified | ambiguous | unverified` per the gate; thresholds (`0.70`, `±1`) are config (N2).
- [ ] Ambiguous/sub-threshold matches route to human review and are never silently dropped (recall-first).
- [ ] A repeated paper across runs/adapters yields exactly one `VerifiedSource` with multiple locators (N4).
- [ ] S2 outage/429 retries with backoff, caches, and never blocks the Run (N6).
- [ ] Every `LedgerLink` is provenance-complete with an `evidence_locator` into the source; generated summary is `kind=generated-summary` and excluded from evidence (N1).
- [ ] SQLite ledger-cache rebuilds from JSONL; tree is green.

## Rollback / safety
- The ledger is append-only, so a faulty run is corrected by **superseding** rows, never by editing/deleting. To revert this runbook mid-way, drop the `ledger-cache` SQLite table (rebuildable) and discard the in-progress `ledger/<run_id>.jsonl` file for the current run only — committed prior-run JSONL stays intact.
- Verification calls are **public, read-only, ToS-safe** (S2/arXiv/DOI). No paywall scraping; if a non-public boundary or an internal claim ever appears on a finding, abort the link (brief §12, design §1.5).
- A failed S2 dependency degrades to `unverified` + retry; it must never block or fail the Run.

## Hand-off
The next runbook (RB-031 synthesis, then RB-040+ export) can assume: a queryable append-only ledger of provenance-complete `LedgerLink`s with verification status and dedup'd `VerifiedSource`s; that confirmed links are the single source of truth for export projection (ADR-0007); that `noise` never appears; and that every link separates evidence (`source` + `evidence_locator`) from generated summary. Export must project only `review_status=confirmed` links and re-enforce the evidence/boundary guards as defense-in-depth.

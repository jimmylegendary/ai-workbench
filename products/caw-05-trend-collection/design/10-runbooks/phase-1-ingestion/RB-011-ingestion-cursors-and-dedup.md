# RB-011: Implement core ingestion runtime — incremental cursors + multi-layer dedup

- Status: ready
- Phase: phase-1-ingestion
- Depends on: [RB-010-source-adapters.md]
- Implements design: [../../05-radar-core/source-ingestion-and-dedup.md](../../05-radar-core/source-ingestion-and-dedup.md), [../../07-backend-api/ingestion-service.md](../../07-backend-api/ingestion-service.md), [../../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
- Produces: the core collect+dedup stage of a Run — per-host token-bucket limiter, per-source **cursor store** (date/ETag/token watermarks, advance-on-success), **multi-layer dedup** (native id ▸ canonical ▸ SHA-256; SimHash flagged-off), the `seen` index (`state/seen.idx` projected into `index.sqlite`), provenance/boundary assertion, and deduped `Finding`s in `findings/*.json`.

## Objective
Build the **core** ingestion runtime that wraps the RB-010 adapters so weekly re-runs are **cheap and
duplicate-free** and a missed week **self-heals**. Cursors and dedup live in the **core** (ADR-0003 §D, ADR-0006
§4), inherited by every adapter — adapters never own this state. "Done" = a Run iterates active sources, applies
per-host rate limiting, persists per-source cursors **only on a fully successful pass**, collapses the same item
across sources into **one `Finding` with many provenance entries**, rejects provenance-incomplete raws at the core
boundary, and writes deduped `Finding`s to `findings/*.json`; a second identical Run fetches `new=0, dup=all`. The
posture is **recall-first**: when in doubt, re-fetch and let dedup absorb the overlap — never drop at the source,
and never let a default false-merge drop a finding.

## Preconditions
- [ ] RB-010 merged: v1 adapters emit provenanced `RawFinding`s, advertise `cursor_kind` + `rate_limit` via
      `capabilities()`, and expose the per-host limiter hook.
- [ ] FILES-AS-TRUTH layout from P0 exists: `findings/`, `state/`, `artifacts/`, plus `index.sqlite`.
- [ ] The collect loop skeleton + `cursor_store` / `seen_index` interfaces exist as P0 stubs (or are added here).
- [ ] Tree is green at HEAD.

## Steps

### 1. Per-host token-bucket limiter
- **Do:** Implement a shared **token-bucket limiter keyed on host**, configured from each adapter's
  `RateLimitSpec` (max_calls, per_seconds, concurrency). **Serialize per host** for arXiv (1 req/3 s, single
  connection) and EDGAR (≤10 req/s, IP-block on breach) — never parallelize the same host. Backoff-with-jitter
  stays inside the adapter (RB-010 obligation 2); the limiter governs steady-state pacing + concurrency.
- **Verify:** Under concurrent source fetches, requests to one host never exceed its bucket; arXiv calls are
  spaced ≥3 s and single-connection; two different hosts run in parallel.

### 2. Cursor store with advance-on-success
- **Do:** Implement `cursor_store.load(source_id)` / `save(source_id, cursor)` persisting an opaque `FetchCursor`
  per source under `state/<source>.cursor` (watermark + extra). Support every v1 cursor kind: arXiv/S2 OAI-PMH
  `from=<datestamp>` + `resumptionToken`; RSS `guid`/`id` + `ETag`/`Last-Modified`; GitHub `since=`/`pushed_at` +
  ETag; HN `created_at_i`. **Advance the cursor ONLY on a fully successful source pass.** On `SourceTransient`,
  **keep the cursor** (recall bias: re-fetch + dedup next run); on `SourceTerminal`, quarantine the source + alert,
  cursor unchanged. Support `caw05 run --since <date>` **backfill** which **ignores cursors**, and date-windowed
  catch-up after downtime (cap window size to respect rate limits).
- **Verify:** A successful pass advances + persists the cursor; a forced transient mid-pass leaves the cursor
  **unadvanced** and the partial pass discarded; a terminal error quarantines the source with cursor unchanged;
  `--since` backfill ignores the stored cursor.

### 3. Collect loop wiring (per Run)
- **Do:** Implement the core collect loop: for each `registry.active()` source → `preflight()` (legal_mode ok, not
  an active stub, healthcheck green) → load cursor → `fetch(query=source_query(window), cursor)` → for each raw,
  `assert_provenance_complete(raw)` (**reject + log** if missing; never store) → `stage_raw(raw)` (buffer, do NOT
  advance cursor yet) → on full success `cursor_store.save(advanced)`. Wrap in the typed transient/terminal
  handling from Step 2. This stage is the **only** one that touches the network.
- **Verify:** A Run over all v1 sources stages raws then advances cursors; a raw with a missing provenance field
  is rejected at the boundary (logged, not persisted), and that rejection does not block the rest of the pass.

### 4. Provenance & boundary stamping + large-payload-by-path
- **Do:** In the core, assert `boundary="public"` and a per-source `trust` prior on every `Finding` (seeds
  signal-vs-hype, ADR-0004). For `metadata_only_link` sources (HN), assert **no reproduced full text** beyond a
  fair-use snippet. Store large fetched payloads (PDFs, raw blobs) **by path** under `artifacts/<sha>/`, referenced
  from provenance — never inlined into `findings/*.json`.
- **Verify:** Every persisted `Finding` carries `boundary` + `trust`; an HN finding has no full body; a large
  payload is written under `artifacts/<sha>/` and referenced, not inlined.

### 5. Multi-layer dedup (recall-safe)
- **Do:** Implement dedup in the core, **cheapest layer first**, where a hit collapses to **one `Finding` with
  many `provenance` entries**:
  - **Layer 1 — native id (intra-source):** arXiv id+version, paperId, `owner/repo@tag`, Algolia objectID,
    accession. Exact match ⇒ known.
  - **Layer 2 — cross-source canonical identity:** `DOI ▸ arXiv id ▸ normalized title+author`. One finding across
    arXiv+S2+blog+HN.
  - **Layer 3 — exact content hash:** SHA-256 of normalized title+abstract/body for the same item via two sources.
  - **Layer 4 — SimHash near-dup (64-bit, Hamming threshold):** **implemented but flagged OFF by default** — a
    false-merge would *drop* a finding (recall risk). When off, **keep both**.
  Normalize URLs (strip trackers, resolve redirects) before hashing for blog/HN/newsletter dedup. Keep arXiv
  **versions distinct but linked** (a v2 can be a fresh novelty signal — do not fold into v1).
  `TODO(open-question: SimHash Hamming threshold + body normalization; is layer-4 on in v1 at all?)`.
- **Verify:** The same paper present on arXiv + S2 + a blog + HN collapses to **one** `Finding` with **four**
  provenance entries; an arXiv v1 and v2 of the same paper remain **two** linked findings; with layer 4 off, two
  near-duplicate-but-distinct items both survive.

### 6. The `seen` index (rebuildable SQLite projection)
- **Do:** Implement `merge_or_create(raw)`: compute `canonical_key(raw)` (or `content_hash` fallback); if
  `seen_index.has(key)` load the finding and append the new provenance; else create a new finding + `add(key)`.
  Persist the `seen` set to `state/seen.idx` and project it into `index.sqlite` for fast lookup. The index is
  **rebuildable from file truth** — deleting `index.sqlite` and replaying `findings/*.json` reproduces the `seen`
  set (ADR-0006 §A).
- **Verify:** Deleting `index.sqlite` and replaying files reproduces the identical `seen` set; a repeated
  `merge_or_create` of a known key appends provenance instead of creating a duplicate.

### 7. Export idempotency key (forward-compat)
- **Do:** Compute and store per-finding `idempotency_key = hash(finding_id + target + classification_version)`
  scaffolding so a later retry never double-routes a novelty-threat to CAW-03 (ADR-0004/ADR-0007). Classification
  fields are filled by P3 — here only reserve/derive the finding-side inputs.
- **Verify:** The key is deterministic for a fixed finding/target/version triple and changes when any input
  changes; no export is performed in this runbook (that is P4).

### 8. Negative-test suite (must hold)
- **Do:** Add the ADR-0006 negative tests: (a) re-running the same window ⇒ `new=0, dup=all`; (b) the same paper
  across four sources ⇒ one finding, four provenance entries; (c) a transient failure leaves the cursor unadvanced
  and the next run re-fetches + dedups cleanly; (d) deleting `index.sqlite` + replaying files reproduces `seen`.
- **Verify:** All four negative tests pass; tree is green.

## Acceptance criteria
- [ ] Per-host token-bucket limiter serializes arXiv (1 req/3 s) + EDGAR (≤10 req/s) and parallelizes distinct
      hosts; backoff-with-jitter remains inside adapters.
- [ ] Per-source cursors persist under `state/<source>.cursor` and advance **only on a fully successful pass**;
      transient failure keeps the cursor; terminal failure quarantines + alerts; `--since` backfill ignores cursors.
- [ ] Multi-layer dedup (native id ▸ canonical ▸ SHA-256) collapses the same item across sources into **one
      `Finding` with many provenance entries**; SimHash layer-4 is implemented but **off by default** (recall-safe);
      arXiv versions stay distinct but linked.
- [ ] A `RawFinding` missing any provenance field is **rejected at the core boundary**, not stored; every persisted
      `Finding` carries `boundary="public"` + a `trust` prior; large payloads stored by path under `artifacts/<sha>/`.
- [ ] The `seen` index is a rebuildable SQLite projection of file truth (delete + replay reproduces it).
- [ ] A second identical Run yields `new=0, dup=all`; all four ADR-0006 negative tests pass; tree is green.
- [ ] Dedup/cursors live in the **core** only — adapters remain thin and stateless on dedup (no source-specific
      branch leaked into the pipeline).

## Rollback / safety
- The collect+dedup runtime is additive on top of RB-010; to disable, the Run can run adapters without persisting
  cursors (degrades to full re-fetch + dedup) — never an inconsistent partial state.
- Cursors advance only on full success, so an interrupted Run never strands the watermark ahead of ingested data;
  re-running re-fetches the same window and dedup absorbs the overlap (recall-first self-heal).
- The `seen` index is disposable: if it is suspected corrupt, delete `index.sqlite` and replay `findings/*.json`
  to rebuild — file truth is authoritative.
- SimHash stays **off** unless an open-question threshold is set; this guarantees no silent recall loss from
  false-merges during P1.

## Hand-off
- P2 (relevance) can assume a stable, deduped `Finding` set in `findings/*.json` — one finding per real item with
  complete provenance, `boundary`, and `trust` — produced incrementally and reproducibly from files.
- P3/P4 can assume export-idempotency inputs are reserved on each finding, so routing a novelty-threat to CAW-03
  can be made retry-safe without re-touching ingestion.
- Operators can assume weekly cron re-runs are cheap (conditional GETs / cursors) and a missed week self-heals via
  the next, wider window.

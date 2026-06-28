# Storage & Scheduling — files-as-truth, SQLite index/cache, cron + incremental/dedup

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model.md](./data-model.md) (the entities stored here)
  - [./provenance-and-boundaries.md](./provenance-and-boundaries.md) (provenance/boundary carried by every record)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (the decision this elaborates)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md) (FTS5 BM25 over findings)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (cursor kinds, dedup keys)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (append-only ledger JSONL)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (export idempotency keys)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes **how CAW-05 persists state and runs on cadence**: the files-as-truth on-disk layout, the
rebuildable SQLite index/ledger-cache, the cron-triggered Run lifecycle, and the incremental cursors + multi-layer
dedup that make re-runs duplicate-free. It elaborates [ADR-0006](../01-decisions/ADR-0006-storage-and-scheduling.md)
at the file/path/state level; it does NOT re-decide the store choice (fixed there) nor define the entity schemas
(see [data-model](./data-model.md)).

## 1. The storage contract: files are truth, the DB is a cache
**Files (markdown/JSON/JSONL/YAML) are the single source of truth; `index.sqlite` is a disposable, rebuildable
derived cache.** Deleting the DB and replaying the files reproduces the FTS5/BM25 table, the `seen` dedup index,
and the ledger projection — bit-for-bit equivalent for query purposes. This keeps the store git-diffable and
auditable (brief §7) while still giving BM25 ranking (ADR-0002) and fast ledger queries.

| Concern | On disk (truth) | In SQLite (cache) |
|---|---|---|
| Interest artifact | `interests.yaml` (versioned) | mirror row for join |
| Findings | `findings/*.json` (one per finding) | FTS5 over title+abstract; relevance columns |
| Ledger | `ledger/*.jsonl` (append-only) | flattened link projection (`target_ref`, `relation`) |
| Dedup memory | derived from findings | `seen` table (canonical id, content hash) |
| Run history | `runs/<run_id>.receipt.json` | last-success cursor mirror |
| Large blobs (PDFs, raw API) | `artifacts/<sha>/…` by path | path reference only — never inlined |

## 2. On-disk layout (under CAW-05's own tree)
```
caw05-store/
  interests.yaml                 # ADR-0002 typed interest artifact; versioned in git history
  sources.yaml                   # SourceAdapter registry (v1 + documented stubs)
  findings/
    <run_id>/fnd-<uuid>.json     # one Finding per file (raw + relevance + embedded classification)
  ledger/
    links.jsonl                  # append-only LedgerLink rows; corrections add a row (superseded_by)
    targets.yaml                 # WatchedTarget anchors (foreign_ref + label)
    sources/src-<sha>.json       # VerifiedSource, content-addressed
  digests/
    <YYYY>-<WW>.md               # rendered weekly digest (+ other FormatRenderer outputs)
  exports/
    <target>/<idempotency_key>.caw05.jsonl   # signed ExportBundle, one signal per line
  state/
    <source>.cursor              # per-source watermark (advance-on-success)
    seen.idx                     # dedup index source (canonical id + content hash)
    run.lock                     # single-flight flock
  runs/
    <run_id>.receipt.json        # heartbeat + per-source {fetched,new,dup}, classified, exports, status
  index.sqlite                   # FTS5 + seen + ledger projection — REBUILDABLE, never authoritative
```

All text artifacts are git-trackable for audit/rollback. `index.sqlite` is `.gitignore`d (derived).

## 3. The Run is the unit of work
A Run is an idempotent, resumable `caw05 run --window weekly` — a checkpointed pipeline. The scheduler only
*starts* a Run on cadence; it owns no domain logic.

```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held → refused (logged, not stacked, not an error)
            └ any stage crash → checkpoint kept → next trigger resumes from that stage
done → writes runs/<run_id>.receipt.json
```

### Run wrapper guarantees (hold on plain cron — cron supplies none of these)
| Guarantee | Mechanism | Why it matters |
|---|---|---|
| Single-flight | exclusive `state/run.lock` (flock); 2nd trigger refused | cron has no overlap guard; no stampede |
| Catch-up | per-source `last_success_cursor`; missed week widens next window | a skipped week self-heals (recall) |
| Heartbeat | every Run writes a receipt; missing receipt > cadence+grace = alert | "radar went dark" is loud, not silent |
| Resume | stage checkpoints; re-running a `done` Run is a no-op | a killed Run restarts cleanly, green tree |
| Backfill | `caw05 run --since <date>` ignores cursors | watch-list seeding (brief §6) |

**Recall bias rule:** when in doubt, re-fetch and dedup rather than advance a cursor — a duplicate is cheap, a
missed paper is existential (brief §1).

## 4. Scheduling: cron v1 behind SchedulerAdapter
cron is the brief-fixed v1 adapter (brief §9). The `CronSchedulerAdapter` writes one crontab line invoking the
Run; everything cron lacks lives in the Run wrapper (§3), so correctness does not depend on the scheduler.

```cron
# weekly narrow radar — illustrative cadence; confirm day/time on review
# m h dom mon dow   command
  0 6 * * 1          caw05 run --window weekly >> caw05-store/runs/cron.log 2>&1
```

Documented stubs (ports, not built v1): **systemd timer** (`OnCalendar` + `Persistent=true` gives native
catch-up/overlap), cloud/Actions/Airflow. TODO(open-question: exact weekly day/time — set on review; do not invent).

## 5. Incremental cursors (don't re-fetch)
Each `SourceAdapter` advertises a cursor kind; the core persists it under `state/<source>.cursor` and **advances
only on a fully successful pass**.

| Source family | Cursor mechanism | Stored value |
|---|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (never set `until`); carry `resumptionToken` | last datestamp |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET | guid + etag |
| GitHub | `since=` + repo `pushed_at` watermark | pushed_at |
| HN (light/stub) | Algolia `numericFilters=created_at_i>cursor` | created_at_i |
| Securities (stub) | EDGAR RSS / full-text `dateRange` | last accession date |

Cursor advance is transactional with receipt write: a crash before `done` leaves the old cursor, so the next Run
re-spans the window (duplicates removed by dedup, §6).

## 6. Dedup across runs (don't re-process / re-emit)
Content-addressed `seen` index, cheapest layer first. Recall-safe default: when uncertain, **keep both**.

| Layer | Key | Catches | v1 |
|---|---|---|---|
| 1. Canonical id | DOI / arXiv id / URL-normalized / repo+sha | exact same item | **on** |
| 2. Content hash | SHA-256 of normalized title+abstract/body | same item via two sources | **on** |
| 3. Near-dup fingerprint | SimHash (64-bit, Hamming threshold) | reposts/mirrors | **flagged off** (false-merge drops a finding) |
| 4. Export idempotency | `hash(finding_id + target + classification_version)` | double-route to a consumer | **on** |

Layer 4 is the boundary guarantee: an `ExportAdapter` re-emitting the same `idempotency_key` is a no-op
(ADR-0007), so a retry never double-routes a novelty-threat to CAW-03. SimHash (layer 3) is deferred precisely
because a false-merge would *drop* a real near-collision — wrong tradeoff for a recall-first radar (ADR-0006).

## 7. Index rebuild & consistency
`caw05 index rebuild` drops `index.sqlite` and replays `findings/*.json` + `ledger/*.jsonl` + `state/seen.idx`
to reconstruct FTS5, the `seen` table, and the ledger projection. The rebuild is the consistency authority: on any
suspected file↔index drift, rebuild rather than reconcile in place.

## Negative tests (must hold)
- Re-running the same window → per-source `new=0`, `dup=all`.
- A retry → no double-export (idempotency key dedups).
- Deleting `index.sqlite` + rebuild → reproduces index, ledger projection, and `seen` set.
- A second concurrent trigger → refused, not stacked.
- A skipped week → alert (missing receipt), not a silent no-op.

## Open Questions
- TODO(open-question: heartbeat/dead-man's-switch sink + alert channel given "no shared substrate" — local
  "no receipt in N days" check vs external service? — ADR-0006.)
- TODO(open-question: SimHash Hamming threshold + body normalization — is layer-3 on for v1 at all? — ADR-0006.)
- TODO(open-question: ledger/run-JSONL compaction + tombstone TTL — how long for dedup memory + audit? — ADR-0006.)
- TODO(open-question: long-running Run as one synchronous process vs resumable stage-jobs with a job handle —
  affects crash-resume and the CLI/MCP `status` contract.)
- TODO(open-question: exact weekly cron day/time.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (to be created).

## Implications for runbooks
- **RB (store):** files-as-truth layout (§2) + SQLite index builder + `index rebuild` command; large artifacts by
  path; `.gitignore` the DB.
- **RB (Run wrapper):** lifecycle, single-flight flock, stage checkpoints/resume, run-receipt + heartbeat,
  `--since` backfill (green with fakes).
- **RB (incremental/dedup):** cursor store (advance-on-success), `seen` index (id + SHA-256; SimHash flagged),
  export idempotency keys; the five negative tests above as acceptance checks.
- **RB (scheduler adapter):** `CronSchedulerAdapter` writing the crontab line; systemd-timer/cloud as stubs.

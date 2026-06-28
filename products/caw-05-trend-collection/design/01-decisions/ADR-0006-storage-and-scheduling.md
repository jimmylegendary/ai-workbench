# ADR-0006: Storage, scheduling, and incremental/dedup across runs

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - Source of truth: [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§4, §7, §9, §11)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - Research: [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md), [../02-research/source-ingestion.md](../02-research/source-ingestion.md), [../02-research/interest-modeling.md](../02-research/interest-modeling.md) (FTS5 index)
  - ADR-0002 interest model — [./ADR-0002-interest-model.md](./ADR-0002-interest-model.md) (SQLite FTS5 over findings)
  - ADR-0003 source adapters & ingestion — [./ADR-0003-source-adapters-and-ingestion.md](./ADR-0003-source-adapters-and-ingestion.md) (SourceAdapter cursor kinds, RawFinding)
  - ADR-0004 classification & triage — [./ADR-0004-classification-and-triage.md](./ADR-0004-classification-and-triage.md) (the classify stage)
  - ADR-0005 related-work ledger — [./ADR-0005-related-work-ledger.md](./ADR-0005-related-work-ledger.md) (what the store persists; append-only links)
  - ADR-0007 export boundaries — [./ADR-0007-export-boundaries.md](./ADR-0007-export-boundaries.md) (the export stage + idempotency)
  - CAW-03 (a separate product) — same registry *pattern*, no shared registry/store

## Context

The radar's value is **high recall on a narrow watch list, weekly, with no one remembering to run it**
(brief §1, §3). That imposes three coupled requirements: a **store** that is the product's own, markdown/JSON +
a lightweight index/ledger (brief §7); a **scheduler** that fires the weekly run and never *silently* skips a
week (a skipped week is an existential recall risk); and **incremental/dedup** so a re-run or retry does not
re-fetch, re-classify, or — worst — double-emit a novelty-threat to CAW-03.

Forces:
- Weekly, unattended, must catch up a missed run and prove it ran (heartbeat), not silently no-op.
- Re-runs/retries must be duplicate-free at every layer: fetch, ledger rows, exports.
- Sources are heterogeneous, public, rate-limited, ToS-bound (brief §5, §12).
- No shared runtime substrate; exports cross explicit product boundaries (brief §1, §8).
- The store must stay human-diffable/auditable (markdown/JSON) yet support BM25 ranking (ADR-0002) and the
  append-only ledger (ADR-0005).

## Options considered

### A. On-disk store

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Markdown/JSON files (git-tracked) as source of truth + SQLite (FTS5) as a rebuildable index/cache; large fetched artifacts by path** | human-diffable + auditable; matches family + brief §7; index is disposable and rebuildable; no service | two representations to keep in sync (file = truth, db = derived) | **chosen** |
| SQLite as source of truth | one store, transactional | opaque to git diff/review; not "markdown/JSON-first" (brief §7) | rejected as truth (kept as index only) |
| External DB / service | scales | a shared/standing substrate; violates independence + brief §7 | rejected |

The contract: **files are truth, the DB is a cache.** Deleting the DB and replaying files reproduces the index,
the FTS5 table (ADR-0002), the `seen` index, and the ledger projection. Findings/links/run-receipts are JSON
(one record per file or JSONL per run); the ledger is append-only JSONL with `superseded_by` (ADR-0005); large
fetched payloads (PDFs, raw API blobs) are stored **by path**, referenced from provenance, never inlined.

### B. Scheduler trigger

| Option | Catch-up | Overlap guard | Observability | Fit |
|---|---|---|---|---|
| **cron** (brief-fixed v1) | none natively | none natively | none natively | **chosen** (brief §9) — gaps fixed in the Run wrapper |
| systemd timer (`OnCalendar` + `Persistent=true`) | native | native | journald | best on a real host — ship as a `SchedulerAdapter` stub |
| cloud/Actions/Airflow | varies | varies | varies | later adapters |

**Decision:** cron is the v1 adapter; the properties cron lacks are implemented **in the Run wrapper, not
assumed from the scheduler**, so the radar is correct even on plain cron. The `SchedulerAdapter` port abstracts
the trigger so a systemd-timer adapter can later supply catch-up natively.

### C. Catch-up mechanism

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Per-source cursor watermark (catch-up via state, not clock)** | a missed week self-heals — next run's window simply spans more time; works on any scheduler | needs durable cursor + "advance only on success" discipline | **chosen** |
| Replay missed clock fires | conceptually simple | depends on scheduler features cron lacks; double-fires risk stampede | rejected as the mechanism |

## Decision

**1. Store = files-as-truth + SQLite index/ledger-cache.** Layout under CAW-05's own tree (illustrative):
`interests.yaml`/`.json` (ADR-0002); `findings/*.json`; `ledger/*.jsonl` (append-only, ADR-0005);
`state/<source>.cursor`; `state/seen.idx`; `runs/<run_id>.receipt.json`; `artifacts/<sha>/…` (large blobs by
path); `index.sqlite` (FTS5 + `seen` + ledger projection — **rebuildable**). All text artifacts are
git-trackable for audit/rollback.

**2. The unit of work is a Run** — an idempotent, resumable invocation `caw05 run --window weekly` — a pipeline
of checkpointed stages: `collect → dedup → classify → synthesize → export → done`. The scheduler only starts a
Run on cadence; it owns no domain logic.

**3. The Run wrapper guarantees (regardless of scheduler):**
- **Single-flight lock** — a run acquires an exclusive lock (`run.lock` / flock); a second trigger while one is
  in flight is refused, not stacked (cron has no overlap guard).
- **Catch-up via watermark** — each source advances `last_success_cursor` only on a fully successful pass; a
  missed week is absorbed by the next run's wider window. **Recall bias: when in doubt, re-fetch and dedup
  rather than advance the cursor.**
- **Heartbeat / dead-man's-switch** — every run writes a `run-receipt` (start, end, per-source
  {fetched,new,dup}, classified counts, exports, status); a missing receipt for > cadence + grace is an
  **alert** ("the radar went dark"), satisfying "must not silently skip."
- **Resumable, idempotent stages** — a crash re-enters at the last completed stage; re-running a `done` Run is a
  no-op (idempotency keys, below).
- **Backfill** — `caw05 run --since <date>` ignores cursors for a one-off historical sweep (watch-list seeding,
  brief §6).

**4. Incremental & dedup live in the core** (so every `SourceAdapter` inherits them):

*Per-source cursor (don't re-fetch)* — each adapter advertises a cursor kind; the core persists it:

| Source family | Cursor mechanism |
|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (never set `until`), carry `resumptionToken` to page |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET |
| GitHub | `since=` + repo `pushed_at` watermark |
| HN (light/stub) | Algolia `numericFilters=created_at_i>cursor` |
| Securities (stub) | EDGAR RSS / full-text `dateRange`; cursor = last accession date |

*Content-addressed dedup (don't re-process / re-emit)* — a `seen` index, cheapest layer first:
1. **Canonical id** — DOI / arXiv id / URL-normalized / repo+sha (exact match ⇒ known).
2. **Exact content hash** — SHA-256 of normalized title+abstract/body (catches the same item via two sources).
3. **Near-duplicate fingerprint** — SimHash (64-bit, Hamming threshold) for reposts/mirrors. **v1 = layers
   1+2; SimHash is layer-3 behind a flag** (a false-merge would *drop* a finding, violating recall priority;
   recall-safe default = keep both).
4. **Export idempotency** — each export bundle carries `idempotency_key = hash(finding_id + target +
   classification_version)`; an `ExportAdapter` re-emitting the same key is a no-op (ADR-0007), so retries
   never double-route a novelty-threat to CAW-03.

**5. Run lifecycle (state, not prose):**
```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held by another run → refused (logged, no error)
            └ any stage crash → checkpoint kept → next trigger resumes from checkpoint
done → writes run-receipt {window, per_source:{fetched,new,dup}, classified_counts, exports[], status}
```

## Consequences

**Easy:** a missed week self-heals on the next run; re-running the same window yields new=0/dup=all; a killed
Run resumes from its last stage; the store is git-auditable and the index is throwaway/rebuildable; retries
never double-export (idempotency key); BM25 (ADR-0002) and the ledger (ADR-0005) sit on one substrate.

**Hard / follow-on:** two representations (file truth + DB cache) need a rebuild path and a consistency check;
the heartbeat needs a sink that respects "no shared substrate" (local "no receipt in N days" check vs an
external dead-man service — open question); append-only ledger + run JSONL grow unbounded without a
compaction/retention policy; SimHash thresholds are deferred precisely because a false-merge harms recall.

**Negative tests (must hold):** re-running the same window fetches new=0; a retry does not double-export;
deleting `index.sqlite` and replaying files reproduces the index, ledger projection, and `seen` set; a second
concurrent trigger is refused, not stacked; a skipped week raises an alert, not a silent no-op.

**Implications for runbooks:** **RB (core/Run-wrapper)** — Run lifecycle, single-flight lock, stage
checkpoints/resume, run-receipt + heartbeat, `--since` backfill (green with fakes). **RB (store)** —
files-as-truth layout + SQLite index builder + rebuild-from-files command; large artifacts by path. **RB
(incremental/dedup)** — cursor store (advance-on-success), `seen` index (id + SHA-256; SimHash flagged),
export idempotency keys. **RB (scheduler adapter)** — `CronSchedulerAdapter` writing a crontab line calling
`caw05 run --window weekly`; systemd-timer/cloud adapters as documented stubs.

## Open questions / revisit triggers

- TODO(open-question: heartbeat/dead-man's-switch sink and alert channel given "no shared substrate" — local
  check vs external service?)
- TODO(open-question: SimHash Hamming threshold + body normalization for layer-3 — acceptable false-merge rate
  given recall is the mission; is layer-3 on for v1 at all?)
- TODO(open-question: ledger/run-JSONL compaction + `discard` tombstone retention/TTL — how long for dedup
  memory + audit?)
- TODO(open-question: long-running Run as one synchronous process vs resumable stage-jobs with a job handle —
  affects crash-resume and the CLI/MCP `status` contract.)
- TODO(open-question: file↔index consistency check — periodic verify, or trust rebuild-on-mismatch?)
- **Revisit trigger:** if findings volume outgrows file-per-record + SQLite, or the index rebuild becomes too
  slow, reopen the store decision before adding a service.
- See `../08-research-plan/open-questions.md` (to be created).

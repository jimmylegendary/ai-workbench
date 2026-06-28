# Scheduled Pipeline — the cron-driven weekly Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [cli-and-mcp.md](cli-and-mcp.md) (`run`/`backfill`/`status` also fire/inspect this Run)
  - [digest-outputs.md](digest-outputs.md) (the synthesize stage's outputs)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (Run = unit of work; cron is the primary surface)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (store, lock, cursors, dedup, receipts — **authoritative**)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (cursor kinds, RawFinding)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (classify stage)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (export stage idempotency)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes the **scheduled automation surface** — the cron-fired **weekly Run** — and how it stays
correct on plain cron: incremental collection via per-source cursors, multi-layer dedup, the single-flight lock,
heartbeat/dead-man's-switch, and failure/retry/catch-up. It **elaborates** ADR-0006 (which is authoritative for
the store and lifecycle) for the operations reader; it does NOT redefine the storage layout or restate the dedup
rationale. The mission constraint that frames everything: **the radar must not silently skip a week** — a missed
close paper is an existential novelty risk (brief §1).

## What the scheduler does — and does not
The scheduler **only fires** the Run on cadence. It owns **no domain logic**. Every property cron lacks
(catch-up, overlap guard, observability) lives in the **Run wrapper**, so the radar is correct even on bare cron
(ADR-0006 §B). `CronSchedulerAdapter` is the v1 adapter behind the `SchedulerAdapter` port; systemd-timer
(`OnCalendar` + `Persistent=true`) and cloud/Actions/Airflow are **documented stubs** (brief §9).

```cron
# CronSchedulerAdapter installs one line (cadence illustrative — confirm on review):
# m h dom mon dow   command
  0 6 * * 1   /usr/bin/caw05 run --window weekly >> $CAW05_HOME/runs/cron.log 2>&1
```
TODO(open-question: exact weekly cadence/day/time + timezone — not yet fixed; ADR-0006 leaves cadence to review.)

## The Run lifecycle (state, not prose)
The unit of work is one **Run** — idempotent, resumable, checkpointed (ADR-0001 §1, ADR-0006 §2/§5):

```text
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held by another run → refused (logged, no error, no stacking)
            └ any stage crash → checkpoint kept → next trigger resumes from that checkpoint
done → writes run-receipt {window, per_source:{fetched,new,dup}, classified_counts, exports[], status}
```

| Stage | Does | Recall-relevant guarantee |
|---|---|---|
| acquiring-lock | `flock` on `run.lock` | second concurrent trigger **refused**, not stacked |
| collecting | each `SourceAdapter` fetches from its cursor | advance cursor **only on full success** |
| deduping | `seen` index: canonical-id → SHA-256 (→ SimHash flagged) | recall-safe default = **keep both** on doubt |
| classifying | LF→LLM→human cascade (ADR-0004) | low confidence ⇒ abstain → human, never dropped |
| synthesizing | `FormatRenderer` over findings (ADR-0001) | `noise` not synthesized; banner stamped |
| exporting | `ExportAdapter` bundles (ADR-0007) | idempotency key ⇒ never double-route |
| done | write `run-receipt` | heartbeat proof the radar ran |

## Incremental collection (don't re-fetch)
Each adapter advertises a cursor kind; the core persists `state/<source>.cursor` and **advances it only on a
fully successful pass** (ADR-0006 §4). A partial/failed source keeps its old cursor, so the next run re-attempts
that window — recall-biased: **when in doubt, re-fetch and dedup rather than advance**.

| Source family | Cursor mechanism |
|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (never set `until`); carry `resumptionToken` to page |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET |
| GitHub | `since=` + repo `pushed_at` watermark |
| HN (light/stub) | Algolia `numericFilters=created_at_i>cursor` |
| Securities (stub) | EDGAR RSS / full-text `dateRange`; cursor = last accession date |

Only legal/ToS-safe ingestion (brief §12); rate limits and conditional GETs are respected per adapter.

## Multi-layer dedup (don't re-process / re-emit)
A content-addressed `seen` index, cheapest layer first (ADR-0006 §4):
1. **Canonical id** — DOI / arXiv id / URL-normalized / repo+sha (exact ⇒ known).
2. **Exact content hash** — SHA-256 of normalized title+abstract/body (same item via two sources).
3. **Near-duplicate fingerprint** — SimHash (64-bit Hamming) — **v1 = layers 1+2; SimHash is layer-3 behind a
   flag** (a false-merge would *drop* a finding, violating recall priority; recall-safe default = keep both).
4. **Export idempotency** — `idempotency_key = hash(finding_id + target + classification_version)`; an
   `ExportAdapter` re-emitting the same key is a no-op, so retries never double-route a novelty-threat to CAW-03.

## Catch-up — a missed week self-heals
Catch-up is via **state, not clock** (ADR-0006 §C): the next Run's window simply spans more time because the
cursor advanced only on the last success. There is no clock-fire replay (cron lacks it; replay risks a stampede).
`caw05 run --since <date>` (backfill) ignores cursors for a one-off historical sweep — used to seed the narrow
watch list (brief §6).

## Failure / retry / overlap
| Failure | Behavior | Why |
|---|---|---|
| Run crashes mid-stage | checkpoint kept; **next trigger resumes** at last completed stage | idempotent stages (ADR-0006 §3) |
| Re-run of a `done` window | new=0 / dup=all; no-op | idempotency keys |
| Second trigger while one in flight | **refused** (logged), not stacked | single-flight `flock` |
| One source errors | its cursor not advanced; other sources proceed; receipt records the failure | recall: re-attempt next run |
| Export target unreachable | bundle queued; idempotency key dedups on retry | ADR-0007 |
| Transient HTTP / rate-limit | per-adapter bounded retry/backoff | TODO(open-question: retry budget) |

Retries are **safe by construction**: every mutating stage is keyed (cursor advance-on-success; SHA `seen`;
export idempotency key), so re-execution can never double-fetch, double-classify, or double-export.

## Heartbeat / dead-man's-switch
Every Run writes a `run-receipt` JSON (start, end, per-source `{fetched,new,dup}`, classified counts, exports,
status) to `runs/<run_id>.receipt.json`. **A missing receipt past `cadence + grace` is an alert — "the radar
went dark" — not a silent no-op** (ADR-0006 §3). This is the brief's "must not silently skip a week" guarantee.
`caw05 status` surfaces this state (see [cli-and-mcp.md](cli-and-mcp.md)).

```jsonc
// runs/<run_id>.receipt.json (shape; counts are runtime, not invented here)
{ "run_id": "r_…", "window": "weekly", "started_at": "…", "ended_at": "…",
  "per_source": { "arxiv": {"fetched": 0, "new": 0, "dup": 0} },
  "classified_counts": { "novelty-threat": 0, "support": 0, "adjacent": 0, "noise": 0 },
  "exports": [], "status": "done" }
```

## Negative tests (must hold — from ADR-0006)
- Re-running the same window fetches new=0.
- A retry does not double-export.
- Deleting `index.sqlite` and replaying files reproduces the index, ledger projection, and `seen` set.
- A second concurrent trigger is refused, not stacked.
- A skipped week raises an alert, not a silent no-op.

## Open Questions
- TODO(open-question: heartbeat/dead-man sink + alert channel given "no shared substrate" — local check vs
  external service?)
- TODO(open-question: per-adapter retry/backoff budget + circuit-breaker for a persistently failing source.)
- TODO(open-question: weekly cadence day/time/timezone and grace window length.)
- TODO(open-question: ledger/run-JSONL compaction + `discard` tombstone retention/TTL.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (Run wrapper):** lifecycle, single-flight lock, stage checkpoints/resume, run-receipt + dead-man check,
  `--since` backfill (green with fake adapters).
- **RB (incremental/dedup):** cursor store (advance-on-success), `seen` index (id + SHA-256; SimHash flagged),
  export idempotency keys.
- **RB (scheduler adapter):** `CronSchedulerAdapter` writes the crontab line calling `caw05 run --window
  weekly`; systemd-timer/cloud as documented stubs.

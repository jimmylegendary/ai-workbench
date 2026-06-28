# Scheduler & Persistence — cron trigger, files/SQLite store, ledger append

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./api-surface.md](./api-surface.md) (the `run`/`backfill`/`status` ops)
  - [./ingestion-service.md](./ingestion-service.md) (cursor + seen-index it persists)
  - [./synthesis-service.md](./synthesis-service.md) (artifacts it persists)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (the Run, scheduler binding)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (append-only ledger)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (export idempotency)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describes the **runtime substrate of one CAW-05 deployment** (its own — no shared substrate): the cron
`SchedulerAdapter` that fires the weekly Run, the Run wrapper that supplies the catch-up/overlap/heartbeat
guarantees cron lacks, and the **files-as-truth + SQLite-index** persistence layer including append-only ledger
writes. It implements ADR-0006 (storage + scheduling) and the Run lifecycle of ADR-0001. It does NOT define source
fetch (sibling), classification (sibling), the ledger record schema (ADR-0005), or export-bundle format (ADR-0007).

## Scheduler binding (cron v1 via SchedulerAdapter)
The scheduler only **fires** the Run; it owns no domain logic. cron lacks catch-up, overlap guard, and heartbeat —
so those live in the Run wrapper, making the radar correct even on plain cron (ADR-0001 §B, ADR-0006 §B).

```text
interface SchedulerAdapter:
  install(schedule_spec, command) -> InstallResult
  uninstall() -> Result
  list() -> ScheduleEntry[]
```

| Adapter | Tier | Catch-up | Overlap | Observability |
|---|---|---|---|---|
| `CronSchedulerAdapter` | **v1** | none (wrapper) | none (wrapper) | none (wrapper heartbeat) |
| `SystemdTimerAdapter` | stub | native (`Persistent=true`) | native | journald |
| `CloudSchedulerAdapter` | stub | varies | varies | varies |

`CronSchedulerAdapter.install` writes a crontab line invoking `caw05 run --window weekly`. A missing run-receipt
past `cadence + grace` is an **alert** ("the radar went dark"), never a silent no-op (brief: "must not silently
skip a week").

## The Run wrapper (guarantees independent of scheduler)
```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held by another run → refused (logged, no error)
            └ any stage crash → checkpoint kept → next trigger resumes from checkpoint
done → writes run-receipt
```

| Guarantee | Mechanism |
|---|---|
| **Single-flight lock** | exclusive `run.lock` / `flock`; a second trigger in-flight is refused, not stacked |
| **Catch-up via watermark** | each source advances `last_success_cursor` only on a fully successful pass; a missed week is absorbed by the next, wider window |
| **Heartbeat / dead-man's-switch** | every run writes a `run-receipt`; missing receipt > cadence+grace ⇒ alert |
| **Resumable, idempotent stages** | crash re-enters at last completed stage; re-running a `done` Run is a no-op |
| **Backfill** | `caw05 run --since <date>` ignores cursors for a one-off historical sweep (watch-list seeding) |

**Recall bias:** when in doubt, re-fetch and dedup rather than advance the cursor.

```text
RunReceipt = {
  run_id, window, started_at, ended_at, status,
  per_source: { <source>: {fetched, new, dup, errors} },
  classified_counts: { <axis-combo>: int },
  exports: ExportRef[], alerts: string[],
}
```

## Persistence — files-as-truth + SQLite index/cache
**Contract: files are truth; the DB is a rebuildable cache** (ADR-0006 §A). Deleting `index.sqlite` and replaying
the files reproduces the FTS5 table, the `seen` index, and the ledger projection.

### On-disk layout (under CAW-05's own tree; illustrative)
```text
interests.yaml | interests.json        # the typed interest artifact (ADR-0002), versioned
findings/<finding_id>.json             # one record per finding (truth)
ledger/<stream>.jsonl                  # append-only LedgerLink stream (ADR-0005)
state/<source>.cursor                  # per-source watermark
state/seen.idx                         # dedup memory (also projected into SQLite)
runs/<run_id>.receipt.json             # heartbeat receipt
artifacts/<sha>/...                    # large fetched blobs (PDFs, raw payloads) BY PATH
exports/<target>/<idempotency_key>.bundle   # signed export bundles (ADR-0007)
synthesis/<run_id>/<format>/...        # rendered markdown artifacts
index.sqlite                           # FTS5 + seen + ledger projection — REBUILDABLE
```
- All text artifacts are **git-trackable** for audit/rollback.
- Large payloads are stored **by path**, referenced from provenance, never inlined into JSON.

### SQLite index (derived, disposable)
| Table/role | Built from | Used by |
|---|---|---|
| FTS5 over findings | `findings/*.json` | BM25 relevance (ADR-0002) |
| `seen` index | canonical ids + content hashes | dedup (ingestion service) |
| ledger projection | `ledger/*.jsonl` | ledger queries / verification cache |

```text
rebuild_index():            # idempotent; truth = files
    drop(index.sqlite)
    for f in findings/*.json: upsert_fts(f); add_seen(f)
    for line in ledger/*.jsonl: project_ledger(line)
```

## Ledger append (append-only)
The ledger is append-only JSONL with `superseded_by` for corrections (never in-place edits — ADR-0005).
```text
ledger_append(link):
    assert provenance_complete(link)        # reject incomplete links
    append_jsonl(ledger/<stream>.jsonl, link)
    project_into(index.sqlite)              # cache only; file remains truth
# a correction appends a new record with superseded_by = <old_link_id>; history is preserved
```

## Idempotency keys (no double-effect on retry)
| Concern | Key | Effect |
|---|---|---|
| re-fetch | per-source cursor (advance-on-success) | re-run yields `new=0` |
| re-process | `seen` index (canonical id + SHA-256) | known item skipped |
| re-export | `idempotency_key = hash(finding_id + target + classification_version)` | re-emit is a no-op (ADR-0007) |

This guarantees a retry **never double-routes a novelty-threat to CAW-03**.

## Negative tests (must hold — ADR-0006)
- Re-running the same window fetches `new=0`.
- A retry does not double-export (idempotency key).
- Deleting `index.sqlite` and replaying files reproduces the index, ledger projection, and `seen` set.
- A second concurrent trigger is refused, not stacked.
- A skipped week raises an alert, not a silent no-op.

## Open Questions
- TODO(open-question: heartbeat/dead-man's-switch sink + alert channel given "no shared substrate" — local "no
  receipt in N days" check vs external service?)
- TODO(open-question: ledger/run-JSONL compaction + `discard` tombstone retention/TTL for dedup memory + audit.)
- TODO(open-question: long-running Run as one synchronous process vs resumable stage-jobs with a job handle —
  affects crash-resume + the `status` contract.)
- TODO(open-question: file↔index consistency check — periodic verify vs trust rebuild-on-mismatch.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (Run wrapper):** lifecycle, single-flight lock, stage checkpoints/resume, run-receipt + heartbeat,
  `--since` backfill — green with fakes.
- **RB (store):** files-as-truth layout + SQLite index builder + `rebuild-from-files` command; large artifacts by
  path.
- **RB (incremental/dedup):** cursor store (advance-on-success), `seen` index (id + SHA-256; SimHash flagged),
  export idempotency keys.
- **RB (scheduler adapter):** `CronSchedulerAdapter` writing the crontab line; systemd-timer/cloud as stubs.

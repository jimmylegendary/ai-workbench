# Storage & Scheduling — file-based own store, append-only ledger, scout automation

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [data-model.md](data-model.md) (the entities this layout persists)
  - [provenance-and-uncertainty.md](provenance-and-uncertainty.md) (append-only `status_log`, supersede semantics)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (the decision this elaborates)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (append-only ledger + repro gate)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (`FetchCursor`, `sources.yaml`)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (`store/exports/` receipts)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes **where CAW-06's records live on disk** and **how the ExperimentScout runs them on a schedule**. It
elaborates ADR-0007: the typed file-store layout, the append-only-with-supersede mutation model, the disposable
derived index, `FetchCursor` persistence, and the cron-like + event-triggered scheduler with its human-in-the-loop
gate. It does NOT re-decide the entity schemas (see [data-model.md](data-model.md)) or the uncertainty rules (see
[provenance-and-uncertainty.md](provenance-and-uncertainty.md)). The store is **CAW-06's OWN** — no shared runtime,
store, or registry with CAW-01/CAW-02/CAW-05 (brief §1, §8).

## 1. Why files (not a database)
Per ADR-0007 (chosen) and brief §7: markdown/JSON records + artifacts-by-path, git-trackable.

| Force | How files satisfy it |
|---|---|
| Family consistency (brief §7) | markdown/JSON + a small ledger, diffable, zero infra |
| Auditability + append-only | every record diffs in git; ledger + `status_log` never edit in place |
| Failures durable (brief §5) | nothing deleted; `supersede` keeps the replaced failure |
| Idempotent automation | adapters resume from a persisted `FetchCursor`; re-runs don't duplicate |
| Independence (brief §1, §8) | the store and scheduler are CAW-06's own; no shared substrate |

Rejected: SQLite as source of truth (binary, loses diffability, drifts from family). A derived index is allowed
but **disposable** — see §4.

## 2. Store layout

```
caw-06/
├─ store/                          # canonical source of truth (git-tracked, diffable)
│  ├─ sources/      SRC-0001.md            # Source records (front-matter + body)
│  ├─ claims/       CLAIM-0011.md          # extracted, attributable Claims
│  ├─ hypotheses/   HYP-0003.md            # Hypothesis + append-only status_log
│  ├─ ledger/
│  │  └─ EXP-0007/  entry.md  result.json  # one dir per run (one run = one entry)
│  ├─ implications/ IMAP-0002.md           # ImplicationMap (summary marked generated)
│  ├─ writeback/    WBT-0001.{md,json}     # wbtraffic.v0 artifacts (CAW-01 payloads)
│  └─ exports/      EXB-0005.json          # ExportBundle receipts (ADR-0008)
├─ artifacts/                      # LARGE files, referenced BY PATH — never inlined
│  └─ EXP-0007/     config.yaml  env.lock  metrics.json  REPRO.md  logs/  plots/
├─ index/                         # DISPOSABLE derived index (rebuildable from store/)
│  └─ index.sqlite | index.json
├─ cursors/                       # FetchCursor per adapter (resumable scout)
│  └─ arxiv.json  semantic-scholar.json  caw05.json
├─ queue/                         # review queue: staged promotions + supported exports
│  └─ pending/  approved/
└─ sources.yaml                   # adapter registry + schedule (doubles as schedule registry)
```

Rules:
- **One markdown/JSON record per entity**, envelope in front-matter (data-model.md §2).
- **Large artifacts by path only** (configs, metrics, logs, checkpoints, plots under `artifacts/EXP-XXXX/`).
- IDs are stable + monotonic per prefix (`SRC/CLAIM/HYP/EXP/IMAP/WBT/EXB`).

## 3. Append-only with supersede
Ledger entries (ADR-0003) and the Hypothesis `status_log` (ADR-0002) are **append-only**; a correction is a new
record/event with `lineage.supersedes`, never an in-place edit.

| Operation | How | What it preserves |
|---|---|---|
| New finding | write a new record | — |
| Correct/refine a run | new `EXP-NNNN` with `lineage.supersedes: EXP-MMMM` | the superseded failure stays on disk |
| Status change | append a `StatusEvent` to `status_log` | the full reversible history (provenance doc) |
| Delete | **never** | failures are first-class (brief §5) |

A **"current" resolver** computes latest-state views ("current verdict" per hypothesis = newest non-superseded
entry; "current status" = newest `StatusEvent`). The resolver is a pure function over `store/`; deleting `index/`
loses nothing.

## 4. Derived index (disposable)
A rebuildable index (SQLite or a flat JSON file) powers queries the flat files can't do cheaply: the
**negative-results view** (all `refuted`/`inconclusive`/non-null `failure_mode`, grouped by `hypothesis_id` +
`failure_mode`), per-hypothesis run history, and thread queries. Files remain canonical; `index/` is regenerated by
a full scan and can be wiped at any time.
- `TODO(open-question: index backend — SQLite vs flat JSON; does v1 query volume justify SQLite?)` (ADR-0007).

## 5. FetchCursor (idempotent, resumable scout)
The scheduler persists each adapter's opaque `FetchCursor` under `cursors/` so scheduled re-runs are incremental
(ADR-0005, ADR-0007 §4):

| Adapter | Cursor content |
|---|---|
| `ArxivAdapter` | watermark / resumptionToken + last `retrieved_at` |
| `SemanticScholarAdapter` | page offset / continuation token |
| `CAW05ImportAdapter` | last consumed `bundle_id` (the import watermark) |

Re-running with an unchanged cursor produces no downstream duplicates; dedup (DOI ▸ arXiv id ▸ normalized title)
merges rediscoveries into one `Source` (ADR-0005 §4).

## 6. Scheduling & automation
The ExperimentScout is one product core behind three thin surfaces (pipeline + CLI + MCP, ADR-0001). Scheduling =
**cron-like + event triggers**, config-driven via `sources.yaml` binding `family → adapter + query + schedule`.

```yaml
# sources.yaml (registry + schedule)
families:
  - id: ttt-arxiv
    adapter: ArxivAdapter
    query: "test-time training OR test-time compute ..."
    schedule: "cron: 0 6 * * *"        # scheduled scouting (brief §4)
    rate_limit: "1 req / 3 s"
  - id: caw05-signals
    adapter: CAW05ImportAdapter
    trigger: "event: bundle-arrival"    # file drop / pull from CAW-05 (separate product)
```

| Trigger | Fires on | Runs |
|---|---|---|
| Scheduled (cron-like) | timer | ingestion S1–S5 for due families |
| Event | CAW-05 bundle arrival (file drop / pull); CLI/MCP invoke | targeted ingestion / a single experiment |
| Manual | operator CLI/MCP command | any stage, on demand |

Discipline:
- The scheduler honors each adapter's `rate_limit` and reacts to **typed failures** (retry transient; halt + report
  terminal) — ADR-0005's six adapter obligations.
- Experiment runs (`ExperimentRunnerAdapter`, ADR-0003) are scheduled/triggered the same way and **MUST create a
  ledger entry on every launch** — including crashes (→ `invalid`/`aborted`) — so failures can't be silently dropped.
- `TODO(open-question: scheduler host — long-running daemon vs OS cron invoking a CLI entrypoint?)` (ADR-0007).
- `TODO(open-question: concurrency — can two scheduled runs touch one thread; do we need per-thread file locks?)`.

## 7. Human-in-the-loop gate
Automation is **proposal only** (brief §12; ADR-0007 §6). The scout may:
- create `Hypothesis` at `status=hypothesis`, `confidence=very-low`;
- propose `StatusEvent`s from ledger verdicts;
- stage `ExportBundle`s in `queue/pending/`.

But **promotion to `supported` and emission of any `supported` export require Jimmy's review** (move to
`queue/approved/`). No auto-promotion; no auto-conflation of a CAW-05 hint with a verdict. The gate adds latency
before strategic outputs leave the product — accepted cost. Export receipts land in `store/exports/` regardless of
ok/rejected (a rejected export stays exportable — ADR-0008 §6).

## 8. Retention
Nothing is deleted; large failure artifacts are kept by path.
- `TODO(open-question: retention/GC for large failure artifacts — keep forever by path, or summarize + prune after N days keeping metrics?)` (ADR-0003, ADR-0007).

## Open Questions
- Index backend; scheduler host; concurrency/locking; artifact GC (above; tracked in
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).
- **Revisit when:** the file store's query cost becomes the bottleneck (promote index to primary), or a second
  operator joins (locking/merge policy) — ADR-0007.

## Implications for runbooks
- **RB (file store + resolver):** typed layout above; append-only writer; `supersede` + "current" resolvers.
- **RB (derived index):** rebuildable index + negative-results view + per-hypothesis run history.
- **RB (scheduler):** cron + event triggers, `FetchCursor` persistence, rate-limit + typed-failure handling.
- **RB (runner discipline):** force a ledger entry on every experiment launch.
- **RB (review queue):** `queue/pending` → `queue/approved` gate before any `supported` export; receipts to `store/exports/`.

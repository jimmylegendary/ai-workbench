# ADR-0007: Storage (md/JSON + experiment/result ledger) & ExperimentScout scheduling

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§4 surfaces, §7 data, §12 reviewer guardrail)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger.md) (the ledger entry model this ADR persists)
  - [./ADR-0001-product-surface-and-scout.md](./ADR-0001-product-surface-and-scout.md) (the ExperimentScout pipeline + CLI/MCP this schedules)
  - [./ADR-0002-hypothesis-representation.md](./ADR-0002-hypothesis-representation.md), [./ADR-0003-experiment-ledger.md](./ADR-0003-experiment-ledger.md)
  - [./ADR-0005-source-and-claim-ingestion.md](./ADR-0005-source-and-claim-ingestion.md) (`FetchCursor` watermarks this persists), [./ADR-0006-implication-mapping.md](./ADR-0006-implication-mapping.md), [./ADR-0008-export-boundaries.md](./ADR-0008-export-boundaries.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

Every other CAW-06 ADR produces records — `Source`/`CandidateClaim` (ADR-0005), `Hypothesis`/`Claim`/`Evidence`
(ADR-0002), ledger entries (ADR-0003), `ImplicationMap` (ADR-0006), writeback artifacts (ADR-0004), export
receipts (ADR-0008). This ADR fixes **where they live** and **how the ExperimentScout runs them on a schedule**.
Brief §7: CAW-06's OWN store, markdown/JSON + a small experiment/result ledger, large artifacts by path; every
item carries provenance, uncertainty/status, and `boundary`. Brief §4: one product core behind the pipeline +
CLI + MCP; no shared substrate.

Forces:
- **Family consistency (brief §7):** markdown/JSON + ledger, diffable, git-friendly — not a database server.
- **Auditability + append-only:** the ledger (ADR-0003) and the hypothesis `status_log` (ADR-0002) are
  append-only; corrections supersede, never overwrite. Failures must be durable and discoverable (brief §5).
- **Idempotent automation:** discovery adapters (ADR-0005) resume from a persisted `FetchCursor`; re-runs must not
  duplicate. The scout is **proposal/hypothesis generation; Jimmy is the reviewer for strategic decisions**
  (brief §12) — automation must never auto-promote a status or auto-emit a `supported` export.
- **Independence (brief §1, §8):** no shared runtime/store with CAW-01/02/05; the scheduler is CAW-06's own.

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Store backend | **Files on disk: markdown/JSON records + artifacts-by-path, git-trackable** | matches brief §7 + family; diffable; zero infra; provenance travels in front-matter | no rich query without an index | **chosen** |
| | Embedded DB (SQLite) as source of truth | queryable | binary store; loses diffability; drifts from family | rejected (see index below) |
| Query layer | **Optional derived index (SQLite/JSON) rebuilt from files; files remain source of truth** | fast negative-results/thread views; disposable | must stay rebuildable | **chosen** |
| Mutation model | **Append-only; supersede via `lineage`/`status_log`, never edit-in-place** | full audit trail; failures survive | needs a "current" resolver view | **chosen** |
| Scheduling | **Cron-like scheduler + event triggers (CAW-05 bundle arrival, CLI/MCP invoke); per-adapter schedule in `sources.yaml`** | scheduled scouting (brief §4) + on-demand; rate-limit aware | a long-running component to operate | **chosen** |
| | Manual-only runs | simple | defeats "scheduled/triggered ExperimentScout" (brief §4) | rejected |
| Human gate | **Pipeline proposes; review queue holds status promotions + `supported` exports for Jimmy** | enforces brief §12 | adds a review step | **chosen** |

## Decision

1. **File-based store, CAW-06's OWN (brief §7).** One markdown/JSON record per entity under a typed layout, e.g.
   `store/sources/`, `store/claims/`, `store/hypotheses/`, `store/ledger/EXP-XXXX/`, `store/implications/`,
   `store/writeback/`, `store/exports/` (receipts). Large artifacts (configs, metrics, logs, checkpoints, plots)
   live under `artifacts/EXP-XXXX/` and are referenced **by path**, never inlined. Every record carries
   `provenance`, `status`/`uncertainty`, and `boundary` in front-matter (brief §7, §12).
2. **Append-only with supersede.** Ledger entries (ADR-0003) and hypothesis `status_log` (ADR-0002) are
   append-only; a correction is a new record with `lineage.supersedes`/a new `StatusEvent`, never an in-place edit.
   A **"current" resolver** computes latest-state views; nothing is deleted (failures retained, brief §5).
3. **Optional derived index, files remain source of truth.** A disposable index (SQLite or a JSON index file) is
   rebuilt from the file store to power the negative-results view, per-hypothesis run history, and thread queries
   (ADR-0003 surfacing). Deleting the index loses nothing; the file store is canonical.
4. **`FetchCursor` persistence.** The scheduler persists each adapter's opaque `FetchCursor` (ADR-0005) — arXiv
   watermark/resumptionToken, Semantic Scholar page, last CAW-05 `bundle_id` — so scheduled re-runs are
   incremental and idempotent (no downstream duplicates).
5. **Scheduling = cron-like + event triggers, config-driven.** `sources.yaml` binds `family → adapter + query +
   schedule`. The ExperimentScout runs the ingestion → extraction stages on schedule; **event triggers** fire on
   CAW-05 bundle arrival (file drop / pull) and on CLI/MCP invocation. The scheduler respects each adapter's
   `rate_limit` and reacts to typed failures (retry transient, halt+report terminal). Experiment runs
   (`ExperimentRunnerAdapter`, ADR-0003) are scheduled/triggered the same way and MUST create a ledger entry on
   every launch (including crashes → `invalid`/`aborted`) so failures cannot be silently dropped.
6. **Human-in-the-loop gate (brief §12).** Automation is **proposal only**. The scout may create hypotheses at
   `status=hypothesis`, `confidence=very-low`, propose `StatusEvent`s from ledger verdicts, and stage export
   bundles — but **status promotion to `supported` and emission of `supported` exports require Jimmy's review**
   via a review queue. No auto-promotion, no auto-conflation of a CAW-05 hint with a verdict.

## Consequences

- **Easy:** diff/review every record in git; resume the scout cleanly after interruption; rebuild the query index
  from scratch; keep failures durable and discoverable; operate with zero database infrastructure.
- **Hard / accepted cost:** rich cross-record queries need the derived index (a rebuildable component to maintain);
  append-only growth needs an artifact retention/GC policy (open question); a scheduler is a live component to run
  and monitor; the review gate adds latency before strategic outputs leave the product.
- **Follow-on:** runbooks implement the file store + resolver, the derived index + negative-results view, the
  cron+trigger scheduler with `FetchCursor` persistence, and the review queue. ADR-0008 stores export receipts in
  `store/exports/`; ADR-0005's `sources.yaml` doubles as the schedule registry.

## Open questions / revisit triggers

- `TODO(open-question: retention/GC for large failure artifacts — keep forever by path, or summarize + prune after N days keeping metrics? — mirrors ADR-0003)`.
- `TODO(open-question: index backend — SQLite vs a flat JSON index; does query volume at v1 justify SQLite?)`.
- `TODO(open-question: scheduler host — long-running daemon vs OS cron invoking a CLI entrypoint; which fits a single-operator product?)`.
- `TODO(open-question: should the ExperimentRunnerAdapter be forced to create a ledger entry on every launch even for out-of-band manual runs, to de-bias silent drops? — ADR-0003 OQ)`.
- `TODO(open-question: concurrency — can two scheduled runs touch the same thread; do we need per-thread file locks?)`.
- **Revisit when:** the file store's query cost becomes the bottleneck (promote the index to primary), or a second
  operator joins (locking/merge policy).

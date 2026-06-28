# Scout Service — the ExperimentScout pipeline (discover → … → export)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface.md](./api-surface.md)
  - [./experiment-runner-service.md](./experiment-runner-service.md)
  - [./persistence.md](./persistence.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describe the **ExperimentScout pipeline service** — the one resumable Run that advances research threads through the
six stages and drives them out to exports across explicit boundaries (ADR-0001). It defines the Run lifecycle,
stage contracts, scheduling/triggers, and the human review gate. It does NOT define the typed ops it calls
([api-surface.md](./api-surface.md)), the runner ([experiment-runner-service.md](./experiment-runner-service.md)),
or storage ([persistence.md](./persistence.md)).

## The unit and the Run
- **The thread is the durable unit** — `source → claim → hypothesis → small experiment → result (incl. failure) →
  implication`, with provenance and explicit uncertainty (brief §2). A **Run** is a resumable pass that advances
  threads; the Run is not itself durable beyond its receipt.
- A Run executes six stages and persists a per-stage checkpoint. A crash resumes at the last completed stage;
  re-running a completed thread-stage is a **no-op** (idempotent, ADR-0001).

## Stages
| # | Stage | Op(s) driven | Output | Anti-overclaim rule |
|---|---|---|---|---|
| S1 | Discover | `ingest.discover`, `ingest.import_caw05` | `Source` records + `FetchCursor` | only ToS-safe public sources (brief §12) |
| S2 | Import (CAW-05) | `ingest.import_caw05` | `Source` (boundary=import:caw-05) | never conflate a radar hint with a verdict |
| S3 | Canonicalize + Dedup | (ingestion internals) | canonical `Source`, dedup by content_hash | idempotent; no duplicate threads |
| S4 | Extract claims | `ingest.extract_claims` | `CandidateClaim` (generated) | candidate ≠ settled `Claim` |
| S5 | Persist / hypothesize | `hyp.create` | `Hypothesis` (status=hypothesis) | defaults very-low confidence |
| S6 | Plan + log experiment | `exp.plan`, `exp.run`, `exp.log_result` | ledger entry + Evidence | entry on every launch; ≥3 seeds |
| S7 | Map implications | `impl.map`, `wb.estimate` | ImplicationMap + `wbtraffic.v0` | summary generated, not evidence |
| S8 | Export (gated) | `export.stage`, `export.commit` | bundles to CAW-01/CAW-02 | proposal-only; human confirms `supported` |

> S1–S5 are the **five ingestion stages** of ADR-0005 (Discover → Import → Canonicalize+Dedup → Extract → Persist).
> S6–S8 advance the thread to experiment, implication, and export. The Run wraps all of them as one resumable pass.

```
Run(thread_or_family):
  for stage in [S1..S8]:
    if checkpoint(thread, stage) == "done": continue          # idempotent resume
    acquire single-flight lock (per ADR-0007 per-thread lock — OQ)
    result = drive op(stage)
    if result.proposed_events: enqueue to review queue         # never auto-apply
    write checkpoint(thread, stage, status)
    heartbeat(run_receipt)                                     # dead-man's-switch sink (OQ)
```

## Scheduling & triggers (ADR-0007)
- A `SchedulerAdapter` (cron v1; stubs documented) fires periodic Runs per `sources.yaml` (`family → adapter +
  query + schedule + rate_limit`). The scheduler **only fires** — catch-up, overlap-guard (single-flight), and
  heartbeat live in the Run wrapper so the pipeline is correct on plain cron.
- **Triggers:** a CAW-05 bundle arrival (file drop / pull) or a CLI/MCP `sched.fire(thread, now=true)` opens or
  advances a single thread immediately. Lean default: a CAW-05 import enqueues and runs on the next pass unless
  `--now` (ADR-0001 OQ).
- Each adapter's `FetchCursor` is persisted so scheduled re-runs are incremental and idempotent (no duplicates).

```yaml
# sources.yaml (schedule registry, also drives ingestion adapters)
families:
  - family: arxiv
    adapter: ArxivSourceAdapter
    query: "test-time training OR test-time compute"
    schedule: "0 6 * * 1"        # weekly; scheduler only fires
    rate_limit: { rps: 1 }
  - family: caw05-signal
    adapter: Caw05ImportAdapter   # CAW-05 is a SEPARATE product; file/API boundary, no shared store
    trigger: on-bundle-arrival
```

## Ports & adapters (build v1, stub the rest — brief §9)
| Port | v1 | Stubs (documented) | Health |
|---|---|---|---|
| `SourceAdapter` | arXiv / Semantic Scholar + `Caw05ImportAdapter` | other feeds | `deferred` |
| `ExperimentRunnerAdapter` | minimal local toy runner | external compute / HW | `deferred` |
| `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, … | `deferred` |

A config-driven registry binds families; every stub implements the Protocol and reports `HealthStatus="deferred"`.

## Review gate (brief §12 — Jimmy is the reviewer)
Automatic scouting is **proposal/hypothesis generation**. The pipeline may create hypotheses at
`status=hypothesis`, propose `StatusEvent`s from ledger verdicts, and **stage** export bundles — but a promotion to
`supported` and the emission of any `supported` export wait in the review queue for human confirmation. No stage
auto-promotes a hypothesis, auto-exports a claim to CAW-02, or auto-commits a writeback schema to CAW-01.

## Failure handling
- Transient adapter errors (rate-limit, network) → retry with backoff; terminal errors → halt the stage, write a
  failure checkpoint, report, and leave the thread resumable.
- An experiment crash still yields a ledger entry (`invalid`/`aborted`) — failures are never silently dropped
  (ADR-0003); negative results are surfaced by `exp.negative_results`.
- A failed export is logged; the finding stays exportable (ADR-0004 §4).

## The CAW-01 bridge as a pipeline output (export, not shared store)
S7 produces a `wbtraffic.v0` artifact (analytic L0 estimate, ADR-0004); S8's `Caw01WritebackAdapter` lowers it
onto CAW-01's existing L0 objects **plus an open-question list** and ships a self-describing bundle over a file
boundary. CAW-01 receives questions, not assertions about its IR; CAW-01 object names are re-verified per export.

## Open Questions
- TODO(open-question: synchronous Run vs resumable stage-jobs with a handle; ADR-0001.)
- TODO(open-question: heartbeat/dead-man's-switch sink given no shared substrate — local "no receipt in N days" vs external; ADR-0001/0007.)
- TODO(open-question: per-thread file locks for concurrent scheduled runs; ADR-0007.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: Run wrapper + thread lifecycle (checkpoint, single-flight, heartbeat, resume).
- RB: scheduler (cron fire) + triggers + `FetchCursor` persistence.
- RB: adapter registry + documented stubs (`HealthStatus="deferred"`).
- RB: review queue wiring so terminal proposed_events require human confirm.

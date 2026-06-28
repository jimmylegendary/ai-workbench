# RB-041: Build the scheduled/triggered ExperimentScout Run (idempotent + resumable)

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-040 (ExportAdapter seam), RB-1XX (ingestion S1–S5 + hypothesis), RB-2XX (experiment ledger), RB-3XX (implication map + wbtraffic.v0), RB-0XX (store layout + ports)]
- Implements design: [../../06-interfaces/scout-pipeline.md](../../06-interfaces/scout-pipeline.md), [../../01-decisions/ADR-0001-product-surface-and-scout.md](../../01-decisions/ADR-0001-product-surface-and-scout.md), [../../01-decisions/ADR-0007-storage-and-scheduling.md](../../01-decisions/ADR-0007-storage-and-scheduling.md), [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger.md)
- Produces: the `Run` wrapper (lock + per-stage checkpoints + FetchCursor advance + receipt/heartbeat), the `SchedulerAdapter` (cron v1), CAW-05-import + CLI/MCP triggers, the typed transient/terminal failure handling, and the in-Run review-gate staging.

## Objective
Wire the **one pipeline core** into a **scheduled and triggered, resumable** `ExperimentScout Run` that advances research threads through the six scout stages (discover → extract → hypothesize → plan-repro → log-result → map-implications) feeding off the five ingestion stages (S1–S5). "Done" means: a `Run` acquires a single-flight lock, checkpoints each thread-stage, advances per-adapter `FetchCursor` watermarks, **always writes a ledger entry before doing experiment work** (so a crash never drops a result), classifies failures as first-class, **proposes but never adjudicates** (no auto-promotion to `supported`, no auto-emit of a `supported` export — the evidence cap is honored), and writes a Run receipt/heartbeat. Re-running an already-`done` thread-stage is a no-op.

## Preconditions
- [ ] RB-040 merged: the ExportAdapter seam exists so a Run can **stage** (not emit) export bundles.
- [ ] Ingestion (S1–S5) + hypothesis (P1), experiment ledger (P2), implication map + `wbtraffic.v0` (P3) are runnable on one thread.
- [ ] `store/{sources,claims,hypotheses,ledger,implications,exports,review-queue}` exist and are append-only per ADR-0007.
- [ ] `sources.yaml` with per-adapter schedules + at least one `SourceAdapter` v1 and the `ExperimentRunnerAdapter` v1 are wired.

## Steps

1. **Implement the `Run` wrapper (lock, checkpoint, cursor, receipt).**
   - Do: Build `Run.execute(scope)` that `acquire_lock()` (single-flight), iterates ingestion adapters with their `FetchCursor`, advances `ready(threads)` from `last_stage+1`, and on completion writes a Run receipt (start, stages completed, threads touched, end/verdict) and `release_lock()`. Keep all catch-up/overlap/cursor logic in the wrapper — the scheduler only fires.
   - Verify: A Run on one thread produces a receipt; an overlapping invocation while the lock is held is skipped (or catches up), never concurrent.

2. **Make every thread-stage idempotent and checkpointed.**
   - Do: Record each thread's last completed stage; re-running a `done` thread-stage is a no-op. Every stage appends; corrections supersede via `lineage`/`status_log` — nothing is edited in place.
   - Verify: Running the same Run twice yields no duplicate records; a mid-Run crash (kill between stages) resumes at the next stage with a consistent store.

3. **Advance ingestion via `FetchCursor` watermarks.**
   - Do: Persist an opaque per-adapter `FetchCursor` (arXiv resumptionToken, Semantic Scholar page, last CAW-05 `bundle_id`) so scheduled re-runs are incremental; do not advance the cursor past a gap caused by a transient failure.
   - Verify: A second scheduled Run imports only new items (no re-import dupes); a simulated rate-limit leaves the cursor at the gap.

4. **Implement the `SchedulerAdapter` (cron v1) and the triggers.**
   - Do: `SchedulerAdapter` reads per-adapter schedules from `sources.yaml` and fires the Run wrapper (OS cron invoking the CLI entrypoint is acceptable — correctness lives in the wrapper). Wire two more triggers: a **CAW-05 bundle arrival** (file drop / pull from a separate product) that enqueues/advances one thread (optional `--now`), and **CLI/MCP invoke** (`run [--thread ID] [--now]`).
   - Verify: A cron fire runs a full ingestion + advances ready threads; a dropped CAW-05 bundle opens/advances exactly one thread; `--thread` scopes to one thread.

5. **Guarantee "ledger entry before work" + failure classification.**
   - Do: On `run-experiment`, write the ledger entry first, then run. On crash/abort/timeout, finalize verdict `invalid`/`aborted`; missing config+seed+env is blocked by the **reproducibility gate** and recorded `invalid` with reason; an indecisive decision rule yields `inconclusive` and status stays/returns toward `hypothesis`. Implement the typed transient (retry+backoff, respect `rate_limit`) vs terminal (halt that adapter, surface in `status`) taxonomy.
   - Verify: Killing the runner mid-experiment leaves a ledger entry with `aborted`/`invalid` (never a silent drop); a deliberately-failing run is retained, classified as a negative result, and surfaced by default; a terminal adapter error halts only that adapter, others continue.

6. **Enforce the in-Run review gate (propose-only; evidence cap).**
   - Do: A Run may create hypotheses at the floor state, propose `StatusEvent`s from ledger verdicts into `store/review-queue/`, build implication maps (summary marked `generated`), and **stage** export bundles. It may **never** apply a promotion to `supported` or emit a `supported`/promoting export. Generated evidence can never promote status.
   - Verify: After a Run, no hypothesis is at `supported` without a human `confirm`; any export produced by the Run is `pending`/staged, not emitted; the review queue is non-empty with well-formed proposals.

7. **End-to-end Milestone-1 pass on one thread.**
   - Do: Drive one checkable TTT claim through the whole Run: 1 Source → 1 Claim → 1 Hypothesis (`status=hypothesis`) → pre-registered rule → 1 append-only ledger entry (with config+seed+env) → ImplicationMap → `wbtraffic.v0` analytic-L0 bundle **staged** for CAW-01.
   - Verify: The M1 checklist boxes (milestones-and-phases.md §Milestone 1) are all checkable from store state; a refuting/erroring toy run still satisfies M1 (the logged negative result + estimate-with-open-questions is the deliverable).

## Acceptance criteria
- [ ] `Run` takes a single-flight lock; overlapping scheduled fires are skipped/caught up, never concurrent.
- [ ] Every thread-stage is checkpointed and idempotent; a mid-Run crash resumes cleanly with no duplicates.
- [ ] Per-adapter `FetchCursor` makes scheduled re-runs incremental; no re-import dupes.
- [ ] An experiment **always** writes a ledger entry before work; crash/abort → `invalid`/`aborted`; reproducibility gate blocks runs missing config+seed+env.
- [ ] Negative results retained, classified, and surfaced by default.
- [ ] The Run proposes only: no auto-promotion to `supported`, no auto-emit of a promoting export; generated evidence never promotes status.
- [ ] A Run writes a receipt/heartbeat; "no receipt in N days" is detectable.
- [ ] Milestone 1 passes end-to-end on one thread; tree green.

## Rollback / safety
- The store is append-only; an interrupted Run leaves it consistent (partial appends are valid, deduped by cursor + no-op stage). To roll back, drop the incomplete Run receipt and re-run — checkpoints resume safely.
- Never advance a `FetchCursor` past a transient-failure gap; never edit records in place (supersede via lineage).
- The Run is a proposer: if anything reaches `supported` or emits a promoting export without a human `confirm`, treat it as a defect and revert.

## Hand-off
- RB-042 (CLI/MCP) wraps this Run as `run`/`status` ops and exposes the review queue (`review`/`confirm`/`reject`); the MCP surface must not register `confirm`.
- The export seam (RB-040) is invoked only in **stage** mode by the Run; committing remains human-gated.

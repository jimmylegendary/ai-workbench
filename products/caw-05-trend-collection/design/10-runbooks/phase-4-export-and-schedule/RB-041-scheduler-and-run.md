# RB-041: Wire the cron scheduler and the end-to-end weekly Run (incremental + dedup + resume)

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-040 (ExportAdapter + bundles), RB-031 (ledger), RB-032 (synthesis/digest), RB-011 (SourceAdapters + cursors), RB-002 (FILES-AS-TRUTH store + SQLite index), RB-003 (SchedulerAdapter port stub)]
- Implements design: [../../06-interfaces/scheduled-pipeline.md](../../06-interfaces/scheduled-pipeline.md), [../../01-decisions/ADR-0006-storage-and-scheduling.md](../../01-decisions/ADR-0006-storage-and-scheduling.md), [../../01-decisions/ADR-0001-product-surface-and-outputs.md](../../01-decisions/ADR-0001-product-surface-and-outputs.md), [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md)
- Produces: the `Run` wrapper (lifecycle, single-flight lock, stage checkpoints/resume, run-receipt + dead-man check, `--since` backfill); incremental cursor store + multi-layer `seen` index; `CronSchedulerAdapter` (crontab line); the **Milestone 1** end-to-end weekly Run.

## Objective
One command or cron trigger runs the whole pipeline core — `collect → dedup → classify → synthesize → export` —
as a single idempotent, resumable **Run** over the narrow watch list, producing the weekly digest and emitting at
least **one novelty-threat to CAW-03**. "Done" = M1: the radar runs incrementally (cursors only advance on full
success), dedups across runs, resumes from a checkpoint after a mid-stage crash, refuses a second concurrent
trigger, and writes a `run-receipt` so a missed week raises a "radar went dark" alert rather than silently
skipping (brief §1: must not silently skip a week).

## Preconditions
- [ ] RB-002 provides the FILES-AS-TRUTH layout (`interests.yaml`, `findings/*.json`, `ledger/*.jsonl`, `state/*.cursor`, `runs/*.receipt.json`) + the SQLite index rebuildable from files.
- [ ] RB-011 SourceAdapters fetch real watch-list data and advertise a cursor kind; legal/ToS-safe only.
- [ ] RB-021 classify stage runs the LF→LLM→human cascade with the recall-biased selective-review gate (abstain→human).
- [ ] RB-032 FormatRenderer ships the digest format.
- [ ] RB-040 ExportAdapter is registered with idempotency keys.
- [ ] RB-003 exposes the `SchedulerAdapter` port; tree is green.

## Steps

### 1. Implement the Run lifecycle state machine
- **Do:** Implement `Run` as the unit of work with states `scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done`, checkpointing after each completed stage (scheduled-pipeline.md "Run lifecycle"). Each stage must be idempotent and keyed so re-execution can never double-fetch/classify/export. On `done`, write the `run-receipt`.
- **Verify:** A dry run with fake adapters walks every state and writes a `done` receipt; a forced crash mid-`classifying` leaves a checkpoint and the next trigger resumes at `classifying`, not `collecting`.

### 2. Implement the single-flight lock
- **Do:** Acquire `flock` on `run.lock` at `acquiring-lock`. A second concurrent trigger is **refused** (logged, no error, no stacking).
- **Verify:** Negative test — launching a second Run while one holds the lock returns the "lock held" path (exit code 2 on CLI), and does not stack or corrupt state.

### 3. Implement incremental cursors (advance-on-success)
- **Do:** Persist `state/<source>.cursor` per adapter; advance a cursor **only on a fully successful pass** for that source (scheduled-pipeline.md "Incremental collection"). A partial/failed source keeps its old cursor so the next run re-attempts that window. Use the per-family cursor mechanism (arXiv/S2 OAI-PMH `from=` + `resumptionToken`, never set `until`; RSS `ETag`/`Last-Modified`/`guid`; GitHub `since=`+`pushed_at`).
- **Verify:** Negative test — re-running the same window fetches `new=0`. A source forced to error keeps its old cursor; other sources still advance; the receipt records the failure.

### 4. Implement multi-layer dedup in CORE (recall-safe)
- **Do:** Build the content-addressed `seen` index in the core (not in adapters), cheapest layer first: (1) canonical id (DOI/arXiv id/URL-normalized/repo+sha), (2) SHA-256 of normalized title+abstract/body. SimHash near-dup is layer-3 **behind a flag, OFF by default** (a false-merge would drop a finding — recall-safe default = **keep both** on doubt). Layer-4 = export idempotency key (already in RB-040).
- **Verify:** Two sources delivering the same DOI collapse to one finding via layers 1/2; an ambiguous near-dup with SimHash off keeps both. Deleting `index.sqlite` and replaying files reproduces the index, ledger projection, and `seen` set.

### 5. Implement catch-up via state (not clock)
- **Do:** No clock-fire replay. A missed week self-heals because the next Run's window spans more time (cursor advanced only on last success). Add `caw05 run --since <date>` (backfill) that ignores cursors for a one-off historical sweep — used to seed the narrow watch list (brief §6).
- **Verify:** Skipping a scheduled fire then running once collects the full gap window; `--since` re-sweeps history ignoring cursors and dedups against `seen`.

### 6. Implement the run-receipt + dead-man's-switch
- **Do:** Every Run writes `runs/<run_id>.receipt.json` with `window`, per-source `{fetched,new,dup}`, `classified_counts` (novelty-threat/support/adjacent/noise), `exports[]`, `status`. A missing receipt past `cadence + grace` is an **alert** ("radar went dark"), never a silent no-op. `TODO(open-question: heartbeat sink + alert channel given no shared substrate; grace window length.)`
- **Verify:** A completed Run writes a well-formed receipt; simulating no-receipt-past-grace surfaces the dead-man alert state (consumed by `caw05 status` in RB-042).

### 7. Implement the failure/retry matrix
- **Do:** Cover scheduled-pipeline.md "Failure / retry / overlap": crash → resume from checkpoint; re-run of a `done` window → no-op; export target unreachable → bundle queued, idempotency key dedups on retry; transient HTTP/rate-limit → per-adapter bounded retry/backoff `TODO(open-question: retry budget)`. Retries are safe by construction (every mutating stage is keyed).
- **Verify:** A retry does not double-export (asserts via RB-040 idempotency key); a `done`-window re-run yields new=0/dup=all.

### 8. Implement the CronSchedulerAdapter
- **Do:** Implement `CronSchedulerAdapter` behind the `SchedulerAdapter` port; it installs ONE crontab line calling `caw05 run --window weekly`, appending to `$CAW05_HOME/runs/cron.log`. The scheduler owns NO domain logic — every property cron lacks (catch-up, overlap guard, observability) lives in the Run wrapper. systemd-timer (`OnCalendar`+`Persistent=true`) and cloud/Actions/Airflow are documented stubs. `TODO(open-question: exact weekly cadence/day/time + timezone.)`
- **Verify:** Installing the adapter writes exactly one crontab line; uninstalling removes it; the line invokes the CLI Run. The stub schedulers are registered and documented but disabled.

### 9. Cut Milestone 1 (end-to-end)
- **Do:** Run one real weekly Run over the watch-list sources: collect → dedup → classify (with abstain→human gate) → synthesize the digest → export. Ensure ≥1 finding classified `novelty-threat` is confirmed and emitted as a signed CAW-03 `caw05-signal` bundle via RB-040. Confirm the whole Run is resumable from files after interruption.
- **Verify:** The digest covers the narrow watch list; `runs/<id>.receipt.json` shows ≥1 novelty-threat and a CAW-03 entry in `exports[]`; a mid-run interruption + re-trigger completes without re-fetching/re-exporting (M1 exit gate, milestones-and-phases.md P4).

## Acceptance criteria
- [ ] One command/cron Run executes `collect→dedup→classify→synthesize→export` end-to-end over real watch-list sources.
- [ ] Cursors advance only on full success; re-running a window yields new=0; a failed source re-attempts next run.
- [ ] Multi-layer dedup runs in CORE; SimHash off by default (recall-safe keep-both).
- [ ] Single-flight lock refuses a second concurrent trigger (not stacked).
- [ ] A crashed Run resumes from its last checkpoint; retries never double-fetch/classify/export.
- [ ] Every Run writes a `run-receipt`; a missing receipt past `cadence+grace` raises the dead-man alert.
- [ ] `CronSchedulerAdapter` installs one crontab line; systemd/cloud are documented stubs.
- [ ] M1 holds: weekly digest + ≥1 novelty-threat exported to CAW-03; the Run is resumable from files.
- [ ] All scheduled-pipeline.md negative tests pass; tree is green.

## Rollback / safety
- Removing the crontab line (uninstall the adapter) stops all scheduled fires; manual `caw05 run` still works.
- Because cursors advance only on success and the `seen` index is content-addressed, an aborted/rolled-back Run never loses data and never double-processes — re-trigger is always safe.
- `index.sqlite` is a derived cache: delete and rebuild from files if corrupted (verified in step 4).
- Classification keeps abstain→human items queued, never auto-decided; never lower the recall floor or skip the review gate to force a green Run.

## Hand-off
- RB-042 (CLI/MCP) wraps this Run as the `run`/`backfill` mutating ops and reads the receipt for `status` (dead-man state).
- M2 (RB-05x) hardens CAW-03 export to require a verified, provenance-complete `LedgerLink`; the Run already records `verification` and the per-source receipt counts it needs.
- P7 hardening (retry budgets, circuit breakers, embedding lane) builds on this Run wrapper without changing the lifecycle.

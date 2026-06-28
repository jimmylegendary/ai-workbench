# RB-021: Implement the ExperimentRunner port and the v1 minimal local toy runner with reproducibility capture

- Status: ready
- Phase: phase-2-experiment
- Depends on: [RB-020 (append-only ledger + repro gate + verdict)]
- Implements design:
  - [../../07-backend-api/experiment-runner-service.md](../../07-backend-api/experiment-runner-service.md)
  - [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger.md) (§Decision 6: entry-on-launch)
  - [../../05-ttt-research-core/experiment-ledger.md](../../05-ttt-research-core/experiment-ledger.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P2 exit; M1 box 5)
- Produces:
  - the `ExperimentRunnerAdapter` Protocol (port) + documented stubs (`ExternalComputeRunner`, `HardwareRunner`)
  - `LocalToyRunner` v1: tiny PyTorch model under tight budget
  - reproducibility capture: freeze config + seeds + env into a hashable `RunSpec`
  - the entry-on-launch invariant wiring (every launch → one ledger entry, crashes included)
  - the `exp.run(...)` flow that gates the verdict and logs results append-only
  - an optional `writeback_observed` collector for one variant

## Objective
A builder can run `exp.run(plan_id, runner="LocalToyRunner")` and have it: freeze the plan's config + `>=3` seeds + environment into a hashable `RunSpec`; create a ledger entry **before any compute starts** (so a crash still leaves an `aborted`/`invalid` entry — closing the off-ledger-run leak); execute a tiny PyTorch toy model plus its baseline under a hard budget; run the RB-020 reproducibility gate (verdict forced to `invalid` until green); evaluate the **pre-registered** decision rule; and append per-seed results + verdict to the ledger. "Done" = one `store/ledger/EXP-XXXX/` entry is produced by a real toy launch, AND a deliberately-failing launch also produces a classified, surfaced negative entry (P2 exit gate). v1 is **toy scale only** — no real TTT at scale (brief §11).

## Preconditions
- [ ] RB-020 complete: ledger writer, `repro_gate`, `decide()`, `failure_mode` vocab, `current_verdict`, and the entry-creation API are available.
- [ ] An `ExpPlan` exists for a checkable TTT claim (from P1), carrying `hypothesis_id`, `claim_ref`, and a `prediction` with a mechanically-evaluable `decision_rule`.
- [ ] PyTorch (CPU-only acceptable) is installable in the project environment.
- [ ] Repo is a git working tree (runner + product revisions are pinnable).
- [ ] Tree green at start.

## Steps

### 1. Define the ExperimentRunnerAdapter port
- **Do:** Implement the Protocol from [experiment-runner-service.md](../../07-backend-api/experiment-runner-service.md) §The port: `name`, `health() -> HealthStatus`, `prepare(plan) -> RunSpec`, `launch(spec) -> RunHandle`, `poll(handle) -> RunState ∈ {queued,running,done,crashed}`, `collect(handle) -> RawResults`. Document the contract that `launch()` MUST create a ledger entry immediately, before work starts.
- **Verify:** The Protocol compiles; a conformance test asserts any adapter exposes all six members. `health()` returns a typed status.

### 2. Documented stubs for deferred runners
- **Do:** Add `ExternalComputeRunner` and `HardwareRunner` implementing the Protocol but returning `HealthStatus="deferred"` and raising a clear `NotImplemented`-style guard from `prepare/launch`. Register them in the runner registry alongside `LocalToyRunner`.
- **Verify:** Registry lists three runners; the two stubs report `deferred` and refuse to launch with an explanatory error (not a silent no-op).

### 3. `prepare()` — freeze config + seeds + env into a hashable RunSpec
- **Do:** Implement `prepare(plan)` building the `RunSpec` from [experiment-runner-service.md](../../07-backend-api/experiment-runner-service.md): write the **full** config to `artifacts/EXP-XXXX/config.yaml` (no hidden CLI args), set `seeds` to `>=3` distinct values, pin `code_rev = {runner: <git-sha>, product: <git-sha>}`, capture `env` (python version, pinned lib versions, container digest if available — mark `TODO(open-question: env pinning mechanism)` where undecided, never invent), specify `data` (gen-seed for synthetic toy data + split + hash), and record `budget` (`max_wallclock_s`, `max_mem_gb`, `updates_max`). Compute `spec_hash = sha256` over the frozen block.
- **Verify:** Re-running `prepare` on the same plan yields the identical `spec_hash`; changing any config byte changes the hash. `config.yaml` exists and is hashed; `len(seeds) >= 3`.

### 4. Entry-on-launch invariant (closes the off-ledger-run leak)
- **Do:** Implement `launch(spec)` so its FIRST action is to call the RB-020 entry-creation API, writing `EXP-XXXX` at `status=running` (after `planned`) **before** any model code runs. Wrap the compute in a guard so that a crash/kill mid-run still finalizes the entry as `aborted` (operational) and `verdict=invalid` with a `failure_mode` (`setup-error`/`oom`/`budget-exceeded`).
- **Verify:** Inject a forced exception immediately after `launch()` creates the entry but before compute: a ledger entry still exists, `status=aborted`, `verdict=invalid`, `failure_mode` set. A kill -9 simulation leaves a discoverable entry (not zero records).

### 5. v1 LocalToyRunner — tiny PyTorch model + baseline
- **Do:** Implement `LocalToyRunner` running a tiny PyTorch model on synthetic/toy data under the `RunSpec` budget, for each seed, for BOTH the treatment (the TTT variant under test) and the **baseline** (R11) logged alongside. Seed every RNG (python/numpy/torch), set `cudnn deterministic` on where applicable, and note any known nondeterminism. Keep it strictly toy scale (small model, capped `updates_max`, short wallclock). Target one of the first reproduction variants from [experiment-runner-service.md](../../07-backend-api/experiment-runner-service.md) §First reproduction targets (TTT-Linear #2 or ARC LoRA TTT #4).
- **Verify:** A toy run completes within budget on CPU, writes per-seed `metrics.json` for treatment AND baseline, and respects `updates_max`/wallclock caps (a run exceeding the cap is killed and classified `budget-exceeded`).

### 6. `collect()` — per-seed metrics + optional write-side counters
- **Do:** Implement `collect(handle)` returning per-seed metrics, artifact paths, and (optionally, for the chosen variant) `writeback_observed` counters: `weights_updated`, `state_lifecycle`, `bytes_per_update`, `optimizer_state_bytes`, with `measurement: "measured"` to distinguish from modeled estimates. Leave any unmeasured number `null` — never invent one. This feeds the CAW-01 export hook later; it writes nothing to CAW-01.
- **Verify:** `collect` returns metrics for every seed; `writeback_observed` is either populated with measured values flagged `measured` or left `null`; no write occurs to any sibling-product path.

### 7. `exp.run()` orchestration — gate, decide, log append-only
- **Do:** Implement the flow from [experiment-runner-service.md](../../07-backend-api/experiment-runner-service.md) §v1 minimal toy runner flow: `spec = prepare(plan)`; assert `repro_gate(spec).ok` else force `verdict=invalid` (no other verdict admissible); `handle = launch(spec)` (entry created); `results = collect(handle)`; `verdict = decide(results, plan.prediction.decision_rule)` using the **pre-registered** rule (no HARKing — a post-hoc rule change is a superseding entry, not an edit); `exp.log_result(EXP-XXXX, results, verdict)` append-only.
- **Verify:** A full happy-path run produces one entry with a passing `REPRO.md`, a four-value verdict from the frozen rule, and per-seed results — all appended, none overwritten. A run with a failed gate yields `verdict=invalid` regardless of metrics.

### 8. Prove the P2 exit: one real entry + one deliberate failure
- **Do:** Run `exp.run` once on the real `ExpPlan` to produce a genuine ledger entry; then run a deliberately-failing configuration (e.g. force OOM/nonconvergence or a too-small budget) to produce a negative entry. Confirm both appear in the RB-020 `negative_results_view()` / current-verdict view as appropriate.
- **Verify:** Two `store/ledger/EXP-XXXX/` entries exist; the failing one is classified with a `failure_mode` and surfaced by default; neither was edited in place. The successful entry's verdict (even if `refuted`/`inconclusive`) is a valid M1 outcome.

## Acceptance criteria
- [ ] `ExperimentRunnerAdapter` Protocol implemented; `LocalToyRunner` v1 ready; two documented stubs report `deferred` and refuse to launch.
- [ ] `prepare()` freezes config + `>=3` seeds + env into a hashable `RunSpec`; identical inputs → identical `spec_hash`.
- [ ] Every launch creates a ledger entry BEFORE compute; an induced crash still leaves an `aborted`/`invalid` entry with a `failure_mode` (entry-on-launch invariant; ADR-0003 §Decision 6).
- [ ] Toy run executes a tiny PyTorch model + baseline (R11) per seed under a hard budget; cap breaches are killed and classified.
- [ ] `repro_gate` is asserted before any non-`invalid` verdict; verdict comes from the pre-registered `decision_rule` (no HARKing); results are appended, never overwritten.
- [ ] `writeback_observed` is collected as `measured` or left `null`; no write to any CAW-01/CAW-02/CAW-05 store.
- [ ] P2 exit demonstrated: one real entry + one deliberate-failure entry, both surfaced; matches [milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) P2 gate and M1 box 5.
- [ ] Tree green (compiles, lint passes).

## Rollback / safety
- Because `launch()` creates the entry first, any runner crash is *expected* to leave a partial `EXP-XXXX/` entry — that is the desired state, not corruption. Recovery = finalize it `aborted`/`invalid` with a `failure_mode`; never delete it.
- If the toy run risks exceeding host resources, the `budget` caps (`max_mem_gb`, `max_wallclock_s`, `updates_max`) must hard-kill the process; a cap breach is a `budget-exceeded`/`oom` negative result, not a reason to raise the cap silently.
- Never bypass `repro_gate` to obtain a non-`invalid` verdict, and never change `decision_rule` after seeing results except via a superseding entry — either would manufacture a non-reproducible or cherry-picked finding.
- If the runner module is mid-refactor and red, revert to the last green commit before launching real compute.

## Hand-off
P3 runbooks (implication map + `wbtraffic.v0`) can assume: a working `LocalToyRunner` that produces append-only ledger entries with verdicts and per-seed metrics, an optional `writeback_observed` measured hook to *ground* a modeled L0 estimate (flagged measured-vs-modeled), and the entry-on-launch guarantee that no run escapes the ledger. P4 export adapters can assume `supported`/`refuted` entries with clean repro blocks are the only ones eligible to export evidence (to CAW-02), and that lowering `writeback_observed` onto CAW-01 is an export across a boundary — never a shared store.

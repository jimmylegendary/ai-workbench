# Experiment Runner Service — the ExperimentRunner port + v1 toy runner + reproducibility capture

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface.md](./api-surface.md)
  - [./scout-service.md](./scout-service.md)
  - [./persistence.md](./persistence.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger.md)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Define the `ExperimentRunnerAdapter` **port**, the **v1 minimal local toy runner**, and the **reproducibility
capture** that gates every verdict (ADR-0003). It fixes how a run is launched, how config+seed+env are frozen, how
write-side behavior is optionally instrumented for the CAW-01 bridge, and the rule that **every launch creates a
ledger entry** — failures included. It does NOT define the ledger schema (that is [ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md)
/ [../02-research/experiment-ledger.md](../02-research/experiment-ledger.md)) or the writeback schema (ADR-0004); it
*produces* a `verdict` (→ Evidence) and an optional `writeback_observed` hook.

## The port
```
Protocol ExperimentRunnerAdapter:
  name: string
  health() -> HealthStatus              # v1 toy="ready"; external compute/HW stubs="deferred"
  prepare(plan: ExpPlan) -> RunSpec     # freeze config+seeds+env; returns a frozen, hashable spec
  launch(spec: RunSpec) -> RunHandle    # MUST create a ledger entry immediately (even before work starts)
  poll(handle) -> RunState              # queued|running|done|crashed
  collect(handle) -> RawResults         # per-seed metrics + artifact paths + optional write counters
```
- **v1 adapter:** `LocalToyRunner` — runs tiny models locally under tight budget (brief §11: toy scale only, no
  real TTT at scale). **Stubs (documented):** `ExternalComputeRunner`, `HardwareRunner` — implement the Protocol,
  report `HealthStatus="deferred"` (brief §9).
- **Entry-on-launch invariant:** `launch()` writes the ledger entry **before** doing work, so a crash still leaves
  an entry (`verdict=invalid`, `failure_mode=setup-error`/`oom`). This closes the off-ledger-run leak (ADR-0003 §6).

## v1 minimal toy runner flow
```
exp.run(plan_id, runner="LocalToyRunner"):
  spec = prepare(plan)            # config frozen to a file; >=3 seeds; code rev + env locked
  assert repro_gate(spec).ok      # else verdict forced to "invalid"; no other verdict admissible
  handle = launch(spec)           # ledger entry EXP-XXXX created here, status=running
  results = collect(handle)       # per-seed metrics (+ optional write counters)
  verdict = decide(results, plan.prediction.decision_rule)   # pre-registered rule; no HARKing
  exp.log_result(EXP-XXXX, results, verdict)                 # append-only; never overwrite
```

### First reproduction targets (from ttt-landscape §6)
| Target | Variant | Why first | Exercises |
|---|---|---|---|
| #2 | TTT-Linear (inner-loop fast-weight) | high update frequency, small state | `update.granularity`, `write_bw` |
| #4 | ARC LoRA TTT (per-task) | low frequency, large optimizer state | `optimizer_state_bytes`, residency |
Together they span opposite ends of the write-frequency / optimizer-state tradeoff and most writeback fields.

## Reproducibility gate (MUST items, pre-run — ADR-0003 §3)
A run cannot reach any verdict but `invalid` until all MUST items pass; the gate emits `artifacts/EXP-XXXX/REPRO.md`.

| Item | MUST | Auto-checkable |
|---|---|---|
| R1 config frozen | config is a committed file; no hidden CLI args | yes (hash diff) |
| R2 seeds | ≥3 seeds, per-seed metrics recorded | yes (count) |
| R3 code rev pinned | runner + product git rev recorded | yes |
| R4 env locked | lib versions + container digest | yes |
| R5 data specified | dataset id + split + hash | partial |
| R6 decision rule pre-registered | `decision_rule` frozen BEFORE results filled in | yes (timestamp order) |
| R7 hardware/budget | hw, wallclock, budget recorded | yes |
| R11 baseline | a baseline run logged beside treatment | yes (presence) |
| R12 failure logged | non-success carries a `failure_mode` | yes |

Changing the decision rule after seeing results is a **new superseding entry**, never an edit — the original
survives (anti-cherry-pick guard, ADR-0003 §3 R6).

```yaml
# RunSpec (frozen, hashable) — persisted under artifacts/EXP-XXXX/
spec_hash: <sha256 of this block>
hypothesis_id: HYP-0007
claim_ref: CLM-0012
prediction: { metric: accuracy, baseline: <ref>, expected_direction: ">", decision_rule: ">= +2pp on >=2/3 seeds" }
seeds: [11, 23, 42]
code_rev: { runner: <git-sha>, product: <git-sha> }
env: { python: TODO(open-question: pin), libs: TODO, container_digest: TODO }
data: { dataset_id: <id>, split: <split>, hash: <sha256> }
budget: { max_wallclock_s: TODO, max_mem_gb: TODO }
```

## Verdict semantics (no overclaim — ADR-0003 §2)
| Verdict | Means | Is NOT |
|---|---|---|
| `supported` | toy result matches predicted direction under the rule | "true at scale" / a settled claim |
| `refuted` | toy result contradicts prediction under the rule | "the idea is worthless" |
| `inconclusive` | ran cleanly, rule not met (effect within noise) | a failure to log |
| `invalid` | setup broken (OOM, bug, data leak) | `refuted` |

A `supported` toy verdict produces an `Evidence` record (`evidence_kind=experiment`) plus a **proposed**
`StatusEvent`; a human confirms any `supported` export (brief §12). `failure_mode ∈ {oom, budget-exceeded,
nonconvergence, no-effect, flaky, setup-error}` makes failures queryable, not narrative.

## Write-side instrumentation (the optional CAW-01 hook)
When a run can measure write-side behavior, `collect()` populates `writeback_observed` (`weights_updated`,
`state_lifecycle`, written-byte counts, `optimizer_state_bytes`) which **grounds** a modeled `wbtraffic.v0` number
(ADR-0004 §2) — a *measured* value flagged distinctly from a *modeled* one. This is an export hook feeding a
self-describing bundle, **never a shared store** with CAW-01 (a separate product; re-verify object names).
```yaml
writeback_observed:          # optional; null where unmeasured (never an invented number)
  weights_updated: TODO(open-question: which tensors a toy run actually rewrites)
  bytes_per_update: null
  optimizer_state_bytes: null
  measurement: "measured"    # distinguishes from modeled estimates
```

## Open Questions
- TODO(open-question: is 3 seeds enough for seed-sensitive TTT, or a variance-driven adaptive count; ADR-0003.)
- TODO(open-question: can a toy run meaningfully measure write-side bytes / optimizer residency at v1 scope, or does it need integration beyond v1; ADR-0003/0004.)
- TODO(open-question: env pinning mechanism — container digest vs lockfile only; this doc R4.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: `ExperimentRunnerAdapter` Protocol + `LocalToyRunner` v1 forcing entry-on-launch.
- RB: the pre-run repro gate (R1–R7, R11, R12) emitting `REPRO.md`; verdict forced `invalid` until green.
- RB: pre-registration ordering check (decision_rule timestamp < results timestamp).
- RB: optional `writeback_observed` collector for one variant (ADR-0004 Option B).

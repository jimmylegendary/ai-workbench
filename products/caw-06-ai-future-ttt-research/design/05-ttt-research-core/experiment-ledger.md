# Small-Experiment Ledger — core spec

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (the decision this spec implements)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (verdict → Evidence + StatusEvent)
  - [./writeback-traffic-schema.md](./writeback-traffic-schema.md) (`writeback_observed` grounds a modeled estimate)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger.md) (research backing)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape.md) (which variants to reproduce first)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the **build-facing spec** for CAW-06's small-experiment ledger: the entry record, the pre-registered
decision rule, the four-value verdict, the reproducibility gate, and the negative-result retention/surfacing
machinery. It turns [ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md) into concrete fields, states, and
checks a builder can implement. It does **not** redefine the decision (see the ADR), does not specify hypothesis
representation ([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md) — the ledger only *emits* a
verdict that becomes an `Evidence` record), does not define the `ExperimentRunnerAdapter` internals, and does not
own the writeback schema ([sibling doc](./writeback-traffic-schema.md) — the ledger only emits the optional
`writeback_observed` hook). Cross-link; don't duplicate.

## Invariants (non-negotiable)
1. **One run = one append-only entry.** Every launch that started — including a crash — is an entry. Corrections
   `supersede`; nothing is ever edited in place or deleted. (brief §5, §7)
2. **No overclaim.** A `supported` verdict at toy scale is a *hypothesis status update*, never a settled claim;
   modeled/generated artifacts are never evidence. (brief §5, §12)
3. **Failures are first-class.** Negative results are retained, classified, and surfaced **by default** — never
   silently dropped. (brief §5, §12)
4. **Reproducible by construction.** No verdict other than `invalid` is reachable until the repro gate passes.
5. **Independence.** Exports cross explicit file/API boundaries; no shared store with CAW-01/CAW-02/CAW-05. (brief §8)

## Lifecycle (state machine)
```
            launch
  (none) ───────────► planned ──► running ──► done
                         │           │          │
                         │           └─► aborted │ (crash/kill mid-run → entry still written)
                         └────────────────────► invalid (gate failed OR setup broken)

  verdict assigned only at `done`, gated by the repro gate:
     done + gate-pass  →  { supported | refuted | inconclusive }
     gate-fail OR setup-broken (any state)  →  invalid
```
- `status` is operational (where the run is); `verdict` is the scientific result (only meaningful at `done`).
- A run can reach `invalid` from any state; `invalid` says nothing about the claim, only about the setup.
- The `ExperimentRunnerAdapter` v1 **MUST** create the entry at `planned`/`running` *before* compute starts, so a
  crash leaves an `aborted`/`invalid` entry rather than no record (closes the off-ledger-run leak; ADR-0003 §6).

## Entry record (markdown front-matter + JSON twin; artifacts by path)
One entry per run under `store/ledger/EXP-XXXX/`. Schema is authoritative in
[../02-research/experiment-ledger.md](../02-research/experiment-ledger.md); reproduced here as the build contract:

```yaml
id: EXP-0007                      # stable, monotonic
hypothesis_id: HYP-0003           # ADR-0002 card; repeated attempts share this id
claim_ref: CLAIM-0011             # source claim being probed (ingestion)
title: "Per-instance LoRA TTT lifts toy ARC-like task vs frozen base"
status: planned|running|done|aborted
verdict: supported|refuted|inconclusive|invalid   # set only at done (or invalid)
created: TODO                     # do not invent dates
boundary: internal                # provenance/scope tag (brief §7)

prediction:                       # PRE-REGISTERED — frozen before results exist (gate R6)
  metric: "accuracy on held-out toy grid tasks"
  baseline: "frozen base model, in-context only"
  expected_direction: "TTT > baseline"
  expected_effect: "TODO(open-question: magnitude prior — no invented numbers)"
  decision_rule: "supported iff (mean_delta > 2*pooled_stderr) across >=3 seeds; \
                  refuted iff opposite direction beyond the same band; else inconclusive"

repro:                            # see the gate table below
  config_path: "artifacts/EXP-0007/config.yaml"   # full hyperparameters, frozen, hashed
  seeds: [0, 1, 2]                                 # >=3, not one
  code_rev: "git:abcd123"                          # runner + this product
  data_ref: "artifacts/EXP-0007/data/ (toy, synthetic gen-seed)"
  env_lock: "artifacts/EXP-0007/env.lock"         # lib versions + container digest
  hardware: "1x consumer GPU, 8GB / or CPU-only"
  determinism: "seeded; cudnn deterministic=on; known nondeterminism noted"
  budget: { wallclock_max: "30m", cost_max: "toy", updates_max: 100 }

results:                          # incl. failures, first-class
  metrics_path: "artifacts/EXP-0007/metrics.json"
  summary: "mean+/-stderr per seed; baseline vs TTT"
  observed_effect: "TODO until run"
  negative_result: false
  failure_mode: null              # controlled vocab below

writeback_observed:               # OPTIONAL CAW-01 hook (sibling schema); not a CAW-01 commitment
  weights_updated: true
  state_lifecycle: "per-request, discarded on completion"
  bytes_per_update_measured: null # a MEASURED number grounds a MODELED estimate (flagged distinctly)
  optimizer_state_bytes: null

lineage:
  supersedes: null                # EXP id this re-run replaces/refines
  derived_from: null
evidence_link: "exported to CAW-02 only after verdict in {supported, refuted} + clean repro"
```

## The pre-registered decision rule
HARKing (hypothesizing after results are known) and seed-cherry-picking are the failure modes this kills.

- `decision_rule` + `seeds` + `prediction` are **committed before `results` is populated** (gate item R6), enforced
  via append-only lineage: the entry exists with an empty `results` block first.
- If results force a rule change, that is a **new entry** with `supersedes` pointing at the original — the original
  (and its now-"wrong" rule) is preserved, so "searching for the right rule/seed" leaves a visible trail.
- The rule must be **mechanically evaluable** from `metrics.json`: a metric, a baseline, a direction, and a
  threshold expressed over the seed distribution (e.g. effect vs pooled stderr). No prose-only rules.

## Verdict semantics (no overclaim)
| Verdict | Means | Is NOT | Maps to (ADR-0002) |
|---|---|---|---|
| `supported` | toy result matches predicted direction under the rule | "the claim is true at scale" | `Evidence(experiment)` + proposed `StatusEvent`→`supported` (human-confirmed) |
| `refuted` | toy result contradicts prediction under the rule | "the idea is worthless" | `Evidence(experiment)` + proposed `StatusEvent`→`refuted` |
| `inconclusive` | ran cleanly, rule not met (effect within noise) | a failure to log | status unchanged; retained + surfaced |
| `invalid` | setup broken (OOM, bug, data leak, gate-fail) | `refuted` | no status change; never exports as evidence |

A `supported` toy verdict proposes a status change; **a human confirms any `supported` export** (brief §5, §12;
ADR-0001 review gate). A measured number from a run is evidence; a modeled number is not (it can never promote
status — the ADR-0002 hard evidence cap).

## Reproducibility gate
A run cannot move to any verdict but `invalid` until every **MUST** item passes. The gate emits
`artifacts/EXP-XXXX/REPRO.md` and is machine-checked where possible.

| # | Item | Level | Auto-checkable | Enforced by |
|---|---|---|---|---|
| R1 | Full config frozen as a file, no hidden CLI args | MUST | yes (file + hash) | gate refuses verdict |
| R2 | >= 3 seeds; per-seed metrics recorded | MUST | yes (count) | gate |
| R3 | Code revision pinned (runner + product) | MUST | yes (rev resolves) | gate |
| R4 | Environment locked (lib versions + container digest) | MUST | yes (lock present) | gate |
| R5 | Data fully specified (gen-seed or dataset ref + split) | MUST | partial | gate + review |
| R6 | Decision rule pre-registered **before** results | MUST | partial (lineage/empty-results check) | append-only ordering |
| R7 | Hardware + wallclock + budget recorded | MUST | yes | gate |
| R8 | Known nondeterminism declared / determinism flags on | SHOULD | partial | review |
| R9 | Variance reported (stderr/CI), not just point estimate | SHOULD | yes | review |
| R10 | One-command re-run regenerates `metrics.json` | SHOULD | yes (exit 0) | review |
| R11 | Baseline run logged alongside the treatment | MUST | yes (baseline id) | gate |
| R12 | Negative/failure runs logged with `failure_mode` | MUST | yes | gate |

> R6 is the anti-cherry-pick guard. The decision rule and seeds are frozen via append-only lineage *before*
> `results` is filled in; changing them after seeing results is a superseding entry, never an in-place edit.

## Negative results: retention, classification, surfacing
Three layers counter the well-documented bias of keeping only best runs (ADR-0003 §4):

**1. Retention.** Every started run is an entry; `aborted`/`invalid`/`inconclusive`/`refuted` use the *identical*
schema to successes. Append-only + `supersedes` means a re-run never overwrites the failure it replaces. Large
failure artifacts (crash logs, divergent loss curves) stay by path under the same `artifacts/EXP-XXXX/`.

**2. Classification.** Every non-success carries a controlled `failure_mode` so failures are queryable, not prose:

| `failure_mode` | Meaning | Typical follow-up |
|---|---|---|
| `oom` / `budget-exceeded` | hit memory or wallclock/cost cap | shrink model/seq-len; re-scope |
| `nonconvergence` | inner-loop TTT update did not converge | tune LR/steps; may itself be a finding |
| `no-effect` | ran clean, treatment ≈ baseline | strong negative; keep + surface (→ often `inconclusive`/`refuted`) |
| `flaky` | high seed variance, unstable verdict | more seeds; report variance |
| `setup-error` | bug, data leak, wrong baseline | fix, re-run as new entry (→ `invalid`) |

**3. Surfacing.** Failures are visible by default, never buried:
- A CLI/MCP **negative-results view** lists all `refuted`/`inconclusive`/non-null-`failure_mode` entries, grouped
  by `hypothesis_id` and `failure_mode`; default ordering surfaces failures rather than hiding them.
- Each hypothesis card shows its full win/loss history; a hypothesis with only failures stays visibly unsupported.
- A `no-effect`/`refuted` result is itself an **exportable finding** to CAW-02 ("toy reproduction did not
  reproduce claim X under conditions Y") and can seed a CAW-01 open question when it concerns write-side behavior.
  A negative result that *blocks* a future-workload assumption is high value, not noise.

This keeps the unit of value honest end-to-end: `source → claim → hypothesis → small experiment → result (incl.
failure) → implication`, with the failure node durable and discoverable (brief §2).

## The CAW-01 hook (export, not shared store)
When a run measures write-side behavior, `writeback_observed` (weights updated, state lifecycle, measured
`bytes_per_update`, optimizer-state size) populates the [writeback-traffic schema](./writeback-traffic-schema.md)
— grounding a *modeled* estimate with a *measured* one, flagged distinctly. This is an export hook through the
`ExportAdapter`; CAW-06 never writes into CAW-01's store. First reproduction targets (ADR-0003 §context;
ttt-landscape §6): **TTT-Linear (#2, high-frequency small writes)** and **ARC LoRA TTT (#4, bursty +
optimizer-state)** — opposite ends of the write-frequency / optimizer-state tradeoff.

## Tradeoffs (accepted)
| Decision | Pro | Con / cost |
|---|---|---|
| Append-only, supersede-don't-edit | full audit trail; failures survive re-runs | more entries; needs a "current verdict" resolver |
| Pre-registered rule (R6) | kills post-hoc cherry-picking | friction before each run |
| >=3 seeds MUST at toy scale | catches seed-luck on seed-sensitive TTT | ~3x toy compute per experiment |
| `invalid` distinct from `refuted` | setup bugs don't masquerade as findings | reviewers must triage `invalid` honestly |
| controlled `failure_mode` vocab | failures become filterable data | vocab maintained as the TTT space grows |

## Open Questions
Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- `TODO(open-question:` minimum seed count vs. budget — is 3 enough for seed-sensitive TTT, or a variance-driven
  adaptive count? `)`
- `TODO(open-question:` effect-size *prior* for `prediction.expected_effect` without inventing benchmark numbers? `)`
- `TODO(open-question:` can a toy run meaningfully measure write-side behavior (written bytes, optimizer-state
  residency) to feed the writeback schema, or does that need runner integration beyond v1's toy scope (brief §11)? `)`
- `TODO(open-question:` independent verification of public TTT cost claims (latency multiplier, memory O(T·d)) —
  vendor/blog vs peer-reviewed; mark before any export. `)`
- `TODO(open-question:` retention/GC for large failure artifacts — keep forever by path, or summarize + prune? `)`

## Implications for runbooks
- **RB (ledger store):** append-only entry storage (markdown/JSON, artifacts-by-path) under `store/ledger/EXP-XXXX/`;
  the `supersedes` lineage resolver; a "current verdict" view.
- **RB (repro gate):** a pre-run gate checking R1–R7, R11, R12; refuses any verdict but `invalid` until they pass;
  emits `REPRO.md`.
- **RB (`ExperimentRunnerAdapter` v1):** minimal local toy runner that creates a ledger entry on *every* launch,
  including crashes (→ `aborted`/`invalid`).
- **RB (negative-results surfacing):** CLI/MCP negative-results view + per-hypothesis history; failures surfaced by default.
- **RB (export hooks):** only `supported`/`refuted` with a clean repro block export evidence to CAW-02;
  `writeback_observed` feeds the CAW-01 export ([sibling](./writeback-traffic-schema.md)) — never a shared store.

> Independence reminder: CAW-01/CAW-02/CAW-05 are **separate products**. The ledger exports across explicit
> file/API boundaries; it shares no runtime substrate, store, or registry with them.

# Small-Experiment Ledger

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF.md)
  - [DOC-CONVENTIONS](../_meta/DOC-CONVENTIONS.md)
  - `../01-decisions/ADR-0003-experiment-ledger.md` (TODO: to be written)
  - `../08-research-plan/open-questions.md` (TODO: to be created)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc decides the **data model and discipline for the small-experiment ledger** — the place where CAW-06
records minimal reproductions / toy experiments for *checkable* TTT claims, under tight resource limits, with
enough metadata to reproduce a run (config + seed + env) and with **negative results retained and surfaced, not
discarded**. It delivers three things: (1) the **ledger entry model**, (2) a **reproducibility checklist**, and
(3) the **negative-result retention + surfacing** mechanism.

It does **NOT** cover: hypothesis representation/uncertainty tagging (that is a sibling ADR), the
`ExperimentRunnerAdapter` interface internals, the writeback-traffic schema export to CAW-01 (separate doc), or
how claims are extracted from sources. The ledger consumes a hypothesis and produces a verdict + evidence link;
it does not decide what the hypothesis *means*.

## Background: what makes a TTT claim "checkable" on a small budget

TTT (test-time training / test-time compute) covers methods that **update model parameters or state during
inference** rather than only reading frozen weights. Grounding examples from public research:

- **Per-instance parameter update on reasoning.** TTT on ARC fine-tunes (LoRA-style) per test instance and
  reports large accuracy gains over a static fine-tuned base — a *claim with a measurable delta* that a toy
  reproduction can probe at small scale. (`arxiv.org/abs/2411.07279`)
- **TTT as a sequence-modeling layer.** TTT layers carry a hidden state updated by inner-loop SGD per request,
  initialized fresh and **discarded when the request completes** — a *write-then-discard* lifecycle relevant to
  the writeback-traffic hypothesis. (TTT-as-linear-attention line of work, e.g. `arxiv.org/pdf/2602.21204`)
- **Cost claims.** Public sources put TTT's per-step overhead in the ~150 ms range for a 1B model and report
  ~1.7–2.5x latency overhead vs. read-only serving, with extra memory O(T·d) for gradients/activations.
  These are *quantitative claims we can sanity-check at toy scale* and are the seed of the CAW-01 bridge.
  (e.g. `spheron.network` TTT guide; numbers are vendor/blog-sourced — `TODO(open-question: independent verification)`)

> Guardrail (from brief §12): a generated summary of any of the above is **not evidence**. The ledger exists so
> that the *only* thing we treat as evidence is a logged, reproducible run with a recorded verdict.

A claim is **ledger-eligible** when it can be reduced to: a measurable quantity, a baseline, a predicted
direction/magnitude, and a stop condition reachable within the resource budget (below). If it cannot, it stays a
hypothesis and is routed to `08-research-plan/open-questions.md` instead of the ledger.

## The ledger entry model

One ledger entry = one **experiment run** (a single attempt against one hypothesis under one config + seed).
Repeated attempts are separate entries linked by `hypothesis_id` and `lineage`. Storage follows the family
convention: a markdown/JSON record per entry; large artifacts (logs, checkpoints, plots) referenced **by path**,
never inlined. Entries are append-only; corrections are new entries that supersede, not edits in place.

```yaml
# experiment-ledger entry (one run)
id: EXP-0007                      # stable, monotonic
hypothesis_id: HYP-0003           # links to hypothesis card (uncertainty-tagged elsewhere)
claim_ref: CLAIM-0011             # source claim being probed
title: "Per-instance LoRA TTT lifts toy ARC-like task vs frozen base"
status: planned | running | done | aborted
verdict: supported | refuted | inconclusive | invalid   # invalid = setup broken, not about the claim
created: TODO                     # do not invent dates
boundary: internal                # provenance/scope tag (brief §7)

# --- what is being tested ---
prediction:
  metric: "accuracy on held-out toy grid tasks"
  baseline: "frozen base model, in-context only"
  expected_direction: "TTT > baseline"
  expected_effect: "TODO(open-question: magnitude prior)"
  decision_rule: "verdict=supported iff delta > 2*pooled_stderr across >=3 seeds"

# --- reproducibility block (see checklist) ---
repro:
  config_path: "artifacts/EXP-0007/config.yaml"   # full hyperparameters, frozen
  seeds: [0, 1, 2]                                 # multiple, not one
  code_rev: "git:abcd123"                          # commit of runner + this product
  data_ref: "artifacts/EXP-0007/data/ (toy, synthetic)"
  env_lock: "artifacts/EXP-0007/env.lock"         # python+lib versions, container digest
  hardware: "1x consumer GPU, 8GB"                # or CPU-only
  determinism: "seeded; cudnn deterministic=on; known nondeterminism noted below"
  budget: { wallclock_max: "30m", cost_max: "toy", updates_max: 100 }

# --- results (incl. failures, first-class) ---
results:
  metrics_path: "artifacts/EXP-0007/metrics.json"
  summary: "mean+/-stderr per seed; baseline vs TTT"
  observed_effect: "TODO until run"
  negative_result: false          # true => see retention rules below
  failure_mode: null              # e.g. OOM | nonconvergence | no-effect | flaky | setup-error

# --- writeback signal (the CAW-01 export hook; optional) ---
writeback_observed:               # only if the run measured write-side behavior
  weights_updated: true
  state_lifecycle: "per-request, discarded on completion"
  notes: "feeds writeback-traffic schema export; NOT a CAW-01 commitment"

# --- provenance & lineage ---
lineage:
  supersedes: null                # EXP id this re-run replaces/refines
  derived_from: null              # parent experiment
evidence_link: "exported to CAW-02 only after verdict in {supported, refuted}"
```

### Field rationale (tradeoffs)

| Field group | Why it exists | Cost if omitted |
|---|---|---|
| `prediction.decision_rule` | Forces a pre-registered pass/fail so verdicts aren't post-hoc | Cherry-picking; HARKing |
| `repro.seeds` (plural) | TTT results are seed-sensitive; single seed hides variance | False "supported" from a lucky seed |
| `repro.env_lock` | Lib/CUDA drift silently changes results | "Works on my machine"; non-repro |
| `verdict=invalid` | Separates "claim is wrong" from "our setup broke" | Setup bugs misread as refutations |
| `failure_mode` | Makes negative results queryable, not just narrative | Failures become unsearchable prose |
| `lineage.supersedes` | Append-only + corrections without losing history | Lost audit trail; silent rewrites |
| `writeback_observed` | Optional bridge to CAW-01 schema | Re-running just to capture write-side data |

### Verdict semantics (no overclaim)

| Verdict | Meaning | What it is NOT |
|---|---|---|
| `supported` | Toy result matches predicted direction under decision rule | NOT "the claim is true at scale" |
| `refuted` | Toy result contradicts prediction under decision rule | NOT "the idea is worthless" |
| `inconclusive` | Ran cleanly, decision rule not met (e.g. effect within noise) | NOT a failure to log |
| `invalid` | Setup broken (OOM, bug, data leak); says nothing about claim | NOT `refuted` |

A `supported` verdict at toy scale is **a hypothesis status update, never a settled claim** (brief §5, §12).
Only `supported`/`refuted` verdicts with a clean repro block become exportable evidence to CAW-02.

## Reproducibility checklist

Adapted from the ML reproducibility-checklist tradition (NeurIPS / Pineau v2.0) and trimmed to a toy-scale,
single-operator product. A run cannot move to `verdict != invalid` until every MUST item is satisfied. Stored
as `artifacts/EXP-XXXX/REPRO.md` and machine-verified where possible.

| # | Item | Level | Auto-checkable? |
|---|---|---|---|
| R1 | Full config frozen as a file (`config.yaml`), no hidden CLI args | MUST | yes (file present + hash) |
| R2 | >= 3 random seeds; per-seed metrics recorded | MUST | yes (count seeds in metrics) |
| R3 | Code revision pinned (`git:rev`) for runner + product | MUST | yes (rev resolves) |
| R4 | Environment locked (lib versions + container digest / `env.lock`) | MUST | yes (lock present) |
| R5 | Data fully specified (synthetic gen seed, or dataset ref + split) | MUST | partial |
| R6 | Decision rule pre-registered **before** results filled in | MUST | partial (timestamp/lineage) |
| R7 | Hardware + wallclock + budget recorded | MUST | yes |
| R8 | Known nondeterminism declared (or determinism flags on) | SHOULD | partial |
| R9 | Variance reported (stderr / CI), not just point estimate | SHOULD | yes |
| R10 | One-command re-run script regenerates `metrics.json` | SHOULD | yes (script exit 0) |
| R11 | Baseline run logged alongside the treatment run | MUST | yes (baseline id present) |
| R12 | Negative/failure runs logged with `failure_mode` | MUST | yes |

> R6 is the anti-cherry-pick guard: the decision rule and seeds are committed (via append-only lineage) *before*
> `results` is populated. If results force a rule change, that is a **new** entry (`supersedes`), preserving the
> original — so "searching for the right seed" leaves a visible trail (a documented failure mode of ML repro).

## Negative results: retention and surfacing

Brief §5/§12 make failures **first-class**. The risk is the well-documented ML bias where only best runs are kept
and the rest are silently dropped, skewing the record. The ledger counters this at three layers:

**1. Retention (nothing is deleted).** Every run that started is an entry. `aborted`/`invalid`/`inconclusive`/
`refuted` runs are retained with identical schema to successes. Append-only + `supersedes` means a re-run never
overwrites the failure it replaces. Large failure artifacts (e.g. crash logs, divergent loss curves) are kept by
path under the same `artifacts/EXP-XXXX/` dir.

**2. Classification (failures are queryable).** Every non-success carries a `failure_mode` from a controlled
vocabulary so the ledger can be filtered, not just read:

| `failure_mode` | Meaning | Typical follow-up |
|---|---|---|
| `oom` / `budget-exceeded` | Hit memory or wallclock/cost cap | Shrink model/seq-len; re-scope |
| `nonconvergence` | Inner-loop TTT update did not converge | Tune LR/steps; may itself be a finding |
| `no-effect` | Ran clean, treatment ≈ baseline (→ often `inconclusive`/`refuted`) | Strong negative; keep + surface |
| `flaky` | High seed variance, unstable verdict | More seeds; report variance |
| `setup-error` | Bug, data leak, wrong baseline (→ `invalid`) | Fix and re-run as new entry |

**3. Surfacing (failures are visible by default).** Negative results are not buried:

- A **negative-results view** in the CLI/MCP lists all `refuted` / `inconclusive` / non-null `failure_mode`
  entries, grouped by `hypothesis_id` and `failure_mode`.
- Each **hypothesis card** shows its full run history (wins *and* losses); a hypothesis with only failures stays
  visibly unsupported rather than disappearing.
- A `no-effect` or `refuted` result is itself an **exportable finding** to CAW-02 ("toy reproduction did not
  reproduce claim X under conditions Y") and can seed an **open question** for CAW-01 if it concerns write-side
  behavior. A negative result that *blocks* a future-workload assumption is high-value, not noise.

This makes the unit of value (brief §2) honest end-to-end: `source → claim → hypothesis → small experiment →
result (incl. failure) → implication`, where the *failure* node is durable and discoverable.

## Tradeoffs of this ledger design

| Decision | Pro | Con / cost |
|---|---|---|
| Append-only, supersede-don't-edit | Full audit trail; failures survive | More entries; needs a "current" resolver view |
| Pre-registered decision rule (R6) | Kills post-hoc cherry-picking | Slight friction before each run |
| Markdown/JSON + artifacts-by-path | Matches family; diffable; light | No rich query without a small index layer |
| Controlled `failure_mode` vocab | Failures become filterable data | Vocab must be maintained as TTT space grows |
| >=3 seeds MUST at toy scale | Catches seed-luck on small budget | ~3x toy compute per experiment |
| Verdict `invalid` distinct from `refuted` | Setup bugs don't masquerade as findings | Reviewers must triage `invalid` honestly |

## Open Questions

Track these in `../08-research-plan/open-questions.md` (TODO: create):

- `TODO(open-question:` minimum seed count vs. budget — is 3 enough for seed-sensitive TTT, or do we need a
  variance-driven adaptive seed count? `)`
- `TODO(open-question:` what effect-size *prior* should `prediction.expected_effect` carry before any run, given
  we must not invent benchmark numbers? `)`
- `TODO(open-question:` can a toy run meaningfully measure write-side behavior (weights updated, optimizer-state
  residency, write volume) to feed the writeback-traffic schema, or does that require real runner integration
  beyond v1's toy scope (brief §11)? `)`
- `TODO(open-question:` how do we de-bias against silent drops when an operator runs experiments outside the
  ledger — do we need the `ExperimentRunnerAdapter` to *force* entry creation on every launch? `)`
- `TODO(open-question:` independent verification of public TTT cost claims (latency multiplier, memory O(T·d)) —
  are these vendor/blog numbers or peer-reviewed? Mark accordingly before any export. `)`
- `TODO(open-question:` retention/GC policy for large failure artifacts — keep forever by path, or summarize +
  prune after N days while keeping the metrics? `)`

## Implications for runbooks

- **RB (ledger store):** implement append-only entry storage (markdown/JSON, artifacts-by-path), the
  `supersedes` lineage resolver, and a "current verdict" view. Schema = the YAML above.
- **RB (repro enforcement):** a pre-run gate that checks R1–R7, R11, R12 (MUST items) and refuses to mark a run
  anything but `invalid` until they pass; emit `artifacts/EXP-XXXX/REPRO.md`.
- **RB (`ExperimentRunnerAdapter` v1):** the minimal local toy runner MUST create a ledger entry on every launch
  (including crashes → `invalid`/`aborted`) so failures cannot be silently dropped.
- **RB (negative-results surfacing):** CLI/MCP commands for the negative-results view and per-hypothesis run
  history; default ordering surfaces `refuted`/`inconclusive`/failures rather than hiding them.
- **RB (export hooks):** only `supported`/`refuted` runs with a clean repro block are eligible to export
  evidence to CAW-02; `writeback_observed` fields feed the CAW-01 writeback-traffic schema export (separate
  design) and never imply a shared store with CAW-01.

> Independence reminder: CAW-01, CAW-02, and CAW-05 are **separate products**. The ledger exports records across
> explicit file/API boundaries; it shares no runtime substrate, store, or registry with them.

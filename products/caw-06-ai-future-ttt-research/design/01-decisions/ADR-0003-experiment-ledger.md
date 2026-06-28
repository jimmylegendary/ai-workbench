# ADR-0003: Small-experiment ledger — minimal reproductions, reproducibility, failures-first

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0001-product-surface-and-scout.md](ADR-0001-product-surface-and-scout.md) (the Run stage that logs results)
  - [ADR-0002-hypothesis-representation.md](ADR-0002-hypothesis-representation.md) (verdicts become evidence + status events)
  - [ADR-0004-writeback-traffic-schema.md](ADR-0004-writeback-traffic-schema.md) (`writeback_observed` feeds the CAW-01 bridge)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger.md) (the research backing this ADR)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape.md) (which variants to reproduce first)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **data model and discipline of the small-experiment ledger** — where CAW-06 records minimal
reproductions / toy experiments for *checkable* TTT claims under tight resource limits, with enough metadata to
reproduce a run (config + seed + env) and with **negative results retained and surfaced, not discarded** (brief
§5, §12). It fixes (1) the **ledger entry model**, (2) a **reproducibility gate**, and (3) the **negative-result
retention + surfacing** mechanism. It does NOT define hypothesis representation (ADR-0002 — the ledger only
*produces* a `verdict` that becomes an `Evidence` record), the `ExperimentRunnerAdapter` internals, or the
writeback-traffic schema (ADR-0004 — the ledger only emits the optional `writeback_observed` hook).

## Context
- The brief makes **failures first-class and kept useful**: "minimal reproductions / toy experiments with config +
  result + verdict; negative results recorded, not discarded" (§5); v1 is **toy scale only** — "no large-scale
  training or running real TTT at scale" (§11).
- A **generated summary of a public cost claim is not evidence** (§12). The ledger exists so the *only* thing
  treated as evidence is a logged, reproducible run with a recorded verdict — closing the loop with ADR-0002's
  rule that `generated` evidence can never promote a status.
- The TTT landscape ([ttt-landscape.md](../02-research/ttt-landscape.md) §6) names the **first two reproduction
  targets**: one inner-loop fast-weight variant (TTT-Linear, #2) and one per-task variant (ARC LoRA TTT, #4) —
  opposite ends of the write-frequency / optimizer-state tradeoff, together exercising most writeback-schema
  fields.
- TTT results are **seed-sensitive** and public cost numbers are vendor/blog-sourced; the ledger must defend
  against seed-luck and post-hoc cherry-picking, and must instrument **write-side behavior** (written bytes,
  update frequency, optimizer-state size), not just accuracy — those are the numbers ADR-0004 needs.
- **Independence:** CAW-01/CAW-02/CAW-05 are separate products; the ledger exports across file/API boundaries and
  shares no store (§8).

## Options considered

### A. Entry model & mutability
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **One entry = one run; append-only; corrections are new entries that `supersede`; large artifacts by path** | Full audit trail; failures survive re-runs; matches family markdown/JSON + artifacts-by-path (§7); diffable | Needs a "current verdict" resolver view | **Chosen** |
| Edit-in-place per hypothesis | Fewer records | Silent rewrites destroy the failure history the brief mandates keeping | Rejected |
| One row per hypothesis with best result | Compact | Structurally drops negative/non-best runs — the exact bias the brief forbids | Rejected |

### B. Verdict vocabulary
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **`supported` / `refuted` / `inconclusive` / `invalid` (setup broken)**, decided by a pre-registered `decision_rule` | `invalid` separates "claim is wrong" from "our setup broke"; pre-registration kills HARKing; maps cleanly to ADR-0002 statuses | Reviewers must triage `invalid` honestly | **Chosen** |
| `pass` / `fail` only | Simple | Conflates "effect within noise" and "OOM bug" with a real refutation | Rejected |
| Free-text outcome | Flexible | Unqueryable; failures become unsearchable prose | Rejected |

### C. Reproducibility enforcement
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **A pre-run MUST-gate (config frozen, ≥3 seeds, code rev pinned, env locked, baseline logged, failure logged) that refuses any verdict but `invalid` until satisfied** | Catches seed-luck on a small budget; "works on my machine" can't yield a finding; auto-checkable where possible | ~3× toy compute per experiment; friction before each run | **Chosen** |
| Best-effort checklist (advisory) | No friction | Skipped under pressure → non-repro findings exported | Rejected |
| Single-seed runs | Cheapest | One lucky seed yields a false `supported`; fatal for seed-sensitive TTT | Rejected |

## Decision
**One run = one append-only entry; a four-value verdict gated by a pre-registered decision rule; a hard
reproducibility gate; negative results retained, classified, and surfaced by default.**

1. **Entry model (markdown/JSON; artifacts by path; append-only).** Each entry links `hypothesis_id` (ADR-0002)
   and `claim_ref` (ingestion), and carries a pre-registered `prediction` (`metric`, `baseline`,
   `expected_direction`, `decision_rule`), a `repro` block, a `results` block (incl. failures), an optional
   `writeback_observed` hook (ADR-0004), and `lineage` (`supersedes`/`derived_from`). Repeated attempts are
   separate entries linked by `hypothesis_id`; corrections supersede, never overwrite. Schema = the YAML in
   [experiment-ledger.md](../02-research/experiment-ledger.md).

2. **Verdict semantics (no overclaim).**

   | Verdict | Means | Is NOT |
   |---|---|---|
   | `supported` | toy result matches predicted direction under the decision rule | "the claim is true at scale" |
   | `refuted` | toy result contradicts prediction under the rule | "the idea is worthless" |
   | `inconclusive` | ran cleanly, rule not met (effect within noise) | a failure to log |
   | `invalid` | setup broken (OOM, bug, data leak) | `refuted` |

   A `supported` verdict at toy scale is **a hypothesis status update, never a settled claim** (brief §5, §12). It
   maps to an ADR-0002 `Evidence` record (`evidence_kind=experiment`) plus a proposed `StatusEvent`; a human
   confirms any `supported` export.

3. **Reproducibility gate (MUST items, pre-run).** Config frozen as a file (no hidden CLI args); **≥3 seeds** with
   per-seed metrics; code revision pinned (runner + product); environment locked (lib versions + container
   digest); data fully specified; **decision rule pre-registered before results are filled in** (R6, the
   anti-cherry-pick guard — changing the rule after seeing results is a *new* superseding entry, preserving the
   original); hardware/wallclock/budget recorded; a baseline run logged alongside the treatment; negative/failure
   runs logged with a `failure_mode`. A run cannot move to any verdict but `invalid` until the MUST items pass; the
   gate emits `artifacts/EXP-XXXX/REPRO.md`.

4. **Failures are first-class (three layers).**
   - **Retention:** every run that started is an entry; `aborted`/`invalid`/`inconclusive`/`refuted` use the
     identical schema to successes; nothing is deleted; append-only + `supersedes` means a re-run never overwrites
     the failure it replaces; large failure artifacts kept by path.
   - **Classification:** every non-success carries a controlled `failure_mode ∈ {oom, budget-exceeded,
     nonconvergence, no-effect, flaky, setup-error}` so failures are *queryable*, not narrative.
   - **Surfacing:** a CLI/MCP **negative-results view** lists all `refuted`/`inconclusive`/non-null-`failure_mode`
     entries grouped by `hypothesis_id` and `failure_mode`; each hypothesis card shows its full win/loss history; a
     `no-effect`/`refuted` result is itself an **exportable finding** to CAW-02 and can seed a CAW-01 open question
     when it concerns write-side behavior.

5. **The CAW-01 hook.** When a run measures write-side behavior, the optional `writeback_observed` fields
   (`weights_updated`, `state_lifecycle`, written-byte counts, optimizer-state size) populate the
   writeback-traffic schema (ADR-0004) — grounding a *modeled* estimate with a *measured* one, flagged distinctly.
   This is an export hook, never a shared store with CAW-01.

6. **Runner discipline.** The `ExperimentRunnerAdapter` v1 (minimal local toy runner) **MUST create a ledger
   entry on every launch**, including crashes (→ `invalid`/`aborted`), so failures cannot be silently dropped
   (closes the off-ledger-run leak).

## Consequences
- **Easy:** filter the record by `failure_mode`, resolve the current verdict per hypothesis, and trace any verdict
  to a frozen config + seeds + env; a `supported` finding is reproducible by construction.
- **Easy:** negative results flow straight into ADR-0002 (`refuted`/`inconclusive` status) and out to CAW-02 as
  knowledge — the failure node of the unit-of-value chain is durable and discoverable.
- **Hard / cost:** ~3× toy compute from the ≥3-seed rule; more entries to manage (needs the "current" resolver);
  the `failure_mode` vocabulary must be maintained as the TTT space grows; reviewers must triage `invalid`
  honestly rather than relabel setup bugs as refutations.
- **Follow-on:** ADR-0002 consumes the `verdict` as evidence + status event; ADR-0004 consumes
  `writeback_observed`. Runbooks: (1) append-only ledger store + `supersedes` resolver + current-verdict view;
  (2) the pre-run repro gate (R1–R7, R11, R12) emitting `REPRO.md`; (3) `ExperimentRunnerAdapter` v1 forcing entry
  creation on every launch; (4) the negative-results surfacing CLI/MCP commands; (5) export hooks (only
  `supported`/`refuted` with a clean repro block export to CAW-02; `writeback_observed` feeds CAW-01).

## Open questions / revisit triggers
- TODO(open-question: minimum seed count vs. budget — is 3 enough for seed-sensitive TTT, or do we need a
  variance-driven adaptive count?) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: what effect-size *prior* should `prediction.expected_effect` carry before any run, given we
  must not invent benchmark numbers?)
- TODO(open-question: can a toy run meaningfully measure write-side behavior — written bytes, optimizer-state
  residency — to feed ADR-0004, or does that require runner integration beyond v1's toy scope (brief §11)?)
- TODO(open-question: independent verification of public TTT cost claims (latency multiplier, memory O(T·d)) — mark
  vendor/blog vs peer-reviewed before any export.)
- TODO(open-question: retention/GC for large failure artifacts — keep forever by path, or summarize + prune after
  N days while keeping metrics?)
- **Revisit trigger:** if operators routinely run experiments outside the ledger, the runner must *force* entry
  creation (or the failures-first guarantee is void).

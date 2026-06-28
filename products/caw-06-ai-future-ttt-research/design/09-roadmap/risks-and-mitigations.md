# Risks & Mitigations

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./milestones-and-phases.md](./milestones-and-phases.md), [./dependency-graph.md](./dependency-graph.md), [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md), [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md), [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md), [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Catalogs the delivery and integrity risks specific to CAW-06 and the concrete, design-level mitigations that already exist in the ADRs (so the risks are controlled by construction, not by good intentions). It does NOT introduce new mechanisms — it points each risk at the decision that contains it. Severity is qualitative; no invented probabilities.

## Risk register

| ID | Risk | Likelihood | Impact | Owning mitigation |
|----|------|-----------|--------|-------------------|
| RK-1 | Overclaiming uncertain TTT (hypothesis presented as settled) | High | High | Status lifecycle + evidence cap (ADR-0002) |
| RK-2 | Toy experiments don't measure real writeback traffic | High | High | Mark estimate basis + open questions (ADR-0004) |
| RK-3 | CAW-01 IR drift (object names/levels change) | Medium | High | Re-verify names, export boundary only (ADR-0004, ADR-0008) |
| RK-4 | Scope creep into real/large-scale training | Medium | High | v1 = minimal reproductions only (brief §11) |
| RK-5 | Build-budget overrun / broad scaffolding | Medium | Medium | Vertical-slice M1 first (ADR-0001, brief §12) |
| RK-6 | Negative results lost / suppressed | Medium | Medium | Failures first-class, surfaced by default (ADR-0003) |
| RK-7 | Provenance / boundary leakage (sources vs generated) | Low | High | Separated record kinds + boundary tag (ADR-0002, ADR-0007) |

## Detail & mitigations

### RK-1 — Overclaiming uncertain TTT
The core hazard: a generated hypothesis gets read downstream as a fact, especially once exported.
- **Mitigation (by construction):** three separated record kinds (Source / Claim / Hypothesis); a four-state reversible status defaulting to `hypothesis`; calibrated *qualitative* uncertainty; a **hard evidence cap** — generated evidence can never promote status. Nothing crosses a boundary stripped of status/uncertainty (ADR-0002).
- **Check:** M1 gate "generated evidence did NOT promote status"; export bundles carry status + uncertainty fields or validation fails.
- **Residual:** human reader misreads `supported` as `proven` — Jimmy is the strategic reviewer (brief §12).

### RK-2 — Toy experiments not measuring real writeback
A minimal reproduction on toy scale may not reflect production write bandwidth/endurance; the danger is treating the L0 estimate as a measurement.
- **Mitigation:** `wbtraffic.v0` is produced as an **analytic L0 estimate** with an explicit `basis` field (`analytic-L0` vs `toy-grounded-L0`); every unknown numeric is `TODO(open-question)`, never fabricated; open questions travel inside the exported bundle (ADR-0004).
- **Check:** P3 field-coverage gate; export rejects a bundle missing `basis` or `open_questions`.
- **Residual:** L0 model itself wrong — flagged as the standing open question "can writeback be modeled at L0/L1 before syntorch/vLLM?".

### RK-3 — CAW-01 IR drift
CAW-01 is a separate product that owns its IR object names and L0/L1 levels; they can change underneath us.
- **Mitigation:** CAW-06 lowers a self-describing bundle **onto** CAW-01's existing L0 objects + open questions across an export boundary; IR names are re-verified at export time, never hard-coupled; no shared store (ADR-0004, ADR-0008).
- **Check:** `Caw01WritebackAdapter` records the `caw01_ir_targets` it resolved against and which version/source it re-verified.
- **Residual:** silent rename between exports — mitigate by re-verify-on-each-export, not caching names.

### RK-4 — Scope creep into real training
TTT work tempts expansion into real, large-scale training runs.
- **Mitigation:** brief §11 non-goal — v1 is minimal reproductions / toy experiments only; `ExperimentRunnerAdapter` keeps external compute/HW as documented stubs, not v1 work.
- **Check:** any runbook proposing real-scale training is out of scope and must be rejected at review.

### RK-5 — Build-budget overrun
Broad horizontal scaffolding burns budget before any thread flows end-to-end.
- **Mitigation:** ONE pipeline core + THREE thin surfaces (ADR-0001); deliver the M1 vertical slice before breadth; phases gated (see milestones doc).
- **Check:** M1 checklist green before P-beyond work; surfaces wrap the same core, no duplicated logic.

### RK-6 — Negative results lost
Failures are the most reusable output and the easiest to drop.
- **Mitigation:** ONE run = ONE append-only ledger entry; four-value verdict gated by a pre-registered decision rule; negative results retained, classified, surfaced by default (ADR-0003). M1 explicitly accepts a refuted/errored outcome as success.
- **Check:** ledger is append-only; a failing toy run still produces a complete, surfaced entry.

### RK-7 — Provenance / boundary leakage
Risk of conflating public-source research with internal claims, or generated summaries with evidence.
- **Mitigation:** separated record kinds; every entity carries provenance, uncertainty/status, and a `boundary` tag (ADR-0002, ADR-0007); ImplicationMap summaries explicitly marked **generated, not evidence** (ADR-0006); guardrails §12.
- **Check:** validators reject an export missing `boundary`/provenance; generated-summary flag mandatory on maps.

## Watch triggers (revisit this doc when)
- A TTT variant turns out NOT to write back → revisit RK-2 and the seed themes.
- CAW-01 publishes an IR change → re-verify RK-3 immediately.
- Any request to run real training → RK-4 escalation to Jimmy.

## Open Questions
- L0/L1 modelability of writeback before syntorch/vLLM integration — see `../08-research-plan/open-questions.md` (RK-2 residual).

## Implications for runbooks
- Each runbook's `Rollback / safety` section should name the risk(s) it touches and the gate that contains them.
- Export runbooks (P4) must implement re-verify-on-export (RK-3) and bundle validation (RK-1, RK-2, RK-7).

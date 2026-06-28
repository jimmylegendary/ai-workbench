# Risks & Mitigations — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases.md), [dependency-graph.md](./dependency-graph.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Top risks to CAW-03 and the mitigations, consistent with the harness's integrity goals.

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| RK-1 | **Gate bypass** — an ungated claim or generated-text-as-evidence reaches a draft | med | high | Gate runs in core, before assembly; T1/T2 tests across all surfaces; assembly refuses ungated claims |
| RK-2 | **Confidentiality leak on export** | med | high | Inherit CAW-02 boundary; fail-closed redaction on publish; T7; public-only prior-art queries |
| RK-3 | **Patent-first miss** — paper published before filing a patentable idea | med | high | patent-sensitive flag → interlock default-deny publish; counsel gate; T3 |
| RK-4 | **PaperOrchestra coupling / versioning drift** | high | med | EngineDescriptor version pin + preflight; engine behind a swappable port; treat PO as black box (don't fork) |
| RK-5 | **PO non-interactive invocation unknown** (OQ-01) | high | med | Resolve in phase-2 spike; fallback: CAW-03 hosts the agent runner; keep the port engine-neutral |
| RK-6 | **Over-coupling to CAW-01/02** | med | med | Reference by id/URI only; import/export adapters; no shared store |
| RK-7 | **Scope creep into rebuilding the engine** | med | high | Hard non-goal; PO is the engine; CAW-03 = governance only |
| RK-8 | **Legal overreach** — harness makes patentability/eligibility calls | low | high | Flag-only; human/counsel decides; no autonomous filing |
| RK-9 | **Build-budget / rate-limit interruptions** | high | med | Small resumable runbooks; sequential authoring over large fan-outs; clean hand-off per runbook |
| RK-10 | **Adapter weakens governance** | low | high | Governance in core around adapter calls; capability preflight; T4 (misbehaving fake adapter test) |

## Cross-cutting principle

Protect the **integrity invariant**: every published assertion traces to gated evidence; nothing patent-sensitive
leaks before filing. Every design choice (gate-in-core, interlock, fail-closed confidentiality, provenance) serves it.

## Note on this design effort (RK-9 in practice)

This design set was produced under recurring rate-limit interruptions; the runbooks are deliberately small and
resumable, and authoring fell back to sequential main-loop writing when parallel fan-out was blocked.

## Open questions

Build-budget sequencing across the family of products — see [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Each runbook's Rollback/safety + Hand-off operationalize RK-9; RK-1/2/3/10 are enforced as acceptance tests in the
gate/publish/patent/registry runbooks.

# Risks & Mitigations — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases.md), [dependency-graph.md](./dependency-graph.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The top risks to building CAW-01 and the mitigations, consistent with the trust ladder and the non-goals.

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| RK-1 | **syntorch internals uncertain** (capture altitude, Chakra dialect) | high | high | De-risk the Chakra interchange first (T1 reference round-trip) before wiring syntorch; treat only the front of the pipeline as variable; keep facts confined to [SOURCE-BRIEF §7](../_meta/SOURCE-BRIEF.md). |
| RK-2 | **ServingSim/ASTRA-sim ordering conflict** (OQ-01) | high | medium | v1 runs axes in parallel into one L0, not the literal chain; decide replace-vs-parallel in phase-3/4 with evidence. |
| RK-3 | **Canvas-3 3D infeasible** at interactive budget | medium | medium | Time-boxed spike (OQ-08) with a documented **Konva 2D fallback**; 3D is off the Milestone-1 critical path. |
| RK-4 | **Trace credibility** (syntorch vs real HW) | high | high | Trust ladder + golden tests T3/T4; runs carry a trust rung; nothing publishes above its rung. |
| RK-5 | **Scope creep** beyond v1 | medium | high | Explicit non-goals ([../00-overview/scope-and-non-goals.md](../00-overview/scope-and-non-goals.md)); each runbook carries "do NOT build yet" guards. |
| RK-6 | **Build-budget / rate-limit interruptions** | high | medium | Runbooks are small, atomic, resumable; prefer sequential main-loop authoring over large parallel fan-outs; each runbook has a clean hand-off so work resumes after a limit reset. |
| RK-7 | **Data model wrong at L0** (missing first-class field) | medium | high | Promotion principle: start opaque, promote only on repeated evidence; L0 round-trip (T2) catches schema conflicts early. |
| RK-8 | **TS⇆Python seam complexity** | medium | medium | Keep engine out-of-process behind typed ports; artifact-by-path never inline; transport choice deferred but isolated (OQ-09). |
| RK-9 | **Provenance leakage** (confidential in public) | low | high | Boundary/trust tags + DB constraints; public outputs from public-safe sources only ([../04-data-layer/knowledge-substrate.md](../04-data-layer/knowledge-substrate.md)). |

## Cross-cutting principle

Protect the **weakest link = trace credibility**. Every architectural choice (explicit strategy_ids, one L0,
golden tests, trust rungs) exists to make that link defensible.

## Note on this design effort itself (RK-6 in practice)

This very design set was produced under rate-limit interruptions. The lesson is encoded in the build plan:
favor small, resumable runbooks and sequential authoring over large parallel agent fan-outs.

## Open questions

Build-budget sequencing (how much parallelism a single builder can sustain) — TODO(open-question),
[dependency-graph.md](./dependency-graph.md).

## Implications for runbooks

Each runbook's **Rollback/safety** and **Hand-off** sections operationalize RK-6; RK-5 guards appear as explicit
non-goal reminders in each runbook.

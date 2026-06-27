# Research Plan — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [validation-and-golden-tests.md](./validation-and-golden-tests.md), [open-questions.md](./open-questions.md), [../02-research/](../02-research/)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The open research/validation program: what must be learned or proven before/while building, each tied to an ADR
and a runbook phase. This is the "reduce uncertainty" backlog that runs alongside the build.

## Research tracks

| # | Track | Question | Ties to | Resolve by |
| --- | --- | --- | --- | --- |
| R1 | syntorch capture altitude | At what altitude does syntorch capture sub-torch ops (`__torch_dispatch__` / custom)? | [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md) | phase-4 |
| R2 | Chakra dialect/version | Which `et_def.proto` revision; does syntorch emit standard `.et`? | ADR-0005 | phase-4 (reference round-trip) |
| R3 | vLLM version pin | V0 vs V1; exact torch API surface syntorch must satisfy | ADR-0005 | phase-0/4 |
| R4 | ServingSim/ASTRA-sim ordering | LLMServingSim already embeds ASTRA-sim — parallel vs replace cost model? | ADR-0005 | phase-3/4 |
| R5 | Chakra→L0 sufficiency | Does Chakra carry tensor size/lifetime, or need extension/sidecar? | [ADR-0002](../01-decisions/ADR-0002-data-layer.md)/ADR-0005 | phase-3 |
| R6 | Canvas-3 3D feasibility | Can r3f hold an interactive cluster, or fall back to Konva 2D? | [ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md) | phase-2 (spike) |
| R7 | Data-layer scale triggers | When add pgvector / Neo4j? | ADR-0002 | ongoing |
| R8 | Engine transport | stdio vs HTTP vs queue for the TS⇆Python seam | [ADR-0003](../01-decisions/ADR-0003-frontend-stack.md) | phase-4 |
| R9 | Trust-ladder thresholds | What tolerance = cross-axis agreement / trace credibility? | [knowledge-substrate](../04-data-layer/knowledge-substrate.md) | phase-3 (golden tests) |

## Method

- Each track resolves into either a doc update (decision recorded) or a spike runbook with an acceptance gate.
- Spikes are **time-boxed**; a failed spike triggers the documented fallback (e.g. R6 → Konva 2D).
- Findings update the owning ADR and clear the matching row in [open-questions.md](./open-questions.md).

## Sequencing vs the build

```
phase-0  ── R3 (pin), R8 (transport choice), R7 (start small)
phase-2  ── R6 (3D spike) BEFORE building Canvas 3
phase-3  ── R5, R9 (L0 sufficiency + golden thresholds)
phase-4  ── R1, R2 (capture + Chakra), then R4 (ordering)
```

## Open questions

All tracked centrally in [open-questions.md](./open-questions.md).

## Implications for runbooks

R6 is a gating spike runbook in phase-2; R2's reference round-trip is the first phase-4 runbook; the rest are
"resolve and record" tasks attached to their phase.

# Validation & Golden Tests — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan.md](./research-plan.md), [../05-caw01-simulation-control-plane/l0-ir-schema.md](../05-caw01-simulation-control-plane/l0-ir-schema.md), [../04-data-layer/knowledge-substrate.md](../04-data-layer/knowledge-substrate.md), [../01-decisions/ADR-0005-trace-pipeline.md](../01-decisions/ADR-0005-trace-pipeline.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The trust-ladder validation plan: the golden tests that defend trace credibility and the L0 round-trip, with
acceptance gates. Numeric thresholds are TODO(open-question) until measured.

## Why golden tests

The weakest link is **trace credibility** — especially syntorch traces of unbuilt devices. The trust ladder
([../04-data-layer/knowledge-substrate.md](../04-data-layer/knowledge-substrate.md)) is only credible if each rung
has an objective test.

## Test suite

### T1 — Chakra → ASTRA-sim reference round-trip
- **Goal:** a pinned reference `.et` feeds ASTRA-sim and produces stable metrics, before syntorch is wired.
- **Pass:** ASTRA-sim ingests the reference ET and yields deterministic timings across runs.
- **Gate for:** phase-4 syntorch wiring.

### T2 — L0 round-trip (one schema, two axes)
- **Goal:** a ServingSim-style output and a syntorch-style output both lower into the **same** L0 without schema conflict.
- **Pass:** both produce valid L0; capacity-peak + traffic rollups computed for each; comparable as one row.
- **Gate for:** Milestone 1 acceptance ([../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)).

### T3 — syntorch trace vs A100/OTel golden
- **Goal:** validate syntorch's trace against real A100/OTel evidence for a known workload.
- **Pass:** agreement within tolerance `TODO(open-question: %)` on capacity peak + traffic + iteration time.
- **Gate for:** promoting a run to trust rung "validated trace".

### T4 — Cross-axis agreement
- **Goal:** synthetic and simulation axes agree on the same L0 within tolerance.
- **Pass:** `delta` in the projection within `TODO(open-question: %)`.
- **Gate for:** trust rung "cross-axis agreement".

### T5 — Provenance/evidence integrity
- **Goal:** no publishable claim without evidence; boundary/trust tags enforced.
- **Pass:** DB constraints reject a publishable claim lacking an Evidence row; confidential boundary never appears in public output.

## Acceptance gates summary

| Rung | Test | Threshold |
| --- | --- | --- |
| executable assumption | builds + runs | n/a |
| explicit runtime | strategy_id present on ops/tensors | n/a |
| validated trace | T3 | TODO(open-question) |
| cross-axis agreement | T4 | TODO(open-question) |

## Open questions

All numeric thresholds (T3/T4) are unset — they require measured A100/OTel baselines; tracked in
[open-questions.md](./open-questions.md).

## Implications for runbooks

T1 is the first phase-4 runbook (gate); T2 is the phase-3 acceptance; T3/T4 attach once real baselines exist;
T5 is enforced by the phase-0 schema constraints.

# Simulation Engine & Projection — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [l0-ir-schema.md](./l0-ir-schema.md), [trace-pipeline-syntorch-chakra.md](./trace-pipeline-syntorch-chakra.md), [control-panel-and-run-lifecycle.md](./control-panel-and-run-lifecycle.md), [../07-backend-api/simulation-runtime-service.md](../07-backend-api/simulation-runtime-service.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define the run lifecycle inside the out-of-process engine, the fidelity tiers, the metrics produced, and the
**comparable projection** that makes two axes/runs comparable as one experiment row.

## Run lifecycle (state machine)

```
draft ─► queued ─► running ─► done
                        └────► failed
                        └────► stopped (user)
```

- `RunService.start` validates the composition, persists a `SimulationRun(status=queued)`, dispatches enabled axes.
- `RunService.status` streams progress per axis ([../03-architecture/data-flow.md](../03-architecture/data-flow.md)).
- On completion the engine returns **artifact paths + metrics**; the core registers them in one transaction.

## Fidelity tiers

| Tier | Backend | When |
| --- | --- | --- |
| **Default** | ASTRA-sim analytical | fast iteration; v1 default |
| Higher | ns-3 / SST-Merlin (flag) | when network credibility is required (deferred) |

The tier is part of `SimulationConfig`; switching tiers must not change the L0 schema, only the timing fidelity.

## Metrics produced

| Metric | From | Notes |
| --- | --- | --- |
| capacity_peak_bytes | L0 rollup | max live-tensor bytes over time |
| traffic_bytes(_per_tier) | L0 rollup | Σ movement bytes |
| latency / iteration_time | ASTRA-sim | per fidelity tier |
| (axis-specific extras) | engine | opaque until promoted |

## Comparable projection

A **projection** aligns runs/axes so they can be read as one row:

```
projection(experiment, refs[]) = [
  { axis: 'synthetic',  capacity_peak, traffic, latency, fill_level: 'L0', trust_rung: n },
  { axis: 'simulation', capacity_peak, traffic, latency, fill_level: 'L0', trust_rung: m },
  { delta: { capacity_peak: …, traffic: … } }   // cross-axis agreement
]
```

- Same L0 + same units → the deltas are meaningful.
- `trust_rung` comes from the trust ladder ([../04-data-layer/knowledge-substrate.md](../04-data-layer/knowledge-substrate.md)).
- The projection is what the control panel renders and what CAW-01 emits as an evidence artifact at its export boundary (consumable by other independent products such as CAW-03).

## Determinism & reproducibility

- A run is reproducible from `(WorkloadModel, SimulationConfig, hw_node tree, engine version pins)`.
- Engine version pins (vLLM, Chakra rev, ASTRA-sim rev) are recorded on the run for provenance.

## Open questions

What tolerance counts as "cross-axis agreement" for the trust ladder — numeric thresholds are
TODO(open-question) ([../08-research-plan/validation-and-golden-tests.md](../08-research-plan/validation-and-golden-tests.md)).

## Implications for runbooks

Phase-3 implements the lifecycle + rollups + projection; the control-panel runbook (phase-1/2) renders status
and projection; the golden-test runbook validates cross-axis agreement.

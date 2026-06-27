# RB-043: ASTRA-sim integration (synthetic axis end-to-end)

- Status: blocked
- Phase: phase-4-trace-pipeline
- Depends on: [RB-042, RB-033]
- Implements design: [trace-pipeline-syntorch-chakra.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md), [simulation-engine-and-projection.md](../../05-caw01-simulation-control-plane/simulation-engine-and-projection.md)
- Produces: `AstraSimPort` impl wiring the synthetic axis; Milestone-1 end-to-end

## Objective

Run the synthetic axis end to end: syntorch capture → Chakra exporter → ASTRA-sim (analytical) → L0, using the
Canvas-3 hardware config, so it appears as a comparable axis next to the simulation axis (completing Milestone 1).

## Preconditions

- [ ] RB-042 (exporter) + RB-033 (projection) complete.

## Steps

1. **Do:** Implement `AstraSimPort.simulate(etPaths, hwConfig, backend='analytical')` against the engine; pass the Canvas-3 `hw_config_ref` model.
   **Verify:** `test:` ASTRA-sim runs on the syntorch `.et` with the hardware model; returns metrics + artifacts.
2. **Do:** Lower the result into L0 (RB-031) and register run artifacts/metrics/IR (RB-032 path).
   **Verify:** `test:` a synthetic-axis run yields a stored L0 + metrics.
3. **Do:** Resolve the ordering question (OQ-01): run the synthetic and simulation axes **in parallel into one L0** (v1 default) and record the decision.
   **Verify:** `view:` OQ-01 updated with the chosen approach + rationale.
4. **Do:** Produce the comparable projection across both axes for one agent-turn (UC-1).
   **Verify:** `test:`+`view:` projection shows both axes + delta; **Milestone 1 demoable**.

## Acceptance criteria

- [ ] Synthetic axis runs end to end (capture→Chakra→ASTRA-sim→L0).
- [ ] Both axes compare as one experiment row (UC-1 / Milestone 1).
- [ ] OQ-01 recorded.

## Rollback / safety

Analytical backend only (ns-3/SST deferred). Runs are immutable per run_id; revert adapter to roll back.

## Hand-off

Milestone 1 complete. T3/T4 golden tests await real A100/OTel baselines; phase-5 adds MCP/CLI surfaces.

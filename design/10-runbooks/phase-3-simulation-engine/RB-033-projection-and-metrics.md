# RB-033: Comparable projection + metrics (T2 acceptance)

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-032]
- Implements design: [simulation-engine-and-projection.md](../../05-caw01-simulation-control-plane/simulation-engine-and-projection.md), [control-panel-and-run-lifecycle.md](../../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md), [../../08-research-plan/validation-and-golden-tests.md](../../08-research-plan/validation-and-golden-tests.md)
- Produces: `EvidenceService.projection` + the control-panel projection readout; **T2 L0 round-trip test**

## Objective

Turn runs into a comparable projection (capacity peak, traffic, latency, cross-axis delta, trust rung) rendered in
the control panel, and prove the **T2 L0 round-trip**: a ServingSim-style and a syntorch-style output (syntorch
may be stubbed until phase-4) lower into one L0 and compare as one row.

## Preconditions

- [ ] RB-032 (real runs producing L0) complete.

## Steps

1. **Do:** Implement `EvidenceService.projection(experiment, refs[])` aligning per-axis rollups into comparable rows + a `delta`.
   **Verify:** `test:` projection over two runs yields aligned rows + correct deltas.
2. **Do:** Surface `trustStatus` (trust rung) per run from the ladder rules.
   **Verify:** `test:` a run with explicit strategy_ids reports the right rung.
3. **Do:** Render `ProjectionReadout` + `EvidenceList` in the control panel bound to the store.
   **Verify:** `view:` after a run, the panel shows capacity/traffic/latency + delta + trust rung.
4. **Do:** Implement the **T2 test**: feed a ServingSim-style output and a syntorch-style fixture into the lowering; assert both produce valid L0 and a comparable projection without schema conflict.
   **Verify:** `test:` T2 passes ([../../08-research-plan/validation-and-golden-tests.md](../../08-research-plan/validation-and-golden-tests.md)).

## Acceptance criteria

- [ ] Projection aligns axes into comparable rows with deltas.
- [ ] Control panel renders projection + evidence + trust rung.
- [ ] **T2 L0 round-trip passes** (Milestone-1 gate).

## Rollback / safety

Read-only derivation over stored runs; revert to roll back. Thresholds for trust rungs remain TODO(open-question)
(T3/T4 await real baselines).

## Hand-off

Milestone 1 is demoable once phase-4 supplies a real syntorch axis; UC-1 works end to end.

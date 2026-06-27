# RB-040: Chakra ↔ ASTRA-sim reference round-trip (GATE, T1)

- Status: ready
- Phase: phase-4-trace-pipeline
- Depends on: [RB-031]
- Implements design: [trace-pipeline-syntorch-chakra.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md), [../../08-research-plan/validation-and-golden-tests.md](../../08-research-plan/validation-and-golden-tests.md), [../../01-decisions/ADR-0005-trace-pipeline.md](../../01-decisions/ADR-0005-trace-pipeline.md)
- Produces: a verified Chakra `.et` → `et_feeder` → ASTRA-sim path with stable metrics (**gate for RB-041–043**)

## Objective

De-risk the Chakra interchange waist **before** any syntorch work: pin a Chakra schema revision, feed a reference
`.et` into ASTRA-sim (analytical backend), and confirm deterministic metrics. This is test **T1** and a hard gate.

## Preconditions

- [ ] RB-031 (Chakra→L0 lowering) complete. ASTRA-sim + Chakra toolchain available in `engine/`.

## Steps

1. **Do:** Pin the Chakra `et_def.proto` revision (resolve OQ-04) and record it in [tech-stack.md](../../03-architecture/tech-stack.md).
   **Verify:** `view:` pinned revision recorded; OQ-04 updated.
2. **Do:** Obtain/author a reference per-rank `.et` (a known small workload). Stand up `et_feeder` + ASTRA-sim analytical config using a simple hardware model.
   **Verify:** `cmd:` ASTRA-sim ingests the `.et` and emits metrics.
3. **Do:** Run it twice; confirm metrics are deterministic across runs.
   **Verify:** `test:` two runs produce identical metrics (T1 pass).
4. **Do:** Lower the same reference `.et` through RB-031 into L0; sanity-check rollups against expectations.
   **Verify:** `test:` L0 capacity/traffic from the reference are sane.

## Acceptance criteria

- [ ] Chakra revision pinned + recorded.
- [ ] Reference `.et` → ASTRA-sim yields **deterministic** metrics (**T1 pass**).
- [ ] Same `.et` lowers into a sane L0.

## Rollback / safety

Reference assets + config only. If T1 fails, **do not proceed** to syntorch wiring — fix the interchange first (RK-1).

## Hand-off

The Chakra→ASTRA-sim path is trusted; only the *front* of the pipeline (syntorch capture + exporter) remains
variable. RB-041–043 are now unblocked.

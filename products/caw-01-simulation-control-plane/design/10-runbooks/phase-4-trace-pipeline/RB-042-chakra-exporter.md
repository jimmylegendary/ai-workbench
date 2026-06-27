# RB-042: syntorch Chakra exporter layer

- Status: blocked
- Phase: phase-4-trace-pipeline
- Depends on: [RB-041]
- Implements design: [trace-pipeline-syntorch-chakra.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md), [../../02-research/trace-capture-and-chakra.md](../../02-research/trace-capture-and-chakra.md), [../../01-decisions/ADR-0005-trace-pipeline.md](../../01-decisions/ADR-0005-trace-pipeline.md)
- Produces: `ChakraExporterPort` impl — native syntorch capture → standard per-rank Chakra `.et`

## Objective

Convert the native syntorch capture into **standard** per-rank Chakra `.et` (the pinned revision) so ASTRA-sim's
feeder ingests it unchanged — the syntorch-owned analogue of `chakra_trace_link` + `chakra_converter`.

## Preconditions

- [ ] RB-041 (capture) complete; Chakra revision pinned (RB-040).

## Steps

1. **Do:** Map native records → Chakra `NodeType` + attributes (`num_ops`, `tensor_size`, `comm_type`, `comm_size`); preserve deps.
   **Verify:** `test:` a captured fixture maps to schema-valid Chakra nodes.
2. **Do:** Write **per-rank** `chakra.<rank>.et` protobuf; keep L1/L2 annotations (tiling strategy ids, tier residency) on the op-id-keyed **side channel**, not in the proto.
   **Verify:** `test:` `.et` validates against the pinned schema; side-channel file present and keyed by op id.
3. **Do:** Expose via `ChakraExporterPort.toChakra`; store `.et` by path.
   **Verify:** `test:` adapter returns `.et` paths.
4. **Do:** Confirm the exported `.et` feeds the RB-040 ASTRA-sim path unchanged.
   **Verify:** `test:` ASTRA-sim ingests the syntorch-exported `.et` (same feeder as T1).

## Acceptance criteria

- [ ] Native capture → standard per-rank Chakra `.et` (pinned revision).
- [ ] L1/L2 annotations carried on a side channel, not the proto.
- [ ] Exported `.et` is consumed by the same ASTRA-sim feeder as the T1 reference.

## Rollback / safety

Pure transform; revert to roll back. If the dialect drifts from ASTRA-sim's expectation (OQ-03), fix the mapping
before integration.

## Hand-off

RB-043 runs the synthetic axis end to end through ASTRA-sim and into L0.

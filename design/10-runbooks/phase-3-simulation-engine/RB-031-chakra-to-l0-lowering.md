# RB-031: Chakra → L0 lowering (the normalization waist)

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-030]
- Implements design: [trace-pipeline-syntorch-chakra.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md), [l0-ir-schema.md](../../05-caw01-simulation-control-plane/l0-ir-schema.md), [../../01-decisions/ADR-0005-trace-pipeline.md](../../01-decisions/ADR-0005-trace-pipeline.md)
- Produces: `L0LoweringPort` implementation (Chakra ET → L0 IR)

## Objective

Implement the single normalization waist: convert a Chakra ET into the L0 IR — map node types to op_class, IO to
tensor bytes, derive tensor lifetimes, and build movements — so any axis emitting Chakra lowers into one L0.

## Preconditions

- [ ] RB-030 (L0 schema + rollups) complete.
- [ ] A pinned Chakra `et_def.proto` revision (OQ-04). If unresolved, use a documented fixture dialect and note it.

## Steps

1. **Do:** Parse a Chakra ET (per-rank `.et` protobuf). Map `NodeType` (COMP/COMM_*/MEM_*) → L0 `op_class`.
   **Verify:** `test:` each NodeType maps to the right op_class on a fixture.
2. **Do:** Map Chakra `tensor_size`/IO + dtype → L0 tensor `size_bytes`/`dtype`; attach `strategy_id` from the side channel.
   **Verify:** `test:` tensors carry correct bytes/dtype/strategy_id.
3. **Do:** Derive tensor **lifetime** (`allocated_at`/`freed_at`) via a DAG dependency walk (first/last use); if alloc/free events exist, prefer them (OQ-07).
   **Verify:** `test:` lifetime on a fixture matches first/last use.
4. **Do:** Build `movements` from COMM/MEM nodes (from_tier/to_tier/bytes/sync); carry L1/L2 annotations on the op-id-keyed side channel (not in the proto).
   **Verify:** `test:` movements + rollups computed; L1/L2 annotations preserved separately.

## Acceptance criteria

- [ ] A fixture Chakra ET lowers to a valid L0 with correct rollups.
- [ ] Node-type, tensor, lifetime, and movement mappings all unit-tested.
- [ ] L1/L2 annotations ride a side channel, not the Chakra proto.

## Rollback / safety

Pure transform; revert to roll back. If the Chakra revision is unresolved, the fixture dialect is clearly marked
(OQ-04) so it can be re-targeted.

## Hand-off

Any axis that produces Chakra (LLMServingSim now; syntorch in phase-4) can be normalized into one comparable L0.

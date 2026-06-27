# RB-030: L0 memory-annotated IR implementation

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-002]
- Implements design: [l0-ir-schema.md](../../05-caw01-simulation-control-plane/l0-ir-schema.md), [../../04-data-layer/data-model.md](../../04-data-layer/data-model.md)
- Produces: the L0 IR data structures + validation + capacity/traffic rollups (in `engine/l0_lowering` + `@caw/core` schemas)

## Objective

Implement the L0 IR exactly as specified: op/tensor/movement objects with first-class memory fields, schema
validation, and the derived rollups (capacity peak, rough traffic). L1/L2 fields reserved but unpopulated.

## Preconditions

- [ ] RB-002 (IrRepo + tables) complete.

## Steps

1. **Do:** Define the L0 schema in `engine` (Python) and mirror the contract in `@caw/core/schemas` (Zod) per [l0-ir-schema.md](../../05-caw01-simulation-control-plane/l0-ir-schema.md): `op{id,name,op_class,inputs,outputs,start,dur,strategy_id,attrs}`, `tensor{id,size_bytes,dtype,allocated_at,freed_at,residency,strategy_id}`, `movement{from_tier,to_tier,bytes,sync,op_ref}`.
   **Verify:** `test:` a sample L0 doc validates; a doc missing a first-class field fails.
2. **Do:** Implement **capacity peak** = max over time of Σ live-tensor bytes (live = allocated_at ≤ t < freed_at).
   **Verify:** `test:` hand-computed peak on a small fixture matches.
3. **Do:** Implement **rough traffic** = Σ movement bytes (and per-tier breakdown).
   **Verify:** `test:` fixture traffic matches.
4. **Do:** Persist L0 via `IrRepo.putL0`/`getL0` + `rollups`.
   **Verify:** `test:` round-trip an L0 doc through the repo.

## Acceptance criteria

- [ ] L0 schema validated in both Python and TS (Zod) and stays in sync.
- [ ] Capacity-peak + traffic rollups correct on fixtures.
- [ ] L0 persists/loads via `IrRepo`.

## Rollback / safety

Pure data + functions; revert to roll back. L1/L2 fields exist but remain unpopulated (non-goal).

## Hand-off

RB-031 lowers Chakra ET into this L0; RB-033 reads the rollups for projections.

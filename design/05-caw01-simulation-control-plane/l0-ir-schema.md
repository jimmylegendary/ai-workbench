# L0 Memory-Annotated IR Schema — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [trace-pipeline-syntorch-chakra.md](./trace-pipeline-syntorch-chakra.md), [simulation-engine-and-projection.md](./simulation-engine-and-projection.md), [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [../01-decisions/ADR-0005-trace-pipeline.md](../01-decisions/ADR-0005-trace-pipeline.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Specify the **memory-annotated IR** at fill level **L0** — the single representation all three evidence axes
lower into — and the progressive path to L1/L2. This is the critical design surface of the whole program.

## Principle (field promotion)

> A field is first-class **only** if it changes the causal chain for memory traffic, capacity pressure,
> latency, per-tier movement, tensor lifetime, or tiling/partitioning. Everything else is an opaque attribute,
> promoted only when repeated evidence shows it changes metrics.

L0/L1/L2 are the **same schema at different completeness**, never separate schemas.

## L0 schema (op-level graph + tensor size/lifetime)

```jsonc
{
  "ir_version": "L0",
  "experiment_id": "…", "run_id": "…", "axis": "synthetic|simulation|real",
  "time_unit": "us",
  "ops": [
    {
      "id": "op_0012",
      "name": "matmul",
      "op_class": "compute|mem_load|mem_store|p2p|collective",
      "inputs": ["t_in_3"], "outputs": ["t_out_4"],   // tensor refs
      "start": 1234, "dur": 56,                         // time axis (rough at L0)
      "strategy_id": "tile_v1",                          // tiling/partitioning, explicit (trust ladder)
      "attrs": { }                                       // opaque until promoted
    }
  ],
  "tensors": [
    {
      "id": "t_out_4",
      "size_bytes": 4194304, "dtype": "fp16",
      "allocated_at": 1234, "freed_at": 1801,            // lifetime → capacity peak
      "residency": "device",                              // L1 deepens this to tiers
      "strategy_id": "tile_v1"
    }
  ],
  "movements": [
    { "id": "mv_7", "from_tier": "host", "to_tier": "device",
      "bytes": 2097152, "sync": false, "op_ref": "op_0012" }  // → traffic
  ]
}
```

| Object | First-class L0 fields | Drives |
| --- | --- | --- |
| op | id, name, op_class, inputs, outputs, start, dur, strategy_id | graph + rough timing |
| tensor (`TensorNode`) | size_bytes, dtype, allocated_at, freed_at, residency, strategy_id | capacity peak, lifetime |
| movement (`DataMovementEdge`) | from_tier, to_tier, bytes, sync | traffic volume |

## From L0 to L1/L2 (same schema, more fill)

| Level | Adds |
| --- | --- |
| **L1** | per-tier residency detail + per-tier movement bytes (`from_tier`/`to_tier` become a real tier model) |
| **L2** | kernel-level tiling schedule, intra-kernel reuse, hardware-optimal runtime logic |

v1 populates **L0 only** ([../00-overview/scope-and-non-goals.md](../00-overview/scope-and-non-goals.md)); the schema reserves L1/L2 fields.

## Chakra → L0 lowering

The Chakra ET is timing/structure-oriented; lowering adds memory semantics
([trace-pipeline-syntorch-chakra.md](./trace-pipeline-syntorch-chakra.md)):

1. Chakra node → L0 op (map `NodeType` → `op_class`).
2. Chakra `tensor_size`/IO → L0 tensor `size_bytes`/`dtype`.
3. **Tensor lifetime** (`allocated_at`/`freed_at`) computed via a **DAG dependency walk** (first/last use), unless the source emits alloc/free events.
4. COMM/MEM nodes → L0 `movements`.

## Derived rollups (the point of L0)

- **Capacity peak** = max over time of Σ live-tensor `size_bytes` (live = allocated_at ≤ t < freed_at).
- **Rough traffic** = Σ movement `bytes` (optionally per tier).

These feed the **comparable projection** ([simulation-engine-and-projection.md](./simulation-engine-and-projection.md)).

## Round-trip requirement (acceptance)

A ServingSim-style output and a syntorch-style output must both lower into this **one** L0 without schema
conflict, and compare as one experiment row ([../08-research-plan/validation-and-golden-tests.md](../08-research-plan/validation-and-golden-tests.md)).

## Open questions

- Does current Chakra ET carry tensor size/lifetime, or do we need an extension/sidecar? TODO(open-question).
- Lifetime by DAG walk only, or alloc/free events from syntorch? TODO(open-question).

## Implications for runbooks

The phase-3 runbook implements the L0 schema + the Chakra→L0 lowering + the rollups; the L0 round-trip test is
its acceptance criterion.

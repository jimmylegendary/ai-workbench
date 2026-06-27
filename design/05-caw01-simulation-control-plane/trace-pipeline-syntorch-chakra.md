# Trace Pipeline: syntorch → Chakra → ASTRA-sim → L0 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [l0-ir-schema.md](./l0-ir-schema.md), [serving-and-representation-layer.md](./serving-and-representation-layer.md), [../01-decisions/ADR-0005-trace-pipeline.md](../01-decisions/ADR-0005-trace-pipeline.md), [../02-research/trace-capture-and-chakra.md](../02-research/trace-capture-and-chakra.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The synthetic axis in depth — how syntorch captures the sub-torch op stream, exports it to Chakra, runs it
through ASTRA-sim, and normalizes into L0 — alongside the simulation (LLMServingSim) axis and the real (OTel)
anchor. The L0 schema itself is in [l0-ir-schema.md](./l0-ir-schema.md).

## Stage-by-stage (synthetic axis)

```
1 CAPTURE   syntorch records sub-torch ops below its drop-in frontend
              altitude: __torch_dispatch__ / custom dispatcher (concrete shapes→bytes)
              per op: op id, name, op_class(compute/mem_load/mem_store/p2p/collective),
                      tensor IO (shape×dtype→bytes), data+ctrl deps, comm type+size, strategy_id
2 EXPORT    syntorch-owned Chakra exporter maps native records → Chakra NodeType + attrs
              writes per-rank chakra.<rank>.et (protobuf)   [analogue of chakra_trace_link + chakra_converter]
3 SIMULATE  ASTRA-sim feeder ingests the .et; times it (analytical backend default; ns-3/SST behind flag)
              uses the Canvas-3 hardware config for compute/network/memory models
4 LOWER     Chakra ET → L0 IR (add tensor size/lifetime; movements; rollups)   [the single normalization waist]
5 METRICS   capacity peak + rough traffic + ASTRA-sim timings → Metric/ResultSet
```

## The other two axes

| Axis | Path | Role |
| --- | --- | --- |
| **Simulation** | LLMServingSim (embeds Chakra+ASTRA-sim) → chakra/metrics → L0 lowering | a simulated twin of the serving loop |
| **Real** | service infra → OTel trace, aligned at agent-turn/request identity | **validation anchor only**, never a simulator input ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)) |

All three converge on **one L0** so they are comparable as one experiment row.

## Chakra ET essentials (interchange waist)

- Node types: COMP_NODE, COMM_COLL/SEND/RECV, MEM_LOAD/STORE.
- Attrs: `num_ops`, `tensor_size`, `comm_type`, `comm_size`; node fields incl. `ctrl_deps`, `data_deps`, `start_time_micros`, inputs/outputs.
- It is **timing/structure oriented**; memory size/lifetime is added during lowering (step 4).

## L1/L2 side channel

Richer annotations (tiling strategy ids, tier residency) ride on an **op-id-keyed side channel**, not by
overloading the Chakra proto ([../02-research/trace-capture-and-chakra.md](../02-research/trace-capture-and-chakra.md)).

## Reference round-trip (de-risk first)

Before wiring syntorch: pin a Chakra `et_def.proto` revision, stand up `et_feeder` + a reference `.et`
round-trip into ASTRA-sim. Only then treat the syntorch front of the pipeline as the variable part
([../08-research-plan/validation-and-golden-tests.md](../08-research-plan/validation-and-golden-tests.md)).

## Open questions

- syntorch capture altitude (`__torch_dispatch__` vs custom recorder)? TODO(open-question).
- Does syntorch emit standard `.et` directly, or native + exporter? per-rank file convention? TODO(open-question).
- Which Chakra `et_def.proto` revision is the integration target? TODO(open-question).
- vLLM version pin (V0 vs V1) + exact torch API surface? TODO(open-question).

## Implications for runbooks

Phase-4 runbooks implement capture, exporter, and ASTRA-sim integration in that order, each gated by the
reference round-trip; phase-3 owns the Chakra→L0 lowering.

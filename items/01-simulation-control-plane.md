# 01 — End-to-End Simulation Platform Control Plane

## Goal

Build the main company instrument: a web/control-plane layer that connects:

- real measurement axis: real service infrastructure -> OTel trace,
- synthetic execution axis: syntorch -> Chakra trace,
- simulation axis: LLMServingSim + ASTRA-sim.

The app should let users enter architecture/workload ideas, inspect simulation state/results, and turn outputs into architecture proposals, benchmark evidence, and memory product requirements.

The unit of value is not a screen. It is one reproducible experiment:

`(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection`

## Initial Entities

- `WorkloadModel`
- `InputTrace`
- `SimulationConfig`
- `SimulationRun`
- `TraceArtifact`
- `Metric`
- `ResultSet`
- `ArchitectureProposal`
- `MemoryProductRequirement`
- `MemoryAnnotatedIR`
- `TensorNode`
- `DataMovementEdge`
- `FillLevel`

## IR Principle

First-class schema fields should be limited to things that affect the metric causal chain:

- memory traffic,
- capacity pressure,
- latency,
- per-tier movement,
- tensor lifetime,
- partitioning/tiling strategy.

Everything else starts as opaque attributes and is promoted only if repeated evidence shows it changes metrics.

## Fill Levels

- `L0`: op-level graph + tensor size/lifetime. Enough for capacity peak and rough traffic.
- `L1`: memory tier residency + per-tier movement bytes.
- `L2`: kernel-level tiling schedule, intra-kernel reuse, hardware-optimal runtime logic.

L0/L1/L2 are the same schema with different completeness, not separate schemas.

## Design Questions

- What is the smallest demo that shows real value to the workload/network teams?
- Which simulator outputs must be normalized first?
- What is the right abstraction boundary between syntorch and the control plane?
- How much provenance is required for a result to be usable in paper/patent writing?
- Can one ServingSim-style output and one syntorch-style output fit into the same L0 IR without schema conflict?
- What is the minimum A100/OTel golden test needed to defend syntorch trace credibility?

## Next Actions

- Define the first `SimulationRun` + `MemoryAnnotatedIR` schema.
- Identify one demo-safe ServingSim-style output and one syntorch-style output.
- Create a syntorch vs A100/OTel validation plan.
- Build the first comparable projection view from L0 metrics.

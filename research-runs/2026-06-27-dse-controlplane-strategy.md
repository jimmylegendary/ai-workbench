# 2026-06-27 — DSE Control Plane Strategy Note

Source: Jimmy-provided session memory file `session_memory_dse_controlplane.yaml`.

Status: strategy note, not externally verified. URLs and related-work claims should be checked in the scheduled research loop before being treated as source-backed facts.

## Reframed Priority

The six Company AI Workbench surfaces should now be weighted around the company critical path:

1. `CAW-01` simulation control plane is the main instrument and the current job.
2. `CAW-06` TTT / future-AI research is not a side topic; it is a future workload axis that should feed the instrument.
3. `CAW-05` trend collection is elevated from support to an early-warning radar for novelty and related-work risk.
4. `CAW-02` knowledge repository is the memory layer that preserves sources, traces, insights, decisions, and experiment outputs.
5. `CAW-03` paper/patent harness comes after the first projection and trust ladder are credible.
6. `CAW-04` website/API is last; it is a publishing/read layer over the validated substrate.

## Core Thesis

New architecture discovery depends too much on expert intuition because the field lacks cheap instruments for testing architecture/workload ideas.

The workbench should become that instrument:

- not a solver that automatically finds the best architecture,
- not a fixed design-space optimizer,
- but an explorer's instrument that lets a domain expert move, add, and test design-space axes cheaply.

## DSE Reframe

Traditional DSE usually assumes a fixed design space and searches for optima within it.

This program should instead ask:

- Which workload axes dominate memory capacity, bandwidth, latency, and traffic?
- How do those ratios move over time?
- Which new axes appear when future workloads, such as TTT-class inference, no longer fit current assumptions?

Capacity vs bandwidth is not the answer. It is an output variable produced by workload axes.

## Control Plane Definition

The end-to-end simulation platform control plane is not mainly a web UI.

It should make one experiment reproducible as:

`(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection`

It should connect three evidence axes:

- real measurement axis: real service infrastructure -> OTel trace,
- synthetic execution axis: syntorch -> Chakra trace,
- simulation axis: LLMServingSim + ASTRA-sim.

## IR / Schema Principle

The hardest problem is the IR/schema boundary, not the engineering connection.

Rule:

> If a field changes the causal chain for memory traffic, capacity pressure, latency, or related metrics, it should become a first-class schema field. Otherwise it should remain an opaque attribute.

Backbone:

- tensor nodes,
- data-movement edges,
- time axis,
- first-class memory annotations.

Required early fields:

- node/op: input tensor refs, output tensor refs, working set,
- tensor: size, dtype, allocated_at, freed_at, residency, partitioning/tiling strategy id,
- movement edge: src tier, dst tier, bytes, sync/async.

## Fill Levels

Use one schema with progressive fill levels:

- `L0`: op-level graph + tensor size/lifetime. Enough for capacity peak and rough traffic. ServingSim should be able to fill this.
- `L1`: memory tier residency + per-tier movement bytes. This is where partitioning/tiling starts to matter and syntorch becomes valuable.
- `L2`: kernel-level tiling schedule, intra-kernel reuse, hardware-optimal runtime logic. This likely comes after syntorch is connected to vLLM.

Do not create separate schemas for L0/L1/L2.

## Trust Ladder

The TTT / future-workload paper path needs a trust ladder:

1. Device assumptions become executable through syntorch.
2. Algorithm/runtime/tiling assumptions become code rather than prose.
3. Axis movement/new-axis claims become visible through repeated control-plane projections.

Weakest link:

- fixed human-designed tiling/partitioning strategy can dominate results,
- so syntorch trace validation against A100/OTel evidence is a survival condition.

## Paper Program Logic

Potential sequence:

1. P1: `SynTorch` as executable synthetic frontend for memory-centric DSE of unbuilt AI hardware.
2. P2: control-plane method for tracking moving memory-demand axes in evolving AI workloads.
3. P3: TTT-class inference writeback traffic as a new architectural memory axis.

Interpretation:

- P1/P2 build the tool and method credibility.
- P3 is the future-axis case study and potential device-spec/patent driver.

## Related-Work Risk Radar

The attached note flags related-work risk around:

- DeepStack,
- Minsoo Rhu / MC-DLA / memory wall line,
- MemOS,
- memory-centric computing surveys,
- SECDA-DSE,
- CIM surveys.

These are not yet verified in this workspace. The weekly research cron should validate them and keep an explicit related-work ledger.

## Critical Path

Near-term order:

1. Create syntorch vs A100/OTel golden validation test.
2. Do L0 IR paper validation with one ServingSim output and one syntorch-style output.
3. Start narrow related-work radar for memory-centric DSE, memory device for LLM, DeepStack, Minsoo Rhu, TTT writeback traffic.
4. Build source-agnostic control plane around ServingSim first so syntorch/vLLM integration does not block progress.
5. Add syntorch as a second source adapter later.
6. Add TTT-class workload axis after the trust ladder starts working.

## Open Decision

This week, choose which starts first:

- narrow radar,
- or syntorch validation golden test.

The right answer may be both, but with strict scope: radar for novelty protection, validation for technical survival.

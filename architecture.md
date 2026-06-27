# Company AI Workbench — Program-Level Architecture

> **Scope note.** This document is **program-level context** only: shared vocabulary and
> recurring design patterns (layer model, memory-annotated IR, trust ladder) that several
> products happen to reuse. It is **not** a shared runtime substrate. Each product
> (CAW-01..06) is an **independent product** with its own architecture under
> `products/caw-0X-*/design/`. Any cross-product dependency is an **export boundary** —
> one product publishes an artifact another product consumes — not a shared platform.

## Independent Products

The six efforts are separate products, each separately implemented and deployed:

- CAW-01 — simulation control plane,
- CAW-02 — knowledge repository,
- CAW-03 — paper/patent harness,
- CAW-04 — tips/skills website + REST API,
- CAW-05 — trend collection,
- CAW-06 — AI-future / TTT research.

When one product needs another's output, it imports a published artifact across an export
boundary (e.g. a file, dataset, or API response). Products do not share a database, UI, or
service layer.

## Patterns Worth Reusing Per Product

The remainder of this document describes thinking that has proven useful and is likely to
recur. Treat it as a menu each product can draw from, not a contract.

### Instrument, not solver (CAW-01 thesis)

The simulation control plane is an instrument, not a solver.

Traditional DSE searches for an optimum inside a fixed design space. The company-side
opportunity is different: device class and workload axes may be unknown, moving, or newly
created by future AI workloads.

The product should help a domain expert move, add, and test design-space axes cheaply, then
preserve the evidence chain from workload hypothesis to memory-device implication.

Capacity vs bandwidth is therefore not the starting question. It is an output variable
produced by workload axes.

## Layer Model (reusable pattern)

A product that ingests evidence and produces auditable artifacts can structure itself in
layers. Not every product needs every layer.

### 1. Source Layer

Raw inputs:

- papers,
- technical articles,
- securities reports,
- community discussions,
- internal notes,
- simulator configs,
- experiment scripts,
- generated artifacts.

Each source should preserve:

- origin,
- date,
- author/provider,
- license/access status,
- retrieval method,
- trust level,
- public/internal/confidential boundary.

### 2. Knowledge Layer

Canonical entities:

- `Source`
- `Claim`
- `Evidence`
- `Note`
- `Concept`
- `Interest`
- `OpenQuestion`
- `Decision`
- `Assumption`

The key invariant: claims must point to evidence. Generated summaries are not evidence by
themselves.

### 3. Workflow Layer

TaskOps-style workflows, scoped to whatever the product does, e.g.:

- ingestion workflow,
- claim extraction workflow,
- simulation setup workflow,
- simulation run/review workflow,
- paper/patent draft workflow,
- trend digest workflow,
- future-AI experiment scout workflow.

Each workflow should produce an auditable artifact, not just a chat answer.

### 4. Simulation Layer (CAW-01)

This layer is specific to the simulation control plane.

Initial workflow:

`input feeder -> LLMServingSim -> syntorch -> AstraSim + SST`

Evidence axes:

- real measurement: real service infrastructure -> OTel trace,
- synthetic execution: syntorch -> Chakra trace,
- simulation: LLMServingSim + ASTRA-sim.

Core entities:

- `WorkloadModel`
- `InputTrace`
- `SimulationConfig`
- `SimulationRun`
- `TraceArtifact`
- `Metric`
- `ResultSet`
- `ArchitectureProposal`
- `MemoryProductRequirement`

One experiment should become:

`(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection`

### 4.1 Memory-Annotated IR (CAW-01)

The IR/schema boundary is the critical design surface for CAW-01.

Principle:

> If a field changes the causal chain for memory traffic, capacity pressure, latency, or
> related metrics, it should become a first-class schema field. Otherwise it should remain
> an opaque attribute.

Backbone:

- tensor nodes,
- data-movement edges,
- time axis,
- first-class memory annotations.

Required early fields:

- node/op: input tensor refs, output tensor refs, working set,
- tensor: size, dtype, allocated_at, freed_at, residency, partitioning/tiling strategy id,
- movement edge: src tier, dst tier, bytes, sync/async.

Use one schema with progressive fill levels:

- `L0`: op-level graph + tensor size/lifetime; enough for capacity peak and rough traffic.
- `L1`: memory tier residency + per-tier movement bytes.
- `L2`: kernel-level tiling schedule, intra-kernel reuse, hardware-optimal runtime logic.

L0/L1/L2 are fill levels, not separate schemas.

### 5. Artifact Layer

Artifacts:

- reports,
- papers,
- patents,
- figures,
- tables,
- simulator outputs,
- benchmark summaries,
- API docs,
- reusable skill docs,
- trend digests.

Each artifact should have:

- owner,
- source claims,
- source runs,
- review status,
- publishability status.

Artifacts are also the natural unit of the **export boundary** between products.

### 6. Publishing/API Layer

Surfaces:

- internal dashboard,
- REST API,
- static/document website,
- team knowledge viewer,
- weekly digest,
- paper/patent draft export.

Public outputs must be generated from public-safe sources only.

## First Vertical Slice (CAW-01)

Build the smallest slice that demonstrates:

1. A workload/simulation idea is entered.
2. Relevant sources/assumptions are attached.
3. A simulation run record is created.
4. Output artifacts and metrics are registered.
5. A generated explanation cites the source claims and run outputs.
6. The result can feed a paper/patent/report draft (via export boundary).

Updated first validation target:

1. Define L0 memory-annotated IR.
2. Map one ServingSim-style output and one syntorch-style output into the same schema.
3. Compute or sanity-check capacity peak and rough traffic.
4. Preserve sources, assumptions, and projection outputs.
5. Produce a comparison view that can later become a paper/patent evidence artifact.

## Trust Ladder (CAW-01)

For future-AI/TTT claims, the product needs a trust ladder:

1. Syntorch must make unbuilt-device assumptions executable.
2. Runtime/tiling assumptions must be represented as code or explicit strategy ids, not prose.
3. The control plane must show axis movement/new-axis emergence across repeated projections.

Weakest link to protect:

- trace credibility, especially syntorch trace validation against A100/OTel evidence,
- fixed human-designed tiling/partitioning assumptions.

## Design Bias (CAW-01)

The simulation control plane should feel like a control plane, not a chatbot.

Primary UI concepts:

- run status,
- evidence completeness,
- open questions,
- blockers,
- artifact readiness,
- next honest action.
</content>

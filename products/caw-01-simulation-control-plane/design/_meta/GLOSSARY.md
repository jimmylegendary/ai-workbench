# GLOSSARY — CAW-01 Ubiquitous Language

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Source of truth:** ./SOURCE-BRIEF.md

The canonical vocabulary for the CAW-01 design set. Use these terms exactly; do not coin synonyms.

## Frameworks & tools

- **vLLM** — open-source LLM serving framework (centralized scheduler, continuous/iteration-level batching, PagedAttention KV blocks). Execution path: Engine → Executor → Worker → ModelRunner → `model.forward()`. `syntorch` replaces everything from `forward()` down (the torch frontend contract), not vLLM internals.
- **syntorch** ("synthetic torch") — internal Python package. A **drop-in torch frontend** usable identically to vLLM's torch layer; everything below (kernels, HW logic) is custom and lets you express runtime algorithms incl. **partitioning/tiling** for a custom HW chip/architecture. Intended to be installed *instead of torch* inside vLLM to **capture all sub-torch traces**, which a **Chakra exporter layer** converts to Chakra traces. Also carries a **HW design layer** (chip→cluster). Treat as owned; do not fabricate internals beyond [SOURCE-BRIEF §7](./SOURCE-BRIEF.md).
- **LLMServingSim** — request-level simulator of an LLM serving loop (vLLM's simulated twin). Notably it **already embeds a modified ASTRA-sim + Chakra**, emitting Chakra per iteration — it is *not* a peer of ASTRA-sim.
- **ASTRA-sim** — distributed ML system simulator (layered: workload / system / compute / network). **Consumes Chakra ET.** Network backend is a fidelity dial: analytical (fast, default) → Garnet → ns-3 (packet/RDMA) → SST-Merlin (scale-out).
- **SST** — Structural Simulation Toolkit; one selectable high-fidelity backend (e.g. SST-Merlin) behind ASTRA-sim, not a wrapper.
- **Chakra trace / Chakra ET** — MLCommons **Execution Trace** standard; the interchange "waist" where the synthetic (syntorch exporter) and simulation (LLMServingSim) axes physically meet. Node types incl. COMP_NODE, COMM_COLL/SEND/RECV, MEM_LOAD/STORE; attrs incl. `num_ops`, `tensor_size`, `comm_type`, `comm_size`. Timing/structure-oriented; tensor size/lifetime are added during Chakra→L0 lowering.
- **OTel (OpenTelemetry)** — distributed-trace standard (span tree; GenAI semconv `gen_ai.usage.*`). In CAW-01 it is the **trust-ladder validation anchor**, aligned at agent-turn/request identity — **never a simulator input**.

## IR & simulation domain

- **Memory-annotated IR** — the single normalized representation all three axes lower into. Backbone: op/tensor nodes, data-movement edges, time axis, first-class memory annotations.
- **Fill levels L0 / L1 / L2** — *completeness levels of the same schema*, not separate schemas. **L0** = op-level graph + tensor size/lifetime (capacity peak + rough traffic). **L1** = memory-tier residency + per-tier movement bytes. **L2** = kernel-level tiling schedule, intra-kernel reuse, hardware-optimal runtime logic.
- **Promotion principle** — a field becomes first-class only if it changes the causal chain for memory traffic, capacity pressure, latency, per-tier movement, tensor lifetime, or tiling/partitioning. Otherwise it stays an opaque attribute.
- **TensorNode** — IR node for a tensor: size, dtype, allocated_at, freed_at, residency, partitioning/tiling strategy id.
- **DataMovementEdge** — IR edge for movement: src tier, dst tier, bytes, sync/async.
- **WorkloadModel / InputTrace / SimulationConfig / SimulationRun / TraceArtifact / Metric / ResultSet** — CAW-01's own simulation-domain entities: the workload definition, its input trace, the run configuration, a run instance, a produced trace blob, a measured metric, and a grouped result.
- **ArchitectureProposal / MemoryProductRequirement** — downstream conclusions derived from runs (device-requirement implications).
- **agent-turn** — one turn of an AI agent; the unit of "AI workload" visualized in Canvas 1 and the granularity at which OTel/Chakra identities align.
- **projection** — a comparable derived view (e.g. capacity peak + traffic) that makes two axes/runs comparable as one experiment row.
- **trust ladder** — the credibility staircase: syntorch traces must be validated against A100/OTel evidence; tiling/partitioning must be explicit code/strategy-ids, not prose.
- **tiling / partitioning strategy id** — an explicit identifier for the runtime algorithm syntorch applies; first-class so unbuilt-device assumptions are executable and auditable.
- **three evidence axes** — real (OTel), synthetic (syntorch→Chakra), simulation (LLMServingSim+ASTRA-sim).

## Hardware hierarchy (Canvas 3)

- **chip / die / package / tray / rack / cluster** — the physical design hierarchy, designed and visualized in Canvas 3 and fed into the syntorch HW design layer + ASTRA-sim/SST config.
- **partId** — the domain identity returned by canvas picking: a stable path identifying a chip/die/package/tray/rack/cluster + component, never a raw renderer object.

## Work-tree & versioning

- **work-tree** — the git-like tree of changes across all three canvases (the literal "work tree"); supports per-item and full save.
- **change_blob** — immutable content-addressed snapshot of one versioned thing (a C1 node param set, a C2 wiring, a C3 part config).
- **change_tree** — named map of entries → blobs/sub-trees mirroring the workload/serving/hardware structure.
- **change_commit** — `{root_tree, parents[], author, surface, message, created_at}`; append-only; intrinsic provenance.
- **ref** — movable named pointer to a commit (default line per experiment + user branches for what-if).

## Product core & surfaces

CAW-01 is an independent, standalone product — one of a family of six independent products (CAW-01..06) that are separately implemented and deployed with **no shared runtime substrate**. The terms below describe CAW-01's **own** internals.

- **@caw/core** — CAW-01's **own product core** (TypeScript): domain services (`ExperimentService`, `RunService`, `RegistryService`, `WorkTreeService`, `EvidenceService`) + Zod contract; zero `next` dependencies; behind it sit engine-adapter ports and repository interfaces. Not a substrate shared by other products.
- **engine-adapter port** — an interface in `@caw/core` that a concrete engine (syntorch / LLMServingSim / ASTRA-sim) implements out-of-process.
- **surface** — a thin entry point onto `@caw/core`: the web app (primary), the MCP server, or the CLI. MCP/CLI are CAW-01's own automation surfaces so external agents/tools can drive **this** product.
- **skill** — packaging of a reusable workflow over **this product's own operations**, exposed (e.g. via MCP) to other agents.
- **export boundary** — the boundary at which CAW-01 hands artifacts (evidence, projections, requirements) to **other independent products** (e.g. CAW-02 knowledge repo, CAW-03 paper/patent product) that may consume them. An export between independent products — never a shared substrate, registry, or database.

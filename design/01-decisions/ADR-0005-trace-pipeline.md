# ADR-0005: Trace pipeline — syntorch capture → Chakra exporter → ASTRA-sim, normalized into L0 IR

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [serving-and-simulation-frameworks](../02-research/serving-and-simulation-frameworks.md), [trace-capture-and-chakra](../02-research/trace-capture-and-chakra.md)
  - [ADR-0001 Product surface](./ADR-0001-product-surface.md) (TS⇆Python seam, engine ports)
  - [ADR-0002 Data layer](./ADR-0002-data-layer.md) (where artifacts/IR are stored)
  - [ADR-0004 Canvas rendering](./ADR-0004-canvas-rendering.md) (C1 nodes ↔ L0 IR; C3 HW config → ASTRA-sim)
  - [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema.md)
  - [open-questions](../08-research-plan/open-questions.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF.md)

## Purpose

Decide the **integration boundaries** of the trace pipeline: where syntorch captures, what the Chakra
exporter emits, how ASTRA-sim (+SST) consumes it, and how all three evidence axes (real OTel / synthetic
syntorch→Chakra / simulation LLMServingSim+ASTRA-sim) **normalize into the same memory-annotated L0 IR**
(SOURCE-BRIEF §1, §8). This ADR does **not** define the full L0/L1/L2 schema (that is
[l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema.md)), the storage tech
([ADR-0002](./ADR-0002-data-layer.md)), or the process/transport mechanics of the TS⇆Python seam
([ADR-0001](./ADR-0001-product-surface.md)). It fixes the **contracts at each boundary**.

## Context

- The brief's pipeline `input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+ SST)` spans four
  layers, each owned by one tool: serving dynamics (vLLM real / LLMServingSim simulated), below-torch
  execution (**syntorch**), distributed-system timing (**ASTRA-sim**), and the graph interchange
  (**Chakra ET**). They **stack**, they are not alternatives.
- **syntorch** (SOURCE-BRIEF §7) is a drop-in torch *frontend* with custom everything *below* torch
  (kernels, HW logic, **tiling/partitioning as explicit strategy ids**), installed instead of torch
  inside vLLM, with a **Chakra exporter layer**. Internals beyond §7 must **not** be fabricated.
- **Chakra ET** is the MLCommons standard DAG ASTRA-sim 2.0+ consumes via `et_feeder`. It carries
  COMP/COMM/MEM nodes, `data_deps`/`ctrl_deps`, `num_ops`, `tensor_size`, `comm_type`/`comm_size` — but
  **no memory-tier residency (L1), no tiling schedule (L2), and no device/topology** (topology lives in
  ASTRA-sim's system/network configs).
- **Chakra ET ≈ our L0**, but L0 also needs **tensor lifetime** (for capacity peak) which Chakra does
  not store. L1/L2 are richer annotations that do **not** fit the proto.
- **OTel** (real axis) is a coarse span tree (request/phase), not an op DAG; it cannot be fed into
  ASTRA-sim.
- **Tension:** the brief's `LLMServingSim -> syntorch -> ASTRA-sim` ordering conflicts with the fact that
  **LLMServingSim already embeds a modified ASTRA-sim**.
- The TS side never parses sub-torch internals; the engines are Python behind ports
  ([ADR-0001](./ADR-0001-product-surface.md)); large artifacts cross the seam as paths
  ([ADR-0002](./ADR-0002-data-layer.md)).

## Options considered

| Boundary decision | Option A | Option B | Chosen |
|---|---|---|---|
| **Capture altitude** | `__torch_dispatch__` / custom dispatcher below the frontend — sees true `aten`-level op stream, concrete shapes/dtypes→bytes, plus syntorch's own kernel/tiling/strategy ids | `torch.fx` static graph — cheap but no dynamic shapes | **A** — serving is dynamic; need real shapes for bytes; syntorch owns below-torch so it records op stream + strategy ids a stock dispatcher could not synthesize |
| **Exporter target** | emit standard Chakra `.et` directly | emit syntorch-native trace, convert in a dedicated **exporter layer** | **B** — matches SOURCE-BRIEF §7.4 wording; keeps the ASTRA-sim contract stable; the workbench reads one stable artifact |
| **L1/L2 annotations** | force into Chakra `attr` | **side-channel keyed by op id** into the IR | side-channel — never pollute the interchange standard |
| **OTel role** | feed into simulator | **validation anchor only** | anchor — granularity mismatch makes ingestion meaningless |
| **Public toolchain reuse** | fork everything | **reuse `et_feeder` + `et_def.proto`**; only capture+export are syntorch-specific | reuse — ASTRA-sim already speaks Chakra |
| **LLMServingSim vs syntorch** | rewire `LLMServingSim -> syntorch -> ASTRA-sim` literally now | run axes as **parallel paths converging on one L0**; defer in-loop rewiring | parallel-first (see Decision) |
| **Network backend** | ns-3 / SST high fidelity by default | **ASTRA-sim analytical (Simple/Hockney) default**, fidelity dial up | analytical default — fast sweeps; SST/ns-3 behind a flag |

## Decision

**Capture below torch, export to standard Chakra ET, time it in ASTRA-sim (analytical default), and
own the Chakra→L0 lowering as the single normalization waist. OTel is a validation anchor, never an
input. The first slice runs the axes in parallel into one L0 rather than literally chaining
`LLMServingSim -> syntorch -> ASTRA-sim`.**

1. **Capture (synthetic axis):** syntorch records the **sub-torch op stream** below its drop-in
   frontend at `__torch_dispatch__`/custom-dispatcher altitude. Per op it records: stable op id, name,
   op-class (compute / mem-load / mem-store / P2P / collective), tensor IO (shape×dtype→**bytes**),
   data+ctrl deps, comm type+size, and the explicit **tiling/partitioning strategy id**.
2. **Export:** the **Chakra exporter layer** (syntorch-owned) maps native records onto Chakra
   `NodeType` + attribute names and writes **per-rank `chakra.<rank>.et` protobuf**, analogous to
   `chakra_trace_link` + `chakra_converter`. Because syntorch knows the chosen tiling and the custom HW
   structure (Canvas 3), it populates `num_ops`/`tensor_size`/`comm_size` from **first principles /
   synthetic execution**, not a measured GPU run.
3. **L1/L2 ride a side-channel** keyed by op id (extension/sidecar), **not** the `.et` proto.
4. **Simulate:** ASTRA-sim ingests the `.et` via the **reused `et_feeder`**; **analytical (Simple/
   Hockney) backend is the default fidelity tier**; **SST-Merlin / ns-3 are config-selectable** higher
   fidelity behind the control plane's fidelity dial. Canvas 3's HW hierarchy lowers to ASTRA-sim's
   **system/network config** (and to syntorch's HW logic) — two consumers of one HW model that must stay
   consistent.
5. **Normalize → L0 IR (the workbench-owned waist):** a **Chakra → L0 lowering** pass that both Chakra
   producers (synthetic *and* simulation) feed:
   - topology → `TensorNode` + `DataMovementEdge` from `data_deps`/`ctrl_deps`;
   - tensor size → captured `inputs`/`outputs` (`tensor_size`);
   - **tensor lifetime** → derived by DAG walk (first-write to last-read) — the annotation L0 adds;
   - capacity peak → max concurrent live-tensor bytes; rough traffic → Σ `comm_size` + `MEM_*`.
   ASTRA-sim fills the **timing/contention** fields of the same nodes; syntorch's kernel/tiling
   knowledge deepens the **same schema** toward L1/L2 (no schema switch — SOURCE-BRIEF §1).
6. **OTel (real axis) is a validation anchor only:** OTel GenAI spans (latency, tokens, model identity)
   attach at the **workload-identity level** (one agent turn / request = Canvas 1's unit), **not** as
   per-op L0 nodes. An L0-derived projection must reconcile against OTel-measured evidence within the
   **trust ladder** before it is trusted. OTel→L0 partiality is a deliberate fill-level gap, not a bug.
7. **First-slice composition (resolves the LLMServingSim/ASTRA-sim tension):** run **Axis A
   (simulation)** = the request through LLMServingSim + its embedded ASTRA-sim, capturing its emitted
   Chakra + metrics; run **Axis B (synthetic)** = the same model forward path with **syntorch under a
   thin vLLM-shaped harness** (not full vLLM), exporting to Chakra; feed **both Chakra inputs into the
   one Chakra→L0 lowering** and compare. This exercises the **Chakra waist twice** and defers the
   volatile in-loop `LLMServingSim -> syntorch -> ASTRA-sim` rewiring (does syntorch *replace*
   LLMServingSim's per-op cost model, or run parallel?) to a later slice — recorded as an open question.
8. **Version pinning is mandatory:** every trace-pipeline runbook declares pinned **vLLM**,
   **LLMServingSim**, **ASTRA-sim**, and **Chakra `et_def.proto`** versions in its preconditions. We
   depend on the **torch-frontend contract**, not on vLLM internals.

## Consequences

- **Easy:** ASTRA-sim consumes our ET unchanged (reused feeder/proto); the synthetic axis yields the
  richest L0 (explicit bytes + strategy ids); the analytical default makes fast what-if sweeps; the
  Chakra→L0 lowering is one place all axes converge for comparable projection; the trust ladder is
  concrete from day one (two axes must agree on op structure before OTel even exists).
- **Hard / accepted:** the Chakra→L0 lowering (lifetime derivation, capacity/traffic rollups) is real
  engineering we own; L1/L2 side-channel must stay keyed and consistent with the `.et`; syntorch's true
  capture altitude and exporter dialect are unconfirmed (open questions gate the exporter contract);
  the in-loop rewiring of LLMServingSim+syntorch is deferred; vLLM/sim/Chakra version drift is explicit
  maintenance work.
- **Storage/seam consequences:** `.et` files, OTel traces, and raw sub-torch dumps are blobs on the
  artifact store with paths in PG ([ADR-0002](./ADR-0002-data-layer.md)); the TS side treats Chakra
  ET / IR / metrics as opaque-but-typed artifacts ([ADR-0001](./ADR-0001-product-surface.md));
  strategy-ids cross the seam as identifiers, not prose.

## Open questions / revisit triggers

1. `TODO(open-question)` Capture altitude — `__torch_dispatch__`, a custom dispatcher below it, or
   syntorch's own recorder? Determines the exporter contract.
2. `TODO(open-question)` Does syntorch emit standard Chakra `.et` directly or native-then-exporter
   (brief implies the latter)? Confirm the stable artifact boundary.
3. `TODO(open-question)` Per-rank file / process-group convention and whether syntorch encodes topology
   hints like PyTorch-distributed ET.
4. `TODO(open-question)` Tensor lifetime — pure DAG walk, or does syntorch emit alloc/free events?
5. `TODO(open-question)` Which Chakra `et_def.proto` revision is the integration target — pin it.
6. `TODO(open-question)` Does syntorch **replace LLMServingSim's per-op cost model** or run a parallel
   path? (the brief's chain vs LLMServingSim embedding ASTRA-sim)
7. `TODO(open-question)` vLLM target (V0 vs V1 engine) + exact torch-frontend surface syntorch satisfies.
8. `TODO(open-question)` OTel GenAI out-of-the-box vs custom spans for prefill/decode granularity.
9. `TODO(open-question)` Where SST attaches relative to ASTRA-sim for L1 memory-tier detail, and which
   config carries Canvas 3's memory hierarchy.

## Implications for runbooks

- **phase-4-trace-pipeline** — RB for the **Chakra → L0 lowering** (the normalization waist); RB for the
  **syntorch capture + Chakra export** harness (thin vLLM-shaped caller first); RB for **LLMServingSim →
  Chakra ingestion**. Stand up `et_feeder` + a reference `chakra.<rank>.et` round-trip into ASTRA-sim
  **before** any syntorch wiring (proves the contract).
- **phase-3-simulation-engine** — RB for ASTRA-sim invocation with the **analytical backend** default,
  SST/ns-3 behind a config flag.
- **IR fill** — RB for Chakra-ET → L0 loader (`TensorNode`/`DataMovementEdge`), lifetime computation,
  capacity-peak + traffic rollups; attach ASTRA-sim metrics + OTel validation evidence to the same
  `WorkloadModel`.
- **real axis** — RB for OTel GenAI instrumentation + workload-identity alignment for the trust ladder.
- Every such RB declares pinned vLLM / LLMServingSim / ASTRA-sim / Chakra versions; targets
  [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema.md) and stores per
  [ADR-0002](./ADR-0002-data-layer.md).

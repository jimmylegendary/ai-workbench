# Trace Capture & Chakra Pipeline

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-layer-options](./data-layer-options.md), [ADR-0005 trace pipeline](../01-decisions/ADR-0005-trace-pipeline.md), [L0 IR schema](../05-caw01-simulation-control-plane/l0-ir-schema.md), [SOURCE-BRIEF](../_meta/SOURCE-BRIEF.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This doc explains the *technical mechanics* of capturing execution traces below the torch layer and turning them into a form ASTRA-sim can simulate and that the workbench can normalize into the memory-annotated L0 IR. It grounds the SOURCE-BRIEF claim that `syntorch` is a "drop-in torch frontend that captures all sub-torch traces" and converts them via a "Chakra exporter layer." It covers: (1) how PyTorch ops can be intercepted, (2) the Chakra execution-trace (ET) schema and converter/feeder toolchain, (3) the OTel trace shape for the real-measurement axis, and (4) a stage-by-stage pipeline `capture -> normalize -> Chakra ET -> ASTRA-sim` with the data each stage carries.

It does **not** decide storage tech (see [data-layer-options](./data-layer-options.md)), does **not** define the full L0/L1/L2 schema (see [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema.md)), and does **not** invent `syntorch` internals beyond the SOURCE-BRIEF. The *integration boundary* decisions land in [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md).

---

## 1. Where you can intercept PyTorch (the capture layer)

A "drop-in torch frontend that captures sub-torch traces" must hook PyTorch at a level low enough to see *every* tensor operation but high enough to keep semantic meaning (op name, shapes, dtypes, collective type). PyTorch offers several interception points, each with a different altitude:

| Mechanism | Altitude | What you see | Trade-off for syntorch |
|---|---|---|---|
| `torch.fx` symbolic trace | Python module graph | `call_function`/`call_module` nodes, *static* graph | Misses data-dependent control flow; no real shapes unless ShapeProp; not eager. Good for static graph export, weak for serving. |
| `__torch_function__` (subclass / `TorchFunctionMode`) | Public Python API (`torch.*`, `nn.functional.*`) | High-level calls before decomposition | Sees `F.scaled_dot_product_attention` as one op, not the aten primitives underneath. Too coarse for memory traffic. |
| `__torch_dispatch__` (`TorchDispatchMode`, tensor subclass) | **aten/dispatcher level** | Every dispatched `aten::*` op (e.g. `aten.addmm`, `aten.t`), incl. factory functions | The "true" op stream after decomposition; can read concrete shapes/dtypes/strides. This is the natural altitude for a sub-torch capture. |
| PyTorch **ExecutionTraceObserver** (PARAM/Chakra path) | aten dispatcher, native C++ observer | Op graph with input/output tensor metadata, IDs, parent/child + control deps; collectives metadata | Purpose-built to *emit Chakra-linkable ET*. The reference capture path for the public Chakra toolchain. |
| Kineto / `torch.profiler` | CUPTI / device timeline | GPU kernel durations, CUDA runtime, comm kernels with *timing* | Gives real wall-clock per op; merged with ET to add `start_time`/`duration`. |

**Key distinction for builders:** `__torch_function__` is the *frontend* API (what vLLM code calls); `__torch_dispatch__` is *below* it, after PyTorch has decomposed/redispatched into core `aten` ops. The SOURCE-BRIEF says syntorch is a frontend "used identically to vLLM's torch layer" but with "custom everything below torch." That maps cleanly onto this two-layer reality: syntorch presents the same `torch.*` / `__torch_function__` surface vLLM expects, and substitutes its own implementation (and trace recorder) below it — exactly where `__torch_dispatch__` / a custom dispatcher would sit. Because syntorch *owns* everything below the frontend, it is not limited to PyTorch's eager dispatcher: it can record the op stream plus its own custom kernel/tiling/partitioning decisions (which a stock `TorchDispatchMode` could not synthesize).

### What the capture must record per op

Regardless of mechanism, to feed both Chakra and the L0 IR, each captured op needs:

- **identity**: stable op id, op name (`aten::matmul`, a collective name, a custom syntorch kernel id).
- **dependencies**: which prior ops produced its inputs (data deps) and ordering/control deps.
- **tensor IO**: per input/output — shape, dtype, element count → **bytes** (the basis for memory annotation).
- **op class**: compute / memory-load / memory-store / point-to-point comm / collective comm.
- **comm metadata** (if comm): collective type, message size in bytes, process group / participants.
- **timing** (when measured, not synthetic): start + duration, from Kineto/device.
- **syntorch-only**: the explicit tiling/partitioning **strategy id** chosen for that op on the target custom HW (per SOURCE-BRIEF §7.2). This is what makes "unbuilt-device assumptions executable."

> `TODO(open-question: does syntorch capture at __torch_dispatch__ granularity, at a custom dispatcher below it, or via its own recorder? The SOURCE-BRIEF only says "all traces below torch are captured." Confirm before fixing the exporter contract in ADR-0005.)`

---

## 2. Chakra execution trace (ET) — the interchange schema

[Chakra](https://github.com/mlcommons/chakra) is the MLCommons standard graph representation of distributed AI workloads. It is a **DAG** whose nodes are compute / communication / memory operations and whose edges are data + control dependencies. ASTRA-sim 2.0+ adopted Chakra ET as its primary workload input ([ASTRA-sim docs](https://astra-sim.github.io/astra-sim-docs/workload-layer/overview.html)).

### 2.1 Node schema (`et_def.proto`)

From the Chakra protobuf schema, `NodeType` enumerates:

| NodeType | Meaning | Maps in ASTRA-sim to |
|---|---|---|
| `METADATA_NODE` | graph/global metadata | setup, not simulated work |
| `MEM_LOAD_NODE` / `MEM_STORE_NODE` | (remote/local) memory movement | memory-traffic cycles |
| `COMP_NODE` | compute op (e.g. GEMM, elementwise) | compute roofline (FLOPs/cycles) |
| `COMM_SEND_NODE` / `COMM_RECV_NODE` | point-to-point comm | network layer P2P |
| `COMM_COLL_NODE` | collective comm | network/system collective model |
| `INVALID_NODE` | sentinel | — |

Each `Node` carries: `id` (uint64), `name`, `type`, `ctrl_deps` (repeated uint64), `data_deps` (repeated uint64), `start_time_micros`, `duration_micros`, `inputs`/`outputs` (tensor IO info), and `attr` (repeated `AttributeProto` — typed key/value, scalar or list of any numeric/bool/string/bytes).

Standard attributes carried in `attr` include (names per Chakra schema/tooling): `is_cpu_op`, `num_ops` (op/FLOP count for compute), `tensor_size`, and for collectives `comm_type` (one of the `CollectiveCommType` enum: `ALL_REDUCE`, `REDUCE`, `ALL_GATHER`, `GATHER`, `SCATTER`, `BROADCAST`, `ALL_TO_ALL`, `REDUCE_SCATTER`, `REDUCE_SCATTER_BLOCK`, `BARRIER`), `comm_size` (bytes on the wire), and `comm_priority`/`pg_name` for process-group routing.

### 2.2 What Chakra ET deliberately does NOT carry

- No memory-tier residency or per-tier movement bytes (that is L1 in our IR).
- No kernel-level tiling schedule / intra-kernel reuse (that is L2).
- No first-class device/topology spec — topology lives in ASTRA-sim's *system* + *network* configs, not the ET.

This matters: **Chakra ET ≈ our L0** (op graph + tensor sizes + dependencies + comm bytes). L1/L2 are richer annotations the workbench layers on top, sourced from syntorch's custom-kernel knowledge and the HW design layer — they are not expressible in stock Chakra and must be carried as IR extensions, not forced into the proto.

### 2.3 The public converter / feeder toolchain

The reference (non-syntorch) path is the proof-of-shape we mirror:

1. **Collect** — PyTorch `ExecutionTraceObserver` emits a host ET (op graph, deps, tensor IO); `torch.profiler`/Kineto emits a device trace (kernel timings).
2. **`chakra_trace_link`** — merges host ET + Kineto device trace so GPU kernel durations are attached to the right ET ops (encodes real timing onto the graph).
3. **`chakra_converter`** — takes the merged JSON, resolves/encodes dependencies, and emits the Chakra ET in **protobuf**, typically one file per rank (e.g. `chakra.<rank>.et`).
4. **`et_feeder`** — a C++ library that parses the `.et` files and hands the simulator **dependency-free nodes** (nodes whose deps are satisfied), then retires them and unblocks successors as the sim advances time.

Sources: [Chakra USER_GUIDE](https://github.com/mlcommons/chakra/blob/main/USER_GUIDE.md), [trace-link/merge guide](https://github.com/mlcommons/chakra/wiki/Chakra-Execution-Trace-Collection-%E2%80%90-A-Comprehensive-Guide-on-Merging-PyTorch-and-Kineto-Traces).

### 2.4 How ASTRA-sim ingests it

ASTRA-sim's **workload layer** uses `et_feeder` to walk the DAG: it pulls dependency-free nodes, and for each, routes by type — `COMP_NODE` → compute model (cycles from `num_ops` against the configured roofline), `COMM_COLL_NODE` → system+network layer (collective algorithm over the topology using `comm_type`/`comm_size`), `MEM_*` → memory-traffic cycles. As nodes complete (after their simulated cycles), their dependents become eligible. Topology, link bandwidth, and collective algorithms come from ASTRA-sim's separate system/network configs — **not** from the ET. ([ASTRA-sim workload layer](https://astra-sim.github.io/astra-sim-docs/workload-layer/overview.html); [ASTRA-sim × Chakra MICRO-2024 tutorial](https://astra-sim.github.io/tutorials/micro-2024)).

---

## 3. Where syntorch's "Chakra exporter layer" sits

```
   vLLM (unchanged serving code)
        │  calls torch.* exactly as before
        ▼
   ┌──────────────────────────────────────────────┐
   │  syntorch  (drop-in torch FRONTEND)           │  ← same API surface as torch
   │   ├─ custom kernels / HW logic (below torch)  │  ← "custom everything below"
   │   ├─ explicit tiling/partitioning strategy ids│
   │   └─ sub-torch TRACE RECORDER                 │  ← captures op stream + tensor IO + comm + strategy id
   └──────────────────────────────────────────────┘
        │  raw sub-torch trace (syntorch-native)
        ▼
   ┌──────────────────────────────────────────────┐
   │  Chakra EXPORTER LAYER  (syntorch tooling)    │  ← converts raw trace → Chakra ET (.et protobuf)
   └──────────────────────────────────────────────┘
        │  Chakra ET (per rank)
        ▼
   ASTRA-sim (+ SST)   ── via et_feeder ──►  cycles/metrics
```

The exporter layer is the syntorch-owned analogue of `chakra_trace_link` + `chakra_converter`: it maps syntorch's native op records onto the Chakra `NodeType` taxonomy and attribute names, so ASTRA-sim's existing feeder ingests them unchanged. Critically, because syntorch *also* knows the chosen tiling/partitioning and the custom HW structure (Canvas 3), the exporter can populate compute `num_ops`, memory `tensor_size`, and collective `comm_size` from **first principles / synthetic execution** rather than from a measured GPU run — which is exactly the "synthetic execution axis" of the SOURCE-BRIEF. The same op records also carry the extra L1/L2 annotations that do not fit the proto; those flow into the IR via a side channel, keyed by op id, not through the `.et` file.

> `TODO(open-question: does syntorch emit standard Chakra .et protobuf directly, or a syntorch-native trace that a separate exporter converts? "exporter layer" implies the latter; confirm the boundary in ADR-0005 so the workbench reads a stable artifact.)`
> `TODO(open-question: per-rank file convention and whether syntorch encodes process groups/topology hints the way PyTorch-distributed ET does.)`

---

## 4. The real-measurement axis: OTel trace shape

The real-measurement axis ([SOURCE-BRIEF §8](../_meta/SOURCE-BRIEF.md)) comes from real serving infra as **OpenTelemetry** traces — a fundamentally different shape from Chakra. OTel is a tree of **spans** (request → sub-operations), not a fine-grained op DAG.

Each OTel span carries ([OTel traces spec](https://opentelemetry.io/docs/concepts/signals/traces/)): `trace_id` (16 bytes), `span_id` (8 bytes), `parent_span_id`, `name`, `span_kind` (Server/Client/Internal/Producer/Consumer), `start_time`/`end_time` (ns), `status`, `attributes` (typed k/v), and `events` (timestamped inline markers).

For LLM serving, the **GenAI semantic conventions** ([OTel GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)) standardize attributes: `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`. These give per-request *ground truth* for latency, token counts, and model identity.

### OTel vs Chakra — the normalization gap

| Aspect | OTel (real) | Chakra ET (synthetic/sim) |
|---|---|---|
| Granularity | request / phase spans (coarse) | per-op DAG (fine) |
| Time | real wall-clock ns | sim cycles, or measured µs if Kineto-linked |
| Structure | span tree (parent_span_id) | DAG (data_deps + ctrl_deps) |
| Memory/comm bytes | not native (must derive/instrument) | explicit (`tensor_size`, `comm_size`) |
| Strength | trust anchor / validation | what-if for unbuilt HW |

OTel cannot be feed *into* ASTRA-sim; instead it is the **trust-ladder anchor** (SOURCE-BRIEF §1): a syntorch/Chakra projection of the same workload must reconcile against OTel-measured latency/tokens on real hardware (e.g. A100). The normalization step therefore aligns axes at the **agent-turn / request level** (Canvas 1's unit) — mapping OTel spans and the Chakra-derived op graph to the *same workload identity* so metrics are comparable, even though their internal granularity differs.

---

## 5. Stage-by-stage pipeline and the data each stage carries

```
[CAPTURE] ─► [NORMALIZE] ─► [CHAKRA ET] ─► [ASTRA-sim (+SST)] ─► [METRICS] ─► [L0 IR fill]
   ▲ syntorch     ▲ workbench     ▲ exporter      ▲ feeder            ▲              ▲
   └ OTel (real)  └ align by workload identity (agent turn / request)
```

| Stage | Input | Transform | Output (data carried) |
|---|---|---|---|
| **1. Capture (synthetic)** | vLLM run with syntorch frontend | sub-torch op recorder below the drop-in frontend | raw op stream: op id, name, op-class, tensor IO (shape/dtype→bytes), data/ctrl deps, comm type+size, tiling/partition **strategy id** |
| **1'. Capture (real)** | real serving infra | OTel SDK / GenAI instrumentation | span tree: trace/span/parent ids, timing(ns), `gen_ai.*` attrs, latency, tokens |
| **2. Normalize** | raw op stream + OTel spans | bind both to one **workload identity** (= one agent turn / request, Canvas 1); unit-normalize bytes/time; assign stable op ids | a canonical op-graph (synthetic) + a measured request profile (real), keyed to the same `WorkloadModel` |
| **3. Chakra ET export** | normalized synthetic op-graph | map to `NodeType` + attr names; encode deps; write per-rank protobuf | `chakra.<rank>.et`: COMP/COMM/MEM nodes, `data_deps`/`ctrl_deps`, `num_ops`, `tensor_size`, `comm_type`/`comm_size` |
| **4. ASTRA-sim (+SST)** | `.et` files + system/network/memory configs | `et_feeder` issues dependency-free nodes; compute/network/memory models advance cycles; SST for detailed memory/network | per-node and aggregate cycles, latency, comm time, bandwidth/occupancy, capacity peaks |
| **5. Metrics → IR** | sim metrics + OTel measured profile + captured tensor/strategy data | reconcile axes; annotate memory | rows of `Metric`/`ResultSet`; **memory-annotated L0 IR** populated |

### How all axes normalize into the memory-annotated L0 IR

L0 is defined (SOURCE-BRIEF §1) as **op-level graph + tensor size/lifetime → capacity peak + rough traffic**. That is almost exactly the Chakra ET content plus tensor *lifetime*:

- **Graph topology** → `TensorNode`s (one per op output tensor / op) and `DataMovementEdge`s come directly from Chakra `data_deps`/`ctrl_deps`.
- **Tensor size** → from captured `inputs`/`outputs` shape×dtype (= `tensor_size`).
- **Tensor lifetime** → derived by walking the DAG: first-write to last-read span across the op ordering. (Chakra does not store lifetime; the workbench computes it from the dependency graph — this is the "annotation" L0 adds beyond raw ET.)
- **Capacity peak** → max concurrent live-tensor bytes over the schedule.
- **Rough traffic** → sum of `comm_size` (collectives/P2P) + `MEM_*` movement.

The three axes converge on this single schema:
- **Synthetic (syntorch→Chakra)** fills L0 structurally and is the *primary* L0 source (it has explicit bytes + strategy ids).
- **Simulation (ASTRA-sim)** fills the *timing/contention* fields of the same nodes (turns "rough traffic" into cycle-accurate traffic; enables L1 movement bytes once memory-tier configs are attached).
- **Real (OTel)** does not populate per-op L0 nodes; it attaches at the workload-identity level as **validation evidence** — measured latency/tokens that the L0-derived projection must match within the trust ladder before the projection is trusted.

Because L0/L1/L2 are "the same schema at different completeness" (SOURCE-BRIEF §1), the pipeline never switches schemas: Chakra populates L0; ASTRA-sim + memory-tier configs deepen toward L1 (per-tier residency/movement); syntorch's custom kernel/tiling knowledge deepens toward L2 (tiling schedule, intra-kernel reuse) via the side-channel annotations that don't fit the Chakra proto.

---

## 6. Tradeoffs the builder must respect

| Decision | Option A | Option B | Lean |
|---|---|---|---|
| Capture altitude | `__torch_dispatch__`/custom dispatcher (fine, true bytes) | `torch.fx` static graph (cheap, but no dynamic shapes) | A — serving is dynamic; need real shapes for bytes |
| Exporter target | emit standard Chakra `.et` directly | emit syntorch-native, convert in exporter | B per SOURCE-BRIEF wording ("exporter layer"); keeps ASTRA-sim contract stable |
| L1/L2 annotations | force into Chakra `attr` | side-channel keyed by op id into IR | side-channel — don't pollute the interchange standard |
| OTel role | feed into simulator | validation anchor only | anchor only — granularity mismatch makes ingestion meaningless |
| Reuse public toolchain | fork `chakra_converter`/`et_feeder` | write syntorch-only exporter from scratch | reuse `et_feeder`/proto (ASTRA-sim already speaks it); only the *front* (capture+export) is syntorch-specific |

---

## Open Questions

(Mirror into [`08-research-plan/open-questions.md`](../08-research-plan/open-questions.md).)

1. At what altitude does syntorch capture — `__torch_dispatch__`, a custom dispatcher below it, or its own recorder? Determines exporter contract.
2. Does syntorch emit standard Chakra `.et` protobuf directly, or a native trace + separate exporter? The brief says "exporter layer" (implies the latter) — confirm the stable artifact boundary for the workbench.
3. Per-rank file/process-group convention for syntorch ET, and whether topology hints are encoded the way PyTorch-distributed ET does.
4. How are tensor **lifetimes** computed for L0 — purely from DAG dependency walk, or does syntorch emit allocation/free events directly?
5. Which Chakra schema version / `et_def.proto` revision is the integration target (the schema is still evolving under MLCommons)? Pin it in ADR-0005.
6. For the real axis, do we instrument vLLM with OTel GenAI semantic conventions out-of-the-box, or is custom span instrumentation needed to get per-phase (prefill/decode) granularity?
7. Where does SST attach relative to ASTRA-sim for memory-tier detail (L1 movement bytes), and what config carries memory hierarchy from Canvas 3?

## Implications for runbooks

- **RB(phase: trace pipeline)** — implement the capture→export→feeder→ASTRA-sim toolchain: install/pin Chakra schema, stand up `et_feeder` + a reference `chakra.<rank>.et` round-trip into ASTRA-sim before any syntorch wiring (proves the contract).
- **RB(phase: syntorch integration)** — wire the syntorch drop-in frontend into a vLLM run and emit a raw sub-torch trace; build the Chakra exporter layer mapping syntorch records → `NodeType`/attrs.
- **RB(phase: IR fill)** — implement Chakra-ET → L0 IR loader (`TensorNode`/`DataMovementEdge`), tensor-lifetime computation, capacity-peak + traffic rollups; attach ASTRA-sim metrics and OTel validation evidence to the same `WorkloadModel`.
- **RB(phase: real axis)** — OTel GenAI instrumentation of the real-measurement path and the workload-identity alignment used for the trust ladder.
- All of the above are gated by [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md) (integration boundaries) and feed [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema.md).

## Sources

- [MLCommons Chakra repo](https://github.com/mlcommons/chakra) and [USER_GUIDE](https://github.com/mlcommons/chakra/blob/main/USER_GUIDE.md)
- [Chakra ET collection: merging PyTorch + Kineto](https://github.com/mlcommons/chakra/wiki/Chakra-Execution-Trace-Collection-%E2%80%90-A-Comprehensive-Guide-on-Merging-PyTorch-and-Kineto-Traces)
- [Chakra paper (arXiv:2305.14516)](https://arxiv.org/pdf/2305.14516)
- [ASTRA-sim workload layer](https://astra-sim.github.io/astra-sim-docs/workload-layer/overview.html), [ASTRA-sim × Chakra MICRO-2024](https://astra-sim.github.io/tutorials/micro-2024)
- [What and Why is `__torch_dispatch__`](https://dev-discuss.pytorch.org/t/what-and-why-is-torch-dispatch/557), [TorchDispatchMode](https://dev-discuss.pytorch.org/t/torchdispatchmode-for-debugging-testing-and-more/717), [DebugMode tutorial](https://docs.pytorch.org/tutorials/recipes/debug_mode_tutorial.html)
- [OTel traces](https://opentelemetry.io/docs/concepts/signals/traces/), [OTel GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)

# Serving & Simulation Frameworks

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-layer-options](./data-layer-options.md), [ADR-0005 trace pipeline](../01-decisions/ADR-0005-trace-pipeline.md), [L0 IR schema](../05-caw01-simulation-control-plane/l0-ir-schema.md), [open questions](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This document researches and compares the four public/owned building blocks named in the
SOURCE-BRIEF pipeline — **vLLM**, **LLMServingSim**, **ASTRA-sim (+SST)**, and **Chakra ET** —
plus the internal **syntorch** package, and decides **how they compose** to feed the three
evidence axes (real OTel / synthetic syntorch→Chakra / sim LLMServingSim+ASTRA-sim) into a
single memory-annotated **L0 IR**.

It decides: (a) which tool models which layer and what each consumes/produces, (b) a recommended
composition for the **first vertical slice**, and (c) the **integration-boundary contracts** the
trace pipeline runbooks must implement. It does **not** specify the IR schema itself (that is
[L0 IR schema](../05-caw01-simulation-control-plane/l0-ir-schema.md)), the storage stack
([data-layer-options](./data-layer-options.md)), or final pipeline wiring (that is
[ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)); it provides the evidence those decisions rest on.

---

## 1. Why these four (and where syntorch fits)

The pipeline `input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+SST)` spans four
abstraction layers, and each public tool owns exactly one:

- **Request / serving dynamics** — who is in the batch, when, with what KV-cache footprint → **vLLM** (real serving) and **LLMServingSim** (simulated serving).
- **Per-operator execution below the torch frontend** — kernels, tiling, partitioning, tensor sizes/lifetimes → **syntorch** (owned; replaces vLLM's torch layer).
- **Distributed system timing** — collective communication, compute, network → **ASTRA-sim**.
- **Interchange format** — a graph of operators + dependencies that ASTRA-sim consumes → **Chakra ET**.

The key structural fact: vLLM and LLMServingSim are *siblings* (one real, one simulated) at the
serving layer; syntorch is the *thing that sits under vLLM's torch frontend*; Chakra is the *wire
format* between syntorch/LLMServingSim and ASTRA-sim. They are not alternatives to each other —
they stack.

---

## 2. vLLM

**What it is.** A high-throughput LLM inference/serving engine. Two architectural ideas dominate:

- **PagedAttention** — the KV cache is managed in fixed-size *blocks* (paged), so memory is
  allocated just-in-time per decode step rather than reserving the full max-sequence-length up
  front. This is the memory-management half. ([PagedAttention paper](https://arxiv.org/pdf/2309.06180))
- **Continuous (iteration-level) batching** — a centralized **scheduler** decides, at each
  forward-pass iteration, which requests advance; new requests join and finished ones leave
  between iterations, keeping the GPU saturated. In the **V1 engine**, prefill and decode can be
  mixed in the same step (chunked prefill built into the scheduler). ([vLLM anatomy](https://www.aleksagordic.com/blog/vllm))

**The layered execution path (this is the integration surface).** vLLM delegates:
`Engine/Scheduler → Executor → Worker → ModelRunner → model.forward()`. The **ModelRunner**
prepares input tensors (`input_ids`, `positions`, KV blocks), invokes the model's forward pass,
and runs sampling. The forward pass runs `nn.Module` layers plus vLLM's custom attention/
collective/activation ops, optionally captured as CUDA graphs and compiled via `torch.compile`.
([Worker/Executor architecture](https://deepwiki.com/vllm-project/vllm/4.2-worker-and-executor-architecture))

**The torch layer syntorch replaces.** Everything from `model.forward()` downward — the
`nn.Module` call chain, attention/GEMM/collective kernels, and the device runtime — is the
"below-torch" surface. Per the SOURCE-BRIEF §7, **syntorch is a drop-in torch frontend**: you
install syntorch *instead of* torch inside vLLM, vLLM's ModelRunner calls the same API, and all
sub-torch execution is captured by syntorch instead of dispatched to a real GPU.

**Our use.** vLLM is the **reference / real-serving** implementation. Two roles:
1. Source of *real measurement* when run normally on real hardware (instrumented with OTel at the
   serving layer — request latencies, batch composition, KV occupancy).
2. The **host** into which syntorch is injected to capture synthetic sub-torch traces, because
   syntorch is defined relative to "vLLM's torch layer". The serving-loop semantics (scheduler,
   batching) we model in Canvas 1/L0 should match vLLM's so simulated and real axes are comparable.

> Integration risk: vLLM internals (scheduler, ModelRunner signatures, V1 vs V0) move fast. We
> depend on the *torch frontend contract*, not on a pinned vLLM internal. Pin a vLLM version in
> the trace-pipeline runbook and treat upgrades as explicit work.

---

## 3. LLMServingSim

**What it is.** A simulation infrastructure for LLM *inference serving* — it models the
**request level** of a serving system: a request queue, the scheduler/batching policy,
prefill/decode phases, KV-cache growth, and (in 2.0) prefill–decode disaggregation, memory
disaggregation, MoE, multi-tier prefix caching, and a power/energy model. It is from KAIST CASYS
(ISPASS 2026 for 2.0). ([LLMServingSim 2.0](https://arxiv.org/html/2602.23036),
[GitHub](https://github.com/casys-kaist/LLMServingSim))

**Crucially: it is built on a modified ASTRA-sim + Chakra.** LLMServingSim handles the
request/serving dynamics and *emits per-iteration execution graphs as Chakra*, which its embedded
ASTRA-sim consumes to return timing/memory back to the scheduler. So LLMServingSim is not a peer
of ASTRA-sim — it is a **serving-aware front-end that drives ASTRA-sim**, closing the loop where
serving decisions (batch composition) change the operator graph each iteration.

- **Inputs:** a request trace (arrival times, input/output lengths), a model description, a
  hardware/cluster config, a scheduling/parallelism policy.
- **Outputs:** request-level metrics (latency/throughput/TTFT/TBT), memory occupancy, energy, and
  the underlying Chakra graphs + ASTRA-sim timing.

**Where it sits relative to vLLM and ASTRA-sim.** It is the **simulated twin of vLLM's serving
loop** (same conceptual role — scheduler + batching + KV management — but predicted, not
executed) and the **driver of ASTRA-sim** (it generates the workload ASTRA-sim times).

**Our use.** It is the engine of the **simulation axis** and the model for the **input feeder →
serving loop** stage of Canvas 1. Its scheduler/batching semantics are also the reference for how
we model an agent-turn in L0. **Open design tension:** the SOURCE-BRIEF flow puts
`LLMServingSim -> syntorch -> ASTRA-sim`, but LLMServingSim *already embeds* ASTRA-sim. We must
decide whether syntorch *replaces LLMServingSim's per-op cost model* (feeding richer below-torch
op graphs into the same ASTRA-sim) or whether we run a syntorch path in parallel. See Open Questions.

---

## 4. ASTRA-sim (+ SST)

**What it is.** A distributed-ML *system* simulator with a **layered architecture**:

- **Workload layer** — the DNN model, parallelization strategy, training/inference loop; in 2.0+
  this is driven by **Chakra ET** so arbitrary workloads are supported.
- **System layer** — collective communication algorithms (all-reduce, all-to-all, etc.),
  scheduling of compute vs. communication, and compute/communication **overlap**.
- **Compute model** — analytical or a roofline/SCALE-sim-style estimate for operator compute time.
- **Network backend (pluggable, multi-fidelity):**
  - **Analytical / "Simple"** (β-model, Hockney) — fast, low fidelity; huge speedups (cited
    ~756× over Garnet) for large NPU counts.
  - **Garnet** (gem5) — cycle-level NoC.
  - **ns-3** — packet-level, models RDMA traffic.
  - **SST (Merlin)** — the Structural Simulation Toolkit network backend for scale-out runs.
  ([ASTRA-sim docs](https://astra-sim.github.io/astra-sim-docs/index.html),
  [MICRO 2024 tutorial](https://astra-sim.github.io/tutorials/micro-2024))

**SST relationship.** SST is **one selectable network backend** (via SST-Merlin), not a wrapper
around ASTRA-sim. ASTRA-sim schedules Chakra operators over a *plug-and-play* compute+network
pair; SST is the high-fidelity scale-out option, analytical is the fast default. Our Canvas 3
hardware design ultimately parameterizes whichever backend is chosen.

**Our use.** The **timing/cost engine** for both the synthetic and simulation axes. It turns an
operator graph + a hardware topology (from Canvas 3) into compute/comm/network time and traffic.
Backend choice is a **fidelity vs. speed dial** the control plane exposes (analytical for fast
sweeps, ns-3/SST for high-fidelity validation).

---

## 5. Chakra (MLCommons Execution Trace / ET)

**What it is.** A community standard (MLCommons) for representing a distributed ML workload as a
**graph**: vertices = operators, edges = dependencies. It is the **interchange format** ASTRA-sim
consumes, and is also consumed by other simulators (e.g. SST) and proprietary tools.
([Chakra paper](https://arxiv.org/pdf/2305.14516))

**Role in our pipeline.** Chakra is the **single waist** of the trace pipeline. Per SOURCE-BRIEF
§7.4, syntorch has a **Chakra exporter layer** that converts captured sub-torch traces to Chakra;
LLMServingSim emits Chakra per iteration. So Chakra is where the **synthetic axis** and the
**simulation axis** physically meet, and the natural place to attach our memory annotations before
lowering into L0.

**Important boundary distinction.** Chakra ET is **timing/structure-oriented** (op + dependency +
duration). Our **L0 IR** additionally needs **tensor size/lifetime** for capacity-peak and traffic
estimation (SOURCE-BRIEF §1). Chakra carries enough operator structure but is not by itself a
memory-annotated IR — the **Chakra→L0 lowering** step is where tensor sizes/lifetimes get attached
(from syntorch's knowledge of kernels/tiling, or estimated for the OTel/serving path). This is a
real engineering boundary, not a passthrough.

---

## 6. syntorch (owned — only what the brief states)

Per SOURCE-BRIEF §7, syntorch is a Python package that: (1) is a **drop-in torch frontend** usable
identically to vLLM's torch layer; (2) has **custom kernels/HW logic below torch**, with
**partitioning/tiling as explicit code/strategy ids**; (3) is **installed instead of torch inside
vLLM** to capture all below-torch traces; (4) has a **Chakra exporter**; (5) includes/relates to a
**HW design layer** (chip→die→package→tray→rack→cluster) that Canvas 3 visualizes.

What this means for composition: syntorch is the **synthetic execution engine** — it produces an
operator/kernel-level trace *with* the tensor and tiling information that ASTRA-sim's analytical
compute model lacks, and exports it to Chakra. It is the bridge that makes "unbuilt device
assumptions executable." We do **not** assume any syntorch API surface beyond the above; concrete
signatures are open questions for the trace-pipeline ADR.

---

## 7. Comparison table

| Tool | Layer it models | Input | Output | Our use |
|---|---|---|---|---|
| **vLLM** | Real serving loop (scheduler, continuous batching, paged KV) + real below-torch exec on GPU | Model weights, live/replayed requests, HW | Generated tokens; serving metrics; (with OTel) real traces | Reference serving semantics; **host for syntorch injection**; real-measurement axis |
| **LLMServingSim** | *Simulated* serving loop (request queue, batching, P/D + memory disaggregation, prefix cache) | Request trace, model desc, cluster/HW config, policy | Request-level latency/throughput/energy/memory; Chakra graphs + ASTRA-sim timing | Engine of **simulation axis**; reference for agent-turn/L0 serving model; the input-feeder→serving stage |
| **syntorch** (owned) | Everything **below the torch frontend**: kernels, tiling/partitioning, custom HW logic | Same calls vLLM's torch layer receives (forward pass) | Sub-torch op/kernel trace (tensor sizes/lifetimes, tiling ids) → **Chakra** via exporter | Engine of **synthetic axis**; makes unbuilt-device assumptions executable; feeds Canvas 3 HW design |
| **ASTRA-sim (+SST)** | Distributed system timing: collective comm, compute, network (analytical/Garnet/ns-3/SST) | **Chakra ET** + system/network/HW config | Per-op + end-to-end compute/comm/network time, traffic, overlap | **Timing/cost engine** for synthetic & sim axes; fidelity dial (analytical→SST) |
| **Chakra ET** | Workload-as-graph interchange (operators + dependencies, durations) | Produced by syntorch exporter / LLMServingSim | Standard graph file | **Interchange waist**; meeting point of synthetic+sim axes; lowered into L0 (with tensor annotations added) |
| **OTel** (context) | Real serving observability (spans/metrics) | Live instrumented infra | Distributed traces/metrics | **Real-measurement axis**; validation ground truth in the trust ladder |

---

## 8. Recommended composition for the first vertical slice

**Goal of the slice:** prove the *workflow semantics* (SOURCE-BRIEF §11: small vertical slices over
broad scaffolding) — that two different evidence axes can be normalized into the **same L0 IR** and
compared. Not a full simulator integration.

**Recommendation: a "ServingSim-style + syntorch-style into one L0 IR" slice.**

1. **One workload** = one agent turn for one small LLM model (Canvas 1), expressed as a request the
   serving loop consumes (prefill length + decode length).
2. **Axis A — simulation:** run that request through **LLMServingSim** with a minimal cluster
   config; let its embedded ASTRA-sim produce timing; capture the emitted **Chakra** graph + metrics.
3. **Axis B — synthetic:** run the *same* model forward path with **syntorch as the torch frontend
   under a vLLM-shaped harness**, capture the sub-torch trace, export to **Chakra**.
4. **Common lowering:** write a **Chakra → L0 IR** lowering that both axes feed, attaching tensor
   size/lifetime to produce L0 (op-level graph + capacity peak + rough traffic). Two Chakra inputs,
   one L0 schema, one comparison.
5. **Compare:** show the two L0 IRs side by side as one reproducible experiment row
   `(workload, hw config, sim config) -> trace -> metric -> DB row`.

**Why this composition first:**
- It exercises the **Chakra waist** twice (sim + synthetic), which is the single most important
  contract to de-risk early.
- It defers the hardest, most volatile integration (installing syntorch *inside* a live vLLM and
  the full `LLMServingSim -> syntorch -> ASTRA-sim` rewiring) to a later slice. The first slice can
  run syntorch under a **thin vLLM-shaped harness** (ModelRunner-like caller) rather than full vLLM.
- It makes the **trust ladder** concrete from day one: even before real OTel, two independent axes
  must agree on op structure in L0, surfacing divergences early.

**Explicitly out of the first slice:** real OTel axis (axis C) wiring, ns-3/SST high-fidelity
backends (use ASTRA-sim **analytical** backend), MoE/disaggregation, L1/L2 fill levels, and Canvas 3
HW-hierarchy editing beyond a single fixed cluster config.

---

## 9. Integration-boundary notes (contracts the runbooks must implement)

| Boundary | Contract | Risk / note |
|---|---|---|
| **vLLM ↔ syntorch** | syntorch is `import`-compatible with the torch API vLLM's ModelRunner uses; install syntorch instead of torch. | Depends on vLLM-version-specific torch usage. **Pin vLLM**; treat the torch-frontend surface (not vLLM internals) as the contract. First slice may use a thin harness instead of full vLLM. |
| **syntorch → Chakra** | syntorch exporter emits valid Chakra ET (operators + deps), plus a **side-channel of tensor size/lifetime + tiling/strategy ids** for L0. | Chakra alone is timing-oriented; tensor/lifetime info must ride alongside (extension fields or sidecar). Validate against Chakra schema version. |
| **LLMServingSim → Chakra/ASTRA-sim** | Consume its emitted Chakra + metrics; do not re-implement its scheduler. It already embeds a modified ASTRA-sim. | The brief's `LLMServingSim -> syntorch -> ASTRA-sim` ordering conflicts with LLMServingSim already owning ASTRA-sim. Decide: syntorch replaces its **op cost model**, or parallel paths. **Open question.** |
| **Chakra → ASTRA-sim** | Standard ASTRA-sim Chakra consumption; select network backend (analytical first). | Backend = fidelity/speed dial exposed by control plane. Pin Chakra/ASTRA-sim versions together. |
| **Chakra → L0 IR** | A lowering pass: operators+deps → TensorNode/DataMovementEdge; attach size/lifetime → capacity peak + rough traffic. Same schema, fill level L0. | This is the **normalization point** for all axes. Owned by us; the real semantic work of the slice. |
| **Real infra → OTel → L0** | (Later) serving-layer spans/metrics lowered into the same L0 schema (coarser; serving granularity, not sub-torch). | OTel gives serving-level truth, not op-level tensors; L0 from OTel is partial — record as a deliberate fill-level gap, not a bug. |
| **ASTRA-sim ↔ SST/ns-3** | SST-Merlin / ns-3 are alternate network backends, build-time/config selectable. | Heavy build deps; keep behind the fidelity dial; not in first slice. |
| **Canvas 3 HW design → ASTRA-sim system/network config** | chip→…→cluster hierarchy lowered to ASTRA-sim system+network config (and syntorch HW logic). | Two consumers of one HW model (syntorch kernels + ASTRA-sim topology) must stay consistent. |

---

## 10. How the three evidence axes compose

| Axis | Path | Engine(s) | Granularity into L0 | Trust-ladder role |
|---|---|---|---|---|
| **Real measurement** | real infra → **OTel** | live vLLM/service | Serving-level (requests, batches, KV occupancy); op-level only if profiled | **Ground truth** — what syntorch traces are validated against |
| **Synthetic execution** | vLLM(torch→**syntorch**) → sub-torch trace → **Chakra** | syntorch (+ ASTRA-sim for timing) | Op/kernel-level with tensor size/lifetime + tiling ids → richest L0 | Must be validated against A100/OTel evidence before trusted |
| **Simulation** | input feeder → **LLMServingSim** → (syntorch) → **ASTRA-sim (+SST)** | LLMServingSim + ASTRA-sim | Op-level from emitted Chakra; serving dynamics modeled, not measured | Projection/what-if; credibility inherited from how well sim matches synthetic+real |

All three normalize into the **same memory-annotated IR at fill level L0** (op-level graph + tensor
size/lifetime → capacity peak + rough traffic), enabling **comparable projection**. The control
plane's job is to make these axes composable, runnable, inspectable, and preservable as evidence.

---

## Open Questions

- **(OQ) LLMServingSim already embeds ASTRA-sim** — the brief's `LLMServingSim -> syntorch -> ASTRA-sim` chain implies syntorch sits *between* them. Does syntorch **replace LLMServingSim's per-op cost model** (richer below-torch graphs into the same ASTRA-sim), or do we run a parallel syntorch path? Resolve in [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md).
- **(OQ) syntorch ↔ vLLM version contract** — exactly which torch API surface must syntorch satisfy, and which vLLM version (V0 vs V1 engine) do we pin? `TODO(open-question: confirm vLLM target + torch frontend surface)`.
- **(OQ) Chakra carrying tensor size/lifetime** — does Chakra ET (current schema version) have fields for tensor footprint/lifetime, or do we need an extension/sidecar for L0? `TODO(open-question: Chakra schema version + memory annotation extension)`.
- **(OQ) LLMServingSim 1.x vs 2.0** — 2.0 adds MoE/disaggregation/power but is heavier; which do we integrate first? Likely 1.x-equivalent minimal path for the slice.
- **(OQ) syntorch Chakra exporter fidelity** — does it emit the same Chakra dialect ASTRA-sim consumes directly, or is a translation needed? `TODO(open-question: confirm syntorch exporter target dialect)`.
- **(OQ) OTel → L0 fill level** — how much op-level structure can the real axis realistically provide, and how do we represent that as a deliberate fill-level gap rather than missing data?
- **(OQ) Network backend default** — analytical for the slice is assumed; when do ns-3/SST become required for credibility?

(Mirror these into [08-research-plan/open-questions.md](../08-research-plan/open-questions.md).)

## Implications for runbooks

- Drives **phase-4-trace-pipeline** runbooks: a `RB-4xx` for the **Chakra → L0 lowering** (the normalization waist), a `RB-4xx` for the **syntorch capture + Chakra export** harness (thin vLLM-shaped caller first), and a `RB-4xx` for **LLMServingSim → Chakra ingestion**.
- Drives **phase-3-simulation-engine** runbooks: ASTRA-sim invocation with the **analytical backend** as the default fidelity tier, with ns-3/SST behind a config flag.
- Pins versions: every trace-pipeline runbook must declare pinned **vLLM**, **LLMServingSim**, **ASTRA-sim**, and **Chakra schema** versions in its Preconditions.
- Feeds [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md) (trace pipeline boundaries) and references [L0 IR schema](../05-caw01-simulation-control-plane/l0-ir-schema.md) for the lowering target.

## Sources

- vLLM PagedAttention paper — https://arxiv.org/pdf/2309.06180
- Inside vLLM (anatomy) — https://www.aleksagordic.com/blog/vllm
- vLLM Worker/Executor architecture — https://deepwiki.com/vllm-project/vllm/4.2-worker-and-executor-architecture
- LLMServingSim 2.0 — https://arxiv.org/html/2602.23036 ; repo https://github.com/casys-kaist/LLMServingSim
- LLMServingSim (original) — https://arxiv.org/pdf/2408.05499
- ASTRA-sim docs — https://astra-sim.github.io/astra-sim-docs/index.html ; MICRO 2024 tutorial https://astra-sim.github.io/tutorials/micro-2024
- Chakra paper — https://arxiv.org/pdf/2305.14516

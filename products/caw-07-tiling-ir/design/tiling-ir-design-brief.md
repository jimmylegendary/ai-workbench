# CAW-07 Tiling IR — design brief (prior-art-grounded)

- **Status:** exploration (no code yet) · **Owner:** Jimmy · **Date:** 2026-07
- **Method:** deep prior-art sweep (10 subfields, 87 unique projects, top-9 adversarially
  verified) + a 3-way design panel + synthesis. Sources are the academic accelerator-mapping,
  tensor-compiler, MLIR, polyhedral, spatial-HLS, distributed-parallelism, and torch-runtime
  literatures.
- **Seed:** CAW-01 [ADR-0009](../../caw-01-simulation-control-plane/design/01-decisions/ADR-0009-abstracted-tiling-ir.md)
  (repetition-folding, exploration-grade), [ADR-0005 trace pipeline](../../caw-01-simulation-control-plane/design/01-decisions/ADR-0005-trace-pipeline.md)
  (syntorch → Chakra → ASTRA-sim; L1/L2 op-id side-channel), and the CAW-01 HW twin
  (`packages/core/src/schemas/hardware.ts`: tray/package/die/component + memory tiers).

## 0. The goal (the user's vision)

Let a user, in the **CAW-01 control plane**, (1) design a **novel accelerator** (GPU-like OR
NPU-like) as a tray/package/die/component + memory-tier twin, (2) conceive a **new parallelism
+ tiling** algorithm for it, (3) **express** it, and (4) **simulate** end-to-end via
**vLLM + syntorch + the HW model** (compute/memory) with **ASTRA-sim** for the network.
The IR must work for HW that has **no compiler/codegen** (novel), be **exploration-grade**
(accuracy by *repetition-folding*: cost the repeated tile-unit exactly × repetition count,
remainders explicit — not instruction-level unroll, not a real compiler), and **attach to
syntorch** (a drop-in torch-frontend package inside vLLM).

## 1. Landscape — two mature worlds, two uncrossed gaps

The goal sits at the intersection of two mature-but-disjoint worlds:

- **World A — Accelerator MAPPING & analytical DSE** (the Timeloop lineage): Timeloop/Accelergy,
  ZigZag/Stream, MAESTRO, LoopTree, TeAAL/FuseMax, Ruby, CoSA/GAMMA. **This family already does
  the core of our goal, offline:** describe an arbitrary accelerator declaratively (compute
  leaves + arbitrary memory-tier tree/graph + fanout), express a **mapping = loop-nest** (tile
  factors + loop order = *tiling*; spatial fanout = *parallelism*), and cost it **purely
  analytically, no codegen**. Their accuracy trick **IS our repetition-folding** (cost one
  tile-unit × per-level iteration counts; Ruby/LoopTree/ZigZag make remainders explicit).
  → **This is the family to fork.**
- **World B — Torch-frontend runtime capture & distributed parallelism**: `__torch_dispatch__`/
  `TorchDispatchMode`, `torch.compile`/Dynamo/FX, `FakeTensorMode`/`FlopCounterMode`, DTensor/
  DeviceMesh, GSPMD/Shardy/Alpa/PartIR. **Solves runtime attachment inside vLLM** and gives a
  battle-tested **parallelism vocabulary** (named mesh + Shard/Replicate/Partial + propagation)
  — but has **no analytical HW/tiling cost** and **no intra-device memory-tier model** (stops at
  the device mesh).
- **In between** (Halide, Exo, TVM TensorIR, MLIR transform/linalg/DLTI, Pallas, TileLang,
  Triton, isl/AutoSA/PPCG/Tiramisu, Spatial, Allo, ScaleHLS): own the **richest tiling/parallelism
  expression**, but their cost is **codegen-then-measure** — exactly what our novel-HW-no-compiler
  constraint forbids. (Analytical exceptions: Spatial, AutoSA, FlexFlow/Unity, Halide's Mullapudi
  autoscheduler.)

**Two tiers NOBODY has crossed — this is CAW-07's defining contribution:**
1. Nobody bridges World A's **analytical mapping cost** to World B's **torch runtime**.
2. Nobody spans **intra-device memory-tier tiling ↔ inter-device mesh parallelism ↔ inter-node
   network** in *one* IR (ASTRA-sim owns only the last).

> **CAW-07 = World A's IR + cost engine × World B's runtime-attach + parallelism × LLM-serving-in-
> the-loop × ASTRA-sim network tier.**

## 2. Direct precedents (closest published work)

| Project | Why close | Key gap for us |
|---|---|---|
| **TeAAL** (+ FuseMax/HiFiber/fibertree, MIT/UIUC/NVIDIA) | Closest IR *shape*: accelerator = cascade of **mapped Einsums** with clean **algorithm / mapping / format / binding** separation; tiling = rank partitioning (`uniform_shape` fixed-tile+remainder, `uniform_occupancy` capacity-driven); parallelism = **spacetime** (space=parallel PE, time=serial); arbitrary HW = Timeloop arch-tree + binding. Fusion across Einsums = transformer attention/MLP. | **Caveat (verified):** its "analytical" action-counts come from **data-dependent fibertree execution over real tensors** — needs input tensors, scales with problem size. We must **replace the trace-driven core with tensor-free repetition-folding**. No torch attach; NPU/sparse-centric; no network/serving. |
| **Timeloop + Accelergy v4** (+ Ruby, LoopTree, Sparseloop; MIT/NVlabs) | Canonical arbitrary-HW analytical infra; **best structural base**. HW = YAML tree of storage/compute/network nodes with depth/width/bandwidth/meshX/meshY — **exactly our tray/package/die + memory-tier abstraction**. Mapping = annotated loop-nest (temporal `for` = tiling, spatial `parallel_for` = parallelism). Deterministic closed-form cost; **Accelergy plug-in estimators cost NOVEL components with no datasheet**; Ruby = explicit remainders. | Offline only (no torch hook); GPU **structure** fits but GPU **dynamics** (SIMT/warp/occupancy/coalescing/cache) don't; single-einsum default (fusion bolt-on); on-chip network only; C++/ISL core. |
| **ZigZag (+ Stream)**, KU Leuven | **Cleanest pure-Python, pip-installable analytical cost engine** — easiest to embed behind syntorch. HW = operational array + **memory-hierarchy graph** (capacity/bandwidth/ports + `served_dimensions`). Mapping = `spatial_mapping` (parallelism) + `temporal_ordering` (tiling) + `memory_operand_links`. Equation notation (`O[b][k]+=W[k][c]*I[b][c]`) **= our einsum fallback**; even/uneven tiling = remainders. | No torch attach (ONNX/YAML batch); GPU SIMT absent; shallow compute hierarchy; no ASTRA-sim; folding implicit not first-class. |
| **MAESTRO**, Georgia Tech/NVIDIA | Best **compact einsum-like surface** (`TemporalMap`/`SpatialMap`/`Cluster`) **+ a proven repetition-folding algorithm** (cost each distinct tile/edge case once × occurrence, recurse per cluster, <20 edge cases, ~96% vs RTL, ~10 ms). | Fixed 2-tier PE template (not arbitrary hierarchy); no GPU model; fixed CONV/GEMM dim vocab. **Borrow the directive IR + folding algorithm**, not the tool. |
| **LoopTree**, MIT EEMS | Timeloop-family, closest to **transformer fusion**; cleanest node taxonomy (**storage / temporal(rank,tile) / spatial / pipeline\|sequential / compute** ≈ our IR) + **ISL exact remainder counting**; PyTimeloop callable. | No torch attach; GPU dynamics unmodeled; on-chip only; models a given mapping (needs a mapper); C++/ISL. |
| **`__torch_dispatch__` / TorchDispatchMode** (+ FakeTensorMode, FlopCounterMode) | The **runtime-attach answer**: a mode intercepts every aten op in pure Python with full shapes, **works unchanged in vLLM eager, no syntorch source edits**. FlopCounterMode proves the pattern (op→analytic-cost registry, no execution); FakeTensor = shapes without compute. DTensor is built on it. | Pure substrate (no HW/tiling/folding — we build that on top). Sees **decomposed** aten (must re-fuse to einsum intent). Trace-driven (needs a forward pass). |
| **DTensor / DeviceMesh** (+ Shardy/GSPMD/Alpa as notation) | The **parallelism-annotation** half at torch runtime: n-D named mesh + per-tensor Shard/Replicate/Partial + propagation, via `__torch_dispatch__`. | **Device-level only** — no intra-device memory tiers; executes real collectives (no analytical cost). Borrow the placement algebra + dispatch pattern. |
| **FlexFlow / Unity**, CMU/Stanford | Closest **analytical, no-codegen** skeleton for the **inter-device** tier: device-topology graph (bandwidth/latency edges) + task-graph **execution simulator** predicts runtime without executing (~3 orders faster). | Device-granular (no memory tiers); own Legion runtime; no explicit remainders. Borrow the topology-graph + analytical simulator for the parallelism/network core. |

## 3. Standing on shoulders — what CAW-07 borrows, and as what

| Foundation | Use it as |
|---|---|
| **TeAAL** (algorithm/mapping/format/binding; partitioning; spacetime) | The **IR shape skeleton** — Einsum-cascade workload + rank-partitioning tiling grammar + spacetime parallelism grammar. **Replace its trace-driven cost with tensor-free repetition-folding.** |
| **Timeloop + Accelergy v4** (arch-tree, mapping-loop-nest, plug-in estimators, Ruby) | The **arbitrary-HW hierarchy IR** + analytical access-count/transfer **cost engine**; Accelergy pattern to cost CAW-01's **novel components with no datasheet**; Ruby for explicit remainders. |
| **LoopTree** (ISL exact counting, PyTimeloop) | The **fused-layer mapping node taxonomy** (storage/temporal/spatial/pipeline\|sequential/compute) for attention/MLP chains + exact remainder math. |
| **ZigZag (+ Stream)**, pure-Python | The **drop-in Python analytical cost core** to embed in syntorch + a near-verbatim declarative HW-graph schema + the einsum-like equation surface. |
| **MAESTRO directives** (TemporalMap/SpatialMap/Cluster) | The **compact codegen-free user surface** for tiling+parallelism + the **repetition/edge-case folding algorithm** as the accuracy engine template. |
| **`__torch_dispatch__` + FakeTensorMode + FlopCounterMode** | The **syntorch runtime attach** + op-capture layer inside vLLM eager (op→analytic-cost registry; meta tensors for shapes-without-compute; a re-fuser to recover einsum intent from decomposed aten). |
| **DTensor DeviceMesh + Placement** (+ Shardy notation) | The **inter-device parallelism-annotation** layer, mesh axes → tray/die/GPC/PE dims. |
| **FlexFlow/Unity** topology-graph + simulator (+ Alpa α–β/ILP-DP) | The **inter-device/network analytical cost skeleton** (extend nodes with memory tiers). |
| **einops `(outer inner)` + torchdim** | The **minimal einsum-like surface** + the runtime carrier threading tile/HW-axis annotations through dispatch. |
| **isl + Barvinok (islpy)** *(optional)* | Exact parametric point-counting for provably-exact folding-with-remainders. |
| **ASTRA-sim** | The **network-tier simulator** the IR emits collective/comms traces to (defines the compute↔network boundary). |

## 4. What none of them provide — CAW-07's job to build

1. **Torch/syntorch runtime attach → analytical mapping cost** (the bridge nobody built).
2. **Consume CAW-01's novel-HW twin** as the cost target (an external twin → IR adapter).
3. **LLM-serving-in-the-loop** (vLLM): prefill/decode phases, growing KV-cache, continuous/dynamic
   batching, dynamic shapes — orchestrate per-op analytical costs over a **live serving trace**.
4. **First-class, tensor-free repetition-folding with explicit remainders** as the *surface*
   accuracy contract (TeAAL's is trace-driven; others fold implicitly).
5. **One IR spanning intra-device (memory-tier tiling) + inter-device (mesh) + inter-node
   (network → ASTRA-sim).**
6. **Optional GPU dynamic-execution overlay** (occupancy/overlap/coalescing) on top of the
   explicit-hierarchy model, since analytical tools mis-cost GPU dynamics.
7. **ASTRA-sim-consumable comms trace** emitted from the same IR; reconcile compute vs network
   timelines.
8. **Author-first** tiling/parallelism (the *user* expresses it) over a declared twin, **without
   codegen** — the exact combination no single project delivers (most either *search* the mapping
   or need codegen to measure).

## 5. The CAW-07 IR — a three-layer, torch-attached, analytically-costed IR

Adopt **one core data model** with **three authoring fronts** (not competing designs — the same
IR at three effort tiers). This is the design-panel verdict, confirmed by the landscape.

- **WORKLOAD layer** — an **Einsum-cascade / named-rank tensor-algebra DAG** (TeAAL/LoopTree/
  ZigZag-equation style), **captured from syntorch at runtime** via a `TorchDispatchMode` inside
  vLLM (`FakeTensorMode` for shapes-without-compute), with a **pattern re-fuser** lifting
  decomposed aten back to high-level ops (matmul/sdpa/norm).
- **HW layer** — a declarative hierarchy **consumed from CAW-01's twin**: an arch tree/graph of
  storage + compute + network nodes with capacity/width/bandwidth/ports/fanout (Timeloop arch-tree
  + ZigZag `served_dimensions`), spanning tray/package/die/component + reg/shared/L2/HBM (GPU-like)
  OR scratchpad/SRAM-bank/DMA (NPU-like). **GPU-like and NPU-like are just two linearizations of
  the same primitive** — only level names + symbol values differ. Novel-component costs via an
  **Accelergy-style plug-in estimator** (no datasheet). Optional **GPU dynamic overlay**.
- **MAPPING layer** — a per-op, **user-authored** annotated loop-nest / directive set fusing
  tiling + parallelism: per memory tier a temporal tile-factor + loop order (tiling) and a spatial
  fanout binding (parallelism), MAESTRO-style (`TemporalMap`/`SpatialMap`/`Cluster`) or Timeloop-
  style (temporal `for` + spatial `parallel_for`), with LoopTree pipeline/sequential nodes for
  attention/MLP fusion and DTensor-style mesh Placement for inter-device. **Remainders explicit**
  (Ruby/ZigZag imperfect factorization).
- **COST ENGINE** — purely analytical, **tensor-free repetition-folding** as the first-class
  accuracy contract: cost each unique tile-unit once × its temporal-iteration and spatial-instance
  counts, **plus explicitly enumerated remainder tiles** (MAESTRO <20-edge-case recursion or
  LoopTree ISL exact counting). Deterministic, exploration-grade, no codegen. Emits latency /
  energy / traffic per tier.
- **THREE-TIER SPAN + SERVING LOOP** — intra-device (memory-tier tiling) → inter-device (mesh
  parallelism, FlexFlow-style topology graph + Alpa α–β) → inter-node (emit a **collectives trace
  to ASTRA-sim**; reconcile timelines). Orchestrate per-op costs across a **live vLLM prefill/
  decode trace** (KV-cache growth, continuous batching) → end-to-end serving throughput/latency.

### Core object (from ADR-0009 §representation-sketch)
One HW-parameterized `AbstractTilingPlan` per Chakra op-id (both fronts lower to it; the ADR-0005
op-id side-channel carries it, never the `.et` proto). Key ideas:
- `linearize(HwTwin) → LevelStack` (outer backing store → inner compute leaf); each `Level` has
  role/capacity/bandwidth/instances/spatialAxis/matrixUnit.
- `MapEntry` per level: `tiles` (block size at this level), `mode` temporal|spatial, spatial `axis`.
- Per-operand `placement` (ZigZag uneven staging); `loopOrder`; explicit `remainders`.
- `Factor = number | (hw) => number` — **tile factors are functions of twin symbols**, so
  re-evaluating against a different twin **re-tiles automatically** (architecture exploration).
- `derived` (filled by cost model): `tileUnit` (costed once, exactly) + `foldCount` per level →
  **total = cost(tileUnit) × Π foldCount + Σ cost(remainders)** = Accelergy action-count model
  with the tile-unit as the action.

## 6. Answer to the einsum ↔ python-lib ↔ runtime-hook spectrum

The three are **layers, not a choice**:
- **Front (minimal, first): einsum++** — a pure Python `tile("m k, k n -> m n", hw=twin, tile=…,
  bind=…)` / `@tiled(...)` that parses the pattern against the twin, emits the `AbstractTilingPlan`
  sidecar, and returns the **unmodified eager tensor** (vLLM/syntorch keep running). Lowest effort,
  highest exploration fit, works on both HW families. (einops `(outer inner)` grammar.)
- **Front (rich, later): schedule/mapping library** — MAESTRO/Timeloop/LoopTree directives
  (split/tile/reorder/tensorize/stage/bind + pipeline/sequential) for multi-level, per-operand,
  fusion cases the flat einsum string can't reach. It's einsum++'s maps **promoted to first-class
  objects** — an expansion, not a rewrite.
- **Runtime hook (the "ideal"): READ-ONLY capture, NOT a compiled backend.** A `TorchDispatchMode`
  captures op-id + shapes and attaches/looks-up the plan; it **never executes kernels on the novel
  HW** (there is none). For exploration you want plans **re-costed in Python**, not kernels run.
  This is the realistic meaning of "custom at runtime."

**Recommended path: einsum++ first → grow the schedule library → runtime-hook as read-only
capture.** The genuinely hard, unavoidable work in *every* path is the same — the **tensor-free
repetition-folding cost model** and **remainder detection** — so pick the front that minimizes
time-to-first-number (einsum++).

## 7. End-to-end flow

```
CAW-01 control plane
  ├─ user designs a NOVEL HW twin (tray/package/die/component + memory tiers; GPU-like or NPU-like)
  └─ user AUTHORS a tiling + parallelism idea for an op / fused region
        │  (CAW-07 front: einsum++  →  schedule lib)
        ▼
CAW-07 tiling IR
  ├─ linearize(twin) → LevelStack ;  AbstractTilingPlan per op (mapping + placement + remainders)
  ├─ tensor-free repetition-folding cost engine → per-tier compute/traffic/footprint/kernelTime
  └─ emit: intra-device cost  +  inter-device mesh cost  +  inter-node collectives trace
        │                                                        │
        ▼ (syntorch read-only capture in vLLM: op-id + shapes)   ▼
vLLM + syntorch + HW model  ────────────────────────────────►  ASTRA-sim (network tier)
        │  live prefill/decode serving trace (KV-cache, batching)
        ▼
reconcile compute ↔ network timelines → end-to-end serving latency/throughput  → CAW-01 Sim Result
```

## 8. Phased plan

1. **Core IR + einsum++ front (S)** — `AbstractTilingPlan` data model + `linearize(twin)` +
   `tile(...)` einsum++ that emits plans. Prove it on one matmul + one attention, on a GPU-like
   AND an NPU-like twin. *First number, fast.*
2. **Tensor-free repetition-folding cost engine (the real work)** — per-tier action counts +
   explicit remainders (MAESTRO folding / optional ISL). Cross-check overlapping sub-cases against
   ZigZag/Timeloop for confidence (no silicon to validate against).
3. **syntorch runtime capture** — `TorchDispatchMode` + FakeTensor + re-fuser inside a thin
   vLLM-shaped harness; attach plans by op-id; feed the CAW-01 Chakra/ADR-0005 side-channel.
4. **Schedule/mapping library front** — directives for multi-level/fusion/per-operand.
5. **Three-tier span + serving loop** — inter-device mesh (FlexFlow-style) + ASTRA-sim comms trace
   + live vLLM prefill/decode orchestration → end-to-end serving metrics.
6. **Optional overlays** — GPU dynamic overlay (occupancy/overlap); a DSE/search layer on top of
   the analytical cost (CoSA/GAMMA/Timeloop-mapper style) if author-first isn't enough.

## 9. Open questions

- What schema does CAW-01's twin emit — Timeloop-tree-shaped, ZigZag-graph-shaped, or new (→ how
  much of the twin→IR adapter is borrowed vs built)?
- How faithful must GPU dynamics be (warp/occupancy/coalescing/caches) vs an explicit-buffer
  idealization? (Decides whether the GPU overlay is required or deferrable.)
- Capture granularity: decomposed aten (post-Autograd, needs re-fusion) vs higher-level syntorch
  ops before decomposition?
- Author-first only, or also an optional DSE/search layer over the analytical cost?
- ASTRA-sim handoff: comms-trace format + co-sim vs one-shot; how to reconcile timelines.
- Dense-only folding vs sparse (TeAAL/Sparseloop data-dependent counts break tensor-free folding).
- Validation confidence for a novel accelerator with **no silicon/RTL** — cross-check against
  ZigZag/Timeloop on overlapping cases.
- Where does repetition-folding lose accuracy for **LLM decode** (tiny GEMMs, KV streaming, low
  arithmetic intensity, latency/overlap-bound)?

## 10. Missed-but-relevant (follow-up reading)

LLMCompass, Vidur, Calculon, DeepFlow, TENET, Union, CuTe/CUTLASS layout algebra, Hong&Kim
(MWP/CWP) GPU analytical model + GPUMech, chiplet/multi-die DSE (GEMINI, NN-Baton, SET, Simba),
Legion/Regent mapping, RISE/Lift+ELEVATE, loo.py, Buffets, Galvatron/Piper, Mirage. (The
"Analytical perf & LLM cost model" sweep agent errored on API overload — LLMCompass/Vidur/Calculon
in particular should be read before finalizing the serving-loop cost model.)

## Relationship to CAW-01
CAW-07 consumes the CAW-01 **HW twin** (its "novel HW" designer) and the ADR-0005 **Chakra / op-id
side-channel** (its L2 tiling sidecar), and returns per-op + serving costs to the CAW-01 **Sim
Result**. ADR-0009 (currently under CAW-01) is CAW-07's seed and should relocate here when CAW-07
is scaffolded to the product template.

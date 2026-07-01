# caw07-tiling-ir (Phase 1)

An abstracted, **analytically-costed** tiling/parallelism IR for **arbitrary**
accelerators — no compiler, no codegen, no real tensors. Phase 1 of the CAW-07
design ([`../design/tiling-ir-design-brief.md`](../design/tiling-ir-design-brief.md)).

## What's here
- `caw07_tiling_ir/hw.py` — `Level`/`LevelStack` and `linearize(twin)`: flatten an
  arbitrary tray/package/die/component + memory-tier hierarchy into an ordered
  outer→inner stack. A GPU-like and an NPU-like target are two linearizations of
  one primitive.
- `caw07_tiling_ir/plan.py` — the `AbstractTilingPlan` (ADR-0009 core object).
  Tile/spatial factors may be **functions of the hardware stack**, so a plan
  re-tiles automatically when the twin changes.
- `caw07_tiling_ir/cost.py` — **tensor-free repetition-folding** cost engine: cost
  one tile-unit exactly × the fold count, reuse-based traffic, roofline bound,
  **explicit remainders**.
- `caw07_tiling_ir/einsum.py` — the einsum++ front: `tile("m k, k n -> m n", …)`,
  plus `matmul` / `attention` helpers and a `render()` pretty-printer.
- `caw07_tiling_ir/twins.py` — example GPU-like / NPU-like twins + HW-parametric
  factor helpers (`mu`, `fit_k`).

## Run
```bash
cd impl
PYTHONPATH=. python examples/demo.py     # matmul + attention on both twins
PYTHONPATH=. python tests/test_core.py    # invariants
```

## The cost model (Phase 1, exploration-grade)
For each loop dim `d` (extent `E`, tile `T`, spatial `S`): `block = T·S`,
`trips = ceil(E/block)`. Compute: `tile_unit_macs = ∏T`, `time = tile_unit_macs ·
fold / leaf_rate`. Traffic (reuse): an operand is reloaded once per trip of each
loop it does **not** index — `loads(O) = ∏_{d∉O} ceil(E/T)` — fully reused over
the loops it does. `kernel_time = max(compute, memory)`.

This is the Timeloop/MAESTRO action-count method with the compute-leaf tile as the
action. It is **exploration-grade**, not cycle-accurate (see the design brief's
limitations: GPU dynamics overlay, decode accuracy, no-silicon validation).

## Roadmap (from the brief)
1. **(this)** core IR + einsum++ + repetition-folding cost, GPU-like/NPU-like.
2. richer cost (per-tier staging/placement, occupancy) + cross-check vs ZigZag/Timeloop.
3. syntorch `TorchDispatchMode` read-only capture inside a vLLM-shaped harness.
4. schedule-library front (multi-level/fusion/per-operand).
5. three-tier span (mesh parallelism + ASTRA-sim comms) + vLLM serving loop.

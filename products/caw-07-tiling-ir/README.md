# CAW-07 · Tiling IR

A separate product (spun out of CAW-01's ADR-0009): an **abstracted, analytically-costed
IR for expressing tiling + parallelism on ARBITRARY / novel accelerators** (GPU-like or
NPU-like), attached to **syntorch** and fed into the **vLLM + syntorch + HW + ASTRA-sim**
simulation loop.

- Design brief (prior-art-grounded): [`design/tiling-ir-design-brief.md`](design/tiling-ir-design-brief.md)
- **Phase-1 implementation:** [`impl/`](impl/) — a runnable Python package (core `AbstractTilingPlan`,
  `linearize(twin)`, the einsum++ `tile()` front, and a tensor-free repetition-folding cost engine;
  demo + tests on a GPU-like and an NPU-like twin). See [`impl/README.md`](impl/README.md).
- Seed decision: CAW-01 [ADR-0009 abstracted tiling IR](../caw-01-simulation-control-plane/design/01-decisions/ADR-0009-abstracted-tiling-ir.md)
  (to be relocated here).
- Full survey + seminar + LaTeX paper live in the private repo `jimmylegendary/tiling-ir-survey`.

**Status:** Phase-1 core is implemented and tested; next phases (richer cost, syntorch runtime
capture, schedule-library front, three-tier span + serving loop) per the design brief.

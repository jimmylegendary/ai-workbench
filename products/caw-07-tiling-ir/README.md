# CAW-07 · Tiling IR

A separate product (spun out of CAW-01's ADR-0009): an **abstracted, analytically-costed
IR for expressing tiling + parallelism on ARBITRARY / novel accelerators** (GPU-like or
NPU-like), attached to **syntorch** and fed into the **vLLM + syntorch + HW + ASTRA-sim**
simulation loop.

- Design brief (prior-art-grounded): [`design/tiling-ir-design-brief.md`](design/tiling-ir-design-brief.md)
- Seed decision: CAW-01 [ADR-0009 abstracted tiling IR](../caw-01-simulation-control-plane/design/01-decisions/ADR-0009-abstracted-tiling-ir.md)
  (to be relocated here once CAW-07 is scaffolded).

**Status:** design exploration only — no implementation yet. The brief was produced from a
deep prior-art sweep (87 projects) + a design panel; it recommends *what to build on* before
we write any code.

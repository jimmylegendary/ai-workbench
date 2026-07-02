# MLIR insights for CAW-07 — adopt / align / borrow / skip

A focused review of the MLIR ecosystem against CAW-07's purpose (an *analytical*,
codegen-free tiling/parallelism IR for backend-less HW). **Verdict: MLIR is a
vocabulary and structural reference, never a runtime dependency or a cost oracle.**

## Why MLIR can't be our engine (and why that's the point)
**MLIR has no native analytical cost model.** Every MLIR performance path
presupposes a real backend: IREE/XLA cost heuristics are private and target-driven;
research "roofline passes" (e.g. PolyUFC) compute FLOPs/bytes only *after* the loop
nest is materialized in affine/memref against a real hardware roof; FlopCounter is a
torch feature, not MLIR. **Nothing in MLIR costs a mapping on hardware that has no
backend — which is exactly CAW-07's niche.** Our tensor-free repetition-folding
engine (`cost.py`: tile-unit × fold × spatial + explicit remainders, roofline
`max(compute_us, memory_us)`; `validate.py`'s ridge = peak / bandwidth, matching TPU
v1's published ~1350 MAC/byte) *is* the missing "analytical-over-a-mapping" oracle.
→ **Keep the folding engine as the differentiator; borrow only IR abstractions.**

## Strong external corroboration (confidence for a no-silicon tool)
CAW-07 independently rediscovered two mature, separate-lineage designs:
- **linalg structured-op contract** — per-operand `indexing_maps` + `iterator_types`
  (parallel/reduction) is the exact formal semantics behind our `Operand.dims` and
  the reuse law `loads(O)=∏_{d∉O} ⌈E/T⌉` (`cost.py`).
- **JAX/TPU Pallas `BlockSpec`** — `grid` == our `trips[d]`, `block_shape` == our
  `tile[d]`, and "an operand whose `index_map` ignores a grid axis is reused along
  it" == our reuse law, byte-for-byte. (Also matches the ZigZag cross-check.)
Two unrelated ecosystems arriving at our model is meaningful validation.

## Actions per CAW-07 artifact

| CAW-07 artifact | MLIR source | Action | Concrete change |
|---|---|---|---|
| `Op` iterator tagging | linalg `iterator_types` | **align** | add `iterator_types{parallel\|reduction}` (derive: dims absent from output Y = reduction); **add a reduction-combine cost** when a reduction dim is fanned across spatial instances |
| `Operand` access model | linalg `indexing_maps` | **borrow** | keep the dims-tuple fast path; add an OPTIONAL small `(coeffs, offset)` affine access form for strided/windowed/overlapping ops (conv/pool/dilated/local-attn) |
| single normal form | linalg named→`generic`; TileLang layers | **borrow** | keep ONE costed normal form (`AbstractTilingPlan`); every front (einsum++, P4, syntorch re-fuser) is a *spelling* that lowers to it — never a parallel cost path |
| per-operand placement | `memref` memory-space + promotion; Pallas mem spaces | **borrow** | add `Operand.placement` (a `Level` id/role); make `cost.py` backing-tier selection **per-operand** (right bandwidth/capacity per operand) |
| einsum++ front | Pallas `BlockSpec(block_shape, index_map)` + grid | **align** | no change needed (external validation); optionally offer a BlockSpec-style peer front later |
| `LevelStack` / twin | DLTI `target_system/device_spec`, `dlti.query`; `memref` memory spaces; gpu addr-space convention | **align** | keep native LevelStack (a **superset** of a DLTI spec — DLTI is flat, no tier order/BW/fanout); optionally a thin one-way DLTI *exporter* |
| P4 schedule front | **transform dialect** | **adopt (model)** | model P4 as a separate, inspectable, replayable schedule that **lowers to** `AbstractTilingPlan`: `tile_using_for` (temporal) vs `tile_using_forall` (spatial-bind) verb split; `named_sequence`-style HW-parameterized macros; `match`; `fuse_into_containing_op` |
| Remainder | Presburger `IntegerPolyhedron` / Barvinok (via **islpy**) | **borrow (opt-in)** | keep dependency-free folding as default; add islpy as an OPT-IN exact-count backend for interacting corner tiles / fused / windowed remainders |
| codegen / `pad` / lowering | transform `pad`, TilingInterface, bufferization | **skip** | never take a lowering/measure path; never `pad`-then-mask (opposite of our explicit-remainder contract); never link libMLIR / import MLIR C++ types |

## Two real correctness gaps MLIR exposed (also close the P2 ZigZag divergence)
The ZigZag cross-check (RB-02) found ONE divergence: **output partial-sum spill**
(we under-count O when the reduction dim is tiled across DRAM). MLIR points at the
two fixes:
1. **Reduction iterator + combine cost** — today `cost.py` fans spatial instances
   across a reduction dim with **zero combine cost** (silently free); a real
   accelerator pays an accumulator-tree / reduction-collective (the intra-device
   precursor of DTensor `Partial`/AllReduce). Tag the iterator; add the term.
2. **Per-operand placement / tier-aware traffic** — `cost._backing_level` uses ONE
   global tier for all operands, so "keep O resident vs spill it across the k-loop"
   is inexpressible. Per-operand placement lets us model the partial-sum spill.
→ **Doing #1 + #2 both improves correctness AND closes the one gap the oracle found.**
(A third upgrade, the optional affine access map, makes conv/windowed ops correct.)

## emit / consume MLIR?
**Borrow concepts; do not couple to MLIR at runtime.** Never emit MLIR for lowering,
never consume an MLIR cost model, never link libMLIR or import `AffineMap`/
`IntegerPolyhedron`/`TilingInterface`. The only interop worth building — *later,
optional, one-way, read-only* — is an ingest adapter: parse a DLTI-style target map
into a `LevelStack` (extended with the per-tier BW/fanout DLTI lacks) and a
`linalg.generic`'s maps+iterators into `Op`/`Operand`, then cost with our engine — a
pure parse that never lowers/bufferizes/measures. Not a Phase-1 dependency.

## Pitfalls (from the review)
- Don't import MLIR C++ types / link libMLIR (drags in the whole toolchain for zero
  cost-accuracy gain). Model affine access as a tiny Python `(coeffs, offset)` form;
  defer exact counting to islpy.
- Don't take the `pad`→loops→memref path (pad over-counts-then-masks; any lowering
  tempts measurement, breaking the no-codegen constraint).
- Interacting **corner-tile remainders** are over-counted today (`cost.py` enumerates
  one remainder per dim independently) — don't over-trust remainders beyond
  single-level rectangular contractions.
- DLTI's per-device spec is a flat key/value bag (no tier order, no per-tier BW/
  fanout) — use it only as the *target-as-data principle* + a lossy export shape.

## Open questions
- Twin interchange: DLTI map (interop, but flat/lossy) vs native LevelStack + a thin
  one-way DLTI exporter?
- Introduce islpy exact-remainder backend at P4/windowed only, or earlier to fix the
  single-level corner-tile over-count?
- Adopt `iterator_types` on `Op` now (cheap; needed for the combine term + later
  inter-device `Partial`) — recommended yes.
- P3 capture: ingest `linalg.generic` (torch lowered only *to* linalg) as an alternate
  front vs re-fusing decomposed aten — which minimizes re-fusion + mis-attribution?
- P4 remainder policy: a per-verb `remainder='explicit'|'pad'` flag, plus a TeAAL-style
  `uniform_occupancy` (capacity-driven, fit_k) verb distinct from fixed-shape `split`.

## Net
MLIR gives CAW-07 a **principled IR vocabulary** (linalg maps/iterators as the
semantics behind einsum++; transform dialect as the P4 authoring model; DLTI as
twin-as-data; memref memory-spaces as per-operand placement; Presburger/islpy as the
opt-in exact-remainder backend) and an **optional read-only interchange** — but **no
cost engine and no lowering path**. The folding engine stays CAW-07's core. Highest-
value next work (also closing the ZigZag gap): **iterator_types + reduction-combine
cost**, then **per-operand placement / tier-aware traffic**.

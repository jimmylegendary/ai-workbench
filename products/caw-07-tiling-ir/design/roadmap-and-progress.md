# CAW-07 — roadmap & honest progress tracker

Purpose: an unflattering, verifiable status. "The IR runs" ≠ "the IR is done".
Each phase has a **Definition of Done (DoD)** and a **validation gate** — the phase
is only real when the gate passes. Overall the product is **early (~10–15%)**: the
core *shape* is proven, but the trustworthy-cost, runtime-attach, serving-loop, and
multi-device work — the bulk of the value and difficulty — is not built.

| Phase | What | Status | DoD / validation gate |
|---|---|---|---|
| P0 | Design (brief + prior-art survey + paper) | **done** | brief + 87-project survey + paper published (private repo) |
| P1 | Core IR *skeleton* | **done (skeleton/PoC)** | runs; `AbstractTilingPlan` + `linearize` + einsum++ + a **toy** repetition-folding cost; GPU/NPU **toy** twins; 5 invariant tests. Cost is **unvalidated**. |
| **P2** | **Trustworthy cost + real NPU twin + validation** | **in progress — twins + first-principles gate DONE** | ✅ five faithful public-spec NPU twins ([hardware-twins.md](hardware-twins.md): Eyeriss/Gemmini/TPU v1/v4/NVDLA); ✅ exact op-count; ✅ validation gate `validate.py` (A1 compulsory / A2 I/O-lower-bound / A3 peak / A5 roofline) passes on all twins; ✅ TPU v1 ridge = 1350 MAC/byte matches Jouppi'17. **Remaining:** numeric cross-check vs ZigZag (`zigzag-dse`) on DRAM-access counts (~10–15%); richer cost (per-tier staging/placement, occupancy); remainder tail costed at real size. |
| P3 | syntorch runtime capture (read-only) | **runbook only** ([RB-01](../runbooks/RB-01-syntorch-runtime-capture.md)); CAW-07 `CaptureSink`+mock harness = TODO | **team** implements the `TorchDispatchMode`; gates G1–G5 in RB-01. *Cannot self-implement (internal system).* |
| P4 | Schedule-library front (multi-level / fusion / per-operand) | not started | express a multi-level mapping + a fused attention (flash-style) and cost it; matches P2 model on the single-level case |
| P5 | Three-tier span (inter-device mesh + ASTRA-sim network) | not started | emit an ASTRA-sim-consumable collectives trace; reconcile compute↔network timelines on a TP/PP example |
| P6 | LLM serving-in-the-loop (vLLM prefill/decode/KV/batching) | not started | end-to-end serving latency/throughput from an authored tiling idea over a live prefill/decode trace — **the actual end goal** |

## Cross-cutting gaps (not a phase, but real)
- **Validation / accuracy story is weak.** Novel HW has no silicon/RTL; numbers are
  *exploration-grade*. The only honest confidence is (a) first-principles roofline
  lower bounds and (b) cross-checking overlapping cases against ZigZag/Timeloop. P2
  makes this a gate; until then, treat all numbers as *relative what-if*, not truth.
- **GPU dynamic-execution semantics** (SIMT/warp scheduling, occupancy, divergence,
  coalescing, implicit caches) are **not modeled** — a GPU-like twin is structurally
  expressible but dynamically mis-costed. Needs an optional overlay (post-P2).
- **Remainder cost** is currently over-estimated (tail tile counted as a full trip);
  P2 fixes it (cost the short tile at its real size).
- **HW twin ↔ CAW-01 adapter** — P1 uses hand-built example twins, not CAW-01's real
  twin schema. A real adapter is part of P2/P3.

## Current priority (my judgment)
1. **P2** — real NPU twins + first-principles validation gate + TPU v1 ridge
   cross-check are **done and passing**. Next within P2: the **ZigZag numeric
   cross-check** (strongest external validation) + a richer cost model
   (per-tier staging/placement, occupancy, real-size remainder cost).
2. **P3 runbook** kept current for the team (done: RB-01); add CAW-07 `CaptureSink`
   + a mock (syntorch-free) harness so the sink is testable now.
3. P4 → P6 after P2 fully closes.

Honest note: P2's *self-consistency* gate (bounds + published ridge) now holds —
the numbers are no longer "toy" and cannot violate physics — but the **numeric
oracle cross-check (ZigZag) is not yet run**, so absolute accuracy is still
unproven. Treat magnitudes as defensible, absolute pJ/cycles as provisional.

## What P1 actually proved (so it's not oversold)
- The *architecture* works end-to-end: an arbitrary hierarchy linearizes; a plan's
  tile factors as functions of the stack **auto re-tile** on a different twin; the
  repetition-folding identity holds (`total = tile_unit × fold × spatial`); GPU vs
  NPU produce different bottlenecks. That is a real, useful **baseline** — and only a
  baseline.

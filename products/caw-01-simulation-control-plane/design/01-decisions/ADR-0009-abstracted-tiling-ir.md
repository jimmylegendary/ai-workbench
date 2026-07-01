# ADR-0009: Abstracted tiling IR — HW-schema-parameterized tiling for architecture exploration

- **Status:** proposed (draft for review — Jimmy)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [ADR-0005 Trace pipeline](./ADR-0005-trace-pipeline.md) (syntorch capture → Chakra → ASTRA-sim; "tiling/partitioning as explicit **strategy ids**"; L1/L2 ride an **op-id side-channel**)
  - [ADR-0004 Canvas rendering](./ADR-0004-canvas-rendering.md) (C3 HW config → syntorch HW logic + ASTRA-sim)
  - [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema.md) (L0/L1/L2 IR fill-levels)
  - [../04-data-layer/hw-schema.md](../04-data-layer/hw-schema.md) (the HW twin the IR is parameterized by)
  - [serving-and-simulation-frameworks](../02-research/serving-and-simulation-frameworks.md), [trace-capture-and-chakra](../02-research/trace-capture-and-chakra.md)
- **Source of truth:** [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF.md)

## Purpose

Define **how the tiling/partitioning of a compute op is represented** for the **simulation-granularity L2**
path when the target hardware is **novel** — i.e. there is **no compiler, no autotuner, and no programming
model** for it yet. ADR-0005 already fixed that syntorch records "tiling/partitioning as explicit **strategy
ids**" and that L2 tiling detail rides a **side-channel keyed by Chakra op id** (never the `.et` proto). This
ADR fixes **what a strategy id actually *contains*** for architecture exploration: an **abstracted,
HW-schema-parameterized tiling descriptor** — effectively a small IR — that a kernel/memory cost model can
consume to estimate kernel time, memory-tier traffic and footprint **without** a real compiled schedule.

**Core principle (refined 2026-07): abstract by folding *repetition*, not by dropping to coarse instructions.**
A tiled kernel re-executes the *same* tile computation across its iteration space. The IR captures that repeated
**tile-unit exactly** (so accuracy is preserved) and folds the **redundant repetition** into parametric
iteration/repetition counts. It is emphatically **not** an instruction-level unroll of every op, **nor** a lossy
coarse estimate. The engineering task is precisely to **find what is regular/repeated (hence abstractable) vs
what must stay explicit** (irregular/boundary work) — so the abstraction gives up compactness *only* where
folding would cost accuracy.

It does **not** define the kernel/memory *cost model itself* (that is a runbook + open question), the IR
storage tech ([ADR-0002](./ADR-0002-data-layer.md)), or the network sim (ASTRA-sim, [ADR-0005](./ADR-0005-trace-pipeline.md)).

## Context / forces

- **No compiler for new HW.** Real tiling is produced by a backend compiler/autotuner against a concrete ISA
  + memory hierarchy. For a HW we are *exploring* (Canvas 3 twin, possibly hypothetical), none exists.
- **Real tiling search is infeasible for exploration.** Even with a compiler, autotuning every op for every
  candidate HW in a design sweep is far too slow — the opposite of "fast what-if sweeps" ([ADR-0005](./ADR-0005-trace-pipeline.md)
  analytical-default rationale).
- **But L2 needs *some* tiling.** The whole point of granularity L2 (os-level: kernel tiling + memory
  management) is to make the on-chip memory hierarchy and kernel structure *visible* to the sim. A monolithic
  "one op = one cost" (which is what L0/L1 already do) cannot express reuse/blocking, shared-mem/L2 residency,
  occupancy, or capacity pressure.
- **The HW schema is the natural parameter space.** Canvas 3's twin already carries the quantities a tiling is
  chosen against: tensor-core/matrix-unit shape, register/shared-mem/L2 capacities and bandwidths, HBM/CXL
  capacity+BW, SM/core counts, interconnect. A tiling expressed **as a function of those parameters** re-tiles
  automatically when the HW changes — which is exactly what architecture exploration wants.
- **Two consumers, one HW model.** ADR-0005 §4 requires syntorch's HW logic and ASTRA-sim's system/network
  config to stay consistent with Canvas 3. The tiling IR is consumed by the **compute/memory** side; ASTRA-sim
  still owns **network** only.
- **syntorch HW layer is not yet stateful / instanced** (SOURCE-BRIEF §7; workbench memory note): the
  representation must be expressible **without** per-instance stateful modeling, and degrade gracefully if/when
  instancing lands.

## Options considered

| Decision | Option A | Option B | Option C | Chosen |
|---|---|---|---|---|
| **What a strategy id contains** | nothing extra — kernels are monolithic analytical costs | a *real* compiled/autotuned schedule per (op, HW) | an **abstracted HW-parameterized tiling descriptor** (loop-nest tiling + per-tier placement + parallel mapping), cost-model-consumed | **C** |
| **Tile-factor selection** | fixed heuristic constants | full autotuning search | **cost-guided heuristic** over the schema-derived feasible set (roofline / capacity-fit), search-upgradable later | C (heuristic first) |
| **Where it lives** | inside Chakra `.et` attrs | separate DB table | **op-id side-channel sidecar** (per ADR-0005) | side-channel |
| **Fidelity claim** | cycle-accurate | measured | **exploration-grade** (relative/what-if, trust-laddered vs real axis) | exploration-grade |

## Decision (draft)

**A "strategy id" resolves to an `AbstractTilingPlan`: an HW-schema-parameterized, ISA-agnostic tiling
descriptor attached to a Chakra op via the L2 op-id side-channel. Tile factors are chosen by a cost-guided
heuristic over the feasible set the HW schema implies; a kernel/memory analytical model consumes the plan to
produce per-op compute time + per-tier memory traffic/footprint, which annotate the op's Chakra/L0 node.
ASTRA-sim still times only the network. It is exploration-grade, never a real schedule — and it folds the
repeated tile-unit + counts (irregular remainders kept explicit) rather than unrolling instructions.**

### `AbstractTilingPlan` — representation sketch (to be finalized with the engine)

Per compute op (matmul / attention / conv / elementwise / reduction / collective-adjacent), keyed by Chakra op id:

- **repeated tile-unit + repetition counts** — the compute done for **one** tile (its op mix, per-tier bytes),
  captured **once and exactly**, plus how many times the iteration space repeats it, plus any **irregular
  remainder/boundary** tiles kept explicit (tail tiles, masked regions). This is where the accuracy-preserving
  **repetition folding** lives — cost the unit exactly × count the repeats; never an instruction-level unroll.
- **iteration space** — the op's logical loop dims (e.g. matmul `M,N,K`; attention `B,H,S,D`), as symbols.
- **tile factors per dim** — the block sizes, expressed as **functions of HW-schema symbols** rather than
  constants, e.g. `tile.M = f(matrix_unit.m, num_sm)`, `tile.K = fit(shared_mem_bytes, dtype)`. Multi-level
  (register → shared/scratchpad → L2 → HBM) where the schema exposes the tiers.
- **operand placement / staging** — for each operand, which memory tier it is staged/blocked in and its reuse
  factor; drives per-tier bytes moved and peak footprint.
- **parallel mapping** — which HW parallel axes the tiles map onto (SM/core/lane groups). Kept **abstract**
  (counts + occupancy), not per-instance stateful (respects the syntorch limitation above).
- **derived costs** (filled by the cost model, not authored): compute `num_ops`, per-tier `bytes_moved`,
  `footprint_bytes`, `occupancy`, and an estimated `kernel_time` — which flow back onto the Chakra node
  duration and the L1 residency annotation.

Because every factor is a function of schema symbols, re-evaluating the plan against a **different Canvas-3
HW** re-tiles the op and re-costs it — no re-authoring. This is the "abstracted IR for architecture
exploration" the requirement asks for.

### Pipeline placement

`syntorch capture → per-op AbstractTilingPlan (L2 sidecar) → kernel/memory cost model (syntorch HW layer or
external tool, TBD) → annotate Chakra node compute/mem → ASTRA-sim (network only) → Chakra→L0 lowering
(ADR-0005 §5) → projection`. L0/L1 granularities simply **skip** the tiling-plan + kernel/memory model and use
the analytical monolithic cost.

## Consequences

- **Enables L2** (kernel/memory visibility) for HW that has no toolchain — the core requirement.
- **Fast sweeps stay fast** — heuristic tiling, not autotuning; re-costs on HW change by re-evaluating symbols.
- **One HW model, two consumers** stays intact (compute/memory from the plan; network from ASTRA-sim).
- **Accepted hard parts:** the **kernel/memory cost model** is real engineering and currently unspecified
  (open question below); tile-factor heuristics need calibration; accuracy is **exploration-grade** and must be
  trust-laddered against the real/OTel axis before any absolute claim; stateful/instanced HW is out of scope
  until syntorch supports it.

## Open questions / revisit triggers

1. `TODO` Is the `AbstractTilingPlan` **the definition of** ADR-0005's "strategy id", or a separate sidecar the
   strategy id points to? (Recommend: the strategy id *is* a hash/ref of the plan.)
2. `TODO` The **kernel/memory cost model** — closed-form roofline/analytical inside syntorch, or an external
   tool (the "L2 external tool TBD" in the requirement)? What are its inputs/outputs exactly?
3. `TODO` Tile-factor selection — heuristic policy set vs guided search; where the policy lives.
4. `TODO` Which HW-schema fields must be **required** for L2 (matrix-unit shape, per-tier capacity+BW, SM count,
   occupancy limits) — extend [hw-schema](../04-data-layer/hw-schema.md) accordingly.
5. `TODO` Memory-tier taxonomy: how the plan names tiers so it stays HW-agnostic across GPU/CXL/CXMT/custom.
6. `TODO` Calibration/validation without real silicon — synthetic self-consistency + trust ladder plan.
7. `TODO` **Repetition detection** — how to identify the abstractable repeated tile-unit vs the irregular /
   boundary work that must stay explicit, so folding never trades away accuracy (tail tiles, masked attention,
   dynamic shapes, data-dependent branches). This is the crux of the "accurate yet abstracted" requirement.

## Implications for runbooks

- **phase-4-trace-pipeline** — new RB: the **AbstractTilingPlan sidecar producer** (op → plan from HW schema)
  and the **L2 kernel/memory analytical model** that consumes it and annotates Chakra nodes; keep it keyed by
  op id per ADR-0005.
- **hw-schema** — RB to add the required L2 parameters (§4 above) to [hw-schema](../04-data-layer/hw-schema.md)
  and the Zod twin (`packages/core/src/schemas/hardware.ts`).
- **web app** — the workbench surfaces the tiling plan **read-only** at granularity L2 (a per-op tiling
  inspector) and lets the user pick the granularity; it does **not** author the plan.

# Memory microarchitecture: IR/twin vs analytical backend vs simulator

**The question.** When you design a custom HW/SoC, the memory design space has
buffer/SRAM/scratchpad kinds & sizes, DRAM device kinds (HBM/DDR/LPDDR), channels,
banks, ports, DMA engines, double-buffering, access granularity/alignment, cache-vs-
scratchpad, NoC. Does CAW-07 capture these **HW-agnostically in the IR**, or do they
need a **separate backend**?

## Thesis
**Mostly in the IR/twin as HW-agnostic DATA, with a thin analytical backend for
derates — and a sharp, honest simulator boundary.** It does **not** need a compiler
backend. This is the split every analytical DSE tool (Timeloop, ZigZag, MAESTRO,
CoSA) uses. "HW-agnostic" means exactly two things:
1. every memory attribute is a **twin/mapping parameter** (capacity, bandwidth,
   ports, banks, granularity, managed-vs-cached), so a new accelerator is a new
   *data point*, never new code; and
2. evaluation is **analytical** — a closed-form `f(twin, mapping, workload) →
   (cycles, energy, area)` that never runs code and never needs the physical chip.

The word **"backend" is a trap**: CAW-07 *does* want a richer analytical cost/timing
backend for second-order effects, but that is a **swappable cost function, not a
codegen/compiler backend**. Genuinely load-adaptive / data-dependent / multi-actor
dynamics are out of scope and deferred to a real simulator.

## Four layers (Timeloop's arch/mapping/cost split + an explicit simulator boundary)
1. **ARCHITECTURE-SPEC = the HW twin / `LevelStack`** — what the HW *is*
   (workload-independent physical facts + legality). capacity, bandwidth (ideally
   per-direction ports), instances, spatial_axis, matrix_unit, dtype, and new
   fields: bank_count, line/burst granularity, managed-vs-cached, network
   {multicast, reduce}, device-kind-derived scalars. Answers *"does it fit / is
   this mapping legal / how much data must move."*
2. **MAPPING = the `AbstractTilingPlan` / IR** — what the HW is *asked* to do. Tile
   factors, loop order, temporal/spatial tags, **per-operand placement**, which
   levels double-buffer, bypass. Data movement is **implied by the loop nest**
   (Explicit-Decoupled-Data-Orchestration) — there is **no DMA "object."**
3. **ANALYTICAL COST/TIMING BACKEND** — a pure `backend(twin, mapping, workload) →
   (cycles/us, energy, area)` that turns the folding pass's access counts into
   metrics. Second-order-but-still-closed-form: roofline refinement (spatial-
   underutil + BW-stall + fill/drain instead of bare `max()`), static derates
   (η_bank, η_chan, η_dram, granularity rounding), double-buffer overlap α, DMA
   setup/concurrency gating, energy via ERT + area via ART. **Not** a compiler
   backend — no codegen, no execution.
4. **OUT OF SCOPE = a real cycle-accurate / event-driven simulator** — load-adaptive,
   data-dependent, or multi-actor behavior with no closed form: DRAM row-buffer /
   command timing / refresh / controller queueing, cache hit-rate for irregular
   access, NoC routing/congestion, MSHR latency hiding, whole-SoC multi-engine
   scheduling. CAW-07's codegen-free niche sits in layers 1–3; layer 4 is a
   deliberate, honest exclusion.

## Where each element goes

| Element | Where | Structural / 1st / 2nd order | How |
|---|---|---|---|
| Buffer/SRAM/scratchpad **size** | **twin** | structural (legality) | `Level.capacity_bytes` (have it); enforce resident working-set ≤ capacity; ×2 if double-buffered |
| DRAM device kind (HBM/DDR/LPDDR) | **twin** | 1st-order | a preset table filling outer level's bandwidth/capacity/energy-per-bit — **not** an enum-with-behavior |
| DRAM **channels** | **twin** | 1st-order | fold into aggregate `bandwidth_bps` (channels × per-ch BW) or level `instances`; interleave derate η_chan → backend; hot-channel imbalance → simulator |
| SRAM **banks** | **backend** (+ twin scalar) | 2nd-order | twin `bank_count`; backend `eff_bw = base × min(banks, demand)` + static η_bank; exact conflicts → simulator |
| **Ports** (read/write/shared/dual) | **twin** | 1st-order structural | split scalar BW → `read_bw`/`write_bw` + shared flag; decides if the partial-sum RMW hides (dual-port) or serializes (shared) |
| **DMA engines** | **backend** | 1st (setup) / 2nd (queue) | movement stays implied by the mapping (no DMA object); backend adds `n_tiles × dma_setup` + gates overlap on engine count |
| **Double-buffering** | **backend** (+twin+IR) | 1st-order | twin: ×2 capacity; IR: declare which level ping-pongs; backend: overlap α + fill/drain |
| Access **granularity/alignment/burst** | **backend** (+twin scalar) | semi-structural 1st | twin `line_bytes`; backend inflates `ceil(useful/gran)×gran` (same remainder math, at transfer size) |
| **Cache vs scratchpad** | **twin** (tag) | structural axis | per-level `managed=true/false`; managed → exact folding (KEEP for the perf-first IR); cached → backend reuse-distance hit-rate plug-in |
| **NoC / interconnect** | **twin** (+backend) | 1st (BW/capability) / 2nd (congestion) | `spatial_axis`+`instances` give fanout; add `{can_multicast, can_reduce}` + link_bw; routing/congestion/collectives → ASTRA-sim/BookSim |
| Per-access **energy / area** | **backend** | orthogonal cost | attach ERT/ART tech tables (Accelergy/CACTI); `energy = Σ access_count × e/access`; only when an energy objective is added |
| Per-operand placement / partial-sum spill | **IR** (twin-constrained) | structural mapping | ✅ already implemented + byte-validated vs ZigZag |
| Roofline overlap + spatial-utilization | **backend** | 1st-order | replace bare `max()` with `max(C,M) + underutil + BW-stall + fill/drain` |
| DRAM row-buffer / tRC·tRCD·tRP / refresh / queueing | **out of scope** | 2nd-order dynamic | collapse to one η_dram (~0.6–0.85); hand off to Ramulator/DRAMsim3 |
| Multi-engine SoC / shared-LLC / NoC congestion | **out of scope** | multi-actor | evaluate each engine analytically, expose per-engine results, let ASTRA-sim/SCALE-Sim-v3/gem5 compose |

## What CAW-07's LevelStack/cost lacks today (to be memory-microarch-agnostic)
- **Ports**: only a single scalar `bandwidth_bps` — no read/write split or shared
  flag, so it can't express whether a dual-port buffer hides the RMW or a shared
  port serializes it.
- **Granularity**: has `dtype_bytes` but no line/burst size → can't inflate traffic
  for small/remainder/misaligned tiles (the remainder math already exists).
- No `bank_count` + η_bank hook; channels only as a lumped scalar (no η_chan).
- No `managed`-vs-`cached` tag (every level is implicitly a scratchpad).
- Double-buffering is implicit in `max()` but not *declared* (no per-level flag, no
  ×2 capacity reservation) — a design can be scored as overlapping while its
  capacity check under-counts.
- Bare `max(compute_us, memory_us)` is the **ideal ceiling** — no α, no spatial-
  underutil (`mapped_PEs/total_PEs`), no BW-stall, no fill/drain.
- No DMA engine-count overlap gate / setup overhead; no NoC capability tags; no
  η_dram; no ERT/ART energy-area tables; no device-kind preset table.

## What "backend" means for CAW-07
**Not** a compiler/codegen backend (no LLVM, no instruction selection, no lowering,
no execution). It is an **analytical cost/timing backend**: `backend(twin, mapping,
workload) → (cycles/us, energy, area)` over the folding pass's access counts, in
closed form. Its exact core is what we already have (capacity legality, folded
traffic, per-operand placement, partial-sum RMW + reduction-combine, roofline). Its
extension surface = closed-form plug-ins on the same access counts: (a) roofline
refinement; (b) static derates η_bank/η_chan/η_dram + granularity rounding + DMA
gating; (c) ERT/ART energy-area; (d) an optional cache hit-rate model. **Rule of
thumb:** if an effect is a **deterministic consequence of tiling + physical
scalars**, it is a backend plug-in; if it **emerges from runtime access order,
replacement policy, or multiple concurrent actors**, it needs a simulator — expose
the analytical per-component result and stop there.

## Pitfalls
- Don't model transparent **caches** with the folding kernel (its ZigZag-validated
  exactness depends on deterministic scratchpad residency) — cache is a distinct
  backend plug-in.
- Don't add DRAM **row-buffer timing** as twin attributes (false precision) — one
  η_dram, then Ramulator/DRAMsim3 if viability hinges on row-hit rate.
- Don't compute exact **bank conflicts** analytically (address/cycle dependent) —
  static derate or abstain.
- Don't make the **DMA** a first-class actor (movement is implied by the mapping) —
  only engine count + setup, as an overlap gate.
- Don't conflate "backend" with a **compiler** backend — no codegen, ever.
- Don't over-claim the bare `max()` overlap — label it an upper bound or add α +
  fill/drain + spatial-underutil.
- Don't fake NoC congestion / controller queueing / multi-engine SoC scheduling in
  the twin — expose per-component results; let a system simulator compose them.
- Keep the **twin / IR / backend contract clean** (Timeloop's discipline): one
  architecture is evaluated against millions of mappings — structural attributes on
  the twin, mapping decisions in the IR, derates/energy in the swappable backend.

## Bottom line for the user's question
Yes — a custom SoC's memory design (buffers, device kinds, channels, banks, ports,
DMA, granularity, scratchpad-vs-cache, NoC) is captured **HW-agnostically as twin/IR
parameters**; the folding cost engine stays the same across any of them. A **backend
is needed, but an analytical one** (closed-form derates/overlap/energy), not a
compiler. Only a handful of genuinely dynamic effects (DRAM command timing, cache
hit-rates for irregular access, NoC congestion, multi-engine SoC interaction) fall
outside the closed form and are an explicit hand-off to a cycle-accurate simulator.

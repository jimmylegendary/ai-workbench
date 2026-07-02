# RB-02 — ZigZag cross-check of the CAW-07 analytical tiling-cost model

> Validates CAW-07's repetition-folding cost model against **ZigZag** (KU Leuven,
> `pip install zigzag-dse`) — a runnable, pure-Python analytical **oracle** — on
> the **same hardware + workload + mapping**. This is the "cross-check against an
> independent analytical model" gate promised in the design brief / roadmap.
>
> **Headline result (real numbers, recorded below): on ZigZag's own bundled GEMM
> accelerator, our model reproduces ZigZag's per-operand DRAM access bytes EXACTLY
> (0.00 % rel-err) and total MACs exactly — across three primary shapes AND the
> output-partial-sum-spill case (formerly a 75 % under-count, now modeled via
> per-operand placement + accumulator-precision RMW); ideal compute cycles match by
> construction, and the compute/memory bound agrees.** The remaining scoped gap is
> interacting corner-tile remainders. (See §6 for which agreements are independent
> vs by-construction.)

---

## 0. Why ZigZag, and what "agree" means here

ZigZag ships its own analytical cost model **and** example accelerators + mappings
(Eyeriss / TPU / Meta-prototype / a pure GEMM target). It exposes
`get_hardware_performance_zigzag(workload, accelerator, mapping) -> (energy_pJ,
latency_cycles, cme)` where the `cme` (CostModelEvaluation) carries per-memory-level
access counts. That makes it the ideal independent check for our numbers.

**Crucial methodology point.** ZigZag's `loma` engine *searches* for a temporal
mapping; CAW-07 Phase-1 does **not** search — it costs a mapping it is handed. To
compare the two **cost models** (not the two mapping searchers) we let ZigZag pick
the mapping, then **derive the equivalent CAW-07 tile factors from ZigZag's chosen
temporal mapping** and cost *that same mapping* with our engine. For GEMM
`O[d0][d2] += I[d0][d1]*W[d1][d2]` (m≡D0, k≡D1, n≡D2):

```
tile[d] = extent[d] / (product of the DRAM-level loop factors of the operand
                       that does NOT index d)
# m is not indexed by W; n is not indexed by I; k is not indexed by O
```

This is exactly the outer blocking ZigZag applied. Under it, our reuse-folding
identity `DRAM_bytes(operand) = footprint(operand) × Π_{d∉operand} ⌈extent[d]/tile[d]⌉`
must reproduce ZigZag's per-operand DRAM traffic — and it does, to the byte.

We **match ratios / access-counts, not absolute pJ** (energy depends on
technology-node access costs that differ from our roofline).

---

## 1. Environment blocker + exact install (isolated venv, never committed)

- Host default interpreter is Python **3.14** (linuxbrew). `zigzag-dse` 3.8.5 pulls
  `onnx`, `numpy`, `pandas`, etc. that do **not** yet ship 3.14 wheels, so the
  install must use **Python 3.11**. This is the only env gotcha.
- The venv and ZigZag run-dumps are git-ignored (`.venv-zigzag/`, `outputs/`).

```bash
cd products/caw-07-tiling-ir/impl
python3.11 -m venv .venv-zigzag
. .venv-zigzag/bin/activate
pip install --upgrade pip
pip install zigzag-dse            # -> zigzag-dse 3.8.5 (this run)
pip install -e .                  # make caw07_tiling_ir importable in the venv
pip install pytest                # to run the gate below
```

Installed oracle: **zigzag-dse 3.8.5**, Python **3.11.14**.
(If the install ever fails on a host, the cross-check script degrades to a clear
message and the pytest gate SKIPs — see §5 — and the numbers recorded here stand
as the published reference.)

---

## 2. Configs used

- **Accelerator (primary):** ZigZag's bundled `inputs/hardware/gemm_l1_l3.yaml`
  — an 8×8×8 int8 operational array (512 MAC/cycle), an L1 of **943718 bits ≈ 115 KiB**
  (ZigZag's `size` is in *bits*; "128 KiB − 10%"), and an L3/DRAM backing store
  (512-bit rw port). **Mapping:** bundled `inputs/mapping/gemm_l1_l3.yaml`.
  *On-chip capacity is set faithfully on the twin but is **not consumed by the
  Phase-1 cost model** (`cost.derive()` never reads capacity — only `validate.py`'s
  I/O-lower-bound does), so it cannot influence or rig the DRAM-traffic result.*
- **Accelerator (divergence demo):** `impl/validation/configs/gemm_small_l1.yaml`
  — identical array + hierarchy but the L1 is shrunk to **8 KiB** to force the
  reduction dim to be tiled across DRAM. Same bundled mapping.
- **Workload:** a GEMM authored as `impl/validation/configs/gemm_workload.yaml`
  (used as a template; sizes are swept in code):
  `O[d0][d2] += I[d0][d1]*W[d1][d2]`, `operand_precision {I:8, W:8, O:16, O_final:8}`.
- **CAW-07 twin:** `gemm_twin(onchip_bytes)` in `validation/zigzag_crosscheck.py`
  mirrors the ZigZag accelerator — one 512-MAC/cycle int8 leaf (spatial
  parallelism folded into the peak rate, so our compute time equals ZigZag's
  **ideal / full-utilization** compute cycles), matching on-chip capacity, and a
  DRAM bandwidth = the L3 port width (512 bit/cycle) at a nominal 1 GHz (so
  `µs × 1e3 == cycles`). dtype = int8 (1 B), matching `O_final`.

---

## 3. How to run

```bash
# from products/caw-07-tiling-ir/impl, with .venv-zigzag active:
python validation/zigzag_crosscheck.py            # prints the comparison tables
pytest tests/test_zigzag_crosscheck.py -v          # the gate (SKIPs if no zigzag)
```

---

## 4. ACTUAL numbers observed (zigzag-dse 3.8.5)

Ridge point of the mirrored hardware = 512 MAC/cyc ÷ (512 bit/cyc ÷ 8) = **8 MAC/byte**.
`rel_err = |ours − zigzag| / zigzag`. "cycles" = ideal compute cycles (both models
assume the array runs at its nominal rate).

### 4a. Compute-bound — GEMM 512×512×512  (ZigZag-implied tiles m=32, k=512, n=512)

| metric               | ours        | zigzag      | rel_err | pass |
|----------------------|-------------|-------------|---------|------|
| total MACs           | 134,217,728 | 134,217,728 | exact   | ✅ |
| DRAM bytes [I]        | 262,144     | 262,144     | 0.00 %  | ✅ |
| DRAM bytes [W]        | 4,194,304   | 4,194,304   | 0.00 %  | ✅ |
| DRAM bytes [O]        | 262,144     | 262,144     | 0.00 %  | ✅ |
| DRAM bytes [total]    | 4,718,592   | 4,718,592   | 0.00 %  | ✅ |
| ideal compute cycles  | 262,144     | 262,144     | 0.00 %  | ✅ |
| roofline bound        | compute     | compute     | exact   | ✅ |
| *(info)* latency_total2 | 262,144   | 1,114,879   | —       | see §6 |

W is re-streamed 16× (once per M-block of 32) — our folding gives `⌈M/32⌉ = 16 ×`
the W footprint, matching ZigZag byte-for-byte; I and O are each moved once.

### 4b. Compute-bound — GEMM 256×256×512  (tiles m=64, k=256, n=512)

| metric               | ours       | zigzag     | rel_err | pass |
|----------------------|------------|------------|---------|------|
| total MACs           | 33,554,432 | 33,554,432 | exact   | ✅ |
| DRAM bytes [I]        | 65,536     | 65,536     | 0.00 %  | ✅ |
| DRAM bytes [W]        | 524,288    | 524,288    | 0.00 %  | ✅ |
| DRAM bytes [O]        | 131,072    | 131,072    | 0.00 %  | ✅ |
| DRAM bytes [total]    | 720,896    | 720,896    | 0.00 %  | ✅ |
| ideal compute cycles  | 65,536     | 65,536     | 0.00 %  | ✅ |
| roofline bound        | compute    | compute    | exact   | ✅ |
| *(info)* latency_total2 | 65,536   | 296,095    | —       | see §6 |

### 4c. Memory-bound — GEMM 16×16×16  (tiles m=16, k=16, n=16; everything resident)

Arithmetic intensity = 4096 MAC ÷ 768 B = **5.33 MAC/byte < 8 (ridge)** → both
models classify it **memory-bound**.

| metric               | ours  | zigzag | rel_err | pass |
|----------------------|-------|--------|---------|------|
| total MACs           | 4,096 | 4,096  | exact   | ✅ |
| DRAM bytes [I]        | 256   | 256    | 0.00 %  | ✅ |
| DRAM bytes [W]        | 256   | 256    | 0.00 %  | ✅ |
| DRAM bytes [O]        | 256   | 256    | 0.00 %  | ✅ |
| DRAM bytes [total]    | 768   | 768    | 0.00 %  | ✅ |
| ideal compute cycles  | 8     | 8      | 0.00 %  | ✅ |
| roofline bound        | memory| memory | exact   | ✅ |

### 4d. OUTPUT PARTIAL-SUM SPILL (now MODELED + asserted) — 512×512×512 on an 8 KiB L1

ZigZag-implied tiles m=512, k=128, n=32. The tiny L1 forces the reduction dim (k)
to be tiled across DRAM, so the output accumulator can't stay resident and is
**read-modify-written each k-block at accumulator precision** (ZigZag `O:16`).
`cost.py` now models this (per-operand placement + reduction-aware output traffic:
`footprint(O) × acc_bytes × 2 × k_trips` once the working set exceeds the on-chip
tier), so it matches ZigZag **exactly** — a 75% under-count before the
`iterator_types` + per-operand-placement upgrade; it is now asserted like the primaries:

| metric               | ours       | zigzag     | rel_err  | note |
|----------------------|------------|------------|----------|------|
| total MACs           | 134,217,728| 134,217,728| exact    | ✅ |
| DRAM bytes [I]        | 4,194,304  | 4,194,304  | 0.00 %   | ✅ |
| DRAM bytes [W]        | 262,144    | 262,144    | 0.00 %   | ✅ |
| **DRAM bytes [O]**    | **4,194,304** | **4,194,304** | **0.00 %** | ✅ RMW at acc precision |
| DRAM bytes [total]    | 8,650,752  | 8,650,752  | 0.00 %   | ✅ |
| roofline bound        | compute    | compute    | exact    | ✅ |

*(O = 512×512 × 2 B acc × 2 RMW × 4 k-trips = 4,194,304.)*

---

## 5. The gate (degrades cleanly)

`tests/test_zigzag_crosscheck.py` SKIPs cleanly when `zigzag-dse` is absent
(`HAVE_ZIGZAG` guard) and, when present, asserts: MACs exact, per-operand + total
DRAM bytes ≤ 15 %, ideal compute cycles ≤ 25 %, bound classification equal — for
the three primary cases **and the partial-sum-spill case** (now that spill is
modeled), plus a dedicated test that the spill case matches O + total exactly.
Observed:

```
tests/test_zigzag_crosscheck.py .......                                   [100%]
7 passed
# full suite: core 7 + validate 3 + zigzag 7
```

---

## 6. HONEST verdict — where we agree, where we diverge, and why

**Where our reuse-folding AGREES with ZigZag (exactly):**
- **Total MACs** — always exact; tiling changes time/traffic, never the op count.
- **Per-operand & total DRAM bytes** — for both the reuse-blocked regime AND the
  output partial-sum-spill regime. Our identity
  `bytes = footprint × Π_{non-indexed dims} ⌈extent/tile⌉`, plus the reduction-aware
  output term (write-once at final precision when the accumulator is resident;
  read-modify-write at accumulator precision when it spills across the reduction
  loop), reproduces ZigZag's DRAM traffic to the **byte** (0.00 % across all three
  primary cases AND the 8 KiB-L1 spill case — §4a–§4d). This includes the high
  weight-reuse blocking (W streamed 16× in §4a), the fully-resident minimal case
  (§4c), and the accumulator RMW (O = 4,194,304 in §4d).
- **Roofline bound** (compute vs memory) — agrees in every case, including a
  genuine memory-bound point (§4c, AI 5.33 < ridge 8). *Caveat: ZigZag does not
  emit a compute/memory verdict; the cross-check re-derives it by applying
  CAW-07's OWN classifier to ZigZag's byte/cycle outputs. So for the matched
  primaries (identical bytes + cycles) the agreement is arithmetic, not an
  independent ZigZag corroboration — it is a self-consistency check, exercised
  non-trivially only where the byte/cycle numbers differ (§4c memory-bound, §4d).*
- **Ideal compute cycles** — our roofline compute time equals ZigZag's
  `ideal_cycle` exactly, because we model the array at its nominal 512 MAC/cycle.
  *This match is exact BY CONSTRUCTION (same nominal rate) and holds only because
  ZigZag's chosen tiles evenly divide the extents here (powers of two); for an
  imperfectly-factorized tile our `ceil`'d fold over-counts compute — which is why
  the gate uses a 25% cycle tolerance, not an equality assertion.*

**Where we DIVERGE (and why):**
1. **Output partial-sum spill — NOW CLOSED (§4d).** Previously we under-counted O by
   75 % when the reduction dim was tiled across DRAM (accumulator can't stay
   resident). `cost.py` now models it: per-operand placement decides residency
   against the on-chip tier, and a non-resident output accumulator is
   read-modify-written each reduction block at accumulator precision — matching
   ZigZag exactly (O = 4,194,304, total = 8,650,752, 0.00 %). The remaining
   *scoped* gap is interacting **corner-tile remainders** (two remainder dims'
   short tile counted at full cost) — out of scope for single-level rectangular GEMM.
2. **Absolute latency vs our roofline.** ZigZag's `latency_total2` (§4a: 1,114,879
   vs our 262,144) is ~4.25× our ideal because the bundled GEMM mapping runs the
   8×8×8 array at only **0.25 spatial utilization** for a dense GEMM, plus
   on/off-loading stalls. Phase-1 is an *ideal-utilization roofline* and does not
   model spatial under-utilization or fine-grained stalls, so we deliberately
   compare against ZigZag's `ideal_cycle` (which also assumes full utilization) and
   report `latency_total2` for context only. *Phase-2 could fold a measured
   spatial-utilization factor into the peak rate.*
3. **Energy** is intentionally **not** compared numerically — technology-node access
   costs differ from our roofline; we validate access **counts/ratios**, not pJ.

**Bottom line.** On an independent analytical oracle, CAW-07's repetition-folding
engine is exact on MACs, exact on DRAM access bytes across BOTH the reuse-blocked
and the output-partial-sum-spill regimes, and correct on roofline classification.
The former 75 % O under-count is closed (per-operand placement + accumulator-precision
RMW); the only remaining scoped gap is interacting corner-tile remainders. That is
a strong, honest confidence signal for numbers on hardware that has no silicon yet.

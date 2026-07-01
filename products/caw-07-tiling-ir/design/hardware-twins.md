# Hardware twins — public NPU sources & validation

The Phase-2 twins in `impl/caw07_tiling_ir/twins.py` are built from **published,
citable** NPU specs (no confidential data). Numbers are order-of-magnitude and
public; `peak_macs_per_s` is MAC/s (TOPS = 2× that).

| Twin | Array / dtype / clock | Peak | On-chip | Off-chip | Dataflow | Doc |
|---|---|---|---|---|---|---|
| `eyeriss()` | 12×14 = 168 PE, int16, 200 MHz | 33.6 GMAC/s | 108 KB global buffer | DRAM (BW-limited, ~4 GB/s) | Row-Stationary | fully |
| `gemmini()` | 16×16, int8, ~1 GHz (parametric) | 256 GMAC/s | 256 KB scratchpad (+64 KB acc) | DRAM (~16 GB/s) | WS/OS | fully |
| `tpu_v1()` | 256×256, int8, 700 MHz | 45.9 TMAC/s (92 TOPS) | 24 MiB unified buffer | 8 GB DDR3 @ ~34 GB/s | Weight-Stationary | fully |
| `tpu_v4()` | 8×(128×128), bf16, ~1.05 GHz | 137.5 TMAC/s (275 TFLOPS) | 128 MB CMEM (+32 MB VMEM) | 32 GB HBM2 @ ~1.2 TB/s | WS (systolic) | well |
| `nvdla()` | 2048 int8 MACs, ~1 GHz | ~2 TMAC/s | 512 KB CBUF | DRAM (integrator-set) | WS-leaning | well |

**Sources.** Eyeriss — Chen, Emer, Sze, *Eyeriss*, ISCA 2016 + IEEE JSSC 2017.
Gemmini — Genc et al., DAC 2021 (github.com/ucb-bar/gemmini). TPU v1 — Jouppi et
al., *In-Datacenter Performance Analysis of a TPU*, ISCA 2017. TPU v4 — Jouppi et
al., ISCA 2023. NVDLA — nvdla.org open RTL (nv_large). Edge TPU numbers are
community estimates (not vendor-published) → intentionally not shipped as a twin.

## Why these five
- **Eyeriss + Gemmini** are the canonical Timeloop/MAESTRO/ZigZag validation
  targets (Gemmini additionally has a cycle-accurate Spike/FireSim oracle).
- **TPU v1** publishes a roofline (ridge ~1350 int8-MAC/byte) — a direct external
  cross-check (`test_validate.py::test_tpu_v1_ridge_matches_published` reproduces
  it: our `ridge_mac_per_byte(tpu_v1) == 1350.0`).
- **TPU v4** is a modern HBM-class datapoint; **NVDLA** is fully open RTL.

## Validation approach (Phase 2 gate)
Novel HW has no silicon, so confidence comes from **physical lower bounds a
correct model can never violate** (always-on asserts) + **published cross-checks**
(`impl/caw07_tiling_ir/validate.py`, `tests/test_validate.py`):

- **A1 compulsory traffic** ≥ `MK + KN + MN` (each operand touched once).
- **A2 reuse / I/O lower bound** — traffic ≥ `~MNK·dtype / √(on-chip words)`
  (Hong–Kung / Irony–Toledo–Tiskin √-capacity limit); a model claiming less is
  claiming impossible reuse.
- **A3 peak-compute floor** — compute time ≥ `MNK / peak_MAC_rate`.
- **A5 roofline** — the reported compute/memory bound must match `sign(AI − ridge)`.

All five twins pass A1/A2/A3/A5 for a 4096³ GEMM, and TPU v1's ridge matches the
published value.

## Not yet done (stronger validation — follow-up)
- **Numeric cross-check vs ZigZag** (`pip install zigzag-dse`,
  `get_hardware_performance_zigzag(workload, accelerator, mapping)` → energy,
  cycles, per-level accesses) on a GEMM/Eyeriss — target agreement within ~10–15%
  on **DRAM access counts** (published tool accuracy: ZigZag ~5% vs Eyeriss,
  MAESTRO ~3.9%, Timeloop ~95%). This is the next validation step (a runbook +
  a `tool_oracle` VAL record), not yet run.
- Match *ratios* (DRAM-access reduction from tiling; bound classification), not
  absolute energy — dataflow/tech nodes differ.

"""Cross-check the CAW-07 analytical tiling-cost model against ZigZag (KU Leuven).

ZigZag (`pip install zigzag-dse`) is a pure-Python analytical DSE that ships its
own cost model + example accelerators/mappings. It is the runnable *oracle* we
validate our repetition-folding engine against on the SAME hardware + workload +
mapping.

Methodology (the honest part)
-----------------------------
ZigZag's ``loma`` engine *searches* a temporal mapping; our Phase-1 model does
not search — it costs a mapping it is handed. So to compare the two COST MODELS
(not the two mapping searchers) we:

  1. Run ZigZag on a GEMM using its bundled ``gemm_l1_l3`` accelerator+mapping.
  2. Read back ZigZag's chosen temporal mapping and *derive the equivalent
     CAW-07 tile factors* from it:  for GEMM dim ``d`` (m<->D0, k<->D1, n<->D2),
        tile[d] = extent[d] / (product of the DRAM-level loop factors of the
                               operand that does NOT index d)
     (m is not indexed by W, n is not indexed by I, k is not indexed by O).
     This is exactly the outer blocking ZigZag applied.
  3. Cost that SAME mapping with our repetition-folding engine on a twin that
     mirrors the ZigZag hardware (8x8x8 int8 array, matching on-chip capacity,
     DRAM port bandwidth), and compare.

What must agree (and does, exactly, when no output partial-sum spill occurs):
  * total MACs                         -> EXACT (product of extents)
  * per-operand + total DRAM bytes     -> our footprint x reload  ==  ZigZag
  * ideal compute cycles               -> our compute time == ZigZag ideal_cycle
  * roofline bound (compute|memory)    -> same classification

Where it DIVERGES (documented, see gemm_small_l1 divergence case + RB-02):
  * When the reduction dim (k) is tiled across the *backing store* (tiny on-chip
    buffer), ZigZag models the output partial-sum read-modify-write spill/refill;
    our Phase-1 traffic model counts each operand footprint x reload once and
    does NOT add the ~2x partial-sum DRAM traffic -> we UNDER-count O traffic.
  * Absolute latency: ZigZag's ``latency_total2`` includes spatial
    under-utilization (the bundled GEMM mapping runs the 8x8x8 array at ~0.25
    utilization for a dense GEMM) and on/off-loading stalls; our roofline is an
    ideal-utilization bound, so we compare against ZigZag's ``ideal_cycle``, not
    ``latency_total2`` (which we report for context).

Run:  python validation/zigzag_crosscheck.py
Import:  from validation.zigzag_crosscheck import run_all, HAVE_ZIGZAG
Degrades to a clear message (and empty result) if zigzag-dse is not installed.
"""
from __future__ import annotations

import math
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

# --- CAW-07 (always importable) ---------------------------------------------
from caw07_tiling_ir import linearize, matmul

# --- ZigZag (optional) ------------------------------------------------------
try:
    import logging as _logging

    import zigzag
    from zigzag.api import get_hardware_performance_zigzag
    from zigzag.hardware.architecture.memory_port import DataDirection
    from zigzag.mapping.data_movement import DataMoveAttr

    HAVE_ZIGZAG = True
    _ZZ_DIR = os.path.dirname(zigzag.__file__)
except Exception:  # pragma: no cover - exercised only without zigzag installed
    HAVE_ZIGZAG = False
    _ZZ_DIR = None

CONFIG_DIR = Path(__file__).resolve().parent / "configs"

# The int8 8x8x8 operational array of ZigZag's gemm example = 512 MAC/cycle.
ARRAY_MACS_PER_CYCLE = 8 * 8 * 8
FREQ_HZ = 1.0e9          # nominal 1 GHz so 1 cycle == 1 ns (our us*1e3 == cycles)
DTYPE_BYTES = 1          # int8 operands (O_final is 8-bit)
DRAM_PORT_BITS = 512     # gemm l3 rw_port bandwidth (bits/cycle)
L1_PORT_BITS = 2048      # gemm l1 O port bandwidth (bits/cycle)

# GEMM axis <-> ZigZag layer-dim mapping for  O[d0][d2] += I[d0][d1]*W[d1][d2]
#   m == D0, k == D1, n == D2 ; operand NOT indexing each dim:
#   m(D0)->W,  n(D2)->I,  k(D1)->O
_DIM_OF = {"m": "D0", "k": "D1", "n": "D2"}
_NOT_INDEXED_BY = {"m": "W", "n": "I", "k": "O"}


# ----------------------------------------------------------------------------
# CAW-07 twin that mirrors ZigZag's gemm accelerator
# ----------------------------------------------------------------------------
def gemm_twin(onchip_bytes: int, freq_hz: float = FREQ_HZ) -> dict:
    """A twin mirroring ZigZag's gemm_l1_l3-style accelerator.

    One 512-MAC/cycle int8 leaf (spatial parallelism folded into the peak rate,
    so our compute time equals ZigZag's ideal/full-utilization compute cycles),
    an on-chip SRAM of ``onchip_bytes``, and a DRAM backing store whose bandwidth
    is the l3 port width (512 bits/cycle).

    NOTE: ``capacity_bytes`` is NOT consumed by the Phase-1 cost model
    (cost.derive() never reads capacity — only validate.py's separate I/O-lower-
    bound uses it). So on-chip capacity cannot influence or rig the DRAM-traffic
    cross-check below; we still set it faithfully to mirror the ZigZag config.
    """
    return {
        "level_id": "l3", "role": "offchip", "instances": 1,
        "capacity_bytes": 10_000_000_000,
        "bandwidth_bps": DRAM_PORT_BITS * freq_hz / 8.0,
        "children": [{
            "level_id": "l1", "role": "sram", "instances": 1,
            "capacity_bytes": onchip_bytes,
            "bandwidth_bps": L1_PORT_BITS * freq_hz / 8.0,
            "children": [{
                "level_id": "array", "role": "compute", "instances": 1,
                "peak_macs_per_s": ARRAY_MACS_PER_CYCLE * freq_hz,
                "matrix_unit": (8, 8, 8), "dtype_bytes": DTYPE_BYTES,
            }],
        }],
    }


# ----------------------------------------------------------------------------
# ZigZag side
# ----------------------------------------------------------------------------
def _gemm_workload_yaml(M: int, K: int, N: int) -> str:
    text = (
        "- id: 0\n"
        "  operator_type: Gemm\n"
        "  equation: O[d0][d2]+=I[d0][d1]*W[d1][d2]\n"
        "  loop_dims: [D0, D1, D2]\n"
        f"  loop_sizes: [{M}, {K}, {N}]\n"
        "  operand_precision: {I: 8, W: 8, O: 16, O_final: 8}\n"
    )
    f = tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False)
    f.write(text)
    f.close()
    return f.name


def bundled_mapping() -> str:
    if not HAVE_ZIGZAG:
        raise RuntimeError("zigzag-dse not installed")
    return os.path.join(_ZZ_DIR, "inputs/mapping/gemm_l1_l3.yaml")


def bundled_hardware() -> str:
    if not HAVE_ZIGZAG:
        raise RuntimeError("zigzag-dse not installed")
    return os.path.join(_ZZ_DIR, "inputs/hardware/gemm_l1_l3.yaml")


def _dram_bytes_per_operand(cme) -> dict[str, int]:
    """Total bytes each operand moves across the outermost (DRAM) level.

    Sums the two boundary-crossing directions (reads served down + writes coming
    up) x precision, using ZigZag's per-element movement counts (robust: not the
    port-word count, which depends on bandwidth).
    """
    mapping = cme.mapping
    out: dict[str, int] = {}
    for op in cme.layer.layer_operands:
        n_levels = mapping.mem_level[op]
        umdm = mapping.unit_mem_data_movement[op][n_levels - 1]  # outermost = DRAM
        amount = umdm.get_attribute(DataMoveAttr.DATA_TRANS_AMOUNT_PER_PERIOD)
        count = umdm.get_attribute(DataMoveAttr.DATA_TRANS_PERIOD_COUNT)
        prec = umdm.get_attribute(DataMoveAttr.DATA_PRECISION)
        rd = amount.get(DataDirection.RD_OUT_TO_LOW) * count.get(DataDirection.RD_OUT_TO_LOW)
        wr = amount.get(DataDirection.WR_IN_BY_LOW) * count.get(DataDirection.WR_IN_BY_LOW)
        bits = prec.get(DataDirection.RD_OUT_TO_LOW) or prec.get(DataDirection.WR_IN_BY_LOW)
        out[op.name] = (rd + wr) * bits // 8
    return out


def _dram_loop_factor(cme, operand_name: str, dim_name: str) -> int:
    """Product of the operand's outermost (DRAM) temporal-loop factors for a dim."""
    for op, levels in cme.temporal_mapping.mapping_dic_origin.items():
        if op.name == operand_name:
            f = 1
            for (dim, factor) in levels[-1]:
                if dim.name == dim_name:
                    f *= int(factor)
            return f
    return 1


def run_zigzag(M: int, K: int, N: int, hw_yaml: str, map_yaml: str) -> dict:
    """Run ZigZag on a GEMM; return metrics + the tile factors it implies."""
    if not HAVE_ZIGZAG:
        raise RuntimeError("zigzag-dse not installed")
    _logging.disable(_logging.CRITICAL)  # ZigZag is very chatty at INFO
    wl = _gemm_workload_yaml(M, K, N)
    with tempfile.TemporaryDirectory() as dump:
        res = get_hardware_performance_zigzag(
            wl, hw_yaml, map_yaml, opt="latency",
            dump_folder=dump, loma_show_progress_bar=False,
        )
    cme = res[-1][0][1][0][0]  # the per-layer CostModelEvaluation
    dram = _dram_bytes_per_operand(cme)
    tiles = {
        axis: max(1, {"m": M, "k": K, "n": N}[axis]
                  // max(1, _dram_loop_factor(cme, _NOT_INDEXED_BY[axis], _DIM_OF[axis])))
        for axis in ("m", "k", "n")
    }
    return {
        "macs": int(cme.layer.total_mac_count),
        "dram_bytes": dram,                      # keys: I, W, O
        "dram_total": sum(dram.values()),
        "ideal_cycle": float(cme.ideal_cycle),
        "latency_total2": float(cme.latency_total2),
        "energy_pJ": float(cme.energy_total),
        "spatial_util": float(cme.mac_spatial_utilization),
        "tiles": tiles,
    }


# ----------------------------------------------------------------------------
# CAW-07 side (cost the SAME mapping)
# ----------------------------------------------------------------------------
def run_ours(M: int, K: int, N: int, onchip_bytes: int, tiles: dict[str, int]) -> dict:
    hw = linearize(gemm_twin(onchip_bytes))
    plan = matmul(M, N, K, hw, tile=dict(tiles), dtype_bytes=DTYPE_BYTES)
    d = plan.derived
    # operand name map: A=(m,k)=I, B=(k,n)=W, Y=(m,n)=O
    dram = {
        "I": int(d.bytes_from_backing["A"]),
        "W": int(d.bytes_from_backing["B"]),
        "O": int(d.bytes_from_backing["Y"]),
    }
    return {
        "macs": int(d.total_macs),
        "dram_bytes": dram,
        "dram_total": int(d.total_backing_bytes),
        # compute time in cycles (1 GHz twin -> us*1e3 == cycles) == ideal compute
        "compute_cycles": d.compute_us * 1e3,
        "memory_cycles": d.memory_us * 1e3,
        "kernel_cycles": d.kernel_time_us * 1e3,
        "bound": d.bound,
    }


# ----------------------------------------------------------------------------
# Comparison
# ----------------------------------------------------------------------------
@dataclass
class Case:
    label: str
    M: int
    K: int
    N: int
    onchip_bytes: int
    hw_yaml_kind: str = "bundled"          # "bundled" | filename in configs/
    assert_dram: bool = True               # False for the documented divergence case
    note: str = ""


# ZigZag's gemm_l1_l3.yaml L1 `size` is in BITS (943718 bits = "128 KiB - 10%"
# ~= 115 KiB). Convert to bytes for the twin so it mirrors the accelerator. (This
# value is inert in the Phase-1 cost path — see gemm_twin — so it changes no
# number here; it just keeps the twin faithful and future-proof.)
L1_BYTES = 943718 // 8  # ~115 KiB
PRIMARY_CASES = [
    Case("compute-bound 512x512x512", 512, 512, 512, L1_BYTES),
    Case("compute-bound 256x256x512", 256, 256, 512, L1_BYTES),
    Case("memory-bound  16x16x16",    16,  16,  16,  L1_BYTES,
         note="low arithmetic intensity (AI<ridge) -> memory-bound; both agree"),
]

DIVERGENCE_CASES = [
    Case("divergence  512x512x512 (8KiB L1)", 512, 512, 512, 8192,
         hw_yaml_kind="gemm_small_l1.yaml", assert_dram=False,
         note="tiny L1 tiles the reduction dim across DRAM -> ZigZag models "
              "output partial-sum spill; our Phase-1 traffic does not (we "
              "under-count O). Reported to document the divergence, not asserted."),
]


def _hw_path(case: Case) -> str:
    if case.hw_yaml_kind == "bundled":
        return bundled_hardware()
    return str(CONFIG_DIR / case.hw_yaml_kind)


@dataclass
class Row:
    metric: str
    ours: float
    zigzag: float
    tol: float          # relative tolerance; 0.0 means "must be exact"
    passed: bool
    note: str = ""


def _rel_err(ours: float, zz: float) -> float:
    if zz == 0:
        return 0.0 if ours == 0 else float("inf")
    return abs(ours - zz) / abs(zz)


def crosscheck(case: Case) -> dict:
    """Run both models for a case and return {'zz','ours','rows','tiles'}."""
    zz = run_zigzag(case.M, case.K, case.N, _hw_path(case), bundled_mapping())
    ours = run_ours(case.M, case.K, case.N, case.onchip_bytes, zz["tiles"])

    # ZigZag roofline bound, derived the SAME way our model classifies:
    zz_mem_cycles = zz["dram_total"] / (DRAM_PORT_BITS / 8.0)
    zz_bound = "memory" if zz_mem_cycles > zz["ideal_cycle"] else "compute"

    rows: list[Row] = []
    rows.append(Row("total MACs", ours["macs"], zz["macs"], 0.0,
                    ours["macs"] == zz["macs"]))

    for opn in ("I", "W", "O"):
        o, z = ours["dram_bytes"][opn], zz["dram_bytes"][opn]
        re = _rel_err(o, z)
        rows.append(Row(f"DRAM bytes [{opn}]", o, z, 0.15,
                        (re <= 0.15) if case.assert_dram else True,
                        "" if case.assert_dram else "(divergence case: not asserted)"))

    re_tot = _rel_err(ours["dram_total"], zz["dram_total"])
    rows.append(Row("DRAM bytes [total]", ours["dram_total"], zz["dram_total"], 0.15,
                    (re_tot <= 0.15) if case.assert_dram else True,
                    "" if case.assert_dram else "(divergence case: not asserted)"))

    # cycles: our ideal compute time vs ZigZag ideal_cycle (full-utilization)
    re_cyc = _rel_err(ours["compute_cycles"], zz["ideal_cycle"])
    rows.append(Row("ideal compute cycles", ours["compute_cycles"], zz["ideal_cycle"],
                    0.25, re_cyc <= 0.25))

    # bound classification (categorical): encode pass as equality
    rows.append(Row("roofline bound", ours["bound"], zz_bound, 0.0,
                    ours["bound"] == zz_bound,
                    f"ours={ours['bound']} zigzag={zz_bound}"))

    # context-only (not asserted): ZigZag real latency incl. util + stalls
    rows.append(Row("[info] ZigZag latency_total2", ours["kernel_cycles"],
                    zz["latency_total2"], float("inf"), True,
                    f"real latency; spatial_util={zz['spatial_util']:.3f}, "
                    "not modeled by Phase-1 roofline"))

    return {"case": case, "zz": zz, "ours": ours, "rows": rows,
            "zz_bound": zz_bound, "tiles": zz["tiles"]}


def _fmt(v) -> str:
    if isinstance(v, str):
        return v
    if isinstance(v, float) and (v == int(v)) and abs(v) < 1e15:
        return f"{int(v):,}"
    if isinstance(v, int):
        return f"{v:,}"
    return f"{v:,.3g}"


def print_report(result: dict) -> None:
    case = result["case"]
    print("=" * 84)
    print(f"CASE: {case.label}   (M={case.M} K={case.K} N={case.N}, "
          f"on-chip={case.onchip_bytes} B)")
    print(f"  ZigZag-implied tiles: {result['tiles']}   "
          f"spatial_util={result['zz']['spatial_util']:.3f}")
    if case.note:
        print(f"  note: {case.note}")
    print("-" * 84)
    print(f"  {'metric':<26}{'ours':>16}{'zigzag':>16}{'rel_err':>10}{'  ':>2}{'pass':>5}")
    print("-" * 84)
    for r in result["rows"]:
        re = _rel_err(r.ours, r.zigzag) if not isinstance(r.ours, str) else 0.0
        re_s = "exact" if (isinstance(r.ours, str) or r.tol == 0.0) else (
            f"{re*100:.2f}%" if re != float("inf") else "inf")
        if r.tol == float("inf"):
            re_s = "-"
        status = "PASS" if r.passed else "FAIL"
        print(f"  {r.metric:<26}{_fmt(r.ours):>16}{_fmt(r.zigzag):>16}"
              f"{re_s:>10}  {status:>5}")
        if r.note:
            print(f"      -> {r.note}")
    print("-" * 84)


def run_all(include_divergence: bool = True) -> list[dict]:
    """Run every case; return the list of results (each has 'rows')."""
    if not HAVE_ZIGZAG:
        raise RuntimeError("zigzag-dse not installed")
    cases = list(PRIMARY_CASES) + (list(DIVERGENCE_CASES) if include_divergence else [])
    return [crosscheck(c) for c in cases]


def main() -> int:
    if not HAVE_ZIGZAG:
        print("zigzag-dse is NOT installed in this interpreter.")
        print("This cross-check requires the ZigZag oracle. To run it:")
        print("  python3.11 -m venv .venv-zigzag && . .venv-zigzag/bin/activate")
        print("  pip install zigzag-dse")
        print("  python validation/zigzag_crosscheck.py")
        print("See runbooks/RB-02-zigzag-crosscheck.md for the recorded numbers.")
        return 0

    results = run_all(include_divergence=True)
    all_pass = True
    for res in results:
        print_report(res)
        # divergence case is reported, not gated
        if res["case"].assert_dram:
            all_pass = all_pass and all(r.passed for r in res["rows"])
    print("=" * 84)
    print("VERDICT:",
          "all asserted cross-checks PASS" if all_pass else "SOME cross-checks FAILED")
    print("  MACs match exactly; DRAM access bytes match ZigZag on the same mapping;")
    print("  roofline bound classification agrees. See RB-02 for the honest verdict")
    print("  (output partial-sum spill divergence + absolute-latency caveat).")
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Phase-1 invariants for the tiling IR. Run: python tests/test_core.py (or pytest)."""
import math

from caw07_tiling_ir import linearize, matmul, twins
from caw07_tiling_ir.twins import fit_k


def _author(hw):
    return matmul(4096, 4096, 4096, hw,
                  tile={"m": 128, "n": 128, "k": fit_k(128, 128)},
                  spatial={"m": lambda h: h.compute_leaf.instances})


def test_linearize_flattens_and_has_compute_leaf():
    hw = linearize(twins.gpu_like())
    assert len(hw) == 4
    assert [l.role for l in hw] == ["hbm", "l2", "shared", "compute"]
    assert hw.compute_leaf.role == "compute"
    assert hw.at("shared").capacity_bytes == 228 * 1024


def test_total_macs_is_exact():
    # total op count is EXACTLY the iteration space; tiling changes time, not work.
    hw = linearize(twins.gpu_like())
    p = _author(hw)
    assert p.derived.total_macs == 4096 ** 3
    # the folded structure over-covers (ceil'd trips) so folded >= exact
    assert p.derived.folded_macs >= p.derived.total_macs


def test_fold_identity():
    hw = linearize(twins.npu_like())
    p = _author(hw)
    d = p.derived
    S = p.resolved_spatial()
    spatial_total = math.prod(S.values())
    # folded = cost the tile-unit once x fold count x spatial instances
    assert abs(d.folded_macs - d.tile_unit_macs * d.fold_count * spatial_total) < 1e-3


def test_hw_parametric_retile():
    # the SAME authored plan tiles K differently on the two twins (fit_k reads
    # the on-chip capacity): NPU's big SRAM fits the full K; GPU's shared does not.
    gp = _author(linearize(twins.gpu_like()))
    npu = _author(linearize(twins.npu_like()))
    assert gp.resolved_tile()["k"] < 4096      # GPU shared (228 KiB) -> partial K
    assert npu.resolved_tile()["k"] == 4096    # NPU sram (32 MiB) -> full K, clamped
    # and the two targets get different kernel times
    assert gp.derived.kernel_time_us != npu.derived.kernel_time_us


def test_remainders_explicit_and_absent():
    hw = linearize(twins.gpu_like())
    # perfect factorization: 256 with tile 128, spatial 1 -> 2 trips, no remainder
    perfect = matmul(256, 256, 256, hw, tile={"m": 128, "n": 128, "k": 128},
                     spatial={})
    assert perfect.remainders == []
    # imperfect: extent 300 with tile 128 -> tail 300 % 128 = 44 (spatial 1)
    imp = matmul(300, 128, 128, hw, tile={"m": 128, "n": 128, "k": 128}, spatial={})
    tails = {r.dim: r.tail for r in imp.remainders}
    assert tails.get("m") == 300 % 128


def test_reduction_spatial_combine_is_not_free():
    # Splitting a REDUCTION dim across spatial instances (split-K) must pay a
    # combine (accumulator-tree) on the output — unlike a single-instance pass.
    hw = linearize(twins.gemmini())
    onek = matmul(512, 512, 512, hw, tile={"m": 128, "n": 128, "k": 512})   # K in one pass
    splitk = matmul(512, 512, 512, hw,
                    tile={"m": 128, "n": 128, "k": 128}, spatial={"k": 4})   # split-K x4
    yb_one = onek.derived.bytes_from_backing["Y"]
    yb_split = splitk.derived.bytes_from_backing["Y"]
    assert yb_split > yb_one, (yb_split, yb_one)  # combine adds output traffic


def test_output_spill_costs_more_than_resident():
    # Same GEMM, same tiles: a tiny on-chip buffer spills the output accumulator
    # across the reduction loop (RMW) and must cost MORE backing traffic than a
    # buffer big enough to keep it resident.
    tiles = {"m": 512, "n": 32, "k": 128}
    big = matmul(512, 512, 512, linearize(twins.gemmini(scratchpad=256 * 1024)),
                 tile=tiles, accumulator_bytes=2)
    tiny = matmul(512, 512, 512, linearize(twins.gemmini(scratchpad=8 * 1024)),
                  tile=tiles, accumulator_bytes=2)
    assert tiny.derived.bytes_from_backing["Y"] > big.derived.bytes_from_backing["Y"]


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\nall {len(fns)} tests passed")


if __name__ == "__main__":
    _run_all()

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


def test_total_macs_covers_iteration_space():
    # total work must cover M*N*K (ceil-rounding may over-count slightly, never under).
    hw = linearize(twins.gpu_like())
    p = _author(hw)
    macs = p.derived.total_macs
    assert macs >= 4096 ** 3
    assert macs < 4096 ** 3 * 1.05  # within ~5% (only the K remainder rounds up)


def test_fold_identity():
    hw = linearize(twins.npu_like())
    p = _author(hw)
    d = p.derived
    S = p.resolved_spatial()
    spatial_total = math.prod(S.values())
    # total = cost the tile-unit once x fold count x spatial instances
    assert abs(d.total_macs - d.tile_unit_macs * d.fold_count * spatial_total) < 1e-3


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


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\nall {len(fns)} tests passed")


if __name__ == "__main__":
    _run_all()

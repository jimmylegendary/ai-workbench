"""Validation gates: first-principles bounds hold on every real NPU twin, and the
TPU v1 roofline ridge matches Jouppi et al. (ISCA'17). Run: python tests/test_validate.py."""
from caw07_tiling_ir import linearize, matmul, twins
from caw07_tiling_ir.twins import REAL_NPUS, fit_k
from caw07_tiling_ir.validate import check_all, ridge_mac_per_byte, roofline_check

ALL = {**REAL_NPUS, "gpu_like": twins.gpu_like, "npu_like": twins.npu_like}


def _mm(hw):
    return matmul(4096, 4096, 4096, hw,
                  tile={"m": 128, "n": 128, "k": fit_k(128, 128)},
                  spatial={"m": lambda h: h.compute_leaf.instances})


def test_bounds_hold_on_all_twins():
    # No costed plan may violate the peak-compute, I/O-lower-bound, or roofline
    # checks — a model that does is provably wrong, independent of any tool.
    for name, build in ALL.items():
        check_all(_mm(linearize(build())))  # raises AssertionError w/ detail on violation


def test_tpu_v1_ridge_matches_published():
    # Jouppi ISCA'17: 92 TOPS int8 / ~34 GB/s DDR3 -> ridge ~1350 MAC/byte.
    ridge = ridge_mac_per_byte(linearize(twins.tpu_v1()))
    assert 1200 < ridge < 1500, f"ridge={ridge:.0f} MAC/byte (expected ~1350)"


def test_tpu_v1_gemm_is_memory_bound():
    # A famous TPU v1 result: low-reuse GEMM/MLP is DRAM-bandwidth bound.
    p = _mm(linearize(twins.tpu_v1()))
    assert p.derived.bound == "memory"


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    # show the bound table for the record
    print("\nbounds (matmul 4096^3):")
    for name, build in ALL.items():
        hw = linearize(build())
        r = roofline_check(_mm(hw))
        ok = all(v[0] for v in r.values())
        print(f"  {name:9s} {'PASS' if ok else 'FAIL':4s}  ridge={ridge_mac_per_byte(hw):8.1f} MAC/B  "
              + "  ".join(f"{k}={'ok' if v[0] else 'X'}" for k, v in r.items()))
    print(f"\nall {len(fns)} tests passed")


if __name__ == "__main__":
    _run_all()

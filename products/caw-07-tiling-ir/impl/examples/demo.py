"""Phase-1 demo: the SAME authored tiling plan, re-costed on a GPU-like and an
NPU-like twin (with no compiler), for matmul and attention.

The plan's K tile and spatial fanout are *functions of the hardware stack*, so
switching the twin re-tiles the plan automatically — the point of the IR.
"""
from caw07_tiling_ir import attention, linearize, matmul, render, twins
from caw07_tiling_ir.twins import fit_k


def author_matmul(hw):
    # m,n: a fixed threadblock/array tile; k: capacity-driven (differs per HW);
    # spatial: spread M across however many compute instances the twin has.
    return matmul(
        4096, 4096, 4096, hw,
        tile={"m": 128, "n": 128, "k": fit_k(128, 128)},
        spatial={"m": lambda h: h.compute_leaf.instances},
    )


def author_attention(hw):
    return attention(
        2, 32, 2048, 2048, 128, hw,
        tile={"sq": 128, "sk": 128, "d": 128},
        spatial={"sq": lambda h: h.compute_leaf.instances},
    )


def main() -> None:
    for name, twin in [("GPU-like", twins.gpu_like()), ("NPU-like", twins.npu_like())]:
        hw = linearize(twin)
        print("=" * 74)
        print(f"{name}   stack: " + " -> ".join(f"{l.level_id}({l.role})" for l in hw))
        print("-" * 74)
        p = author_matmul(hw)
        print(render(p))
        print("-- attention (fused = scores + out) --")
        total = 0.0
        for pl in author_attention(hw):
            print(render(pl))
            total += pl.derived.kernel_time_us
        print(f"  => attention fused kernel time ~= {total:.1f} us")
    print("=" * 74)
    print("Note: identical authored plans; the twin drives K-tile (capacity) and")
    print("spatial fanout, so the two hardware targets get different tilings + costs.")


if __name__ == "__main__":
    main()

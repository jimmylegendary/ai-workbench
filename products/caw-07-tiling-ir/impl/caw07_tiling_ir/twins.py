"""Example hardware twins + HW-parametric tile-factor helpers.

The twins are nested dicts (an outer memory tier holding inner tiers, down to a
compute leaf) so ``linearize`` demonstrates flattening an arbitrary structure.
A GPU-like and an NPU-like target are two linearizations of the same primitive;
the *same* authored plan (using the factor helpers below) re-tiles on each.

Numbers are illustrative, order-of-magnitude, exploration-grade — not a spec.
"""
from __future__ import annotations

from .hw import LevelStack
from .plan import Factor

KB = 1024
MB = 1024 * 1024
GB = 1024 * 1024 * 1024


def gpu_like() -> dict:
    """A GPU-like target: HBM -> L2 -> shared (per-SM) -> tensor-core leaf."""
    return {
        "level_id": "hbm", "role": "hbm", "instances": 1,
        "capacity_bytes": 80 * GB, "bandwidth_bps": 3.35e12,  # ~3.35 TB/s
        "children": [{
            "level_id": "l2", "role": "l2", "instances": 1,
            "capacity_bytes": 50 * MB, "bandwidth_bps": 8.0e12,
            "children": [{
                "level_id": "shared", "role": "shared", "instances": 132,
                "spatial_axis": "sm", "capacity_bytes": 228 * KB,
                "bandwidth_bps": 2.0e13,
                "children": [{
                    "level_id": "tensor_core", "role": "compute",
                    "instances": 132, "spatial_axis": "sm",
                    "peak_macs_per_s": 3.75e12,   # per SM (~7.5 TFLOP16/SM)
                    "matrix_unit": (16, 16, 16),
                }],
            }],
        }],
    }


def npu_like() -> dict:
    """An NPU-like target: DRAM -> SRAM scratchpad -> 128x128 systolic PE array."""
    return {
        "level_id": "dram", "role": "dram", "instances": 1,
        "capacity_bytes": 16 * GB, "bandwidth_bps": 1.2e12,  # ~1.2 TB/s
        "children": [{
            "level_id": "sram", "role": "sram", "instances": 1,
            "capacity_bytes": 32 * MB, "bandwidth_bps": 4.0e12,
            "children": [{
                "level_id": "pe_array", "role": "compute", "instances": 1,
                "spatial_axis": "pe",
                # a 128x128 array at ~0.94 GHz ~= 1.54e13 MAC/s (whole array)
                "peak_macs_per_s": 128 * 128 * 0.94e9,
                "matrix_unit": (128, 128, 1),
            }],
        }],
    }


# --- HW-parametric factors (functions of the linearized stack) --------------
def mu(index: int, default: int = 16) -> Factor:
    """Tile factor = the compute leaf's matrix-unit dim (0=m,1=n,2=k)."""
    def f(hw: LevelStack) -> int:
        m = hw.compute_leaf.matrix_unit
        return int(m[index]) if m else default
    return f


def fit_k(m_tile: int = 128, n_tile: int = 128, dtype_bytes: int = 2) -> Factor:
    """Choose a K tile so an (m_tile x K) + (K x n_tile) working set fits the
    smallest on-chip scratchpad (shared/sram/l2).  A capacity-driven factor
    (Timeloop/ZigZag style): bigger on-chip memory -> larger K tile -> more reuse.
    """
    def f(hw: LevelStack) -> int:
        cap = None
        for role in ("shared", "sram", "l2"):
            lv = hw.at(role)
            if lv and lv.capacity_bytes:
                cap = lv.capacity_bytes
                break
        if not cap:
            return 64
        # (m_tile + n_tile) * K * dtype_bytes <= cap  (leave half for output)
        k = int((cap // 2) // ((m_tile + n_tile) * dtype_bytes))
        return max(16, k)
    return f

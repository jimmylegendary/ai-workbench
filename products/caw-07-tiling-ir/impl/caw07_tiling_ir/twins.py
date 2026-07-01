"""Hardware twins + HW-parametric tile-factor helpers.

Twins are nested dicts (outer memory tier -> ... -> compute leaf) so
``linearize`` demonstrates flattening an arbitrary structure.  The ``gpu_like``
and ``npu_like`` twins are illustrative; the named functions below
(``eyeriss``/``gemmini``/``tpu_v1``/``tpu_v4``/``nvdla``) are *faithful* twins
built from published specs — see docstrings for citations.  All numbers are
public and order-of-magnitude; ``peak_macs_per_s`` is MACs/s (TOPS = 2x that).
"""
from __future__ import annotations

from .hw import LevelStack
from .plan import Factor

KB = 1024
MB = 1024 * 1024
GB = 1024 * 1024 * 1024


# --- illustrative twins (pedagogical) ---------------------------------------
def gpu_like() -> dict:
    """A GPU-like target: HBM -> L2 -> shared (per-SM) -> tensor-core leaf."""
    return {
        "level_id": "hbm", "role": "hbm", "instances": 1,
        "capacity_bytes": 80 * GB, "bandwidth_bps": 3.35e12,
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
                    "peak_macs_per_s": 3.75e12, "matrix_unit": (16, 16, 16),
                    "dtype_bytes": 2,
                }],
            }],
        }],
    }


def npu_like() -> dict:
    """A generic NPU-like target: DRAM -> SRAM -> 128x128 systolic leaf."""
    return _systolic("dram", 16 * GB, 1.2e12, "sram", 32 * MB,
                     dim=128, peak_total=128 * 128 * 0.94e9, dtype_bytes=2)


# --- faithful, published NPU twins ------------------------------------------
def _systolic(dram_role: str, dram_cap: int, dram_bw: float,
              onchip_role: str, onchip_cap: int, dim: int,
              peak_total: float, dtype_bytes: int, instances: int = 1,
              onchip_bw: float = 2.0e13) -> dict:
    """A 3-tier systolic twin: off-chip -> on-chip buffer -> array leaf.

    ``peak_total`` is the aggregate MAC/s of the array(s); split across
    ``instances`` compute units.
    """
    return {
        "level_id": dram_role, "role": "offchip", "instances": 1,
        "capacity_bytes": dram_cap, "bandwidth_bps": dram_bw,
        "children": [{
            "level_id": onchip_role, "role": onchip_role, "instances": 1,
            "capacity_bytes": onchip_cap, "bandwidth_bps": onchip_bw,
            "children": [{
                "level_id": "array", "role": "compute",
                "instances": instances, "spatial_axis": "pe",
                "peak_macs_per_s": peak_total / instances,
                "matrix_unit": (dim, dim, 1), "dtype_bytes": dtype_bytes,
            }],
        }],
    }


def eyeriss() -> dict:
    """Eyeriss v1 (Chen/Emer/Sze, ISCA'16, JSSC'17). 12x14=168 PE, 16b, 200 MHz,
    108 KB global buffer, DRAM-BW-limited. Canonical Timeloop/MAESTRO target."""
    return _systolic("dram", 1 * GB, 4e9, "global_buffer", 108 * KB,
                     dim=13, peak_total=3.36e10, dtype_bytes=2, onchip_bw=1e12)


def gemmini(dim: int = 16, scratchpad: int = 256 * KB, freq_ghz: float = 1.0,
            dtype_bytes: int = 1, dram_bw: float = 16e9) -> dict:
    """Gemmini default (Genc et al., DAC'21; github.com/ucb-bar/gemmini).
    Fully parametric — sweep dim/scratchpad/dtype. Has a cycle-accurate oracle."""
    return _systolic("dram", 8 * GB, dram_bw, "scratchpad", scratchpad,
                     dim=dim, peak_total=dim * dim * freq_ghz * 1e9,
                     dtype_bytes=dtype_bytes)


def tpu_v1() -> dict:
    """Google TPU v1 (Jouppi et al., ISCA'17). 256x256 int8 MXU, 700 MHz,
    92 TOPS (45.9 TMAC/s), 24 MiB unified buffer, 8 GB DDR3 @ ~34 GB/s.
    Published roofline ridge ~1350 int8-ops/byte."""
    return _systolic("ddr3", 8 * GB, 34e9, "unified_buffer", 24 * MB,
                     dim=256, peak_total=4.59e13, dtype_bytes=1)


def tpu_v4() -> dict:
    """Google TPU v4 single chip (Jouppi et al., ISCA'23). 8 MXUs of 128x128
    bf16, 275 TFLOPS (137.5 TMAC/s), 128 MB CMEM, 32 GB HBM2 @ ~1.2 TB/s."""
    return _systolic("hbm", 32 * GB, 1.2e12, "cmem", 128 * MB,
                     dim=128, peak_total=1.375e14, dtype_bytes=2, instances=8)


def nvdla() -> dict:
    """NVDLA nv_large (open RTL). 2048 int8 MACs (~2 TMAC/s @1GHz), 512 KB CBUF;
    off-chip BW is integrator-chosen (assume ~16 GB/s)."""
    return _systolic("dram", 4 * GB, 16e9, "conv_buffer", 512 * KB,
                     dim=45, peak_total=2.05e12, dtype_bytes=1)  # 45^2~=2048 lanes


#: registry of faithful twins (name -> builder) for validation/sweeps
REAL_NPUS = {
    "eyeriss": eyeriss,
    "gemmini": gemmini,
    "tpu_v1": tpu_v1,
    "tpu_v4": tpu_v4,
    "nvdla": nvdla,
}


# --- HW-parametric factors --------------------------------------------------
def mu(index: int, default: int = 16) -> Factor:
    """Tile factor = the compute leaf's matrix-unit dim (0=m,1=n,2=k)."""
    def f(hw: LevelStack) -> int:
        m = hw.compute_leaf.matrix_unit
        return int(m[index]) if m else default
    return f


def fit_k(m_tile: int = 128, n_tile: int = 128) -> Factor:
    """Choose a K tile so an (m_tile x K)+(K x n_tile) working set fits the
    INNERMOST on-chip memory tier (Timeloop/ZigZag capacity-driven tiling):
    bigger on-chip memory -> larger K tile -> more reuse."""
    def f(hw: LevelStack) -> int:
        mem = hw.memory_levels
        cap = mem[-1].capacity_bytes if mem and mem[-1].capacity_bytes else None
        dtb = hw.compute_leaf.dtype_bytes or 2
        if not cap:
            return 64
        k = int((cap // 2) // ((m_tile + n_tile) * dtb))
        return max(16, k)
    return f

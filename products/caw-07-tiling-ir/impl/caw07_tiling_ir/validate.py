"""First-principles validation of a costed plan.

Novel HW has no silicon, so the honest confidence for our analytical numbers is
(1) physical LOWER BOUNDS a correct model can never violate, and (2) cross-checks
against published roofline points. This module turns those into checkable facts.

Bounds used (for a contraction like GEMM, exact-work = product of extents):
  * peak-compute:  compute_time >= total_MACs / peak_MAC_rate
  * min traffic:   backing_traffic >= max( sum of operand footprints ,
                     total_MACs / sqrt(onchip_words) * dtype )   [I/O lower bound,
                     the sqrt(fast-memory) reuse limit; constant dropped -> safe]
  * roofline:      the model's compute/memory bound must match sign(AI - ridge),
                   ridge = peak_MAC_rate / backing_bandwidth  (MAC/byte)
A model that reports LESS traffic than the I/O lower bound is claiming impossible
reuse; a model whose bound disagrees with the roofline is internally inconsistent.
"""
from __future__ import annotations

import math

from .plan import AbstractTilingPlan


def peak_mac_rate(hw) -> float:
    lf = hw.compute_leaf
    return (lf.peak_macs_per_s or 1.0) * max(1, lf.instances)


def backing_bandwidth(hw) -> float:
    for lv in hw.memory_levels:
        if lv.bandwidth_bps:
            return lv.bandwidth_bps
    return 1.0


def onchip_capacity(hw):
    mem = hw.memory_levels
    return mem[-1].capacity_bytes if mem and mem[-1].capacity_bytes else None


def ridge_mac_per_byte(hw) -> float:
    """Roofline ridge point in MACs/byte = peak compute / backing bandwidth."""
    return peak_mac_rate(hw) / backing_bandwidth(hw)


def roofline_check(plan: AbstractTilingPlan) -> dict:
    """Return each bound check as {name: (ok, model, bound, detail)}."""
    hw, op, d = plan.hw, plan.op, plan.derived
    assert d is not None, "plan not costed"
    total_macs = math.prod(op.dims.values()) * op.macs_per_point
    dtb = op.dtype_bytes

    # peak-compute lower bound
    peak = peak_mac_rate(hw)
    compute_lower_us = total_macs / peak * 1e6

    # min-traffic lower bound
    footprint_sum = sum(math.prod(op.dims[dd] for dd in o.dims) * dtb
                        for o in op.operands)
    cap = onchip_capacity(hw)
    io_lower = 0.0
    if cap:
        onchip_words = max(1.0, cap / dtb)
        io_lower = total_macs / math.sqrt(onchip_words) * dtb
    min_traffic = max(footprint_sum, io_lower)

    # roofline classification
    ridge = ridge_mac_per_byte(hw)
    ai = total_macs / max(1.0, d.total_backing_bytes)
    predicted = "compute" if ai >= ridge else "memory"

    tol = 0.99  # allow tiny numeric slack below a bound
    return {
        "compute>=peak_bound": (
            d.compute_us >= compute_lower_us * tol,
            d.compute_us, compute_lower_us, "us; model compute time cannot beat peak"),
        "traffic>=io_lower_bound": (
            d.total_backing_bytes >= min_traffic * tol,
            d.total_backing_bytes, min_traffic,
            "bytes; model cannot move less than the I/O lower bound"),
        "bound_matches_roofline": (
            d.bound == predicted, d.bound, predicted,
            f"AI={ai:.1f} vs ridge={ridge:.1f} MAC/byte"),
    }


def check_all(plan: AbstractTilingPlan) -> bool:
    """True iff every bound holds. Raises AssertionError with detail otherwise."""
    for name, (ok, model, bound, detail) in roofline_check(plan).items():
        assert ok, f"{name}: model={model:.3g} vs bound={bound:.3g} ({detail})"
    return True

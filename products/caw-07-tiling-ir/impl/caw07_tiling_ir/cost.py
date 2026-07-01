"""Tensor-free, repetition-folding analytical cost engine.

The accuracy contract (ADR-0009): cost ONE tile-unit exactly, multiply by how
many times the iteration space repeats it (the *fold count*), and keep irregular
tail tiles explicit as remainders.  No real tensors, no codegen, no execution —
just closed-form counting over the mapping.  This is the Timeloop/MAESTRO
action-count method with the compute-leaf tile as the action.

Model (Phase 1, exploration-grade):
  For each loop dim d with extent E[d], tile factor T[d] (per compute instance)
  and spatial factor S[d] (instances the dim is fanned across):
    block[d]  = T[d] * S[d]                 # work advanced per temporal trip
    trips[d]  = ceil(E[d] / block[d])        # temporal repetitions (fold)
  Compute (per instance):  tile_unit_macs = (prod_d T[d]) * macs_per_point
                           compute_time    = tile_unit_macs * fold / leaf_rate
  Traffic (reuse):  an operand is reloaded from the backing store once per trip
    of every loop it does NOT index; fully reused over the loops it does index:
      loads(O)   = prod_{d not in O.dims} ceil(E[d] / T[d])
      bytes(O)   = footprint(O) * loads(O)
    memory_time  = sum_O bytes(O) / backing_bandwidth
  kernel_time = max(compute_time, memory_time)      # roofline bound
"""
from __future__ import annotations

import math

from .hw import LevelStack
from .plan import AbstractTilingPlan, Derived, Remainder


def _prod(xs) -> float:
    p = 1.0
    for x in xs:
        p *= x
    return p


def _backing_level(hw: LevelStack):
    """Outermost memory tier with a bandwidth = the backing store."""
    for lv in hw.memory_levels:
        if lv.bandwidth_bps:
            return lv
    return hw.memory_levels[0] if hw.memory_levels else None


def derive(plan: AbstractTilingPlan) -> AbstractTilingPlan:
    """Fill ``plan.derived`` with the repetition-folded analytical cost."""
    op = plan.op
    hw = plan.hw
    dims = list(op.dims)
    E = op.dims
    T = plan.resolved_tile()
    S = plan.resolved_spatial()

    # clamp tiles to the extent (a tile can't exceed its dimension)
    T = {d: min(T[d], E[d]) for d in dims}
    # a dim can be fanned across at most (number of tiles) instances; more would
    # leave instances idle, so it does not reduce time further.
    S = {d: max(1, min(S[d], math.ceil(E[d] / T[d]))) for d in dims}

    block = {d: T[d] * S[d] for d in dims}
    trips = {d: math.ceil(E[d] / block[d]) for d in dims}

    # explicit remainders (irregular last tile)
    remainders = []
    for d in dims:
        rem = E[d] % block[d]
        if rem != 0:
            remainders.append(Remainder(dim=d, tile=T[d], tail=rem))
    plan.remainders = remainders

    fold_count = int(_prod(trips[d] for d in dims))
    spatial_total = int(_prod(S[d] for d in dims))

    # --- compute: cost the tile-unit once, fold it ---
    tile_unit_macs = _prod(T[d] for d in dims) * op.macs_per_point
    folded_macs = tile_unit_macs * fold_count * spatial_total  # >= exact (ceil over-cover)
    total_macs = _prod(E[d] for d in dims) * op.macs_per_point  # exact op count

    leaf = hw.compute_leaf
    leaf_rate = leaf.peak_macs_per_s or 1.0  # MACs/s for ONE compute instance
    # spatial instances run in parallel -> sequential macs per instance = unit*fold
    compute_us = (tile_unit_macs * fold_count) / leaf_rate * 1e6

    # --- traffic: reuse-based backing-store bytes per operand ---
    tile_bytes: dict[str, int] = {}
    bytes_from_backing: dict[str, float] = {}
    for o in op.operands:
        footprint = _prod(E[d] for d in o.dims) * op.dtype_bytes  # whole tensor
        tile_bytes[o.name] = int(_prod(T[d] for d in o.dims) * op.dtype_bytes)
        loads = _prod(math.ceil(E[d] / T[d]) for d in dims if d not in o.dims)
        bytes_from_backing[o.name] = footprint * loads
    total_backing_bytes = sum(bytes_from_backing.values())

    backing = _backing_level(hw)
    bw = (backing.bandwidth_bps if backing and backing.bandwidth_bps else 1.0)
    memory_us = total_backing_bytes / bw * 1e6

    footprint_bytes = int(sum(tile_bytes.values()))  # on-chip working set

    bound = "compute" if compute_us >= memory_us else "memory"
    kernel_time_us = max(compute_us, memory_us)

    plan.derived = Derived(
        tile_unit_macs=tile_unit_macs,
        tile_unit_bytes=tile_bytes,
        fold_count=fold_count,
        folded_macs=folded_macs,
        total_macs=total_macs,
        bytes_from_backing=bytes_from_backing,
        total_backing_bytes=total_backing_bytes,
        footprint_bytes=footprint_bytes,
        compute_us=compute_us,
        memory_us=memory_us,
        kernel_time_us=kernel_time_us,
        bound=bound,
    )
    return plan

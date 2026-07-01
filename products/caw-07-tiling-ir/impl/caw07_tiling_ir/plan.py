"""The tiling-IR data model (the ``AbstractTilingPlan`` of ADR-0009).

A plan is a *mapping* over a linearized hardware stack:
  * an iteration space (loop dims + extents),
  * a per-dim tile factor (the block a compute-leaf tile-unit works on),
  * a per-dim spatial factor (how the dim is fanned out across instances =
    parallelism),
  * the operands and which dims each reads (for reuse/traffic),
  * explicit remainders (irregular tail tiles),
  * a ``Derived`` block filled by the cost model (never authored).

Tile / spatial factors may be **functions of the hardware stack** — a
``Callable[[LevelStack], int]`` — so re-costing a plan on a different twin
re-tiles it automatically.  This is the "tile factors as functions of HW
symbols" property from the design brief.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional, Union

from .hw import LevelStack

#: a tile/spatial factor is a constant OR a function of the hardware stack
Factor = Union[int, Callable[[LevelStack], int]]


def resolve(factor: Factor, hw: LevelStack) -> int:
    """Resolve a possibly-HW-parametric factor to a concrete positive int."""
    v = factor(hw) if callable(factor) else factor
    v = int(v)
    if v < 1:
        raise ValueError(f"factor resolved to {v} (< 1)")
    return v


@dataclass
class Operand:
    """A tensor read/written by the op and the loop dims it is indexed by."""

    name: str
    dims: tuple[str, ...]


@dataclass
class Op:
    """The workload unit: a named tensor-contraction / elementwise op.

    ``dims`` are the loop extents of the full iteration space.  For a matmul
    C[m,n] += A[m,k]*B[k,n] this is {m,n,k} with A/B/C as operands.  The MAC
    count of one point of the iteration space is 1 (a fused multiply-add); an
    elementwise op sets ``macs_per_point`` to its op-count.
    """

    name: str
    dims: dict[str, int]
    operands: list[Operand]
    dtype_bytes: int = 2
    macs_per_point: float = 1.0


@dataclass
class Remainder:
    """An irregular tail tile kept explicit (accuracy contract)."""

    dim: str
    tile: int  # the full tile factor for this dim
    tail: int  # extent % (tile * spatial) — the short last tile (0 if perfect)


@dataclass
class Derived:
    """Filled by the cost model — the analytical, repetition-folded result."""

    #: the tile-unit, costed ONCE
    tile_unit_macs: float = 0.0
    tile_unit_bytes: dict[str, int] = field(default_factory=dict)  # per operand
    #: how many times the tile-unit repeats temporally (the fold count)
    fold_count: int = 0
    #: totals
    total_macs: float = 0.0
    bytes_from_backing: dict[str, float] = field(default_factory=dict)  # per operand
    total_backing_bytes: float = 0.0
    footprint_bytes: int = 0
    #: roofline breakdown (microseconds)
    compute_us: float = 0.0
    memory_us: float = 0.0
    kernel_time_us: float = 0.0
    bound: str = ""  # "compute" | "memory"


@dataclass
class AbstractTilingPlan:
    """One HW-parameterized tiling plan for one op (ADR-0009 core object)."""

    op: Op
    hw: LevelStack
    #: per-dim innermost tile factor (the tile-unit dim size)
    tile: dict[str, Factor] = field(default_factory=dict)
    #: per-dim spatial fanout (how many instances the dim is spread over)
    spatial: dict[str, Factor] = field(default_factory=dict)
    loop_order: Optional[list[str]] = None
    remainders: list[Remainder] = field(default_factory=list)
    derived: Optional[Derived] = None

    def resolved_tile(self) -> dict[str, int]:
        # the effective tile can never exceed its dimension's extent
        return {d: min(resolve(self.tile.get(d, 1), self.hw), self.op.dims[d])
                for d in self.op.dims}

    def resolved_spatial(self) -> dict[str, int]:
        import math
        # a dim is fanned across at most (number of tiles) instances
        out = {}
        for d in self.op.dims:
            t = min(resolve(self.tile.get(d, 1), self.hw), self.op.dims[d])
            s = resolve(self.spatial.get(d, 1), self.hw)
            out[d] = max(1, min(s, math.ceil(self.op.dims[d] / t)))
        return out

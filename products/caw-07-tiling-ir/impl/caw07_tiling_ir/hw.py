"""Hardware side of the tiling IR.

An *arbitrary* accelerator is described as a hierarchy of memory + compute
levels.  `linearize()` flattens that hierarchy (which may be a nested twin, as
produced by a sibling control plane) into an ordered ``LevelStack`` running from
the outer backing store to the inner compute leaf.  A GPU-like target and an
NPU-like target are just two linearizations of the *same* primitive — only the
level names and the numbers differ (see ``twins.py``).

Design note (CAW-07 / ADR-0009): the stack is the parameter space the mapping is
written against.  Tile factors in a plan may be *functions of this stack*, so
re-evaluating a plan on a different stack re-tiles it automatically.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# Roles are intentionally open (strings), but these are the ones the cost model
# understands specially: a "compute" leaf carries throughput; every other role
# is a memory tier carrying capacity + bandwidth.
COMPUTE = "compute"


@dataclass
class Level:
    """One level of the (linearized) accelerator hierarchy."""

    level_id: str
    role: str  # "compute" | "reg" | "shared" | "sram" | "l2" | "hbm" | "dram" | ...
    #: spatial fanout — how many identical instances of this level exist
    instances: int = 1
    #: bytes of storage at ONE instance of this level (memory tiers only)
    capacity_bytes: Optional[int] = None
    #: aggregate bandwidth in bytes/second into/out of this tier (memory tiers)
    bandwidth_bps: Optional[float] = None
    #: name of the spatial axis this level fans out over (e.g. "sm", "pe_row")
    spatial_axis: Optional[str] = None
    #: compute leaf only: MACs one instance issues per second (peak)
    peak_macs_per_s: Optional[float] = None
    #: compute leaf only: native matrix-unit shape (m, n, k) if any
    matrix_unit: Optional[tuple[int, int, int]] = None
    #: compute leaf only: native element size in bytes (e.g. 1=int8, 2=bf16/int16)
    dtype_bytes: Optional[int] = None

    @property
    def is_compute(self) -> bool:
        return self.role == COMPUTE


@dataclass
class LevelStack:
    """Ordered levels, outer (backing store) -> inner (compute leaf)."""

    levels: list[Level] = field(default_factory=list)

    def __iter__(self):
        return iter(self.levels)

    def __len__(self) -> int:
        return len(self.levels)

    def at(self, role: str) -> Optional[Level]:
        """First level with the given role (outer-most), or None."""
        for lv in self.levels:
            if lv.role == role:
                return lv
        return None

    def by_id(self, level_id: str) -> Optional[Level]:
        for lv in self.levels:
            if lv.level_id == level_id:
                return lv
        return None

    @property
    def compute_leaf(self) -> Level:
        for lv in reversed(self.levels):
            if lv.is_compute:
                return lv
        raise ValueError("LevelStack has no compute leaf")

    @property
    def memory_levels(self) -> list[Level]:
        return [lv for lv in self.levels if not lv.is_compute]

    @property
    def spatial_parallelism(self) -> int:
        """Product of instances across every level (total parallel width)."""
        p = 1
        for lv in self.levels:
            p *= max(1, lv.instances)
        return p


def linearize(twin) -> LevelStack:
    """Flatten an arbitrary hardware twin into a ``LevelStack``.

    Accepts, in order of convenience:
      * a ``LevelStack`` (returned as-is),
      * a flat ``list[Level]`` (outer -> inner),
      * a nested twin ``dict`` with keys ``level_id``/``role`` and an optional
        ``children`` list — walked depth-first so a tray -> package -> die ->
        component tree becomes an outer -> inner stack.

    This is deliberately structure-agnostic: any tray/package/die/component +
    memory-tier tree lowers to the same ordered stack.
    """
    if isinstance(twin, LevelStack):
        return twin
    if isinstance(twin, list):
        return LevelStack(list(twin))

    levels: list[Level] = []

    def walk(node: dict) -> None:
        lv = Level(
            level_id=node["level_id"],
            role=node.get("role", "hbm"),
            instances=int(node.get("instances", 1)),
            capacity_bytes=node.get("capacity_bytes"),
            bandwidth_bps=node.get("bandwidth_bps"),
            spatial_axis=node.get("spatial_axis"),
            peak_macs_per_s=node.get("peak_macs_per_s"),
            matrix_unit=tuple(node["matrix_unit"]) if node.get("matrix_unit") else None,
            dtype_bytes=node.get("dtype_bytes"),
        )
        levels.append(lv)
        for child in node.get("children", []):
            walk(child)

    if isinstance(twin, dict):
        walk(twin)
        return LevelStack(levels)

    raise TypeError(f"cannot linearize twin of type {type(twin)!r}")

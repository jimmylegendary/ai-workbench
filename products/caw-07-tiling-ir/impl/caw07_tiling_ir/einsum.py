"""einsum++ — the minimal authoring front.

``tile("m k, k n -> m n", sizes, hw, tile=..., spatial=...)`` parses a named-axis
einsum pattern into an ``Op`` + an ``AbstractTilingPlan`` and costs it with the
repetition-folding engine.  Tile/spatial factors may be constants or functions
of the hardware stack (so the same authored plan re-tiles on a different twin).

Higher-level helpers (``matmul``, ``attention``) build the common ops.
"""
from __future__ import annotations

from typing import Optional

from .cost import derive
from .hw import LevelStack, linearize
from .plan import AbstractTilingPlan, Factor, Op, Operand

_INPUT_NAMES = "ABCDEFG"


def _parse(pattern: str) -> tuple[list[tuple[str, tuple[str, ...]]], tuple[str, ...]]:
    """'m k, k n -> m n' -> ([('A',('m','k')),('B',('k','n'))], ('m','n'))."""
    if "->" not in pattern:
        raise ValueError("einsum pattern must contain '->'")
    lhs, rhs = pattern.split("->")
    ins = []
    for i, part in enumerate(lhs.split(",")):
        axes = tuple(part.split())
        if not axes:
            raise ValueError(f"empty operand #{i} in pattern")
        ins.append((_INPUT_NAMES[i], axes))
    out = tuple(rhs.split())
    return ins, out


def tile(
    pattern: str,
    sizes: dict[str, int],
    hw,
    tile: Optional[dict[str, Factor]] = None,
    spatial: Optional[dict[str, Factor]] = None,
    dtype_bytes: Optional[int] = None,
    macs_per_point: float = 1.0,
    name: str = "op",
) -> AbstractTilingPlan:
    """Author + cost a tiling plan from an einsum pattern.

    ``dtype_bytes`` defaults to the twin's native compute-leaf element size.
    """
    hw = linearize(hw)
    if dtype_bytes is None:
        dtype_bytes = hw.compute_leaf.dtype_bytes or 2
    ins, out = _parse(pattern)
    axes = []
    for _, a in ins:
        axes += list(a)
    axes += list(out)
    dims_order = list(dict.fromkeys(axes))  # stable unique
    missing = [d for d in dims_order if d not in sizes]
    if missing:
        raise ValueError(f"pattern axes missing from sizes: {missing}")
    dims = {d: int(sizes[d]) for d in dims_order}

    operands = [Operand(nm, a) for nm, a in ins]
    operands.append(Operand("Y", out))
    op = Op(name=name, dims=dims, operands=operands,
            dtype_bytes=dtype_bytes, macs_per_point=macs_per_point)

    plan = AbstractTilingPlan(op=op, hw=hw, tile=dict(tile or {}),
                              spatial=dict(spatial or {}))
    return derive(plan)


def matmul(M: int, N: int, K: int, hw, **kw) -> AbstractTilingPlan:
    return tile("m k, k n -> m n", {"m": M, "n": N, "k": K}, hw, name="matmul", **kw)


def attention(B: int, H: int, Sq: int, Sk: int, D: int, hw, **kw) -> list[AbstractTilingPlan]:
    """Attention as two contractions: scores = Q.K^T, out = A.V.

    Returns [scores_plan, out_plan]; sum their kernel_time for the fused cost.
    """
    scores = tile("b h sq d, b h sk d -> b h sq sk",
                  {"b": B, "h": H, "sq": Sq, "sk": Sk, "d": D}, hw,
                  name="attn.scores", **kw)
    out = tile("b h sq sk, b h sk d -> b h sq d",
               {"b": B, "h": H, "sq": Sq, "sk": Sk, "d": D}, hw,
               name="attn.out", **kw)
    return [scores, out]


# ----------------------------------------------------------------------------
def _fmt_bytes(n: float) -> str:
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if n < 1024 or unit == "TiB":
            return f"{n:.1f} {unit}"
        n /= 1024


def render(plan: AbstractTilingPlan) -> str:
    """Human-readable summary of a costed plan."""
    d = plan.derived
    T = plan.resolved_tile()
    S = plan.resolved_spatial()
    lines = [f"op {plan.op.name}  dims={plan.op.dims}"]
    lines.append(f"  tile   = {T}")
    lines.append(f"  spatial= {S}")
    lines.append(f"  tile-unit: {d.tile_unit_macs:.0f} MACs, "
                 f"operand tiles {{ " +
                 ", ".join(f'{k}:{_fmt_bytes(v)}' for k, v in d.tile_unit_bytes.items()) + " }")
    lines.append(f"  fold count (temporal repeats) = {d.fold_count:,}")
    lines.append(f"  total = {d.total_macs/1e9:.3f} GMAC, "
                 f"backing traffic {_fmt_bytes(d.total_backing_bytes)}, "
                 f"on-chip footprint {_fmt_bytes(d.footprint_bytes)}")
    lines.append(f"  roofline: compute {d.compute_us:.1f} us | memory {d.memory_us:.1f} us"
                 f"  -> {d.kernel_time_us:.1f} us  ({d.bound}-bound)")
    if plan.remainders:
        r = ", ".join(f"{x.dim}: tail {x.tail}/{x.tile}" for x in plan.remainders)
        lines.append(f"  remainders (explicit): {r}")
    else:
        lines.append("  remainders: none (perfect factorization)")
    return "\n".join(lines)

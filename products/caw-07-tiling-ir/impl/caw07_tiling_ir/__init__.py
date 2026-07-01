"""CAW-07 tiling IR — an abstracted, analytically-costed tiling/parallelism IR
for arbitrary accelerators (einsum++ front + repetition-folding cost engine).

Phase 1: the core ``AbstractTilingPlan``, ``linearize(twin)``, the einsum++
``tile()``/``matmul``/``attention`` front, and a tensor-free repetition-folding
cost model.  Runs on a GPU-like and an NPU-like twin with no compiler/codegen.
See design: products/caw-07-tiling-ir/design/tiling-ir-design-brief.md.
"""
from .hw import COMPUTE, Level, LevelStack, linearize
from .plan import AbstractTilingPlan, Derived, Factor, Op, Operand, Remainder, resolve
from .cost import derive
from .einsum import attention, matmul, render, tile
from . import twins

__all__ = [
    "COMPUTE", "Level", "LevelStack", "linearize",
    "AbstractTilingPlan", "Derived", "Factor", "Op", "Operand", "Remainder", "resolve",
    "derive", "tile", "matmul", "attention", "render", "twins",
]
__version__ = "0.1.0"

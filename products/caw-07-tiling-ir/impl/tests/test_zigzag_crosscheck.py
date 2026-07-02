"""ZigZag cross-check gate.

SKIPS cleanly when zigzag-dse is not installed (it is an optional oracle, kept
out of the default deps and its own venv). When ZigZag IS present, asserts that
our repetition-folding cost model reproduces ZigZag on the SAME mapping:

  * total MACs match EXACTLY,
  * per-operand + total DRAM access bytes within 15%,
  * ideal compute cycles within 25%,
  * roofline bound classification matches.

The output partial-sum-spill case (tiny on-chip buffer, reduction dim tiled across
DRAM) is now MODELED by cost.py (per-operand placement + accumulator-precision RMW),
so it is asserted like the primaries — not merely documented.

Run:  (. .venv-zigzag/bin/activate && pytest tests/test_zigzag_crosscheck.py -v)
"""
import os
import sys

import pytest

# Make the impl root importable whether pytest is invoked from impl/ or elsewhere
_IMPL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _IMPL_ROOT not in sys.path:
    sys.path.insert(0, _IMPL_ROOT)

from validation import zigzag_crosscheck as zc  # noqa: E402

pytestmark = pytest.mark.skipif(
    not zc.HAVE_ZIGZAG,
    reason="zigzag-dse not installed (optional oracle; see runbooks/RB-02)",
)


@pytest.mark.parametrize("case", zc.PRIMARY_CASES + zc.SPILL_CASES, ids=lambda c: c.label)
def test_crosscheck_primary(case):
    """Every asserted metric must pass its tolerance (primaries + spill case)."""
    result = zc.crosscheck(case)
    failures = [
        f"{r.metric}: ours={r.ours} zigzag={r.zigzag} tol={r.tol}"
        for r in result["rows"] if not r.passed
    ]
    assert not failures, "cross-check tolerances violated:\n  " + "\n  ".join(failures)


def test_macs_exact_and_dram_exact_on_matched_mapping():
    """Headline invariants on the canonical 512^3 GEMM: MACs exact, DRAM exact."""
    case = zc.PRIMARY_CASES[0]
    zz = zc.run_zigzag(case.M, case.K, case.N, zc.bundled_hardware(), zc.bundled_mapping())
    ours = zc.run_ours(case.M, case.K, case.N, case.onchip_bytes, zz["tiles"])
    assert ours["macs"] == zz["macs"] == case.M * case.K * case.N
    for opn in ("I", "W", "O"):
        assert ours["dram_bytes"][opn] == zz["dram_bytes"][opn]
    assert ours["dram_total"] == zz["dram_total"]


def test_bound_classification_agrees():
    """Roofline bound must agree on both a compute-bound and a memory-bound GEMM."""
    for case in zc.PRIMARY_CASES:
        result = zc.crosscheck(case)
        bound_row = next(r for r in result["rows"] if r.metric == "roofline bound")
        assert bound_row.passed, f"{case.label}: {bound_row.note}"


def test_partial_sum_spill_matches():
    """The tiny-buffer case spills the output accumulator across the reduction
    loop; cost.py now models the read-modify-write at accumulator precision, so
    O (and total) must MATCH ZigZag exactly — the former divergence is closed."""
    case = zc.SPILL_CASES[0]
    zz = zc.run_zigzag(case.M, case.K, case.N,
                       str(zc.CONFIG_DIR / case.hw_yaml_kind), zc.bundled_mapping())
    ours = zc.run_ours(case.M, case.K, case.N, case.onchip_bytes, zz["tiles"])
    assert ours["macs"] == zz["macs"]
    # the spilled output is now counted (was under-counted before per-operand
    # placement + accumulator-precision RMW landed):
    assert ours["dram_bytes"]["O"] == zz["dram_bytes"]["O"]
    assert ours["dram_total"] == zz["dram_total"]

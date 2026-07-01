"""Evidence-completeness gate (ADR-0003).

The Python gate here is AUTHORITATIVE — it is what structurally blocks the writing
engine. The optional CUE schema (schema/ledger.cue) is defense-in-depth: if the
`cue` binary is installed we also `cue vet` a snapshot so the hard invariants are
declared in two places. The OSS-foundation research is explicit that the real
protection is the code, not the declaration.

The one invariant no gate profile can relax: generated text is NEVER evidence.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from .models import (
    Claim,
    ClaimGateResult,
    EvidenceKind,
    GateProfile,
    GateReport,
    GateStatus,
    InterlockStatus,
)

CUE_SCHEMA = Path(__file__).parent.parent / "schema" / "ledger.cue"


def evaluate_claim(claim: Claim, profile: GateProfile) -> ClaimGateResult:
    reasons: list[str] = []

    # 1. Reject inadmissible evidence explicitly (the hard invariant).
    for e in claim.evidence:
        if e.kind in (EvidenceKind.GENERATED_TEXT, EvidenceKind.PROSE_NOTE):
            reasons.append(
                f"evidence {e.id!r} ({e.kind.value}) rejected: generated/prose text is "
                f"never evidence (ADR-0003)"
            )
        elif not e.ref.strip():
            reasons.append(
                f"evidence {e.id!r} ({e.kind.value}) rejected: empty/unresolvable ref"
            )

    admissible = claim.admissible_evidence()

    # 2. Minimum admissible evidence per claim type.
    min_required = profile.min_evidence_by_type.get(claim.type.value, 1)
    if len(admissible) < min_required:
        reasons.append(
            f"insufficient evidence: {len(admissible)} admissible < "
            f"{min_required} required for {claim.type.value}"
        )

    # 3. Optional: require a CAW-01 result ref (traceable numbers).
    if profile.require_result_ref_by_type.get(claim.type.value, False) and not claim.result_refs:
        reasons.append(
            f"{claim.type.value} requires a CAW-01 result ref for traceable numbers, none present"
        )

    # 4. Patent-first interlock (UC-3): a patent-sensitive claim is default-denied for
    #    paper drafting while its interlock is HELD; a human `release_interlock` (i.e.
    #    the patent has been filed/cleared) lets it through on the next gate.
    if claim.type.value in profile.patent_sensitive_types:
        if claim.interlock_status is not InterlockStatus.RELEASED:
            reasons.append(
                f"patent-first interlock HELD (patent-sensitive {claim.type.value}): "
                f"release the interlock before paper drafting"
            )

    status = GateStatus.PASSED if not reasons else GateStatus.BLOCKED
    return ClaimGateResult(
        claim_id=claim.claim_id,
        type=claim.type.value,
        status=status,
        admissible_evidence=len(admissible),
        reasons=reasons,
    )


def run_gate(claims: list[Claim], profile: GateProfile, bundle_id: str) -> GateReport:
    report = GateReport(profile=profile.name, bundle_id=bundle_id)
    for c in claims:
        report.results.append(evaluate_claim(c, profile))
    return report


# --- optional CUE defense-in-depth -----------------------------------------

def cue_available() -> bool:
    return shutil.which("cue") is not None


def cue_vet_snapshot(claims: list[Claim]) -> tuple[bool, str]:
    """If `cue` is installed, vet a ledger snapshot against schema/ledger.cue.

    Returns (ok, detail). Never authoritative — the Python gate is. When `cue` is
    absent this is a no-op reporting `skipped`.
    """
    if not cue_available():
        return True, "skipped (cue binary not installed)"
    if not CUE_SCHEMA.exists():
        return True, f"skipped (schema not found at {CUE_SCHEMA})"

    snapshot = {
        "claims": [
            {
                "claim_id": c.claim_id,
                "type": c.type.value,
                "evidence": [
                    {"id": e.id, "kind": e.kind.value, "ref": e.ref} for e in c.evidence
                ],
            }
            for c in claims
        ]
    }
    with tempfile.TemporaryDirectory() as td:
        data_path = Path(td) / "snapshot.json"
        data_path.write_text(json.dumps(snapshot), encoding="utf-8")
        try:
            proc = subprocess.run(
                ["cue", "vet", str(CUE_SCHEMA), str(data_path)],
                capture_output=True, text=True, timeout=60,
            )
        except (OSError, subprocess.SubprocessError) as e:  # pragma: no cover
            return True, f"skipped (cue invocation failed: {e})"
    ok = proc.returncode == 0
    detail = "cue vet passed" if ok else f"cue vet FAILED: {proc.stderr.strip() or proc.stdout.strip()}"
    return ok, detail

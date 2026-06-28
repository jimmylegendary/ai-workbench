# RB-011: Evidence gate

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-010]
- Implements design: [../../05-harness-core/evidence-gate-and-claim-ledger.md](../../05-harness-core/evidence-gate-and-claim-ledger.md), [../../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md](../../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md)
- Produces: `gate_claims` — the type-specific, profile-configurable, fail-closed evidence gate

## Objective

The load-bearing integrity op: gate the ledger into a `GatedClaimSet`. Type-specific thresholds (P1/P2/P3),
profile-configurable, **fail-closed**, with the one non-relaxable invariant: **generated text is never evidence**.

## Preconditions
- [ ] RB-010 (ledger). Gate profiles defined in `config/`.

## Steps
1. **Do:** Implement `gate_claims(ledgerId, profile)`: per claim, check `evidence_refs` resolve to real CAW-02 evidence artifacts + meet the profile threshold for its claim_type.
   **Verify:** `test:` P1/P2/P3 thresholds applied from the profile.
2. **Do:** Enforce structurally that a synthesis/summary cannot satisfy the gate (no prose-evidence path).
   **Verify:** `test:` a claim whose only "evidence" is generated text is BLOCKED.
3. **Do:** Fail-closed: blocked claims do not enter the `GatedClaimSet`; persist them as `gate_status=blocked` backlog.
   **Verify:** `test:` blocked claims appear in the backlog; only passing claims are in the GatedClaimSet.
4. **Do:** Prove no surface bypass: call via core + (fake) MCP/CLI paths.
   **Verify:** `test:` T1 — gate cannot be bypassed by any surface.

## Acceptance criteria
- [ ] Gate is profile-configurable + type-specific + fail-closed.
- [ ] Generated-text-never-evidence holds (T2); backlog persists; no surface bypass (T1).

## Rollback / safety
Pure core logic; revert to roll back. Gate denies by default on uncertainty.

## Hand-off
RB-012 assembles engine inputs from the GatedClaimSet only.

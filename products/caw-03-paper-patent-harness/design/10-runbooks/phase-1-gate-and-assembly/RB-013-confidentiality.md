# RB-013: Confidentiality (boundary + redaction)

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-010]
- Implements design: [../../04-data-layer/confidentiality-and-provenance.md](../../04-data-layer/confidentiality-and-provenance.md), [../../01-decisions/ADR-0007-confidentiality-and-boundary.md](../../01-decisions/ADR-0007-confidentiality-and-boundary.md)
- Produces: the confidentiality engine (boundary×visibility, redaction) used on import + assembly + publish

## Objective

Implement the inherited CAW-02 boundary×visibility model + redaction, enforced fail-closed at import, assembly, and
publish — including the proposed counsel/pre-filing tier for patents.

## Preconditions
- [ ] RB-010 (import). Redaction ruleset available (vendored+pinned or envelope-pinned — see OQ-21).

## Steps
1. **Do:** Implement the two-axis model (boundary {public/internal/confidential} × visibility {team/private}) + the counsel tier hook.
   **Verify:** `test:` effective boundary computed; counsel tier gates patent egress.
2. **Do:** Implement redaction to a target boundary; **fail-closed** (abort on over-share, never silently emit).
   **Verify:** `test:` T7 — publishing to a public target redacts to public-safe; over-share aborts.
3. **Do:** Wire the checks into import (quarantine), assembly (exclude over-track), and publish (redact/abort).
   **Verify:** `test:` each enforcement point rejects over-boundary content.

## Acceptance criteria
- [ ] Boundary×visibility + counsel tier modeled; redaction fail-closed (T7).
- [ ] Enforced at import, assembly, and publish.

## Rollback / safety
Deny-by-default on uncertainty; revert to roll back. Never weaken to "warn only".

## Hand-off
Publish (RB-040) and patent (RB-022) reuse this engine; no export crosses a boundary.

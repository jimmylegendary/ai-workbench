# RB-010: Source adapters + ledger import

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-002, RB-003]
- Implements design: [../../05-harness-core/evidence-gate-and-claim-ledger.md](../../05-harness-core/evidence-gate-and-claim-ledger.md), [../../05-harness-core/ports-and-adapters.md](../../05-harness-core/ports-and-adapters.md)
- Produces: v1 SourceAdapters (CAW-02 bundle, CAW-01 results) + `import_bundle`/`build_ledger`

## Objective

Import a CAW-02 claim+evidence bundle and CAW-01 result refs via `SourceAdapter`, and build a `ClaimLedger` of
`ClaimRef`s that REFERENCE CAW-02 (never re-own). Future wiki/exp-server sources are stubs behind the same port.

## Preconditions
- [ ] RB-002 (ports/registry), RB-003 (store). Sample CAW-02 bundle + CAW-01 result fixtures available.

## Steps
1. **Do:** Implement `adapters/source/v1/caw02-bundle` and `caw01-results` behind `SourceAdapter`; register them.
   **Verify:** `test:` registry selects them; preflight passes.
2. **Do:** Implement `import_bundle(sourceRef)`: quarantine + confidentiality check (boundary carried), persist `Bundle` + provenance manifest ref.
   **Verify:** `test:` an over-boundary item is quarantined/rejected; a valid bundle persists.
3. **Do:** Implement `build_ledger(bundleId)`: create `ClaimRef`s (claim_type, evidence_refs as CAW-02 ids).
   **Verify:** `test:` ledger references CAW-02 ids; no inline claim/evidence text copied.
4. **Do:** Add the future stubs `adapters/source/stubs/internal-wiki`, `internal-experiment-server` (interface + `implemented:false` + config example).
   **Verify:** `test:` stubs are selectable, flagged unavailable, never bypass governance.

## Acceptance criteria
- [ ] CAW-02/CAW-01 import works; ledger references (not copies) CAW-02.
- [ ] Confidentiality applied on import; future-source stubs present + safe.

## Rollback / safety
Adapters + ops; revert to roll back. No publish here.

## Hand-off
RB-011 gates the imported ledger.

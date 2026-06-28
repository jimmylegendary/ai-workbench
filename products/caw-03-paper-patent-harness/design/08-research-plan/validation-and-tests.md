# Validation & Tests — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan.md](./research-plan.md), [../05-harness-core/evidence-gate-and-claim-ledger.md](../05-harness-core/evidence-gate-and-claim-ledger.md), [../05-harness-core/ports-and-adapters.md](../05-harness-core/ports-and-adapters.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The tests that prove the governance holds — the harness's reason to exist.

## Test suite

### T1 — Gate fail-closed blocks the engine
A claim lacking sufficient evidence (or whose only "evidence" is generated text) **cannot** be assembled or
drafted, via ANY surface (API/MCP/CLI). **Pass:** assemble/draft refuses; claim appears in the backlog.

### T2 — Generated text is never evidence
`attach`/import that tries to use a synthesis/summary as evidence is rejected; `evidence_refs` must resolve to a
real CAW-02 evidence id. **Pass:** rejected with reason.

### T3 — Patent-first interlock blocks publish
A paper artifact containing a patent-sensitive claim with `InterlockState=held` cannot be published. **Pass:**
`publish` denied; clears only after the interlock releases.

### T4 — Adapter cannot weaken governance
A deliberately-misbehaving fake adapter (returns over-boundary data / ungated claims) still cannot bypass the gate,
interlock, or confidentiality. **Pass:** core rejects regardless of adapter.

### T5 — Stub adapter is selectable but safe
Selecting a documented stub (e.g. internal-wiki source) passes preflight as `implemented:false` and no-ops safely;
it never silently drops governance. **Pass:** clear unavailable signal, no data leak.

### T6 — Engine-neutral input round-trip
A GatedClaimSet → EngineInputs → PaperOrchestra inputs preserves claim_id + result_id; figure_id↔result_id binds in
the manifest. **Pass:** provenance reconstructable.

### T7 — Confidentiality fail-closed on export
Publishing to a public sink redacts to public-safe; over-share aborts the publish. **Pass:** no confidential leak.

### T8 — Milestone-1 e2e
One evidence-gated paper: import → gate → assemble → draft (PaperOrchestra) → review → PDF, with provenance.
**Pass:** PDF exists; all claims gated; lineage intact.

## Thresholds

Numeric gate/novelty thresholds are profile-config and start as `TODO(open-question)` until set with Jimmy.

## Implications for runbooks

T1–T7 are acceptance checks embedded in their feature runbooks; T8 is the Milestone-1 acceptance.

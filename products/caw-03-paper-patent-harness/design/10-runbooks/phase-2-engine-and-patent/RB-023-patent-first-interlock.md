# RB-023: Patent-first interlock

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-022]
- Implements design: [../../05-harness-core/patent-drafting-module.md](../../05-harness-core/patent-drafting-module.md), [../../05-harness-core/artifact-lifecycle.md](../../05-harness-core/artifact-lifecycle.md)
- Produces: the patent-first interlock (core logic) that default-denies publish

## Objective

Implement the **patent-first interlock** in harness-core: a paper containing a patent-sensitive claim cannot be
published until the patent gate clears. This is core logic, not adapter-local.

## Preconditions
- [ ] RB-022 (patent path). Patent-sensitive flagging exists or is stubbed (set in RB-030 fully).

## Steps
1. **Do:** Model `InterlockState{claim_ref, patent_first, status: held|released}`; set `held` when a claim is patent-sensitive.
   **Verify:** `test:` flagging a claim patent-sensitive sets `held`.
2. **Do:** In the publish path, check every claim in the artifact's GatedClaimSet; if any `held`, **default-deny** with reason.
   **Verify:** `test:` T3 — publish of a paper with a held claim is denied.
3. **Do:** Release: the interlock clears only when the patent gate (human/counsel) marks it filed/cleared.
   **Verify:** `test:` after release, publish proceeds.
4. **Do:** Ensure the interlock cannot be bypassed by any surface/adapter (core enforcement).
   **Verify:** `test:` T4-style — a fake sink cannot publish a held artifact.

## Acceptance criteria
- [ ] Held interlock default-denies publish (T3); release re-enables; no surface/adapter bypass.

## Rollback / safety
Deny-by-default; revert to roll back. The interlock fails safe (held) on uncertainty.

## Hand-off
RB-040 publish enforces this interlock alongside confidentiality.

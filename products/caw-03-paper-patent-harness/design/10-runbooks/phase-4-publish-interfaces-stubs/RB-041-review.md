# RB-041: Review checklist + scores

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-021]
- Implements design: [../../05-harness-core/artifact-lifecycle.md](../../05-harness-core/artifact-lifecycle.md), [../../02-research/paperorchestra-integration.md](../../02-research/paperorchestra-integration.md)
- Produces: `review` — the checklist + autorater scores gate before submission-ready

## Objective

Implement the review step (`drafted → reviewed`): a review checklist + the PaperOrchestra autorater scores, gating
an artifact before publish/filing.

## Preconditions
- [ ] RB-021 (drafted artifacts).

## Steps
1. **Do:** Implement `review(artifactId)`: persist a `ReviewResult` (checklist items + autorater scores captured from the engine run).
   **Verify:** `test:` review on a drafted artifact records checklist + scores; advances to `reviewed`.
2. **Do:** Gate: an artifact must be `reviewed` (with a passing verdict) before publish/filing.
   **Verify:** `test:` publish refuses a non-reviewed artifact.

## Acceptance criteria
- [ ] Review records checklist + scores; publish/filing requires a passing review.

## Rollback / safety
Data + gate; revert to roll back.

## Hand-off
RB-040 publish (papers) and RB-022 filing-gate (patents) consume the review verdict.

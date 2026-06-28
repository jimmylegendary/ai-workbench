# RB-022: Patent drafting module

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-021]
- Implements design: [../../05-harness-core/patent-drafting-module.md](../../05-harness-core/patent-drafting-module.md), [../../01-decisions/ADR-0004-patent-drafting.md](../../01-decisions/ADR-0004-patent-drafting.md)
- Produces: `PatentEngine` port + v1 baseline adapter + `draft_patent`; counsel hand-off

## Objective

The patent path: a separate `PatentEngine` adapter (PaperOrchestra is NEVER used for patents), sharing the
GatedClaimSet front, producing a ready-for-filing draft for the human/counsel gate.

## Preconditions
- [ ] RB-021 (orchestration). Resolve OQ-10 (jurisdiction/provisional-first) + OQ-09 (§112 ownership) before defaults.

## Steps
1. **Do:** Define the `PatentEngineAdapter` port + a v1 baseline adapter (LLM-assisted: claims/spec/prior-art skeleton), registered in the same registry.
   **Verify:** `test:` registry selects the patent engine; preflight passes.
2. **Do:** Implement `draft_patent(artifactId)` reusing the shared GatedClaimSet; branch the Artifact to the patent tail (`drafted → reviewed → filing-gate`).
   **Verify:** `test:` a patent artifact reaches `filing-gate`; uses PatentEngine, not PaperOrchestra.
3. **Do:** Apply the counsel/pre-filing confidentiality tier; produce a ready-for-filing hand-off package (format TBD, OQ-10).
   **Verify:** `test:` counsel-tier content is gated; hand-off package assembled.
4. **Do:** No autonomous filing — terminal state is `filing-gate` awaiting human/counsel.
   **Verify:** `test:` the harness never transitions past `filing-gate` automatically.

## Acceptance criteria
- [ ] PatentEngine port + v1 adapter; `draft_patent` reaches `filing-gate`; PaperOrchestra never drafts a patent.
- [ ] Counsel tier applied; no autonomous filing.

## Rollback / safety
Adapter + op; revert to roll back. Legal calls are flagged for humans, not decided.

## Hand-off
RB-023 wires the patent-first interlock that blocks paper publish for patent-sensitive claims.

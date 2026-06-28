# RB-031: Paper ladder (P1/P2/P3)

- Status: ready
- Phase: phase-3-novelty-and-ladder
- Depends on: [RB-030]
- Implements design: [../../05-harness-core/paper-ladder-and-novelty.md](../../05-harness-core/paper-ladder-and-novelty.md)
- Produces: `PaperLadderEntry` management + readiness computation

## Objective

Track the program paper sequence (P1/P2/P3) with per-paper readiness derived from gate status + novelty flags
(+ patent-first clearance for P3).

## Preconditions
- [ ] RB-030 (novelty flags).

## Steps
1. **Do:** Implement `PaperLadderEntry` CRUD (claim_refs, readiness, threats) seeded with P1/P2/P3 from the brief.
   **Verify:** `test:` ladder entries persist + list.
2. **Do:** Compute readiness = gate status of claims + novelty flags + (P3) patent-first clearance.
   **Verify:** `test:` an entry with a blocked/threatened/held claim shows not-ready.
3. **Do:** Surface the ladder via the op-manifest (`NoveltyLadderService.ladder()`).
   **Verify:** `test:` ladder readable via core op.

## Acceptance criteria
- [ ] Ladder tracks P1/P2/P3 with correct readiness from gate + novelty + interlock.

## Rollback / safety
Data + computation; revert to roll back.

## Hand-off
The ladder informs which artifacts are ready to draft/publish; UI/CLI read it.

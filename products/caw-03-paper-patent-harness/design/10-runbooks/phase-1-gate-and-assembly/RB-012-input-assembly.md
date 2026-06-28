# RB-012: Input assembly (engine-neutral)

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-011]
- Implements design: [../../05-harness-core/input-assembly.md](../../05-harness-core/input-assembly.md)
- Produces: `assemble_inputs` — the engine-neutral input bundle from gated claims + CAW-01 result refs

## Objective

Turn a `GatedClaimSet` + CAW-01 result refs into the engine-neutral input bundle (idea/experimental_log/figures/
template/guidelines) that any `WritingEngineAdapter` can consume. Gate-before-assemble; numbers result-ref-backed.

## Preconditions
- [ ] RB-011 (gate).

## Steps
1. **Do:** Define the engine-neutral bundle schema (CAW-03-owned) per [input-assembly.md](../../05-harness-core/input-assembly.md).
   **Verify:** `test:` schema validates a sample; round-trips claim_id + result_id.
2. **Do:** Implement `assemble_inputs(gatedSetId)`: build the bundle from gated claims ONLY; refuse any ungated claim.
   **Verify:** `test:` assembly refuses an ungated claim; accepts a gated one.
3. **Do:** Bind each figure/value to its CAW-01 `result_id` (result-ref-backed numbers) for the FigureTableManifest.
   **Verify:** `test:` every assembled number carries a result_id.
4. **Do:** Apply the artifact's confidentiality track (exclude over-track content) before output.
   **Verify:** `test:` over-track content is excluded.

## Acceptance criteria
- [ ] Engine-neutral bundle built from gated claims only; provenance (claim_id+result_id) preserved.
- [ ] Confidentiality track applied.

## Rollback / safety
Pure transform; revert to roll back.

## Hand-off
RB-020 maps this bundle to PaperOrchestra inputs and drafts.

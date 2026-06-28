# RB-021: Draft orchestration + artifact lifecycle

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-020, RB-003]
- Implements design: [../../07-backend-api/orchestration-service.md](../../07-backend-api/orchestration-service.md), [../../05-harness-core/artifact-lifecycle.md](../../05-harness-core/artifact-lifecycle.md)
- Produces: `draft_paper` orchestration + the Artifact state machine

## Objective

Run a paper draft end to end and drive the Artifact lifecycle (`assembled → drafting → drafted`), persisting the
EngineRun + FigureTableManifest, with failure/retry handling.

## Preconditions
- [ ] RB-020 (engine adapter), RB-003 (store).

## Steps
1. **Do:** Implement `draft_paper(artifactId)`: require `assembled`; resolve adapter (preflight); materialize inputs to `workspace/<run>/`; call `adapter.draft`.
   **Verify:** `test:` refuses a non-assembled artifact; runs an assembled one.
2. **Do:** Capture `DraftResult` + provenance; persist `EngineRun` + manifest; advance Artifact → `drafted`.
   **Verify:** `test:` a completed run leaves `drafted` + persisted outputs.
3. **Do:** Failure handling: subprocess failure → `failed`; retry creates a new `EngineRun` (outputs immutable); clean `workspace/<run>/` on success.
   **Verify:** `test:` a forced failure → `failed`; retry produces a new run id.
4. **Do:** Implement the lifecycle state machine + per-transition invariants (gate-before-assemble already enforced upstream).
   **Verify:** `test:` illegal transitions rejected.

## Acceptance criteria
- [ ] `draft_paper` runs end to end; lifecycle advances correctly; failure/retry handled.
- [ ] EngineRun + manifest persisted; outputs immutable per run.

## Rollback / safety
Workspace is scratch; artifacts immutable. Revert orchestration to roll back.

## Hand-off
RB-040 publishes a `drafted`/`reviewed` artifact; RB-022 adds the patent path.

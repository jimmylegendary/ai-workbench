# RB-003: Governance store (data model + persistence)

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-001]
- Implements design: [../../04-data-layer/data-model.md](../../04-data-layer/data-model.md), [../../04-data-layer/storage-strategy.md](../../04-data-layer/storage-strategy.md), [../../07-backend-api/persistence.md](../../07-backend-api/persistence.md)
- Produces: SQLite governance schema + repositories + artifact store (by path)

## Objective

CAW-03's own governance store: the data-model entities (ClaimRef, Bundle, GatedClaimSet, Artifact, EngineRun,
FigureTableManifest, ReviewResult, NoveltyFinding, PaperLadderEntry, AdapterConfig, InterlockState) on SQLite
(dialect-portable), plus a filesystem artifact store. CAW-01/02 are referenced by id/URI only.

## Preconditions
- [ ] RB-001 complete.

## Steps
1. **Do:** Migrations for the entities in [data-model.md](../../04-data-layer/data-model.md) (SQLite, PG-portable).
   **Verify:** `test:` insert/select round-trip per table.
2. **Do:** Implement the repos from [persistence.md](../../07-backend-api/persistence.md) (Ledger/Artifact/EngineRun/Manifest/Review/Novelty/Ladder/Registry/Interlock).
   **Verify:** `test:` repos satisfy their interfaces.
3. **Do:** Implement `ArtifactStore` over local FS (PDFs/patent drafts by path); set up `workspace/` conventions.
   **Verify:** `test:` put/get/resolve round-trip; no bytes in rows.
4. **Do:** Enforce the reference rule: CAW-01/02 stored as id/URI, never copied.
   **Verify:** `test:` a ClaimRef stores a CAW-02 id, not inline claim text.

## Acceptance criteria
- [ ] All entities migrate; repos pass; artifact store works by path.
- [ ] CAW-01/02 referenced by id/URI only.

## Rollback / safety
Forward-only migrations; drop the dev SQLite file to reset. Never edit a shipped migration.

## Hand-off
Gate/assembly/orchestration/publish runbooks persist their state here.

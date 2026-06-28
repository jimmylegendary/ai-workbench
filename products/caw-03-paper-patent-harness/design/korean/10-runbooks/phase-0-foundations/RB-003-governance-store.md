# RB-003: Governance store (data model + persistence)

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-001]
- Implements design: [../../04-data-layer/data-model_ko.md](../../04-data-layer/data-model_ko.md), [../../04-data-layer/storage-strategy_ko.md](../../04-data-layer/storage-strategy_ko.md), [../../07-backend-api/persistence_ko.md](../../07-backend-api/persistence_ko.md)
- Produces: SQLite governance schema + repository + artifact store (경로 기반)

## Objective

CAW-03 자체의 governance store: data-model 엔티티(ClaimRef, Bundle, GatedClaimSet, Artifact, EngineRun,
FigureTableManifest, ReviewResult, NoveltyFinding, PaperLadderEntry, AdapterConfig, InterlockState)를 SQLite
(dialect-portable) 위에 두고, 여기에 filesystem artifact store를 더한다. CAW-01/02는 id/URI로만 참조된다.

## Preconditions
- [ ] RB-001 완료.

## Steps
1. **Do:** [data-model_ko.md](../../04-data-layer/data-model_ko.md)의 엔티티에 대한 migration(SQLite, PG-portable).
   **Verify:** `test:` 테이블마다 insert/select round-trip.
2. **Do:** [persistence_ko.md](../../07-backend-api/persistence_ko.md)의 repo를 구현한다(Ledger/Artifact/EngineRun/Manifest/Review/Novelty/Ladder/Registry/Interlock).
   **Verify:** `test:` repo가 자신의 interface를 충족한다.
3. **Do:** 로컬 FS 위에 `ArtifactStore`를 구현한다(PDF/특허 draft를 경로로); `workspace/` 규약을 설정한다.
   **Verify:** `test:` put/get/resolve round-trip; row에 bytes 없음.
4. **Do:** 참조 규칙을 강제한다: CAW-01/02는 id/URI로 저장하고, 결코 복사하지 않는다.
   **Verify:** `test:` ClaimRef가 inline claim text가 아니라 CAW-02 id를 저장한다.

## Acceptance criteria
- [ ] 모든 엔티티가 migrate되고; repo가 통과하고; artifact store가 경로 기반으로 동작한다.
- [ ] CAW-01/02가 id/URI로만 참조된다.

## Rollback / safety
forward-only migration; 초기화하려면 dev SQLite 파일을 삭제한다. shipped migration은 절대 수정하지 않는다.

## Hand-off
gate/assembly/orchestration/publish runbook이 여기에 상태를 persist한다.

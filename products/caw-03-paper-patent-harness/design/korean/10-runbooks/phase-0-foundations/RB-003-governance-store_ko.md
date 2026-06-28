# RB-003: 거버넌스 스토어 (데이터 모델 + 영속성)

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-001]
- Implements design: [../../04-data-layer/data-model_ko.md](../../04-data-layer/data-model_ko.md), [../../04-data-layer/storage-strategy_ko.md](../../04-data-layer/storage-strategy_ko.md), [../../07-backend-api/persistence_ko.md](../../07-backend-api/persistence_ko.md)
- Produces: SQLite 거버넌스 스키마 + 리포지토리 + 아티팩트 스토어 (경로 기반)

## Objective

CAW-03 자체의 거버넌스 스토어: 데이터 모델 엔티티(ClaimRef, Bundle, GatedClaimSet, Artifact, EngineRun,
FigureTableManifest, ReviewResult, NoveltyFinding, PaperLadderEntry, AdapterConfig, InterlockState)를 SQLite
(방언 이식 가능) 위에 두고, 여기에 파일시스템 아티팩트 스토어를 더한다. CAW-01/02는 id/URI로만 참조된다.

## Preconditions
- [ ] RB-001 완료.

## Steps
1. **Do:** [data-model.md](../../04-data-layer/data-model_ko.md)의 엔티티에 대한 마이그레이션 (SQLite, PG 이식 가능).
   **Verify:** `test:` 테이블별 insert/select 왕복.
2. **Do:** [persistence.md](../../07-backend-api/persistence_ko.md)의 리포지토리 구현 (Ledger/Artifact/EngineRun/Manifest/Review/Novelty/Ladder/Registry/Interlock).
   **Verify:** `test:` 리포지토리가 자신의 인터페이스를 충족한다.
3. **Do:** 로컬 FS 위에 `ArtifactStore` 구현 (PDF/특허 초안을 경로로 저장); `workspace/` 규약을 설정한다.
   **Verify:** `test:` put/get/resolve 왕복; 행(row)에 바이트를 저장하지 않음.
4. **Do:** 참조 규칙을 강제한다: CAW-01/02는 id/URI로 저장하며 절대 복사하지 않는다.
   **Verify:** `test:` ClaimRef가 인라인 청구항 텍스트가 아니라 CAW-02 id를 저장한다.

## Acceptance criteria
- [ ] 모든 엔티티가 마이그레이션됨; 리포지토리 통과; 아티팩트 스토어가 경로 기반으로 동작.
- [ ] CAW-01/02는 id/URI로만 참조됨.

## Rollback / safety
전진 전용(forward-only) 마이그레이션; 리셋하려면 개발용 SQLite 파일을 삭제한다. 이미 배포된 마이그레이션은 절대 수정하지 않는다.

## Hand-off
게이트/어셈블리/오케스트레이션/퍼블리시 런북이 자신의 상태를 여기에 영속화한다.

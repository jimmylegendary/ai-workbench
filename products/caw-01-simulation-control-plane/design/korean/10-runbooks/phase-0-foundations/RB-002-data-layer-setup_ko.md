# RB-002: 데이터 레이어(SQLite, PG 이식 가능) + 아티팩트 스토어

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [data-model_ko.md](../../04-data-layer/data-model_ko.md), [storage-strategy_ko.md](../../04-data-layer/storage-strategy_ko.md), [work-tree-and-versioning_ko.md](../../04-data-layer/work-tree-and-versioning_ko.md), [knowledge-substrate_ko.md](../../04-data-layer/knowledge-substrate_ko.md), [persistence-and-storage-api_ko.md](../../07-backend-api/persistence-and-storage-api_ko.md)
- Produces: `@caw/db` 스키마 + 마이그레이션 + repository 구현 + 로컬 FS `ArtifactStore`

## Objective

Postgres 이식성을 유지한 채 SQLite 위에서 동작하는 데이터 레이어: simulation + HW-hierarchy + work-tree + 간결한 run-evidence/provenance 테이블, core 인터페이스 뒤의 repository 구현, 그리고 파일시스템 아티팩트 스토어. CAW-01은 *자신의* 런(run)에 필요한 최소한의 증거/출처만 보관한다. 일반 지식 저장소(외부 Sources/Claims/Notes/Concepts/Interests/OpenQuestions)는 **별도 제품(CAW-02)**이며 여기서는 범위 밖이다.

## Preconditions

- [ ] RB-001 완료(CI + `@caw/core`에 repo 인터페이스 stub됨).

## Steps

1. **Do:** dialect 이식 가능한 쿼리 레이어(Drizzle 또는 Kysely)를 선택한다. 지금은 SQLite를 설정하고 Postgres는 이후 목표로 둔다.
   **Verify:** `cmd:` 마이그레이션이 SQLite에 대해 실행된다. 동일 마이그레이션이 CI에서 Postgres에 대해 검증된다.
2. **Do:** [data-model_ko.md](../../04-data-layer/data-model_ko.md)에 따라 **simulation substrate**(Experiment, WorkloadModel, InputTrace, SimulationConfig, SimulationRun, TraceArtifact, Metric, ResultSet, MemoryAnnotatedIR, TensorNode, DataMovementEdge)에 대한 마이그레이션을 생성한다.
   **Verify:** `test:` 각 테이블에 대해 insert/select 왕복.
3. **Do:** **claim→evidence** 제약과 `trust_level`/`boundary` 컬럼을 갖춘 간결한 **run-evidence/provenance** 테이블(런에 첨부되는 Evidence, 그리고 CAW-01이 *자체적으로* 생성한 결론을 위한 Claim 행)을 생성한다. 광범위한 외부 지식 엔티티(Source/Note/Concept/Interest/OpenQuestion)는 모델링하지 **않는다** — 그것들은 CAW-02(별도 제품)에 있다.
   **Verify:** `test:` evidence 없는 publishable claim이 거부된다.
4. **Do:** **HW hierarchy** `hw_node` 인접(adjacency) 테이블(+ `part_id`)을 생성하고, 재귀 CTE 순회 헬퍼를 구현한다.
   **Verify:** `test:` chip→cluster 트리를 만들고 CTE로 순회한다.
5. **Do:** [work-tree-and-versioning_ko.md](../../04-data-layer/work-tree-and-versioning_ko.md)에 따라 **work-tree** 테이블(`change_blob`, `change_tree`, `change_commit`, `ref`, `intent_event`)을 content-address 해싱과 함께 생성한다.
   **Verify:** `test:` blob+tree+commit을 쓰고, ref를 이동하고, 변경되지 않은 하위 트리에서 구조적 공유(structural sharing)를 확인한다.
6. **Do:** 이 테이블들에 대해 `@caw/db`에 repository 인터페이스를 구현하고, 경로 규약 `artifacts/{exp}/{run}/{kind}/{rank}.{ext}`를 사용하여 로컬 FS 위에 `ArtifactStore`를 구현한다.
   **Verify:** `test:` `ArtifactStore.put/get/resolve` 왕복. repo가 `@caw/core` 인터페이스를 충족한다.

## Acceptance criteria

- [ ] 모든 테이블이 SQLite에서 마이그레이션되고 CI에서 Postgres에 대해 검증된다.
- [ ] claim→evidence 제약이 강제된다. trust/boundary 컬럼이 존재한다.
- [ ] Work-tree blob/tree/commit/ref가 구조적 공유와 함께 왕복한다.
- [ ] `ArtifactStore`가 경로로 저장/읽기한다. DB 행에 바이트가 없다.

## Rollback / safety

전진 전용(forward-only) 마이그레이션. dev에서 롤백하려면 SQLite 파일을 삭제하고 재마이그레이션한다. 출시된 마이그레이션은 절대 편집하지 마라.

## Hand-off

이제 엔진과 surface가 repo 인터페이스 뒤에서 experiment, run, IR, work-tree commit, artifact를 영속화할 수 있다.

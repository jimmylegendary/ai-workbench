# 영속성 & 스토리지 API — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-surface_ko.md](./api-surface_ko.md), [../04-data-layer/storage-strategy_ko.md](../04-data-layer/storage-strategy_ko.md), [../04-data-layer/work-tree-and-versioning_ko.md](../04-data-layer/work-tree-and-versioning_ko.md), [../01-decisions/ADR-0002-data-layer_ko.md](../01-decisions/ADR-0002-data-layer_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

데이터 계층과 아티팩트 저장소 API 위의 리포지토리 인터페이스, 그리고 트랜잭션/일관성 규칙을 다룬다.
스토리지 배치(placement)는 [../04-data-layer/storage-strategy_ko.md](../04-data-layer/storage-strategy_ko.md)에 있으며, 이 문서는 코드 계약이다.

## 리포지토리 인터페이스 (`@caw/core`에 정의, `@caw/db`에서 구현)

```ts
interface ExperimentRepo { create, update, get, list }
interface RunRepo        { create, setStatus, get, listByExperiment }
interface IrRepo         { putL0(runId, ir|path), getL0(runId), rollups(runId) }
interface MetricRepo     { put(runId, metrics[]), list(runId) }
interface WorkTreeRepo   { putBlob, putTree, putCommit, moveRef, getRef, walk(treeHash) }
interface KnowledgeRepo  { putSource, putClaim, putEvidence, link, query }
interface ArtifactStore  { put(path, bytesStream): uri; get(uri): stream; resolve(uri): localPath }
```

모든 구체 구현은 Postgres/SQLite(방언 이식 가능, dialect-portable) + 파일시스템/오브젝트 스토어를 대상으로 한다
([ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md)).

## 아티팩트 저장소

- `put`은 엔진 측에서(또는 어댑터를 통해) 경로 규약
  (`artifacts/{experiment}/{run}/{kind}/{rank}.{ext}`)을 사용해 호출된다.
- 행(row)에는 **URI**가 저장되며, 바이트는 절대 DB에 들어가지 않는다.
- 내용은 불변(immutable)이며, 재실행 시 새 run 폴더를 생성한다.

## 트랜잭션 규칙

| 단위 | 원자성 |
| --- | --- |
| Run 완료 | metrics + 아티팩트 행 + IR 등록이 함께 커밋됨 |
| Work-tree 저장 | blob/tree를 쓴 뒤, commit + ref 이동을 하나의 트랜잭션으로 처리 |
| Knowledge 쓰기 | claim + 해당 evidence 링크를 하나의 트랜잭션으로 처리(claim→evidence 불변식) |

## 그래프 접근

HW 트리 + IR 이웃 영역(neighborhood)은 인접 테이블(adjacency table) + **재귀 CTE(recursive CTE)**를 사용한다.
v1에는 Neo4j를 쓰지 않는다([../04-data-layer/data-model_ko.md](../04-data-layer/data-model_ko.md)).

## 일관성 & 마이그레이션

- 전진 전용(forward-only) 마이그레이션, CI에서 방언 검증(SQLite + Postgres).
- pgvector는 capability 플래그 뒤에 두어 SQLite 빌드가 컴파일되도록 한다.

## 미해결 질문

L0 규모에서 `IrRepo`가 L0를 행(row)으로 저장할지, 아니면 blob+인덱스로 저장할지 — TODO(open-question)
([../04-data-layer/data-model_ko.md](../04-data-layer/data-model_ko.md)).

## 런북에 대한 함의

Phase-0 데이터 계층 런북은 이 리포지토리들을 SQLite(PG 이식 가능) + 로컬 FS `ArtifactStore`에 대해 구현한다.

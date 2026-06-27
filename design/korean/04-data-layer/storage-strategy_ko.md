# 저장 전략(Storage Strategy) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model_ko.md), [work-tree-and-versioning.md](./work-tree-and-versioning_ko.md), [../01-decisions/ADR-0002-data-layer.md](../01-decisions/ADR-0002-data-layer_ko.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

*무엇을 어디에 저장할지*를 결정한다: Postgres 행 vs pgvector vs 파일시스템/오브젝트 스토어 blob vs md-first git, 그리고
SQLite→Postgres 이식성과 TS⇆Python 경계(seam) 전반의 artifact 경로 규약.

## 배치 매트릭스

| 데이터 | 저장소 | 이유 |
| --- | --- | --- |
| 관계형 엔티티, 그래프(HW 트리, IR 이웃), work-tree 객체, 메트릭 | **Postgres** (우선 SQLite) | 질의 가능한 단일 기록 시스템(system of record) |
| claim/run/IR에 대한 시맨틱 검색 | 동일 Postgres 내 **pgvector** | 단일 전문가 규모에서는 두 번째 저장소 불필요; 필요할 때만 추가 |
| 대용량 trace blob: Chakra ET, OTel, 원시 sub-torch 덤프, 원시 `InputTrace` | 경로/URI 기반 **파일시스템 / 오브젝트 스토어** | 행은 작게 유지; 엔진이 쓰고 core는 경로만 기록 |
| 사람이 작성한 서술(ADR, 설계 노트, 본 문서 집합) | **md-first git** | 사람이 diff 가능한 기록의 단일 출처 |

## SQLite → Postgres 이식성 규칙

첫 번째 슬라이스는 SQLite로 시작하되, 마이그레이션이 기계적으로 이뤄지도록 Postgres 이식 가능 상태를 유지한다:

- dialect 이식 가능한 부분집합을 제공하는 쿼리 빌더/ORM을 사용한다(예: Drizzle/Kysely) — SQLite 전용 기능 금지.
- JSON은 `JSONB` 호환 컬럼으로 모델링; UUID 텍스트 id; ISO 타임스탬프.
- 그래프 탐색에는 양쪽 모두 지원하는 recursive CTE만 사용 — SQLite `rowid` 트릭 금지.
- pgvector는 **Postgres 전용** 추가 기능이다: 시맨틱 검색 코드를 capability 플래그 뒤에 게이트하여 SQLite 빌드가 이것 없이도 컴파일되게 한다.
- 마이그레이션은 forward-only이며, CI에서 두 엔진 모두에 대해 dialect 검사를 거친다.

## Artifact 경로/URI 규약

엔진은 blob을 쓰고 경로를 반환하며, core는 인라인 blob을 받지 않는다
([ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md), [ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)):

```
artifacts/{experiment_id}/{run_id}/{kind}/{rank}.{ext}
  kind ∈ {chakra, otel, native, input, ir}
```

- `TraceArtifact.path`는 이 상대 URI를 저장하고, `ArtifactStore`가 이를 로컬 FS 또는 오브젝트 스토어로 해석(resolve)한다.
- 콘텐츠는 불변(immutable)으로 취급한다; 재실행은 새로운 run_id 폴더에 기록한다.

## 트랜잭션 & 일관성

- run의 메트릭 + artifact + IR 등록은 엔진이 경로를 반환한 후 하나의 트랜잭션으로 기록된다.
- work-tree 커밋은 append-only이며, ref는 단일 트랜잭션으로 이동한다([work-tree-and-versioning.md](./work-tree-and-versioning_ko.md)).

## 백업 / 보존

- DB: 표준 PG dump; 개발 환경에서는 SQLite 파일 스냅샷.
- Artifact: experiment 단위로 보존; 정리(pruning)는 추후 과제(v1 범위 밖).

## 미해결 질문

오브젝트 스토리지가 필요해지는 시점에 artifact 스토어로 로컬 FS를 쓸지 MinIO/S3를 쓸지 — TODO(open-question).

## 런북에 대한 함의

phase-0 데이터 레이어 런북이 dialect 이식 가능한 스키마 + `ArtifactStore` 인터페이스를 설정한다. phase-3/4
런북은 엔진이 위 경로 규약대로 쓰도록 만든다.

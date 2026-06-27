# Storage Strategy — source of truth인 md-git + 파생 SQLite 인덱스

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model_ko.md](./data-model_ko.md)
  - [./provenance-and-boundaries_ko.md](./provenance-and-boundaries_ko.md)
  - [./versioning-and-events_ko.md](./versioning-and-events_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../02-research/knowledge-store-storage-options_ko.md](../02-research/knowledge-store-storage-options_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 **CAW-02가 데이터 모델을 물리적으로 어떻게 영속화하는지**를 확정한다. 즉 단일 source of truth인
git 속 markdown, 파생되고 일회용인 SQLite 인덱스, 결정적이고 멱등인 `reindex`, droppable migration으로서의
FTS/vector, artifact-by-path 규칙, 그리고 SQLite→Postgres/Apache-AGE 업그레이드 경로다. 이는
[ADR-0002](../01-decisions/ADR-0002-storage_ko.md)를 구체화한다. 엔티티 필드(see [data-model](./data-model_ko.md)),
trust/boundary 의미론(see [provenance-and-boundaries](./provenance-and-boundaries_ko.md)), 또는 event-log
계약(see [versioning-and-events](./versioning-and-events_ko.md))은 정의하지 않는다.

## 1. 두 표현, 하나의 정본
| 표현 | 역할 | 권위 | 재구축 가능? |
|---|---|---|---|
| git 속 `knowledge/**.md` | source of truth: human-diffable, 서명된 이력, 감사 | **정본(Canonical)** | n/a (이것이 데이터 자체) |
| `index.sqlite` | surface를 위한 query/link/filter/FTS | 파생, **일회용** | 예 — 파일로부터 완전히 |
| `knowledge/_events/*.jsonl` | 각 write의 append-only event 미러 | append-only 원장 | replay 가능(see versioning) |

**규칙:** 어떤 surface(API/MCP/CLI/viewer)도 SQLite를 정본으로 취급하지 않는다. read 시 파일과 그 `node`
행 사이의 `content_hash` 불일치는 인덱스가 stale함을 의미한다 ⇒ rebuild; 결코 행을 조용히 신뢰하지 않는다.

## 2. 저장소 레이아웃
```
<repo-root>/
  knowledge/                 # SOURCE OF TRUTH (committed)
    sources/ claims/ evidence/ notes/ concepts/ interests/
    open-questions/ decisions/ assumptions/ signals/ _refs/
    _events/<ts>-<op>.jsonl  # append-only mirror
  artifacts/                 # large referenced payloads, by path (NOT inlined)
  .kr/
    index.sqlite             # derived, gitignored, droppable
    migrations/              # core + droppable FTS/vector migrations
  .gitignore                 # ignores .kr/index.sqlite and FTS/vector sidecars
```
`index.sqlite`는 **gitignore된다**: 이는 결코 기록의 artifact가 아니라 로컬 캐시일 뿐이다.

## 3. 핵심 인덱스 스키마 (portable SQLite∩Postgres 부분집합)
`TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` id, FK, CHECK만 사용 — 엔진 특화 타입 없음 — 따라서 포팅 후
동일한 DDL이 Postgres에서 실행된다.

```sql
CREATE TABLE node (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  boundary     TEXT NOT NULL DEFAULT 'internal'
               CHECK (boundary IN ('public','internal','confidential')),
  visibility   TEXT NOT NULL DEFAULT 'private'
               CHECK (visibility IN ('team','private')),
  status       TEXT NOT NULL,
  generated    INTEGER NOT NULL DEFAULT 0,
  trust        TEXT NOT NULL DEFAULT 'T0',     -- derived; mirror of file value
  artifact_uri TEXT,
  file_path    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_via  TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL
);

CREATE TABLE edge (
  src_id  TEXT NOT NULL REFERENCES node(id),
  dst_id  TEXT NOT NULL REFERENCES node(id),
  rel     TEXT NOT NULL,
  created_via TEXT NOT NULL,
  PRIMARY KEY (src_id, dst_id, rel)
);

CREATE TABLE event (                            -- mirror of _events JSONL (versioning doc)
  seq     INTEGER PRIMARY KEY,
  ts      TIMESTAMP NOT NULL,
  op      TEXT NOT NULL,
  node_id TEXT,
  payload TEXT NOT NULL                          -- JSON
);

CREATE TABLE provenance_event (                  -- PROV activity per transaction (ADR-0004)
  id       TEXT PRIMARY KEY,
  activity TEXT NOT NULL,
  agent    TEXT NOT NULL,
  ts       TIMESTAMP NOT NULL,
  tool     TEXT,
  payload  TEXT NOT NULL                          -- inputs[]/outputs[]/notes JSON
);
```

범용 `edge` 테이블은 **업그레이드 경로의 핵심(keystone)**이다 — 미래의 graph 엔진이 동일한 행을 읽는다.
`Claim→Evidence` 불변식은 DB 제약이 아니다(portable FK는 "≥1개의 타입 지정 edge"를 표현할 수 없다); 이는
validator와 reindex 재확인에 존재한다(see [data-model §6](./data-model_ko.md)).

## 4. Write 경로 (file-first, abort-on-fail)
크래시가 결코 고아를 남기지 않도록 순서가 고정되어 있다:

```
1. core validates the proposed transaction (frontmatter schema + Claim→Evidence + boundary propagation)
2. write/append the .md file(s)        # source of truth first
3. mirror node/edge rows into index.sqlite
4. append knowledge/_events/<ts>-<op>.jsonl  (+ event row)
5. re-run invariant on the affected subgraph
6. git commit (signed) — the audit ledger
   any failure before commit => roll back file + index (transaction aborts, no orphan)
```
agent의 write는 **기본적으로 확인(confirmation-by-default)**이다(ADR-0001): 검증된 트랜잭션은 staging되어
commit 전에 표시된다. write는 **append-only + supersedes**다 — in-place update/delete 없음(see
[versioning-and-events](./versioning-and-events_ko.md)).

## 5. 결정적이고 멱등한 reindex
`reindex`는 전체 설계가 기대고 있는 안전망이다: 인덱스를 버리고, `knowledge/**`로부터 byte-결정적으로
rebuild하며, 모든 불변식을 재확인한다.

```
reindex():
  1. DROP/recreate index.sqlite from core migrations (empty)
  2. walk knowledge/** in a STABLE sort order (path-sorted) for determinism
  3. for each .md: parse frontmatter -> upsert node row; project links: -> edge rows
  4. replay knowledge/_events/*.jsonl -> event table (seq from ts ordering)
  5. re-run Claim->Evidence invariant + boundary monotone propagation over the full graph
  6. recompute derived trust from edges; compare to file value -> mismatch is surfaced
  7. (re)build droppable FTS/vector migrations
  -> any invariant violation FAILS LOUD; never silently indexed
```

| 속성 | 보장 |
|---|---|
| 결정적 | 동일한 파일 ⇒ byte-동일 인덱스 + 동일 query 결과(안정적 walk 순서) |
| 멱등 | 두 번 실행해도 같은 상태; 언제든 재실행해도 안전 |
| 일회용 | `index.sqlite` 삭제는 아무것도 잃지 않음; rebuild가 복원 |
| Drift 감지 | skill 인터페이스 밖에서 편집된 파일이 잡힘(hash + 불변식 재확인) — 조정은 [versioning-and-events](./versioning-and-events_ko.md)에 |

## 6. 별도의 droppable migration으로서의 FTS와 vector
검색 기술은 결코 portability를 위협해서는 안 되므로, core 테이블을 건드리지 않고 drop/rebuild할 수 있는
**별도의 migration 파일**에 존재한다(검색 랭킹 자체는 ADR-0006이지 이 문서가 아니다).

```sql
-- migrations/200_fts.sqlite.sql   (DROPPABLE)
CREATE VIRTUAL TABLE node_fts USING fts5(
  id UNINDEXED, body, title, content='', tokenize='porter'
);
-- migrations/300_vector.sqlite.sql  (RESERVED, not in v0 — add on measured recall/precision trigger)
-- sqlite-vec sidecar; Postgres equivalent is pgvector. No embeddings in v0 (ADR-0006).
```

| Sidecar | v0 | Portable 등가물 |
|---|---|---|
| Full-text | **FTS5 (BM25)** | Postgres `tsvector`/GIN |
| Vector | **예약됨, 미구축** | pgvector(recall/precision 트리거가 발화할 때만 추가) |

sidecar를 drop하고 rebuild해도 어떤 core-table 행도 변경되어서는 안 된다.

## 7. Artifact-by-path
대용량 가져온 payload(CAW-01 projection/trace, 데이터셋)는 **결코 인라인되지 않는다**. 이는 `artifacts/`
아래(또는 외부 URI)에 존재하며 `evidence`/`_refs` 노드에서 `artifact_uri` + `checksum`으로 참조된다.

| 측면 | 규칙 |
|---|---|
| 위치 | `artifacts/<origin>/<id>/...` 또는 외부 `file://`/`https://` URI |
| 참조 | 노드의 `artifact_uri`; 무결성을 위한 `checksum: blake3:...` |
| Import | **public-safe** payload만 복사; 경계 통과 시 `boundary` 스탬프(ADR-0007) |
| Resolution | `extracted_from` 대상은 write 시점과 reindex 시점에 resolve되어야 함(불변식 계층) |

## 8. 업그레이드 경로 (source-of-truth 재작성 없음)
파일은 모든 단계에서 정본으로 남는다; 각 새 엔진은 또 하나의 파생 인덱스일 뿐이다.

| 단계 | 엔진 | 트리거 | 무엇이 바뀌는가 |
|---|---|---|---|
| v0 | SQLite 인덱스 + 재귀 CTE 순회 | 기본 | — |
| v1 | **Postgres** (동일 portable 스키마) | 동시 팀 writer / 인덱스 경합 | 엔진 교체; CTE 불변; MVCC, `tsvector`, `pgvector` 획득 |
| v2 | 동일 Postgres 위의 **Apache AGE** graph | 순회 깊이/성능 저하(~100k 노드 CTE BFS) 또는 continual learning 승인 | 기존 `edge` 행에 대한 openCypher |

모든 관계가 이미 범용 `edge` 행이기 때문에, graph 업그레이드는 **query 엔진 변경이지 데이터 마이그레이션이
아니다**. 파일(SoT)과 `_events` 원장은 손대지 않는다.

## Open Questions
- `TODO(open-question: team write-concurrency — git PR/merge vs serializing write-through API; the Postgres-port trigger.)`
- `TODO(open-question: reconciling _events JSONL with git history when files are edited outside the skill interface — see versioning doc.)`
- `TODO(open-question: exact recall/precision trigger that justifies adding the vector sidecar — owned with ADR-0006.)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의
- **RB (reindex first):** `knowledge/**`로부터 결정적·멱등 rebuild; byte-동일 query 결과; 위반 시 큰 소리로 실패.
- **RB (schema):** core portable-subset 테이블 + droppable FTS migration; 수용 검사로서 portable-SQL lint.
- **RB (write path):** file-first → 인덱스 미러 → `_events` append → validate → 서명된 commit; abort-on-fail.

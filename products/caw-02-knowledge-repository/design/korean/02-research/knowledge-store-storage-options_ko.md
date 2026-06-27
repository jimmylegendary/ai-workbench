# Knowledge Store 저장 옵션

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** ../_meta/PRODUCT-BRIEF_ko.md, ../01-decisions/ (ADR: storage — 작성 예정), ../08-research-plan/open-questions_ko.md
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
CAW-02 자체의 knowledge store에 대한 **v0 저장 방식**을 결정한다. 즉 `Source → Claim → Evidence → Note`
provenance(출처) 체인을 물리적으로 어떻게 영속화하여 (a) 사람이 diff하고 재구성할 수 있고, (b) 저렴하게
조회 가능하며, (c) SQLite와 Postgres 사이에서 이식 가능하고, (d) **재작성 없이** 그래프 / continual-learning(지속 학습)
모델로 업그레이드할 수 있게 만들 것인지를 다룬다. markdown-first 대 SQLite 대 Postgres 대 하이브리드를 비교하고,
구체적인 v0를 권고하며, 그래프 업그레이드 경로를 정의한다. 이 문서는 retrieval 랭킹(키워드 대 벡터 — 별도 ADR),
API/MCP/CLI 표면, 또는 import/export wire 포맷은 결정하지 **않는다**. 단지 그 계층들이 무엇을 읽고 쓰는지를 고정할 뿐이다.

## 브리프에서 이어받은 제약
- 규모: **단일 큐레이터(Jimmy) + 소규모 팀** + skill 인터페이스를 통해 쓰는 AI 에이전트. 조직/멀티테넌트 규모가 아니다.
- **재구성 가능성(Reconstructability)** 은 강한 요구사항이다: synthesis를 만들어낸 체인을 다시 재생할 수 있어야 한다.
- **Append-only 이력**을 선호한다. 생성된 요약은 evidence가 **아니며** 구조적으로 명확히 구분되어 있어야 한다.
- 모든 항목은 `boundary`(public / internal / confidential)와 **team 대 Jimmy-private** 플래그를 지닌다.
- 큰 아티팩트(import된 CAW-01 projection, trace)는 inline이 아니라 **path/URI로** 저장한다.
- **공유 substrate 없음** — 이 store는 CAW-02 전용이며, 다른 제품은 import/export 파일/API를 통해서만 접근한다.
- **v1에서는 무거운 그래프 DB(예: Neo4j) 없음**, 다만 업그레이드 경로는 열어 두어야 한다.

## 핵심 긴장 관계
두 속성이 반대 방향으로 잡아당긴다:
1. **신뢰 & 재구성 가능성** → git의 평문 파일을 선호: 사람이 diff 가능, 서명된 이력, 불투명한 바이너리 없음,
   "누가 이 claim을 왜 바꿨는가"를 감사하기 쉬움, 제품 자체가 재작성되어도 살아남음.
2. **조회 & 링크** → 관계형 store를 선호: `Claim → Evidence` 불변식 강제, 링크 순회, boundary/trust로 필터링,
   retrieval에 공급 — 이 모두 파일 더미 위에서 하기는 어색하다.

2026년 시장은 이를 **markdown-as-source-of-truth + 파생 인덱스** 분리로 해결하는 쪽으로 수렴했다
(Karpathy 스타일 "LLM wiki", `sqlite-memory`, `memweave`, `zk_index`): 파일이 정본이고 commit되며,
재구축 가능한 SQLite 인덱스가 FTS/링크/벡터를 제공한다. 우리는 이 분리를 채택한다.

## 역량 매트릭스

| 역량 | Markdown-only (git) | SQLite-only | Postgres-only | **Hybrid: md SoT + SQLite index (권고)** |
|---|---|---|---|---|
| 사람이 diff / git으로 감사 가능 | Excellent | Poor (binary) | Poor | **Excellent** (파일이 정본) |
| 재구성 가능한 provenance 체인 | 수동/관례에 의존 | Good (FK) | Good (FK) | **Good** (파일이 담고, 인덱스가 미러) |
| `Claim→Evidence` 불변식 강제 | None | Good (FK + CHECK) | Excellent (FK + trigger) | **Good** (ingest 시 validator + 인덱스의 FK) |
| 링크 순회 / "X에 대해 무엇을 아는가" | 고통스러움 (grep) | Good (recursive CTE) | Good (CTE / ltree / AGE) | **Good** (인덱스 위 CTE) |
| Append-only 이력 | Native (commit) | 수동 (event table) | 수동 (event table) | **Native** (commit) + event 미러 |
| 조회 시 boundary/trust 필터링 | Poor | Good | Good | **Good** (인덱스 컬럼) |
| Zero-infra / 단일 바이너리 배포 | Excellent | Excellent | Poor (server) | **Excellent** (인덱스는 로컬 파일) |
| 동시 다중 writer (팀 + 에이전트) | Git merge 충돌 | 단일 writer 락 | Excellent (MVCC) | **OK** (파일은 PR/merge; 인덱스는 재구축) |
| 전문 검색 | 내장 없음 | FTS5 | tsvector | **FTS5** 지금, port 후 tsvector |
| 벡터 / 의미 retrieval (나중) | None | sqlite-vec ext | pgvector | **sqlite-vec → pgvector** port 시 |
| 그래프 업그레이드 경로 | 재구축 필요 | Recursive CTE → edge table | CTE → Apache AGE / ltree | **Edge table → CTE → AGE** (SoT 재작성 없음) |
| 이식성 SQLite↔Postgres | N/A | 규율 있는 SQL 필요 | N/A | **Yes** 스키마가 portable-subset을 유지하면 |
| 백업 / DR | git remote | 파일 복사 | pg_dump | **git remote** (SoT) + 재구축 가능한 인덱스 |

## 권고 v0: markdown-first source of truth + 재구축 가능한 SQLite 인덱스

**결정 (ADR-storage용 제안):** git repo의 파일이 **단일 source of truth**이다. SQLite 데이터베이스는
**파생되고 폐기 가능한 인덱스**로, 어떤 표면(API/MCP/CLI/viewer)이든 조회는 하지만 결코 정본으로 취급하지 않는다.
인덱스는 언제든 **파일로부터 완전히 재구성 가능**하다(`reindex`는 idempotent). 스키마는 **portable subset**으로 유지되어
팀 쓰기 동시성이 요구될 때 동일한 DDL/쿼리가 Postgres에서 그대로 실행되도록 한다.

### 왜 이것이고 대안은 아닌가
- **vs markdown-only:** git의 신뢰/diff/이력은 유지하면서 에이전트가 필요로 하는 조회/불변식 계층을 추가한다. store의 가치는
  *타입이 지정된 provenance 트랜잭션*이며, 순수 grep으로는 `Claim→Evidence`를 강제하거나 "어떤 trust 수준으로"에 답할 수 없다.
- **vs SQLite-only / Postgres-only:** 바이너리 DB를 SoT로 두면 사람이 diff 가능한 이력을 잃고 재구성 가능성을 제품 자체의 코드에
  묶어 버린다. CAW-02가 재작성되어도 지식은 평문 파일로 살아남아야 한다. Postgres는 또한 zero-infra, 단일 큐레이터 기본값을
  깨뜨리며 이 규모에서는 과하다.
- **vs 지금 Postgres:** Postgres는 **이식 대상**이지 v0 기본값이 아니다. 동시 팀 writer나 AGE/pgvector가 실제로 필요할 때만
  채택하고(아래 재검토 트리거 참조), 동일한 portable-subset 스키마를 port한다.

### 파일 레이아웃 (source of truth)
```
knowledge/
  sources/<source-id>.md        # raw source descriptor (URI/path, type, boundary, imported-from)
  claims/<claim-id>.md          # one claim; frontmatter links evidence-ids (>=1 required)
  evidence/<evidence-id>.md     # points at a concrete artifact/source — never free text
  notes/<note-id>.md            # synthesis (cited); explicitly marked generated, NOT evidence
  concepts/, interests/, decisions/, open-questions/, assumptions/
  signals/<signal-id>.md        # RelatedWork / RadarSignal intake (classified, not loose summary)
  _events/<ts>-<op>.jsonl       # append-only transaction log (mirrors each skill-wrap write)
.git/                           # append-only history, signed commits, blame = provenance
```
각 `.md` = **YAML frontmatter(타입 지정 필드) + markdown 본문(사람용 노트)**. frontmatter는 기계용 계약이고,
본문은 사람을 위한 것이다. ID는 안정적이고 content-addressable 친화적인 slug이다(예: `clm_2026_<hash>`).

### 최소 portable 인덱스 스키마 (파일로부터 재구축됨)
**SQLite∩Postgres 부분집합**을 유지한다: `TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` id, FK, CHECK 제약. 핵심 테이블에는
SQLite 전용이나 PG 전용 타입을 두지 않는다. 하나의 범용 **edge table**이 업그레이드 경로의 핵심(keystone)이다.

```sql
CREATE TABLE node (
  id         TEXT PRIMARY KEY,           -- = filename id; mirror of the file
  kind       TEXT NOT NULL,              -- source|claim|evidence|note|concept|interest|
                                         -- open_question|decision|assumption|signal|trace|...
  boundary   TEXT NOT NULL CHECK (boundary IN ('public','internal','confidential')),
  visibility TEXT NOT NULL CHECK (visibility IN ('team','private')),
  trust      TEXT,                       -- trust level (provenance ADR owns the vocabulary)
  artifact_uri TEXT,                     -- for evidence/trace: path/URI to the real artifact
  file_path  TEXT NOT NULL,              -- path to the canonical .md
  content_hash TEXT NOT NULL,            -- detects drift between file and index
  created_at TIMESTAMP NOT NULL
);

-- Generic typed relationship. This single table is what makes a future graph a no-op.
CREATE TABLE edge (
  src_id   TEXT NOT NULL REFERENCES node(id),
  dst_id   TEXT NOT NULL REFERENCES node(id),
  rel      TEXT NOT NULL,   -- supports|refutes|cites|extracted_from|evidence_for|relates_to|...
  PRIMARY KEY (src_id, dst_id, rel)
);

-- Append-only mirror of the _events log, for reconstructability queries without git.
CREATE TABLE event (
  seq INTEGER PRIMARY KEY, ts TIMESTAMP NOT NULL,
  op TEXT NOT NULL, node_id TEXT, payload TEXT  -- JSON
);
```
- **불변식 강제(`Claim→Evidence`):** 모든 `node.kind='claim'`은 kind가 evidence인 노드로 가는 `edge(rel='evidence_for')`를
  ≥1개 가져야 한다. 이는 **ingest validator**가 강제하며(그리고 `reindex` 시 재확인), portable FK로는 "타입 지정 edge가 ≥1개"를
  표현할 수 없으므로 DB trigger가 아니라 writer/validator에 위치한다. 이로써 규칙이 SQLite와 Postgres에서 동일하게 유지된다.
- **FTS:** 별도의 `node_fts`(SQLite FTS5)가 위에 얹히며 순전히 파생이다 — 결코 정본이 아니고 자유롭게 drop/rebuild된다.
  Postgres에서는 `tsvector` 컬럼이 된다. 이를 핵심 테이블 밖에 두면 이식성이 보존된다.
- **벡터(retrieval ADR로 연기):** `sqlite-vec`를 통해 `node_vec` 테이블을 추가한다. Postgres에서는 → `pgvector`. 같은 패턴이다:
  파생, 재구축 가능, portable 핵심으로부터 격리.

### 이 설계의 명시적 경계
- 인덱스는 **누구에게도 권위가 없다.** 파일과 인덱스 사이 불일치는 파일로부터 `reindex`하여 해결한다.
- 읽기 시 `content_hash` 불일치 ⇒ 인덱스가 stale ⇒ rebuild 트리거. 결코 그 row를 조용히 신뢰하지 않는다.
- 큰 아티팩트(CAW-01 projection/trace)는 `knowledge/` 밖에 있고 `artifact_uri`로 참조된다. import 경계는 **public-safe**
  projection만 복사하고 `boundary`를 stamp한다 — confidential payload는 결코 repo에 들어오지 않는다.
- `_events` JSONL + git commit이 두 개의 append-only 원장(ledger)이다. `event` 테이블은 편의용 미러이지 세 번째
  source of truth가 아니다.

## Provenance 모델링: row와 file, 발맞춰서
체인은 두 표현 모두에서 **동일한 형태**로 모델링되어 둘 중 어느 것도 drift하지 않는다:

| 도메인 단계 | File (SoT) | 인덱스 row |
|---|---|---|
| add source | `sources/<id>.md` | `node(kind=source)` |
| extract claim | `claims/<id>.md` (frontmatter: evidence ≥1) | `node(kind=claim)` + `edge(claim→evidence, evidence_for)` |
| attach evidence | `evidence/<id>.md` (artifact_uri) | `node(kind=evidence, artifact_uri)` + `edge(evidence→source, extracted_from)` |
| synthesize note | `notes/<id>.md` (generated 표시) | `node(kind=note)` + `edge(note→claim, cites)` |
| classify signal | `signals/<id>.md` | `node(kind=signal)` + `edge(signal→claim, supports|refutes)` |

"synthesis N에 어떻게 도달했는지 재구성" = `note → cites → claim → evidence_for → evidence → extracted_from →
source`를 순회하는 것이며, `edge` 위의 recursive CTE로든 연결된 파일들에 대한 git-blame으로든 가능하다.

## 그래프 업그레이드 경로 (source-of-truth 재작성 없음)
관계가 이미 0일차부터 범용 타입 지정 `edge` table에 살기 때문에, "그래프로 가기"는 데이터 마이그레이션이 아니라
쿼리/엔진 변경이다:

1. **v0 — 관계형 edge + recursive CTE.** SQLite recursive CTE가 edge table을 순회하여 traversal과 "X의 이웃" 쿼리를
   처리한다. 단일 큐레이터 + 팀 규모에는 충분하다(SQLite CTE BFS가 저하되는 ~10만 노드 / 깊은 traversal 범위보다 훨씬 아래).
2. **v1 — Postgres port (트리거: 팀 동시 writer / 인덱스 경합).** 동일 portable 스키마. CTE는 변경 없음. MVCC, `tsvector`,
   `pgvector`를 얻는다.
3. **v2 — 네이티브 그래프 쿼리 (트리거: traversal 깊이/성능 또는 진짜 continual-learning).** 같은 Postgres 위에
   **Apache AGE**를 활성화(기존 edge 위 openCypher)하거나 — 전용 엔진이 정당화되는 경우에만 — edge table을 property graph로
   export한다. 어느 쪽이든 **markdown 파일은 source of truth로 남는다**. 그래프 엔진은 오늘날 FTS와 똑같이 또 하나의 파생
   인덱스일 뿐이다.

Continual learning(명시적으로 v0가 아님)이 여기에 끼워진다: append-only `event`/JSONL 원장 + 재구성 가능한 체인이 미래
학습 루프가 읽는 substrate이다. 그것을 추가하기 위해 v0에서 되돌려야 할 것은 아무것도 없다.

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug; tradeoff between stable links and dedup)`
- `TODO(open-question: team write-concurrency model — git PR/merge on files vs a write-through API that serializes; when does this force the Postgres port?)`
- `TODO(open-question: where exactly the Claim→Evidence "≥1" invariant is enforced — ingest validator only, or also a DB trigger on Postgres once ported?)`
- `TODO(open-question: trust-level vocabulary and whether it belongs in node row, frontmatter, or both — owned by the provenance & trust ADR)`
- `TODO(open-question: retrieval — when to introduce sqlite-vec/pgvector embeddings vs FTS-only; owned by the retrieval ADR)`
- `TODO(open-question: how _events JSONL and git history reconcile if someone edits files directly outside the skill interface)`

## 런북에 대한 함의
- **`reindex` 런북**이 먼저 존재해야 한다: `knowledge/**`로부터 전체 SQLite 인덱스를 결정론적이고 idempotent하게 재구축한다.
  이것이 전체 설계가 기대는 안전망이다. 수용 기준: DB를 drop하고, rebuild하고, 바이트 단위로 동일한 쿼리 결과.
- **ingest/skill-wrap 런북**은 **파일 먼저, 그 다음 인덱스에 미러 + `_events`에 append**하며, commit 전에 `Claim→Evidence`
  validator를 실행한다. 검증 실패는 전체 트랜잭션을 중단시킨다(orphan 파일 없음).
- **portable-subset SQL lint**를 수용 검사로 정의하여 SQLite 전용 구문이 핵심 테이블에 새어 들어가지 않도록 한다
  (Postgres port를 별일 아닌 것으로 유지).
- FTS와 벡터 테이블을 핵심 스키마와 **분리된, drop 가능한 마이그레이션**에 둔다. retrieval 선택이 결코 이식성을 위협하지 않도록.
- import 런북(CAW-01/05로부터)은 `boundary`/`visibility`를 stamp하고 아티팩트를 repo 밖 `artifact_uri`로 저장해야 한다 —
  결코 confidential payload를 inline하지 않는다.

## Sources
- [SQLite as a Graph Database: Recursive CTEs, and Why We Ditched Neo4j (dev.to)](https://dev.to/rohansx/sqlite-as-a-graph-database-recursive-ctes-semantic-search-and-why-we-ditched-neo4j-1ai)
- [memweave: Zero-Infra AI Agent Memory with Markdown and SQLite (Towards Data Science)](https://towardsdatascience.com/memweave-zero-infra-ai-agent-memory-with-markdown-and-sqlite-no-vector-database-required/)
- [sqliteai/sqlite-memory (GitHub)](https://github.com/sqliteai/sqlite-memory)
- [pithuene/zk_index — index markdown notes with SQLite (GitHub)](https://github.com/pithuene/zk_index)
- [Karpathy-style LLM wiki (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [SQLite recursive CTEs (sqlite.org)](https://sqlite.org/lang_with.html)
- [Modeling hierarchical tree data in PostgreSQL (ltree vs CTE)](https://leonardqmarcq.com/posts/modeling-hierarchical-tree-data)

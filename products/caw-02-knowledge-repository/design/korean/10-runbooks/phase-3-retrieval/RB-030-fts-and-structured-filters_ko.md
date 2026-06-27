# RB-030: ranking 이전에 적용되는 first-class structured filter를 갖춘 FTS5/BM25 search 구축

- Status: ready
- Phase: phase-3-retrieval
- Depends on: [RB-010 (md-git writer + deterministic reindex → SQLite), RB-011 (relational index: `node` + generic `edge` tables), RB-020 (core + op manifest + evidence gate)]
- Implements design:
  - [../../01-decisions/ADR-0006-retrieval_ko.md](../../01-decisions/ADR-0006-retrieval_ko.md) §1, §2
  - [../../05-knowledge-core/retrieval_ko.md](../../05-knowledge-core/retrieval_ko.md) ("Engine decision", "Structured filters BEFORE ranking")
  - [../../07-backend-api/retrieval-service_ko.md](../../07-backend-api/retrieval-service_ko.md) Stages 1–3
  - [../../04-data-layer/](../../04-data-layer/) (persistence + droppable migrations, ADR-0002)
- Produces:
  - relational index와 같은 위치에 있고 deterministic reindex로 재구축되는 **droppable** FTS5 migration(`node`의 text/title에 대한 `fts` virtual table).
  - 예약된 **nullable `node_vec` sidecar** migration(생성되되 v0에서는 미사용).
  - `search()` candidate-selection layer: filter plan → SQL `WHERE`(boundary/visibility/kind/trust/concept/status) → 이미 filter된 집합에 대한 BM25 ranking.
  - filter가 ranking **이전에** 실행됨을 증명하고 confidential/private item이 절대 filter-out된 결과 집합에 들어가지 않음을 증명하는 테스트.

## Objective
"완료"의 의미: SQLite로 reindex된 채워진 `knowledge/` corpus가 주어졌을 때, text query에 viewer authority와 선택적 filter를 더하면 후보 node ID의 순위 목록이 반환되는데 (a) boundary/visibility/`status`/`kind`/`trust`/`concept` 술어가 **BM25가 무엇이든 ranking하기 전에 SQL `WHERE`에서** 적용되고, (b) viewer가 볼 수 없는 어떤 `confidential`/`private` node도 절대 scoring되거나 반환되지 않으며, (c) ranking이 deterministic하고 hit마다 `bm25()` score가 포착되며, (d) FTS와 `node_vec` schema가 deterministic reindex로만 재구축되는 별개의 **droppable** migration에 살아 있다(SQLite 파일을 삭제하고 reindex하면 완전히 재구성됨). Provenance hydration과 RAG는 이 runbook에 없다(RB-031 참조). 이 runbook은 filter된 순위 seed 집합만 생성한다.

## Preconditions
- [ ] RB-010/RB-011 acceptance 충족: `reindex`가 deterministic + idempotent하다. SQLite `node` table이 `id, kind, title, text, boundary, visibility, owner, trust, status, content_hash`를 지닌다. generic `edge` table이 `src_id, dst_id, rel`을 지닌다.
- [ ] `boundary`는 core/reindex가 `node`에 기록한 **effective**(monotone-propagated) 값이다(ADR-0004). 이 runbook은 이를 소비하며 재계산하지 않는다.
- [ ] migration 프레임워크가 순서가 있는 droppable migration을 지원한다(FTS + vector는 자체 파일에 살며, SQLite↔Postgres 이식성을 절대 막지 않음 — ADR-0002 §3).
- [ ] 최소한 `public` 하나, `internal` 하나, `concept` edge를 가진 `confidential` 하나, (non-default actor 소유의) `visibility=private` 하나, 그리고 ≥2개의 `kind`와 ≥2개의 `trust` level에 걸친 item을 포함하는 테스트 fixture corpus가 존재한다.

## Steps

1. **FTS5 virtual table을 droppable migration으로 추가한다.**
   - Do: `CREATE VIRTUAL TABLE fts USING fts5(title, text, content='node', content_rowid='rowid');`를 선언하는 migration `NNN_fts.sql`과, reindex가 호출하여 `node`로부터 재채우는 rebuild trigger/command를 만든다. 독립적으로 droppable하도록 자체 migration 파일에 둔다. Postgres 대응물(`tsvector` + GIN)은 주석으로만 문서화한다 — 구축하지 않는다.
   - Verify: migration을 적용한 뒤 drop하면 relational schema가 온전히 남는다. reindex 후 `SELECT count(*) FROM fts`는 `SELECT count(*) FROM node WHERE text IS NOT NULL OR title IS NOT NULL`과 같다.

2. **nullable `node_vec` sidecar를 예약한다(v0에서 미사용).**
   - Do: 미래 embedding을 위한 nullable sidecar table/column(예: `node_vec(node_id PK, vec BLOB NULL, model TEXT NULL)`)을 가진 migration `NNN_node_vec.sql`을 자체 droppable migration으로 만든다. 거기에 아무것도 쓰지 않는다. embedding 코드 없음.
   - Verify: schema가 존재한다. `SELECT count(*) FROM node_vec`는 0을 반환한다. 이를 drop해도 FTS나 `node`에 영향이 없다. reindex가 이를 비어 있는 채로 재생성한다.

3. **FTS rebuild를 deterministic reindex에 배선한다.**
   - Do: SQLite 파일을 drop하고 재실행하면 `knowledge/` md-git으로부터만 `node`, `edge`, `fts`, 그리고 빈 `node_vec`를 재생성하도록 reindex를 확장한다.
   - Verify: `rm index.sqlite && reindex`가 네 가지 모두를 재구성한다. reindex를 두 번 실행하면 byte 단위로 동일한 FTS 콘텐츠가 나온다(idempotent, RB-010 acceptance에 따름).

4. **`SearchInput` filter plan과 viewer authority 분리를 정의한다.**
   - Do: [retrieval-service_ko.md](../../07-backend-api/retrieval-service_ko.md) Stage 1에 따라 filter-plan parser를 구현한다: `{ q, filters?{ boundary[], scope[], kind[], trust[], concept[], interest[], status[] }, limit?, viewer{ actor, max_boundary, scope } }`. `viewer.max_boundary`/`viewer.scope`를 **authority**로 취급한다(항상 AND로 결합되며 `filters`로 넓힐 수 없음). `filters`는 viewer가 이미 볼 수 있는 범위 내에서 **좁히는 용도만**으로 취급한다.
   - Verify: caller가 `filters.boundary=[confidential]`을 넘기되 `viewer.max_boundary=internal`인 경우 여전히 confidential row를 retrieve할 수 없음을 단위 테스트로 보인다(authority가 요청에 상한을 건다).

5. **filter를 ranking 이전 단일 SQL `WHERE`로 컴파일한다(leak 방지).**
   - Do: 모든 술어가 BM25 scoring 이전에 `WHERE`에서 AND로 결합되도록 candidate query를 구축한다. design SQL 형태를 따른다:
     ```sql
     SELECT node.id, node.kind, node.trust, node.boundary, node.visibility, bm25(fts) AS fts_rank
     FROM fts JOIN node ON node.rowid = fts.rowid
     WHERE fts MATCH :q
       AND node.boundary <= :viewer_max_boundary           -- public<internal<confidential ordering
       AND (node.visibility = 'team' OR node.owner = :viewer)  -- private only to owner
       AND (:kind   IS NULL OR node.kind   IN (:kind))
       AND (:trust  IS NULL OR node.trust  IN (:trust))
       AND (:status IS NULL OR node.status IN (:status))
       -- concept/interest via edge join (rel='about')
     ORDER BY fts_rank
     LIMIT :limit;
     ```
     안정적인 total `boundary` 순서(`public<internal<confidential`)를 구현하고, `concept`/`interest` filtering은 generic `edge` table(`rel='about'`) join을 통해 구현한다. 명시적으로 요청되지 않는 한 미검토(un-reviewed) candidate를 제외하도록 `status`를 기본값으로 설정한다(design "exclude un-reviewed candidates by default").
   - Verify: `EXPLAIN QUERY PLAN`으로 boundary/visibility/kind/trust/status 술어가 `ORDER BY bm25` 이후가 아니라 candidate scan의 일부임을 확인한다. 반환된 집합이 WHERE-filter된 집합의 부분집합임을 테스트로 assert한다.

6. **검사 가능하고 deterministic한 ranking을 포착한다.**
   - Do: 각 candidate를 `score.fts_rank = bm25(fts)`와 함께 반환한다. `vector_sim`/`rerank`는 unset으로 둔다(예약). `ORDER BY fts_rank`에 deterministic tiebreaker(예: `node.id`)를 더해 안정적인 출력을 보장한다.
   - Verify: 같은 query를 두 번 실행하면 동일한 순서와 동일한 `fts_rank` 값이 나온다.

7. **Leak 방지 테스트 매트릭스(핵심 acceptance).**
   - Do: fixture corpus에 대해 테스트를 추가한다: 각 `max_boundary`와 `scope`의 viewer에 대해 (a) `boundary > viewer.max_boundary`인 node가 나타나지 않음, (b) 다른 actor 소유의 `visibility=private` node가 나타나지 않음, (c) `kind`/`trust`/`concept`/`status` filter가 좁히되 절대 넓히지 않음, (d) confidential item이 가장 강한 BM25 match일 때조차 모든 non-confidential viewer의 결과 집합에서 부재함을 assert한다.
   - Verify: 모든 테스트 통과. `WHERE`를 의도적으로 약화하면(boundary 술어 제거) leak 테스트가 실패한다(테스트가 실재함을 증명).

8. **RB-031을 위한 candidate-selection 함수를 노출한다.**
   - Do: RB-031의 hydration layer가 seed source로 사용하는 단일 `searchCandidates(input) -> { id, kind, trust, boundary, visibility, score }[]`를 export한다. 여기서는 hydration도, synthesis도 없다.
   - Verify: 함수 signature가 안정적이고 단위 테스트되어 있다. RB-031이 SQL을 건드리지 않고 import할 수 있다.

## Acceptance criteria
- [ ] FTS5와 `node_vec`가 각각 자체 **droppable** migration에 산다. `rm index.sqlite && reindex`가 md-git으로부터 `node`, `edge`, `fts`, 빈 `node_vec`를 완전히 재구성한다.
- [ ] FTS의 reindex가 idempotent하다(반복 실행 시 byte 단위 동일).
- [ ] 모든 structured filter(`boundary`, `visibility`, `kind`, `trust`, `concept`/`interest`, `status`)가 BM25 ranking **이전에** SQL `WHERE`에서 적용된다(query plan + 부분집합 테스트로 검증).
- [ ] `viewer.max_boundary`/`viewer.scope`는 caller `filters`로 넓힐 수 없다. confidential/private item은 top BM25 hit일 때조차 filter-out된 viewer의 결과 집합에 절대 들어가지 않는다.
- [ ] `node_vec`가 존재하며 nullable이고 비어 있다. v0에는 embedding 코드가 없다.
- [ ] candidate마다 `score.fts_rank`가 반환된다. ranking이 deterministic하다.
- [ ] 이 checkpoint에서 Tree가 green이다(build + lint + 테스트).

## Rollback / safety
- FTS와 `node_vec`는 **파생되고 폐기 가능(disposable)**하다(ADR-0002): 어떤 실패에도 두 migration을 drop하고 reindex를 재실행한다 — md-git은 손대지 않으므로 knowledge가 손실되지 않는다.
- 이 runbook은 `knowledge/`에 **쓰기 경로를 추가하지 않는다**. SQLite 인덱스에 대한 read-only이다. 중간 실패가 source of truth를 손상시킬 수 없다.
- boundary 순서나 `WHERE`가 의심스러우면, leak 테스트 매트릭스가 다시 green이 될 때까지 `search()` 진입점을 비활성화한다(fail-closed: leak 위험을 무릅쓰기보다 빈 결과 반환).

## Hand-off
- RB-031은 다음을 가정할 수 있다: `score.fts_rank`, `trust`, `boundary`, `visibility`를 가진 seed node를 반환하는 deterministic하고 boundary-safe한 filter-before-rank `searchCandidates()`. reindex로 재구축되는 FTS + 예약된 `node_vec` migration. chain hydration에 사용 가능한 generic `edge` table.
- viewer-authority 계약(`max_boundary`/`scope`를 상한으로)이 여기서 고정되며, RB-031의 hydration 동안 다시 적용되어야 한다.

# RB-003: Derived SQLite index, deterministic idempotent reindex, droppable FTS5, 예약된 vector sidecar

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001, RB-002]
- Implements design: [storage-strategy.md §3,§5,§6](../../04-data-layer/storage-strategy_ko.md), [component-boundaries.md §reindex, §store/index](../../03-architecture/component-boundaries_ko.md), [repo-structure.md §migrations/, §index/](../../03-architecture/repo-structure_ko.md), [tech-stack.md §"derived index: SQLite + FTS5"](../../03-architecture/tech-stack_ko.md)
- Produces: portable core migration `migrations/0001_core.sql`(`node, edge, event`, + `provenance_event`); 작은 migration runner; `src/index/reindex` — `knowledge/**`만으로부터 `index.sqlite`를 deterministic하고 idempotent하게 재구축; droppable FTS5 migration `0002_fts.sql`; 예약되었으나 사용되지 않는 vector sidecar `0003_vec.sql.reserved`; portable-SQL lint와 golden-reindex(byte-identical) 테스트

## Objective
derived, disposable query index가 존재하고 정규 store로부터 재구축 가능함이 입증된다. `migrations/0001_core.sql`은 `TEXT/INTEGER/TIMESTAMP`, FK, CHECK만 사용하여 portable한 SQLite∩Postgres core 테이블(`node`, `edge`, `event`, `provenance_event`)을 정의한다. `reindex`는 `.index/index.sqlite`를 drop하고, core migration으로 재생성하며, `knowledge/**`를 stable한 정렬 순서로 walk하고, node + edge를 mirror하고, `_events`를 replay하며, Claim→Evidence invariant를 재실행한다 — 어떤 위반에서도 시끄럽게 실패한다. FTS5는 별도의 droppable migration에 존재하며; vector sidecar는 예약되고 사용되지 않는다. "Done" = reindex가 deterministic(재실행 시 byte-identical content/result), disposable(sqlite 파일을 삭제해도 재구축이 완전히 복원), sidecar를 drop/rebuild해도 core 테이블 row가 바뀌지 않으며, portable-SQL lint가 통과함. trust recompute와 boundary propagation은 여기서 stub/no-op이다(전체 로직은 phase-3); reindex 구조는 그것들을 위한 seam을 남겨야 한다.

## Preconditions
- [ ] RB-002 완료: `content_hash`가 있는 typed `knowledge/**` read, `_events` JSONL ledger, deterministic serialization.
- [ ] `better-sqlite3` + 번들된 SQLite/FTS5 pin resolve됨; FTS5가 배포 빌드에 컴파일되어 있음을 확인(`tech-stack.md`의 `TODO(open-question)` resolve).
- [ ] core schema(`storage-strategy.md` §3), reindex 알고리즘(§5), sidecar 규칙(§6)을 읽었음.

## Steps

1. **portable core migration 작성.**
   - Do: `storage-strategy.md` §3에 정확히 따라 `node`, `edge`, `event`, `provenance_event`를 가진 `migrations/0001_core.sql` 작성(portable subset: `TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` id, FK, `boundary`/`visibility`에 대한 CHECK; generic `edge` 테이블이 graph-upgrade의 핵심 keystone). Claim→Evidence 제약을 DB FK로 추가하지 마라(portable FK는 "≥1 typed edge"를 표현할 수 없음) — 그것은 validator/reindex re-check에 존재.
   - Verify: `0001_core.sql`을 fresh sqlite 파일에 적용하면 네 테이블이 생성됨; `PRAGMA foreign_keys`가 동작; CHECK 제약이 무효 `boundary`를 거부.

2. **migration runner 작성.**
   - Do: `src/index/`에서 번호 매겨진 migration을 `.index/index.sqlite`에 대해 순서대로 적용하고 어느 것이 적용되었는지 추적하는 작은 runner 추가. core migration은 항상 적용; sidecar migration(`0002_fts`, 향후 `0003_vec`)은 droppable add-on으로 적용.
   - Verify: runner가 빈 `.index/index.sqlite`에 `0001_core.sql`을 적용; 재실행은 no-op(idempotent migration 추적).

3. **deterministic reindex core 구현.**
   - Do: `src/index/reindex/`에서 `storage-strategy.md` §5 / `component-boundaries.md` §reindex에 따라 `reindex(knowledge_dir)` 구현: (1) `0001_core.sql`로 index를 drop & 재생성; (2) `knowledge/**`를 STABLE한 path-sorted 순서로 walk; (3) 각 `.md`에 대해 frontmatter 파싱(RB-002 `store/files` + schema 재사용) → `node` row upsert, `edges[]` → `edge` row로 project; (4) `knowledge/_events/*.jsonl`을 (ts 순으로) replay → monotonic `seq`를 가진 `event` row. trust recompute + boundary propagation(phase-3)을 위한 typed no-op seam을 남김.
   - Verify: RB-002 fixture에 대한 reindex가 예상 개수로 `node`/`edge`/`event`를 채움; row 순서/내용이 실행 간 stable.

4. **공유 validator를 사용해 invariant re-check(layer 3) 연결.**
   - Do: mirror 이후, core validator layer 2를 뒷받침할 것과 SAME validation 코드를 사용하여 전체 그래프에 대해 Claim→Evidence invariant를 재실행(두 번째 구현 없음 — `component-boundaries.md` determinism 계약). `supports`/evidence edge가 0인 `claim` node는 FAILS LOUD; 무효한 것은 조용히 index되지 않음. 또한 파일당 `content_hash`를 재계산하고 불일치를 surface(source 파일이 이김).
   - Verify: 유효 claim+evidence가 있는 fixture set에 대한 reindex는 통과; evidence 없는 claim을 주입하면 reindex가 위반 보고와 함께 시끄럽게 실패; 변조된 `content_hash`가 surface됨.

5. **Golden / determinism + idempotency 테스트.**
   - Do: golden-reindex 테스트 추가: 고정된 corpus에 reindex를 두 번 실행하고 byte-identical index content(또는 동일한 canonical query-result 스냅샷)를 단언; 그다음 `.index/index.sqlite`를 삭제하고 재구축하여 `knowledge/**`로부터의 완전 재구성을 단언.
   - Verify: 두 실행이 일치; 삭제 후 재구축이 원본과 동일(disposable + deterministic + idempotent).

6. **droppable FTS5 migration 작성.**
   - Do: `storage-strategy.md` §6에 따라 FTS5 virtual table(예: `node_fts(id UNINDEXED, body, title, ... tokenize='porter')`)과 모든 filter column을 생성하는 `migrations/0002_fts.sql` 작성. reindex 단계가 core 테이블 AFTER에 node body로부터 그것을 (재)빌드. core row를 건드리지 않고 droppable해야 함. (BM25 ranking + structured filter는 phase-5 — 여기서는 테이블을 빌드/drop하고 채우기만.)
   - Verify: `0002_fts.sql`을 적용한 다음 drop해도 `node`/`edge`/`event` row가 바뀌지 않음; reindex가 `node_fts`를 다시 채움; 기본 `MATCH` 쿼리가 seed된 fixture를 반환.

7. **vector sidecar 예약(사용 안 함).**
   - Do: `migrations/0003_vec.sql.reserved`를 RESERVED, UNUSED nullable `node_vec` sidecar placeholder로 추가(comment-only 또는 `.reserved`라서 runner가 적용하지 않음). 이후 활성화 트리거(측정된 recall/precision)를 문서화 — `TODO(open-question: numeric recall/precision trigger; owned with ADR-0006)`. v0에 embedding 없음.
   - Verify: runner가 `0003_vec.sql.reserved`를 적용하지 않음; reindex 후 `node_vec` 테이블이 존재하지 않음; 파일이 존재하고 reserved로 명확히 표시됨.

8. **portable-SQL lint.**
   - Do: `migrations/0001_core.sql`이 SQLite∩Postgres portable subset(`TEXT/INTEGER/TIMESTAMP`, FK, CHECK만; engine 특화 타입 없음) 내에 머무름을 단언하는 lint(스크립트 또는 테스트) 추가. 비-portable 타입이 도입되면 flag해야 함. sidecar migration(FTS/vector)은 면제(설계상 격리됨).
   - Verify: lint가 `0001_core.sql`에서 통과; core에 비-portable 타입(예: `JSONB`)을 심으면 실패; 심어둔 것 제거.

9. **gitignore + write 방향 확인; CI 연결.**
   - Do: `.index/index.sqlite` + sidecar 파일이 gitignore됨을 확인(RB-000) — index는 derived이며 절대 commit되지 않음. `reindex`와 `core/ingest`만 `store/index`에 write함을 확인(boundary lint / interaction matrix). reindex, golden, FTS drop/rebuild, portable-SQL lint 테스트를 CI에 추가.
   - Verify: `git check-ignore .index/index.sqlite`가 그것을 반환; CI green; boundary lint가 여전히 통과.

## Acceptance criteria
- [ ] `migrations/0001_core.sql`이 portable subset으로 `node, edge, event, provenance_event`를 생성; portable-SQL lint가 통과하고 심어둔 비-portable 타입을 거부.
- [ ] `reindex`가 `knowledge/**`만으로 `.index/index.sqlite`를 재구축: sqlite 파일을 삭제하고 재실행하면 완전히 재구성.
- [ ] 고정된 corpus에 reindex 재실행이 byte-identical content / 동일한 query 결과를 산출(deterministic + idempotent).
- [ ] Claim→Evidence invariant re-check가 공유 validator를 사용하고 evidence가 0인 claim에 대해 FAILS LOUD; `content_hash` 불일치가 surface됨(파일이 이김).
- [ ] `0002_fts.sql`(FTS5)이 별도의 droppable migration; drop+rebuild해도 core 테이블 row가 바뀌지 않음; reindex가 다시 채움.
- [ ] `0003_vec.sql.reserved`가 존재하고, reserved이며, runner가 적용하지 않음; v0에 `node_vec` 테이블 없음.
- [ ] `.index/`가 gitignore됨; reindex/`core/ingest`만 index를 write(interaction matrix 유지).
- [ ] 트리가 green(typecheck + lint + boundary lint + tests).

## Rollback / safety
- index는 derived이고 disposable이다: `.index/index.sqlite`를 삭제해도 아무것도 잃지 않음 — `reindex`가 복원. 이 RB의 코드/migration을 되돌리려면: `git reset --hard <pre-RB-003>`. 정규 `knowledge/**`는 reindex에 의해 절대 write되지 않으므로, 잘못된 reindex가 source of truth를 손상시킬 수 없다; 그저 시끄럽게 실패하고 index를 빌드되지 않은 채 남긴다.

## Hand-off
- Phase-1/2(core + skill-wrap → M1)는 다음을 가정할 수 있다: portable core schema, invariant를 재검사하는 deterministic idempotent `reindex`, 그리고 write 경로의 "mirror node/edge rows" 단계(`storage-strategy.md` §4 step 3)를 위한 index mirror target — M1 transaction이 필요로 하는 md-git → SQLite round-trip을 닫음.
- Phase-3(provenance/trust + boundary)는 reindex Step 3에서 남긴 trust-recompute / boundary-propagation seam에 꽂힌다.
- Phase-5(retrieval)는 Step 6의 FTS5 테이블 위에 BM25 ranking + ranking 이전 structured filter를 빌드한다; Step 7의 예약된 vector sidecar는 측정된 트리거를 기다린다.

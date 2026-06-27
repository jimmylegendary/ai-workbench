# RB-002: Markdown+frontmatter entity store, type별 schema, `_events` writer, signed-commit write 경로

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [storage-strategy.md §1,§2,§4](../../04-data-layer/storage-strategy_ko.md), [repo-structure.md §knowledge/, §entity file shape, §_events/](../../03-architecture/repo-structure_ko.md), [component-boundaries.md §store/files, §Audit](../../03-architecture/component-boundaries_ko.md), [tech-stack.md §"storage: git + markdown"](../../03-architecture/tech-stack_ko.md)
- Produces: entity kind당 `schemas/frontmatter/` zod schema(invariant layer 1); deterministic하고 abort-on-fail write 순서를 가진 `.md`(frontmatter + body)의 `src/core/store/files` read/write; append-only `knowledge/_events/<ts>-<op>.jsonl` writer + event row shape; `src/core/audit`의 git signed-commit driver; CI에서 schema 검증을 통과하는 kind별 유효 sample fixture

## Objective
정규 store가 실체화된다: entity당 하나의 `.md`(YAML frontmatter 기계 계약 + markdown body), entity kind당 하나의 zod frontmatter schema(공통 field와 edge를 커버), 고정된 file-first write 순서로 그 파일들을 read/write하는 `store/files` 레이어, 모든 write를 한 줄로 mirror하는 append-only `_events` JSONL writer, 그리고 audit ledger를 기록하는 git signed-commit driver. "Done" = fixture가 round-trip(write → read → byte-stable re-emit)하고, frontmatter schema가 CI에서 good fixture를 검증하고 bad를 거부하며, write당 정확히 하나의 `_events` 줄이 append되고, signed commit이 생성됨. 전체 transaction orchestration(validator/gate/trust/index mirror)은 여기서 빌드하지 않음 — 이 RB는 이후 레이어가 호출할 store + schema + ledger + commit primitive를 빌드한다.

## Preconditions
- [ ] RB-000 + RB-001 완료: `knowledge/**` 디렉터리 존재, `schemas/frontmatter/` 존재, CI schema-validate 단계 연결됨, op manifest 존재.
- [ ] `gray-matter` + `yaml` pin resolve됨(tech-stack); commit-signing 접근 결정 — 선택한 key/signing config와 human vs agent actor에 대한 `created_via`/`created_by` 관례를 기록(`tech-stack.md`의 `TODO(open-question: commit-signing key management)` resolve).
- [ ] 진행에 충분할 만큼 ID scheme 결정(`repo-structure.md`의 `TODO(open-question: ID scheme)` resolve — 예: `<kindprefix>_<...>`); 기록.
- [ ] `repo-structure.md` §"Entity file naming and shape"의 공통 field + edge shape와 `storage-strategy.md` §4의 write 순서를 읽었음.

## Steps

1. **공유 frontmatter base + edge schema 정의.**
   - Do: `schemas/frontmatter/`에서 공통 field에 대한 zod base schema 작성: `id, kind, boundary ∈ {public,internal,confidential}, visibility ∈ {team,private}, trust (T0..T3|contested), status, supersedes (nullable), content_hash, created_by, created_at (RFC3339)`, 그리고 generic `edges: [{rel, dst}]` 배열(하나의 typed-edge 계약 — ADR-0003). `trust`를 DERIVED로 표시(schema는 받아들이지만 결코 caller-set되지 않음; author-supplied가 아님을 검증하는 것은 이후 phase의 관심사임을 명시).
   - Verify: unit 테스트가 최소한의 유효 base 객체를 파싱하고 `boundary`/`visibility` 누락 객체를 거부.

2. **entity kind당 zod schema 정의.**
   - Do: 10개 kind(`source, claim, evidence, note, concept, interest, decision, open-question, assumption, signal`) 각각에 대해 base를 확장하고 kind 특화 field 추가(예: `source`: `artifact_uri`/`content_hash`; `claim`: `claim_type`, `supports`/`evidence` rel 포함 edge; `note`: `generated:true`; `evidence`: `extracted_from` artifact ref / 절대 prose 아님; `signal`: RelatedWork/RadarSignal typing). 여기서는 claim의 edge 배열이 존재한다는 schema 수준 요구를 넘어 Claim→Evidence ≥1 cross-entity invariant를 아직 강제하지 마라 — 전체 강제는 layer 2/3(이후 phase)이다; 이 경계를 명시.
   - Verify: 각 kind schema가 컴파일됨; 테스트가 kind당 good fixture 하나를 검증.

3. **sample fixture 작성.**
   - Do: `tests/fixtures/knowledge/<kind>/` 아래에 kind당 하나의 유효 `.md` fixture 추가(또는 원하면 `knowledge/`에서 직접 시연), 더하여 몇몇 kind마다 의도적으로 무효한 fixture를 적어도 하나씩(`boundary` 누락, edge가 빈 claim, prose field가 있는 evidence).
   - Verify: CI schema-validate(RB-001)가 모든 유효 fixture를 통과하고 모든 무효 fixture를 실패시킴.

4. **`store/files` read 구현.**
   - Do: `src/core/store/`에서 `gray-matter` + `yaml`을 사용하는 reader 구현: `.md`를 로드, frontmatter/body 분리, kind의 zod schema로 frontmatter 파싱, typed entity 반환. `knowledge/<kind>/<id>.md`로부터 `file_path` 도출.
   - Verify: 테스트가 각 fixture를 읽고 `kind`가 디렉터리와 일치하는 typed 객체를 얻음.

5. **`store/files` deterministic write + round-trip 안정성 구현.**
   - Do: frontmatter를 STABLE 키 순서와 canonical YAML 포맷으로 serialize(그래서 reindex가 byte-deterministic — `storage-strategy.md` §5)하고 `knowledge/<kind>/<id>.md`를 쓰는 writer 구현. canonical content에 대해 `content_hash = sha256` 계산. write는 append-only + supersedes이다: 절대 in-place mutate하지 않음; 수정은 새 id를 쓰고 이전 것에 `supersedes`를 설정.
   - Verify: write → read → re-serialize가 byte-identical(round-trip 테스트); field 편집이 `content_hash`를 변경.

6. **file-first, abort-on-fail write 순서 구현(store primitive).**
   - Do: `storage-strategy.md` §4에서 자신이 소유하는 단계를 수행하는 `store.writeTxn(files[])` primitive 제공: 먼저 `.md` 파일을 write/append(source of truth), 그다음 (이후 phase에서) index mirror + `_events` + commit으로 hand off. commit 전 어떤 실패에서도 방금 쓴 파일을 제거하여 orphan이 남지 않게 함. (validator, index mirror, invariant re-check는 phase-1/2에서 연결됨; 이를 위한 typed seam/no-op hook을 남김.)
   - Verify: write 중간 실패를 시뮬레이션하는 테스트가 `knowledge/`를 변경하지 않은 채 남김(orphan 파일 없음).

7. **append-only `_events` writer 구현.**
   - Do: `src/core/audit`에서 write당 정확히 하나의 JSONL 줄을 `knowledge/_events/<ts>-<op>.jsonl`에 append, shape는 `{seq, ts, op, node_id, actor, payload}`(per `repo-structure.md` §`_events/`). `_events`는 content이다(commit됨, 절대 gitignore되지 않음). event는 write를 mirror하며; append-only이다 — 절대 다시 쓰지 않음.
   - Verify: 한 write가 정확히 한 줄을 append; 그 줄이 필수 키와 함께 JSON으로 파싱됨; 두 번째 write가 두 번째 줄을 append(monotonic `seq`/`ts`).

8. **git signed-commit driver 구현.**
   - Do: `src/core/audit`에서 `git` CLI를 구동하여 쓰여진 `.md` + `_events` 줄을 stage하고 SIGNED commit 생성(audit ledger — `storage-strategy.md` §4 step 6, `tech-stack.md`). Preconditions의 actor/signing config 사용. 파일 write + event append가 성공한 후에만 commit; 실패 시 abort(Step 6에 따라 파일 롤백).
   - Verify: write가 entity 파일과 그 `_events` 줄을 포함하는 하나의 signed commit을 생성(`git log --show-signature -1`이 good signature 표시); 유발된 실패는 commit도 orphan 파일도 생성하지 않음.

9. **CI에 연결.**
   - Do: store/schema/events/commit unit 테스트를 test suite에 추가; schema-validate가 `schemas/frontmatter/**`를 커버하도록 보장.
   - Verify: `npm test`와 CI가 green; boundary lint(RB-001)가 여전히 통과(`audit`/`store`는 `core/**` 아래에 있고 adapter가 import하지 않음).

## Acceptance criteria
- [ ] 10개 entity kind 전부에 zod frontmatter schema가 존재하며, 공통-field + generic-edge base를 공유.
- [ ] 유효 fixture는 통과하고 무효 fixture(boundary 누락, claim edge 빈 것, evidence-내-prose)는 CI schema-validate를 실패.
- [ ] `store/files` read→write→re-read가 byte-identical(deterministic serialization); `content_hash`는 canonical content에 대한 sha256.
- [ ] write 경로가 file-first이고 abort-on-fail: 유발된 write 중간 실패가 `knowledge/`에 orphan을 남기지 않음.
- [ ] 각 write가 정확히 하나의 `knowledge/_events/<ts>-<op>.jsonl` 줄을 `{seq, ts, op, node_id, actor, payload}`로 append; `_events`는 commit됨, gitignore되지 않음.
- [ ] write가 entity 파일 + 그 event 줄을 포함하는 정확히 하나의 signed git commit을 생성; `git log --show-signature`가 검증.
- [ ] Append-only + supersedes가 준수됨(in-place mutation 경로가 존재하지 않음).
- [ ] 트리가 green(typecheck + lint + tests + boundary lint).

## Rollback / safety
- 이제 정규 데이터가 존재한다. merge 전에 이 RB를 되돌리려면: `git reset --hard <pre-RB-002>`(추가된 schema/store 코드 AND commit된 모든 fixture를 폐기). write가 append-only + supersedes이고 모든 write가 signed commit이므로, 빌드 중간 수정은 그 자체로 commit이다 — 공유된 이후에는 history 재작성보다 새 superseding commit을 선호하라. `_events` 줄을 절대 in-place로 편집하지 마라.

## Hand-off
- Phase-1(core/reindex, RB-003)은 다음을 가정할 수 있다: deterministic serialization + `content_hash`를 가진 `knowledge/**`의 typed read/write, `_events` JSONL ledger, signed-commit driver — 그래서 reindex가 파일을 파싱 + event를 replay할 수 있고, core가 validate한 다음 commit할 수 있다.
- 전체 §4 write 순서의 중간 단계(validate → index mirror → invariant re-check)는 Step 6에서 남긴 seam에 꽂힌다; phase-2 core가 이를 연결한다.
- frontmatter schema는 3-layer Claim→Evidence invariant의 layer 1이다; core validator(layer 2)와 reindex re-check(layer 3)는 바로 이 schema 위에서 빌드된다.

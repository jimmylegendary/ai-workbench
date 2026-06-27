# RB-013: two-axis boundary+visibility propagation + hash-chained append-only audit 구현

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-010 (product core + op dispatch), RB-011 (data model + invariant), RB-012 (evidence gate + trust)]
- Implements design:
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries_ko.md)
  - [../../04-data-layer/versioning-and-events.md](../../04-data-layer/versioning-and-events_ko.md)
  - [../../07-backend-api/api-surface.md](../../07-backend-api/api-surface_ko.md)
  - [../../01-decisions/ADR-0004-provenance-and-trust.md](../../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../../01-decisions/ADR-0002-storage.md](../../01-decisions/ADR-0002-storage_ko.md)
- Produces: 계산된 **monotone propagation**(synthesis는 결코 downgrade하지 않음)을 가진 두 직교 축 `boundary{public⊂internal⊂confidential} × visibility{team,private}`, 유일한 downgrade 경로인 `reclassify` activity, 그리고 git history를 두 번째 witness로 삼는 `knowledge/_events/*.jsonl`에 대한 **hash-chained append-only audit**.

## Objective
민감도("건물을 떠날 수 있는가")와 범위("누구의 공간인가")는 결코 하나로 무너지지 않는, 둘 다 `NOT NULL`이고 default-deny인 두 독립 컬럼이다. core는 entity의 **effective** `boundary`를 자기 자신과 모든 provenance 조상에 대한 lattice-max로 계산하고, **effective** `visibility`를 자기와 모든 조상이 `team`일 때에만 `team`으로 계산한다 — 그래서 confidential Claim을 cite하는 Note는 그 자체로 ≥ confidential이며 synthesis가 민감도를 아래로 laundering할 수 없다. 유일한 downgrade는 human에 의한 attributed `reclassify` event이다. 모든 write는 `provenance_event`에 연결된 하나의 hash-chained `_events` 줄을 append하고, `verify_audit`이 chain 무결성을 증명한다; signed git commit이 redundant audit of record이다. "Done" = monotonicity 테스트가 통과하고, AI agent가 boundary를 downgrade할 수 없으며, audit chain이 검증되고 변조를 감지함.

## Preconditions
- [ ] RB-012 gate 이후 그래프 + derived trust가 존재하고 green.
- [ ] node schema에서 `boundary`/`visibility` 컬럼이 `NOT NULL` default-deny(`internal`/`private`)임(RB-011/RB-002).
- [ ] `AuditService.append`가 모든 write txn에 연결됨(RB-010 step 8)이고 `_events`/`provenance_event`가 transaction당 write됨.

## Steps

1. **schema + write layer에서 두 독립 축 강제.**
   - Do: `boundary ∈ {public,internal,confidential}`(ordered lattice)와 `visibility ∈ {team,private}`(unordered)가 둘 다 `NOT NULL`이고 새로운 미분류 항목에 대해 `internal`/`private`로 default됨을 확인([provenance-and-boundaries.md §1](../../04-data-layer/provenance-and-boundaries_ko.md)). 축은 결코 하나의 field로 병합되지 않음.
   - Verify: node가 `public`/`private`일 수 있고 다른 것이 `confidential`/`team`일 수 있음; 어느 축이든 생략하면 `internal`/`private`로 default; 어휘 밖 값은 거부됨.

2. **provenance edge에 대한 monotone boundary propagation 구현.**
   - Do: propagate하는 edge가 `evidence_for | challenges | extracted_from | cites | derived_from`인 `boundary_eff(n) = max_lattice(boundary(n), {boundary_eff(a) : a ∈ prov_ancestors(n)})` 구현([provenance-and-boundaries.md §2](../../04-data-layer/provenance-and-boundaries_ko.md)). 파일은 **declared** 값을 보유; index와 모든 read는 **effective** 값을 계산. `BoundaryService.effective_boundary`로 노출([api-surface.md](../../07-backend-api/api-surface_ko.md)).
   - Verify: `confidential` Claim을 `cites`하는 `internal`로 declare된 Note는 `boundary_eff = confidential`을 반환; 계산된 floor 아래로 declare된 값은 surface됨(조용히 수용되지 않음).

3. **monotone visibility propagation 구현.**
   - Do: `visibility_eff(n) = team`은 `visibility(n)=team` AND 모든 provenance 조상이 `team`일 때에만; 그렇지 않으면 `private`.
   - Verify: `private` Claim을 cite하는 `team` Note는 `visibility_eff = private`을 반환; 모두 `team`인 chain은 `team`을 유지.

4. **generation에 의한 downgrade 금지; 유일한 downgrade 경로 제공.**
   - Do: declare된 `boundary`가 계산된 floor 아래인 모든 write를 거부(`check_write_boundary` → `BOUNDARY` error). 유일하게 정당한 downgrade는 `activity=reclassify`, `agent=human:*`, `from`, `to`, `reason`을 가진 `reclassify` provenance_event이다([provenance-and-boundaries.md §3](../../04-data-layer/provenance-and-boundaries_ko.md)). AI agent는 boundary를 downgrade할 수 없음.
   - Verify: monotonicity 테스트 — `confidential` 입력으로부터의 synthesis는 결코 덜 제한적인 boundary를 산출하지 않음; AI-actor `reclassify`(downgrade)는 거부됨; reason을 가진 `human:jimmy` `reclassify`는 수용되고 event로 append됨(조용한 field 편집이 아님).

5. **reindex에서 effective label recompute.**
   - Do: `reindex`가 전체 그래프에 대해 `boundary_eff`/`visibility_eff`를 전역적이고 deterministic하게 다시 계산; 계산된 floor보다 낮게 declare된 값은 reindex 보고에 surface됨.
   - Verify: index를 drop하고 rebuild — effective label이 실행 간 동일; 심어둔 declared-below-floor node가 surface됨.

6. **`_events` ledger를 hash-chained로 만들기.**
   - Do: 각 `_events` 줄이 `seq`, `prev_hash`, `hash = H(prev_hash ‖ canonical(line_payload))`를 가지도록 `AuditService.append` 확장([api-surface.md AuditService](../../07-backend-api/api-surface_ko.md); [versioning-and-events.md §2](../../04-data-layer/versioning-and-events_ko.md)). knowledge transaction당 한 줄, append-only, source of truth의 일부로 commit. `TODO(open-question: hash-chain over _events in v0 vs signed-git-commits-only — owned by ADR-0004).`
   - Verify: append된 각 줄의 `prev_hash`가 이전 줄의 `hash`와 같음; genesis 줄은 고정된 sentinel `prev_hash`를 가짐.

7. **`verify_audit`와 변조 감지 구현.**
   - Do: chain을 walk하고 첫 break를 보고하는 `verify_audit(from_seq?, to_seq?) → {ok, broken_at?}` 구현([api-surface.md](../../07-backend-api/api-surface_ko.md)).
   - Verify: `verify_audit`이 깨끗한 ledger에서 `ok:true` 반환; 임의의 historical 줄을 변경하면 `broken_at` = 그 줄의 seq와 함께 `ok:false` 반환.

8. **git history를 두 번째 redundant witness로 바인딩.**
   - Do: commit하는 모든 write가 (구성된 곳에서 signed) git commit을 생성하여 blame이 byte 수준에서 "누가 이 파일을 언제 바꿨는가"에 답하게 하고, 이는 의미론적 `_events` ledger와 redundant함([versioning-and-events.md §3](../../04-data-layer/versioning-and-events_ko.md)). 모든 `_events` 줄은 commit된 파일 변경에 대응.
   - Verify: happy-path corpus에서 각 `_events` 줄이 명명된 node 파일을 건드리는 commit에 매핑됨; `history(id)`가 node의 event 순서를 반환.

9. **audit으로부터 label 재구성.**
   - Do: boundary/visibility/trust 변경이 모두 `_events` + `provenance_event` + git blame으로부터 replayable함을 보장(in-place 편집 없음; `reclassify`/`review`가 유일한 label 변경 activity).
   - Verify: audit 재구성이 주어진 node가 현재 `boundary`, `visibility`, `trust`에 어떻게 도달했는지(어느 event/activity가 각각을 설정했는지) 보여줌.

## Acceptance criteria
- [ ] `boundary`와 `visibility`가 두 독립 `NOT NULL` default-deny 축; 절대 병합되지 않음.
- [ ] Monotonicity: `confidential` 입력으로부터의 synthesis가 결코 덜 제한적인 effective boundary를 산출하지 않음; `team`+조상-`private` ⇒ effective `private`.
- [ ] boundary downgrade가 human-attributed `reclassify` event를 통하지 않으면 거부됨; AI agent는 downgrade 불가.
- [ ] effective label이 reindex에서 deterministic하게 recompute됨(drop-and-rebuild가 재현); declared-below-floor가 surface됨.
- [ ] `_events` 줄이 hash-chained됨; `verify_audit`이 깨끗할 때 `ok:true`를 반환하고 변조 후 `broken_at`을 짚어냄.
- [ ] 모든 `_events` 줄이 commit된 파일 변경에 매핑됨; `history(id)`가 event 순서를 반환.
- [ ] node label(boundary/visibility/trust)이 audit + git blame으로부터 재구성 가능.
- [ ] 트리가 green(build + lint + monotonicity + reclassify-authority + audit-verify/tamper 테스트).

## Rollback / safety
- propagation은 계산된다(index/effective 값은 disposable이고 reindex가 rebuild함). 그래서 propagation 버그는 rebuild 너머로 지속될 수 없고 declared md 값은 결코 손상되지 않는다. audit은 append-only이다: 아무것도 mutate되지 않으므로, 이 runbook의 롤백은 propagation + hash-chain 로직을 등록 해제하는 것을 의미하며, `knowledge/`, `_events`, git history는 온전히 남는다. 실패한 write 중간은 `_events` 줄을 남기지 않으므로(RB-010 atomicity), chain에 gap이 생기지 않는다.

## Hand-off
- M2(P3 종료)가 충족됨: boundary/visibility propagation + trust + structural gate + hash-chained audit이 모든 write에 강제됨.
- P4 surface는 반환/write 전에 `BoundaryService`를 호출하고 기본 confirmation을 상속(RB-010).
- P5 retrieval은 여기서 계산된 effective label을 사용해 ranking 이전에 `boundary`/`visibility` filter를 적용; P6 import/export는 이 label에 대해 re-redact하고 fail-closed allow-list를 실행.

# RB-010: 하나의 transactional product core + op dispatch 빌드

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-001 (repo + knowledge tree), RB-002 (frontmatter schemas), RB-003 (node/edge/event SQLite schema + deterministic reindex)]
- Implements design:
  - [../../07-backend-api/api-surface.md](../../07-backend-api/api-surface_ko.md)
  - [../../04-data-layer/versioning-and-events.md](../../04-data-layer/versioning-and-events_ko.md)
  - [../../05-knowledge-core/entity-and-edge-model.md](../../05-knowledge-core/entity-and-edge-model_ko.md)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../../01-decisions/ADR-0002-storage.md](../../01-decisions/ADR-0002-storage_ko.md)
- Produces: `core/` 패키지 — 단일 transactional core(`Txn`, 하나의 op manifest로부터의 op dispatch, append-only + supersedes writer, 기본 confirmation), 그리고 모든 surface(P4)가 codegen될 대상인 in-process op registry.

## Objective
단일 transactional core가 CAW-02에 대한 모든 write를 소유한다. 모든 op은 **op manifest**에 한 번 선언된다; dispatcher가 typed 요청을 op handler로 라우팅하고, handler는 고정된 write 순서 `file → index mirror → _events append → validate → commit`으로 하나의 atomic transaction 안에서 실행된다. update/delete는 존재하지 않는다: 수정은 `supersedes`로 연결된 새로운 content-addressed node이다. agent write는 **기본 confirmation**이다(`confirm:true`가 될 때까지 `CONFIRM_REQUIRED`). "Done" = manifest, dispatcher, transaction skeleton, append-only writer, confirmation gate가 존재하고 테스트로 행사됨; RB-011/012/013이 자신의 validator를 이 core의 validate phase에 꽂는다. core가 ALL logic을 담는다; 향후 adapter는 아무것도 추가하지 않는다.

## Preconditions
- [ ] `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals,_refs,_events}/`가 존재하고 버전 관리됨(RB-001).
- [ ] kind별 YAML frontmatter schema가 존재하고 fixture를 lint함(RB-002).
- [ ] SQLite `node`, `edge`, `event`, `provenance_event` 테이블이 존재; deterministic idempotent `reindex`가 `knowledge/**`로부터 그것들을 재구축(RB-003).
- [ ] 트리가 green(build + lint + schema-validate).

## Steps

1. **op manifest를 단일 op truth로 정의.**
   - Do: operation당 한 row를 나열하는 `core/manifest.*` 생성: `{ name, json_schema, idempotency, kind: read|write, mcp_annotations }`. write op `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, record_decision, review_accept, review_reject, link, supersede, reclassify, recompute_trust`와 read op `search, get, answer, effective_boundary, get_chain, history, verify_audit`을 seed([api-surface.md](../../07-backend-api/api-surface_ko.md)에 따른 signature). read op은 `readOnlyHint:true`를 설정.
   - Verify: `manifest_lint` 테스트가 모든 row가 JSON schema, 고유한 `name`, `kind`를 가짐을 단언; write op 개수 ≥ 12; manifest를 두 번 로드하면 동일한 byte를 산출.

2. **typed envelope와 error code 구현.**
   - Do: [api-surface.md](../../07-backend-api/api-surface_ko.md) cross-cutting 계약에 정확히 따라 `Envelope<R> = { ok, result?, error?{code,message,offending_ids?}, txn_id, audit_id }`와 `ErrCode = VALIDATION|EVIDENCE_GATE|INVARIANT|BOUNDARY|CONFLICT|NOT_FOUND|QUARANTINED|CONFIRM_REQUIRED`를 구현.
   - Verify: unit 테스트가 `ok:true` envelope와 각 `ok:false` envelope를 구성; 빈 `audit_id`를 가진 success envelope는 테스트를 실패시킴(`audit_id` 누락은 api-surface Implications에 따라 빌드 실패).

3. **dispatcher 구현.**
   - Do: `dispatch(op_name, input, WriteOpts)`가 manifest row를 조회하고, `input`을 row의 JSON schema에 대해 validate(schema layer-1 hook)한 다음, 등록된 handler를 호출. 알 수 없는 op → `VALIDATION`. `WriteOpts = { idempotency_key, actor:{kind:human|agent,id}, confirm? }`.
   - Verify: 등록되지 않은 op를 dispatch하면 `ok:false code:VALIDATION` 반환; row schema에 실패하는 input으로 dispatch하면 `VALIDATION`을 반환하고 아무것도 write하지 않음.

4. **고정된 write 순서로 단일 atomic transaction 구현.**
   - Do: `Txn.run(handler)`가 [api-surface.md](../../07-backend-api/api-surface_ko.md) §cross-cutting과 [ADR-0002]에 따라 수행: (a) `.md` 파일을 stage, (b) index `node`/`edge` mirror row를 stage, (c) `_events/<ts>-<op>.jsonl` 줄 + `provenance_event`를 stage, (d) validate phase 실행(등록된 validator — RB-011/012/013), (e) 모두 통과할 때만 commit(파일 write, index flush, event append); 그렇지 않으면 stage된 모든 효과를 롤백. content-addressed scheme(`<prefix>_<yyyy>_<base32(blake3(payload))[:10]>`, [data-model §2](../../04-data-layer/data-model_ko.md))로 node id 생성.
   - Verify: 의도적으로 실패하는 validator가 `knowledge/` 아래에 새 파일 0개, 새 `_events` 줄 0개, 새 index row 0개를 남김(orphan 없음); 통과하는 op은 정확히 하나의 `.md`, 정확히 하나의 `_events` 줄, 하나의 `provenance_event`를 write.

5. **append-only + supersedes 구현(update 없음, delete 없음).**
   - Do: `supersedes:<old_id>`를 가진 NEW node 버전(새 content-addressed id)을 write하고 old node를 `status=superseded`로 뒤집는 status-only supersede event를 방출하는 `supersede(old_id, new_id, reason)` 제공(per [versioning-and-events.md §1](../../04-data-layer/versioning-and-events_ko.md)); in-place content mutation이나 파일 삭제를 시도하는 모든 handler를 거부.
   - Verify: 테스트 "edit"가 두 파일을 생성(old 유지, `status=superseded`; new에 `supersedes` 설정)하고 하나의 `supersede` event; core API를 통한 in-place overwrite나 `rm` 시도가 거부됨.

6. **idempotency 구현.**
   - Do: 각 write를 `WriteOpts.idempotency_key`로 key 지정; 동일한 key로의 replay는 두 번째 write 없이 원래 `Envelope`(동일한 `txn_id`)를 반환. `supersedes` target 불일치는 `CONFLICT` 반환.
   - Verify: 동일한 `add_source`를 하나의 key로 두 번 실행하면 하나의 node와 동일한 `txn_id` 산출; stale/non-latest target에 대한 `supersede`는 `CONFLICT` 반환.

7. **agent write에 대한 기본 confirmation 구현.**
   - Do: `dispatch`에서 op이 `kind=write`이고 `actor.kind=agent`이며 `confirm!==true`이면, 어떤 staging 전에 `ok:false code:CONFIRM_REQUIRED`로 short-circuit; human actor와 `confirm:true`는 진행(per [ADR-0001 §5](../../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md), api-surface Parity). read op은 면제.
   - Verify: `confirm` 없는 agent `add_source`는 `CONFIRM_REQUIRED`를 반환하고 아무것도 write하지 않음; `confirm:true`인 동일한 것은 write; `confirm` 없는 human `add_source`는 write.

8. **AuditService.append를 모든 write txn에 연결.**
   - Do: commit하는 모든 write가 `AuditService.append({op,node_id?,payload,actor})`를 호출하여 `_events` + `provenance_event`를 채우고 envelope에 `audit_id`를 stamp(hash chain 자체는 RB-013).
   - Verify: 성공한 모든 write envelope가 비어 있지 않은 `audit_id`를 가짐; commit에 도달하지 않은 write는 audit entry를 생성하지 않음.

## Acceptance criteria
- [ ] 하나의 op manifest가 모든 op을 선언; `manifest_lint`가 통과하고 load가 byte-stable.
- [ ] dispatcher가 manifest로 라우팅하고, input을 schema-validate하며, 알 수 없는 op을 `VALIDATION`으로 거부.
- [ ] 실패하는 validate phase가 orphan 파일 / event / index row를 남기지 않음(atomic 롤백 검증됨).
- [ ] 성공한 write가 정확히 하나의 `.md`, 하나의 `_events` 줄, 하나의 `provenance_event`, 비어 있지 않은 `audit_id`를 생성.
- [ ] core를 통해 in-place update나 delete에 도달할 수 없음; 수정은 `supersede`를 통함.
- [ ] Idempotency: 동일 key ⇒ 하나의 write, 동일 `txn_id`; stale supersede target ⇒ `CONFLICT`.
- [ ] `confirm` 없는 agent write ⇒ `CONFIRM_REQUIRED`이고 아무것도 write 안 됨; human 또는 `confirm:true`는 진행.
- [ ] 트리가 green(build + lint + schema-validate + 위의 테스트).

## Rollback / safety
- transaction이 safety 단위이다: 어떤 중간 실패도 stage된 file/index/event 효과를 롤백하므로, 중단된 빌드는 절대 half-written knowledge node를 남기지 않는다. commit이 부분적으로 적용되면(예: 파일은 write됐으나 event는 아님), `reindex`(RB-003)가 drift를 감지하고 broken state를 index하기보다 시끄럽게 실패한다. 이 runbook을 되돌리려면 `core/` 패키지를 삭제; `knowledge/`와 index는 건드리지 않는다.

## Hand-off
- RB-011은 data-model + Claim→Evidence invariant validator를 core의 validate phase(step 4d)에 등록한다.
- RB-012는 structural evidence-gate와 trust derivation을 등록한다.
- RB-013은 `AuditService.append`를 hash-chained로 만들고 boundary propagation을 추가한다.
- P4 surface는 여기서 생산된 op manifest로부터 codegen된다; 그것들은 로직을 추가하지 않는다.

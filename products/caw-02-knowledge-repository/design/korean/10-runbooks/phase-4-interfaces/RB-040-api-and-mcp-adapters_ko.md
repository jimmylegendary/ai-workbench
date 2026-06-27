# RB-040: op manifest로부터 API + MCP 어댑터 코드 생성

- Status: ready
- Phase: phase-4-interfaces
- Depends on: [RB-021 (core txn + op manifest + evidence gate, phase-2), RB-031 (provenance/trust labels, phase-3)]
- Implements design:
  - [../../06-interfaces/api-and-mcp.md](../../06-interfaces/api-and-mcp_ko.md)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P4 / M3)
  - [../../09-roadmap/dependency-graph.md](../../09-roadmap/dependency-graph_ko.md) (edge F→J)
- Produces: 단일 op-manifest 스키마 + 로더; 타입이 지정된 HTTP API 라우트와 MCP 도구 카탈로그(core op당 하나)를 방출하는 코드 생성 단계; MCP 어노테이션을 포함한 read/write 분리; 에이전트 쓰기에 대한 기본 확인 게이트(confirmation-by-default gate); 서피스 간 패리티 계약 테스트.

## 목표
"완료(Done)" = 타입이 지정된 HTTP API와 MCP 서버가 모두 단일 op manifest(RB-021)로부터 **생성**되고, 비즈니스 로직을 추가하지 않으며, 모든 작업을 기존 core transaction으로 곧장 라우팅한다. 각 op은 정확히 한 번만 나타나며, 두 서피스가 공유하는 단일 closed JSON Schema 하나를 사용한다. Read op(`search`, `get`, `export_bundle`, `verify_audit`)은 `readOnlyHint:true`이며 자동 실행될 수 있다. 모든 write op은 에이전트 호출자에 대해 기본적으로 확인 필수(confirmation-required)이며, 정규(canonical) `{ok,result,error,txn_id,audit_id}` 엔벌로프와 error→status 매핑은 두 서피스에서 동일하다. 패리티 계약 테스트는 API와 MCP 카탈로그가 op 집합이나 스키마에서 어긋나면 빌드를 실패시킨다. 어느 서피스도 core를 거치지 않고는 store에 도달할 수 없다(evidence gate, trust cap, boundary 전파, 해시 체인 audit은 core 내부에서 한 번만 실행된다).

## 사전 조건
- [ ] RB-021이 반영되었다: op manifest가 존재하고, core가 가드레일(G1–G8)을 이미 강제하는 단일 타입 지정 진입점 `invoke(op, args, actor) -> envelope`를 노출한다.
- [ ] manifest가 참조하는 공유 closed JSON Schema(`./schemas/*.json`, 산문/`text`/`summary` 필드가 **없는** `attach_evidence.json` 포함)가 존재하고 fixture를 검증한다.
- [ ] RB-031이 반영되었다: core가 read op에서 boundary/visibility/trust 라벨을 반환하고, AI가 작성한 콘텐츠는 T2로 제한된다.
- [ ] Tree가 green이다(build + lint + 기존 테스트 통과).

## 단계

1. **정규 op-manifest 스키마를 고정한다.**
   - 할 일: [api-and-mcp.md §1](../../06-interfaces/api-and-mcp_ko.md)에 정확히 맞춰 하나의 manifest 엔트리에 대한 메타 스키마를 정의한다: `op`, `kind`(`read|write`), `mcp_tool`(`kr.*`), `api: {method, path}`, `idempotency`(natural-key 튜플 또는 `caller`), `annotations: {readOnlyHint, destructiveHint, idempotentHint}`, `input_schema`(경로), `scopes`(`kr:read|write|import|export`). 필드가 누락되었거나 존재하지 않는 `input_schema`를 참조하는 엔트리를 거부하는 로더를 추가한다.
   - 검증: manifest 로딩이 성공한다; 의도적으로 손상시킨 엔트리(`input_schema` 누락)는 로더에서 명확한 오류와 함께 실패한다. [api-and-mcp.md §2](../../06-interfaces/api-and-mcp_ko.md)의 12개 op이 모두 존재한다: `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, record_decision, link, import_projection`(write) 및 `search, get, export_bundle, verify_audit`(read).

2. **manifest로부터 MCP 도구 카탈로그를 생성한다.**
   - 할 일: op당 하나의 MCP 도구를 `mcp_tool`로 명명하여 방출한다. 이름, 설명, closed `input_schema`, 어노테이션 삼중값을 광고한다. 네 개의 read op에는 `readOnlyHint:true`, write에는 `false`를 설정한다. 생성 시점에 어떤 엔트리도 `destructiveHint:true`가 **아님**을 단언한다(append-only v0). 각 도구 본문은 MCP 도구 호출을 `core.invoke(op, args, actor)`로 변환하고 엔벌로프를 도구 결과 `content`로 반환하기만 한다. idempotency는 `idempotency_key` 도구 인자로 전달한다.
   - 검증: MCP `tools/list`는 올바른 어노테이션과 함께 12개 도구를 모두 반환한다; `kr.attach_evidence`는 산문 필드가 없는 스키마를 광고한다; `kr.add_source` 호출이 core로 왕복하며 형식이 올바른 엔벌로프를 반환한다.

3. **동일한 manifest로부터 타입 지정 HTTP API를 생성한다.**
   - 할 일: `api.{method,path}`를 사용해 op당 하나의 라우트를 방출한다(예: `POST /v1/sources`, `POST /v1/claims/{id}/evidence`, `GET /v1/search`). 각 핸들러는 다음만 수행한다: 전송 파싱, auth(§6)로부터 actor 도출, `Idempotency-Key` 헤더(또는 콘텐츠 ingest의 경우 서버가 도출한 natural key) 읽기, `core.invoke` 호출, 엔벌로프를 JSON 본문으로 직렬화. [api-and-mcp.md §3](../../06-interfaces/api-and-mcp_ko.md)의 엔벌로프 결과 → HTTP 상태 매핑을 적용한다(201 created, 200 noop, 422 validation, 409 guardrail reject, 401/403 auth, 404 missing). 핸들러는 스키마 파싱을 넘어선 검증을 **전혀** 추가하지 않는다 — core가 정규(canonical)이다.
   - 검증: 유효한 본문의 `POST /v1/sources`는 201과 `audit_id`가 포함된 엔벌로프를 반환한다; 동일한 `Idempotency-Key`로 반복하면 200과 `result.status:"noop"` 및 원래 id를 반환한다; 알 수 없는 라우트는 `ERR_NO_SUCH_OPERATION`으로 매핑된다.

4. **scopes + actor 스탬핑을 연결한다(로직 없이 단순 통과).**
   - 할 일: 각 op의 `scopes`를 서피스 미들웨어로 매핑한다: API는 제품별 자격 증명을 인증하고, MCP는 세션을 actor 신원에 바인딩한다; 둘 다 `actor:{kind, id}`와 `surface:`로 해석되어 core에 전달한다. `import_projection`은 `kr:import`를, `export_bundle`은 `kr:export`를 요구한다. 서피스는 boundary 다운그레이드를 허용하거나 trust를 올리지 않는다.
   - 검증: `kr:read`만 가진 호출자는 `add_source`에서 거부된다(403 / scope 오류); 성공한 write의 audit 레코드는 `actor`와 `surface`를 스탬핑한다. read는 boundary/visibility를 통과한 항목만 반환한다(viewer가 사용하는 것과 동일한 필터링된 read 경로).

5. **에이전트 쓰기에 대한 기본 확인(G6)을 구현한다.**
   - 할 일: MCP 서피스에서, actor가 에이전트이고 명시적 허용 정책이 설정되지 않은 경우 모든 `kind:write` 도구를 확인 필수 뒤에 게이트한다; read는 자동 실행된다. 확인 없이 제출된 write는 **차단**되고 거부된 후보는 audit를 위해 보존된다(조용한 자동 수락 없음 — ADR-0005/M3). 정책을 config seam으로 만든다(TODO(open-question: confirmation granularity — per-tool/per-boundary/per-actor; ADR-0001/ADR-0004)).
   - 검증: 확인 없는 에이전트 `kr.attach_evidence` 호출은 "confirmation required" 엔벌로프를 반환하고 `knowledge/`에 아무것도 쓰지 않는다; 확인이 있는 동일 호출은 성공하여 `_events` 한 줄 + audit 레코드를 추가한다.

6. **두 서피스에 걸친 evidence gate 음성 테스트.**
   - 할 일: 산문 페이로드를 가진 `attach_evidence`가 closed-schema에 의해 거부되고(`ERR_VALIDATION`, 422), `Note`를 가리키는 `artifact_ref`가 core 게이트에 의해 거부됨(`ERR_NOTE_AS_EVIDENCE`, 409)을 — API와 MCP **둘 다**에서 — 검증하는 테스트를 추가한다. boundary 다운그레이드 시도 → `ERR_BOUNDARY_DOWNGRADE`(409)를 추가한다.
   - 검증: 네 음성 케이스 모두 두 서피스에서 문서화된 오류 코드로 fail closed된다; 아무것도 쓰여지지 않는다.

7. **패리티 계약 테스트(구조적 보장).**
   - 할 일: manifest를 로드하고 API 라우트 테이블과 MCP 도구 카탈로그가 op당 **바이트 단위로 동일한** 공유 `input_schema`와 동일한 read/write 분류로 **동일한 op 집합**을 노출함을 단언하는 테스트를 작성한다. (RB-041의 CLI가 반영되면 포함하도록 확장한다.) 이 테스트를 CI의 일부로 만들어 manifest 엔트리 없이 서피스 전용 핸들러를 추가하면 빌드가 실패하도록 한다.
   - 검증: 패리티 테스트가 통과한다; manifest에 없는 MCP 도구를 일시적으로 추가하면 실패한다; 추가 도구를 제거하면 다시 통과한다.

## 수용 기준
- [ ] 12개 op 모두 단일 manifest로부터 API와 MCP에 생성된다; 서피스는 전송 변환만 포함한다.
- [ ] Read op은 `readOnlyHint:true`이고 자동 실행될 수 있다; write op은 에이전트에 대해 기본 확인 필수이며 확인 누락 시 차단하고 거부된 후보를 보존한다.
- [ ] 동일한 closed `attach_evidence` 스키마(산문 필드 없음)가 두 서피스에서 사용된다; 산문과 note-as-evidence는 두 서피스에서 `ERR_VALIDATION` / `ERR_NOTE_AS_EVIDENCE`로 거부된다.
- [ ] 엔벌로프 `{ok,result,error,txn_id,audit_id}`와 error→HTTP-status 매핑은 서피스 간 동일하다; 멱등 반복은 원래 id와 함께 `status:"noop"`를 반환한다.
- [ ] `destructiveHint:true` 도구가 존재하지 않는다; `kr.verify_audit`는 해시 체인을 재계산한다.
- [ ] Scope 미들웨어는 `kr:read/write/import/export`를 강제한다; 어느 서피스도 core 검증기, evidence gate, trust cap, boundary 전파를 우회할 수 없다.
- [ ] 패리티 계약 테스트가 green이며 CI에 연결되었다.
- [ ] 이 체크포인트에서 tree가 green이다.

## 롤백 / 안전
- 모든 생성 코드는 manifest로부터 만들어진다; 생성된 API/MCP 모듈을 삭제하고 코드 생성을 다시 실행하면 알려진 상태로 복원된다. 어떤 마이그레이션도 `knowledge/`나 SQLite 인덱스를 건드리지 않으므로 롤백은 순전히 서피스 계층에 한정된다.
- 생성된 서피스가 로직을 추가하는 것이 발견되면 생성기 변경을 되돌린다 — 생성된 출력을 수동으로 패치하지 않는다.
- 쓰기는 append-only이고 게이트되므로 중간 실패는 부분 엔티티를 남기지 않는다: 실패한 `core.invoke`는 `knowledge/_events/`에 아무것도 추가하지 않고 커밋도 생성하지 않는다.

## 인계
- 다음 runbook(RB-041, CLI)은 op manifest, 공유 스키마, `core.invoke` 진입점, 엔벌로프, 패리티 테스트 하니스가 존재한다고 가정할 수 있으며, CLI를 동일한 패리티 테스트에 등록해야 한다.
- viewer runbook(RB-042)은 read-only API(`GET /v1/search`, `GET /v1/entities/{id}`, `GET /v1/audit/verify`)가 랭킹 전에 boundary/visibility 필터링을 적용하고 hydrate된 provenance chain을 반환한다고 가정할 수 있다.

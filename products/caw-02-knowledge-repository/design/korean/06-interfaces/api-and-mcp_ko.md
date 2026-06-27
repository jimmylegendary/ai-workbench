# API & MCP — 도구 카탈로그 (Op Manifest에서 코드 생성됨)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../02-research/agent-skill-interface-and-mcp_ko.md](../02-research/agent-skill-interface-and-mcp_ko.md)
  - [./cli_ko.md](./cli_ko.md)
  - [./knowledge-viewer_ko.md](./knowledge-viewer_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **타입이 지정된 HTTP API**와 **MCP 서버**를, 단일 제품 코어 위에 놓인 세 개의 얇은 쓰기 어댑터 중 두 개로
명세한다(ADR-0001). 여기서는 **operation 카탈로그**, **읽기 대 변경(mutating)** 구분, 요청/응답 **envelope**,
**idempotency** 연결, 그리고 **auth/scoping**을 확정한다. 코어 가드레일, 스키마, audit을 재정의하지는 **않는다**(이는
[ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)과
[skill-interface 연구](../02-research/agent-skill-interface-and-mcp_ko.md)에 있다) — 단지 그것들을 두 surface 위에
매핑할 뿐이다. CLI는 [cli_ko.md](./cli_ko.md)에, 읽기 전용 뷰어는 [knowledge-viewer_ko.md](./knowledge-viewer_ko.md)에
있다. 스토리지(ADR-0002), 데이터 모델(ADR-0003), provenance/trust(ADR-0004), import/export 와이어 포맷(ADR-0006)은
안정적인 코어 boundary로서 소비된다.

## 1. 하나의 manifest, 두 개의 생성된 surface
ADR-0001 §3에 따라, 모든 operation은 op manifest에 **한 번** 선언된다. API 라우트와 MCP 도구는 그로부터 **생성**되며 —
아무것도 추가하지 않는다. parity 계약 테스트는 두 surface(그리고 CLI)가 동일한 JSON Schema로 동일한 operation 집합을
노출함을 단언한다. operation 추가 = manifest 편집이며, 결코 surface를 직접 손으로 편집하지 않는다.

```yaml
# op-manifest entry (illustrative; canonical schema TODO in runbooks)
- op: attach_evidence
  kind: write                 # read | write
  mcp_tool: kr.attach_evidence
  api: { method: POST, path: /v1/claims/{claim_id}/evidence }
  idempotency: ["claim_id", "artifact_ref"]   # natural key tuple
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  input_schema: ./schemas/attach_evidence.json   # the SAME file the CLI & MCP validate against
  scopes: ["kr:write"]
```

생성된 각 surface는 전송(transport) 변환만 수행한다: HTTP ↔ 코어 op, 또는 MCP tool-call ↔ 코어 op. 검증, evidence
gate, trust 재계산, boundary 전파, 그리고 append-only 해시 체인 audit은 모두 **코어 내부에서** 한 번 실행된다.

## 2. 카탈로그 — 코어 op ↔ MCP 도구 ↔ API 라우트
도구/라우트 이름은 brief의 가치 단위에 retrieval과 signal 인입(intake)을 더한 것을 반영한다. `kr.`은 MCP 네임스페이스다.

| Core op | MCP tool | API route | Kind | Idempotency key |
|---|---|---|---|---|
| add_source | `kr.add_source` | `POST /v1/sources` | write | `sha256(content)` |
| extract_claims | `kr.extract_claims` | `POST /v1/sources/{id}/claims` | write | `(source_id, claim_key)` |
| attach_evidence | `kr.attach_evidence` | `POST /v1/claims/{id}/evidence` | write | `(claim_id, artifact_ref)` |
| synthesize_note | `kr.synthesize_note` | `POST /v1/notes` | write | caller `idempotency_key` |
| classify_signal | `kr.classify_signal` | `POST /v1/signals/{id}/classify` | write | `(signal_id, label)` |
| record_decision | `kr.record_decision` | `POST /v1/decisions` | write | caller `idempotency_key` |
| link | `kr.link` | `POST /v1/edges` | write | `(from, rel, to)` |
| import_projection | `kr.import_projection` | `POST /v1/imports` | write | `(source_product, export_id)` |
| search | `kr.search` | `GET /v1/search` | read | n/a |
| get | `kr.get` | `GET /v1/entities/{id}` | read | n/a |
| export_bundle | `kr.export_bundle` | `POST /v1/exports` | read* | n/a |
| verify_audit | `kr.verify_audit` | `GET /v1/audit/verify` | read | n/a |

\* `export_bundle`는 knowledge store 내에서 아무것도 변경하지 않는다. 서명되고 재(再)편집(re-redacted)된 artifact를
생성한다(ADR-0007). 이는 `readOnlyHint:true`이지만 audit 레코드를 기록한다(export는 boundary를 넘는 행위이기 때문이다).

### 읽기 대 변경
- **변경(write):** `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal,
  record_decision, link, import_projection`. **`update`/`delete`는 존재하지 않는다.** 정정은 `supersedes` edge로
  연결된 새 버전이다(ADR-0001 §C, G7).
- **읽기:** `search, get, export_bundle, verify_audit`. MCP는 이들을 `readOnlyHint:true`로 표시하며, 자동 실행될 수
  있다. write 도구는 에이전트에 대해 기본적으로 **확인 필수(confirmation-required)**다(G6).

## 3. Envelope (API/MCP/CLI 전반에서 동일)
모든 op는 표준 타입 envelope을 반환한다(ADR-0001 §6). MCP는 이를 도구 결과의 `content`로 반환하고, API는 JSON 본문으로
반환한다.

```jsonc
{
  "ok": true,
  "result": { "id": "ev_01J...", "status": "created" },   // op-specific payload, or null
  "error": null,                                            // or { code, message, details }
  "txn_id": "txn_…",       // echoes caller idempotency_key for retry-safety
  "audit_id": "aud_01J…"   // the hash-chained audit record this op appended
}
```

에러 코드는 코어 가드레일 코드이며, 변경 없이 그대로 노출된다: `ERR_EVIDENCE_NOT_ARTIFACT`, `ERR_NOTE_AS_EVIDENCE`,
`ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_BOUNDARY_DOWNGRADE`, `ERR_ORIGIN_CONFLATION`, `ERR_NO_SUCH_OPERATION`,
`ERR_VALIDATION`([skill-interface 연구 §5](../02-research/agent-skill-interface-and-mcp_ko.md) 참고). HTTP status
매핑:

| Envelope outcome | HTTP status |
|---|---|
| `ok:true`, created | 201 |
| `ok:true`, no-op (idempotent repeat) | 200 |
| `ERR_VALIDATION` / closed-schema reject | 422 |
| guardrail reject (`ERR_EVIDENCE_NOT_ARTIFACT`, `…_BOUNDARY_DOWNGRADE`, …) | 409 |
| auth/scope failure | 401 / 403 |
| referenced entity missing | 404 |

HTTP status는 편의용이며, **envelope의 `error.code`가 표준(canonical)**이다. 클라이언트는 status만으로 추론하지 말고
`ok`/`error`를 읽어야 한다.

## 4. Idempotency 연결
두 surface에서 동일한 키 의미론을 가지며, 운반자(carrier)만 다르다(ADR-0001, 연구 §4/§7).

| Surface | Idempotency carrier |
|---|---|
| API | `Idempotency-Key` header (or natural key derived server-side for content ingest) |
| MCP | `idempotency_key` tool argument |

코어는 하나의 트랜잭션 내에서 중복을 합쳐버린다(collapse). 동일한 인자로 재요청하면 원래 id와 함께
`result.status:"noop"`을 반환하며, 결코 중복 행을 만들지 않는다. `idempotentHint:true`는 이것이 성립하는 곳에만
설정된다.

## 5. 핵심을 떠받치는 스키마 (evidence gate)
`attach_evidence`는 "생성된 텍스트는 결코 Evidence가 아니다"(G1)에 대한 구조적 강제(enforcement)다. **동일한** closed
JSON Schema가 API 본문과 MCP 도구 입력을 검증한다 — **`text`/`summary` 필드는 존재하지 않으며**, `artifact_ref.ref`는
실제 `Source/Trace/SimulationRun/Experiment` 또는 `file_uri`로 resolve되어야 한다. 전체 스키마는
[연구 §3](../02-research/agent-skill-interface-and-mcp_ko.md)에 있으며, 축약본은 다음과 같다:

```jsonc
{ "type": "object", "additionalProperties": false,
  "required": ["claim_id", "artifact_ref", "boundary", "idempotency_key"],
  "properties": {
    "claim_id":     { "type": "string", "pattern": "^clm_[0-9a-z]+$" },
    "artifact_ref": { "type": "object", "additionalProperties": false,
      "required": ["kind","ref"],
      "properties": {
        "kind": { "enum": ["source","trace","simulation_run","experiment","file_uri"] },
        "ref":  { "type": "string" } } },     // id or URI — NEVER prose
    "boundary":        { "enum": ["public","internal","confidential"] },
    "idempotency_key": { "type": "string", "minLength": 8 } } }
```

## 6. Auth & scoping
두 surface는 **서로 다른 신뢰 프로파일(trust profile)**을 가지므로 인증 방식은 다르지만, 코어가 강제하는 동일한
**actor**와 **scope**로 귀결된다.

| Surface | Primary caller | AuthN | AuthZ scopes |
|---|---|---|---|
| API | other independent products (CAW-01/05/03), scripts | per-product credential (TODO(open-question: static token vs mTLS vs signed-URL drop — ADR-0001/ADR-0006)) | `kr:read`, `kr:write`, `kr:import`, `kr:export` |
| MCP | AI agents, Jimmy via an MCP client | MCP session bound to an actor identity | same scope set; write tools gated by G6 confirmation |

규칙:
- **Actor 각인(stamping).** 모든 op는 audit에 `actor:{kind: agent|human|product, id}`와 `surface: api|mcp`를
  기록한다(연구 §6). Boundary/visibility는 surface가 아니라 코어가 actor별로 강제한다.
- **Scope ≠ boundary 우회.** `kr:read`는 actor의 `visibility`(team/private)와 `boundary` 권한이 허용하는 항목만
  반환한다. 읽기 경로는 뷰어가 사용하는 것과 동일한 boundary 필터링 경로다. 어떤 scope도 boundary 강등(downgrade)을
  부여하지 않는다(G4).
- **Import/export은 별도의 scope**인데, 이들은 의무적 재편집(re-redaction)을 동반하는 boundary 넘기이기 때문이다
  (ADR-0007). `import_projection`은 `kr:import`을, `export_bundle`은 `kr:export`을 요구한다.
- **AI 작성 상한.** ADR-0004에 따라, 에이전트가 작성한 콘텐츠는 trust T2로 상한이 정해지며, surface는 이를 올릴 수
  없다.
- **확인(G6).** MCP의 경우 명시적 allow-policy가 설정되지 않는 한 write 도구는 기본적으로 확인 필수다.
  TODO(open-question: confirmation granularity — per-tool / per-boundary / per-actor; ADR-0001/ADR-0004).
- API는 **신뢰받는 독립 제품용**이다. 그래도 동일한 코어 가드레일을 그대로 통과한다(신뢰받는 호출자도 origin을 혼동
  (conflate)하거나 boundary를 강등할 수 없다).

## 7. Discoverability (MCP 특화)
MCP 서버는 각 도구를 다음과 함께 광고한다: 이름, 설명, closed input JSON Schema, 그리고 annotation 삼중쌍
`readOnlyHint`/`destructiveHint`/`idempotentHint`(연구 §2). 클라이언트는 annotation을 사용해 자동 실행 대 프롬프트를
결정한다. v0에는 `destructiveHint:true` 도구가 존재하지 않는다(append-only). `kr.verify_audit`는 클라이언트가 해시
체인을 재계산해 변조(tamper)를 탐지하도록 한다.

## Open Questions
- TODO(open-question: API auth model for independent products — static token vs mTLS vs signed-URL drop).
- TODO(open-question: confirmation-policy granularity for agent writes via MCP).
- TODO(open-question: whether the API exposes a streaming/paged variant of `search` for large result sets).
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## Implications for runbooks
- **RB (op manifest + codegen):** 하나의 manifest에서 API 라우트 + MCP 도구 + 공유 스키마를 생성; parity 테스트.
- **RB (API surface):** op별 라우트, `Idempotency-Key` header, scope 미들웨어, envelope + status 매핑.
- **RB (MCP server):** annotation을 갖춘 op별 도구; G6 확인 gate; `kr.verify_audit`.
- **RB (negative tests):** API와 MCP 양쪽에서 `attach_evidence`가 prose와 note-as-evidence를 거부함을 단언.

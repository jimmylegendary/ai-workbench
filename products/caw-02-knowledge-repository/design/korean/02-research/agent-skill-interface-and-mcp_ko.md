# Agent Skill Interface & MCP

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - `../_meta/PRODUCT-BRIEF_ko.md`
  - `../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md` (planned)
  - `../01-decisions/ADR-0004-provenance-and-trust_ko.md` (planned)
  - `../01-decisions/ADR-0005-ingestion-pipeline_ko.md` (planned)
  - `../08-research-plan/open-questions_ko.md` (planned)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

이 문서는 **AI 에이전트가 CAW-02에 지식을 안전하게 추가/갱신하는 방법** — 즉 "skill-wrap" — 을 결정한다. 여기서는
**MCP tool 카탈로그**, **타입이 지정되고 검증되는 트랜잭션(typed/validated transaction)** 형태, **idempotency(멱등성)**,
**provenance(출처) 손상을 방지하는 guardrail**(가장 중요하게는, 생성된 요약이 결코 `Evidence`로 첨부될 수 없다는 점),
그리고 **append-only audit(추가 전용 감사)** 로그를 명세한다. 또한 **API + CLI + MCP parity(동등성)** 를 고정하여 세 가지
표면(surface) 모두가 *동일한* 핵심 규칙을 강제하도록 한다. 이 문서는 저장소 레이아웃(ADR-0002), 전체 데이터 모델(ADR-0003),
import/export 와이어 포맷(ADR-0006)을 결정하지 *않으며* — 그것들을 안정적인 핵심 boundary로서 소비할 뿐이다. CAW-01/05/03은
import/export 상대방(별도 제품)으로만 등장하며, 공유 substrate(기반)는 존재하지 않는다.

## 1. 설계 입장

세 가지 표면(타입이 지정된 **API**, **MCP server**, **CLI**)은 **하나의 core service 위에 얹힌 얇은 adapter**다. 어떤
표면도 다른 표면에 없는 비즈니스 로직을 가져서는 안 된다. 모든 mutation(변경)은 invariant(불변식)를 강제하고, audit 레코드를
기록하며, 타입이 지정된 결과를 반환하는 단일 트랜잭션 core를 통해 흐른다. 이것이 에이전트(MCP 경유), 스크립트(CLI 경유),
다른 제품(API 경유)이 허용된 작업에서 서로 어긋날 수 없음을 보장하는 유일한 방법이다.

```
agent ──MCP──┐
human ──CLI──┼──▶ skill-wrap (validation + guardrails) ──▶ core txn ──▶ store + append-only audit
CAW-0x ─API──┘                     (single chokepoint)
```

근거: MCP 지침은 "얇고, 명확하게 타입이 지정되고, 발견 가능한 도구, 정확한 write 스키마, idempotency, 문서화된 실패
모드"로 수렴하며, 명세는 사람이 write 호출을 거부할 수 있기를 기대한다
([MCP best practices](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/),
[Stainless MCP tools](https://www.stainless.com/mcp/tools/)).

## 2. 권장 MCP tool 카탈로그

도구들은 브리프의 가치 단위(`add source → extract claim → attach evidence → synthesize note (cited)`)에 더해 검색과
신호 수집(signal intake)을 반영한다. 각 도구는 일반적인 "write row(행 쓰기)"가 아니라 **검증된 트랜잭션(vetted transaction)**
이다. 모든 도구에 표준 MCP 힌트(`readOnlyHint`, `destructiveHint`, `idempotentHint`)를 주석으로 달아 클라이언트가
auto-run을 게이트할 수 있게 한다 ([tool annotations](https://chatforest.com/guides/mcp-tool-annotations-explained/)).

| Tool | Kind | Idempotent | 도구가 담는 핵심 invariant |
|------|------|-----------|---------------------------|
| `kr.add_source` | write | yes (by `content_hash`) | Source는 raw임; 출처 URI/boundary를 기록; claim을 지어내지 않음 |
| `kr.extract_claims` | write | yes (by `(source_id, claim_key)`) | 각 `Claim`은 발원한 `Source`로 연결됨 |
| `kr.attach_evidence` | write | yes (by `(claim_id, artifact_ref)`) | **Evidence는 구체적인 artifact/source를 참조해야 하며, 자유 텍스트나 생성된 note를 결코 참조해서는 안 됨** |
| `kr.synthesize_note` | write | yes (by `idempotency_key`) | `Note`는 ≥1개의 `Claim`을 인용해야 함; note는 `generated=true`로 표시되며 evidence 자격이 **없음** |
| `kr.classify_signal` | write | yes (by `(signal_id, label)`) | `RadarSignal/RelatedWork`는 threat/support로 분류되고 `Claim`/`OpenQuestion`에 연결됨 |
| `kr.record_decision` | write | yes (by `idempotency_key`) | `Decision/OpenQuestion/Assumption`은 evidence에 연결된 채로 유지됨 |
| `kr.link` | write | yes (by `(from,rel,to)`) | 타입이 지정된 edge만 허용; 생성된 note를 evidence source로 만드는 edge는 거부 |
| `kr.import_projection` | write | yes (by `(source_product, export_id)`) | CAW-01 projection을 `Evidence`로 import; boundary downgrade 금지 |
| `kr.search` | read | n/a | trust level + boundary와 함께 항목 반환; mutation 없음 |
| `kr.get` | read | n/a | entity + provenance chain(source→claim→evidence→note) 조회 |
| `kr.export_bundle` | read | n/a | CAW-03용으로 인용된 `Claim`+`Evidence` 번들; **public-safe 필터 적용** |

비고:
- **provenance entity의 `update`/`delete` 없음.** 정정은 새로 append된 버전(`supersedes` edge)으로 처리한다 — store는
  audit 수준뿐 아니라 지식 수준에서도 append-only다.
- `kr.search`/`kr.get`/`kr.export_bundle`은 `readOnlyHint:true`이며 auto-run해도 안전하다. 모든 `write` 도구는
  에이전트에 대해 기본적으로 **확인 필요(confirmation required)** 다(§5 참조).
- 모든 도구는 타입이 지정된 envelope `{ ok, result?, error?, txn_id, audit_id }`를 반환한다. `txn_id`는 안전한 재시도를
  위해 호출자의 `idempotency_key`를 echo한다.

## 3. 타입이 지정되고 검증되는 트랜잭션

모든 write 도구의 입력은 core가 실행되기 **전에** **엄격한 JSON Schema**(closed object, boundary/trust/relation에 대한
enum, 최대 크기)에 대해 검증된다. 스키마 거부는 첫 번째 guardrail이며 tool-poisoning / injection 형태의 페이로드에 대한
1차 방어선이다 ([Truefoundry MCP security](https://www.truefoundry.com/blog/mcp-security-risks-best-practices)).

예시 — 가장 핵심이 되는 `attach_evidence`:

```jsonc
{
  "type": "object", "additionalProperties": false,
  "required": ["claim_id", "artifact_ref", "boundary", "idempotency_key"],
  "properties": {
    "claim_id":     { "type": "string", "pattern": "^clm_[0-9a-z]+$" },
    "artifact_ref": {                       // MUST resolve to a Source/Trace/SimulationRun/Experiment
      "type": "object", "additionalProperties": false,
      "required": ["kind", "ref"],
      "properties": {
        "kind": { "enum": ["source", "trace", "simulation_run", "experiment", "file_uri"] },
        "ref":  { "type": "string" }        // id or URI; NEVER free text
      }
    },
    "boundary":        { "enum": ["public", "internal", "confidential"] },
    "trust":           { "enum": ["unverified", "reported", "corroborated", "established"] },
    "idempotency_key": { "type": "string", "minLength": 8 }
  }
}
```

`attach_evidence`에는 **`text`/`summary` 필드가 없다** — 산문(prose)을 evidence로 첨부하는 것이 구조적으로 불가능하다.
이것이 브리프의 핵심 invariant를 스키마 수준에서 강제하는 방식이다.

## 4. Idempotency(멱등성)

| Tool family | Idempotency key | 반복 호출 동작 |
|-------------|-----------------|----------------------|
| content ingest (`add_source`) | `sha256(content)` | 기존 `source_id`를 반환, 중복 행 없음 |
| derived facts (`extract_claims`, `attach_evidence`, `link`, `classify_signal`) | natural key tuple | 두 번째 호출은 동일한 id를 반환하는 no-op |
| free creations (`synthesize_note`, `record_decision`) | 호출자가 제공하는 `idempotency_key` | 동일 key ⇒ 동일 결과; 30일 저장 |
| imports (`import_projection`) | `(source_product, export_id)` | 재import는 no-op |

규칙: 도구는 **동일 인자로 반복해도 추가 효과가 없을 때에만** `idempotentHint:true`다 — idempotency는 재시도 안전성에
관한 것이지 위험성에 관한 것이 아니다
([New Stack](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/)). 클라이언트는 timeout
시 어떤 write든 재시도할 수 있는데, key가 단일 core 트랜잭션 안에서 중복을 collapse하기 때문이다.

## 5. Guardrail (provenance-integrity 규칙)

이것들은 core에서 강제되므로 MCP, CLI, API에 동등하게 적용된다.

| # | 규칙 | 강제 지점 | 실패 모드 |
|---|------|-------------------|--------------|
| G1 | **생성된 텍스트는 결코 Evidence가 아니다.** `attach_evidence`에는 prose 필드가 없고, `artifact_ref.ref`는 기존 `Source/Trace/SimulationRun/Experiment` 행으로 resolve되어야 함 | schema + referential check | `ERR_EVIDENCE_NOT_ARTIFACT` |
| G2 | **Note는 generated로 표시되고 evidence 자격이 없다.** `synthesize_note`는 `generated=true`로 설정; `kr.link`는 `(note)-[evidence_for]->(claim)`을 거부 | core link validator | `ERR_NOTE_AS_EVIDENCE` |
| G3 | **Claim이 `unverified`를 벗어나려면 evidence를 인용해야 한다.** trust 상향에는 ≥1개의 첨부된 evidence가 필요 | trust 전이에 대한 core invariant | `ERR_TRUST_WITHOUT_EVIDENCE` |
| G4 | **boundary downgrade 없음.** 항목의 `boundary`는 더 엄격한 쪽으로만 이동 가능; export는 public-safe만 | core + `export_bundle` 필터 | `ERR_BOUNDARY_DOWNGRADE` |
| G5 | **conflation(혼동/합쳐짐) 없음.** public-source claim과 internal claim은 same-origin으로 병합/연결될 수 없음 | `kr.link` origin check | `ERR_ORIGIN_CONFLATION` |
| G6 | **에이전트의 write에 대한 확인.** write 도구는 명시적 allow-policy가 설정되지 않는 한 사람의 승인이 필요; read는 auto-run | MCP server policy gate | n/a (deferred, error 아님) |
| G7 | **Append-only.** provenance entity의 파괴적 편집 없음; 정정은 `supersedes` 사용 | core (update/delete 도구가 존재하지 않음) | `ERR_NO_SUCH_OPERATION` |
| G8 | **크기/속도 제한 + closed 스키마**로 injection 형태의 페이로드를 무력화 | schema + middleware | `ERR_VALIDATION` |

G6는 명세의 human-in-the-loop 지침과, write 도구에 대한 맹목적 auto-run을 비활성화하라는 2026년의 합의를 따른다
([Practical DevSecOps](https://www.practical-devsecops.com/mcp-security-vulnerabilities/),
[Aptible](https://www.aptible.com/mcp-security/mcp-prompt-injection)).

## 6. Append-only audit

모든 mutation은 데이터 변경과 **동일한 트랜잭션 안에서** 변경 불가능한 레코드 하나를 append한다(레코드 없음 ⇒ commit
없음). 레코드는 **hash-chain으로 연결**된다: `hash = sha256(serialized_event || prev_hash)`로, 블록체인을 채택하지
않고도 변조 증거(tamper-evidence)를 제공한다
([HMAC hash chain](https://tracehold.ai/blog/immutable-audit-log-hmac-hash-chain/),
[immutable audit architecture](https://www.emergentmind.com/topics/immutable-audit-log)).

```jsonc
{
  "audit_id":   "aud_01J...",          // monotonic
  "ts":         "2026-06-28T...Z",      // RFC3339
  "actor":      { "kind": "agent|human|product", "id": "..." },
  "surface":    "mcp|cli|api",
  "tool":       "kr.attach_evidence",
  "idempotency_key": "...",
  "inputs_hash": "sha256:...",          // hash, not raw payload (boundary-safe)
  "result":     "created|noop|denied|error",
  "entity_refs": ["clm_...","src_..."],
  "prev_hash":  "sha256:...",
  "hash":       "sha256:..."
}
```

- **Confidential-safe:** raw input이 아니라 `inputs_hash`를 저장한다. 민감 필드는 key-encrypt할 수 있어 chain이
  ciphertext 위에서 검증되고, 삭제(erasure) = 키 파기로 chain을 깨뜨리지 않는다
  ([operating immutable trails](https://medium.com/@veritaschain/append-only-is-the-easy-part-e25820208213)).
- **Reconstructability(재구성 가능성):** audit chain에 `supersedes` edge를 더하면 누구나 synthesis가 어떻게
  도달되었는지 replay할 수 있다(브리프 §5 재구성 가능성 요구사항).
- `kr.verify_audit` read 도구는 chain을 재계산하여 변조를 탐지한다.

## 7. API + CLI + MCP parity(동등성)

| 관심사 | MCP | CLI | API | parity 규칙 |
|---------|-----|-----|-----|-------------|
| Operation set | tool 카탈로그 §2 | tool당 subcommand 하나 (`kr add-source`, `kr attach-evidence`…) | tool당 route 하나 (`POST /v1/sources`…) | **하나의 공유 op manifest**에서 생성 |
| Validation | JSON Schema | 동일 schema | 동일 schema | 동일 스키마, 하나의 source 파일 |
| Idempotency | `idempotency_key` arg | `--idempotency-key` flag | `Idempotency-Key` header | 동일 key 의미 |
| Guardrails | core | core | core | core에서 강제, 표면별로 절대 안 함 |
| Audit | yes | yes (`surface:cli`) | yes (`surface:api`) | 동일 레코드, surface로 태깅 |
| Output | typed envelope | `--json`은 동일 envelope 반환; 기본은 사람용 table | 동일 envelope | envelope가 정본 |
| Confirmation | client gate (G6) | `--yes`로 프롬프트 건너뛰기 | 호출자는 신뢰된 제품; boundary는 여전히 강제 | write는 기본적으로 확인 |

parity는 **하나의 op manifest로부터의 codegen**(tool 이름, schema, idempotency key, read/write kind, annotation)으로
구조적으로 보장된다. 도구 추가 = manifest 편집이며, 세 표면이 재생성된다. contract test가 세 표면이 동일한 스키마로 동일한
operation set을 노출하는지 단언한다.

## 8. Tradeoff(절충)

| 결정 | 옵션 A | 옵션 B | 권장 |
|----------|----------|----------|------|
| Tool granularity | 다수의 검증된 트랜잭션 도구(§2) | 소수의 일반 CRUD 도구 | **A** — 의미론이 provenance를 강제; CRUD는 invariant를 호출자에게 누출 |
| Mutability | append-only + `supersedes` | in-place update/delete | **append-only** — 재구성 가능성과 audit에 필수 |
| Audit integrity | hash-chain | 평범한 log table | **hash-chain** — 저렴한 변조 증거, 블록체인 비용 없음 |
| Confirmation 기본값 | 모든 write 확인 | auto-run하고 destructive만 거부 | 에이전트에 대해 **write 확인**; read는 auto-run |
| Surface parity | 하나의 manifest로부터 codegen | 각 표면 수작업 작성 | **codegen** — drift가 주된 parity 위험 |
| `search`의 Embeddings | 지금은 keyword, 나중에 vector | vector v0 | keyword v0 (retrieval ADR-0007로 미룸) |

## Open Questions

- TODO(open-question: 정확한 `trust` ladder 값과 각 전이에 대한 evidence-count 임계값 — provenance/trust ADR-0004와
  맞춤).
- TODO(open-question: `synthesize_note`가 새로운 `Claim`을 *제안*하도록 허용해야 하는가, 아니면 기존 것만 인용해야
  하는가? 제안만 허용하면 Jimmy가 리뷰어로 유지되지만(브리프 §10) 리뷰 큐가 추가됨.)
- TODO(open-question: confirmation policy의 granularity — G6에 대해 per-tool, per-boundary, 또는 per-actor
  allow-list.)
- TODO(open-question: audit 보존 + confidential-field 암호화/삭제 모델 — storage ADR-0002 필요.)
- TODO(open-question: 공유 substrate 없이, `import_projection`이 CAW-01 export가 사전 요약된 blob이 아니라 진정으로
  artifact-backed임을 어떻게 검증하는가 — boundary 포맷은 ADR-0006.)
- TODO(open-question: idempotency-key 보존 윈도우 — 위의 30일 placeholder는 미검증.)

## 런북에 대한 함의

- **RB (core txn + audit):** 트랜잭션적 `data-change + hash-chained audit append`와 단위 테스트된 invariant로서의
  guardrail G1–G8을 가진 단일 core service를 어떤 표면보다 *먼저* 구축한다.
- **RB (op manifest + codegen):** 하나의 op manifest를 정의하고, 그로부터 MCP tool, CLI subcommand, API route,
  공유 JSON Schema를 생성하며, parity contract test를 추가한다.
- **RB (MCP server):** §2 카탈로그를 annotation과 함께 노출하고, §5 G6 확인 게이트를 구현하며, `kr.verify_audit`를
  추가한다.
- **RB (CLI):** `--json`, `--idempotency-key`, `--yes`를 가진 tool당 subcommand; 동일한 envelope 출력.
- **RB (negative tests):** 각 guardrail이 그 공격을 거부하는지 단언한다 — 가장 중요하게는 **생성된 note를 evidence로
  첨부하면 실패**(G1/G2)하는지를 세 표면 모두에서 검증하는 테스트.

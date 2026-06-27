# Skill-Wrap Interface — 안전한 에이전트 쓰기 표면

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../02-research/agent-skill-interface-and-mcp_ko.md](../02-research/agent-skill-interface-and-mcp_ko.md)
  - [./import-export-flows_ko.md](./import-export-flows_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **skill-wrap**을 구체화한다: AI 에이전트(그리고 사람, 다른 제품)가 provenance를 손상시키지 않고 검증된 지식 트랜잭션을 수행하는 하나의 안전한 인터페이스다. **op manifest**, **트랜잭션 가드레일**, **append-only + supersedes** 변이 모델, 에이전트 쓰기에 대한 **confirmation-by-default**, 그리고 **hash-chained 감사**를 고정하고, 이들이 어떻게 조합되어 provenance 손상을 단순히 권장 사항이 아니라 구조적으로 어렵게 만드는지 보여준다. 표면 아키텍처(그것은
[ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)), 데이터 모델
([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)), trust/boundary 어휘
([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)), 또는 import/export wire 포맷을 다시 결정하지는 않는다 — 그것들은 형제 문서 [import-export-flows_ko.md](./import-export-flows_ko.md)에 있다. 이 모든 것을 안정적인 core boundary로 소비한다.

## 1. 단일 chokepoint
[ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)에 따라, 정확히 **하나의 트랜잭션 core**가 있다. MCP(에이전트), CLI(Jimmy/스크립트), 그리고 타입 API(다른 독립 제품)는 전송을 하나의 타입 연산 집합으로 번역하며 **아무것도 추가하지 않는** 얇은 어댑터다. §4의 모든 가드레일은 core에서 강제되므로, 약하거나 악의적인 표면이 유출 경로가 될 수 없다.

```
agent ──MCP──┐
human ──CLI──┼──▶ skill-wrap ─▶ [1] schema gate ─▶ [2] referential + guardrail checks
CAW-0x ─API──┘                       │                        │
                                     ▼                        ▼
                              [3] core txn { data-change + event append + hash-chain }  (all-or-nothing)
                                     │
                                     ▼
                          markdown file(s) in git  +  _events/<ts>-<op>.jsonl
```
저장소는 markdown-in-git(단일 진실 공급원, [ADR-0002](../01-decisions/ADR-0002-storage_ko.md))이다; SQLite index는 derived이고 폐기 가능하다. 따라서 감사는 **두 개의 미러링된, 변조 감지 가능한 장소**에 존재한다: append-only `_events/*.jsonl` 체인과 git의 서명 커밋 히스토리.

## 2. op manifest
모든 연산은 하나의 op manifest에 한 번 선언된다. 세 개의 쓰기 표면, 그들의 공유 JSON Schema, 그리고 패리티 계약 테스트가 **그것으로부터 생성된다** — 연산을 추가한다는 것은 manifest를 편집하는 것이지, 표면을 손으로 작성하는 것이 결코 아니다. 각 항목은 다음을 지닌다: 도구 이름, JSON Schema, 멱등성 키 레시피, read/write 종류, MCP annotation, 그리고 충족해야 하는 가드레일 id.

```yaml
# op-manifest.yaml (excerpt — authoritative shape lives in the build, not here)
- op: kr.add_source
  kind: write
  idempotency: sha256(content)            # natural key
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  guards: [G4, G7, G8]
- op: kr.extract_claims
  kind: write
  idempotency: (source_id, claim_key)
  guards: [G7, G8]
- op: kr.attach_evidence                  # the load-bearing one
  kind: write
  idempotency: (claim_id, artifact_ref)
  guards: [G1, G3, G4, G5, G7, G8]
- op: kr.synthesize_note
  kind: write
  idempotency: idempotency_key
  guards: [G2, G7, G8]
- op: kr.classify_signal
  kind: write
  idempotency: (signal_id, label)
  guards: [G5, G7, G8]
- op: kr.record_decision                  # Decision | OpenQuestion | Assumption
  kind: write
  idempotency: idempotency_key
  guards: [G7, G8]
- op: kr.link
  kind: write
  idempotency: (from, rel, to)
  guards: [G2, G4, G5, G7, G8]
- op: kr.import_projection                 # see import-export-flows.md
  kind: write
  idempotency: (source_product, export_id)
  guards: [G1, G4, G5, G7, G8]
- op: kr.search        { kind: read, annotations: { readOnlyHint: true } }
- op: kr.get           { kind: read, annotations: { readOnlyHint: true } }
- op: kr.export_bundle { kind: read, annotations: { readOnlyHint: true } }   # see import-export-flows.md
- op: kr.verify_audit  { kind: read, annotations: { readOnlyHint: true } }
```

도구 카탈로그 요약(전체 도구별 의미론은
[the skill-interface research](../02-research/agent-skill-interface-and-mcp_ko.md) §2에):

| Tool | Kind | Carries invariant |
|------|------|-------------------|
| `kr.add_source` | write | Source는 raw; 출처 URI + boundary 기록; claim을 만들지 않음 |
| `kr.extract_claims` | write | 각 Claim은 자신의 출처 Source에 연결됨 |
| `kr.attach_evidence` | write | **Evidence는 구체적 artifact/source를 참조 — 결코 prose 아님** |
| `kr.synthesize_note` | write | Note는 ≥1 Claim을 인용; `generated=true`; 결코 evidence 자격 없음 |
| `kr.classify_signal` | write | RadarSignal/RelatedWork를 threat/support로 분류, 타입 링크 |
| `kr.record_decision` | write | Decision/OpenQuestion/Assumption은 evidence에 연결 유지 |
| `kr.link` | write | 타입 edge만; note→evidence_for edge 거부 |
| `kr.import_projection` | write | CAW-01 projection → Evidence; boundary 강등 없음 |
| `kr.search` / `kr.get` | read | provenance 체인 + trust + boundary 반환, 결코 blob 아님 |
| `kr.export_bundle` | read | cited Claim+Evidence 번들; fail-closed public-safe 필터 |
| `kr.verify_audit` | read | 변조 감지를 위해 hash 체인 재계산 |

## 3. 타입화되고 검증된 트랜잭션
모든 쓰기 입력은 core가 실행하기 **전에** **엄격하고 닫힌 JSON Schema**(`additionalProperties:false`, boundary/trust/relation에 대한 enum, 최대 크기)에 대해 검증된다. 스키마 거부가 첫 번째 가드레일이며 injection-/tool-poisoning 형태의 payload에 대한 주요 방어다. 핵심을 떠받치는 스키마 — `attach_evidence` — 에는 **`text`/`summary`/prose 필드가 전혀 없으므로**, 생성된 prose를 evidence로 부착하는 것이 단순히 검증으로 막히는 게 아니라 구조적으로 불가능하다:

```jsonc
{
  "type": "object", "additionalProperties": false,
  "required": ["claim_id", "artifact_ref", "boundary", "idempotency_key"],
  "properties": {
    "claim_id":     { "type": "string", "pattern": "^clm_[0-9a-z]+$" },
    "artifact_ref": {                         // MUST resolve to a real artifact row
      "type": "object", "additionalProperties": false,
      "required": ["kind", "ref"],
      "properties": {
        "kind": { "enum": ["source","trace","simulation_run","experiment","file_uri"] },
        "ref":  { "type": "string" }          // id or URI; NEVER free text
      }
    },
    "boundary": { "enum": ["public","internal","confidential"] },
    "trust":    { "enum": ["unverified","reported","corroborated","established"] },
    "idempotency_key": { "type": "string", "minLength": 8 }
  }
}
```

모든 op는 하나의 타입 봉투를 반환하여 재시도와 감사가 표면 전체에서 균일하게 한다:

```jsonc
{ "ok": true, "result": { "id": "evd_…" }, "error": null,
  "txn_id": "<echoes idempotency_key>", "audit_id": "aud_01J…" }
```

## 4. 가드레일 (core에서 강제, 모든 표면에서 동일)

| # | Rule | Enforcement | Failure code |
|---|------|-------------|--------------|
| G1 | **생성된 텍스트는 결코 Evidence가 아니다.** `attach_evidence`에는 prose 필드 없음; `artifact_ref.ref`는 기존 Source/Trace/SimulationRun/Experiment/file_uri로 resolve되어야 함 | schema + referential check | `ERR_EVIDENCE_NOT_ARTIFACT` |
| G2 | **Note는 generated + evidence 부적격.** `synthesize_note`는 `generated=true` 설정; `kr.link`는 `(note)-[evidence_for]->(claim)` 거부 | core link validator | `ERR_NOTE_AS_EVIDENCE` |
| G3 | **evidence 없이 trust 없음.** Claim은 부착된 Evidence가 ≥1개 없이는 `unverified`를 벗어날 수 없음(AI 작성은 T2로 상한) | trust-transition invariant | `ERR_TRUST_WITHOUT_EVIDENCE` |
| G4 | **boundary 강등 없음.** `boundary`/`visibility`는 더 엄격하게만 이동 가능; 전파는 단조 | core + export filter | `ERR_BOUNDARY_DOWNGRADE` |
| G5 | **혼동 없음.** public Source와 internal/confidential artifact는 하나의 evidence/origin으로 융합될 수 없음 | `kr.link` + evidence origin check | `ERR_ORIGIN_CONFLATION` |
| G6 | **에이전트 쓰기에 대한 확인.** 쓰기 도구는 명시적 allow-policy가 설정되지 않는 한 사람의 승인을 요구; 읽기는 자동 실행 | MCP confirmation gate (§6) | n/a (gate, not error) |
| G7 | **Append-only.** update/delete op 없음; 수정은 `supersedes`를 통한 새 버전 | manifest has no such op | `ERR_NO_SUCH_OPERATION` |
| G8 | **닫힌 스키마 + 크기/속도 제한**으로 injection 형태 payload 무력화 | schema + middleware | `ERR_VALIDATION` |

Claim→Evidence 불변식의 3계층 강제([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md))는 보조를 맞춰 실행된다: (1) `.md`의 frontmatter 스키마, (2) 위의 core validator, (3) 불변식을 위반하는 파일을 거부하는 reindex 재검사. skill-wrap은 계층 2다; 결코 단일 DB 제약에 의존하지 않는다.

## 5. Append-only + supersedes (수정이 작동하는 방식)
지식 수준에는 **update도 delete도 없다** — 오직 폐기 가능한 index에만 있으며 그것은 재빌드된다. 수정은 `supersedes` edge로 되가리키는 **새 entity 버전**이다; 독자는 체인을 순회하여(또는 derived index의 latest-flag를 통해) "최신"을 resolve한다.

```
clm_aaa (v1, trust=reported)
   ▲ supersedes
clm_aaa#2 (v2, trust=corroborated, +evidence evd_…)   ← current; v1 retained, never mutated
```

에이전트에게 왜 중요한가: 에이전트는 결코 조용히 히스토리를 다시 쓰거나 evidence를 지울 수 없다. 최악의 경우 할 수 있는 것은 대체하는 버전을 **append**하는 것뿐이며, 이는 그 자체로 완전히 감사되고 기록으로 되돌릴 수 있는 이벤트다. 모든 이전 버전과 모든 이벤트가 디스크에 남아 있으므로 재구성 가능성(brief §5)이 보존된다.

| Mutation intent | Mechanism | What is preserved |
|---|---|---|
| claim 문구 수정 | 새 버전 + `supersedes` | 옛 문구, 그 evidence, 변경 이벤트 |
| claim 철회 | 새 버전 `status=retracted` + `supersedes` | claim은 감사를 위해 여전히 존재 |
| signal 재분류 | 새 `classify_signal`(`(signal_id,label)`에 멱등) | 이전 분류 + actor |
| "삭제" | 불가능 | — (retract 사용; G7) |

## 6. 에이전트 쓰기에 대한 confirmation-by-default
에이전트는 가장 위험도가 높은 작성자이므로, actor가 MCP를 통한 에이전트일 때 **모든 쓰기 도구는 기본적으로 확인 필수**다; 읽기(`kr.search/get/export_bundle/verify_audit`)는 `readOnlyHint:true`이며 자동 실행된다. CLI의 사람은 대화형으로 확인하거나 `--yes`를 전달한다; API를 통한 다른 제품은 신뢰된 호출자이지만 **boundary와 모든 G1–G8 가드가 여전히 적용된다** — 확인 정책은 결코 가드레일을 완화하지 않으며, 단지 *누가 프롬프트를 건너뛸 수 있는지*만 gate한다.

```
write request (actor=agent)
   ├─ schema gate (G8) ─ fail ─▶ ERR_VALIDATION
   ├─ referential + guard checks (G1–G5) ─ fail ─▶ ERR_*
   ├─ confirmation gate (G6): allow-policy match?
   │     yes ─▶ proceed     no ─▶ surface a human-approve prompt; deny ─▶ result:"denied" (audited)
   └─ core txn ─▶ commit + audit
```

`TODO(open-question: confirmation policy granularity — per-tool vs per-boundary vs per-actor allow-lists; owned with
ADR-0004 / ADR-0001.)` `denied` 결과도 감사 체인에 기록되어 거부된 에이전트 시도가 가시화된다.

## 7. Hash-chained 감사
모든 변이는 데이터 변경과 **같은 트랜잭션 안에서 하나의 불변 이벤트를 append**한다 — 이벤트 없으면 commit 없음. 이벤트는 **hash-chain**(`hash = sha256(serialized_event || prev_hash)`)되어 blockchain 없이도 변조 감지를 제공한다. 체인은 append-only `_events/<ts>-<op>.jsonl`이다; git의 서명 커밋 히스토리가 두 번째 독립 감사다 ([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)).

```jsonc
{
  "audit_id":  "aud_01J…",                  // monotonic
  "ts":        "<RFC3339>",
  "actor":     { "kind": "agent|human|product", "id": "…" },
  "surface":   "mcp|cli|api",
  "tool":      "kr.attach_evidence",
  "idempotency_key": "…",
  "inputs_hash": "sha256:…",                // hash, not raw payload (boundary-safe)
  "result":    "created|noop|denied|error",
  "entity_refs": ["clm_…","evd_…","src_…"],
  "prev_hash": "sha256:…",
  "hash":      "sha256:…"
}
```

- **Confidential-safe:** 이벤트는 raw 입력이 아니라 `inputs_hash`를 저장한다; 민감 필드는 키 암호화될 수 있어 체인이 암호문에 대해 검증되고 삭제 = 키 파괴가 체인을 깨지 않는다.
- **Tamper-evident:** `kr.verify_audit`이 체인을 end-to-end로 재계산한다; 변경되거나 제거된 이벤트는 그것을 깬다.
- **Reconstructable:** 체인 + `supersedes` edge가 어떤 synthesis가 어떻게 도달되었는지 정확히 재생한다.

## 8. 이것이 provenance 손상을 막는 방법 (위협 → 방어)

| Threat (agent or compromised surface) | Defense |
|---|---|
| 생성된 요약을 evidence로 부착 | G1 — prose 필드 없음; `artifact_ref`가 resolve되어야 함(구조적) |
| Note를 evidence 체인으로 승격 | G2 — link validator가 note→evidence_for 거부 |
| evidence 없이 claim을 신뢰됨으로 표시 | G3 — trust transition은 ≥1 evidence 요구; AI는 T2로 상한 |
| confidential 항목을 public으로 강등하여 유출 | G4 — 단조, 강등 거부; export fail-closed |
| public source를 internal projection과 융합 | G5 — conflation 가드가 별개 origin 강제 |
| 이전 지식을 다시 쓰기 / 지우기 | G7 — append-only + supersedes; 파괴적 op 없음 |
| 과대/열린 payload로 injection | G8 — 닫힌 스키마 + 크기/속도 제한 |
| 무인 쓰기 폭주 | G6 — 에이전트에 대한 confirmation-by-default |
| 감사 로그 변조 | hash 체인 + git 히스토리; `kr.verify_audit`이 감지 |
| 규칙을 "잊은" 표면 | 불가능 — 모든 가드가 core에 있고 표면은 codegen됨 |

## Open Questions
- `TODO(open-question: confirmation policy granularity for agent writes — per-tool/per-boundary/per-actor.)`
- `TODO(open-question: should synthesize_note be allowed to PROPOSE new Claims, or only cite existing ones? Proposal-only keeps Jimmy as reviewer but needs a review queue.)`
- `TODO(open-question: idempotency-key retention window — 30d placeholder is unverified.)`
- `TODO(open-question: audit confidential-field encryption/erasure model — depends on ADR-0002.)`
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참조.

## runbook에 대한 함의
- **RB (core txn + audit):** 트랜잭션 `data-change + hash-chained event append`를 갖춘 단일 core; 모든 표면 **이전에** 단위 테스트된 불변식으로서의 G1–G8.
- **RB (op manifest + codegen):** 하나의 manifest → MCP 도구, CLI 서브커맨드, API 라우트, 공유 JSON Schema; 표면 전체에서 동일한 연산 집합/스키마를 단언하는 패리티 계약 테스트.
- **RB (MCP server):** annotation을 갖춘 §2 카탈로그 노출; G6 confirmation gate 구현; `kr.verify_audit` 추가.
- **RB (CLI):** `--json`, `--idempotency-key`, `--yes`를 갖춘 도구별 서브커맨드; 동일한 봉투 출력.
- **RB (negative tests):** 각 가드가 MCP/CLI/API에 걸쳐 자신의 공격을 거부함을 단언 — 가장 중요하게는 생성된 note를 evidence로 부착하는 것이 세 표면 모두에서 실패함(G1/G2).

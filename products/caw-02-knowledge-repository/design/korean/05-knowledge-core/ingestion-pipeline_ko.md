# Ingestion Pipeline (knowledge-core)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md) (이 문서가 구체화하는 결정)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md) (여기서 생성되는 entities/edges)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md) (여기서 부착되는 trust/boundary)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md) (skill-wrap; 단일 core)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md) (file→index→`_events` 트랜잭션)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md) (CAW-05/01 import 봉투)
  - [../02-research/ingestion-and-extraction_ko.md](../02-research/ingestion-and-extraction_ko.md) (연구 근거)
  - [./retrieval_ko.md](./retrieval_ko.md) (이 문서가 생산하는 것을 소비; B2가 `search()`를 재사용)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)에서 결정된 **두 개의 ingestion 파이프라인**을 빌드 가능한 수준의 깊이로 명세한다. Pipeline A
(`add-source → parse → extract claim-candidates → attach evidence → synthesize cited note → classify/link signal`)와
Pipeline B (`add-related-work-signal → classify threat/support → link-to-claim`)이다. 각 **단계의 payload**, **단계별로 부착되는 provenance**, **evidence gate**, **리뷰 상태 기계**(조용한 자동 수락 없음), 그리고 **멱등성/트랜잭션** 동작을 고정한다. entity/edge 스키마
([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)), trust 계산
([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)), import wire 봉투
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)), 또는 retrieval ([./retrieval_ko.md](./retrieval_ko.md))을 다시 결정하지는 않는다 —
이들은 소비될 뿐 재정의되지 않는다.

## 파이프라인이 실행되는 위치
모든 단계는 skill-wrap 뒤에 있는 **단일 트랜잭션 제품 core 내부에서** 실행된다
([ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)). API, MCP, CLI는 하나의 op manifest로부터 codegen된 얇은 어댑터이며, **불변식이나 evidence gate를 우회하는 raw write 경로는 존재하지 않는다**.
쓰기는 append-only + supersedes이며, 에이전트 쓰기는 기본적으로 확인(confirmation-by-default)을 거친다. 스토리지 계약
([ADR-0002](../01-decisions/ADR-0002-storage_ko.md))은 **`.md` 파일 쓰기 → SQLite index 미러링 → `knowledge/_events/<ts>-<op>.jsonl` append**이며, `Claim→Evidence` 불변식은 **commit 이전에** 검증된다. 검증 실패는 **전체 트랜잭션을 중단**시킨다(고아 파일/행/이벤트 없음).

## 협상 불가능한 gate (조언이 아니라 구조)
여기, [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md), 그리고
[ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)에 동일하게 인코딩되어 있다:

1. LLM이 방출하는 모든 것(A2 candidate, A5 note, B1/B3 출력)은 `generated: true`이며 `proposed`로 시작한다.
2. `Claim`은 **`extracted_from`이 실제 artifact로 resolve되는 `Evidence`가 ≥1개** 없이는 `accepted` / `trust > T0`에 도달할 수 없다.
   `kr.attach_evidence`에는 **prose 필드가 없으며** `artifact_ref`가 반드시 resolve되어야 한다 — 자유 텍스트와
   `Note`는 구조적으로 evidence가 되는 것이 차단된다.
3. `Note`는 `generated: true`를 가지며, 자신의 claim들을 `cites`하고, **결코**
   `evidence_for`/`extracted_from` edge의 소스가 될 수 없다.
4. AI가 작성한 콘텐츠는 **trust가 T2로 상한**된다 ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)).
5. reindex는 불변식을 재검사한다 — 불변식을 위반한 derived index는 재빌드에 실패하여 버그를 드러낸다.

---

## Pipeline A — add-source → … → synthesize cited note

| # | Stage | In → out | Provenance attached |
|---|---|---|---|
| A0 | **Register source** | file/URI/DOI → `Source{type, locator, content_hash, boundary, visibility, created_by, created_at}` | `sha256` 콘텐츠 해시(dedup + 멱등성 키), 원본 locator, intake 시점에 포착된 `boundary`(default-deny `internal`), `visibility`, actor(사람 또는 명명된 agent skill) |
| A1 | **Parse / normalize** | `Source` → `ParsedDoc{blocks[{block_id, kind, text, page, char_span}], refs[]}` | 블록별 locator `{source_id, block_id, char_span, page}` — **앵커**; 결정론적 재파싱을 위한 `parser_version` |
| A2 | **Extract claim-candidates** | `ParsedDoc` → `ClaimCandidate[]{text, claim_type, polarity, supporting_block_ids[], model_id, prompt_hash, tool_version, confidence}` | extractor 신원; `generated: true`; `status: proposed`. `supporting_block_ids`가 **없는** candidate는 스키마 계층에서 거부됨 |
| A3 | **Attach evidence (gate)** | `ClaimCandidate` → `Evidence[]{evidence_for→claim, extracted_from→artifact, locator, stance, rationale}` | `evidence_for` 링크 + resolve 가능한 `artifact_ref`. resolve 가능한 artifact가 없으면 ⇒ Claim은 `needs_evidence`로 유지되며 결코 자동 승격되지 않음 |
| A4 | **Dedup / link** | new `Claim`+`Evidence` → 기존과 병합; `about_concept`/`addresses` edges | (1) `content_hash`에 의한 정확한 source dedup; (2) `Concept` 이웃 내에서 임베딩 코사인에 의한 claim dedup(~0.9, 도메인 튜닝), **합집합으로 병합**, `{similarity, merged_into, decided_by}` 기록; 임계값 근처 → 리뷰 |
| A5 | **Synthesize note (cited)** | accepted `Claim[]` → `Note{generated: true, cites:[claim_id…], evidence_rollup}` | 인라인 `cites` + evidence rollup 덕분에 독자는 LLM을 재실행하지 않고 note→claim→evidence→source를 따라갈 수 있음. **결코 evidence가 아님** |
| A6 | **Review gate** | proposed `Claim`/`Note` → `accepted` / `needs_evidence` / `rejected` | 리뷰어 신원 + 결정 + 사유 + 타임스탬프; 수락 시 [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)에 따라 **trust 재계산**(호출자가 설정하지 않음) |

### 단계 상세 및 구체적 선택

**A0 — Register source.** 해시를 *먼저* 한다; 해시는 source dedup 키이자 멱등성 키다(동일한 파일을 재인제스트하면 기존 `source_id`를 반환하는 no-op). `boundary`는 나중에 안전하게 추론할 수 없으므로 intake 시점에 포착된다(default-deny `internal`). Source `type ∈ {paper, article, note}`에 더해
import-reference 타입 `trace`/`simulation_run`/`experiment`(CAW-01 export, 실행이 아니라 카탈로그됨)와 intake
타입 `related_work`/`radar_signal`(Pipeline B)가 있다.

**A1 — Parse / normalize.** 타입별로 라우팅한다: papers → **GROBID(PDF→TEI) 기본**, 깨진 PDF에는 LLM fallback;
articles → readability/markdown; notes → 이미 구조화됨. 안정적인 `block_id`와 `char_span`을 가진 **주소 지정 가능한 블록**의 평탄한 목록을 방출한다. 파싱은 결정론적이고 재실행 가능해야 한다; `parser_version`을 저장하고 버전 변경 시에만 재파싱하되, **claim을 고아로 만들지 않고 span을 재매핑**한다.

**A2 — Extract claim-candidates.** 스키마 제약 LLM(JSON 방출). 필수:
`claim_type ∈ {empirical, methodological, definitional, comparative, normative}`, `polarity`,
`supporting_block_ids`. 필수 블록 참조는 **provenance 없는 경우를 스키마 계층에서 차단한다**. 나쁜 프롬프트의 출력을 source를 잃지 않고 격리할 수 있도록 `model_id` + `prompt_hash` + `tool_version`을 영속화한다.

**A3 — Attach evidence (the gate).** "이 claim이 나온 블록"을 구체적 artifact를 가리키는 일급 `Evidence` 행으로 변환하고, 추가로 보강 artifact(다른 source span, 경로로 import된 CAW-01 projection, dataset URI)를 더한다. 각 evidence는 3-way `stance ∈ {SUPPORT, REFUTE, NEI}` + 한 줄 `rationale`(SciFact 패턴)을 가진다. **불변식 gate:** resolve 가능한 `artifact_ref`가 없으면 ⇒ claim은 `needs_evidence`로 유지된다.

**A4 — Dedup / link.** 정확한 source-hash dedup; `Concept` 이웃 내에서 코사인에 의한 의미적 claim dedup.
**합집합으로 병합** — 살아남은 정규 claim이 *모든* evidence와 source 포인터를 축적한다; 아무것도 버려지지 않으며 병합이 기록된다. **병합 시 boundary는 단조(monotone)**(`internal` + `confidential` → `confidential`,
[ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)). 임계값 근처 매치는 자동 병합이 아니라 리뷰로 간다.

**A5 — Synthesize note (cited).** **accepted claim에 대해서만** `Note`를 구성한다, `generated: true`, 인라인
`cites`와 `evidence_rollup` 포함. `Note`는 결코 evidence edge의 소스가 될 수 없다.

**A6 — Review gate.** 기본 정책: agent-skill 제출물은 `proposed`로 안착한다; **전략적 수락의 리뷰어는 Jimmy다**(brief §10). confidence-gated 에이전트 자동 수락은 보류된다
(`TODO(open-question: agent auto-accept policy)`).

---

## Pipeline B — add-related-work-signal → classify → link-to-claim

CAW-05 radar/related-work 신호의 intake(use case 2). **CAW-05는 별개의 독립 제품이다**; 신호는 버전 관리되고 서명된 봉투로서 import boundary를 가로질러 도착한다
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)) — 공유 저장소는 없다. 신호는 **우리의 claim에 연결된** 타입 entity가 되며, 결코 느슨한 요약이 아니다. A0–A2 provenance를 재사용한다.

| # | Stage | In → out | Provenance attached |
|---|---|---|---|
| B0 | **Ingest signal** | CAW-05 봉투 → `RadarSignal`/`RelatedWork{source_ref, boundary, received_at, origin:"CAW-05"}` | 출처 제품, 원본 신호 id, 선언된 boundary(**intake 시 재검사, 결코 상향 불가**; quarantine-on-import), 수신 시각 |
| B1 | **Resolve to Source/Claim** | signal → `Source`(외부 연구, DOI/arXiv/S2로 dedup) + `ClaimCandidate[]` | A0–A2(해시, locator, extractor id) 재사용; `raw_summary`는 `generated: true` 컨텍스트로 저장되며 **evidence에서 제외** |
| B2 | **Find target claim(s)** | candidate → 매칭된 내부 `Claim[]` | retrieval `search()` 사용 ([./retrieval_ko.md](./retrieval_ko.md)): FTS5/BM25 + 구조적 필터(이후 임베딩); 매치 점수 + retrieval 방법 기록 |
| B3 | **Classify stance** | (external claim, internal claim) → `{stance ∈ SUPPORT / REFUTE(threat) / NEI(neutral), rationale, confidence}` | classifier `model_id` + `prompt_hash`, rationale span, confidence; `generated: true` |
| B4 | **Link to claim** | stance → 타입 edge `supports`/`refutes`: `RelatedWork`→`Claim`, **외부 연구의 artifact**(CAW-05 요약이 아님)를 가리키는 `extracted_from` evidence 포함 | 방향성 있는 stanced 링크 + evidence 포인터; 리뷰 상태 |
| B5 | **Review / escalate** | proposed link → accepted; **accepted Claim에 대한 `REFUTE`는 `OpenQuestion`을 자동 발생**시키고 + 리뷰어에게 알림 | 리뷰어; escalation 계보 |

**분류 의미론.** *Threat* = accepted claim을 **반박/약화**하는 신뢰할 만한 외부 결과
(`REFUTE`); *support* = 보강함(`SUPPORT`); *neutral* = 관련되지만 직접적 영향 없음(`NEI`). threat에 대해 자동 발생하는 `OpenQuestion`이 radar의 핵심 목적이다. CAW-05 자신의 분류는 맹목적으로 신뢰되지 않고 **intake 시 재검증된다**(`TODO(open-question: how much of CAW-05's classification to re-classify at B3)`).
외부 신호는 stance 링크에 대한 영속적 `Evidence`가 되며, **외부 연구의 artifact**를 참조하지 결코 CAW-05 요약 텍스트를 참조하지 않는다.

---

## 리뷰 상태 기계 (v0에서 조용한 자동 수락 없음)

모든 생성된 artifact는 리뷰어가 행동하기 전까지 `proposed`다. v0에서는 에이전트가 조용히 `proposed`에서 `accepted`로 갈 수 있는 경로가 없다 ([ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md) 결정 4).

```text
            ┌──────────── needs_evidence ◄──────────┐
            │                  ▲                     │ (re-run A3, attach artifact)
 (A2/B1) ── proposed ─────────►│                     │
            │     │   reviewer: needs_evidence       │
            │     │                                  │
   reviewer:│     │ reviewer: accept (gate satisfied)│
   reject   │     ▼                                  │
            └►  rejected        accepted ◄───────────┘
              (retained for      │  trust recomputed (ADR-0004), AI-capped T2
               audit; superseded)│  REFUTE on accepted Claim ⇒ auto OpenQuestion (B5)
```

| Transition | Actor | Precondition | Recorded |
|---|---|---|---|
| `→ proposed` | extractor (A2/B1) | 블록 참조를 가진 스키마 유효 candidate | `model_id`, `prompt_hash`, `tool_version`, `generated: true` |
| `proposed → accepted` | reviewer (v0에서 사람) | **evidence gate 충족**(resolve 가능한 `artifact_ref` ≥1) | 리뷰어 id, 사유, ts; trust 재계산 |
| `proposed → needs_evidence` | reviewer 또는 gate | resolve 가능한 artifact 없음 | 리뷰어/시스템, 사유, ts |
| `proposed → rejected` | reviewer | 본안 기각 | 리뷰어 id, 사유, ts; **감사를 위해 보존** |
| `accepted → superseded` | new write | append-only supersede(update/delete 없음) | 대체하는 entity id, ts |

모든 transition은 append-only이며 `knowledge/_events`로 미러링된다; git 히스토리가 감사다
([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)). 기각된 candidate는 보존**될 수도** 있다
(`TODO(open-question: retention boundary for rejected candidates)`).

## add-related-work-signal → classify → link 흐름 (실제 예)
1. CAW-05가 신호 봉투를 export → **B0** quarantine + boundary 재검사 → `RadarSignal` 행.
2. **B1**이 인용된 외부 연구를 `Source`로 resolve(DOI/arXiv/S2로 dedup)하고 `ClaimCandidate[]`를 추출;
   `raw_summary`는 컨텍스트로만 보존.
3. **B2**가 `search()`를 통해 candidate 내부 `Claim[]`을 검색 ([./retrieval_ko.md](./retrieval_ko.md)).
4. **B3**가 (external, internal) 쌍별로 stance를 분류 → `SUPPORT | REFUTE | NEI` + rationale + confidence.
5. **B4**가 **외부 artifact**를 가리키는 `Evidence`와 함께 stanced edge를 작성(gate 적용).
6. **B5**: *accepted* `Claim`에 대한 `REFUTE`는 `OpenQuestion`(`addresses` edge)을 자동 발생시키고 리뷰어에게 알림; 그 외 모든 것은 리뷰를 위해 `proposed`로 안착.

## 누적 provenance (무엇이 무엇을 가리키는가)
```text
Source         ── content_hash, locator/URI, boundary, visibility, actor, time   (A0/B0)
  └ Block      ── {source_id, block_id, char_span, page}                         (A1)   ← the anchor
      └ Claim  ── model_id+prompt_hash, generated:true, status, trust            (A2/B1)
      └ Evidence ── extracted_from → artifact + locator, stance, rationale       (A3/B4) ← invariant target
          └ Note   ── generated:true, cites[claim_id], rollup                    (A5)    ← never evidence
Review events  ── actor, decision, reason, time on every promotion               (A6/B5)
Merge events   ── similarity, merged_into, decided_by                            (A4)
```
규칙: 모든 artifact 참조는 **locator이며 결코 prose가 아니다**; extractor 신원은 생성된 콘텐츠와 함께 이동한다;
**병합 시 boundary는 단조**; 재인제스트는 source 해시를 통해 **멱등**이며 재파싱은 span을 재매핑한다.

## 멱등성 & 트랜잭션성
- `content_hash`(A0)와 `parser_version`을 키로 하는 결정론적 재파싱(A1)에 의해 **멱등**.
- **원자적:** file → index → `_events`, 불변식은 **commit 이전에** 검증; 실패는 전체 트랜잭션을 중단. reindex는 결정론적/멱등이며 불변식을 재검사한다
  ([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)).

## Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)와
[ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)를 참조:
- `TODO(open-question: semantic dedup cosine threshold + embedding model — domain-tune)`
- `TODO(open-question: agent auto-accept policy — any class, or human review mandatory in v0?)`
- `TODO(open-question: claim_type taxonomy adequacy)`
- `TODO(open-question: span stability on re-parse by a newer parser version — remap vs re-extract)`
- `TODO(open-question: how much of CAW-05's classification to re-classify at B3)`
- `TODO(open-question: retention boundary for rejected ClaimCandidates)`

## runbook에 대한 함의
- **RB (intake & parse):** 해싱 + boundary 포착을 갖춘 `Source` 등록; 타입 라우팅 파서
  (GROBID + LLM fallback)가 주소 지정 가능한 블록을 생산. 검증: 동일 재인제스트가 멱등; 모든 블록이 resolve 가능한 locator를 가짐.
- **RB (claim extraction):** 스키마 제약 extractor; 필수 `supporting_block_ids`; `model_id`+`prompt_hash` 영속화. 검증: 블록 포인터 없는 candidate 없음.
- **RB (evidence & gate):** `Evidence` writer + gate(resolve 가능한 `artifact_ref` 없이 승격 불가). 검증:
  유일한 "evidence"가 생성된 텍스트인 claim의 수락이 실패함.
- **RB (dedup & link):** 정확한 source-hash dedup + 로깅을 갖춘 합집합 병합 의미적 dedup. 검증: 병합이 모든 evidence와 source 포인터를 보존함.
- **RB (synthesize note):** cited `Note` 생성기; note가 evidence가 되는 것을 막는 가드. 검증: 모든 note가 source span으로 resolve됨.
- **RB (signal intake):** CAW-05 봉투 → Source/Claim resolution; `search()`를 통한 B2; 3-way stance; stanced link;
  `REFUTE`→`OpenQuestion` escalation. 검증: accepted claim에 대한 반박 신호가 OpenQuestion + 리뷰어 알림을 자동 생성함.
- **RB (review gate):** 모든 transition에 actor+사유+타임스탬프를 갖춘 상태 기계 `proposed → accepted/needs_evidence/rejected`. 검증: 모든 transition이 감사되며 기록으로 되돌릴 수 있음(삭제가 아니라 supersede).

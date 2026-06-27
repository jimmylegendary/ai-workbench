# ADR-0005: Ingestion 파이프라인과 신호 인입(intake)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [ADR-0001-product-surface-and-skill-interface_ko.md](ADR-0001-product-surface-and-skill-interface_ko.md)
  - [ADR-0002-storage_ko.md](ADR-0002-storage_ko.md) (planned)
  - [ADR-0003-knowledge-data-model_ko.md](ADR-0003-knowledge-data-model_ko.md)
  - [ADR-0004-provenance-and-trust_ko.md](ADR-0004-provenance-and-trust_ko.md) (planned)
  - [ADR-0006-import-export-contracts_ko.md](ADR-0006-import-export-contracts_ko.md) (planned)
  - [../02-research/ingestion-and-extraction_ko.md](../02-research/ingestion-and-extraction_ko.md)
  - [../02-research/provenance-and-trust-models_ko.md](../02-research/provenance-and-trust-models_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
**ingestion 파이프라인**을 결정한다: 사용 사례 1(`add-source → extract-claims → synthesize-note`, 인용 포함)과
사용 사례 2(`add-related-work-signal → classify threat/support → link-to-claim`)의 단계별 흐름, **각 단계에서
부착되는 provenance**, 그리고 파이프라인 gate로서의 강한 **생성된 요약은 evidence가 아니다** 규칙이다. storage(ADR-0002),
entity/edge 모델(ADR-0003 — 여기서 소비됨), trust 재계산(ADR-0004), surface/skill 카탈로그(ADR-0001), 또는 import
와이어 포맷(ADR-0006 — 여기서 소비됨)을 결정하지는 않는다. 그것들이 하나의 트랜잭션으로 어떻게 결합되는지를 고정한다.

## 배경
- brief의 **가치 단위**(§2)는 provenance를 보존하는 하나의 트랜잭션이다: `add source → extract claim(s) →
  attach evidence → synthesize note (cited)`가 재구성 가능하고 재사용 가능하게 유지되는 것.
- 위험한 실패 모드(§2, §10): LLM이 생성한 claim/note/summary가 **evidence**로 오인되는 것. 추출은 LLM 보조이므로
  모든 생성 산출물은 사실이 아니라 **제안(proposal)**으로 시작한다.
- v0 = **append + retrieve + skill-wrap**(§2). 파이프라인은 다른 모든 surface와 동일한 core/skill-wrap 및
  guardrail을 통해 쓴다(ADR-0001) — 불변식을 우회하는 raw 쓰기 경로는 없다.
- Storage(ADR-0002)는 md-first SoT + 재구축 가능 index이며, **file-first, 그 다음 index, 그 다음 `_events`** 순으로
  쓰고, commit 전에 불변식을 검증한다. 검증 실패는 **전체 트랜잭션을 중단**시킨다.
- 신호 인입(사용 사례 2)은 import 경계 너머의 CAW-05 export를 소비한다(ADR-0006). 신호는 **결코** 느슨한 요약으로
  저장되지 않는다.

## 결정 — Pipeline A: add-source → extract-claims → synthesize-note
6개 단계, 각각은 하나 이상의 skill-wrap 트랜잭션 내부의 한 스텝이다. 각 단계는 **provenance를 부착**하며
`Claim→Evidence` 불변식(ADR-0003)을 위반하는 어떤 것도 쓰지 않는다.

| # | 단계 | In → out | 부착되는 provenance |
|---|---|---|---|
| A0 | **source 등록** | file/URI/DOI → `Source{type, locator, content_hash, boundary, visibility, created_by, created_at}` | `sha256` content hash(dedup 키, 멱등성), 원본 locator, **인입 시점**에 포착된 `boundary`(default-deny: `internal`), 행위자(사람 또는 이름이 지정된 agent skill) |
| A1 | **파싱 / 정규화** | `Source` → `ParsedDoc{blocks[{block_id, kind, text, page, char_span}], refs[]}` | 블록별 locator `{source_id, block_id, char_span}` — 이후 모든 span이 resolve되는 **앵커**; 결정론적 재파싱을 위해 파서 버전 저장 |
| A2 | **후보 claim 추출** | `ParsedDoc` → `ClaimCandidate[]{text, claim_type, polarity, supporting_block_ids[], model_id, prompt_hash, tool_version, confidence}` | 추출기 정체(`model_id` + `prompt_hash` + `tool_version`); `generated=true`; `status=proposed`. `supporting_block_ids`가 **없는** 후보는 여기서 거부된다. |
| A3 | **evidence 부착(불변식 gate)** | `ClaimCandidate` → `Evidence[]{evidence_for→claim, extracted_from→artifact, locator, stance, rationale}` | `evidence_for` 링크 + 구체적 `artifact_ref`; **gate**: resolvable한 artifact가 없으면 ⇒ Claim은 `needs_evidence`로 남고 자동 승격되지 않는다. prose는 결코 `artifact_ref`가 될 수 없다. |
| A4 | **dedup / 링크** | 새 `Claim`+`Evidence` → 기존과 병합; `about_concept`/`addresses` 링크 | (1) `content_hash`에 의한 정확한 **source dedup**; (2) `Concept` 이웃 내 embedding cosine에 의한 **claim dedup**(~0.9, 도메인 튜닝), **합집합 병합**(evidence/source 손실 없음), `{similarity, merged_into, decided_by}` 로깅; 임계치 근처 → 사람 리뷰 |
| A5 | **note 종합(cited)** | accepted `Claim[]` → `Note{generated=true, cites:[claim_id…], evidence_rollup}` | claim id로의 인라인 `cites` + evidence rollup으로 독자가 LLM을 재실행하지 않고 note→claim→evidence→source를 따라감. **Note는 결코 evidence가 될 수 없다.** |
| A6 | **리뷰 gate** | proposed `Claim`/`Note` → `accepted` / `needs_evidence` / `rejected` | 리뷰어 정체 + 결정 + 사유 + 타임스탬프; 수락 시 **trust 할당**(ADR-0004에 따라 재계산되며 호출자 설정이 아님) |

**구체적 선택(ingestion 리서치 기반):**
- **파싱:** GROBID(PDF→TEI, 구조적/결정론적)를 **주력**으로, 깨진 PDF에는 LLM 폴백; 기사(article)는
  readability/markdown으로; 노트는 이미 구조화됨. 파싱은 재실행 가능해야 locator가 재파싱에도 살아남는다.
- **추출:** **스키마 제약** LLM(JSON 발행; 필수 `claim_type ∈ {empirical, methodological,
  definitional, comparative, normative}`, `polarity`, `supporting_block_ids`). 필수 블록 참조가 스키마 계층에서
  provenance 없는 경우를 차단한다.
- **Evidence stance:** 3방향 **SUPPORT / REFUTE / NEI** + 한 줄 rationale(SciFact 패턴), radar의
  threat/support/neutral 라벨과 정렬.
- **수락 정책(v0):** agent-skill 제출은 `proposed`로 들어온다. **전략적 수락의 리뷰어는 Jimmy**(brief §10).
  confidence 기반 agent 자동 수락은 보류(미해결 질문).

## 결정 — Pipeline B: add-related-work-signal → classify → link-to-claim
CAW-05 radar/related-work 신호의 인입(사용 사례 2). 신호는 느슨한 요약이 아니라 **우리 claim에 연결된 타입 엔티티**가
된다. A0–A2 provenance를 재사용한다.

| # | 단계 | In → out | 부착되는 provenance |
|---|---|---|---|
| B0 | **신호 인입** | CAW-05 export(ADR-0006 envelope) → `RadarSignal`/`RelatedWork{source_ref, boundary, received_at, origin:"CAW-05"}` | 출처 제품, 원본 신호 id, 선언된 boundary(재확인되며 결코 상향되지 않음), 수신 시각 |
| B1 | **Source/Claim으로 resolve** | 신호 → `Source`(외부 작업, DOI/arXiv/S2로 dedup) + `ClaimCandidate[]`(그것이 주장하는 바) | A0–A2 재사용(hash, locator, 추출기 id); `raw_summary`는 컨텍스트로 `generated=true` 저장, **evidence에서 제외** |
| B2 | **대상 claim 찾기** | 후보 → keyword/FTS(+ 이후 embedding) retrieval로 매칭된 내부 `Claim[]` | 매치 점수 + retrieval 방법 기록 |
| B3 | **stance 분류** | (외부 claim, 내부 claim) → `{stance ∈ supports / refutes(threat) / neutral(NEI), rationale, confidence}` | 분류기 `model_id` + `prompt_hash`, rationale span, confidence; `generated=true` |
| B4 | **claim에 링크** | stance → 타입 edge `supports`/`refutes` : `RelatedWork`→`Claim`, **외부 작업의 artifact**(CAW-05 요약이 아님)를 가리키는 `extracted_from` evidence와 함께 | 방향성 있는 stanced 링크 + evidence 포인터; 리뷰 상태 |
| B5 | **리뷰 / 에스컬레이션** | proposed 링크 → accepted; **accepted Claim에 대한 `refutes` stance는 `OpenQuestion`을 자동 발생**시키고 리뷰어에게 알림 | 리뷰어; 에스컬레이션 lineage |

**분류 의미론:** *threat* = accepted claim을 **반박/약화**하는 신뢰할 만한 외부 결과(REFUTE); *support* =
보강(SUPPORT); *neutral* = 관련은 있으나 직접 영향 없음(NEI). threat에 대한 자동 발생 `OpenQuestion`이 radar의
핵심이다. CAW-05 자체의 분류는 맹목적으로 신뢰하지 않고 **인입 시 재검증**된다(얼마나 재분류할지는 미해결 질문).

## 타협 불가능한 규칙(조언이 아니라 gate)
**생성된 요약은 evidence가 아니다**(brief §5/§10). ADR-0003 불변식 및 ADR-0001 guardrail과 동일하게 강한
파이프라인 gate로 인코딩된다:
1. LLM이 발행하는 모든 것(A2 후보, A5 노트, B1/B3 출력)은 `generated=true`이며 `proposed`로 시작한다.
2. `Claim`은 **`extracted_from`이 실제 artifact로 resolve되는 `Evidence` ≥1개** 없이 `accepted` / `trust > T0`에
   도달할 수 없다(A3/B4 gate). 자유 텍스트와 `Note`는 구조적으로 `artifact_ref`로 막혀 있다(ADR-0001
   스키마: `kr.attach_evidence`에는 prose 필드가 없음).
3. `Note`는 `generated=true`를 가지고 자신의 claim들을 `cites`하며, **결코** `evidence_for`/`extracted_from`
   edge의 source가 될 수 없다.
4. **트랜잭션성(ADR-0002):** file 쓰기 → index 미러링 → `_events` append, commit **이전에** 불변식 검증;
   검증 실패는 전체 트랜잭션을 중단(고아 파일/행 없음).

## 누적 provenance(무엇이 무엇을 가리키는가)
```
Source        ── content_hash, locator/URI, boundary, actor, time        (A0/B0)
  └ Block      ── {source_id, block_id, char_span, page}                 (A1)   ← the anchor
      └ Claim  ── model_id+prompt_hash, generated=true, status, trust    (A2/B1)
      └ Evidence ── extracted_from → artifact + locator, stance, rationale (A3/B4) ← invariant target
          └ Note  ── generated=true, cites[claim_id], rollup             (A5)   ← never evidence
Review events ── actor, decision, reason, time on every promotion         (A6/B5)
Merge events  ── similarity, merged_into, decided_by                      (A4)
```
규칙: 모든 artifact 참조는 **prose가 아니라 locator**다; 추출기 정체가 생성 콘텐츠와 함께 따라다녀 나쁜
model/prompt를 source 손실 없이 quarantine할 수 있다; **병합 시 boundary는 단조적**이다
(internal+confidential → confidential, ADR-0004); 재인입은 source hash를 통해 **멱등적**이며 재파싱은
claim을 고아로 만들지 않고 span을 재매핑한다.

## 결정(요약)
1. 두 개의 단계적 파이프라인(A: source→claims→note; B: signal→classify→link), 둘 다 **skill-wrap +
   core**(ADR-0001)를 통해 흐름 — 우회 경로 없음.
2. **GROBID 주력 파싱**, 필수 블록 참조를 갖는 **스키마 제약 LLM 추출**, **3방향 stance +
   rationale**, **정확한 hash source dedup + 합집합 병합 semantic claim dedup**.
3. **생성된 요약은 evidence가 아니다 규칙을 강한 gate로** A3/B4에서, 트랜잭션적으로 강제하고 reindex 시 재확인.
4. 전략적 claim에 대해 **사람 리뷰(Jimmy)가 v0 수락 gate**; agent 출력은 `proposed`로 들어온다.
5. **accepted Claim에 대한 `refutes` stance는 `OpenQuestion`을 자동 발생**시키고 리뷰어에게 알림.

## 결과
**쉬워지는 것:** 수락된 모든 Claim은 source span으로 재구성 가능하다; 에이전트가 provenance를 오염시키지 않고 대량
기여한다; 재인입이 안전/멱등적이다; threat가 OpenQuestion으로 자동 노출된다.

**어려운 것 / 후속:** 결정론적이고 버전 고정된 파서와 span 재매핑 전략이 필요하다; semantic dedup
임계치 + embedding 모델은 도메인 튜닝이 필요하다; v0는 agent 자동 수락을 금지하므로 리뷰 큐가 필요하다;
B3 재분류 비용 대 CAW-05 라벨 신뢰는 미해결이다.

## 미해결 질문 / 재검토 트리거
- `TODO(open-question: semantic dedup cosine threshold + embedding model — domain-tune on real claims; aligns with ADR-0007.)`
- `TODO(open-question: may agents auto-accept any class of claim (e.g. high-confidence public), or is human review mandatory for all in v0?)`
- `TODO(open-question: claim_type taxonomy adequacy — owned with ADR-0003.)`
- `TODO(open-question: span stability on re-parse by a newer parser version — remap vs re-extract.)`
- `TODO(open-question: how much of CAW-05's classification to trust as-is vs re-classify at B3.)`
- `TODO(open-question: persist rejected ClaimCandidates for audit/training, and under what boundary?)`
- embedding이 도입되면(ADR-0007) **재검토** — B2 retrieval과 A4 dedup 둘 다 업그레이드된다.
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (intake & parse):** hashing + boundary 포착을 갖는 `Source` 등록; 타입 라우팅 파서(GROBID +
  LLM 폴백)가 안정적 `block_id`/`char_span`을 가진 주소 가능한 블록을 생성. 검증: 동일 파일을 재인입하면 멱등적;
  모든 블록이 resolvable한 locator를 가짐.
- **RB (claim extraction):** 필수 `supporting_block_ids`를 가진 `ClaimCandidate` JSON을 발행하는 스키마 제약
  추출기; `model_id`+`prompt_hash` 영속화. 검증: 블록 포인터 없는 후보는 존재하지 않음.
- **RB (evidence & invariant gate):** `Evidence` writer + `Claim→Evidence` gate(resolvable한 `artifact_ref`
  없이는 승격 없음). 검증: 유일한 "evidence"가 생성된 텍스트인 claim의 수락은 실패함.
- **RB (dedup & link):** 정확한 source-hash dedup + embedding/ANN claim dedup with 합집합 병합 + 병합 로깅.
  검증: 두 claim 병합 시 모든 evidence와 source 포인터 보존.
- **RB (synthesize note):** `generated=true`, 인라인 인용, evidence rollup을 갖는 cited `Note` 생성기와 노트가
  evidence가 되는 것을 막는 가드. 검증: 모든 노트가 source span으로 resolve됨.
- **RB (signal intake):** CAW-05 signal → Source/Claim resolution, 대상 claim retrieval, 3방향 stance
  분류기, stanced 링크 writer, **`refutes`→OpenQuestion** 에스컬레이션. 검증: accepted claim에 대한 반박 신호가
  OpenQuestion + 리뷰어 알림을 자동 생성.
- **RB (review gate):** 모든 전이에 actor+reason+timestamp를 갖는 상태 기계
  `proposed → accepted/needs_evidence/rejected`, 사람과 agent 행위자 모두 대상. 검증: 모든 전이가 감사되며
  레코드로 되돌릴 수 있음.

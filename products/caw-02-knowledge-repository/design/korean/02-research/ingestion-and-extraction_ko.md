# Ingestion & Claim Extraction

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** ../_meta/PRODUCT-BRIEF_ko.md, ../01-decisions/ (ADR: ingestion pipeline — to be written), ../08-research-plan/open-questions_ko.md (to be created)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 CAW-02를 위한 **ingestion pipeline**을 연구하고 명세한다:
`add-source → extract-claims → synthesize-note` 루프(use case 1)와
`add-related-work-signal → classify threat/support → link-to-claim` 루프(use case 2). 여기서는
**단계별 pipeline**, **각 단계가 운반하는 데이터**, 그리고 source→claim→evidence→note chain이 재구성 가능한 상태로
유지되도록 **모든 hop에서 provenance가 어디에 첨부되는지**를 정의한다(브리프 §2, §5).

이 문서는 저장 포맷(md-first 대 SQLite — 별도 ADR), 전체 data-model 스키마(별도 ADR), retrieval/embedding 전략,
또는 CAW-01/05/03과의 import/export 와이어 contract(별도 ADR)를 결정하지 **않는다**. 그것들을 boundary로 취급하고
ingestion이 그것들을 위해 채워야 할 필드를 명명한다.

## Grounding (이 설계가 차용하는 실제 도구/패턴)
- **paper의 구조적 파싱:** GROBID는 PDF → TEI/XML로 변환하여 title, abstract, 섹션화된 full text, figure/table,
  파싱된 reference(reference에서 ~0.87 F1)를 제공한다. paper 파싱을 위한 좋은 baseline이며, 지저분한 PDF에 대해서는
  LLM fallback과 짝지어 사용한다 ([GROBID docs](https://grobid.readthedocs.io/en/latest/Introduction/),
  [CORE+GROBID](https://blog.core.ac.uk/2023/07/17/core-grobid-structured-text-from-34-million-scientific-documents-and-counting/)).
- **Claim ↔ evidence를 first-class로:** PaperTrail은 다단계 추출(오프라인 paper-level claim/evidence 추출, real-time
  answer-level 추출, claim–evidence matching)을 사용하고 claim당 *source provenance*를 계산한다 — CAW-02가 강제하는
  것과 동일한 분리다 ([PaperTrail](https://arxiv.org/html/2602.21045v1)).
- **Classification 라벨:** 문장 수준 *rationale*을 가진 SciFact 스타일의 **SUPPORT / REFUTE / NEI (NoInfo)** 가
  "이 evidence가 claim을 지지하는가?"의 표준이다 — 우리의 threat/support/neutral 신호 분류에 직접 매핑된다
  ([SciFact](https://ui.adsabs.harvard.edu/abs/2020arXiv200414974W/abstract),
  [SciClaimHunt](https://arxiv.org/html/2502.10003v1)).
- **Dedup:** restate된 claim을 collapse하기 위한, cosine threshold(~0.9가 전형적, domain-tuned)를 가진
  embedding + ANN near-duplicate clustering ([SemHash](https://medium.com/@sreeprad99/how-semhash-simplifies-semantic-deduplication-for-llm-data-a0b1a53e84fe),
  [BigCode dedup](https://huggingface.co/blog/dedup)).
- **Schema-constrained extraction:** 필수 span offset을 가진 스키마에 대해 LLM이 JSON을 emit하도록 강제하는 것이
  evidence 추출의 auditability 패턴이다 ([schema-constrained biomedical extraction](https://arxiv.org/pdf/2601.14267)).

## 협상 불가능한 규칙 (브리프 §5, §10)
**생성된 요약은 evidence가 아니다.** LLM이 생산한 claim, note, 요약은 구체적 artifact/source span을 참조하는
`Evidence`에 연결되기 전까지는 *제안(proposal)* 일 뿐이다 — 결코 자유 텍스트가 아니다. pipeline은 이를 hard
invariant로 인코딩한다: `Claim`은 `locator`가 실제 artifact로 resolve되는 ≥1개의 `Evidence` 행 없이는 `accepted`
상태에 도달할 수 없다. synthesize된 `Note` 텍스트는 `generated: true` 플래그와 함께 저장되며 다른 claim의 evidence로
결코 인용될 수 없다.

---

## Pipeline A — add-source → extract-claims → synthesize-note

여섯 단계. 아래 각 행은 **input → output payload**와 **그 단계에서 첨부되는 provenance**를 나열한다.

| # | 단계 | 운반 in → out | 여기서 첨부되는 provenance |
|---|-------|------------------|--------------------------|
| A0 | **Intake / register source** | raw file 또는 URI/DOI → `Source{id, type, locator, hash, boundary, added_by, added_at}` | content hash (`sha256`), 원본 locator/URI, `boundary`(public/internal/confidential), actor(human 또는 agent skill id) |
| A1 | **Parse / normalize** | `Source` → `ParsedDoc{sections[], blocks[ {block_id, kind, text, page, char_span} ], refs[]}` | per-block locator: `{source_id, section, page, char_span}` —이후 모든 span이 가리키는 주소 지정 가능한 anchor |
| A2 | **Extract candidate claims** | `ParsedDoc` → `ClaimCandidate[]{text, polarity, claim_type, supporting_block_ids[], extractor, model_id, prompt_hash, confidence}` | extractor identity(`model_id`, `prompt_hash`, `tool_version`), source block으로의 포인터, `generated:true` |
| A3 | **Attach evidence** | `ClaimCandidate` → `Evidence[]{claim_ref, artifact_ref, locator, snippet, stance, rationale}` | claim→evidence link 자체 + **artifact reference**(block span, import된 trace path, dataset URI). invariant를 강제. |
| A4 | **Dedup / link** | 새 `Claim`+`Evidence` → 기존 `Claim`들로 병합; `Concept`/`OpenQuestion` link | merge 결정 로그(`merged_into`, `similarity`, `decided_by`); merge 시 어떤 source/evidence도 버려지지 않음 |
| A5 | **Synthesize note (cited)** | accepted `Claim[]` → `Note{text, generated:true, cites:[claim_id…], evidence_rollup}` | claim id로의 inline 인용; note는 source까지의 전체 chain을 운반; non-evidence로 표시 |
| A6 | **Review (human/agent gate)** | 제안된 `Claim`/`Note` → `accepted` / `needs-evidence` / `rejected` | reviewer identity, 결정, timestamp, trust-level 할당 |

### 단계 상세

**A0 — Register source.** 무엇보다 먼저 content hash를 계산한다. 그것은 source의 dedup key이며 재-ingestion을
idempotent하게 만든다. intake 시점에 `boundary`를 포착한다(나중에 안전하게 추론할 수 없음). actor는 human이거나 명명된
**agent skill**(브리프 §5 skill-wrap)이다 — 둘 다 동일하게 기록되어 에이전트 기여가 audit 가능하다. Source 타입:
`paper`(PDF/arXiv/DOI), `article`(web/markdown), `note`(Jimmy 자신의 것), 그리고 import-reference인
`trace`/`simulation_run`/`experiment`(CAW-01 export, 실행되지 않고 카탈로그화됨 — 브리프 §7).

**A1 — Parse / normalize.** 타입별로 라우팅: paper → GROBID(TEI), 실패/깨진 PDF에는 LLM fallback; article →
readability/markdown 추출; note → 이미 구조화됨. 안정적인 `block_id`와 `char_span`을 각각 가진 **주소 지정 가능한
block**의 평탄한 목록을 출력한다. *이것이 가장 중요한 단일 provenance artifact다:* 이후의 모든 claim, evidence snippet,
인용은 `{source_id, block_id, char_span}` locator로 resolve된다. 파싱은 결정적/재실행 가능해야 locator가 재파싱에서도
살아남는다(parser 버전을 저장; 버전 bump 시에만 재파싱하고 span을 remap).

**A2 — Extract candidate claims.** LLM-assisted, **schema-constrained**(JSON emit; 필수 필드: claim text,
`claim_type` ∈ {empirical, methodological, definitional, comparative, normative}, `polarity`, 그리고 claim이
도출된 `supporting_block_ids`). extractor는 자신이 읽은 block(들)을 인용하도록 강제된다 — block 포인터가 없는 claim은
이 단계에서 거부된다. A2가 emit하는 모든 것은 **candidate**(`status: proposed`, `generated: true`)다. 추출 run이
재현 가능하고 나쁜 prompt의 출력을 나중에 quarantine할 수 있도록 `model_id` + `prompt_hash`를 저장한다.

**A3 — Attach evidence.** "이 claim이 나온 block"을 구체적 artifact를 가리키는 first-class `Evidence` 행으로
변환하고, 추가적인 *보강(corroborating)* artifact(다른 source span, 경로로 지정된 import된 CAW-01 projection,
dataset)도 함께 변환한다. 각 evidence는 `stance`(supports/refutes/neutral)와 한 줄짜리 `rationale`(SciFact 패턴)을
운반한다. **Invariant gate:** 실제 artifact로 resolve되는 evidence가 없으면 claim은 `needs-evidence`로 남고 결코
auto-promote될 수 없다. 생성된 요약 텍스트는 `artifact_ref`가 되는 것이 구조적으로 차단된다.

**A4 — Dedup / link.** 두 계층: (1) content hash에 의한 **source dedup**(정확 일치); (2) 동일 `Concept` 이웃 내에서
claim 텍스트에 대한 embedding cosine 유사도에 의한 **claim dedup**, ANN으로 retrieve, threshold ~0.9(domain별로
tune — open question). 일치 시 **union(합집합)으로 merge**: 살아남는 정본 claim은 양쪽의 *모든* evidence와 *모든*
source 포인터를 누적한다 — 아무것도 버려지지 않으며, merge는 `similarity`와 `decided_by`와 함께 로그된다. 임계값 근처의
above-threshold 일치는 auto-merge 대신 human review로 간다. 또한 claim → `Concept`로 링크하고, extractor가 플래그한
곳에서 `OpenQuestion`/`Assumption`/`Decision` 행을 분리해 낸다.

**A5 — Synthesize note (cited).** **accepted** claim에 대해서만 `Note`를 구성한다. note는 `generated:true`이고, 그것이
기반하는 claim id로의 inline 인용을 운반해야 하며, `evidence_rollup`(그 claim들 뒤의 distinct artifact들)을 저장하여
독자가 LLM을 재실행하지 않고도 note → claim → evidence → source span을 따라갈 수 있게 한다. note는 결코 evidence로
사용될 수 없다(브리프 §10).

**A6 — Review gate (human/agent).** 기본 정책: agent-skill 제출물은 `proposed`로 들어온다. **전략적 수용에 대한
리뷰어는 Jimmy다**(브리프 §10). Review 액션: `accept`(trust level 할당), `needs-evidence`(A3로 되돌림),
`reject`(audit용으로 보관, superseded로 표시). 저위험, 고신뢰, public-boundary claim은 문서화된 정책 하에 agent
auto-accept 자격이 *있을 수도* 있다 — open question. 모든 전이는 actor + timestamp + 이유를 기록한다.

---

## Pipeline B — add-related-work-signal → classify threat/support → link-to-claim

CAW-05 radar / related-work 신호의 intake(브리프 §3 use case 2, §7). 신호는 **결코** 느슨한 요약으로 저장되지
않는다 — 기존 claim에 연결된 타입이 지정된 entity가 된다.

| # | 단계 | 운반 in → out | 여기서 첨부되는 provenance |
|---|-------|------------------|--------------------------|
| B0 | **Ingest signal** | CAW-05 export → `RelatedWork`/`RadarSignal{id, source_ref, boundary, received_at, origin:"CAW-05"}` | origin product, 원본 signal id, boundary, receipt time |
| B1 | **Resolve to Source/Claim** | signal → `Source`(인용된 외부 연구물) + `ClaimCandidate[]`(그것이 주장하는 것) | A0–A2 provenance 재사용(hash, locator, extractor id) |
| B2 | **Find target claim(s)** | candidate → embedding/keyword retrieval로 matching된 내부 `Claim[]` | match score + retrieval method 기록 |
| B3 | **Classify stance** | (external claim, internal claim) → `{stance ∈ supports / threatens(refutes) / neutral(NEI), rationale, confidence}` | classifier `model_id`, `prompt_hash`, rationale span, confidence; `generated:true` |
| B4 | **Link to claim** | stance → `Link{from:RelatedWork, to:Claim, stance, evidence_ref}` | 방향이 있고 stance가 있는 link + evidence 포인터; review status |
| B5 | **Review / escalate** | 제안된 link → accepted; **threat → OpenQuestion/Decision** | reviewer; 신뢰할 만한 threat이 accepted claim을 refute하면 escalation이 `OpenQuestion`을 생성 |

**Classification 의미론.** "Threat" = 우리의 accepted claim 중 하나를 **refute/약화**시키는 신뢰할 만한 외부
결과(SciFact REFUTE). "Support" = 보강(SUPPORT). "Neutral" = 관련은 있으나 직접적 영향 없음(NEI). **accepted claim을
겨냥하는 threat**은 반드시 `OpenQuestion`을 auto-raise하고 리뷰어에게 통지해야 한다 — 이것이 radar의 전체 핵심이다.
외부 신호는 stance link를 위한 durable한 `Evidence`가 된다(CAW-05 요약 텍스트가 아니라 외부 연구물의 artifact를 참조).

---

## Provenance 모델 — 무엇이 어디에 첨부되는가 (요약)

provenance는 **계층적이고 누적적**이다: 하위(downstream)의 어떤 것도 한 계층 위를 가리키지 않고는 존재할 수 없다:

```
Source        ── hash, locator/URI, boundary, actor, time          (A0/B0)
  └ Block      ── {source_id, block_id, char_span, page}           (A1)   ← the anchor
      └ Claim  ── extractor model_id+prompt_hash, generated:true,   (A2)
      │          supporting_block_ids, status, trust_level
      └ Evidence ── artifact_ref + locator, stance, rationale       (A3/B4) ← invariant target
          └ Note  ── generated:true, cites[claim_id], rollup        (A5)    ← never evidence
Review events  ── actor, decision, reason, time on every promotion  (A6/B5)
Merge events   ── similarity, merged_into, decided_by               (A4)
```

핵심 규칙:
- **모든 artifact reference는 locator이지, 결코 prose가 아니다.** 자유 텍스트는 evidence가 될 수 없다(브리프 §5
  invariant).
- **extractor identity는 생성된 content와 함께 이동한다**(`model_id`, `prompt_hash`, `tool_version`). 그래서 나쁜
  모델이나 prompt를 추적할 수 있고, 기저 source를 잃지 않고 그 출력을 quarantine할 수 있다.
- **boundary는 intake 시 설정되고 merge에서 monotonic하다**(internal+confidential의 merge → confidential). export(
  CAW-03으로)는 public-safe만으로 필터링한다(브리프 §7).
- **재-ingestion은 source hash를 통해 idempotent하다**. 재파싱은 span을 remap하며, 결코 claim을 orphan으로 만들지
  않는다.

## Tradeoff / 결정 지점

| 결정 | 옵션 A | 옵션 B | 기울기 |
|----------|----------|----------|------|
| Paper 파싱 | GROBID(구조적, 결정적) | LLM end-to-end(지저분한 PDF 처리) | GROBID 주력 + LLM fallback |
| Claim 추출 제어 | 필수 block ref를 가진 schema-constrained JSON | 자유 형식 후 post-validate | schema-constrained(audit 가능, no-provenance 케이스 차단) |
| Dedup trigger | threshold 초과 시 auto-merge | 항상 human-confirm | auto exact-hash; semantic merge는 threshold를 충분히 넘을 때만 auto, 아니면 review |
| Agent 수용 | 모든 agent 출력 → human review | confidence-gated auto-accept | v0는 human review; auto-accept 정책은 재검토 |
| Evidence stance 라벨 | 이진 support/refute | SUPPORT/REFUTE/NEI + rationale | 3-way + rationale(radar threat/support/neutral과 부합) |

## Open Questions
TODO(open-question: semantic dedup cosine threshold와 어떤 embedding model — 실제 claim에 대해 domain-tune).
TODO(open-question: 에이전트가 어떤 부류의 claim이든 auto-accept해도 되는가, 아니면 v0에서는 모든 것에 대해 human
review가 필수인가?).
TODO(open-question: claim_type taxonomy — 5-way {empirical/methodological/definitional/comparative/normative}로
충분한가?).
TODO(open-question: source가 더 새로운 parser 버전으로 재파싱될 때의 span-stability 전략 — remap 대 re-extract).
TODO(open-question: CAW-05의 classification 중 얼마나를 그대로 신뢰할 수 있고, 얼마나를 B3에서 intake 시
re-classify해야 하는가?).
TODO(open-question: rejected ClaimCandidate를 audit/training용으로 persist하는가, 그리고 어떤 boundary 하에?).

## 런북에 대한 함의
- **RB (intake & parse):** hashing + boundary 포착을 가진 `Source` 등록과, 안정적인 `block_id`/`char_span`을 가진
  주소 지정 가능한 block을 생산하는 type-routed parser(GROBID service + LLM fallback)를 구축한다. 검증: 재-ingest된
  동일 파일이 idempotent함; 모든 block이 resolve 가능한 locator를 가짐.
- **RB (claim extraction):** 필수 `supporting_block_ids`를 가진 `ClaimCandidate` JSON을 emit하는 schema-constrained
  LLM extractor; block ref가 없는 candidate는 거부. `model_id`+`prompt_hash` persist. 검증: source-block 포인터 없는
  candidate가 존재하지 않음.
- **RB (evidence & invariant):** `Evidence` writer + **claim→evidence invariant gate**(resolve 가능한
  artifact_ref 없이는 promote 불가). 검증: "evidence"로 생성 텍스트만 가진 claim을 accept하려는 시도가 실패함.
- **RB (dedup & link):** exact source-hash dedup + union-merge와 merge 로깅을 가진 embedding/ANN claim dedup.
  검증: 두 claim을 merge할 때 모든 evidence와 source 포인터가 보존됨.
- **RB (synthesize note):** `generated:true`, inline claim 인용, evidence rollup, 그리고 note가 evidence로
  사용되는 것을 막는 guard를 가진 cited `Note` generator. 검증: 모든 note가 source span으로 resolve됨.
- **RB (signal intake):** CAW-05 signal → Source/Claim resolution, target-claim retrieval, 3-way stance
  classifier, stance가 있는 link writer, 그리고 threat→OpenQuestion escalation. 검증: accepted claim에 대한
  refute하는 신호가 OpenQuestion과 리뷰어 통지를 auto-create함.
- **RB (review gate):** 모든 전이에 actor+reason+timestamp를 가진 state machine `proposed →
  accepted/needs-evidence/rejected`, human과 agent actor 모두에 대해. 검증: 모든 전이가 audit되고 record로
  되돌릴 수 있음.

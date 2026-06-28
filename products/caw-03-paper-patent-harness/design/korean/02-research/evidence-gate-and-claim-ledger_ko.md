# Evidence Gate & Claim Ledger (증거 게이트 및 claim 원장)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - CAW-02 (별도 제품) export 계약 — `RB-051-export-caw03` 및 `claim-evidence-and-evidence-gate.md`
  - sibling: `./paper-orchestra-integration.md` (WritingEngine port) — TODO(작성되면 링크)
  - sibling: `./patent-drafting-module.md` (patent 경로 + patent-first) — TODO(작성되면 링크)
  - sibling: `./ports-and-adapters.md` (SourceAdapter / registry) — TODO(작성되면 링크)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **CAW-03의 evidence gate(증거 게이트)**를 결정한다: claim이 논문이나 patent draft에 들어가기 전에
지녀야 하는 최소한의 evidence, **claim 타이핑**(P1/P2 method/tool vs P3 future-device), **provenance가 렌더링된
아티팩트까지 어떻게 이어지는가**, 그리고 CAW-03이 CAW-02의 인용된 claim+evidence 번들을 *가져와서(importing)*
구축하는 **claim-ledger 모델**(CAW-03은 참조한다; 지식 저장소를 다시 소유하지 않는다). 게이트가 어떻게
**WritingEngine(기본값 PaperOrchestra)을 차단하여** 게이트를 통과하지 않은 claim이 draft될 수 없게 하는지를
규정한다. 이 문서는 CAW-02의 내부 claim/evidence 불변식을 재정의하지 *않으며*(CAW-03은 export된 번들을 있는
그대로 소비), patent 모듈 내부 구조를 설계하지 *않으며*(patent 전용 게이트 행만), PaperOrchestra adapter를
설계하지 *않는다*.

## 1. 양보할 수 없는 단 하나의 규칙
**생성된 텍스트는 결코 evidence가 아니다.** PaperOrchestra의 산문, autorater 판정, LLM "요약", CAW-02
`Note`(`evidence=false`), 또는 합성된 어떤 문단이든 claim을 *촉발(prompt)*하거나 claim에 *의해 인용*될 수는
있으나 결코 claim을 *뒷받침(back)*할 수 없다. 이것은 import boundary를 가로질러 운반된 CAW-02의 불변식이다.
CAW-03에서 게이트의 유일한 임무는 이를 *drafting* 쪽에서 다시 강제하는 것인데, 유창하게 생성된 텍스트가
evidence를 대신하도록 두고 싶은 유혹이 가장 큰 곳이 바로 이곳이기 때문이다. Evidence는 항상 구체적 아티팩트에
대한 타입 있는, 해석 가능한 참조이다(`source | trace | simulation_run | experiment`로부터
`extracted_from`된 CAW-02 `Evidence` 노드, 또는 CAW-01 result-registry 참조) — 문자열이 아니다.

## 2. Claim 타이핑 (P1/P2/P3)
brief는 세 가지 claim 타입을 고정한다. 이들은 **그들에 대해 존재할 수 있는 evidence의 종류**가 다르며, 이것이
게이트를 타입별로 만드는 요인이다. P1/P2는 *회고적(retrospective)*이며(그것이 만들어지고/실행되어 측정되었음),
P3는 *예측적(prospective)*이다(아직 만들어지지 않은 device에 대한 projection — patent의 **prophetic example(예언적
예시)**과 유사하며, 이는 허용되지만 USPTO 35 U.S.C. 112 지침에 따라 실제가 아니라 예측된 것임을 명확히 표시해야
한다).

| 타입 | 의미 | *존재할 수 있는* evidence | 대응 |
|---|---|---|---|
| **P1** | **Method** claim — 알고리즘/기법이 작동함 (예: 어떤 tiling/partitioning 전략이 트래픽을 줄임) | 재현 가능한 code 또는 `strategy-id`를 갖춘 측정/시뮬레이션 결과; CAW-01 run evidence | 논문 "working example"; method patent claim |
| **P2** | **Tool** claim — 구축된 도구/시스템이 존재하며 X를 함 (예: syntorch가 sub-torch trace를 포착 → Chakra) | 구현 아티팩트 + 실행 trace/run; CAW-01 result | 논문 시스템 기여; apparatus patent claim |
| **P3** | **Future-device** claim — *만들어지지 않은* 메모리 device의 속성 | **오직** 모델 projection evidence(가정 + CI를 갖춘 CAW-01 projection); 결코 측정값이 아님 | 논문 "projection"; **prophetic** patent claim |

타입은 **원장에서 claim별로 선언되며**, 게이트 임계값(§4)과 하류 처리 모두를 구동한다(P3는 novelty/patent-first
검토로 라우팅되고, 수치 P3 진술은 측정값이 아니라 projection으로 렌더링되어야 한다).

## 3. claim 원장 — 재소유가 아니라 가져온 것
CAW-03의 원장은 **CAW-02의 export된 번들에 대한 projection**에 CAW-03 로컬의 drafting 상태를 더한 것이다. CAW-02는
서명되고 자체 완결적인 `*.caw03-bundle.json`(`boundary_kind=caw03-bundle`)을 방출하며, 이는 `claims[]`(trust +
boundary 포함), `evidence[]`(`{kind, locator, citation, artifact_ref|null, value}`), 중복 제거된
`bibliography`, 그리고 `provenance_digest`를 담는다. CAW-03은 **digest + 서명을 검증한 뒤 항목을 id/URI로
참조한다**. 지식 그래프의 사본을 저장하지 않는다. (이것은 단방향 파일/API boundary이다 — CAW-02가 방출하고,
CAW-03이 끌어온다; 공유 저장소 없음.)

```yaml
# CAW-03 claim-ledger entry (CAW-03-owned state; refs CAW-02, never duplicates it)
ledger_entry:
  ledger_id: caw03-clm-0001              # CAW-03-local id
  source_bundle:                         # provenance of the import itself
    bundle_uri: caw02://exports/2026-..caw03-bundle.json
    provenance_digest: sha256:...        # re-verified on import; pinned
    signature_ok: true
  claim_ref: caw02://claim/CLM-2031      # REFERENCE into CAW-02 (not a copy)
  claim_type: P1 | P2 | P3               # CAW-03 typing decision (default inferred, human-confirmable)
  evidence_refs:                         # references into the bundle's evidence[]
    - { ref: caw02://evidence/EV-77, kind: simulation_run|trace|experiment|source|model-projection,
        artifact_ref: caw01://result/RS-12 | null, value: {n, unit, ci}|null, citation: bib:smith2025 }
  result_registry_refs: [ caw01://result/RS-12 ]   # CAW-01 import (figures/tables), referenced not owned
  trust: T0|T1|T2|T3                     # carried from CAW-02; gate reads it
  boundary: public|internal|confidential # effective boundary from CAW-02; gate + confidentiality filter read it
  gate_status: blocked | draftable | draftable_with_label
  gate_report_ref: ./gate/clm-0001.json  # why blocked / what's missing
  draft_targets: [ paper:P1-ladder, patent:none ]   # where this claim is allowed to flow
```

핵심 속성: (1) `claim_ref`/`evidence_refs`/`result_registry_refs`는 **다른 제품으로의 URI**이다 — CAW-03은
타이핑, gate 상태, draft 라우팅만 소유한다. (2) 번들의 `provenance_digest`는 항목에 **핀 고정**되므로, 렌더링된
논문/patent은 정확한 CAW-02 export로 replay 가능하다. (3) Note는 `evidence=false`로 도착하며 결코
`evidence_refs`에 나타날 수 없다.

## 4. Gate 정책 — claim 타입별 최소 evidence
claim은 아래 행을 통과해야만 **draftable**이다. "Concrete Evidence(구체적 증거)" = 해석되는 `artifact_ref`를
가진 CAW-02 `Evidence` *또는* CAW-01 result-registry 참조. 생성된 텍스트는 결코 인정되지 않는다(§1). Trust
tier(T0–T3)는 CAW-02에서 운반되며, 게이트는 이를 **읽을** 뿐 재계산하지 않는다.

| Claim 타입 | **draftable**이 되기 위한 최소 조건 | 수치 진술 | 비교 진술 ("~보다 낫다") | 하드 차단 사유 |
|---|---|---|---|---|
| **P1 method** | **trust ≥ T1**의 concrete Evidence ≥1; 재현 가능한 `code`/`strategy-id` 존재 | 각 수치는 `unit`(+ 해당 시 CI)을 가진 CAW-01 result-registry 참조로 해석됨 | 같은 종류의 baseline result 참조 필요 | evidence 0개 → `ERR_NO_EVIDENCE`; 생성물/Note만 → `ERR_GENERATED_AS_EVIDENCE` |
| **P2 tool** | **trust ≥ T1**의 concrete Evidence ≥1; 구현 아티팩트 + 실행 trace/run ≥1 | P1과 동일 | P1과 동일 | P1과 동일; 아티팩트 누락 → `ERR_TOOL_UNBACKED` |
| **P3 future-device** | 명시적 **가정 + CI**를 갖춘 **model-projection** Evidence(CAW-01) ≥1; **결코** 측정값이 아님 | 수치는 *projection*으로 렌더링(`unit`+CI를 지니고 "projected" 라벨) | baseline 또한 같은 모델 클래스의 projection이어야 함 | device 속성으로 위장한 측정값 → `ERR_PROJECTION_AS_MEASUREMENT`; 가정/CI 누락 → `ERR_PROJECTION_UNQUALIFIED` |

**Paper vs patent 오버레이** (같은 claim, patent 경로에서 더 엄격한 게이트):

| 경로 | 위 행을 넘어서는 추가 요구사항 |
|---|---|
| **Paper** | trust ≥ T1 (reproducibility-checklist 스타일: venue가 기대하는 곳에 code/hyperparams/seeds/baseline 존재); P3 수치는 projection으로 명시적 라벨 |
| **Patent** | P3 prophetic claim은 **허용**되나 **written-description + enablement** 검토 및 **patent-first** 게이팅(공개 전 출원)을 위해 표시됨; prophetic/working example은 명확히 구별되어야 함(USPTO 112 지침); draft 전에 novelty/claim-boundary 검사(CAW-05 import)가 실행되어야 함 |

`draftable_with_label`은 P3의 결과이다: claim은 projection/prophetic 라벨이 기계적으로 부착된 상태에서만
draft될 수 있어, engine이 이를 측정된 사실로 렌더링할 수 없다.

## 5. Provenance 이어짐 (gate → draft → 렌더링된 아티팩트)
게이트는 claim을 받아들이기만 하는 것이 아니라, **evidence 체인을 렌더링된 출력물로 전파**하여 논문이나
patent이 그 CAW-02/CAW-01 기원으로 replay 가능하도록 한다.

```
CAW-02 bundle (signed, digest)
  └─ ledger_entry (pins digest; types claim; gate=draftable)
       └─ engine input assembly  → experimental_log.md rows + figure/table manifest carry the result-registry ref
            └─ PaperOrchestra draft (LaTeX): every numeric cell/figure caption keeps a back-ref id
                 └─ rendered PDF/patent: claim ↔ evidence ↔ bibliography all resolve; digest recorded in artifact metadata
```

규칙: (1) engine이 렌더링하는 모든 figure/table은 manifest 내의 `result_registry_ref`에 1:1로 대응한다 —
뒷받침하는 run 없는 figure는 없다. (2) 번들의 `bibliography`가 BibTeX가 된다; 인용은 반드시 해석되어야 한다
(dangling 없음). (3) 최종 아티팩트는 핀 고정된 `provenance_digest`를 기록하므로, review는 draft가 표류한 것이
아니라 정확히 게이트를 통과한 evidence 집합으로 구축되었음을 검증할 수 있다.

## 6. 게이트가 drafting을 차단하는 방식
게이트는 **SourceAdapter import와 WritingEngine port 사이에** 위치한다 — 사후(post-hoc) 검사가 아니라 입력
조립에 대한 전제 조건이다. PaperOrchestra(기본 engine)는 **이미 게이트를 통과한 claim 집합**에 대해서만
호출된다; 게이트를 통과하지 않은 claim을 결코 보지 않는다.

```
SourceAdapter(import) → ClaimLedger(type + gate) ──[only draftable / draftable_with_label]──▶ EngineInputAssembler → WritingEngine(PaperOrchestra)
                              │
                              └─[blocked]──▶ gate_report (missing-evidence list) ; NOT passed to engine
```

claim별 상태 기계: `imported → typed → gated{blocked|draftable|draftable_with_label} → in_draft → in_review →
published|filed`. `blocked` claim은 **전진할 수 없다**; engine-input assembler는 draftable claim으로 필터링하며,
요청된 claim이 blocked이면 **요란하게 실패한다**(gate report를 반환하고 아무것도 draft하지 않음 — CAW-02의
fail-closed export를 그대로 따름). 게이트는 "submission-ready" 전에 **review 체크리스트**에서도 다시 검사되므로,
evidence를 잃은 claim(번들이 superseded됨)은 publish/file 전에 포착된다.

**Negative tests (런북 수용 기준):**

| # | 시도 | 기대 결과 |
|---|---|---|
| N1 | evidence 0개인 claim을 draft | `ERR_NO_EVIDENCE`; 해당 claim에 대해 engine 미호출 |
| N2 | LLM 요약 / Note를 뒷받침으로 전달 | `ERR_GENERATED_AS_EVIDENCE`; 거부됨 |
| N3 | *측정값*으로 뒷받침된 P3 device claim | `ERR_PROJECTION_AS_MEASUREMENT`; 거부됨 |
| N4 | projection은 있으나 가정/CI 없는 P3 claim | `ERR_PROJECTION_UNQUALIFIED`; 거부됨 |
| N5 | result-registry 참조 없는 수치 P1 claim | blocked; 누락된 참조 명시 |
| N6 | `provenance_digest`/서명이 실패하는 번들을 import | import 거부됨; 원장에 아무것도 들어가지 않음 |
| P1 | 완전히 뒷받침된 P1 claim (T1, result 참조, baseline) | `draftable`; provenance를 운반하며 engine으로 흐름 |
| P2 | qualified된 P3 projection claim | `draftable_with_label`; projection으로만 렌더링됨 |

## 7. 일반화 (이음새, brief §5에 따름)
게이트는 하드코딩된 임계값이 아니라 **port 뒤의 정책 객체(policy object)**이다. 두 이음새가 열려 있어야 한다:
- **SourceAdapter 비종속적.** 원장은 `SourceAdapter` 계약을 통해 공급된다; CAW-02 번들이 v1 source이지만, 미래의
  internal-wiki나 experiment-server adapter는 *동일한* `evidence_refs` 형태(타입 있음, 해석 가능, 합성물은
  `evidence=false`)를 생산해야 한다. 게이트 로직은 어떤 adapter가 claim을 생산했는지 알지 못한다.
- **Config 기반 gate 프로파일.** 임계값(최소 trust, 필수 result 참조, venue reproducibility 항목, patent 112
  검사)은 config로 선택되는 명명된 **gate 프로파일**(예: `profile: neurips-paper`, `profile:
  us-utility-patent`)에 산다. 새로운 venue/관할권 = 코어 변경이 아니라 새로운 프로파일. "생성된 텍스트는 결코
  evidence가 아니다" 규칙은 **어떤 프로파일도 완화할 수 없는** 단 하나의 불변식이다.

## Open Questions
- TODO(open-question: claim-type(P1/P2/P3) 추론이 사람 확인을 거치는 자동인가, 아니면 사람 배정 전용인가?
  claim-ledger ADR과 함께 소유.)
- TODO(open-question: venue별 정확한 최소 trust — P1 논문 claim에 T1로 충분한가, 아니면 상위 venue는 T2를
  요구하는가? paper-ladder & novelty 문서와 함께 소유.)
- TODO(open-question: CAW-03이 *superseded*된 CAW-02 번들을 어떻게 감지하고 진행 중인 draft를 재게이팅하는가 —
  poll, webhook, 또는 build 시 재import? CAW-02와의 경계 교차.)
- TODO(open-question: patent 112 enablement/written-description 검사는 누가 소유하는가 — CAW-03 규칙, 사람
  reviewer, 또는 PatentEngine adapter? patent-drafting 문서와 함께 소유.)
- TODO(open-question: *blocked* claim을 일급(first-class) 원장 항목으로 영속화하는가(가시적 backlog) 아니면
  버리는가? 선호: 영속화, CAW-02의 `needs_evidence` 상태를 그대로 따름.)
- `../08-research-plan/open-questions.md` 참조 (작성 예정).

## 런북에 대한 함의
- **RB (bundle import + ledger):** import 시 `provenance_digest` + 서명 검증(N6); CAW-02/CAW-01을 URI로
  *참조*하는 원장 항목 구축; digest 핀 고정. 지식 그래프의 사본 없음.
- **RB (gate engine):** §4의 타입별 게이트를 **config로 선택되는 프로파일**로 구현; N1–N6 + P1/P2를 수용 기준으로
  배포; "생성된 텍스트는 결코 evidence가 아니다" 규칙은 모든 프로파일에 걸쳐 무조건적.
- **RB (engine-input assembler):** `draftable`/`draftable_with_label` claim으로만 필터링; 요청된 claim이
  blocked이면 gate report와 함께 요란하게 실패; engine이 측정값으로 렌더링하지 못하도록 P3에 projection 라벨
  부착; `result_registry_refs`로부터 figure/table manifest를 1:1로 구축.
- **RB (review checklist):** "submission-ready" 전에 게이트 재실행; 렌더링된 아티팩트의 핀 고정된 digest가 그것이
  구축된 번들과 일치하는지 검증(provenance 이어짐, §5).
- **RB (ports):** 게이트는 구체적 adapter가 아니라 `SourceAdapter` evidence 형태와 gate-profile config만 읽으므로,
  wiki/experiment-server source가 게이트 로직을 건드리지 않고 꽂힌다.

Sources: [USPTO — Properly Presenting Prophetic and Working Examples (35 U.S.C. 112)](https://www.federalregister.gov/documents/2021/07/01/2021-14034/properly-presenting-prophetic-and-working-examples-in-a-patent-application), [MPEP 2164 Enablement](https://www.uspto.gov/web/offices/pac/mpep/s2164.html), [NeurIPS Paper Checklist Guidelines](https://neurips.cc/public/guides/PaperChecklist).

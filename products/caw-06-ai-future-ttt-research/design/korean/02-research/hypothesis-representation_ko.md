# 가설 표현 & 불확실성(Hypothesis Representation & Uncertainty)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) *(예정)*
  - [../05-ttt-research-core/experiment-ledger.md](../05-ttt-research-core/experiment-ledger_ko.md) *(예정 — verdict가 상태 전이에 공급됨)*
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) *(예정)*
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **CAW-06가 불확실한 미래-AI / TTT 가설을 과잉주장 없이 표현하는 방법**을 결정한다: 가설의 데이터 모델,
그 **상태 수명주기(status lifecycle)**(hypothesis / supported / refuted / inconclusive), **신뢰도와 불확실성**을
기록하는 방법, **증거(evidence)**를 연결하는 방법, 그리고 가설이 **결코 확정된 주장으로 렌더링되지 않는다**는 엄격한
규칙. 이 문서는 필드와 상태 전이를 정의하며, `ExperimentScout` 파이프라인과 CAW-01 / CAW-02로의 익스포트가 반드시
준수해야 하는 계약이다.

이 문서가 정의하지 **않는** 것: 주장 추출 알고리즘이나 소스 수집(별도 문서), 실험 원장 스키마(별도 문서 — 이 문서는
그 `verdict`만 소비함), writeback-traffic 스키마(별도 문서), 저장/직렬화 메커니즘(ADR). 이 문서는 brief의 패밀리
데이터 방향을 가정한다: markdown/JSON 레코드, 각각 provenance, status/uncertainty, `boundary`를 지님.

## 1. 왜 이것이 하중을 견디는(load-bearing) 부분인가

미래-AI/TTT 주장은 과잉주장 또는 과소주장하기 쉬우며, brief의 가드레일은 명시적이다: *소스, 주장, 증거, 생성된 결론을
분리하여 유지하라; 생성된 요약은 증거가 아니다; 가설은 결코 확정된 주장으로 제시되지 않는다*(PRODUCT-BRIEF §12).
표현(representation)은 그 가드레일의 강제 메커니즘이다 — 만약 모델이 "어떤 논문이 X라고 말한다", "우리가 가설 Y를
생성했다", "우리 토이 실험이 Y를 지지한다"를 구조적으로 구분할 수 없다면, 제품은 CAW-01과 CAW-02로의 익스포트에
과잉주장을 누출시킨다.

이 분야의 변동성이 이를 구체화한다. TTT/test-time-compute는 움직이는 표적이다: 방법론은 test-time *scaling*(동결
가중치, 샘플-후-선택)부터 test-time *training*(추론 중 "fast weights"로의 그래디언트 갱신)까지 걸쳐 있으며 — 어떤
변형이 실제로 **write back**하는지 자체가 미검증이다(PRODUCT-BRIEF §6). "TTT는 write back한다"를 사실로 박아넣는
표현은 CAW-01 워크로드-축 브리지를 오염시킬 것이다. 그래서 **writeback 가설은 전제(premise)가 아니라 추적되는
`Hypothesis`다.**

## 2. 세 개의 분리된 계층(과잉주장 방지 핵심)

표현은 세 종류의 레코드를 **구별되고 개별적으로 주소 지정 가능하게** 유지한다. 그들은 id로 서로를 참조하며; 결코 하나의
"사실(fact)" 덩어리로 병합되지 않는다. 이는 *주장(assertion)*, 그에 대한 *증거*, 그 *provenance*를 분리하는
증거/주장 온톨로지를 반영한다(Sources 참조).

| 계층 | 레코드 종류 | 진리 상태 | 출처 | 예시 |
|---|---|---|---|---|
| **소스 주장** | `Claim` | *소스가 주장하는 것*(우리가 주장하는 것이 아님) | 공개 연구에서 추출 | "TTT-E2E는 next-token 예측을 통해 컨텍스트를 가중치로 압축한다." |
| **가설** | `Hypothesis` | 우리가 확인하기로 제안하는 것 — **항상 잠정적(provisional)** | `ExperimentScout`가 생성 | "TTT-급 추론은 read-dominant 서빙에 없는 쓰기 트래픽을 생성한다." |
| **증거** | `Evidence` | 가설에 영향을 주는 관찰 | 소스 인용 또는 우리 실험 결과 | 토이 실험 verdict; 인용된 측정치 |

**엄격한 규칙.**
1. `Hypothesis`는 **`status` 없이 결코 직렬화되지 않는다**; 기본값이자 바닥(floor)은 `hypothesis`다.
2. **생성된 요약은 `generated` 종류의 `Evidence`일 뿐이며, `generated` 증거는 그 자체로 결코 상태를 `supported` 또는
   `refuted`로 이동시킬 수 없다**(§12에 의해 증거가 아님). 그것은 `inconclusive`에 정보를 줄 수는 있다.
3. `Claim`은 `asserted_by` provenance를 지닌다; 그것은 *"<source>가 …라고 주장한다"*로 렌더링되며, 결코 *"…인 것이
   참이다"*로 렌더링되지 않는다. 소스 주장을 우리의 결론으로 재진술하는 것은 금지된다.
4. (CAW-01/CAW-02로의) 익스포트는 `status`, `confidence`, 증거 링크를 **인라인으로** 지닌다 — 가설은 불확실성이
   벗겨진 채 제품 경계를 넘어갈 수 없다(§7 참조).

## 3. 상태 수명주기

네 가지 상태, brief에 의해 고정된 그대로다(PRODUCT-BRIEF §5.2). 상태는 *현재 증거*의 속성이지 영구 레이블이 아니다 —
가역적(reversible)이다.

| Status | 의미 | 진입 조건 | 익스포트 가능 형태 |
|---|---|---|---|
| `hypothesis` | 제안됨, 아직 미검증 | 생성 시 기본값 | open question / 제안만 |
| `supported` | 증거가 그것과 일치; **증명된 것 아님** | supporting verdict를 가진 `experiment`/`external` 종류 `Evidence` ≥1개, 증거 기준(§4) 상회 | "supported (provisional)" 주장+증거 |
| `refuted` | 증거가 그것과 모순 | 기준 상회의 반증(disconfirming) `Evidence` ≥1개 | 음성 결과(일급) |
| `inconclusive` | 검증되었으나 증거가 약함/혼합/null | 실험은 실행되었으나 verdict가 모호, 또는 상충하는 증거 | open question + 로깅된 시도 |

```
                    ┌───────────────────────────────────────┐
                    v                                         │
   (create) ──► hypothesis ──experiment/external──► supported ┤
                    │  ▲                                       │ new disconfirming
                    │  │ re-opened by new/contradicting        │ evidence
                    │  │ evidence (any transition reversible)  v
                    │  └───────────────────────────── refuted ─┘
                    │
                    └── ran, weak/mixed/null ─► inconclusive ──► (re-test) ─► hypothesis
```

**전이 규칙.**
- 모든 전이는 `StatusEvent`(timestamp, from→to, 촉발 증거 id들, actor)를 기록한다. 수명주기는 **추가 전용 로그**이며;
  현재 상태는 최신 이벤트다. 이는 실패와 반전(reversal)을 감사 가능하게 유지한다.
- `supported`와 `refuted`는 **결코 종착(terminal)이 아니며** 결코 "증명됨/반증됨"을 의미하지 않는다 — 오직 "현재
  증거가 이쪽으로 기운다"만 의미한다. 새로운/모순되는 증거에 대한 재개(re-open)는 예외가 아니라 예상되는 일이다.
- `experiment` 또는 `external` 증거만(`generated`이 아님) `→ supported` / `→ refuted`를 구동할 수 있다(§2 규칙 2).
- 증거가 0개인 가설은 `hypothesis` 외의 어떤 것도 될 수 **없다**.
- Jimmy가 전략적 상태 승격(promotion)의 리뷰어다; 파이프라인이 제안하고, 사람이 `supported` 익스포트를 확정한다
  (PRODUCT-BRIEF §12).

## 4. 신뢰도 & 불확실성 필드

우리는 **status**(증거가 어느 쪽으로 기우는지)를 **confidence**(얼마나 강하게)와 분리하며, IPCC의 2-메트릭 패턴을
채택한다 — 증거 양/질 + 합의(agreement)로부터의 *confidence*, 그리고 정량화 가능할 때의 선택적 *likelihood*(Sources
참조). 우리는 거짓 정밀도(false precision)를 피하기 위해 의도적으로 기본값으로 **정성적, 보정된(calibrated)** 용어를
사용한다.

| 필드 | 타입 | 값 | 비고 |
|---|---|---|---|
| `confidence` | enum | `very-low` \| `low` \| `medium` \| `high` \| `very-high` | `evidence_strength` × `agreement`에서 도출; 기본 `very-low` |
| `evidence_strength` | enum | `none` \| `weak` \| `moderate` \| `strong` | non-`generated` 증거의 질+양 |
| `agreement` | enum | `conflicting` \| `mixed` \| `consistent` | 증거 항목들 간 |
| `likelihood` | optional enum | `unlikely` \| `about-as-likely-as-not` \| `likely` \| `very-likely` | 정량화된 경우에만; 아니면 생략(지어내지 말 것) |
| `uncertainty_notes` | markdown | 자유 텍스트 | 우리 생각을 바꿀 만한 것; 알려진 교란요인(confounder) |
| `falsifiability` | markdown | 자유 텍스트 | 그것을 반증할 관찰 — `hypothesis`를 벗어나려면 필수 |
| `reproducibility` | enum | `unrun` \| `single-run` \| `replicated` \| `failed-to-reproduce` | 원장 항목으로 링크 |

**규칙.**
- `confidence`는 **`evidence_strength`에 의해 상한 제한된다(capped)**: `none → very-low`(최대), `weak → low`,
  산문이 아무리 설득력 있어 보여도 무관하게. `generated` 증거만으로 뒷받침되는 가설은 `very-low`에 고정된다.
- `likelihood`는 **추측이 아니라 생략된다**. 비어 있음 ≠ "about as likely as not". DOC-CONVENTIONS에 따라 미지의
  것은 `TODO(open-question: ...)`이며, 결코 조작된 수치가 아니다.
- `falsifiability`가 없는 가설은 `supported` 후보가 아니라 `TODO`다 — 검증 불가능한 가설은 `hypothesis`로 남고
  플래그된다.

## 5. 가설 레코드 모델

JSON 형태(markdown front-matter 또는 `.json`, 저장 ADR에 따름). 예시용 — 빌더가 스키마를 작성한다.

```jsonc
{
  "id": "hyp-2026-0007",
  "kind": "Hypothesis",
  "statement": "TTT-class inference (weight/state writeback during serving) produces a write-traffic profile not captured by read-dominant LLM-serving memory assumptions.",
  "theme": "ttt-writeback",                 // one of the tracked research themes
  "status": "hypothesis",                    // hypothesis | supported | refuted | inconclusive
  "confidence": "low",
  "evidence_strength": "weak",
  "agreement": "mixed",
  "likelihood": null,                        // omit unless quantified — do NOT invent
  "falsifiability": "A measured TTT variant shows write bytes/token ≈ 0 vs. baseline ⇒ refuted.",
  "uncertainty_notes": "Which TTT variants actually write back is unverified (PRODUCT-BRIEF §6).",
  "reproducibility": "single-run",
  "derived_from_claims": ["clm-2026-0031", "clm-2026-0042"],   // Claim ids (source assertions)
  "evidence": ["evd-2026-0101", "evd-2026-0118"],              // Evidence ids
  "status_log": [
    {"ts": "TODO", "from": null, "to": "hypothesis", "by": "ExperimentScout", "evidence": []},
    {"ts": "TODO", "from": "hypothesis", "to": "supported", "by": "Jimmy", "evidence": ["evd-2026-0118"]}
  ],
  "implications": ["imp-2026-0003"],         // implication-map node ids
  "boundary": {                              // export routing — never a shared store
    "exports_to": ["CAW-01:open-question", "CAW-02:claim+evidence"],
    "imports_from": ["CAW-05:signal-9921"]
  },
  "provenance": {"created_by": "ExperimentScout", "created_at": "TODO", "review_state": "unreviewed"}
}
```

동반 `Evidence` 레코드(§2에 따라 분리 유지):

```jsonc
{
  "id": "evd-2026-0118",
  "kind": "Evidence",
  "evidence_kind": "experiment",            // experiment | external | generated
  "supports": "hyp-2026-0007",
  "direction": "supporting",                // supporting | disconfirming | neutral
  "strength": "moderate",
  "ledger_ref": "exp-2026-0044",            // small-experiment ledger entry (incl. failures)
  "source_ref": null,                       // set for evidence_kind=external (citation)
  "note": "Toy reproduction measured non-zero write bytes/token under TTT update; single run."
}
```

## 6. 작동 예시(보정)

| 상황 | status | evidence_strength | confidence | 이유 |
|---|---|---|---|---|
| Scout가 소스 주장 2개로 가설 생성, 아무것도 실행 안 함 | `hypothesis` | `weak` | `very-low` | generated만; 상한 제한 |
| 토이 재현이 non-zero writeback을 보임, 단일 실행 | `supported` | `moderate` | `low` | 단일 실험; reproducibility=`single-run` |
| 두 토이 실행이 불일치 | `inconclusive` | `weak` | `very-low` | `agreement=conflicting` |
| 그 변형에 대해 재현이 약 zero 쓰기 트래픽을 보임 | `refuted` | `moderate` | `medium` | 반증, falsifiability와 일치 |
| LLM 요약 "TTT가 메모리를 지배함을 강하게 시사" 뿐 | `hypothesis` | `none` | `very-low` | generated ≠ evidence (§2 규칙 2) |

## 7. Boundary / 익스포트 동작

- **CAW-01로(별개 제품):** `hypothesis` 상태 항목은 `confidence`, `uncertainty_notes`, `falsifiability`를 지닌
  **미래-워크로드 open question**으로 익스포트된다. `supported` 항목만 후보 워크로드-축 입력으로 익스포트되며, 그래도
  `provisional`로 플래그된다. 공유 저장소 없음 — 파일/API 핸드오프(PRODUCT-BRIEF §8).
- **CAW-02로(별개 제품):** `status ∈ {supported, refuted}`일 때만 `Claim` + 연결된 `Evidence`를 익스포트한다;
  `status` + `confidence`가 인라인으로 함께 간다. 맨(bare) 가설은 지식으로 익스포트되지 않는다.
- **CAW-05로부터(별개 제품):** 임포트된 TTT 레이더 신호는 `status=hypothesis`, `confidence=very-low`로 새
  `Hypothesis`를 열고, 그 신호는 `external` 증거로 기록된다 — 결코 자동 승격되지 않는다.
- 어느 것도 status/uncertainty가 벗겨진 채 경계를 넘지 않는다(§2 규칙 4).

## 미해결 질문(Open Questions)

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) *(예정)* 참조.

- `TODO(open-question: 다운스트림 순위화를 위해 정성적 enum과 함께 수치 confidence(0–1)가 필요한가, 아니면 그것은
  거짓 정밀도를 부르는가?)`
- `TODO(open-question: "N개의 독립 실험에 의해 supported"가 confidence를 게이팅하는 구조화된 카운터여야 하는가,
  아니면 리뷰어 판단인가?)`
- `TODO(open-question: 부분적으로 지지되는 가설을 어떻게 표현하는가 — 하위 가설로 분할, 아니면 "scope" 한정자 추가?)`
- `TODO(open-question: 어떤 TTT 변형이 실제로 write back하는가? 검증되기 전까지 writeback 가설은
  status=hypothesis로 남는다 — PRODUCT-BRIEF §6.)`
- `TODO(open-question: 보존/감쇠(decay) — 빠르게 움직이는 TTT 분야가 변함에 따라 confidence가 시간에 따라
  감쇠하여 재검증을 촉발해야 하는가?)`
- `TODO(open-question: CAW-01/CAW-02 어댑터가 공유 status 어휘를 요구하는가, 아니면 익스포트 어댑터 경계에서
  매핑하는가?)`

## 런북에 대한 함의(Implications for runbooks)

- **스키마 런북:** `Hypothesis`, `Claim`, `Evidence`를 id 상호참조를 가진 **세 개의 별개 레코드 타입**으로 정의한다;
  `status` 필수 + 기본 `hypothesis` 강제; `confidence ≤ evidence_strength` 상한 강제.
- **수명주기 런북:** 추가 전용 `status_log` 구현; 유일한 증거가 `evidence_kind=generated`인 `supported`/`refuted`를
  **거부**하는 검증기를 구현.
- **ExperimentScout 런북:** 가설 생성 시 `status=hypothesis`, `confidence=very-low` 설정, `derived_from_claims`
  채우기; `falsifiability` 필드 요구 또는 `TODO` 방출.
- **원장 통합 런북:** 원장 `verdict`(실패 포함)는 `Evidence` 레코드를 생성하고 `StatusEvent`를 제안한다;
  실패는 `refuted`/`inconclusive`로 매핑되며, 결코 조용히 누락되지 않는다.
- **익스포트 어댑터 런북(CAW-01/CAW-02):** `status`+`confidence`+증거를 인라인으로 지닌다; 맨 가설을 지식으로
  익스포트하는 것을 차단; 익스포트되는 모든 `supported` 항목을 `provisional`로 태깅.
- **렌더링/CLI 런북:** `Hypothesis`의 인간/에이전트 대면 렌더링은 반드시 status + confidence를 표시해야 한다(MUST);
  가설 진술을 맨 주장(bare assertion)으로 출력하는 템플릿을 금지한다.

## 출처(Sources)

- [Fact or Fiction: Verifying Scientific Claims (arXiv:2004.14974)](https://arxiv.org/pdf/2004.14974) — SUPPORTS / REFUTES / NOINFO 주장-상태 패턴.
- [Survey of Provenance, Assertion and Evidence Ontologies (PMC12376154)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12376154/) — assertion / evidence / provenance 분리.
- [SEE: structured representation of scientific evidence (PMC4108886)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4108886/) — RDO: claims, provenance, argumentative relations.
- [IPCC Guidance Note on Consistent Treatment of Uncertainties](https://www.ipcc.ch/site/assets/uploads/2018/03/inf09_p32_draft_Guidance_notes_LA_Consistent_Treatment_of_Uncertainties.pdf) — confidence (evidence × agreement) + likelihood 2-메트릭 보정 언어.
- [Test-Time Training Done Right (arXiv:2505.23884)](https://arxiv.org/abs/2505.23884) — 추론 중 TTT 갱신("fast weights").
- [Self-Improvement of LLMs: Technical Overview (arXiv:2603.25681)](https://arxiv.org/pdf/2603.25681) — TTT 대 test-time scaling 구분.

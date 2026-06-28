# ADR-0002: Hypothesis 표현 & 불확실성 — 분리된 세 계층 + 가역적 status 생명주기

- **Status:** proposed (load-bearing)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0001-product-surface-and-scout_ko.md](ADR-0001-product-surface-and-scout_ko.md) (렌더/제안하는 표면들)
  - [ADR-0003-experiment-ledger_ko.md](ADR-0003-experiment-ledger_ko.md) (verdict가 status 전이를 공급)
  - [ADR-0004-writeback-traffic-schema_ko.md](ADR-0004-writeback-traffic-schema_ko.md) (export가 status/불확실성을 운반)
  - [../02-research/hypothesis-representation.md](../02-research/hypothesis-representation_ko.md) (이 ADR을 뒷받침하는 연구)
  - [../02-research/source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion_ko.md) (`CandidateClaim`을 생산)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
**CAW-06이 불확실한 미래-AI / TTT hypothesis를 오버클레임 없이 어떻게 표현하는가**를 결정한다: 분리된 세 가지 레코드
종류, 네 상태 **status 생명주기**(`hypothesis` / `supported` / `refuted` / `inconclusive`), **confidence와
불확실성**의 기록 방식, **evidence** 연결 방식, 그리고 **hypothesis는 결코 확정된 claim으로 렌더되거나 export되지
않는다**는 강한 규칙. 이것은 ExperimentScout 파이프라인(ADR-0001), ledger(ADR-0003), 그리고 모든
export(ADR-0004, CAW-01/CAW-02)가 반드시 준수해야 하는 계약이다. 이 ADR은 claim 추출(수집 문서), ledger
스키마(ADR-0003 — 이 ADR은 그 `verdict`를 소비만 함), 또는 저장 직렬화는 정의하지 **않는다**.

## Context
- **이것이 load-bearing 결정이다.** brief의 가드레일은 명시적이다: *source, claim, evidence, 그리고 생성된 결론을
  분리하라; 생성된 요약은 evidence가 아니다; hypothesis는 결코 확정된 claim으로 제시되지 않는다* (§12);
  hypothesis는 명시적 status/불확실성과 evidence 링크를 운반한다(§5). 표현 자체가 강제 메커니즘이다 — 만약 모델이
  "어떤 논문이 X라고 말한다", "우리가 hypothesis Y를 생성했다", "우리의 토이 실험이 Y를 지지한다"를 구조적으로
  구분하지 못하면, 오버클레임이 CAW-01과 CAW-02로의 export로 새어 나간다.
- **이 분야는 변동성이 크고 핵심 주장 자체가 미검증이다.** 어떤 TTT 변형이 실제로 *write back* 하는지는 미해결이다
  (§6; [ttt-landscape.md](../02-research/ttt-landscape_ko.md)는 대부분의 셀을 *uncertain*으로 표시). 따라서
  메모리-writeback 주장은 **추적되는 `Hypothesis`여야지 전제가 아니다** — "TTT는 write back 한다"를 사실로 박아넣는
  것은 CAW-01 브리지(ADR-0004)를 오염시킨다.
- **스카우팅은 제안하고, Jimmy가 판결한다** (§12). `supported`로의 승격과 export는 human-gated다(ADR-0001 §4);
  표현은 판결되지 않은 상태를 구조적 기본값으로 만들어야 한다.
- 형태에 대한 선행 연구: claim 검증(`SUPPORTS/REFUTES/NOINFO`), assertion/evidence/provenance 온톨로지, 그리고
  IPCC 2-지표(confidence = evidence × agreement, 추가로 선택적 likelihood)의 보정된 언어 — 연구 문서의 Sources
  참조.

## Options considered

### A. 레코드 구조
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **세 개의 분리되고 개별 주소지정 가능한 레코드 종류 — `Claim`, `Hypothesis`, `Evidence` — id로 교차참조** | brief §12 분리를 구조적으로 강제; source 단언이 조용히 "우리 결론"이 될 수 없음; evidence가 일급(first-class)이며 타입드 | 세 스키마 + id 위생 | **Chosen** |
| confidence 필드를 가진 하나의 "fact" 레코드 | 단순 | source-says / we-propose / we-observed를 하나의 덩어리로 붕괴 → brief가 금하는 바로 그 오버클레임 | Rejected |
| Claim + hypothesis 병합; evidence 인라인 | 조인 적음 | `generated` 요약이 실험 결과 옆에 인라인되어 "요약을 evidence로" 유발 | Rejected |

### B. Status 모델
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **네 개의 가역적 status(`hypothesis`/`supported`/`refuted`/`inconclusive`), 기본값+바닥 `hypothesis`, append-only `status_log`로 구동** | brief의 어휘와 정확히 일치(§5); `supported`/`refuted`는 비종단이며 결코 "증명됨"이 아님; 번복 + 실패가 감사 가능 | "현재 = 최신 이벤트" 해석기 필요 | **Chosen** |
| Boolean verified/unverified | 사소 | `inconclusive`나 부정적 결과의 여지 없음; 분야의 뉘앙스와 failures-useful 의무를 잃음 | Rejected |
| 자유 텍스트 status | 유연 | 질의 불가; 작성자가 "confirmed"라고 타이핑 가능 — 산문에 의한 오버클레임 | Rejected |

### C. 불확실성 인코딩
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **정성적 보정 enum: `evidence_strength` × `agreement`에서 유도된 `confidence`, 정량화된 경우에만 선택적 `likelihood`; `confidence`는 `evidence_strength`로 상한** | 거짓 정밀도 회피; 상한이 "설득력 있는 산문, evidence 없음"을 구조적으로 `very-low`로; DOC-CONVENTIONS "숫자를 지어내지 말라"와 일치 | enum은 보정 테이블 필요 | **Chosen** |
| 수치 0–1 confidence | 정렬 가능 | 벤치마크 없는 분야에서 지어낸 정밀도 유발; conventions §3 위반 | Rejected (애드온으로 재검토) |
| confidence 없음, status만 | 최소 | "운 좋은 한 seed"와 "재현됨"을 구분 불가; export 소비자는 강도 필요 | Rejected |

## Decision
**분리된 세 레코드 종류; `hypothesis`로 기본값을 갖는 네 상태 가역적 status 생명주기; 강한 evidence 상한을 가진
보정된 정성적 불확실성; status/불확실성이 벗겨진 채로 경계를 넘는 것은 아무것도 없다.**

1. **세 계층, 절대 병합 안 함.**

   | Layer | Record | Truth status | Origin |
   |---|---|---|---|
   | `Claim` | *source가 단언하는 것*("<source>가 …라고 주장한다"로 렌더, 절대 "…는 사실이다"가 아님) | 공개 연구에서 추출 | 수집 S4 |
   | `Hypothesis` | *우리가 검증하려고 제안하는 것* — 항상 잠정적 | ExperimentScout가 생성 | hypothesis 단계 |
   | `Evidence` | hypothesis에 영향을 주는 관찰; `evidence_kind ∈ {experiment, external, generated}` | ledger 결과 OR 인용 OR 생성 텍스트 | ledger / 수집 |

2. **강한 규칙(validator 강제).**
   - `Hypothesis`는 **`status` 없이는 절대 직렬화되지 않는다**; 기본값과 바닥은 `hypothesis`다. evidence 없음 ⇒
     `hypothesis` 외에는 될 수 없다.
   - **`generated` evidence는 단독으로는 결코 status를 `supported`나 `refuted`로 이동시킬 수 없다**(생성된 요약은
     evidence가 아니다, §12). 그것은 `inconclusive`만 알릴 수 있다.
   - `Claim`은 `asserted_by` provenance를 운반한다; source claim을 우리 결론으로 재진술하는 것은 금지된다.
   - export는 `status` + `confidence` + evidence 링크를 **인라인으로** 운반한다; 불확실성이 벗겨진 채로 제품
     경계를 넘는 것은 아무것도 없다.

3. **Status 생명주기(append-only `status_log`; 현재 = 최신 이벤트).**

   | Status | Entry condition | May export as |
   |---|---|---|
   | `hypothesis` | 생성 시 기본값 | CAW-01 open question / 제안만 |
   | `supported` | 기준선 이상의 `experiment`/`external` evidence ≥1개, 지지함 | "supported (provisional)" claim+evidence → CAW-02 |
   | `refuted` | 기준선 이상의 반증 evidence ≥1개 | 부정적 결과(일급) → CAW-02 |
   | `inconclusive` | 실행했으나 verdict 모호, 또는 상충하는 evidence | open question + 기록된 시도 |

   - 모든 전이는 `StatusEvent`(`ts`, `from→to`, 트리거한 `evidence` id들, `by`)를 기록한다. 로그는 append-only;
     생명주기는 감사 가능하며 번복은 예외가 아니라 예상된다.
   - `supported`와 `refuted`는 **절대 종단이 아니며** 증명됨/반증됨을 의미하지 않는다 — 오직 "현재 evidence가 이쪽으로
     기운다"일 뿐이다. 새로운/모순되는 evidence는 어떤 상태든 재개방한다.
   - **Jimmy가 검토자다** — 전략적 승격에서; 파이프라인은 `→ supported`를 제안하고, 어떤 `supported` export 전에
     사람이 확정한다(ADR-0001 §4; brief §12).

4. **Confidence & 불확실성 필드.**
   - `confidence ∈ {very-low … very-high}`는 `evidence_strength ∈ {none, weak, moderate, strong}` ×
     `agreement ∈ {conflicting, mixed, consistent}`에서 유도; 기본값 `very-low`.
   - **상한:** `confidence`는 산문과 무관하게 `evidence_strength`로 제한된다(`none → very-low`, `weak → low`).
     `generated` evidence만으로 뒷받침된 hypothesis는 `very-low`에 고정된다.
   - `likelihood`는 **선택적이며 정량화되지 않으면 생략된다** — 비어 있음 ≠ "거의 반반"; 절대 지어내지 말 것.
   - `falsifiability`(그것을 반증할 관찰)는 **`hypothesis`를 떠나려면 필수**다; 누락 ⇒ `TODO`이지 `supported`
     후보가 아니다.
   - `reproducibility ∈ {unrun, single-run, replicated, failed-to-reproduce}`는 ledger 항목(ADR-0003)에 연결된다.

5. **경계 동작.** `hypothesis` status 항목은 CAW-01로 미래-워크로드 **open question**으로만 export된다(`confidence`
   + `falsifiability` 운반); 오직 `supported` 항목만 후보 워크로드 입력으로 export되며, 여전히 `provisional`로
   플래그된다. CAW-02로는 `status ∈ {supported, refuted, inconclusive}`일 때만 `Claim`+`Evidence`를 export한다 —
   맨 hypothesis는 게이트가 거부한다. CAW-05 import은 `status=hypothesis`, `confidence=very-low`로 `Hypothesis`를
   열고, 신호는 `external` evidence로 기록된다 — 절대 자동 승격되지 않는다.

## Consequences
- **쉬움:** 어떤 렌더러/export든 "status + confidence + evidence가 무엇인가?"를 물어 구조적으로 정직한 답을 얻을 수
  있다; 에이전트는 문자 그대로 hypothesis를 fact로 직렬화하거나, 생성 텍스트로 승격하거나, 맨 채로 export할 수 없다.
- **쉬움:** 부정적 결과가 거처(`refuted`/`inconclusive`)를 가지며 export 가능한 지식이 되어, ADR-0003과 함께
  failures-useful 의무를 처음부터 끝까지 충족한다.
- **어려움 / 비용:** 세 레코드 종류 + id 교차참조 그리고 append-only 로그 위의 "현재 status" 해석기; 모든 표면과
  export 어댑터가 status/confidence를 관통시켜야 한다(지름길 렌더링 없음).
- **후속:** ADR-0003의 `verdict`는 `Evidence` 레코드 + 제안된 `StatusEvent`로 매핑된다(실패 →
  `refuted`/`inconclusive`, 절대 폐기 안 됨); ADR-0004와 CAW-02 어댑터는 인라인 불확실성을 운반한다; ADR-0001
  표면은 "모든 hypothesis 카드에 status + confidence 표시"를 강제한다. Runbook: (1) 세 레코드 스키마 +
  상한/바닥 validator; (2) append-only 생명주기 + `generated`-는-승격-불가 validator; (3) 스카우트-생성 기본값
  (`status=hypothesis`, `confidence=very-low`, `falsifiability` 또는 `TODO` 요구); (4) ledger→evidence→status
  통합; (5) 불확실성을 인라인으로 운반하는 export 어댑터.

## Open questions / revisit triggers
- TODO(open-question: 다운스트림 랭킹을 위해 enum과 나란히 수치 confidence(0–1)가 필요한가, 아니면 그것이 거짓
  정밀도를 유발하는가?) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: "N개의 독립 실험으로 지지됨"이 confidence를 게이팅하는 구조화된 카운터여야 하는가, 아니면
  검토자 판단인가?)
- TODO(open-question: *부분적으로* 지지된 hypothesis를 어떻게 표현하는가 — sub-hypothesis로 분할, 아니면 `scope`
  한정자 추가?)
- TODO(open-question: 빠르게 움직이는 TTT 분야가 변하면서 시간에 따른 confidence 감쇠, 재검증을 트리거?)
- TODO(open-question: CAW-01/CAW-02가 공유 status 어휘를 요구하는가, 아니면 export 어댑터 경계에서 매핑하는가?
  경향: 어댑터에서 매핑 — 공유 레지스트리 없음.)
- **Revisit trigger:** 어떤 파이프라인 경로가 `generated` evidence로 승격해야 하거나, status/confidence 없이
  hypothesis를 렌더해야 한다면, 멈춰라 — 그것은 기능 요청이 아니라 load-bearing 불변식이 깨지는 것이다.

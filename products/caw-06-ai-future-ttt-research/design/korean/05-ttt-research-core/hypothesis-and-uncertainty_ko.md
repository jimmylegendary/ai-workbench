# Hypothesis & Uncertainty — 과대주장 방지 계약

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./overview.md](./overview_ko.md) (코어가 무엇인지)
  - [./experiment-scout-pipeline.md](./experiment-scout-pipeline_ko.md) (어느 단계가 이 레코드를 생성/전이하는지)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (load-bearing 결정)
  - [../02-research/hypothesis-representation.md](../02-research/hypothesis-representation_ko.md) (연구 근거 + 캘리브레이션)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (verdict → evidence → status)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (익스포트는 uncertainty를 인라인으로 운반)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 코어의 **과대주장 방지 계약**이다: **세 가지로 분리된 레코드 종류**(`Source`/`Claim`,
`Hypothesis`, `Evidence`), **네 상태의 가역적(reversible) status 라이프사이클**, **캘리브레이션된 정성적
uncertainty** 필드, 그리고 **하드 evidence cap**(생성된 증거는 결코 status를 승격시킬 수 없음). 이것은 모든
단계(파이프라인 문서), 원장(ADR-0003), 모든 익스포트(ADR-0008, CAW-01/CAW-02)가 지켜야 하는(MUST) 계약이다.
`05-` 그룹을 위해 ADR-0002를 재서술하고 상호 링크한다; ADR과
[../02-research/hypothesis-representation.md](../02-research/hypothesis-representation_ko.md)이 전체 옵션,
스키마, 캘리브레이션 표를 담고 있다 — 이 문서는 그것들을 재정의하지 않는다.

## 1. 왜 이것이 load-bearing인가

`Hypothesis`는 **결코 확정된 주장이 아니다**(brief §12). 표현 그 자체가 강제다: 모델이 "한 논문이 X라고
말한다", "우리가 Y를 검증하기로 제안한다", "우리 toy 실험이 Y를 뒷받침한다"를 구조적으로 구별하지 못하면,
과대주장이 CAW-01과 CAW-02로 가는 익스포트로 새어 든다. 이 분야는 변동성이 크다 — 어떤 TTT 변형이 실제로
*write back* 하는지조차 미검증이다 — 따라서 핵심 writeback 주장조차 **추적되는 `Hypothesis`이지 전제가
아니다**(brief §6). "TTT가 write back 한다"를 사실로 내장하면 CAW-01 브리지를 오염시킬 것이다.

## 2. 세 가지로 분리된 레코드 종류(절대 병합되지 않음)

id로 상호 참조되는, 별도로 주소 지정 가능한 세 레코드. 이들은 결코 하나의 "fact" 덩어리로 합쳐지지 않는다.

| 계층 | 레코드 | 진리 상태(어떻게 렌더되는지) | 출처 |
|---|---|---|---|
| Source claim | `Claim` | *source가 단언하는 것* — "<source> claims …", 결코 "it is true that …"가 아님 | ingestion S4 |
| Hypothesis | `Hypothesis` | *우리가 검증하기로 제안하는 것* — 항상 잠정적 | hypothesis 단계 |
| Evidence | `Evidence` | hypothesis에 영향을 주는 관찰; `evidence_kind ∈ {experiment, external, generated}` | 원장 / 인용 / 생성된 텍스트 |

### 하드 규칙(validator가 강제)

1. `Hypothesis`는 **`status` 없이는 결코 직렬화되지 않는다**; 기본값이자 바닥(floor)은 `hypothesis`다. 증거가
   없으면 ⇒ `hypothesis` 외의 어떤 것도 될 수 없다.
2. **`generated` 증거는 단독으로 결코 status를 `supported`나 `refuted`로 옮길 수 없다** — 생성된 요약은
   증거가 아니다(§12). 그것은 오직 `inconclusive`만 알릴 수 있다.
3. `Claim`은 `asserted_by` provenance를 지닌다; source claim을 우리 결론으로 재진술하는 것은 금지다.
4. 익스포트는 `status` + `confidence` + evidence 링크를 **인라인으로** 운반한다; 어떤 것도 uncertainty를
   벗긴 채 제품 경계를 넘지 않는다.

## 3. 네 상태의 가역적 라이프사이클

Status는 영구 라벨이 아니라 *현재 증거*의 속성이다. `supported`/`refuted`는 **결코 종단(terminal)이 아니며**
proven/disproven을 의미하지 않는다 — 오직 "현재 증거가 이쪽으로 기운다"일 뿐이다. 어떤 상태든 새 증거로 다시
열린다.

| Status | 진입 조건 | 익스포트 가능 형태 |
|---|---|---|
| `hypothesis` | 생성 시 기본값 | CAW-01 open question / 제안만 |
| `supported` | 기준 이상의 `experiment`/`external` 증거 ≥1개, 지지하는 | "supported (provisional)" claim+evidence → CAW-02 |
| `refuted` | 기준 이상의 반증 증거 ≥1개 | 부정적 결과(일급) → CAW-02 |
| `inconclusive` | 실행됐으나 verdict 모호, 또는 상충하는 증거 | open question + 로깅된 시도 |

```
                    ┌───────────────────────────────────────┐
                    v                                         │
   (create) ──► hypothesis ──experiment/external──► supported ┤
                    │  ▲                                       │ new disconfirming
                    │  │ re-opened by new/contradicting        │ evidence
                    │  │ evidence (every transition reversible) v
                    │  └───────────────────────────── refuted ─┘
                    │
                    └── ran, weak/mixed/null ─► inconclusive ──► (re-test) ─► hypothesis
```

**전이 규칙.**
- 모든 전이는 append-only `StatusEvent`(`ts`, `from→to`, 촉발한 `evidence` id, `by`)를 쓴다; 현재 status =
  최신 이벤트. 반전(reversal)과 실패는 감사 가능하고 예상되며 예외적이지 않다.
- 오직 `experiment`/`external` 증거(`generated`는 절대 아님)만 `→ supported` / `→ refuted`를 구동할 수
  있다(규칙 2).
- 파이프라인은 `→ supported`를 **제안**한다; 어떤 `supported` 익스포트 전에 **Jimmy가 확인**한다(brief §12;
  ADR-0001 §4). 스카우팅은 가설 생성이지 판정(adjudication)이 아니다.
- **실패는 유용하다:** 원장 실패는 `refuted`/`inconclusive` + `Evidence` 레코드로 매핑된다 — 결코 조용히
  버려지지 않는다(ADR-0003; brief §5). 부정적 결과는 익스포트 가능한 지식이다.

## 4. 캘리브레이션된 정성적 uncertainty + 하드 cap

우리는 **status**(증거가 어느 쪽으로 기우는지)와 **confidence**(얼마나 강하게)를 분리하며, 거짓 정밀도를
피하기 위해 기본적으로 정성적 캘리브레이션 enum을 사용한다(IPCC 2-지표 패턴; 연구 문서 참조).

| 필드 | 값 | 비고 |
|---|---|---|
| `confidence` | `very-low … very-high` | `evidence_strength` × `agreement`에서 도출; 기본 `very-low` |
| `evidence_strength` | `none` \| `weak` \| `moderate` \| `strong` | **`generated`가 아닌** 증거의 품질+양 |
| `agreement` | `conflicting` \| `mixed` \| `consistent` | 증거 항목 전반 |
| `likelihood` | 선택적 `unlikely … very-likely` | **정량화된 경우에만**; 아니면 생략 — 빈 값 ≠ "as likely as not" |
| `falsifiability` | markdown | 그것을 반증할 관찰 — **`hypothesis`를 떠나려면 필수** |
| `reproducibility` | `unrun` \| `single-run` \| `replicated` \| `failed-to-reproduce` | 원장 항목으로 링크 |

**하드 cap(load-bearing).** `confidence`는 **`evidence_strength`에 의해 상한이 정해진다**: `none → very-low`,
`weak → low`, 산문이 아무리 설득력 있어 보여도 그렇다. `generated` 증거로만 뒷받침되는 hypothesis는
`very-low`에 고정된다. `likelihood`는 추측되지 않고 생략된다(DOC-CONVENTIONS §3 — 미지는 `TODO`이지 결코
조작된 수치가 아님). `falsifiability`가 빠진 hypothesis는 `TODO`이지 `supported` 후보가 아니다.

### 캘리브레이션(실제 예시)

| 상황 | status | evidence_strength | confidence | 이유 |
|---|---|---|---|---|
| Scout가 2개 claim에서 hypothesis 생성, 실행한 것 없음 | `hypothesis` | `weak` | `very-low` | generated 전용; cap 적용 |
| toy 재현이 0이 아닌 writeback 보임, 1회 실행 | `supported` | `moderate` | `low` | 단일 실험; `reproducibility=single-run` |
| 두 toy run이 불일치 | `inconclusive` | `weak` | `very-low` | `agreement=conflicting` |
| 재현이 그 변형에 대해 ~0 write traffic 보임 | `refuted` | `moderate` | `medium` | 반증, falsifiability와 일치 |
| LLM 요약 "TTT가 메모리를 지배함을 강력히 시사" 만 | `hypothesis` | `none` | `very-low` | generated ≠ 증거(규칙 2) |

## 5. 레코드 형태(예시 — 빌더가 스키마를 작성)

```jsonc
{
  "id": "HYP-2026-0007", "kind": "Hypothesis",
  "statement": "TTT-class inference (weight/state writeback during serving) produces a write-traffic profile not captured by read-dominant LLM-serving memory assumptions.",
  "theme": "ttt-writeback",
  "status": "hypothesis",                 // hypothesis | supported | refuted | inconclusive — required, floor=hypothesis
  "confidence": "very-low", "evidence_strength": "none", "agreement": "mixed",
  "likelihood": null,                     // omit unless quantified — do NOT invent
  "falsifiability": "A measured TTT variant shows write bytes/token ≈ 0 vs. baseline ⇒ refuted.",
  "reproducibility": "unrun",
  "derived_from_claims": ["CLM-2026-0031", "CLM-2026-0042"],
  "evidence": [],                         // Evidence ids
  "status_log": [{"ts": "TODO", "from": null, "to": "hypothesis", "by": "ExperimentScout", "evidence": []}],
  "boundary": {"exports_to": ["CAW-01:open-question"], "imports_from": ["CAW-05:signal-9921"]},
  "provenance": {"created_by": "ExperimentScout", "created_at": "TODO", "review_state": "unreviewed"}
}
```

```jsonc
{
  "id": "EVD-2026-0118", "kind": "Evidence",
  "evidence_kind": "experiment",          // experiment | external | generated
  "supports": "HYP-2026-0007",
  "direction": "supporting",              // supporting | disconfirming | neutral
  "strength": "moderate",
  "ledger_ref": "EXP-2026-0044",          // set for evidence_kind=experiment (incl. failures)
  "source_ref": null,                     // set for evidence_kind=external (citation)
  "note": "Toy reproduction measured non-zero write bytes/token under TTT update; single run."
}
```

## 6. 경계 동작(익스포트, 결코 공유 저장소 아님)

- **CAW-01로(별개 제품):** `hypothesis` 상태 항목은 `confidence` + `falsifiability`를 지닌 미래 워크로드
  **open question**으로만 익스포트된다. 오직 `supported` 항목만 후보 워크로드 입력으로 익스포트되며, 여전히
  `provisional`로 플래그된다. `wbtraffic` 번들은 파일/API 핸드오프를 넘어 **CAW-01의 기존 L0 객체 위로
  lowering** 된다 — 공유 저장소 없음(ADR-0004, ADR-0008).
- **CAW-02로(별개 제품):** `status ∈ {supported, refuted, inconclusive}`일 때만 `Claim` + 링크된
  `Evidence`를 익스포트; status + confidence가 인라인으로 이동. **맨 hypothesis는 gate에서 거부된다.**
- **CAW-05에서(별개 제품):** 가져온 TTT 신호는 `status=hypothesis`, `confidence=very-low`로 `Hypothesis`를
  열고, 신호는 `external` 증거로 기록된다 — 결코 자동 승격되지 않음.

## Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

- `TODO(open-question: numeric confidence (0–1) alongside the enum for ranking, or does that invite false precision?)`
- `TODO(open-question: "supported by N independent experiments" as a structured counter gating confidence vs reviewer judgement?)`
- `TODO(open-question: represent a partially-supported hypothesis — split into sub-hypotheses or add a scope qualifier?)`
- `TODO(open-question: confidence decay over time as the fast-moving TTT field shifts, triggering re-test?)`
- `TODO(open-question: do CAW-01/CAW-02 require a shared status vocabulary, or map at the export adapter boundary? lean: map at adapter — no shared registry.)`

## 런북에의 함의

- **Schema 런북:** id 상호 참조를 가진 세 개의 분리된 레코드 타입; `status` 필수, 기본 `hypothesis`;
  `confidence ≤ evidence_strength` cap 강제.
- **Lifecycle 런북:** append-only `status_log`; 유일한 증거가 `evidence_kind=generated`인 `supported`/`refuted`를
  **거부**하는 validator.
- **Scout 런북:** `status=hypothesis`, `confidence=very-low`로 생성; `falsifiability` 요구 또는 `TODO` 방출.
- **Ledger 통합 런북:** verdict(실패 포함)는 `Evidence` 생성 + `StatusEvent` 제안.
- **Export adapter 런북:** status+confidence+evidence를 인라인으로 운반; 맨 hypothesis 익스포트 차단;
  `supported` 익스포트는 `provisional` 태그.
- **재방문 트리거(Revisit trigger):** `generated` 증거로 승격하려는 경로, 또는 status/confidence 없이
  hypothesis를 렌더하려는 경로는 load-bearing 불변식이 깨지는 것이다 — 멈춰라, 기능 요청이 아니다.

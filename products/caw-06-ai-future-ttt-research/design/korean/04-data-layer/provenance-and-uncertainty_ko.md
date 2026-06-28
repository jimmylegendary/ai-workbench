# Provenance & Uncertainty — status 생애주기, evidence cap, generated-not-evidence, export 전달

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [data-model_ko.md](data-model_ko.md) (이 규칙이 적용되는 엔티티와 공유 envelope)
  - [storage-and-scheduling_ko.md](storage-and-scheduling_ko.md) (append-only `status_log`, supersede, review gate)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (이것이 구현하는 하중을 받치는 결정)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (verdict → evidence + status event)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (modeled vs measured; uncertainty inline)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (target별 gate가 status/uncertainty를 운반)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **과대주장하지 않기(not overclaiming)의 데이터 계층 메커니즘**을 고정한다: provenance를 어떻게 기록하는지, 네 상태의 가역적 status 생애주기, hard evidence cap을 가진 보정된 정성적 uncertainty 필드, **generated 콘텐츠는 결코 evidence가 아니며 결코 status를 승격시키지 않는다**는 규칙, **hypothesis는 확정된 claim이 아니다**와 **generated 요약은 evidence가 아니다**라는 명시적 표시, 그리고 어떤 것도 그것이 벗겨진 채 경계를 넘지 않도록 **export가 status/uncertainty를 인라인으로 운반하는** 방식이다. 이 문서는 데이터 계층에서 ADR-0002를 구현한다. 표현(ADR-0002가 소유)이나 저장 레이아웃(see [storage-and-scheduling_ko.md](storage-and-scheduling_ko.md))을 다시 결정하지는 **않는다**. 이것은 제품의 하중을 받치는 불변식이다: 모델이 *"논문이 X라고 말한다"*, *"우리가 Y를 제안한다"*, *"우리의 toy run이 Y를 뒷받침한다"*를 구조적으로 구별하지 못하면, 과대주장이 CAW-01/CAW-02 export로 새어 들어간다.

## 1. Provenance — 세 분리 계층, 결코 병합되지 않음
brief의 가드레일(§12): source, claim, evidence, generated 결론을 **분리** 유지한다. 데이터 계층은 별도로 주소 지정 가능한 세 레코드 종류 더하기 유형화된 `Evidence` 참조로 이를 시행한다.

| Layer | Record | Provenance field | 말할 수 있는 것 |
|---|---|---|---|
| source 주장 | `Claim` | `asserted_by: SRC-NNNN` + `evidence_span` + `source_locator` | "<source>가 X를 주장" — 결코 "X는 참" 아님 |
| 우리의 제안 | `Hypothesis` | `from_claims: [...]`, `origin: generated` | "우리가 X를 확인하려고 제안" — 항상 잠정적 |
| 관찰 | `Evidence` | `evidence_kind ∈ {experiment, external, generated}` | 하나의 hypothesis에 영향; 출처별로 유형화 |

```yaml
# Evidence reference (embedded under Hypothesis / produced by a Result)
evidence_id: EVID-0009
evidence_kind: experiment|external|generated   # experiment = ledger Result; external = citation; generated = LLM text
evidence: true|false                # generated text is ALWAYS evidence:false
supports: true|false                # direction (for experiment/external only)
ref: EXP-0007 | SRC-0001            # resolves to a Result or a Source — never to a summary string
```

`TODO(open-question: is `Evidence` a top-level store dir or embedded under Hypothesis/Result? — data-model_ko.md §OQ)`.

## 2. status 생애주기 (네 상태, 가역적, append-only)
기본값이자 **하한**은 `hypothesis`다. 현재 status = append-only `status_log`의 최신 이벤트. `supported`/`refuted`는 **결코 종착(terminal)이 아니며** 입증/반증을 의미하지 않는다 — 오직 "현재 증거가 이쪽으로 기운다"일 뿐이다(ADR-0002 §3).

| Status | 진입 조건 | export 가능 형태 |
|---|---|---|
| `hypothesis` | 생성 시 기본값; 증거 없음 ⇒ 다른 것이 될 수 없음 | CAW-01 open question / 제안만 |
| `supported` | bar를 넘는 뒷받침 `experiment`/`external` evidence ≥1(인간 확인) | "supported (provisional)" claim+evidence → CAW-02 |
| `refuted` | bar를 넘는 반증 evidence ≥1 | negative result(first-class) → CAW-02 |
| `inconclusive` | 실행됐으나 verdict 모호, 또는 상충 증거 | open question + 기록된 시도 |

```yaml
# StatusEvent (append-only; never edited; current = latest)
status_log:
  - {ts: TODO, from: null,       to: hypothesis,  by: scout,  evidence_ids: []}
  - {ts: TODO, from: hypothesis, to: supported,   by: jimmy,  evidence_ids: [EVID-0009]}  # human-gated
```

Verdict → status 매핑(ADR-0003 → ADR-0002): 원장의 `Result.verdict`는 `Evidence` 레코드 + **제안된** `StatusEvent`가 된다. 실패는 정직하게 매핑된다 — `refuted`/`inconclusive`는 실제 status이고, `invalid`(setup 망가짐)는 `refuted`로 매핑되지 **않는다**. 번복은 예외가 아니라 예상되는 일이다. 새롭거나 모순되는 증거는 어떤 상태든 다시 연다.

## 3. uncertainty 필드 + hard evidence cap
정성적이고 보정된 enum — 벤치마크가 없는 필드에 발명된 수치 정밀도를 부여하지 않는다(DOC-CONVENTIONS §3).

```
confidence  ∈ {very-low, low, moderate, high, very-high}      # default very-low
            derived from:
evidence_strength ∈ {none, weak, moderate, strong}   ×   agreement ∈ {conflicting, mixed, consistent}
likelihood  : optional — OMITTED unless quantified (empty != "about as likely as not")
falsifiability : REQUIRED to leave `hypothesis` (else a TODO, not a `supported` candidate)
reproducibility ∈ {unrun, single-run, replicated, failed-to-reproduce}   # links ledger entries
```

**hard evidence cap (과대주장 방지 메커니즘):** `confidence`는, 산문이 아무리 설득력 있어도, `evidence_strength`에 의해 상한이 정해진다.

| evidence_strength | confidence cap |
|---|---|
| `none` | `very-low` |
| `weak` | `low` |
| `moderate` | `high` (no `very-high`) |
| `strong` | `very-high` |

**오직 `generated` evidence만으로 뒷받침되는** hypothesis는 `very-low`에 고정된다 — "설득력 있는 요약, run 없음"은 설득력 있는 것이 아니라 구조적으로 약한 것이다. 이 cap은 검증기로 시행되며, 작성자는 타이핑으로 이를 우회할 수 없다.

> Confidence 척도 주의: 이것은 ADR-0002의 5-value 척도다. `ImplicationMap`(ADR-0006)은 3-value 척도를 쓴다. `TODO(open-question: unify or map confidence scales at the boundary — ADR-0002 vs ADR-0006)`.

## 4. generated 콘텐츠는 결코 evidence가 아니며, hypothesis는 확정된 claim이 아니다
데이터 계층이 단지 문체상이 아니라 **기계 검사 가능하게(machine-checkable)** 만드는 두 가지 표시:

1. **Generated-not-evidence.** LLM이 생성한 어떤 텍스트든 — claim 패러프레이즈, hypothesis 진술, `ImplicationMap` `summary`, `wbtraffic` modeled 추정의 산문 — `evidence:false`를 운반한다. **`generated` evidence는 단독으로는 결코 status를 `supported`나 `refuted`로 옮길 수 없다**(`inconclusive`에만 정보를 줄 수 있음). 요약 문자열로 resolve되는 `evidence_ref`는 검증기가 거부한다(ADR-0006 §4).
2. **Hypothesis-not-settled.** `Hypothesis`는 **`status` 없이 결코 직렬화되지 않는다**. `supported`인 toy 결과는 *status 업데이트일 뿐 확정된 claim이 아니며* "supported (provisional)"로 렌더링된다. hypothesis에서 `status`/`confidence`를 떨어뜨리는 렌더러/export는 기능이 아니라 버그다(ADR-0002 재검토 트리거).
3. **Modeled-not-measured.** `WritebackTrafficSchema`에서 `basis: modeled`(분석적 L0 추정, ADR-0004)는 `basis: measured`(원장의 `writeback_observed` 숫자)와 뚜렷이 구별되어 표시된다. modeled 숫자는 *가정을 가진 검사 가능한 hypothesis*이지 실제 병목의 증거가 아니다. 수치는 `null`이 기본값이며, 중요한 `null`은 발명되는 것이 아니라 `TODO(open-question: …)`다(DOC-CONVENTIONS §3).

| 개념 쌍 | 정직한 표시 | 방지하는 오류 |
|---|---|---|
| source-says vs we-conclude | `Claim.asserted_by` / `Claim.status=unverified` | 논문을 우리의 발견으로 재진술 |
| hypothesis vs settled claim | `status` 필수; `supported` ⇒ "provisional" | 추측을 사실로 export |
| generated vs observed | 모든 generated 텍스트에 `evidence:false` | 요약을 evidence로 셈 |
| modeled vs measured | `basis: modeled\|measured`; 수치는 출처 전까지 `null` | 발명된 bandwidth 숫자 |

## 5. export가 status + uncertainty를 운반하는 방식
어떤 것도 그 uncertainty가 벗겨진 채 제품 경계를 넘지 않는다(ADR-0002 §5). `ExportAdapter` gate(ADR-0008 §3–§5)가 이를 **경계에서** 검사 가능하게 만든다:

| Target | bundle이 반드시 운반해야 하는 것 | gate가 거부하는 것 |
|---|---|---|
| **CAW-01** | `wbtraffic.v0` `fields` + `uncertainty.{status,confidence}` + first-class `open_questions[]`; `basis` modeled/measured | CAW-01의 IR에 대한 맨주장; 발명된 숫자 |
| **CAW-02** | `claim` + `status ∈ {supported, refuted, inconclusive}` + `confidence` + `evidence[]` + 명시적 `not_evidence[]` | `status: hypothesis` 항목; 요약만 있는 항목 |

status별 경계 동작:
- `hypothesis` status → CAW-01에는 오직 **미래 워크로드 open question**으로만(`confidence` + `falsifiability`를 운반); **결코** 워크로드 요구사항으로는 아님.
- `supported`(인간 확인) → CAW-01에는 후보 워크로드 축 입력으로, 여전히 `provisional` 표시; → CAW-02에는 "supported (provisional)" claim+evidence로.
- `refuted`/`inconclusive` → CAW-02에는 **first-class 음성 지식**으로(실패도 유용, brief §5). refuted된 write-back 축은 CAW-01의 "axis not observed" open question을 씨앗으로 줄 수 있다(`TODO(open-question: should refuted implications export to CAW-01 as explicit "axis not observed" signals?)`).
- CAW-05 import는 `status=hypothesis`, `confidence=very-low`로 `Hypothesis`를 연다. 신호는 `external` evidence로 기록되고 CAW-05 산문은 `evidence:false` — **결코 자동 승격되지 않는다**(ADR-0005 §6).

CAW-02 bundle의 `not_evidence[]` 목록은 source/summary 분리를 **경계에서 기계 검사 가능하게** 만든다 — generated 요약은 열거되지, 조용히 `evidence[]`에 섞이지 않는다(ADR-0008 §5).

## 6. 검증기 체크리스트 (데이터 계층에서 시행)
- [ ] `Hypothesis`를 운반하는 레코드는 `status` + `confidence` 없이 직렬화되지 않음.
- [ ] `confidence` ≤ `evidence_strength`가 함의하는 cap (§3).
- [ ] `generated` evidence가 `supported`/`refuted`의 단독 근거가 되지 않음.
- [ ] 모든 `evidence_ref`가 `Result`나 `Source`로 resolve됨 — 결코 요약 문자열이 아님.
- [ ] `Claim.asserted_by` 존재; 우리의 결론으로 재진술되지 않음.
- [ ] `wbtraffic` 수치는 `null`이거나 출처가 있음(modeled-with-assumptions / measured); 결코 발명되지 않음.
- [ ] export bundle은 `status` + `confidence`를 인라인으로 운반; CAW-02 gate는 맨 `hypothesis`를 거부.

## Open Questions
- Confidence 척도 통일(§3); `Evidence`를 top-level로 vs 임베드(§1); refuted→CAW-01 신호(§5).
- `TODO(open-question: confidence decay over time as the fast-moving TTT field shifts, triggering re-test?)` (ADR-0002).
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적됨.

## 런북에 대한 함의
- **RB (cap/floor 검증기):** §6 체크리스트 시행; 기본 `status=hypothesis`, `confidence=very-low`.
- **RB (status 생애주기):** append-only `status_log` writer + "current = latest" resolver; verdict → proposed StatusEvent.
- **RB (generated-can't-promote):** `generated`만 있는 evidence에 `supported`/`refuted`를 막는 검증기.
- **RB (export 전달):** 각 adapter가 `status`/`confidence`/`not_evidence[]`를 인라인으로 엮음; emit 전에 gate.

# 함의 매핑(Implication Mapping) — 도메인 전반의 `ImplicationMap` 모델

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./export-boundaries_ko.md](./export-boundaries_ko.md) (이것이 라우팅되어 들어가는 이음새)
  - [./ports-and-adapters_ko.md](./ports-and-adapters_ko.md) (ExportAdapter 포트)
  - [../01-decisions/ADR-0006-implication-mapping_ko.md](../01-decisions/ADR-0006-implication-mapping_ko.md) (결정 사항)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (함께 실리는 status/uncertainty)
  - [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (`evidence_refs`가 되는 결과)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (타깃별 게이트)
  - [../02-research/implication-mapping-and-export_ko.md](../02-research/implication-mapping-and-export_ko.md) (서술 + 근거)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **`ImplicationMap` 모델**을 명세한다 — 리서치 스레드(`source → claim →
hypothesis → small experiment → result → implication`)의 6단계에 해당한다. 모델의 형태, 고정된 도메인
어휘, 검증기(validator)가 강제하는 강한 규칙들, 그리고 맵이 어떻게 **라우팅 힌트(routing hint)**를(절대 export
자체가 아니라) 생성하는지를 정의한다. 이 문서는 hypothesis status 의미론(ADR-0002 참조), experiment ledger
(ADR-0003), 번들 형태나 게이트(see [./export-boundaries_ko.md](./export-boundaries_ko.md)), writeback 필드의
내부 물리(ADR-0004)를 **정의하지 않는다**. 또한 근거 조사(grounding survey)를 중복하지 않는다 — 그것은
[../02-research/implication-mapping-and-export_ko.md](../02-research/implication-mapping-and-export_ko.md) §3에 있다.

## 1. 함의 맵이란 무엇인가 (그리고 무엇이 아닌가)
**finding**(기록된 result, status가 바뀐 hypothesis, 또는 추출된 claim)은 고립되어서는 거의 의미를 갖지
않는다. 함의 맵은 **하나의 finding**을 여러 **도메인** 전반에 걸쳐 타입이 지정되고 불확실성 태그가 붙은
**결과에-대한-주장(claims-about-consequences)**으로 펼쳐내며, 각각은 자신의 스레드까지 거슬러 올라가는
출처(provenance)를 지닌다.

| 이다 | 아니다 |
|---|---|
| 하나의 finding에서 타입이 지정된 함의들의 팬아웃(fan-out) | 예측 엔진 |
| finding이 어떤 export에 자격이 있는지를 *결정하는* 라우팅 레이어 | export 자체 (그것은 ADR-0008) |
| `summary`가 명시적으로 **generated**로 표시된 아티팩트 | 증거 — summary는 **결코** `evidence_ref`가 아니다 |
| 불확실성을 지님 (각 함의는 자신의 `status`+`confidence`를 가짐) | hypothesis가 확정된 claim이 되는 자리 |

**무과장(No-overclaim) 규칙 (brief §12):** 모든 함의는 자신의 `status`와 `confidence`를 지닌다. 이 모델의
어떤 것도 hypothesis를 확정된 것으로 제시할 수 없으며, generated `summary`는 결코 증거로 인용될 수 없다.

## 2. 고정 도메인 어휘
여섯 개의 닫힌 도메인 (brief §3 use case 3). 새 도메인은 ADR 갱신을 요구한다 — 자유 텍스트는 라우팅
불가하고 검증 불가하므로 거부된다.

| Domain id | 범위 | 전형적인 export 타깃 |
|---|---|---|
| `ai-services` | TTT 추론의 서빙 / 제품 경제성 | CAW-02 (claim) |
| `education` | 사용자별 적응을 통한 튜터링 / 개인화 | CAW-02 (claim) |
| `dev-platforms` | 테스트 시점에 적응하는 툴링 / 에이전트 플랫폼 | CAW-02 (claim) |
| `models` | 아키텍처적 귀결 (fast-weights, LoRA-per-task) | CAW-02 (claim) |
| `hardware` | write traffic의 가속기 / HW 귀결 | CAW-01 (open question) + CAW-02 |
| `memory-centric-systems` | **주축(lead axis):** writeback bandwidth / endurance / residency | **CAW-01 (writeback schema)** |

CAW-01과 CAW-02는 **별개의 독립 제품**이다 — "target" 열은 라우팅 힌트일 뿐이며, 실제 게이트는
ExportAdapter([./export-boundaries_ko.md](./export-boundaries_ko.md) §4)에서 실행된다. 공유 저장소는 없다.

## 3. 모델 형태
finding당 하나의 `ImplicationMap`; 맵당 여러 개의 `implications`. CAW-06의 자체(OWN) 저장소(ADR-0007)에
JSON/markdown으로; 큰 아티팩트는 경로로.

```json
{
  "map_id": "im-2026-0007",
  "finding_ref": { "thread_id": "th-0007", "kind": "result", "ref_id": "EXP-0007#res-02" },
  "provenance": { "source_ids": ["arxiv:2411.07279"], "boundary": "internal" },
  "summary": "Per-task LoRA TTT writes back small adapter deltas per ARC task.",
  "summary_generated": true,
  "implications": [
    {
      "impl_id": "im-2026-0007-a",
      "domain": "memory-centric-systems",
      "statement": "Per-instance TTT creates a write-then-reuse pattern absent from read-dominant serving.",
      "status": "hypothesis",
      "confidence": "low",
      "evidence_refs": ["EXP-0007#res-02"],
      "writeback_payload_ref": "wb-0007-a",
      "export_targets": ["caw-01"]
    }
  ]
}
```

### 필드 레퍼런스
| Field | Type | 비고 |
|---|---|---|
| `map_id` | id | finding당 하나 |
| `finding_ref.kind` | `result \| hypothesis \| claim` | 6단계가 받아들이는 세 가지 finding 유형 |
| `finding_ref.ref_id` | id | ledger(ADR-0003) / hypothesis(ADR-0002) / claim(ADR-0005)으로 해석됨 |
| `provenance.boundary` | enum | 여기서는 `internal`; 번들이 빌드된 후에만 `export:caw-0x` |
| `summary` | string | 사람이 읽는 요지 |
| `summary_generated` | bool | summary가 모델이 작성한 것이면 **반드시 `true`**; 비증거임을 표시 |
| `implications[]` | array | 팬아웃 |

### 함의별 필드
| Field | Type | 규칙 |
|---|---|---|
| `impl_id` | id | 맵 내에서 유일 |
| `domain` | enum | 고정된 여섯 중 하나 (§2) |
| `statement` | string | 결과에-대한-주장 |
| `status` | `hypothesis \| supported \| refuted \| inconclusive` | ADR-0002와 동일한 어휘 |
| `confidence` | `low \| medium \| high` | status와 **독립적** |
| `evidence_refs[]` | id[] | ledger result(ADR-0003) 또는 추출된 claim(ADR-0005)으로 반드시 해석되어야 함 |
| `writeback_payload_ref` | id? | CAW-01로 향하는 함의에만 존재; `wbtraffic.v0` 아티팩트(ADR-0004)와 연결 |
| `export_targets[]` | enum[] | 라우팅 **힌트일 뿐** — 실제 게이트는 ADR-0008이 강제 |

## 4. 강한 규칙 (모델 + 검증기가 강제)
1. **`status`와 `confidence`는 독립적이다.** `supported` 함의도 여전히 `low` confidence일 수 있다
   (예: 단 하나의 toy reproduction); 어느 필드도 다른 필드를 함의하지 않는다.
2. **`evidence_refs`는 반드시 해석되어야 한다** — ledger result 또는 추출된 claim으로. 매달린(dangling)
   ref는 검증에 실패한다. `summary` 문자열은 **결코** 증거가 아니다 (`summary_generated: true`가 이를 명시).
3. **`status: hypothesis`가 기본값**이며, generated summary로는 끌어올릴 수 없다 — 오직 증거 해석
   (ADR-0003의 ledger verdict / 뒷받침하는 claim)으로만 가능하다.
4. **CAW-01을 향한 `memory-centric-systems` / `hardware` 함의**는 `writeback_payload_ref`를 지니거나,
   타입이 지정된 open question으로 표현되어야 한다(SHOULD) (CAW-01 게이트는 단언이 아니라 질문을
   받아들인다 — see [./export-boundaries_ko.md](./export-boundaries_ko.md) §4).
5. **게이트를 통과하는 함의만 번들 자격이 있다.** 맵은 절대 방출(emit)하지 않으며, `export_targets`를 통해
   자격만 표시한다. ADR-0008이 유일한 방출 이음새다.
6. **실패는 일급(first-class)이다.** `refuted` 또는 `inconclusive` 함의도 여전히 생성되고 여전히 매핑
   가능하다 — 반박된 write-back 축은 폐기 대상이 아니라 고가치의 "축이 관찰되지 않음" 신호다.

## 5. 라우팅 (맵 → 자격, 방출 아님)
맵은 `export_targets`를 힌트로 계산한다; ExportAdapter가 어떤 쓰기 전에든 실제 게이트를 재확인한다.

```
implication.domain ∈ {memory-centric-systems, hardware}
   AND (writeback_payload_ref present OR statement is a typed open question)   → hint caw-01
implication has ≥1 resolving evidence_ref AND status ≠ hypothesis             → hint caw-02
```

| Finding 결과 | 예시 함의 | 힌트 타깃 |
|---|---|---|
| reproduction `supported` | per-task LoRA가 ARC few-shot 개선 | caw-02 (claim) + caw-01 (writeback schema) |
| reproduction `refuted` | 변형이 weights를 쓰지 않고 KV만 씀 | caw-02 (부정적 지식); caw-01 "axis not observed" `TODO(open-question)` |
| `inconclusive` | toy 규모에서 traffic 미측정 | caw-02 (inconclusive) + caw-01 open question |
| 증거 없는 단순 `hypothesis` | 추측적 residency 비용 | **없음** — 설계상 양쪽 게이트를 모두 통과하지 못함 |

## 6. 근거는 검증 가능한 상태로 유지된다
도메인 어휘는 확정된 사실이 아니라 **재현 대상 소스로 보관된 실제 TTT 작업**에서 씨앗을 얻는다 —
예: `memory-centric-systems`의 정전적(canonical) write-back-per-task 예시로서 ARC 상의 per-task LoRA-TTT
(arXiv:2411.07279); residency/bandwidth에 대해서는 fast-weight / LaCT (arXiv:2505.23884). 벤더 및
2차 주장은 *검증할 claim*으로 들어오며, 결코 증거로 들어오지 않는다. 전체 조사:
[../02-research/implication-mapping-and-export_ko.md](../02-research/implication-mapping-and-export_ko.md) §3.
`TODO(open-question: which TTT variants actually write back weights vs. only update KV/state?)`

## Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적:
- `TODO(open-question: should refuted implications export to CAW-01 as explicit "axis not observed" signals, or stay only as CAW-02 negative knowledge?)`
- `TODO(open-question: do we need an implication-level priority score (e.g. blocks-a-future-workload-assumption) to rank export order?)`
- `TODO(open-question: can one implication legitimately target both CAW-01 and CAW-02 (hardware), and if so does it emit two bundles or one?)`
- `TODO(open-question: confidence is 3-value here vs ADR-0002's calibrated scale — reconcile or map at the boundary?)`

## 런북에 대한 함의
- `ImplicationMap` 모델 + 고정된 6-도메인 enum을 구축; 자유 텍스트 도메인은 거부.
- 검증기: `evidence_refs` 해석됨; 모델이 작성한 summary는 `summary_generated`가 강제로 true; `status`와
  `confidence` 독립적; `status: hypothesis`는 summary로 끌어올릴 수 없음.
- `export_targets` 힌트 계산; 여기서는 방출하지 **않음** — [./export-boundaries_ko.md](./export-boundaries_ko.md)로 라우팅.
- ADR-0007에 따라 맵을 CAW-06의 자체 저장소에 영속화 (`store/implications/`).

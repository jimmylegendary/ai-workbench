# ADR-0006: 도메인 전반의 implication-map 모델

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§3 유스케이스 3 도메인, §5 단계 6, §12 과대 주장 금지)
  - [../02-research/implication-mapping-and-export_ko.md](../02-research/implication-mapping-and-export_ko.md) (권위 있는 설계 서술)
  - [./ADR-0002-hypothesis-representation_ko.md](./ADR-0002-hypothesis-representation_ko.md) (맵이 담는 status/confidence)
  - [./ADR-0003-experiment-ledger_ko.md](./ADR-0003-experiment-ledger_ko.md) (`evidence_refs`가 되는 결과들)
  - [./ADR-0008-export-boundaries_ko.md](./ADR-0008-export-boundaries_ko.md) (맵이 라우팅되는 export 이음새)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

줄기의 6단계(brief §5)는 이렇게 묻는다: *어떤 발견(finding)이 성립한다면, 하류(downstream)에서 누가 관심을 가지며,
우리는 얼마나 확신하는가?* 기록된 결과, status가 변경된 hypothesis(ADR-0002), 또는 추출된 claim(ADR-0005)은
단독으로는 거의 의미가 없다. **implication map**은 하나의 발견을 **도메인** 전반에 걸쳐 타입이 지정되고 불확실성이
태깅된 implication들로 펼쳐내는 산출물(artifact)이며, 각각은 자신의 줄기로 되돌아가는 provenance를 지닌다. 또한 이는
어떤 export 번들(ADR-0008)이 될지를 결정하는 **라우팅 계층**이기도 하다.

힘(forces):
- **예측 엔진이 아니며, 증거도 아님(brief §12):** 각 implication은 자체 `status`와 `confidence`를 가진
  *결과에-대한-주장(claim-about-consequences)*이며, 결코 확정된 것으로 단언되지 않는다. 요약 문자열은 결코
  `evidence_ref`가 아니다.
- **하류의 두 가지 뚜렷한 export 형태(brief §8):** writeback payload를 가진 `memory-centric-systems`
  implication은 **CAW-01** 번들(writeback 스키마 / open question)이 된다; 증거로 뒷받침되는 implication은
  **CAW-02** 번들(claim)이 된다. 맵은 export를 직접 수행하지 않으면서도 둘 다 게이팅하기에 충분한 정보를 담아야 한다.
- **독립성:** 맵은 CAW-06 고유 저장소에 존재한다(brief §7); 결코 CAW-01/CAW-02로 손을 뻗지 않는다.
- **실패는 일급 시민(brief §5):** refuted/inconclusive 발견도 여전히 implication을 산출한다(refuted된 write-back
  축은 "축이 관찰되지 않음(axis not observed)"이라는 높은 가치의 신호다).

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Domain vocabulary | **고정 6-도메인 enum** (`ai-services`, `education`, `dev-platforms`, `models`, `hardware`, `memory-centric-systems`) | brief §3와 일치; export 대상으로 결정론적 라우팅; 검사 가능 | 새 도메인은 ADR 변경 필요 | **chosen** |
| | 자유 텍스트 도메인 | 유연함 | 라우팅 불가; 검사 불가; 표류함 | rejected |
| Cardinality | **발견당 하나의 `ImplicationMap`, 여러 `implications`** | 자연스러운 fan-out; 하나의 provenance 루트 | N개 도메인에 닿는 발견 = N개 implication 노드 | **chosen** |
| status vs confidence | **독립 필드** (status = 어느 방향; confidence = 얼마나 강하게) | `supported` implication도 export 위해서는 낮은 confidence일 수 있음; ADR-0002를 반영 | 유지할 필드 두 개 | **chosen** |
| Evidence binding | **`evidence_refs`는 ledger 결과나 추출된 claim으로 반드시 resolve 되어야 함** | §12 강제; 게이팅 가능; 기계 검사 가능 | 요약만 있는 implication은 export 불가(의도됨) | **chosen** |
| Export coupling | **맵은 라우팅 힌트(`export_targets`, `writeback_payload_ref`)를 담고; ADR-0008이 emit 담당** | 매핑 vs export 분리; 맵은 순수 산출물로 유지 | 간접성 | **chosen** |

## Decision

1. **`ImplicationMap` 모델 — 발견당 하나.** 필드: `map_id`; `finding_ref{thread_id, kind:
   result|hypothesis|claim, ref_id}`; `provenance{source_ids, boundary}`; 명시적으로 비증거로 표시된 `summary`;
   그리고 `implications[]` 배열. CAW-06 고유 저장소(brief §7)에 JSON/markdown으로 저장되며, 대용량 산출물은
   경로(path)로 참조된다.
2. **각 implication**은 다음을 담는다: `impl_id`; `domain`(아래 고정 enum에서); `statement`
   (결과에-대한-주장); `status ∈ {hypothesis, supported, refuted, inconclusive}`(ADR-0002와 동일 어휘);
   `confidence ∈ {low, medium, high}`; `evidence_refs[]`; 선택적 `writeback_payload_ref`(CAW-01로 향하는
   implication에만 존재, ADR-0004의 `wbtraffic.v0` 산출물에 연결); 그리고 `export_targets[]`(라우팅 힌트일 뿐 —
   실제 게이트는 ADR-0008이 강제).
3. **고정 도메인 어휘**(brief §3 유스케이스 3), 각각의 전형적 export 대상:

   | Domain id | Scope | Typical target |
   |---|---|---|
   | `ai-services` | TTT inference의 서빙/제품 경제성 | CAW-02 |
   | `education` | 사용자별 적응을 통한 튜터링/개인화 | CAW-02 |
   | `dev-platforms` | test time에 적응하는 툴링/에이전트 플랫폼 | CAW-02 |
   | `models` | 아키텍처 결과(fast-weights, LoRA-per-task) | CAW-02 |
   | `hardware` | write traffic의 가속기/HW 결과 | CAW-01 (open question) + CAW-02 |
   | `memory-centric-systems` | **주축(lead axis):** writeback bandwidth/endurance/residency | **CAW-01 (writeback 스키마)** |

4. **하드 룰(모델 + validator가 강제):**
   - `status`와 `confidence`는 **독립**이다; 어느 쪽도 다른 쪽을 함의하지 않는다.
   - `evidence_refs`는 ledger 결과(ADR-0003) 또는 추출된 claim(ADR-0005)으로 반드시 resolve 되어야 한다;
     `summary` 문자열은 **결코** 증거가 아니다.
   - 증거가 **대상별 게이트(ADR-0008 §4)**를 통과하는 implication만 번들링 대상이 될 수 있다.
   - CAW-01로 향할 `memory-centric-systems`/`hardware` implication은 `writeback_payload_ref`를 담거나
     타입이 지정된 open question이어야 한다(ADR-0008 CAW-01 게이트).
5. **근거(grounding)는 검사 가능하게 유지:** 맵의 어휘는 확정된 사실이 아니라 *재현할 소스(sources to reproduce)*로
   보관된 실제 TTT 작업에서 시드된다 — 예: ARC에서의 per-task LoRA-TTT(arXiv:2411.07279)를 정준적
   `memory-centric-systems` write-back-per-task 예시로, fast-weight/LaCT(arXiv:2505.23884)를
   residency/bandwidth 예시로. 벤더/2차 주장은 *검증할 주장(claims to verify)*으로 들어오며, 결코 증거가 아니다.

## Consequences

- **쉬움:** 발견을 도메인별로 올바른 export로 라우팅; refuted/inconclusive 발견 export(부정적 결과도 지식);
  export 코드를 건드리지 않고 implication 추가; 모든 implication을 그 줄기 + 증거로 추적.
- **어려움 / 감수하는 비용:** 6-도메인 enum은 의도적으로 닫혀 있다 — 진정으로 새로운 도메인은 자유 텍스트 필드가 아니라
  ADR 갱신이 필요하다; 요약만 있는 implication은 export 불가(설계상); 많은 도메인에 걸친 발견은 유지할 노드를 많이 산출한다.
- **후속:** ADR-0008은 `export_targets` + `writeback_payload_ref`를 소비하여 실제 게이트를 적용한다; ADR-0007은
  `ImplicationMap` 레코드를 영속화한다; CAW-01로 향하는 payload는 ADR-0004의 `wbtraffic.v0` 산출물이다.

## Open questions / revisit triggers

- `TODO(open-question: should refuted implications export to CAW-01 as explicit "axis not observed" signals, or only stay as CAW-02 negative knowledge?)`.
- `TODO(open-question: do we need an implication-level priority/score (e.g. blocks-a-future-workload-assumption) to rank what gets exported first?)`.
- `TODO(open-question: can one implication legitimately target both CAW-01 and CAW-02 (hardware domain), and if so does it emit two bundles or one?)`.
- `TODO(open-question: confidence is a 3-value enum here vs ADR-0002's 5-value scale — reconcile or map at the boundary?)`.
- **재검토 시점:** 7번째 도메인이 진정으로 필요할 때, 또는 result/hypothesis/claim을 넘어선 발견 타입이 등장할 때.

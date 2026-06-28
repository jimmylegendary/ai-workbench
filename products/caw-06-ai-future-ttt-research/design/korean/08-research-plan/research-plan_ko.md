# 연구 계획(Research Plan) — Open Tracks

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./open-questions_ko.md](./open-questions_ko.md), [./validation-and-tests_ko.md](./validation-and-tests_ko.md)
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md)
  - ADRs: [0001](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) · [0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md) · [0003](../01-decisions/ADR-0003-experiment-ledger_ko.md) · [0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) · [0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) · [0006](../01-decisions/ADR-0006-implication-mapping_ko.md) · [0008](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-06가 수행해야 하는 **미해결 연구 트랙들** — 설계가 추측하지 않고 의도적으로 `TODO(open-question)`로
남겨둔 미지의 사항들 — 을 열거한다. 각 트랙은 질문, 그것이 **상세화하는 ADR**, 그것이 해결되는 **빌드 단계**,
그것을 닫는 아티팩트, 그리고 **결정 규칙 / 완료 정의(definition of done)**를 명명한다. 이 문서는 ADR이 고정한 어떤
것도 다시 결정하지 않으며(그것들이 권위를 가진다), 결과를 지어내지도 않는다 — 모든 수치 발견은 소규모 실험
ledger([ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md))의 기록되고 재현 가능한 run에서 나와야 한다.
중복이 완전히 제거된 미지 사항 등록부는 [open-questions_ko.md](./open-questions_ko.md)에 있으며; 이 문서는
load-bearing한 것들을 실행 가능한 트랙으로 묶는다.

두 가지 협상 불가 원칙이 모든 트랙을 규정한다(PRODUCT-BRIEF §12): **no overclaim** — toy 규모의 결과는
hypothesis 상태 업데이트이지 결코 확정된 주장이 아니다 — 그리고 **failures are useful** — 부정적이거나 null인
결과는 폐기물이 아니라 일급(first-class)의, 보존되고, export 가능한 발견이다.

## 1. 단계(Phases) (트랙이 해결되는 기준이 되는 타임라인)

단계는 캘린더 날짜가 아니라 빌드 순서다(DOC-CONVENTIONS §3: 날짜를 지어내지 말 것).

| Phase | Theme | Gives us |
|---|---|---|
| **P1** | Foundations | thread 저장소([ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)), 인제스트 S1–S5([ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md)), `Source`/`Claim`/`Hypothesis` 레코드([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md)), ledger 스키마([ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md)) |
| **P2** | Writeback bridge | `wbtraffic.v0` 스키마 + **analytic L0 estimator**([ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)) 및 export 어댑터([ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md)) |
| **P3** | Grounding | 첫 **toy reproduction**(ledger), implication map([ADR-0006](../01-decisions/ADR-0006-implication-mapping_ko.md)), CAW-05 import 가동 |
| **P4** | Hardening | source의 scale-out, 인덱스/쿼리, 스케줄러, retention 정책 |

## 2. Open tracks

각 트랙은 `TRK-n`이다. "DoD" = 완료 정의 / 결정 규칙. Q-refs 열의 ID는
[open-questions_ko.md](./open-questions_ko.md)를 색인한다.

### TRK-1 — 어떤 TTT 변형이 실제로 write back하며, 무엇을 하는가? (전제)

- **ADR:** [0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) · **Phase:** P1→P3 · **Q-refs:** wbq-001, wbq-009, hq/iq writeback 플래그
- **Why:** 전체 CAW-01 브리지는 "TTT inference가 read-dominant 프로파일이 놓치는 write를 발생시킨다"에 기댄다.
  [TTT landscape 분류](../02-research/ttt-landscape_ko.md)는 8개 변형을 *write back하는가? 무엇을?*로 분류하지만 각
  셀은 확정된 사실이 아니라 **provenance를 가진 hypothesis**다. 변형 #1(test-time scaling)은 read-dominant
  **baseline**이며 *no weight writeback*으로 분류된 채 유지되어야 한다.
- **Method:** 각 후보 변형에 대해, `writes_back ∈ {true|false|unknown}` +
  `written_object ∈ {fast_weight_state, memory_module, lora_adapter, full_weights, norm_stats, policy, none}`를
  갖는 `CandidateClaim`(S4)을 추출한다; 기본값은 `unknown`. `unknown`에서 승격은 오직 `external` 또는
  `experiment` evidence에서만 가능하다(결코 `generated`로는 안 됨).
- **DoD:** 추적되는 모든 변형이 인용된 `evidence_span`에 의해 뒷받침되는 `writes_back` 값을 가진다;
  KV-binding⇄linear-attention 등가성(wbq-009)은 가정되지 않고 verified/unverified로 표시된다.

### TRK-2 — toy run으로부터의 변형별 기록 바이트 양

- **ADR:** [0003](../01-decisions/ADR-0003-experiment-ledger_ko.md), [0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) · **Phase:** P3 · **Q-refs:** wbq-007, lq-003, lq-001
- **Why:** 스키마의 `bytes_per_update`, `write_bw`, optimizer-state 크기는 측정되기 전까지 `null`이다. 어떤
  벤치마크 수치도 지어내지 않는다(PRODUCT-BRIEF §11). 첫 두 대상([TTT landscape §6](../02-research/ttt-landscape_ko.md)에
  따라): 하나의 **inner-loop** 변형(TTT-Linear, #2)과 하나의 **per-task** 변형(ARC LoRA TTT, #4) — write-frequency /
  optimizer-state 트레이드오프의 양 극단.
- **Method:** run당 하나의 ledger 항목; 사전 등록된 `decision_rule`; ≥3 seeds(lq-001); 정확도뿐 아니라
  **기록 바이트 수, update frequency, optimizer-state 크기**를 계측. `writeback_observed` 필드가 스키마 export에
  공급된다. toy run이 v1 범위에서 write-side 동작을 의미 있게 측정할 *수 있는지* 자체가 **lq-003**이다 — 만약
  불가능하다면, 그 null은 날조되지 않고 발견으로 기록된다.
- **DoD:** ≥1개 변형이 깔끔한 repro 블록과 함께 측정된(모델링이 아닌) `bytes_per_update`를 갖거나, 또는
  `failure_mode`를 동반한 문서화된 부정 결과("toy 설정에서 write 양 측정 불가").

### TRK-3 — syntorch/vLLM 통합 *이전에* writeback을 L0/L1에서 모델링할 수 있는가?

- **ADR:** [0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) · **Phase:** P2 · **Q-refs:** wbq-008, wbq-005, wbq-010
- **Why / 입장:** ADR-0004는 통합 이전에, 명확히 표시된 **analytic L0 estimate로서 yes로 결정한다**(Option A).
  이 트랙은 그 결정의 *검증*이지 재논의가 아니다. 전체 syntorch/vLLM trace(Option C)는 v1의 명시적 non-goal이다.
- **Method:** analytic estimator를 구축한다 — fast-weight param 수, dtype, optimizer, chunk size가 주어지면 →
  `bytes_per_update`, `write_bw`, `ratio_curve`를 계산하고 모든 `assumption`을 방출한다.
  [writeback-traffic-modeling_ko.md §"Mapping onto CAW-01 L0/L1"](../02-research/writeback-traffic-modeling_ko.md)의
  매핑 표에 따라 각 스키마 필드가 CAW-01 L0 객체(`mem_store` op + writeback `movement` + mutable `tensor`)로
  **lowering**됨을 확인한다. 미해결 하위 질문: `reuse_distance_tokens`가 DAG 순회에서 올 수 있는가(wbq-005);
  fast weights가 긴 context에서 on-chip→main memory로 spill하는가(wbq-010).
- **DoD:** estimator가 고정 입력에 대해 결정적(deterministic)이고, assumptions를 나열하며, CAW-01 L0 fixture에 대해
  round-trip하는 bundle을 생성한다([validation-and-tests_ko.md](./validation-and-tests_ko.md) 참조). 모델링된
  수치는 `inconclusive`/`hypothesis`로 태그된다 — **결코** `supported`가 아니다(ADR-0004 revisit trigger).

### TRK-4 — CAW-01 IR 이름 + capability 동기화 (export ask)

- **ADR:** [0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [0008](../01-decisions/ADR-0008-export-boundaries_ko.md) · **Phase:** P2 · **Q-refs:** wbq-002, wbq-003, wbq-012, eq-005, eq-006
- **Why:** CAW-01은 **별개 제품**이다; 그것은 자신의 IR 객체 이름을 소유한다. CAW-06는 경계에서 그것들을
  **재검증**해야 하며, 결코 공유 저장소/레지스트리를 가정하지 않는다. 대표적 export ask — CAW-01의 방향 없는
  "rough traffic"을 **방향성 read/write rollup + endurance rollup**으로 분할(wbq-002) — 은 *그들의* 결정이다;
  우리는 그것을 우리가 만드는 변경이 아니라 bundle 내부의 open question으로 싣는다.
- **Method:** 경계 체크리스트를 유지한다: 각 export cut 전에 CAW-01의 현재 `l0-ir-schema.md`에 대해 CAW-01 L0
  객체 이름(`op`, `tensor`/`TensorNode`, `movement`/`DataMovementEdge`)과 `mem_store` op_class를 재검증한다;
  `near_mem`이 residency tier인지 op 속성인지 해결한다(wbq-003); CAW-01의 IR이 `null`+`basis` 필드를 수용하는지
  확인한다(wbq-012). 전송(파일 드롭 대 HTTP, 드롭 위치/인증)은 eq-005; bundle 서명은 eq-006.
- **DoD:** `Caw01WritebackAdapter` bundle이 고정된 CAW-01 fixture에 대해 검증된다; 어떤 이름 drift도 조용한
  불일치가 아니라 실패한 검증으로 드러난다. 어떤 단계에서도 공유 저장소를 가정하지 않는다.

### TRK-5 — CAW-05 action-brief 스키마 조정 (import 경계)

- **ADR:** [0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) · **Phase:** P1→P3 · **Q-refs:** iq-001, iq-005
- **Why:** CAW-05는 **별개 제품**이다; 우리는 파일/pull 경계를 통해 그것의 `caw05.action-brief/v1` bundle을
  읽기 전용으로 import한다 — 그것의 synthesis 산문은 `evidence:false`이고 그것의 `classification`/`relevance`는
  **priority 힌트이지 결코 verdict가 아니다**. [source-and-claim-ingestion_ko.md §5](../02-research/source-and-claim-ingestion_ko.md)의
  와이어 형태는 *우리가 예상하는* 형태이며, CAW-05 자신의 ADR-0007에 대해 조정되어야 한다.
- **Method:** `CAW05ImportAdapter`에서 스키마 major를 고정한다; 알 수 없는 major에 대해 추측 대신 typed
  `SourceUnavailable`을 발생시킨다; `open_question` → seed `CandidateClaim(status=unverified, writes_back=unknown)`로
  매핑한다. CAW-05의 `canonical_id`가 우리가 직접 발견한 id와 불일치할 때의 dedup tie-break를 해결한다(iq-005).
- **DoD:** 실제 CAW-05 bundle이 멱등적으로(`bundle_id` watermark 기준) import되고, 기존 `Source`에 추가된
  provenance 항목으로(중복이 아니라) 병합되며, 결코 hypothesis를 자동 승격하지 않는다.

### TRK-6 — Claim 추출 방법 (extractive 대 verify-pass)

- **ADR:** [0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) · **Phase:** P1 · **Q-refs:** iq-002, iq-003, iq-004
- **Why:** S4 추출은 LLM 보조이지만 **제약된 extractive + attributable**이다 — 생성된 패러프레이즈는
  `evidence:false`이고; 오직 축자적 `evidence_span`만이 source 텍스트다. 미해결 질문은 단일 extract+attribute
  패스로 충분한지 아니면 **verify 패스**(각 claim을 그 span에 대해 재검사)가 필요한지, 그리고 인간 리뷰 전에
  어떤 false-claim 비율이 허용 가능한지(iq-002)다.
- **Method:** 둘 다 프로토타이핑한다; TTT abstract의 hold-out 수작업 라벨링 세트에서 false-claim 비율을 측정한다.
  `memory-traffic` claim에 abstract+metadata로 충분한지 아니면 full-text/PDF fetch가 필요한지 결정한다(iq-003);
  v1 볼륨에 대한 Semantic Scholar 인증 tier를 결정한다(iq-004).
- **DoD:** 어떤 `CandidateClaim`도 축자적 `evidence_span` + `source_locator` 없이는 방출되지 않는다(테스트로
  강제, [validation-and-tests_ko.md](./validation-and-tests_ko.md) 참조); 리뷰 임계값 미만의 측정되고 문서화된
  false-claim 비율을 갖는 선택된 추출 방법.

## 3. Track → ADR → phase 요약

| Track | Question (short) | Owning ADR(s) | Phase | Closes Q-refs |
|---|---|---|---|---|
| TRK-1 | 어떤 변형이 write back하며, 무엇을? | 0004, 0005 | P1→P3 | wbq-001, wbq-009 |
| TRK-2 | toy run으로부터의 기록 바이트 양 | 0003, 0004 | P3 | wbq-007, lq-001/003 |
| TRK-3 | syntorch 이전 L0/L1에서 writeback 모델링 | 0004 | P2 | wbq-005/008/010 |
| TRK-4 | CAW-01 IR 이름 + capability 동기화 | 0004, 0008 | P2 | wbq-002/003/012, eq-005/006 |
| TRK-5 | CAW-05 action-brief 조정 | 0005 | P1→P3 | iq-001, iq-005 |
| TRK-6 | claim 추출 방법 | 0005 | P1 | iq-002/003/004 |

## 4. 순서 및 의존성

```
P1  TRK-6 (extraction) ─┐         TRK-5 (CAW-05 import) ─┐
    store + records ─────┼──► P2  TRK-3 (L0 estimator) ──┼──► P3  TRK-2 (toy runs) ──► implication maps
    ledger schema ───────┘         TRK-4 (CAW-01 sync) ──┘         TRK-1 closes as evidence lands
```

- TRK-3(analytic estimator)와 TRK-4(CAW-01 sync)는 TRK-2보다 선행해야 하며, 그래야 toy run의 측정된 수치가
  흘러들어갈 스키마 + 브리지를 갖는다. 그러나 **export는 TRK-2에 막히지 않는다** — ADR-0004는 모델링된 estimate
  + open question을 먼저 싣고; toy 결과가 나중에 필드를 업그레이드한다.
- TRK-1은 개별 산출물이 아니다; 분류 전반에서 `external`/`experiment` evidence가 `unknown` writeback 플래그를
  대체함에 따라 **점진적으로 닫힌다**.

## 런북에 대한 함의

- 각 트랙은 단계 번호가 매겨진 런북으로 매핑된다: TRK-3/4 → P2(`wbtraffic.v0` 스키마, analytic estimator,
  export 어댑터); TRK-2 → P3(toy-reproduction ledger 항목); TRK-5/6 → P1(인제스트 어댑터 + extractor).
- 수치를 생성하는 모든 런북은 ledger 항목을 인용한다; export하는 모든 런북은 `status`+`confidence`+`provenance`를
  인라인으로 운반하며 CAW-01/CAW-02/CAW-05와 **공유 저장소 없음**을 단언한다.
- 각 DoD에 대한 테스트는 [validation-and-tests_ko.md](./validation-and-tests_ko.md)에 있으며; 해결되지 않은
  미지 사항은 트랙이 그것을 닫을 때까지 [open-questions_ko.md](./open-questions_ko.md)에 남는다.

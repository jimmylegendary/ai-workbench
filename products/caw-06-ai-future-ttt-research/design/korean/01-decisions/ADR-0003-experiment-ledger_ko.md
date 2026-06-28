# ADR-0003: 소규모 실험 ledger — minimal reproduction, 재현성, failures-first

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0001-product-surface-and-scout_ko.md](ADR-0001-product-surface-and-scout_ko.md) (결과를 로깅하는 Run 단계)
  - [ADR-0002-hypothesis-representation_ko.md](ADR-0002-hypothesis-representation_ko.md) (verdict가 evidence + status 이벤트가 됨)
  - [ADR-0004-writeback-traffic-schema_ko.md](ADR-0004-writeback-traffic-schema_ko.md) (`writeback_observed`가 CAW-01 브리지를 공급)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger_ko.md) (이 ADR을 뒷받침하는 연구)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape_ko.md) (먼저 재현할 변형들)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
**소규모 실험 ledger의 데이터 모델과 규율**을 결정한다 — CAW-06이 *검증 가능한* TTT 주장에 대해 빠듯한 자원 한계
하에서 minimal reproduction / 토이 실험을 기록하는 곳으로, run을 재현하기에 충분한 메타데이터(config + seed + env)를
가지며 **부정적 결과를 폐기하지 않고 보존하고 노출**한다(brief §5, §12). 이 ADR은 (1) **ledger 항목 모델**,
(2) **reproducibility gate**, (3) **부정적 결과 보존 + 노출** 메커니즘을 확정한다. 이 ADR은 hypothesis 표현
(ADR-0002 — ledger는 `Evidence` 레코드가 되는 `verdict`를 *생산*할 뿐), `ExperimentRunnerAdapter` 내부,
또는 writeback-traffic 스키마(ADR-0004 — ledger는 선택적 `writeback_observed` 훅만 방출)는 정의하지 **않는다**.

## Context
- brief는 **실패를 일급으로 만들고 유용하게 유지**한다: "config + result + verdict가 있는 minimal reproduction /
  토이 실험; 부정적 결과는 폐기되지 않고 기록됨"(§5); v1은 **토이 규모 전용**이다 — "대규모 학습이나 실제 TTT를
  규모로 실행하지 않음"(§11).
- **공개 비용 주장에 대한 생성된 요약은 evidence가 아니다**(§12). ledger가 존재하는 이유는 evidence로 취급되는
  *유일한* 것이 기록된, 재현 가능한, verdict가 기록된 run이 되도록 하기 위함이다 — `generated` evidence는 결코
  status를 승격할 수 없다는 ADR-0002 규칙과 루프를 닫는다.
- TTT 랜드스케이프([ttt-landscape.md](../02-research/ttt-landscape_ko.md) §6)는 **첫 두 재현 대상**을 명명한다:
  하나의 내부 루프 fast-weight 변형(TTT-Linear, #2)과 하나의 per-task 변형(ARC LoRA TTT, #4) —
  write-frequency / optimizer-state 트레이드오프의 양극단으로, 함께 대부분의 writeback-schema 필드를 행사한다.
- TTT 결과는 **seed에 민감**하고 공개 비용 수치는 벤더/블로그 출처다; ledger는 seed-운과 사후 cherry-picking에 맞서
  방어해야 하며, accuracy뿐 아니라 **write-side 동작**(쓰인 바이트, 업데이트 빈도, optimizer-state 크기)을
  계측해야 한다 — 그것이 ADR-0004가 필요로 하는 수치다.
- **독립성:** CAW-01/CAW-02/CAW-05는 별개 제품이다; ledger는 파일/API 경계를 가로질러 export하며 저장소를 공유하지
  않는다(§8).

## Options considered

### A. 항목 모델 & 가변성
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **한 항목 = 한 run; append-only; 수정은 `supersede`하는 새 항목; 큰 아티팩트는 경로로** | 완전한 감사 추적; 재실행에도 실패가 살아남음; 패밀리 markdown/JSON + artifacts-by-path(§7)와 일치; diff 가능 | "현재 verdict" 해석기 뷰 필요 | **Chosen** |
| hypothesis별 in-place 편집 | 레코드 적음 | 조용한 재작성이 brief가 보존을 요구하는 실패 이력을 파괴 | Rejected |
| hypothesis당 한 행에 최선 결과 | 간결 | 부정적/비-최선 run을 구조적으로 폐기 — brief가 금하는 바로 그 편향 | Rejected |

### B. Verdict 어휘
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **`supported` / `refuted` / `inconclusive` / `invalid`(setup 망가짐)**, 사전 등록된 `decision_rule`로 결정 | `invalid`가 "주장이 틀림"과 "우리 setup이 망가짐"을 분리; 사전 등록이 HARKing을 차단; ADR-0002 status로 깔끔히 매핑 | 검토자가 `invalid`를 정직하게 분류해야 함 | **Chosen** |
| `pass` / `fail`만 | 단순 | "노이즈 내 효과"와 "OOM 버그"를 실제 반증과 혼동 | Rejected |
| 자유 텍스트 결과 | 유연 | 질의 불가; 실패가 검색 불가한 산문이 됨 | Rejected |

### C. 재현성 강제
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **사전-run MUST-게이트(config 동결, ≥3 seeds, code rev 고정, env lock, baseline 로깅, failure 로깅)로, 충족 전까지 `invalid` 외 어떤 verdict도 거부** | 작은 예산에서 seed-운을 잡음; "내 머신에선 됨"이 발견을 산출 불가; 가능한 곳은 자동 체크 | 실험당 ~3× 토이 컴퓨트; 각 run 전 마찰 | **Chosen** |
| Best-effort 체크리스트(권고) | 마찰 없음 | 압박 하에서 건너뜀 → 비-재현 발견이 export됨 | Rejected |
| Single-seed run | 가장 저렴 | 운 좋은 한 seed가 거짓 `supported`를 산출; seed-민감 TTT에 치명적 | Rejected |

## Decision
**한 run = 한 append-only 항목; 사전 등록된 결정 규칙으로 게이팅되는 4값 verdict; 강한 reproducibility gate;
부정적 결과는 기본적으로 보존, 분류, 노출.**

1. **항목 모델(markdown/JSON; 아티팩트는 경로로; append-only).** 각 항목은 `hypothesis_id`(ADR-0002)와
   `claim_ref`(수집)를 연결하고, 사전 등록된 `prediction`(`metric`, `baseline`, `expected_direction`,
   `decision_rule`), `repro` 블록, `results` 블록(실패 포함), 선택적 `writeback_observed` 훅(ADR-0004),
   `lineage`(`supersedes`/`derived_from`)를 운반한다. 반복 시도는 `hypothesis_id`로 연결된 별개 항목이다;
   수정은 supersede하지, 절대 덮어쓰지 않는다. 스키마 = [experiment-ledger.md](../02-research/experiment-ledger_ko.md)의
   YAML.

2. **Verdict 의미(오버클레임 없음).**

   | Verdict | Means | Is NOT |
   |---|---|---|
   | `supported` | 토이 결과가 결정 규칙 하에서 예측 방향과 일치 | "주장이 규모에서 참이다" |
   | `refuted` | 토이 결과가 규칙 하에서 예측과 모순 | "아이디어가 쓸모없다" |
   | `inconclusive` | 깔끔히 실행됐으나 규칙 미충족(노이즈 내 효과) | 로깅 실패 |
   | `invalid` | setup 망가짐(OOM, 버그, data leak) | `refuted` |

   토이 규모의 `supported` verdict는 **hypothesis status 업데이트이지, 절대 확정된 claim이 아니다**(brief §5, §12).
   그것은 ADR-0002 `Evidence` 레코드(`evidence_kind=experiment`) + 제안된 `StatusEvent`로 매핑된다; 어떤
   `supported` export든 사람이 확정한다.

3. **Reproducibility gate(MUST 항목, 사전-run).** config를 파일로 동결(숨은 CLI args 없음); 시드별 메트릭이 있는
   **≥3 seeds**; code revision 고정(runner + 제품); 환경 lock(lib 버전 + 컨테이너 digest); data 완전 명세;
   **결과 기입 전 결정 규칙 사전 등록**(R6, anti-cherry-pick 가드 — 결과를 본 뒤 규칙 변경은 *새로운* superseding
   항목이며 원본 보존); 하드웨어/wallclock/예산 기록; treatment와 나란히 baseline run 로깅; 부정적/실패 run을
   `failure_mode`와 함께 로깅. MUST 항목이 통과하기 전까지 run은 `invalid` 외 어떤 verdict로도 이동할 수 없다;
   게이트는 `artifacts/EXP-XXXX/REPRO.md`를 방출한다.

4. **실패는 일급(세 계층).**
   - **보존:** 시작된 모든 run은 항목이다; `aborted`/`invalid`/`inconclusive`/`refuted`는 성공과 동일한 스키마를
     사용한다; 아무것도 삭제되지 않는다; append-only + `supersedes`는 재실행이 그것이 대체하는 실패를 절대
     덮어쓰지 않음을 뜻한다; 큰 실패 아티팩트는 경로로 보관.
   - **분류:** 모든 비-성공은 통제된 `failure_mode ∈ {oom, budget-exceeded, nonconvergence, no-effect, flaky,
     setup-error}`를 운반하므로 실패가 서사가 아니라 *질의 가능*하다.
   - **노출:** CLI/MCP **negative-results 뷰**가 모든 `refuted`/`inconclusive`/non-null-`failure_mode` 항목을
     `hypothesis_id`와 `failure_mode`로 그룹화하여 나열한다; 각 hypothesis 카드는 전체 승/패 이력을 보인다;
     `no-effect`/`refuted` 결과는 그 자체로 CAW-02에 **export 가능한 발견**이며, write-side 동작에 관한 것일 때
     CAW-01 open question을 씨앗으로 삼을 수 있다.

5. **CAW-01 훅.** run이 write-side 동작을 측정할 때, 선택적 `writeback_observed` 필드(`weights_updated`,
   `state_lifecycle`, 쓰인-바이트 카운트, optimizer-state 크기)가 writeback-traffic 스키마(ADR-0004)를 채운다 —
   *모델링된* 추정치를 *측정된* 것으로 근거 짓되, 구별되게 플래그한다. 이것은 export 훅이지, CAW-01과의 공유
   저장소가 절대 아니다.

6. **Runner 규율.** `ExperimentRunnerAdapter` v1(최소 로컬 토이 runner)은 크래시 포함(→ `invalid`/`aborted`)하여
   **모든 launch마다 ledger 항목을 생성해야 한다**, 그래서 실패가 조용히 폐기될 수 없다(off-ledger-run 누출을 닫음).

## Consequences
- **쉬움:** `failure_mode`로 레코드를 필터링하고, hypothesis별 현재 verdict를 해석하고, 어떤 verdict든 동결된
  config + seed + env로 추적; `supported` 발견은 구성상 재현 가능.
- **쉬움:** 부정적 결과가 ADR-0002(`refuted`/`inconclusive` status)로 곧장 흘러 들어가 CAW-02로 지식으로 나간다 —
  가치-단위 사슬의 실패 노드가 영속적이고 발견 가능.
- **어려움 / 비용:** ≥3-seed 규칙으로 인한 ~3× 토이 컴퓨트; 관리할 항목이 더 많음("현재" 해석기 필요);
  `failure_mode` 어휘는 TTT 공간이 커지면서 유지되어야 함; 검토자는 setup 버그를 반증으로 재라벨링하지 말고
  `invalid`를 정직하게 분류해야 함.
- **후속:** ADR-0002는 `verdict`를 evidence + status 이벤트로 소비한다; ADR-0004는 `writeback_observed`를
  소비한다. Runbook: (1) append-only ledger 저장소 + `supersedes` 해석기 + current-verdict 뷰; (2) `REPRO.md`를
  방출하는 사전-run repro 게이트(R1–R7, R11, R12); (3) 모든 launch마다 항목 생성을 강제하는
  `ExperimentRunnerAdapter` v1; (4) negative-results 노출 CLI/MCP 명령; (5) export 훅(깔끔한 repro 블록을 가진
  `supported`/`refuted`만 CAW-02로 export; `writeback_observed`는 CAW-01을 공급).

## Open questions / revisit triggers
- TODO(open-question: 최소 seed 수 vs 예산 — seed-민감 TTT에 3개로 충분한가, 아니면 분산 기반 적응적 카운트가
  필요한가?) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: 벤치마크 숫자를 지어내면 안 되는 상황에서, `prediction.expected_effect`는 어떤 효과 크기
  *prior*를 run 전에 운반해야 하는가?)
- TODO(open-question: 토이 run이 write-side 동작 — 쓰인 바이트, optimizer-state residency — 을 의미 있게 측정해
  ADR-0004를 공급할 수 있는가, 아니면 v1의 토이 범위(brief §11)를 넘는 runner 통합이 필요한가?)
- TODO(open-question: 공개 TTT 비용 주장(latency 배수, 메모리 O(T·d))의 독립 검증 — 어떤 export 전이든 벤더/블로그
  vs 동료 심사 표시.)
- TODO(open-question: 큰 실패 아티팩트의 보존/GC — 경로로 영원히 보관, 아니면 N일 뒤 메트릭은 유지하며 요약 + 정리?)
- **Revisit trigger:** 운영자가 일상적으로 ledger 밖에서 실험을 실행한다면, runner가 항목 생성을 *강제*해야 한다
  (그렇지 않으면 failures-first 보장이 무효다).

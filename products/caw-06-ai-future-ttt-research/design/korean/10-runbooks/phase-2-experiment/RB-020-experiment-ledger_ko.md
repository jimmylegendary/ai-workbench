# RB-020: 재현성 게이트(reproducibility gate)와 4값 판정(verdict)을 가진 append-only 소규모 실험 ledger 구축

- Status: ready
- Phase: phase-2-experiment
- Depends on: [RB-0XX (스토어 레이아웃 + 레코드 스키마, P0 종료), RB-1XX (hypothesis 레코드, P1 종료)]
- Implements design:
  - [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger_ko.md)
  - [../../05-ttt-research-core/experiment-ledger.md](../../05-ttt-research-core/experiment-ledger_ko.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P2 종료 게이트; M1 박스 4–7)
- Produces:
  - `store/ledger/EXP-XXXX/` append-only 항목 라이터 + 스키마 검증기
  - `artifacts/EXP-XXXX/REPRO.md`를 방출하는 사전 실행(pre-run) reproducibility gate (R1–R7, R11, R12)
  - 사전 등록(pre-registered)된 결정 규칙 평가기 → 4값 verdict
  - `supersedes` 계보(lineage) 해석기 + "현재 verdict" 뷰
  - 음성 결과(negative-results) 보존/분류/노출 뷰 (CLI/MCP 대면 함수)

## Objective
빌더는 `store/ledger/EXP-XXXX/` 아래에 실험 run당 정확히 하나의 append-only ledger 항목을 만들고, 결과가 존재하기 전에 **사전 등록된 결정 규칙(decision rule)**을 동결(freeze)하고, MUST 항목이 통과할 때까지 `invalid`를 제외한 모든 verdict를 거부하는 **reproducibility gate**를 실행하고, 동결된 규칙을 seed별 메트릭에 대해 기계적으로 평가하여 4값 verdict(`supported|refuted|inconclusive|invalid`)를 산출할 수 있다. 음성 및 중단된(aborted) run은 통제된 `failure_mode`와 함께 보존되고, 쿼리 가능하며, 기본적으로 노출된다. "완료(Done)"의 의미는 = ledger 모듈이 [experiment-ledger.md](../../05-ttt-research-core/experiment-ledger_ko.md) §Invariants의 다섯 가지 불변식을 강제하고 트리가 그린인 것이다. 이 런북은 **ledger + gate + verdict + 노출(surfacing)**을 구축한다; compute를 시작하는 runner는 [RB-021](./RB-021-experiment-runner_ko.md)이다.

## Preconditions
- [ ] P1 종료 충족: 적어도 하나의 `Hypothesis` 레코드(status `hypothesis`, 정성적 불확실성)와 그 `claim_ref`/`source`가 CAW-06 소유 스토어에 존재.
- [ ] P0의 스토어 루트와 레코드 스키마 검증기가 존재; `store/ledger/`가 생성 가능하며 라운드트립됨.
- [ ] ADR-0002의 verdict→Evidence/StatusEvent 매핑이 참조할 타입으로 사용 가능(이 런북은 verdict를 *방출*만 함; status를 승격하지 않음).
- [ ] 레포가 git 워킹 트리(코드 리비전을 고정 가능)임.
- [ ] 시작 시 트리가 그린(컴파일 성공, lint 통과)임.

## Steps

### 1. ledger 항목 스키마를 빌드 계약으로 정의
- **Do:** [experiment-ledger.md](../../05-ttt-research-core/experiment-ledger_ko.md) §Entry record의 YAML과 정확히 일치하는 `EntryRecord` 타입을 구현한다: `id`, `hypothesis_id`, `claim_ref`, `title`, `status ∈ {planned,running,done,aborted}`, `verdict ∈ {supported,refuted,inconclusive,invalid}`, `created`(`TODO`로 둘 것 — 날짜를 지어내지 말 것), `boundary`, 그리고 블록 `prediction`, `repro`, `results`, 선택적 `writeback_observed`, `lineage`, `evidence_link`. markdown front-matter + JSON 쌍둥이로 영속화한다; 대용량 아티팩트는 경로로만 참조한다. 검증기를 제공한다.
- **Verify:** 검증기가 손으로 쓴 샘플 항목을 라운드트립한다; `prediction.decision_rule`, `repro.seeds`, `status` 중 하나라도 누락된 항목을 거부한다. 알 수 없는 숫자 필드는 `null`/`TODO(open-question:...)`로 수용되며 결코 자동 채워지지 않는다.

### 2. `store/ledger/EXP-XXXX/` 아래 append-only 항목 스토어
- **Do:** 안정적 단조(monotonic) `EXP-XXXX` id를 할당하고 항목 디렉터리를 한 번 쓰는 `create_entry(...)`를 구현한다. status/result 전이를 추가 레코드로 처리하는 `append_event(...)`를 구현한다. 공개 API를 통한 제자리 편집(in-place edit)과 삭제를 **불가능**하게 만든다(교정은 step 7의 `supersede`를 거침). 아티팩트는 `artifacts/EXP-XXXX/` 아래에 위치한다.
- **Verify:** 기존 항목에 대한 모든 업데이트 경로 호출은 추가하거나 발생(raise)한다; 단위 테스트는 어떤 공개 함수도 이전 항목 파일을 재작성하거나 제거하지 않음을 검증한다. 두 번의 `create_entry` 호출은 서로 다른 단조 id를 산출한다.

### 3. 사전 등록 순서 (R6, 체리피킹 방지 가드)
- **Do:** `prediction`(`metric`, `baseline`, `expected_direction`, `decision_rule`)과 `repro.seeds`가 `results` 블록이 채워지기 **전에** 작성됨을 강제한다 — 항목은 먼저 빈 `results`로 존재해야 한다. append-only 계보 / 타임스탬프를 통해 순서를 기록하여 `decision_rule`이 `results`에 증명 가능하게 선행하도록 한다.
- **Verify:** `prediction.decision_rule`이 비어있는 항목에 `results`를 채우려는 테스트가 게이트(step 5, R6)에 실패한다. 결과를 채운 다음 `decision_rule`을 제자리에서 바꾸려는 테스트는 거부된다 — 유일하게 합법적인 변경은 대체(superseding) 항목이다(step 7).

### 4. 기계적으로 평가 가능한 결정 규칙 → 4값 verdict
- **Do:** `decide(results, decision_rule) -> verdict`를 구현한다. 규칙은 seed 분포에 대한 `metrics.json`으로부터 기계 평가 가능해야 한다(예: `>=3` seed에 걸쳐 `mean_delta > 2*pooled_stderr` → `supported`; 같은 대역(band)을 넘어 반대 방향 → `refuted`; 깨끗하게 실행됐으나 대역 미충족 → `inconclusive`). 산문만(prose-only)인 규칙은 등록 시 거부된다. `invalid`는 `decide`에 의해 결코 산출되지 않는다 — 오직 게이트(step 5)나 망가진 설정에서만 나온다.
- **Verify:** 단위 테스트가 합성 seed별 메트릭으로부터 네 가지 결과를 모두 다룬다: 명확한 양성 효과 → `supported`; 명확한 음성 → `refuted`; 잡음 내(within-noise) → `inconclusive`; 파싱 가능한 임계값이 없는 규칙 문자열 → 등록 시 거부(조용히 통과되지 않음).

### 5. reproducibility gate (그린 전까지 `invalid` 외 모든 verdict 거부)
- **Do:** [experiment-ledger.md](../../05-ttt-research-core/experiment-ledger_ko.md) §Reproducibility gate와 ADR-0003 §Decision의 MUST 항목을 검사하는 `repro_gate(entry) -> GateResult`를 구현한다: R1 해시된 파일로 동결된 config(숨겨진 CLI 인자 없음), R2 seed별 메트릭을 가진 `>=3` seed, R3 고정된 코드 리비전(runner + 제품), R4 잠긴 환경(라이브러리 버전 + 컨테이너 다이제스트), R5 완전히 명세된 데이터, R6 결과 전에 사전 등록된 결정 규칙, R7 기록된 하드웨어/벽시계(wallclock)/예산, R11 treatment 옆에 로그된 baseline run, R12 비성공(non-success)은 `failure_mode`를 지님. 각 항목의 통과/실패를 기록하는 `artifacts/EXP-XXXX/REPRO.md`를 방출한다. MUST 항목 중 하나라도 실패한 run은 오직 `verdict=invalid`만 할당될 수 있다.
- **Verify:** 환경 잠금이 누락되거나 seed가 `<3`인 항목은 `GateResult.ok == False`를 산출하고 `invalid` 외의 `verdict` 설정 시도는 발생한다; `REPRO.md`가 작성되고 실패 항목을 나열한다. 완전히 명세된 항목은 `ok == True`를 산출하고 `decide()`를 잠금 해제한다.

### 6. verdict 의미론, 과대주장 없음, evidence cap
- **Do:** 게이트가 깨끗한 상태에서 `verdict ∈ {supported, refuted}`일 때, ADR-0002에 따라 `Evidence(evidence_kind=experiment)`와 **제안된(proposed)** `StatusEvent`를 방출한다 — 제안만; hypothesis status를 자동 승격하지 않는다. `supported` toy verdict는 hypothesis status 업데이트이지 결코 확정된 claim이 아니며, *모델링된/생성된* 숫자는 결코 status를 승격할 수 없음(ADR-0002 강한 evidence cap)을 인코딩한다. `inconclusive`/`invalid`는 status 변경을 산출하지 않는다.
- **Verify:** 테스트는 `decide` → `supported`가 외부 인간 확인(human-confirm) 플래그 없이는 적용되지 *않는* 제안된(proposed) StatusEvent를 방출함을 검증한다; 증거로 전달된 생성/모델링된 값은 evidence-cap 검사에 의해 거부된다. `invalid`는 결코 Evidence 레코드를 산출하지 않는다.

### 7. Supersede 계보 + 현재-verdict 해석기
- **Do:** `lineage.supersedes = old_id`를 가진 새 `EXP-XXXX`를 만드는 `supersede(old_id, new_entry)`를 구현한다; 원본(과 이제는 "틀린" 규칙/결과)은 보존된다. hypothesis별 최신 비대체(non-superseded) 항목을 해석하는 `current_verdict(hypothesis_id)`를 구현한다.
- **Verify:** 대체 후 두 항목 모두 디스크에 존재한다; `current_verdict`는 새 것을 반환한다; 원본은 여전히 읽을 수 있고 이력에 여전히 나타난다. 원본의 어떤 바이트도 수정되지 않았다.

### 8. 음성 결과 보존, 분류, 노출
- **Do:** `aborted`/`invalid`/`inconclusive`/`refuted`가 성공과 **동일한** 스키마를 사용하도록 보장한다. 모든 비성공에 통제된 `failure_mode ∈ {oom, budget-exceeded, nonconvergence, no-effect, flaky, setup-error}`를 강제한다(R12). 모든 `refuted`/`inconclusive`/non-null-`failure_mode` 항목을 `hypothesis_id`와 `failure_mode`로 그룹화하여 나열하는 `negative_results_view()`를 구현하되, 실패를 숨기지 않고 노출하는 기본 정렬을 사용한다; 그리고 hypothesis별 승패(win/loss) 이력을 구현한다.
- **Verify:** `failure_mode=null`인 비성공 항목은 거부된다. `negative_results_view()`는 기본적으로 시드된 refuted + inconclusive 항목을 반환한다(숨겨지지 않음); 실패만 있는 hypothesis는 그 이력에서 가시적으로 미지지(unsupported)로 표시된다.

### 9. 선택적 CAW-01 훅 필드 (공유 스토어 없음)
- **Do:** 측정되지 않은 숫자가 `null`로 남는 선택적 `writeback_observed` 블록(`weights_updated`, `state_lifecycle`, `bytes_per_update_measured`, `optimizer_state_bytes`)을 수용한다. 측정값과 모델링값을 구별되게 표시한다. ledger는 이 훅을 *저장*만 한다; 이를 CAW-01 IR로 낮추는(lowering) 것은 경계를 가로지르는 이후 export 런북(P3/P4)이며 — 결코 공유 스토어가 아니다.
- **Verify:** `writeback_observed.bytes_per_update_measured: null`인 항목이 검증을 통과한다; 테스트는 ledger 모듈이 어떤 CAW-01 경로에도 쓰기를 수행하지 않음을 검증한다.

## Acceptance criteria
- [ ] 한 run = 하나의 append-only `store/ledger/EXP-XXXX/` 항목; 어떤 공개 API도 이전 항목을 편집하거나 삭제하지 않음(불변식 1).
- [ ] `prediction.decision_rule` + `seeds`가 `results`가 채워지기 전에 증명 가능하게 동결됨(R6); 사후(post-hoc) 변경은 오직 대체 항목으로만 가능.
- [ ] `repro_gate`가 R1–R7, R11, R12를 강제하고, `REPRO.md`를 방출하며, 그린 전까지 `invalid` 외 모든 verdict를 차단함(불변식 4).
- [ ] `decide()`가 기계 평가 가능한 규칙으로 seed별 메트릭으로부터 네 가지 verdict를 모두 산출; 산문만인 규칙은 거부됨.
- [ ] `supported`/`refuted`가 Evidence + *제안된*(적용되지 않은) StatusEvent를 방출; 과대주장 없음; 모델링된 값은 status를 승격할 수 없음(불변식 2; evidence cap).
- [ ] 모든 비성공이 통제된 `failure_mode`를 지님; `negative_results_view()`가 기본적으로 실패를 노출함(불변식 3).
- [ ] `current_verdict(hypothesis_id)`가 최신 비대체 항목을 해석; 원본은 바이트 단위로 보존됨.
- [ ] 어떤 코드 경로도 CAW-01/CAW-02/CAW-05 스토어에 쓰지 않음(불변식 5).
- [ ] 트리가 그린(컴파일 성공, lint 통과); [milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md)의 P2 종료 게이트와 일치.

## Rollback / safety
- ledger는 append-only다: 중도 실패는 부분적인 `EXP-XXXX/` 디렉터리를 남긴다. 안전한 복구 = 그 항목을 `failure_mode=setup-error`와 함께 `aborted`/`invalid`로 표시한다; 결코 삭제하지 않는다(삭제는 불변식 1과 실패 우선(failures-first) 보장을 위반함). 새 항목으로 재시도하고, 선택적으로 중단된 항목을 `supersedes`한다.
- 게이트나 스키마 검증기가 리팩토링 중이고 레드(red)면, 마지막 그린 커밋으로 되돌린다; verdict를 통과시키려고 MUST 항목을 완화하지 않는다 — 그것은 재현 불가능한 발견이 export되게 한다.
- verdict를 고치려고 항목 파일을 손으로 편집하지 않는다; `supersede`를 사용한다.

## Hand-off
다음 런북([RB-021](./RB-021-experiment-runner_ko.md))은 다음을 가정할 수 있다: 검증된 append-only ledger 라이터, verdict 할당 전에 호출해야 하는 사전 실행 `repro_gate`, 사전 등록된 규칙을 위한 `decide()` 평가기, `failure_mode` 어휘, 그리고 **모든** 시작(크래시 → `aborted`/`invalid` 포함)에서 호출해야 하는 항목 생성 API. P3 export 런북은 `current_verdict`, Evidence/StatusEvent 방출, 그리고 CAW-01 경계를 가로질러 낮추기 위한 저장된 선택적 `writeback_observed` 훅을 가정할 수 있다.

# RB-021: ExperimentRunner 포트와 재현성 캡처를 가진 v1 최소 로컬 toy runner 구현

- Status: ready
- Phase: phase-2-experiment
- Depends on: [RB-020 (append-only ledger + repro gate + verdict)]
- Implements design:
  - [../../07-backend-api/experiment-runner-service.md](../../07-backend-api/experiment-runner-service_ko.md)
  - [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger_ko.md) (§Decision 6: entry-on-launch)
  - [../../05-ttt-research-core/experiment-ledger.md](../../05-ttt-research-core/experiment-ledger_ko.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P2 종료; M1 box 5)
- Produces:
  - `ExperimentRunnerAdapter` Protocol(포트) + 문서화된 스텁(`ExternalComputeRunner`, `HardwareRunner`)
  - `LocalToyRunner` v1: 빡빡한 예산(budget) 하의 작은 PyTorch 모델
  - 재현성 캡처: config + seeds + env를 해시 가능한 `RunSpec`으로 동결
  - entry-on-launch 불변식 배선(모든 launch → 하나의 ledger 항목, 크래시 포함)
  - verdict를 게이트하고 결과를 append-only로 로그하는 `exp.run(...)` 흐름
  - 한 variant를 위한 선택적 `writeback_observed` 수집기

## Objective
빌더는 `exp.run(plan_id, runner="LocalToyRunner")`를 실행하여 다음을 수행하게 할 수 있다: 플랜의 config + `>=3` seed + 환경을 해시 가능한 `RunSpec`으로 동결; **어떤 compute가 시작되기 전에** ledger 항목 생성(크래시가 발생해도 `aborted`/`invalid` 항목이 남도록 — off-ledger-run 누출을 닫음); 작은 PyTorch toy 모델과 그 baseline을 하드 예산 하에서 실행; RB-020 reproducibility gate 실행(그린 전까지 verdict가 `invalid`로 강제됨); **사전 등록된** 결정 규칙 평가; seed별 결과 + verdict를 ledger에 추가. "완료(Done)"의 의미는 = 실제 toy launch에 의해 하나의 `store/ledger/EXP-XXXX/` 항목이 산출되고, 의도적으로 실패하는 launch 또한 분류되고 노출된 음성 항목을 산출하는 것이다(P2 종료 게이트). v1은 **toy 규모만** — 대규모 실제 TTT 없음(brief §11).

## Preconditions
- [ ] RB-020 완료: ledger 라이터, `repro_gate`, `decide()`, `failure_mode` 어휘, `current_verdict`, 항목 생성 API가 사용 가능.
- [ ] 확인 가능한 TTT claim에 대한 `ExpPlan`이 존재(P1로부터)하며, `hypothesis_id`, `claim_ref`, 그리고 기계 평가 가능한 `decision_rule`을 가진 `prediction`을 지님.
- [ ] PyTorch(CPU-only 허용)가 프로젝트 환경에 설치 가능.
- [ ] 레포가 git 워킹 트리(runner + 제품 리비전을 고정 가능)임.
- [ ] 시작 시 트리가 그린임.

## Steps

### 1. ExperimentRunnerAdapter 포트 정의
- **Do:** [experiment-runner-service.md](../../07-backend-api/experiment-runner-service_ko.md) §The port의 Protocol을 구현한다: `name`, `health() -> HealthStatus`, `prepare(plan) -> RunSpec`, `launch(spec) -> RunHandle`, `poll(handle) -> RunState ∈ {queued,running,done,crashed}`, `collect(handle) -> RawResults`. `launch()`가 작업 시작 전에 즉시 ledger 항목을 생성해야 한다는 계약을 문서화한다.
- **Verify:** Protocol이 컴파일된다; 적합성(conformance) 테스트가 모든 어댑터가 여섯 멤버를 모두 노출함을 검증한다. `health()`는 타입화된 status를 반환한다.

### 2. 연기된(deferred) runner를 위한 문서화된 스텁
- **Do:** Protocol을 구현하되 `HealthStatus="deferred"`를 반환하고 `prepare/launch`에서 명확한 `NotImplemented` 스타일 가드를 발생시키는 `ExternalComputeRunner`와 `HardwareRunner`를 추가한다. 이들을 `LocalToyRunner`와 함께 runner 레지스트리에 등록한다.
- **Verify:** 레지스트리가 세 runner를 나열한다; 두 스텁은 `deferred`를 보고하고 설명적인 오류와 함께 launch를 거부한다(조용한 no-op이 아님).

### 3. `prepare()` — config + seeds + env를 해시 가능한 RunSpec으로 동결
- **Do:** [experiment-runner-service.md](../../07-backend-api/experiment-runner-service_ko.md)로부터 `RunSpec`을 빌드하는 `prepare(plan)`를 구현한다: **전체** config를 `artifacts/EXP-XXXX/config.yaml`에 쓰고(숨겨진 CLI 인자 없음), `seeds`를 `>=3`개의 서로 다른 값으로 설정하고, `code_rev = {runner: <git-sha>, product: <git-sha>}`를 고정하고, `env`를 캡처하고(python 버전, 고정된 라이브러리 버전, 가능하면 컨테이너 다이제스트 — 미결정인 곳은 `TODO(open-question: env pinning mechanism)`로 표시, 결코 지어내지 말 것), `data`를 명세하고(합성 toy 데이터를 위한 gen-seed + split + 해시), `budget`을 기록한다(`max_wallclock_s`, `max_mem_gb`, `updates_max`). 동결된 블록에 대해 `spec_hash = sha256`을 계산한다.
- **Verify:** 동일한 플랜에 대해 `prepare`를 재실행하면 동일한 `spec_hash`가 산출된다; config 바이트를 변경하면 해시가 변한다. `config.yaml`이 존재하고 해시된다; `len(seeds) >= 3`.

### 4. entry-on-launch 불변식 (off-ledger-run 누출을 닫음)
- **Do:** `launch(spec)`의 첫 동작이 RB-020 항목 생성 API를 호출하여 어떤 모델 코드가 실행되기 **전에** `EXP-XXXX`를 `status=running`(`planned` 이후)으로 쓰도록 구현한다. compute를 가드로 감싸서 run 중간의 크래시/킬에도 항목이 `aborted`(운영적)와 `verdict=invalid`로 `failure_mode`(`setup-error`/`oom`/`budget-exceeded`)와 함께 최종 확정(finalize)되도록 한다.
- **Verify:** `launch()`가 항목을 생성한 직후 compute 전에 강제 예외를 주입한다: ledger 항목이 여전히 존재하고, `status=aborted`, `verdict=invalid`, `failure_mode`가 설정됨. kill -9 시뮬레이션은 발견 가능한 항목을 남긴다(레코드 0개가 아님).

### 5. v1 LocalToyRunner — 작은 PyTorch 모델 + baseline
- **Do:** `RunSpec` 예산 하에서 합성/toy 데이터로 작은 PyTorch 모델을 실행하는 `LocalToyRunner`를 구현하되, 각 seed마다, treatment(테스트 대상 TTT variant)와 옆에 로그된 **baseline**(R11) 둘 다에 대해 실행한다. 모든 RNG(python/numpy/torch)를 시드하고, 해당되는 경우 `cudnn deterministic`을 켜고, 알려진 비결정성을 기록한다. 엄격히 toy 규모로 유지한다(작은 모델, 상한된 `updates_max`, 짧은 wallclock). [experiment-runner-service.md](../../07-backend-api/experiment-runner-service_ko.md) §First reproduction targets의 첫 재현 variant 중 하나를 목표로 한다(TTT-Linear #2 또는 ARC LoRA TTT #4).
- **Verify:** toy run이 CPU에서 예산 내로 완료되고, treatment AND baseline에 대해 seed별 `metrics.json`을 쓰며, `updates_max`/wallclock 상한을 준수한다(상한을 초과하는 run은 종료(kill)되고 `budget-exceeded`로 분류됨).

### 6. `collect()` — seed별 메트릭 + 선택적 write-side 카운터
- **Do:** seed별 메트릭, 아티팩트 경로, 그리고 (선택적으로, 선택된 variant에 대해) `writeback_observed` 카운터(`weights_updated`, `state_lifecycle`, `bytes_per_update`, `optimizer_state_bytes`)를 반환하는 `collect(handle)`를 구현하되, 모델링된 추정치와 구별하기 위해 `measurement: "measured"`로 표시한다. 측정되지 않은 숫자는 `null`로 둔다 — 결코 지어내지 않는다. 이는 나중에 CAW-01 export 훅에 공급된다; CAW-01에는 아무것도 쓰지 않는다.
- **Verify:** `collect`는 모든 seed에 대해 메트릭을 반환한다; `writeback_observed`는 `measured`로 플래그된 측정값으로 채워지거나 `null`로 남는다; 어떤 형제 제품(sibling-product) 경로에도 쓰기가 발생하지 않는다.

### 7. `exp.run()` 오케스트레이션 — 게이트, 결정, append-only 로그
- **Do:** [experiment-runner-service.md](../../07-backend-api/experiment-runner-service_ko.md) §v1 minimal toy runner flow의 흐름을 구현한다: `spec = prepare(plan)`; `repro_gate(spec).ok`를 단언(assert)하고 아니면 `verdict=invalid`를 강제(다른 verdict 허용 불가); `handle = launch(spec)`(항목 생성됨); `results = collect(handle)`; **사전 등록된** 규칙을 사용하여 `verdict = decide(results, plan.prediction.decision_rule)`(HARKing 없음 — 사후 규칙 변경은 편집이 아니라 대체 항목); `exp.log_result(EXP-XXXX, results, verdict)` append-only.
- **Verify:** 전체 happy-path run이 통과하는 `REPRO.md`, 동결된 규칙으로부터의 4값 verdict, seed별 결과를 가진 하나의 항목을 산출한다 — 모두 추가되고, 어떤 것도 덮어쓰이지 않는다. 게이트가 실패한 run은 메트릭과 무관하게 `verdict=invalid`를 산출한다.

### 8. P2 종료 증명: 하나의 실제 항목 + 하나의 의도적 실패
- **Do:** 실제 `ExpPlan`에 대해 `exp.run`을 한 번 실행하여 진짜 ledger 항목을 산출한다; 그 다음 의도적으로 실패하는 구성(예: OOM/비수렴 강제 또는 너무 작은 예산)을 실행하여 음성 항목을 산출한다. 둘 다 RB-020 `negative_results_view()` / current-verdict 뷰에 적절히 나타나는지 확인한다.
- **Verify:** 두 개의 `store/ledger/EXP-XXXX/` 항목이 존재한다; 실패한 것은 `failure_mode`로 분류되고 기본적으로 노출된다; 어느 것도 제자리에서 편집되지 않았다. 성공한 항목의 verdict(설령 `refuted`/`inconclusive`라도)는 유효한 M1 결과다.

## Acceptance criteria
- [ ] `ExperimentRunnerAdapter` Protocol 구현됨; `LocalToyRunner` v1 준비됨; 두 문서화된 스텁은 `deferred`를 보고하고 launch를 거부.
- [ ] `prepare()`가 config + `>=3` seed + env를 해시 가능한 `RunSpec`으로 동결; 동일 입력 → 동일 `spec_hash`.
- [ ] 모든 launch가 compute 전에 ledger 항목을 생성; 유발된 크래시도 `failure_mode`를 가진 `aborted`/`invalid` 항목을 남김(entry-on-launch 불변식; ADR-0003 §Decision 6).
- [ ] toy run이 하드 예산 하에서 seed별로 작은 PyTorch 모델 + baseline(R11)을 실행; 상한 위반은 종료되고 분류됨.
- [ ] 비-`invalid` verdict 전에 `repro_gate`가 단언됨; verdict는 사전 등록된 `decision_rule`로부터 옴(HARKing 없음); 결과는 추가되고 결코 덮어쓰이지 않음.
- [ ] `writeback_observed`가 `measured`로 수집되거나 `null`로 남음; 어떤 CAW-01/CAW-02/CAW-05 스토어에도 쓰기 없음.
- [ ] P2 종료 시연됨: 하나의 실제 항목 + 하나의 의도적 실패 항목, 둘 다 노출됨; [milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) P2 게이트와 M1 box 5와 일치.
- [ ] 트리가 그린(컴파일 성공, lint 통과)임.

## Rollback / safety
- `launch()`가 항목을 먼저 생성하기 때문에, 어떤 runner 크래시도 부분적인 `EXP-XXXX/` 항목을 남기는 것이 *예상된다* — 그것은 손상이 아니라 원하는 상태다. 복구 = `failure_mode`와 함께 `aborted`/`invalid`로 최종 확정; 결코 삭제하지 않음.
- toy run이 호스트 리소스를 초과할 위험이 있으면, `budget` 상한(`max_mem_gb`, `max_wallclock_s`, `updates_max`)이 프로세스를 하드킬해야 한다; 상한 위반은 `budget-exceeded`/`oom` 음성 결과이지, 상한을 조용히 올릴 이유가 아니다.
- 비-`invalid` verdict를 얻으려고 `repro_gate`를 우회하지 않으며, 결과를 본 후 대체 항목을 통하지 않고는 `decision_rule`을 변경하지 않는다 — 어느 쪽이든 재현 불가능하거나 체리피킹된 발견을 제조하게 된다.
- runner 모듈이 리팩토링 중이고 레드면, 실제 compute를 시작하기 전에 마지막 그린 커밋으로 되돌린다.

## Hand-off
P3 런북(implication map + `wbtraffic.v0`)은 다음을 가정할 수 있다: verdict와 seed별 메트릭을 가진 append-only ledger 항목을 산출하는 작동하는 `LocalToyRunner`, 모델링된 L0 추정치를 *지반화(ground)*하기 위한 선택적 `writeback_observed` 측정 훅(measured-vs-modeled 플래그됨), 그리고 어떤 run도 ledger를 벗어나지 못한다는 entry-on-launch 보장. P4 export 어댑터는 깨끗한 repro 블록을 가진 `supported`/`refuted` 항목만이 (CAW-02로) 증거를 export할 자격이 있으며, `writeback_observed`를 CAW-01로 낮추는 것은 경계를 가로지르는 export이지 — 결코 공유 스토어가 아님을 가정할 수 있다.

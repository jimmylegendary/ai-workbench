# Experiment Runner Service — ExperimentRunner 포트 + v1 토이 runner + 재현성 캡처

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md)
  - [./scout-service_ko.md](./scout-service_ko.md)
  - [./persistence_ko.md](./persistence_ko.md)
  - [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)
  - [../02-research/experiment-ledger_ko.md](../02-research/experiment-ledger_ko.md)
  - [../02-research/ttt-landscape_ko.md](../02-research/ttt-landscape_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
`ExperimentRunnerAdapter` **포트**, **v1 최소 로컬 토이 runner**, 그리고 모든 verdict를 게이트하는 **재현성
캡처(reproducibility capture)**를 정의한다(ADR-0003). 이 문서는 run을 어떻게 시작하는지, config+seed+env를 어떻게
고정(freeze)하는지, CAW-01 브리지를 위해 쓰기측(write-side) 동작을 어떻게 선택적으로 계측하는지, 그리고 **모든 실행이
ledger 항목을 생성한다**는 규칙(실패 포함)을 확정한다. 이 문서는 ledger 스키마(그것은 [ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md)
/ [../02-research/experiment-ledger_ko.md](../02-research/experiment-ledger_ko.md))나 writeback 스키마(ADR-0004)를
정의하지 않는다. 이 문서는 `verdict`(→ Evidence)와 선택적 `writeback_observed` 훅을 *생산*한다.

## 포트
```
Protocol ExperimentRunnerAdapter:
  name: string
  health() -> HealthStatus              # v1 toy="ready"; external compute/HW stubs="deferred"
  prepare(plan: ExpPlan) -> RunSpec     # freeze config+seeds+env; returns a frozen, hashable spec
  launch(spec: RunSpec) -> RunHandle    # MUST create a ledger entry immediately (even before work starts)
  poll(handle) -> RunState              # queued|running|done|crashed
  collect(handle) -> RawResults         # per-seed metrics + artifact paths + optional write counters
```
- **v1 adapter:** `LocalToyRunner` — 빡빡한 예산 하에서 작은 모델을 로컬로 실행함(brief §11: 토이 규모만,
  대규모 실제 TTT 없음). **스텁(문서화됨):** `ExternalComputeRunner`, `HardwareRunner` — Protocol을 구현하고
  `HealthStatus="deferred"`를 보고함(brief §9).
- **실행 시 항목 생성 불변식(Entry-on-launch invariant):** `launch()`는 작업을 하기 **전에** ledger 항목을 쓴다.
  따라서 크래시가 나도 항목은 남는다(`verdict=invalid`, `failure_mode=setup-error`/`oom`). 이는 ledger 밖 실행 누수를
  막는다(ADR-0003 §6).

## v1 최소 토이 runner 흐름
```
exp.run(plan_id, runner="LocalToyRunner"):
  spec = prepare(plan)            # config frozen to a file; >=3 seeds; code rev + env locked
  assert repro_gate(spec).ok      # else verdict forced to "invalid"; no other verdict admissible
  handle = launch(spec)           # ledger entry EXP-XXXX created here, status=running
  results = collect(handle)       # per-seed metrics (+ optional write counters)
  verdict = decide(results, plan.prediction.decision_rule)   # pre-registered rule; no HARKing
  exp.log_result(EXP-XXXX, results, verdict)                 # append-only; never overwrite
```

### 첫 재현 타깃 (ttt-landscape §6에서)
| Target | Variant | 왜 먼저인가 | 무엇을 검증하는가 |
|---|---|---|---|
| #2 | TTT-Linear (inner-loop fast-weight) | 높은 업데이트 빈도, 작은 state | `update.granularity`, `write_bw` |
| #4 | ARC LoRA TTT (per-task) | 낮은 빈도, 큰 optimizer state | `optimizer_state_bytes`, residency |
둘은 함께 write 빈도 / optimizer state 트레이드오프의 양극단과 대부분의 writeback 필드를 아우른다.

## 재현성 게이트 (MUST 항목, 실행 전 — ADR-0003 §3)
모든 MUST 항목이 통과할 때까지 run은 `invalid` 외의 어떤 verdict에도 도달할 수 없다. 게이트는
`artifacts/EXP-XXXX/REPRO.md`를 내보낸다.

| 항목 | MUST | 자동 검사 가능 |
|---|---|---|
| R1 config 고정 | config는 커밋된 파일; 숨겨진 CLI 인자 없음 | yes (hash diff) |
| R2 seeds | ≥3 seed, seed별 metric 기록 | yes (count) |
| R3 code rev 고정 | runner + 제품 git rev 기록 | yes |
| R4 env 잠금 | lib 버전 + 컨테이너 digest | yes |
| R5 data 명시 | dataset id + split + hash | partial |
| R6 decision rule 사전 등록 | results 채우기 **전에** `decision_rule` 고정 | yes (timestamp 순서) |
| R7 hardware/budget | hw, wallclock, budget 기록 | yes |
| R11 baseline | treatment 옆에 baseline run 로깅 | yes (존재 여부) |
| R12 failure 로깅 | 비성공은 `failure_mode`를 동반 | yes |

results를 본 후 decision rule을 바꾸는 것은 편집이 아니라 **새로운 대체(superseding) 항목**이다 — 원본은
보존된다(체리피킹 방지 가드, ADR-0003 §3 R6).

```yaml
# RunSpec (frozen, hashable) — persisted under artifacts/EXP-XXXX/
spec_hash: <sha256 of this block>
hypothesis_id: HYP-0007
claim_ref: CLM-0012
prediction: { metric: accuracy, baseline: <ref>, expected_direction: ">", decision_rule: ">= +2pp on >=2/3 seeds" }
seeds: [11, 23, 42]
code_rev: { runner: <git-sha>, product: <git-sha> }
env: { python: TODO(open-question: pin), libs: TODO, container_digest: TODO }
data: { dataset_id: <id>, split: <split>, hash: <sha256> }
budget: { max_wallclock_s: TODO, max_mem_gb: TODO }
```

## Verdict 의미론 (과대주장 없음 — ADR-0003 §2)
| Verdict | 의미 | 의미가 아닌 것 |
|---|---|---|
| `supported` | 토이 결과가 규칙 하에서 예측 방향과 일치함 | "대규모에서 참" / 확정된 claim |
| `refuted` | 토이 결과가 규칙 하에서 예측과 모순됨 | "아이디어가 무가치하다" |
| `inconclusive` | 깔끔히 실행됐으나 규칙 미충족(효과가 노이즈 범위) | 로깅 실패 |
| `invalid` | 셋업이 깨짐(OOM, 버그, data leak) | `refuted` |

`supported` 토이 verdict는 `Evidence` 레코드(`evidence_kind=experiment`)와 **제안된** `StatusEvent`를 생성한다.
사람이 모든 `supported` export를 확인한다(brief §12). `failure_mode ∈ {oom, budget-exceeded, nonconvergence,
no-effect, flaky, setup-error}`는 실패를 서사가 아니라 쿼리 가능하게 만든다.

## 쓰기측 계측 (선택적 CAW-01 훅)
run이 쓰기측 동작을 측정할 수 있을 때, `collect()`는 `writeback_observed`(`weights_updated`, `state_lifecycle`,
쓰여진 바이트 수, `optimizer_state_bytes`)를 채우며, 이는 모델링된 `wbtraffic.v0` 숫자를 **근거짓는다(ground)**
(ADR-0004 §2) — *측정된* 값은 *모델링된* 값과 구별되도록 표시된다. 이것은 자기 기술적 번들을 공급하는 export 훅이며,
CAW-01과의 **공유 저장소가 절대 아니다**(별도 제품; 객체 이름 재검증).
```yaml
writeback_observed:          # optional; null where unmeasured (never an invented number)
  weights_updated: TODO(open-question: which tensors a toy run actually rewrites)
  bytes_per_update: null
  optimizer_state_bytes: null
  measurement: "measured"    # distinguishes from modeled estimates
```

## 미해결 질문(Open Questions)
- TODO(open-question: is 3 seeds enough for seed-sensitive TTT, or a variance-driven adaptive count; ADR-0003.)
- TODO(open-question: can a toy run meaningfully measure write-side bytes / optimizer residency at v1 scope, or does it need integration beyond v1; ADR-0003/0004.)
- TODO(open-question: env pinning mechanism — container digest vs lockfile only; this doc R4.)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북에 대한 함의
- RB: `ExperimentRunnerAdapter` Protocol + 실행 시 항목 생성을 강제하는 `LocalToyRunner` v1.
- RB: `REPRO.md`를 내보내는 실행 전 repro 게이트(R1–R7, R11, R12); 통과(green) 전까지 verdict는 강제로 `invalid`.
- RB: 사전 등록 순서 검사(decision_rule timestamp < results timestamp).
- RB: 한 variant에 대한 선택적 `writeback_observed` 수집기(ADR-0004 Option B).

# 소규모 실험 원장(Small-Experiment Ledger) — 핵심 명세

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (이 명세가 구현하는 결정)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (verdict → Evidence + StatusEvent)
  - [./writeback-traffic-schema.md](./writeback-traffic-schema_ko.md) (`writeback_observed`가 모델링된 추정치를 근거로 뒷받침)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger_ko.md) (연구 근거)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape_ko.md) (어떤 변형을 먼저 재현할지)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-06의 소규모 실험 원장에 대한 **구현 지향(build-facing) 명세**다: 항목 레코드, 사전 등록된
결정 규칙(pre-registered decision rule), 네 가지 값을 갖는 verdict, reproducibility gate, 그리고
부정적 결과(negative result)를 보존/노출하는 메커니즘을 다룬다. 이 문서는
[ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md)을 빌더가 구현할 수 있는 구체적인 필드, 상태,
검사로 옮긴 것이다. 결정 자체를 재정의하지 **않으며**(ADR 참조), hypothesis 표현을 명세하지 않고
([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md) — 원장은 단지 `Evidence` 레코드가 되는
verdict를 *방출(emit)*할 뿐이다), `ExperimentRunnerAdapter` 내부를 정의하지 않으며, writeback 스키마를
소유하지도 않는다([형제 문서](./writeback-traffic-schema_ko.md) — 원장은 선택적
`writeback_observed` 훅만 방출한다). 중복하지 말고 상호 링크하라.

## 불변식(Invariants, 타협 불가)
1. **한 번의 run = 하나의 append-only 항목.** 시작된 모든 실행은 — 크래시를 포함해 — 항목이 된다. 정정은
   `supersede`하며, 어느 것도 제자리에서 편집되거나 삭제되지 않는다. (brief §5, §7)
2. **과대주장 금지(No overclaim).** 장난감(toy) 규모에서의 `supported` verdict는 *hypothesis 상태 갱신*일
   뿐, 결코 확정된 주장이 아니다. 모델링/생성된 산출물은 결코 증거가 아니다. (brief §5, §12)
3. **실패는 일급(first-class) 시민이다.** 부정적 결과는 보존, 분류되며 **기본적으로** 노출된다 — 결코
   조용히 버려지지 않는다. (brief §5, §12)
4. **구조적으로 재현 가능(Reproducible by construction).** repro gate를 통과하기 전까지는 `invalid` 이외의
   어떤 verdict에도 도달할 수 없다.
5. **독립성(Independence).** 익스포트는 명시적 파일/API 경계를 넘으며, CAW-01/CAW-02/CAW-05와 공유 저장소를
   두지 않는다. (brief §8)

## 라이프사이클(상태 기계)
```
            launch
  (none) ───────────► planned ──► running ──► done
                         │           │          │
                         │           └─► aborted │ (crash/kill mid-run → entry still written)
                         └────────────────────► invalid (gate failed OR setup broken)

  verdict assigned only at `done`, gated by the repro gate:
     done + gate-pass  →  { supported | refuted | inconclusive }
     gate-fail OR setup-broken (any state)  →  invalid
```
- `status`는 운영적이며(run이 어디에 있는지), `verdict`는 과학적 결과다(오직 `done`에서만 의미를 가짐).
- run은 어느 상태에서든 `invalid`에 도달할 수 있다. `invalid`는 주장에 대해 아무것도 말하지 않으며, 오직
  셋업에 대해서만 말한다.
- `ExperimentRunnerAdapter` v1은 컴퓨트가 시작되기 *전에* `planned`/`running` 상태에서 항목을 생성해야
  **MUST** 하며, 그래야 크래시가 발생해도 레코드가 없는 대신 `aborted`/`invalid` 항목이 남는다(원장 외부에서
  도는 run이 새는 문제를 막음; ADR-0003 §6).

## 항목 레코드(markdown front-matter + JSON twin; 산출물은 경로로)
run당 하나의 항목을 `store/ledger/EXP-XXXX/` 아래에 둔다. 스키마의 권위 있는 출처는
[../02-research/experiment-ledger.md](../02-research/experiment-ledger_ko.md)이며, 여기서는 구현 계약으로 재현한다:

```yaml
id: EXP-0007                      # stable, monotonic
hypothesis_id: HYP-0003           # ADR-0002 card; repeated attempts share this id
claim_ref: CLAIM-0011             # source claim being probed (ingestion)
title: "Per-instance LoRA TTT lifts toy ARC-like task vs frozen base"
status: planned|running|done|aborted
verdict: supported|refuted|inconclusive|invalid   # set only at done (or invalid)
created: TODO                     # do not invent dates
boundary: internal                # provenance/scope tag (brief §7)

prediction:                       # PRE-REGISTERED — frozen before results exist (gate R6)
  metric: "accuracy on held-out toy grid tasks"
  baseline: "frozen base model, in-context only"
  expected_direction: "TTT > baseline"
  expected_effect: "TODO(open-question: magnitude prior — no invented numbers)"
  decision_rule: "supported iff (mean_delta > 2*pooled_stderr) across >=3 seeds; \
                  refuted iff opposite direction beyond the same band; else inconclusive"

repro:                            # see the gate table below
  config_path: "artifacts/EXP-0007/config.yaml"   # full hyperparameters, frozen, hashed
  seeds: [0, 1, 2]                                 # >=3, not one
  code_rev: "git:abcd123"                          # runner + this product
  data_ref: "artifacts/EXP-0007/data/ (toy, synthetic gen-seed)"
  env_lock: "artifacts/EXP-0007/env.lock"         # lib versions + container digest
  hardware: "1x consumer GPU, 8GB / or CPU-only"
  determinism: "seeded; cudnn deterministic=on; known nondeterminism noted"
  budget: { wallclock_max: "30m", cost_max: "toy", updates_max: 100 }

results:                          # incl. failures, first-class
  metrics_path: "artifacts/EXP-0007/metrics.json"
  summary: "mean+/-stderr per seed; baseline vs TTT"
  observed_effect: "TODO until run"
  negative_result: false
  failure_mode: null              # controlled vocab below

writeback_observed:               # OPTIONAL CAW-01 hook (sibling schema); not a CAW-01 commitment
  weights_updated: true
  state_lifecycle: "per-request, discarded on completion"
  bytes_per_update_measured: null # a MEASURED number grounds a MODELED estimate (flagged distinctly)
  optimizer_state_bytes: null

lineage:
  supersedes: null                # EXP id this re-run replaces/refines
  derived_from: null
evidence_link: "exported to CAW-02 only after verdict in {supported, refuted} + clean repro"
```

## 사전 등록된 결정 규칙(pre-registered decision rule)
HARKing(결과를 안 뒤에 가설을 세우는 것)과 seed 체리피킹이 이것이 제거하려는 실패 양식이다.

- `decision_rule` + `seeds` + `prediction`은 **`results`가 채워지기 전에 커밋된다**(gate 항목 R6). 이는
  append-only 계보(lineage)로 강제된다: 항목은 먼저 비어 있는 `results` 블록과 함께 존재한다.
- 결과가 규칙 변경을 강제한다면, 그것은 원본을 가리키는 `supersedes`를 가진 **새 항목**이다 — 원본(그리고
  이제는 "틀린" 규칙)은 보존되므로, "올바른 규칙/seed를 찾아 헤매는" 흔적이 가시적으로 남는다.
- 규칙은 `metrics.json`으로부터 **기계적으로 평가 가능**해야 한다: 지표(metric), 베이스라인(baseline),
  방향(direction), 그리고 seed 분포에 대해 표현된 임계값(예: effect 대 pooled stderr). 산문만으로 된 규칙은 금지.

## Verdict 의미론(과대주장 금지)
| Verdict | 의미 | 아닌 것 | 매핑(ADR-0002) |
|---|---|---|---|
| `supported` | toy 결과가 규칙 하에서 예측된 방향과 일치 | "규모에서 주장이 참이다" | `Evidence(experiment)` + 제안된 `StatusEvent`→`supported` (사람 확인) |
| `refuted` | toy 결과가 규칙 하에서 예측에 반함 | "그 아이디어는 무가치하다" | `Evidence(experiment)` + 제안된 `StatusEvent`→`refuted` |
| `inconclusive` | 깔끔하게 실행됐으나 규칙 미충족(효과가 노이즈 범위 내) | 로깅 실패 | 상태 변경 없음; 보존 + 노출 |
| `invalid` | 셋업 깨짐(OOM, 버그, data leak, gate-fail) | `refuted` | 상태 변경 없음; 절대 증거로 익스포트하지 않음 |

`supported` toy verdict는 상태 변경을 *제안*한다. **모든 `supported` 익스포트는 사람이 확인한다**(brief §5,
§12; ADR-0001 review gate). run에서 나온 측정된(measured) 수치는 증거이지만, 모델링된(modeled) 수치는
아니다(그것은 결코 상태를 승격시킬 수 없다 — ADR-0002의 하드 evidence cap).

## Reproducibility gate
run은 모든 **MUST** 항목이 통과할 때까지 `invalid` 이외의 어떤 verdict로도 이동할 수 없다. gate는
`artifacts/EXP-XXXX/REPRO.md`를 방출하며 가능한 경우 기계 검사된다.

| # | 항목 | Level | 자동 검사 가능 | 강제 주체 |
|---|---|---|---|---|
| R1 | 전체 config가 파일로 동결, 숨겨진 CLI 인자 없음 | MUST | yes (file + hash) | gate가 verdict 거부 |
| R2 | seed >= 3개; seed별 지표 기록 | MUST | yes (count) | gate |
| R3 | code revision 고정(runner + product) | MUST | yes (rev resolves) | gate |
| R4 | 환경 잠금(lib 버전 + container digest) | MUST | yes (lock present) | gate |
| R5 | 데이터 완전 명세(gen-seed 또는 dataset ref + split) | MUST | partial | gate + review |
| R6 | 결정 규칙이 결과 **전에** 사전 등록 | MUST | partial (lineage/empty-results check) | append-only ordering |
| R7 | 하드웨어 + wallclock + budget 기록 | MUST | yes | gate |
| R8 | 알려진 비결정성 선언 / determinism 플래그 on | SHOULD | partial | review |
| R9 | 분산 보고(stderr/CI), 점추정치만이 아님 | SHOULD | yes | review |
| R10 | one-command 재실행이 `metrics.json` 재생성 | SHOULD | yes (exit 0) | review |
| R11 | baseline run이 treatment와 나란히 로깅 | MUST | yes (baseline id) | gate |
| R12 | negative/failure run이 `failure_mode`와 함께 로깅 | MUST | yes | gate |

> R6은 안티 체리피킹 가드다. 결정 규칙과 seed는 `results`가 채워지기 *전에* append-only 계보로 동결된다.
> 결과를 본 뒤 그것을 바꾸는 것은 supersede 항목이며, 결코 제자리 편집이 아니다.

## 부정적 결과: 보존, 분류, 노출
세 개의 계층이 최고 run만 보관하는 잘 알려진 편향에 대응한다(ADR-0003 §4):

**1. 보존(Retention).** 시작된 모든 run은 항목이다. `aborted`/`invalid`/`inconclusive`/`refuted`는 성공과
*동일한* 스키마를 사용한다. append-only + `supersedes`는 재실행이 자신이 대체하는 실패를 결코 덮어쓰지 않음을
의미한다. 큰 실패 산출물(crash log, 발산하는 loss 곡선)은 동일한 `artifacts/EXP-XXXX/` 아래에 경로로 남는다.

**2. 분류(Classification).** 모든 비성공 run은 통제된 `failure_mode`를 가지므로 실패가 산문이 아닌
질의 가능한 데이터가 된다:

| `failure_mode` | 의미 | 전형적 후속 조치 |
|---|---|---|
| `oom` / `budget-exceeded` | 메모리 또는 wallclock/cost 상한 도달 | model/seq-len 축소; 범위 재설정 |
| `nonconvergence` | 내부 루프 TTT 업데이트가 수렴하지 않음 | LR/steps 튜닝; 그 자체로 발견일 수 있음 |
| `no-effect` | 깔끔히 실행됐으나 treatment ≈ baseline | 강한 부정; 보존 + 노출(→ 흔히 `inconclusive`/`refuted`) |
| `flaky` | 높은 seed 분산, 불안정한 verdict | seed 추가; 분산 보고 |
| `setup-error` | 버그, data leak, 잘못된 baseline | 수정 후 새 항목으로 재실행(→ `invalid`) |

**3. 노출(Surfacing).** 실패는 기본적으로 가시적이며 결코 묻히지 않는다:
- CLI/MCP **부정적 결과 뷰**가 모든 `refuted`/`inconclusive`/null이 아닌 `failure_mode` 항목을
  `hypothesis_id`와 `failure_mode`로 그룹화해 나열한다. 기본 정렬은 실패를 숨기지 않고 노출한다.
- 각 hypothesis 카드는 전체 승/패 이력을 보여준다. 실패만 있는 hypothesis는 가시적으로 미지지(unsupported)
  상태로 남는다.
- `no-effect`/`refuted` 결과는 그 자체로 CAW-02로 **익스포트 가능한 발견**이다("toy 재현이 조건 Y 하에서
  주장 X를 재현하지 못함"). 또한 write-side 동작에 관한 경우 CAW-01 open question의 씨앗이 될 수 있다.
  미래 워크로드 가정을 *막는* 부정적 결과는 노이즈가 아니라 높은 가치를 지닌다.

이는 가치 단위를 end-to-end로 정직하게 유지한다: `source → claim → hypothesis → small experiment →
result(실패 포함) → implication`, 실패 노드는 내구적이고 발견 가능하다(brief §2).

## CAW-01 훅(공유 저장소가 아닌 익스포트)
run이 write-side 동작을 측정할 때, `writeback_observed`(weights updated, state lifecycle, 측정된
`bytes_per_update`, optimizer-state 크기)가 [writeback-traffic schema](./writeback-traffic-schema_ko.md)를
채운다 — *모델링된* 추정치를 *측정된* 것으로 근거 보강하며, 구분되게 플래그된다. 이것은 `ExportAdapter`를 통한
익스포트 훅이며, CAW-06은 결코 CAW-01의 저장소에 쓰지 않는다. 첫 재현 대상(ADR-0003 §context;
ttt-landscape §6): **TTT-Linear (#2, 고빈도 소규모 write)** 와 **ARC LoRA TTT (#4, 버스트성 +
optimizer-state)** — write 빈도 / optimizer-state 트레이드오프의 양 극단.

## 트레이드오프(수용됨)
| 결정 | 장점 | 단점 / 비용 |
|---|---|---|
| Append-only, 편집 말고 supersede | 전체 감사 추적; 재실행에도 실패가 살아남음 | 항목 증가; "현재 verdict" 리졸버 필요 |
| 사전 등록 규칙(R6) | 사후 체리피킹 제거 | 매 run 전 마찰 |
| toy 규모에서 seed >=3 MUST | seed에 민감한 TTT의 seed 운빨 포착 | 실험당 ~3배 toy 컴퓨트 |
| `invalid`을 `refuted`와 구별 | 셋업 버그가 발견인 척하지 못함 | 리뷰어가 `invalid`을 정직하게 분류해야 함 |
| 통제된 `failure_mode` 어휘 | 실패가 필터 가능한 데이터가 됨 | TTT 공간이 커지면서 어휘 유지보수 필요 |

## Open Questions
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적:
- `TODO(open-question:` 최소 seed 수 대 budget — seed에 민감한 TTT에 3개로 충분한가, 아니면 분산 기반
  적응형 개수가 필요한가? `)`
- `TODO(open-question:` 벤치마크 수치를 지어내지 않으면서 `prediction.expected_effect`에 대한 효과 크기
  *prior*를 어떻게 정하나? `)`
- `TODO(open-question:` toy run이 write-side 동작(written bytes, optimizer-state residency)을 의미 있게
  측정해 writeback 스키마에 공급할 수 있는가, 아니면 v1의 toy 범위를 넘어서는 runner 통합이 필요한가(brief §11)? `)`
- `TODO(open-question:` 공개 TTT 비용 주장(latency 배수, memory O(T·d))의 독립 검증 —
  벤더/블로그 대 peer-reviewed; 익스포트 전에 표시. `)`
- `TODO(open-question:` 큰 실패 산출물의 보존/GC — 경로로 영구 보관할지, 요약 + 정리(prune)할지? `)`

## 런북에의 함의
- **RB (ledger store):** `store/ledger/EXP-XXXX/` 아래의 append-only 항목 저장(markdown/JSON, 산출물은 경로로);
  `supersedes` 계보 리졸버; "현재 verdict" 뷰.
- **RB (repro gate):** R1–R7, R11, R12를 검사하는 사전 run gate; 통과 전까지 `invalid` 이외의 어떤 verdict도
  거부; `REPRO.md` 방출.
- **RB (`ExperimentRunnerAdapter` v1):** *모든* launch에서 원장 항목을 생성하는 최소한의 로컬 toy runner,
  크래시 포함(→ `aborted`/`invalid`).
- **RB (부정적 결과 노출):** CLI/MCP 부정적 결과 뷰 + hypothesis별 이력; 실패는 기본 노출.
- **RB (export hooks):** 깔끔한 repro 블록을 가진 `supported`/`refuted`만 CAW-02로 증거를 익스포트;
  `writeback_observed`는 CAW-01 익스포트([형제](./writeback-traffic-schema_ko.md))에 공급 — 결코 공유 저장소가 아님.

> 독립성 리마인더: CAW-01/CAW-02/CAW-05는 **별개의 제품**이다. 원장은 명시적 파일/API 경계를 넘어
> 익스포트하며, 그들과 어떤 런타임 기반, 저장소, 레지스트리도 공유하지 않는다.

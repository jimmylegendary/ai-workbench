# 소규모 실험 원장(Small-Experiment Ledger)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF_ko.md)
  - [DOC-CONVENTIONS](../_meta/DOC-CONVENTIONS_ko.md)
  - `../01-decisions/ADR-0003-experiment-ledger.md` (TODO: 작성 예정)
  - `../08-research-plan/open-questions.md` (TODO: 생성 예정)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **소규모 실험 원장의 데이터 모델과 규율(discipline)을 결정한다.** 즉, CAW-06가 *검증 가능한(checkable)* TTT
주장에 대한 최소 재현(minimal reproduction) / 토이 실험(toy experiment)을 빠듯한 자원 제약 하에서 기록하는 장소이며,
실행(run)을 재현하기에 충분한 메타데이터(config + seed + env)를 갖추고, **음성 결과(negative result)는 폐기하지 않고
보존하여 드러내는** 곳이다. 이 문서는 세 가지를 제공한다: (1) **원장 항목(ledger entry) 모델**, (2) **재현성 체크리스트**,
(3) **음성 결과 보존 + 표출(surfacing)** 메커니즘.

이 문서가 다루지 **않는** 것: 가설 표현 / 불확실성 태깅(이는 별도의 형제 ADR), `ExperimentRunnerAdapter` 인터페이스 내부
구현, CAW-01로 보내는 writeback-traffic 스키마 익스포트(별도 문서), 소스로부터 주장을 추출하는 방법. 원장은 가설을
소비하여 verdict + 증거 링크를 산출하며, 가설이 *무엇을 의미하는지*는 결정하지 않는다.

## 배경: 작은 예산으로 TTT 주장을 "검증 가능"하게 만드는 것은 무엇인가

TTT(test-time training / test-time compute)는 동결된(frozen) 가중치를 읽기만 하는 것이 아니라 **추론 중에 모델
파라미터 또는 상태를 갱신하는** 방법들을 포괄한다. 공개 연구에서 가져온 근거 사례:

- **추론(reasoning)에 대한 인스턴스별 파라미터 갱신.** ARC에 대한 TTT는 테스트 인스턴스마다 (LoRA 방식으로) 파인튜닝하며,
  정적 파인튜닝 베이스 대비 큰 정확도 향상을 보고한다 — 토이 재현이 작은 규모에서 탐침(probe)할 수 있는 *측정 가능한
  델타를 가진 주장*이다. (`arxiv.org/abs/2411.07279`)
- **시퀀스 모델링 레이어로서의 TTT.** TTT 레이어는 요청마다 inner-loop SGD로 갱신되는 은닉 상태(hidden state)를
  지니며, 새로 초기화되었다가 **요청이 완료되면 폐기된다** — writeback-traffic 가설과 관련된 *기록-후-폐기
  (write-then-discard)* 수명주기다. (TTT-as-linear-attention 계열 연구, 예: `arxiv.org/pdf/2602.21204`)
- **비용 주장.** 공개 소스들은 TTT의 스텝당 오버헤드를 1B 모델 기준 약 150ms 범위로 두고, 읽기 전용 서빙 대비 약
  1.7~2.5배의 지연(latency) 오버헤드를 보고하며, 그래디언트/활성화에 대해 추가 메모리 O(T·d)를 든다고 한다.
  이는 *토이 규모에서 우리가 타당성 검증(sanity-check)할 수 있는 정량적 주장*이며 CAW-01 브리지의 씨앗이다.
  (예: `spheron.network` TTT 가이드; 수치는 벤더/블로그 출처 — `TODO(open-question: independent verification)`)

> 가드레일(brief §12 기준): 위 항목 중 어느 것에 대한 생성된 요약(generated summary)도 **증거가 아니다.** 원장이
> 존재하는 이유는 우리가 증거로 취급하는 *유일한* 것이 verdict가 기록된, 로깅되고 재현 가능한 실행이 되도록 하기
> 위함이다.

어떤 주장은 다음으로 환원될 수 있을 때 **원장 적격(ledger-eligible)**이다: 측정 가능한 양, 베이스라인, 예측된
방향/크기, 그리고 (아래의) 자원 예산 내에서 도달 가능한 정지 조건(stop condition). 그렇지 못하면 그것은 가설로 남으며
원장 대신 `08-research-plan/open-questions.md`로 라우팅된다.

## 원장 항목 모델

원장 항목 1개 = **실험 실행(run)** 1개(하나의 config + seed 하에 하나의 가설에 대한 단일 시도). 반복된 시도는
`hypothesis_id`와 `lineage`로 연결되는 별개의 항목이다. 저장은 패밀리 관례를 따른다: 항목당 markdown/JSON 레코드 1개;
대형 아티팩트(로그, 체크포인트, 플롯)는 인라인하지 않고 **경로로(by path)** 참조한다. 항목은 추가 전용(append-only)이며,
수정은 제자리 편집이 아니라 기존을 대체(supersede)하는 새 항목이다.

```yaml
# experiment-ledger entry (one run)
id: EXP-0007                      # stable, monotonic
hypothesis_id: HYP-0003           # links to hypothesis card (uncertainty-tagged elsewhere)
claim_ref: CLAIM-0011             # source claim being probed
title: "Per-instance LoRA TTT lifts toy ARC-like task vs frozen base"
status: planned | running | done | aborted
verdict: supported | refuted | inconclusive | invalid   # invalid = setup broken, not about the claim
created: TODO                     # do not invent dates
boundary: internal                # provenance/scope tag (brief §7)

# --- what is being tested ---
prediction:
  metric: "accuracy on held-out toy grid tasks"
  baseline: "frozen base model, in-context only"
  expected_direction: "TTT > baseline"
  expected_effect: "TODO(open-question: magnitude prior)"
  decision_rule: "verdict=supported iff delta > 2*pooled_stderr across >=3 seeds"

# --- reproducibility block (see checklist) ---
repro:
  config_path: "artifacts/EXP-0007/config.yaml"   # full hyperparameters, frozen
  seeds: [0, 1, 2]                                 # multiple, not one
  code_rev: "git:abcd123"                          # commit of runner + this product
  data_ref: "artifacts/EXP-0007/data/ (toy, synthetic)"
  env_lock: "artifacts/EXP-0007/env.lock"         # python+lib versions, container digest
  hardware: "1x consumer GPU, 8GB"                # or CPU-only
  determinism: "seeded; cudnn deterministic=on; known nondeterminism noted below"
  budget: { wallclock_max: "30m", cost_max: "toy", updates_max: 100 }

# --- results (incl. failures, first-class) ---
results:
  metrics_path: "artifacts/EXP-0007/metrics.json"
  summary: "mean+/-stderr per seed; baseline vs TTT"
  observed_effect: "TODO until run"
  negative_result: false          # true => see retention rules below
  failure_mode: null              # e.g. OOM | nonconvergence | no-effect | flaky | setup-error

# --- writeback signal (the CAW-01 export hook; optional) ---
writeback_observed:               # only if the run measured write-side behavior
  weights_updated: true
  state_lifecycle: "per-request, discarded on completion"
  notes: "feeds writeback-traffic schema export; NOT a CAW-01 commitment"

# --- provenance & lineage ---
lineage:
  supersedes: null                # EXP id this re-run replaces/refines
  derived_from: null              # parent experiment
evidence_link: "exported to CAW-02 only after verdict in {supported, refuted}"
```

### 필드 근거(트레이드오프)

| 필드 그룹 | 존재 이유 | 누락 시 비용 |
|---|---|---|
| `prediction.decision_rule` | 사전 등록된 합격/불합격을 강제하여 verdict가 사후(post-hoc)가 되지 않게 함 | 체리피킹; HARKing |
| `repro.seeds` (복수) | TTT 결과는 seed에 민감함; 단일 seed는 분산을 숨김 | 운 좋은 seed로 인한 거짓 "supported" |
| `repro.env_lock` | 라이브러리/CUDA 드리프트가 결과를 조용히 바꿈 | "내 컴퓨터에선 됨"; 비재현 |
| `verdict=invalid` | "주장이 틀림"과 "우리 셋업이 깨짐"을 분리 | 셋업 버그가 반증으로 오독됨 |
| `failure_mode` | 음성 결과를 서술뿐 아니라 쿼리 가능하게 함 | 실패가 검색 불가능한 산문이 됨 |
| `lineage.supersedes` | 추가 전용 + 이력 손실 없는 수정 | 감사 추적 상실; 조용한 재작성 |
| `writeback_observed` | CAW-01 스키마로의 선택적 브리지 | 기록 측 데이터 포착만을 위한 재실행 |

### Verdict 의미론(과잉주장 금지)

| Verdict | 의미 | 의미가 아닌 것 |
|---|---|---|
| `supported` | 토이 결과가 decision rule 하에서 예측된 방향과 일치 | "주장이 규모에서 참"이 아님 |
| `refuted` | 토이 결과가 decision rule 하에서 예측과 모순 | "아이디어가 무가치"가 아님 |
| `inconclusive` | 깔끔히 실행되었으나 decision rule 미충족(예: 효과가 노이즈 내) | 로깅 실패가 아님 |
| `invalid` | 셋업 깨짐(OOM, 버그, 데이터 누출); 주장에 대해 아무 말 안 함 | `refuted`가 아님 |

토이 규모의 `supported` verdict는 **가설 상태 갱신이지 결코 확정된 주장이 아니다**(brief §5, §12).
깔끔한 repro 블록을 가진 `supported`/`refuted` verdict만이 CAW-02로 익스포트 가능한 증거가 된다.

## 재현성 체크리스트

ML 재현성 체크리스트 전통(NeurIPS / Pineau v2.0)을 차용하여 토이 규모, 단일 운영자 제품에 맞게 다듬었다. 모든 MUST
항목이 충족되기 전까지 실행은 `verdict != invalid`로 이동할 수 없다. `artifacts/EXP-XXXX/REPRO.md`로 저장되며 가능한
곳에서는 기계 검증된다.

| # | 항목 | 수준 | 자동 검증 가능? |
|---|---|---|---|
| R1 | 전체 config가 파일(`config.yaml`)로 동결, 숨겨진 CLI 인자 없음 | MUST | 예 (파일 존재 + 해시) |
| R2 | seed >= 3개; seed별 메트릭 기록 | MUST | 예 (메트릭의 seed 수 카운트) |
| R3 | 코드 리비전 고정(`git:rev`) — runner + product | MUST | 예 (rev 해석됨) |
| R4 | 환경 잠금(라이브러리 버전 + 컨테이너 다이제스트 / `env.lock`) | MUST | 예 (lock 존재) |
| R5 | 데이터 완전 명세(합성 생성 seed, 또는 데이터셋 ref + split) | MUST | 부분 |
| R6 | 결과 채우기 **전에** decision rule 사전 등록 | MUST | 부분 (timestamp/lineage) |
| R7 | 하드웨어 + wallclock + 예산 기록 | MUST | 예 |
| R8 | 알려진 비결정성 선언(또는 결정성 플래그 켜짐) | SHOULD | 부분 |
| R9 | 분산 보고(stderr / CI), 점추정치만이 아님 | SHOULD | 예 |
| R10 | 단일 명령 재실행 스크립트가 `metrics.json` 재생성 | SHOULD | 예 (스크립트 exit 0) |
| R11 | 처리(treatment) 실행과 나란히 베이스라인 실행 로깅 | MUST | 예 (베이스라인 id 존재) |
| R12 | 음성/실패 실행을 `failure_mode`와 함께 로깅 | MUST | 예 |

> R6는 안티-체리피킹 가드다: decision rule과 seed는 `results`가 채워지기 *전에* (추가 전용 lineage를 통해) 커밋된다.
> 결과가 규칙 변경을 강제하면, 그것은 원본을 보존하는 **새** 항목(`supersedes`)이다 — 따라서 "올바른 seed 찾기"는
> 보이는 흔적을 남긴다(ML 재현의 문서화된 실패 모드).

## 음성 결과: 보존과 표출

Brief §5/§12는 실패를 **일급(first-class)**으로 만든다. 위험은 최고의 실행만 보존되고 나머지는 조용히 버려져 기록을
왜곡하는, 잘 문서화된 ML 편향이다. 원장은 이를 세 계층에서 막는다:

**1. 보존(아무것도 삭제되지 않음).** 시작된 모든 실행은 항목이다. `aborted`/`invalid`/`inconclusive`/`refuted`
실행은 성공과 동일한 스키마로 보존된다. 추가 전용 + `supersedes`는 재실행이 그것이 대체하는 실패를 결코 덮어쓰지 않음을
의미한다. 대형 실패 아티팩트(예: 크래시 로그, 발산하는 손실 곡선)는 동일한 `artifacts/EXP-XXXX/` 디렉터리 아래에
경로로 보존된다.

**2. 분류(실패가 쿼리 가능함).** 모든 비성공은 통제된 어휘로부터의 `failure_mode`를 지녀서 원장이 읽히기만 하는 게
아니라 필터링될 수 있다:

| `failure_mode` | 의미 | 전형적 후속 조치 |
|---|---|---|
| `oom` / `budget-exceeded` | 메모리 또는 wallclock/비용 상한 도달 | 모델/seq-len 축소; 범위 재설정 |
| `nonconvergence` | inner-loop TTT 갱신이 수렴하지 않음 | LR/스텝 조정; 그 자체가 발견일 수 있음 |
| `no-effect` | 깔끔히 실행, 처리 ≈ 베이스라인 (→ 종종 `inconclusive`/`refuted`) | 강한 음성; 보존 + 표출 |
| `flaky` | 높은 seed 분산, 불안정한 verdict | seed 더 늘림; 분산 보고 |
| `setup-error` | 버그, 데이터 누출, 잘못된 베이스라인 (→ `invalid`) | 수정 후 새 항목으로 재실행 |

**3. 표출(실패가 기본적으로 보임).** 음성 결과는 묻히지 않는다:

- CLI/MCP의 **음성 결과 뷰(negative-results view)**는 모든 `refuted` / `inconclusive` / non-null `failure_mode`
  항목을 `hypothesis_id`와 `failure_mode`로 그룹화하여 나열한다.
- 각 **가설 카드(hypothesis card)**는 전체 실행 이력(성공 *및* 실패)을 보여준다; 실패만 있는 가설은 사라지지 않고
  눈에 띄게 미지지(unsupported) 상태로 남는다.
- `no-effect` 또는 `refuted` 결과는 그 자체로 CAW-02로의 **익스포트 가능한 발견**("토이 재현이 조건 Y 하에서 주장
  X를 재현하지 못함")이며, 기록 측 동작과 관련된다면 CAW-01의 **open question**을 시드할 수 있다. 미래 워크로드 가정을
  *차단(block)*하는 음성 결과는 노이즈가 아니라 고가치다.

이는 가치 단위(brief §2)를 처음부터 끝까지 정직하게 만든다: `source → claim → hypothesis → small experiment →
result (실패 포함) → implication`, 여기서 *실패* 노드는 영구적이고 발견 가능하다.

## 이 원장 설계의 트레이드오프

| 결정 | 장점 | 단점 / 비용 |
|---|---|---|
| 추가 전용, 편집 말고 대체(supersede) | 완전한 감사 추적; 실패가 살아남음 | 항목 증가; "현재" 해석 뷰 필요 |
| 사전 등록 decision rule (R6) | 사후 체리피킹 제거 | 매 실행 전 약간의 마찰 |
| Markdown/JSON + 경로별 아티팩트 | 패밀리에 부합; diff 가능; 가벼움 | 작은 인덱스 계층 없이는 풍부한 쿼리 불가 |
| 통제된 `failure_mode` 어휘 | 실패가 필터링 가능한 데이터가 됨 | TTT 공간 성장 시 어휘 유지보수 필요 |
| 토이 규모에서 seed >= 3 MUST | 작은 예산에서 seed-운(seed-luck) 포착 | 실험당 토이 컴퓨트 약 3배 |
| Verdict `invalid`를 `refuted`와 구분 | 셋업 버그가 발견인 척하지 않음 | 리뷰어가 `invalid`를 정직하게 분류해야 함 |

## 미해결 질문(Open Questions)

이들을 `../08-research-plan/open-questions.md`에서 추적한다(TODO: 생성):

- `TODO(open-question:` 최소 seed 수 대 예산 — seed에 민감한 TTT에 3개로 충분한가, 아니면 분산 주도의 적응형 seed
  수가 필요한가? `)`
- `TODO(open-question:` 우리가 벤치마크 수치를 지어낼 수 없다는 점을 고려할 때, 어떤 실행 전에 `prediction.expected_effect`가
  지녀야 할 효과 크기 *prior*는 무엇이어야 하는가? `)`
- `TODO(open-question:` 토이 실행이 writeback-traffic 스키마에 공급하기 위해 기록 측 동작(가중치 갱신, optimizer-state
  residency, 기록 볼륨)을 의미 있게 측정할 수 있는가, 아니면 v1의 토이 범위를 넘는 실제 runner 통합이 필요한가(brief §11)? `)`
- `TODO(open-question:` 운영자가 원장 밖에서 실험을 실행할 때 조용한 누락(silent drop)에 대해 어떻게 편향을 제거하는가
  — 매 실행마다 항목 생성을 *강제*하도록 `ExperimentRunnerAdapter`가 필요한가? `)`
- `TODO(open-question:` 공개 TTT 비용 주장(지연 배수, 메모리 O(T·d))의 독립 검증 — 이것들은 벤더/블로그 수치인가
  동료 심사를 거친 것인가? 익스포트 전 그에 맞게 표시할 것. `)`
- `TODO(open-question:` 대형 실패 아티팩트에 대한 보존/GC 정책 — 경로로 영구 보존할 것인가, 아니면 메트릭은 유지하되
  N일 후 요약 + 정리(prune)할 것인가? `)`

## 런북에 대한 함의(Implications for runbooks)

- **RB (원장 저장소):** 추가 전용 항목 저장(markdown/JSON, 경로별 아티팩트), `supersedes` lineage 해석기,
  "현재 verdict" 뷰를 구현한다. 스키마 = 위의 YAML.
- **RB (repro 강제):** R1–R7, R11, R12(MUST 항목)를 점검하고 통과하기 전까지 실행을 `invalid` 외의 어떤 것으로도
  표시하기를 거부하는 사전 실행 게이트; `artifacts/EXP-XXXX/REPRO.md`를 방출한다.
- **RB (`ExperimentRunnerAdapter` v1):** 최소 로컬 토이 runner는 매 실행마다(크래시 → `invalid`/`aborted` 포함)
  원장 항목을 생성해야(MUST) 실패가 조용히 누락될 수 없게 한다.
- **RB (음성 결과 표출):** 음성 결과 뷰와 가설별 실행 이력을 위한 CLI/MCP 명령; 기본 정렬이 `refuted`/`inconclusive`/
  실패를 숨기지 않고 표출한다.
- **RB (익스포트 훅):** 깔끔한 repro 블록을 가진 `supported`/`refuted` 실행만이 CAW-02로 증거를 익스포트할 자격이
  있다; `writeback_observed` 필드는 CAW-01 writeback-traffic 스키마 익스포트(별도 설계)에 공급되며 결코 CAW-01과
  공유 저장소를 의미하지 않는다.

> 독립성 리마인더: CAW-01, CAW-02, CAW-05는 **별개의 제품**이다. 원장은 명시적인 파일/API 경계를 가로질러 레코드를
> 익스포트하며, 그들과 런타임 기반, 저장소, 레지스트리를 공유하지 않는다.

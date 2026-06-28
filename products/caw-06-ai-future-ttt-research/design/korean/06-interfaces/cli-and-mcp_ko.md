# CLI & MCP — ExperimentScout 구동 및 검사

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§4 표면, §12 리뷰어 가드레일)
  - [./scout-pipeline_ko.md](./scout-pipeline_ko.md) (이 CLI/MCP가 구동하는 Run)
  - [./outputs_ko.md](./outputs_ko.md) (이 op들이 렌더링하는 산출물)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
하나의 `ExperimentScout` 파이프라인 코어 위에 놓인 **사람/에이전트 대면 구동 표면 두 가지**를 명세한다: **CLI**
(Jimmy + CI, 헤드리스)와 **MCP 서버**(에이전트인 ExperimentScout). 이 문서는 공유되는 **타입이 지정된 op-set**,
어떤 op이 **read**이고 어떤 op이 **mutating**인지, 그리고 모든 **종단/전략적 op은 제안 전용이며 사람 게이트를 거친다**
(brief §12; ADR-0001)는 점을 고정한다. 스케줄된 파이프라인 메커니즘([scout-pipeline_ko.md](./scout-pipeline_ko.md)),
산출물 스키마([outputs_ko.md](./outputs_ko.md)), export 어댑터 내부(ADR-0008)는 정의하지 않는다. 두 표면 모두
동일한 코어 op-set을 감싸는 얇은 래퍼이며, 어떤 표면도 자체적인 불변식 로직을 갖지 않는다(ADR-0001 §"Governance lives in
the core").

## 설계 원칙
- **하나의 op-set, 두 개의 표면.** CLI 서브커맨드와 MCP 도구는 검증된 동일 타입 op들을 1:1로 렌더링한 것이다.
  동작을 추가한다는 것은 코어 op-set을 확장하는 것을 의미하며, 결코 표면-로컬 규칙이 아니다(ADR-0001 재검토 트리거).
- **read와 mutate는 명시적이다.** 모든 op은 `read`, `propose`(제안/초안 레코드를 append), 또는
  `gated`(Jimmy의 확인 후에만 코어가 실행하는 전략적 종단 경로)로 분류된다.
- **어떤 표면도 과장(overclaim)할 수 없다.** 어떤 op도 `status` + `confidence` 없이 가설을 출력하지 않는다. 어떤 op도
  사람 게이트를 거치지 않고는 가설을 `supported`로 승격하거나, 주장을 CAW-02로 export하거나, writeback 스키마를 CAW-01에
  커밋하지 않는다. 생성된 요약은 `generated`로 표시되며 결코 증거가 아니다(brief §12).
- **독립성.** Export op은 **명시적 경계를 가로질러 번들을 기록**하며(ADR-0008), 결코 공유 저장소에 쓰지 않는다.
  CAW-01/CAW-02는 별개의 제품이다.

## op-set (CLI + MCP 공유)

| Op | Class | CLI | MCP tool | Effect |
|---|---|---|---|---|
| `run` | propose | `caw06 run [--thread ID] [--stage S] [--now]` | `scout.run` | Run을 여섯 단계에 걸쳐 진행(재개 가능); [scout-pipeline_ko.md](./scout-pipeline_ko.md) 참조 |
| `status` | read | `caw06 status` | `scout.status` | Run/스케줄러 상태, 마지막 receipt, 진행 중 단계, 락 보유자 |
| `list-threads` | read | `caw06 list-threads [--filter status=…]` | `thread.list` | 현재 status + confidence를 가진 thread 목록 |
| `show-thread` | read | `caw06 show-thread ID` | `thread.show` | 전체 `source→claim→hypothesis→experiment→result→implication` 체인 + provenance |
| `show-hypothesis` | read | `caw06 show-hypothesis HID` | `hypothesis.show` | Hypothesis 카드: `status` + `confidence` + run 이력을 반드시 표시(ADR-0002) |
| `extract-claims` | propose | `caw06 extract-claims --source SID` | `claim.extract` | source로부터 `CandidateClaim` 초안 작성(S4) |
| `propose-hypothesis` | propose | `caw06 propose-hypothesis --claim CID` | `hypothesis.propose` | `status=hypothesis`, `confidence=very-low`의 새 `Hypothesis` |
| `plan-experiment` | propose | `caw06 plan-experiment --hyp HID` | `experiment.plan` | 사전 등록된 결정 규칙 + repro config(ADR-0003); 아직 run 없음 |
| `run-experiment` | propose | `caw06 run-experiment --plan PID` | `experiment.run` | toy repro 실행; **항상** ledger 항목 기록(크래시 → `invalid` 포함) |
| `log-result` | propose | `caw06 log-result --exp EXP-XXXX` | `experiment.log` | 사전 등록된 규칙에 대한 verdict를 append(ADR-0003) |
| `ledger` | read | `caw06 ledger [--verdict …]` | `ledger.list` | append 전용 실험 ledger 뷰 |
| `negative-results` | read | `caw06 negative-results` | `ledger.negatives` | 실패 우선 뷰, 기본으로 표면화(brief §5; ADR-0003) |
| `map-implications` | propose | `caw06 map-implications --finding FID` | `implication.map` | ImplicationMap 생성/갱신(ADR-0006); 요약은 `generated` 표시 |
| `render` | read | `caw06 render <kind> --id ID` | `artifact.render` | 다섯 가지 출력 종류 중 하나를 렌더링([outputs_ko.md](./outputs_ko.md)) |
| `propose-status` | propose | `caw06 propose-status HID --to supported` | `hypothesis.propose_status` | ledger verdict로부터 `StatusEvent`를 큐에 넣음 — **적용하지 않음** |
| `confirm` | gated | `caw06 confirm <queue-id>` | _(에이전트 도구로 노출되지 않음)_ | 사람 게이트: 큐에 쌓인 승격/export를 적용 |
| `export` | gated | `caw06 export <target> --id ID` | `export.stage` | MCP는 번들을 **stage**(보류); `caw06 confirm`/`caw06 export --commit`만 실제 발행 |

### read vs mutating —엄격한 경계선

```text
read      → no record changes; safe for CI, agents, dashboards (status, show-*, ledger, negatives, render, list)
propose   → APPEND a draft/proposal/ledger record at the floor state
             (status=hypothesis, confidence=very-low); never promotes, never exports
gated     → a STRATEGIC TERMINAL route (status→supported, export→CAW-01/02);
             core executes ONLY after Jimmy's `confirm`. The agent can at most STAGE a pending event.
```

## 표면 간 차이

| 측면 | CLI (Jimmy + CI) | MCP (ExperimentScout 에이전트) |
|---|---|---|
| 대상 | 사람 운영자, 헤드리스 CI | 자율 scout 에이전트 |
| `read` op | 전부 | 전부 |
| `propose` op | 전부 | 전부(이것이 에이전트의 역할: discover→claim→hypothesize→draft) |
| `gated` op | `confirm` + `export --commit`을 사람이 사용 가능 | **제안 전용**: `stage`/`propose_status` 가능; `confirm` 도구는 등록되지 않음 |
| 출력 | 텍스트/마크다운 테이블; CI용 `--json` | 구조화된 JSON 도구 결과 |
| Auth 컨텍스트 | 로컬 운영자 | 범위가 제한된 MCP 세션; 종단 경로는 물리적으로 도달 불가 |

MCP 서버는 의도적으로 **`confirm`을 등록하지 않는다**(ADR-0001 §"Mutating-terminal ops are proposal-only").
에이전트는 잘 구성된 제안으로 리뷰 큐를 채울 수 있지만, 그것을 비우는 것은 오직 사람뿐이다.

## 사람 게이트 (리뷰 큐)
`propose-status --to supported`, `export`, 또는 writeback 커밋은 `store/review-queue/`에 **보류 이벤트**를 생성한다
(ADR-0007에 따라 영속화). `caw06 review`는 보류 항목을 증거 및 diff와 함께 나열하고, `caw06 confirm <id>`는 하나를
적용하며, `caw06 reject <id> --reason …`는 폐기한다(감사를 위해 보존). 어떤 스케줄된 Run도, 어떤 MCP 세션도 이 큐를
비울 수 없다. 이것이 brief §12("자동 스카우팅은 제안/가설 생성이며, Jimmy가 리뷰어다")를 위한 단일 집행 지점이다.

## 예시

```bash
# Inspect (read-only)
caw06 list-threads --filter status=hypothesis
caw06 show-hypothesis HYP-0042            # always prints status + confidence + run history
caw06 negative-results                    # failures surfaced by default

# Advance one thread on demand (propose-class; no promotion)
caw06 run --thread THR-0042 --now

# Plan + run a toy reproduction, then log against the pre-registered rule
caw06 plan-experiment --hyp HYP-0042      # pre-registers decision rule (ADR-0003)
caw06 run-experiment --plan PLN-0007      # writes ledger entry even on crash
caw06 log-result --exp EXP-0007 --verdict supports

# Strategic routes are gated — staged, then confirmed by Jimmy
caw06 propose-status HYP-0042 --to supported   # enqueues; does NOT apply
caw06 review                                   # Jimmy inspects evidence + cap
caw06 confirm RQ-0019                           # the gate: core applies the promotion
caw06 export caw01-writeback --id WB-0003       # stages bundle (ADR-0008)
caw06 export caw01-writeback --id WB-0003 --commit
```

## 미해결 질문(Open Questions)
- TODO(open-question: does `scout.run` over MCP return a synchronous result or a Run handle to poll via
  `scout.status`? — mirrors ADR-0001 OQ on Run granularity.)
- TODO(open-question: should CI have a distinct non-interactive profile that can `confirm` only `inconclusive`/
  `refuted` demotions (never promotions)? lean: no — keep one gate.)
- TODO(open-question: rate-limit / quota surfacing for agent `propose` ops to avoid review-queue flooding.)
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- RB: 코어 op-set을 하나의 타입 모듈로 정의; CLI와 MCP는 그 위의 생성된/얇은 래퍼.
- RB: MCP 서버 등록 목록은 반드시 `confirm`을 제외하고 `export`를 stage 전용으로 표시해야 한다.
- RB: 모든 `render`/`show-hypothesis` 경로는 출력 전 `status` + `confidence` 존재를 단언한다.
- RB: 리뷰 큐 저장소 + `review`/`confirm`/`reject` 커맨드; [ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)에 따라 영속화.

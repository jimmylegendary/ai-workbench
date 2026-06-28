# TTT Research Core — 개요

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./experiment-scout-pipeline_ko.md](./experiment-scout-pipeline_ko.md) (Run + 인제스트 단계)
  - [./hypothesis-and-uncertainty_ko.md](../05-ttt-research-core/hypothesis-and-uncertainty_ko.md) (무과장 계약)
  - [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling_ko.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **TTT Research Core가 무엇인지**를 기술한다: CAW-06의 세 얇은 표면(surface) 뒤에 있는 단일
파이프라인 코어 — `ExperimentScout` Run —, 그리고 코어 단계들의 **폴더 맵**과 코어가 읽고 쓰는 **thread
store**다. 이는 `05-ttt-research-core/` 그룹의 길잡이 문서다; Run의 동작 원리는
[experiment-scout-pipeline_ko.md](./experiment-scout-pipeline_ko.md)에, hypothesis/uncertainty 계약은
[hypothesis-and-uncertainty_ko.md](../05-ttt-research-core/hypothesis-and-uncertainty_ko.md)에 있다. 이 문서는 experiment ledger 스키마
(ADR-0003), writeback-traffic 스키마(ADR-0004), 함의 매핑(ADR-0006), 저장 직렬화나 스케줄링 내부
(ADR-0007), export 어댑터(ADR-0008)를 정의하지 않는다 — 안정적인 경계로서 이들을 상호 링크한다.

## 1. 코어란 무엇인가

코어는 **리서치 스레드(research thread)**를 전진시키는 **하나의 재개 가능한(resumable) 파이프라인**이다.
스레드는 가치의 내구적 단위다 (brief §2):

```
source → claim → hypothesis → small experiment → result (incl. failure) → implication
```

그 외의 모든 것 — 스케줄/트리거 파이프라인, CLI, MCP server, 다섯 가지 출력 아티팩트 종류 —
은 이 하나의 코어 위에 있는 얇은 표면이거나 렌더링이다 (ADR-0001). 어떤 표면이 아니라 코어가
**무과장 불변식(anti-overclaim invariants)**을 소유한다: 3계층 `Source`/`Claim`/`Hypothesis` 분리,
`status`의 `hypothesis` 기본 하한, `confidence ≤ evidence_strength` 상한, **generated evidence는 status를
결코 승격시킬 수 없다**는 규칙, provenance 스탬핑, failures-first ledger 규율, 그리고 타깃별 export
게이트. 표면은 경로(route)를 *요청*할 수 있을 뿐이다; 오직 코어만이, 사람 검토 게이트를 거친 후 승격이나
export를 수행한다.

### 코어가 하는 일 (그리고 명시적으로 하지 않는 일)

| 코어가 한다 | 코어가 하지 않는다 |
|---|---|
| 여섯 개 scout 단계를 통해 스레드를 전진 | 실제 TTT를 대규모로 실행 (v1 = 최소 reproduction만) |
| 모든 hypothesis에 status/uncertainty 강제 | 미래 AI에 대한 확정된 claim을 단언 |
| source, claim, evidence, generated text를 분리 유지 | generated summary를 증거로 취급 |
| 부정적 결과를 보관하고 기본적으로 노출 | 실패를 폐기하거나 숨김 |
| 모든 레코드에 provenance + `boundary` 스탬핑 | CAW-01/02/05와 런타임/저장소 공유 |
| 명시적 이음새 전반으로 export 번들 방출 | 자동 승격이나 자동 export (Jimmy가 검토) |

## 2. Run과 세 표면

`Run`은 여섯 단계에 대한 하나의 재개 가능한 패스이며, 단계별 체크포인트, 단일-비행(single-flight) 락,
커서 기반 따라잡기(catch-up), run-receipt 하트비트를 갖는다. 크래시 시 마지막으로 완료된 단계에서
재개한다; 이미 완료된 thread-stage의 재실행은 no-op이다 (ADR-0001). 세 표면은 **동일한 검증된 타입
op-set**을 구동한다:

| Surface | Driver | 역할 | 비고 |
|---|---|---|---|
| 스케줄/트리거 파이프라인 | `SchedulerAdapter` (cron v1) | 주기적 + 온디맨드 Run | scheduler는 *발화*만; 따라잡기/중첩/하트비트는 Run 래퍼에 |
| CLI | Jimmy + CI | 헤드리스 실행/검사 | `run`, `status`, `show-thread`, `negative-results`, `confirm`, `export` |
| MCP server | ExperimentScout 에이전트 | discover/extract/propose/draft | **변이-종단(mutating-terminal) op은 제안 전용** — 에이전트는 결코 판정하지 않음 |

## 3. 여섯 개 scout 단계 (Run)

[experiment-scout-pipeline_ko.md](./experiment-scout-pipeline_ko.md)에 상세. 요약:

| # | Stage | 소유 | 출력 레코드 |
|---|---|---|---|
| 1 | Discover | source discovery + CAW-05 import (5단계 인제스트) | `Source`, `CandidateClaim` |
| 2 | Extract claims | 추출적이고 귀속 가능한 claim | `Claim` |
| 3 | Hypothesize | 검증 가능한 hypothesis 제안 (기본 `status=hypothesis`) | `Hypothesis` |
| 4 | Plan reproduction | 최소 toy experiment + 사전 등록된 결정 규칙 설계 | experiment plan |
| 5 | Log result | append-only ledger 항목; verdict → `Evidence` (실패도 일급) | ledger entry, `Evidence` |
| 6 | Map implications | 도메인별로 타입이 지정되고 불확실성 태그가 붙은 함의; export로 라우팅 | `ImplicationMap` |

Stage 1 내부는 **5단계 인제스트 서브-파이프라인**이다 (S1 Discover → S2 CAW-05에서 Import →
S3 Canonicalize+Dedup → S4 Extract claims → S5 Persist), 멱등적 + 재개 가능 (ADR-0005). 위의 Stage 2는
hypothesis 단계로 공급되는 scout 수준 claim 통합이다.

## 4. 다섯 가지 출력 아티팩트 (하나의 thread store 위 렌더링)

다섯 가지 모두 **하나의 provenance-스탬핑된 스레드의 뷰/파생**이다 (ADR-0001 §5), markdown/JSON-우선:

| Artifact | 무엇을 렌더링하는가 | 소유 결정 |
|---|---|---|
| Research-thread record | 척추: source→…→implication 체인 + provenance + `boundary` | ADR-0001 |
| Small-experiment ledger entry | 하나의 toy reproduction run + verdict; 실패 보관 | ADR-0003 |
| Hypothesis card | `status` + `confidence` + run history를 반드시 보여주는 `Hypothesis` | ADR-0002 |
| Implication map | 도메인별 타입 함의의 6단계 팬아웃 | ADR-0006 |
| Writeback-traffic schema artifact | `wbtraffic.v0` 번들, CAW-01 L0/L1 브리지 | ADR-0004 |

## 5. 폴더 맵

코어의 설계 폴더와 그것이 동작하는 런타임 store (store 레이아웃은 ADR-0007이 고정):

```
design/05-ttt-research-core/
├── overview.md                      ← this doc
├── experiment-scout-pipeline.md     ← the 6-stage Run + 5-stage ingestion
└── hypothesis-and-uncertainty.md    ← 3 record kinds + 4-state lifecycle + caps

store/                               (CAW-06's OWN file-based store — ADR-0007; no shared substrate)
├── sources/        SRC-XXXX.{md,json}    ← deduped sources + provenance (multi-origin)
├── claims/         CLM-XXXX.{md,json}    ← extractive, attributable CandidateClaim / Claim
├── hypotheses/     HYP-XXXX.{md,json}    ← Hypothesis records (status/confidence/status_log)
├── ledger/
│   └── EXP-XXXX/    entry.json + config + seed + env + artifacts/   ← append-only experiment runs
├── implications/   IMP-XXXX.{md,json}    ← ImplicationMap (one per finding)
└── export/         outbound bundles (wbtraffic.v0 → CAW-01; claims+evidence → CAW-02)
```

`Evidence` 레코드는 하나의 `Hypothesis`를, 그리고 (`evidence_kind=experiment`일 때) `ledger/EXP-XXXX`
항목을 상호 참조한다; 직렬화 세부는 ADR-0007이 소유한다.

## 6. Ports & adapters 이음새

v1에서 빌드되고, 나머지는 문서화된 스텁 (brief §9; ADR-0001 §6, ADR-0008):

| Port | v1 어댑터 | 스텁 (Protocol + `HealthStatus="deferred"`) |
|---|---|---|
| `SourceAdapter` | `ArxivAdapter`, `SemanticScholarAdapter`, `CAW05ImportAdapter` | `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` |
| `ExperimentRunnerAdapter` | 최소 로컬 toy-experiment 러너 | 외부 compute / HW 러너 |
| `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, … |

## 7. writeback → CAW-01 브리지 (export, 공유 저장소 아님)

이 제품의 전략적 페이로드는 **writeback-traffic 스키마**(ADR-0004)다: variant별 `wbtraffic.v0`
추정치 — write bandwidth, write endurance, near-memory update, updated-state residency, context/update
frequency에 따른 capacity/bandwidth-비율 — 가 **분석적 L0 추정치**로 생성되며(선택적으로 하나의 toy
reproduction으로 근거 부여), **CAW-01의 기존 L0 객체 + open question 위로 내려놓은(lowered) 자기
기술(self-describing) 번들로 export**된다. 이는 공유 기반이 아니라 **명시적 경계를 가로지르는 export**다:
CAW-01은 별개의 제품이며, 자체 IR 객체 이름을 소유하고, 자기 쪽에서 재검증한다. writeback claim 자체는
전제가 아니라 추적되는 `Hypothesis`다 (brief §6; ADR-0002). `TODO(open-question: which TTT variants actually write back —
needs the first research run.)`

## Open Questions

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

- `TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects status contract.)`
- `TODO(open-question: heartbeat/dead-man's-switch sink given "no shared substrate" — local vs external?)`
- `TODO(open-question: can writeback traffic be modeled at L0/L1 before full syntorch/vLLM integration? — lean: yes, ADR-0004.)`

## 런북에 대한 함의

- 어떤 단계 로직보다 먼저 §5의 레이아웃으로 `store/`를 스캐폴딩; 각 체크포인트에서 green 유지.
- Run 래퍼(락/커서/하트비트/체크포인트)는 하나의 런북; 다섯 아티팩트 렌더러는 또 다른 런북.
- 모든 렌더러는 thread store를 읽는다; 어느 것도 불변식을 보유하지 않는다 — 코어가 보유한다 (ADR-0001 거버넌스 규칙).

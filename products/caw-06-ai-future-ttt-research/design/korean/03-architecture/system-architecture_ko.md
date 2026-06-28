# 시스템 아키텍처 — CAW-06 컨테이너 & ExperimentScout Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./component-boundaries_ko.md](./component-boundaries_ko.md) (모듈 소유권 + 서비스 시그니처)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (하나의 core + 세 개의 서피스 + 다섯 개의 아티팩트)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (SourceAdapter, 5개 ingest 스테이지)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (file store + scheduler)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (ExportAdapter가 유일한 export 이음새)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-06의 **런타임 컨테이너**와 이들이 어떻게 연결되는지를 고정한다: 파이프라인 core(`ExperimentScout`
Run), 세 개의 구동 서피스(scheduler/trigger, CLI, MCP), 어댑터를 갖춘 세 개의 포트 family(Source /
ExperimentRunner / Export), 그리고 파일 기반 store. **단방향 의존성 규칙**과 시스템 전체가 지켜야 할
**no-overclaim / no-shared-store 불변식**을 명시한다. 모듈 시그니처(see
[component-boundaries_ko.md](./component-boundaries_ko.md)), 아티팩트별 스키마(소유 ADR), 런북 단계는
정의하지 *않는다*.

## 컨테이너 맵

CAW-06은 하나의 프로세스 family다: **세 개의 얇은 서피스**로 감싸이고 **세 개의 포트 family**와 자신의
**OWN file store**를 통해서만 외부 세계에 도달하는 **core** 라이브러리. core 바깥의 어떤 것도 진실을
결정하지 않는다.

```
                          DRIVING SURFACES (thin; no domain logic)
        ┌───────────────┬───────────────────────────┬────────────────────┐
        │ Scheduler /   │            CLI             │     MCP server     │
        │ Trigger       │  (Jimmy + CI, headless)    │ (ExperimentScout   │
        │ (cron v1)     │                            │  agent; proposal-  │
        │               │                            │  only terminals)   │
        └──────┬────────┴─────────────┬──────────────┴─────────┬──────────┘
               │                      │                        │
               ▼                      ▼                        ▼
        ╔═══════════════════════════════════════════════════════════════════╗
        ║                       PIPELINE CORE  (the Run)                     ║
        ║   one resumable pass over six stages; advances research threads    ║
        ║                                                                    ║
        ║  S1 discover → S2 import → S3 dedup → S4 extract → ── (ingest) ──┐ ║
        ║                                                                  │ ║
        ║   ┌──────────────┴──────────────────────────────────────────────┘ ║
        ║   ▼                                                                ║
        ║  S5 hypothesize → S6 plan-experiment → S7 run+log → S8 implication ║
        ║                                              → S9 export(propose)  ║
        ║                                                                    ║
        ║  GOVERNANCE LIVES HERE: status floor=hypothesis, confidence ≤      ║
        ║  evidence cap, generated≠evidence, reproducibility gate, review    ║
        ║  gate, provenance stamping, per-target export gates                ║
        ╚══╦═══════════════╦══════════════════╦══════════════════╦══════════╝
           │ SourceAdapter │ ExperimentRunner │  ExportAdapter   │ (ports;
           │  (port)       │  Adapter (port)  │   (port)         │  Protocols)
           ▼               ▼                  ▼                  ▼
   ┌───────────────┐ ┌──────────────┐ ┌───────────────────┐ ┌──────────────┐
   │ Arxiv /       │ │ LocalToy     │ │ Caw01Writeback /  │ │  FILE STORE  │
   │ SemanticS. /  │ │ Runner v1;   │ │ Caw02Claim v1;    │ │  store/...   │
   │ CAW05Import   │ │ ext-compute/ │ │ Caw03Novelty /    │ │  (CAW-06's   │
   │ v1; stubs     │ │ HW stubs     │ │ HttpExport stubs  │ │   OWN)       │
   └──────┬────────┘ └──────────────┘ └─────────┬─────────┘ └──────────────┘
          │ import (read-only, across boundary)  │ one-way push (file drop v1)
          ▼                                      ▼
   ┌──────────────┐                       ┌──────────────────────────────┐
   │ CAW-05       │                       │ CAW-01 (writeback schema +    │
   │ (separate    │                       │ open questions) / CAW-02      │
   │  product)    │                       │ (claims+evidence) — separate  │
   │ action-brief │                       │ products, their OWN stores    │
   └──────────────┘                       └──────────────────────────────┘
```

## 컨테이너

| # | 컨테이너 | 종류 | 책임 | 소유 / 경계 |
|---|---|---|---|---|
| 1 | **Pipeline core (the Run)** | library | 9-스테이지 `ExperimentScout` Run; thread를 전진시킴; 모든 거버넌스를 보유 | core 도메인 |
| 2 | **Scheduler / Trigger** | surface | 주기적 Run(cron v1) 또는 온디맨드 단일-thread Run을 발화 | 발화만; catch-up 로직 없음 |
| 3 | **CLI** | surface | core op-set 위의 얇은 래퍼; 기본 headless 서피스 | 도메인 로직 없음 |
| 4 | **MCP server** | surface | 에이전트를 위한 MCP 툴로서 동일한 op-set; **변경 terminal은 제안 전용** | 도메인 로직 없음 |
| 5 | **Source adapters** | port impl | fetch + provenance + rate-limit; extraction/ranking 없음 | `SourceAdapter` Protocol |
| 6 | **ExperimentRunner** | port impl | 사전 등록된 rule 하에 최소 reproduction 실행 | `ExperimentRunnerAdapter` Protocol |
| 7 | **Export adapters** | port impl | validate(gate) + 번들을 단방향으로 emit; receipt | `ExportAdapter` Protocol |
| 8 | **File store** | data | CAW-06의 OWN markdown/JSON store; thread, ledger, exports | `store/...` (ADR-0007) |

**Run 래퍼**가 single-flight lock, cursor catch-up, 스테이지별 checkpoint, run-receipt heartbeat를
소유한다 — cron(v1 scheduler)이 이 중 어느 것도 제공하지 않기 때문이다(ADR-0001 §B). scheduler는 오직
**발화**만 한다.

## Run: 스테이지 → 서비스 → 포트 → store

| 스테이지 | 서비스(core) | 사용 포트 | store에 쓰기 | 과대 주장 방지 훅 |
|---|---|---|---|---|
| S1 discover | Ingest | SourceAdapter | `sources/` | provenance 완전; legal-mode |
| S2 import (CAW-05) | Ingest | SourceAdapter (`CAW05Import`) | `sources/` | CAW-05 산문 `evidence:false` |
| S3 canonicalize+dedup | Ingest | — | `sources/` | 하나의 Source, 여러 provenance |
| S4 extract claims | Ingest | — | `claims/` | extractive only; `status=unverified` |
| S5 hypothesize | Hypothesis | — | `hypotheses/` | status 하한=`hypothesis`; confidence ≤ evidence cap |
| S6 plan-experiment | Experiment | — | `ledger/EXP-XXXX` | 사전 등록된 decision rule |
| S7 run + log result | Experiment | ExperimentRunnerAdapter | `ledger/EXP-XXXX` | reproducibility gate(config+seed+env); negative 보존 |
| S8 map implications | Implication | — | `implications/` | summary를 `generated`로 표시(evidence 아님) |
| S9 export (propose) | Export + Writeback | ExportAdapter | `exports/` (receipts) | 타깃별 gate; review gate; null+basis 숫자 |

Ingestion(S1–S4)은 **persist에서 멈추고 결코 S5로 진입하지 않는다**(ADR-0005 §1). 서피스에서의 S9는
**제안**이다; 인간 review gate 이후, 실제 emit을 수행하는 것은 오직 core뿐이다(ADR-0001 §4, ADR-0008 §3).

## 단방향 의존성 규칙

의존성은 **안쪽 및 아래쪽으로만** 향한다. 화살표는 허용된 `import`/`call` 방향이다:

```
surfaces ──▶ core op-set ──▶ ports (Protocols) ──▶ adapters ──▶ outside / store
```

- **서피스는 core에 의존하고; core는 결코 서피스에 의존하지 않는다.** 서피스는 오직 검증된 typed op만 호출할 수 있다.
- **core는 포트 Protocol에 의존하고, 결코 구체적 어댑터에 의존하지 않는다.** 어댑터는 구성 기반 레지스트리
  (`sources.yaml`, runner config, export registry)로 바인딩된다. arXiv→Github 또는 file-drop→HTTP 교체는
  어떤 core 코드도 건드리지 않는다.
- **어댑터는 외부 세계에 의존하고; 외부 세계는 결코 core로 손을 뻗지 않는다.** import는 오직
  `SourceAdapter.fetch()` 결과로만 도착하고; export는 오직 `ExportAdapter.emit()` push로만 떠난다.
- **서피스 로컬 도메인 규칙 없음.** 서피스가 op-set에 없는 로직을 필요로 하면, 서피스가 아니라 op-set을 확장한다
  (ADR-0001 재검토 트리거). 서피스 로컬 규칙은 계약 누수이며 — 특히 과대 주장 방지 불변식을 약화시킬 수 있는 것은 더욱 그렇다.

금지된 엣지: surface→adapter(core 거버넌스 우회); adapter→core 내부; any product→CAW-06 store.

## 시스템 불변식(가능한 경우 기계 검증 가능)

| 불변식 | 시행 위치 | 어떻게 유지되는가 |
|---|---|---|
| **No overclaim** — hypothesis는 결코 확정된 claim이 아님 | core (Hypothesis svc + export gates) | status 하한=`hypothesis`; `confidence ≤ evidence_strength`; CAW-02 gate가 `status:hypothesis` 거부 |
| **Generated ≠ evidence** | core | generated paraphrase/summary를 `evidence:false`로 표시; CAW-02 번들이 명시적 `not_evidence[]` 운반 |
| **Evidence cap** — generated evidence는 status 승격 불가 | core (Hypothesis svc) | hard cap; 오직 ledger 결과 / 외부 source만 승격 |
| **Reproducibility gate** | core (Experiment svc) | config+seed+env 없는 ledger entry는 invalid; verdict은 사전 등록된 rule로 gate됨 |
| **Failures useful** | core + store | negative 결과 보존, 분류, 기본 노출(`negative-results` 뷰) |
| **No shared store** | ports + store | import는 file/API 경계로 CAW-05를 읽음; export는 단방향 push; CAW-06은 결코 다른 제품 store에 쓰지 않고 read-back도 없음 |
| **Self-describing bundles** | Export adapters | `schema_version`+`producer`+`content_hash`가 in-band 이동; 제품 간 공유 레지스트리 없음 |
| **Human gate on terminals** | core | `supported`로 승격, CAW-02로 export, CAW-01로 writeback 커밋은 pending gate event 생성; 에이전트는 결코 terminal 경로를 실행 안 함 |
| **No invented numbers** | Writeback svc + CAW-01 adapter | 수치 필드 기본값 `null` + `basis: TODO(open-question)`; modeled를 measured와 구별되게 플래그 |

## no-shared-store 경계 상세

CAW-06은 정확히 두 개의 다른 제품과 닿는데, 둘 다 명시적 경계를 가로지른다 — **결코 공유 기반(substrate)이 아니다**:

- **Inbound (CAW-05, 별개 제품):** `action-brief` 번들의 read-only import를 file drop / pull로.
  public, provenance 보유, **비증거적**으로 취급. `open_question`은 seed `CandidateClaim`
  (`status=unverified`)이 되며, 결코 `supported`가 아니다(ADR-0005 §6). CAW-06은 family 일관성을 위해
  CAW-05의 어댑터 *형태*를 재사용한다; 어댑터 코드는 CAW-06의 OWN이다.
- **Outbound (CAW-01 / CAW-02, 별개 제품):** 자기 기술적 `ExportBundle`의 **단방향 push**. CAW-06은
  thread에 대해 로컬 receipt를 기록하고 read-back을 받지 않는다. CAW-01은 `wbtraffic.v0` 스키마 +
  open questions(자신의 IR에 대한 단언이 아니라 질문)를 받고; CAW-02는 claim+evidence+uncertainty를 받는다.
  CAW-01 IR 객체 이름은 **CAW-01이 소유**한다 — 경계에서 재검증하고; 공유 스키마를 가정하지 말 것(ADR-0004).

## 미해결 질문
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects surface `status` contract — ADR-0001.)
- TODO(open-question: heartbeat / dead-man's-switch sink given no shared substrate — local "no receipt in N days" vs external service?)
- TODO(open-question: file-drop vs HTTP v1 transport + agreed drop location/auth per receiving product — ADR-0008.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- RB: Run 래퍼 + thread lifecycle(lock, cursor, checkpoint, heartbeat) — 거버넌스를 보유하는 컨테이너.
- RB: 하나의 op-set 위의 세 서피스(scheduler는 발화만; CLI; MCP는 제안 전용 terminal).
- RB: 어댑터 레지스트리(`sources.yaml`, runner config, export registry) + `deferred`를 보고하는 문서화된 스텁.
- RB: store 레이아웃 + receipt 저장(ADR-0007) — CAW-06의 OWN store, 외부 reach-in 없음.

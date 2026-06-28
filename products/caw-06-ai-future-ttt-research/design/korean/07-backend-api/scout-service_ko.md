# Scout Service — ExperimentScout 파이프라인 (discover → … → export)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md)
  - [./experiment-runner-service_ko.md](./experiment-runner-service_ko.md)
  - [./persistence_ko.md](./persistence_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling_ko.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
**ExperimentScout 파이프라인 서비스**를 기술한다 — 연구 thread를 여섯 단계를 거쳐 전진시키고 명시적 경계를 넘어
export로 내보내는 하나의 재개 가능한 Run(ADR-0001). 이 문서는 Run 생명주기, 단계 계약, 스케줄링/트리거, 그리고 사람
검토 게이트를 정의한다. 이 문서는 그것이 호출하는 타입 op([api-surface_ko.md](./api-surface_ko.md)),
runner([experiment-runner-service_ko.md](./experiment-runner-service_ko.md)), 저장소([persistence_ko.md](./persistence_ko.md))를
정의하지 않는다.

## 단위와 Run
- **thread가 지속적(durable) 단위다** — `source → claim → hypothesis → small experiment → result (실패 포함) →
  implication`, provenance와 명시적 불확실성을 동반함(brief §2). **Run**은 thread를 전진시키는 재개 가능한 패스다.
  Run 자체는 영수증 너머로는 지속적이지 않다.
- Run은 여섯 단계를 실행하고 단계별 체크포인트를 영속화한다. 크래시는 마지막으로 완료된 단계에서 재개된다.
  이미 완료된 thread-단계를 재실행하는 것은 **no-op**이다(멱등적, ADR-0001).

## 단계
| # | Stage | 구동 Op | Output | 과대주장 방지 규칙 |
|---|---|---|---|---|
| S1 | Discover | `ingest.discover`, `ingest.import_caw05` | `Source` 레코드 + `FetchCursor` | ToS 안전한 공개 소스만(brief §12) |
| S2 | Import (CAW-05) | `ingest.import_caw05` | `Source` (boundary=import:caw-05) | radar 힌트를 verdict와 혼동하지 말 것 |
| S3 | Canonicalize + Dedup | (ingestion 내부) | canonical `Source`, content_hash로 dedup | 멱등적; 중복 thread 없음 |
| S4 | Extract claims | `ingest.extract_claims` | `CandidateClaim` (generated) | candidate ≠ 확정된 `Claim` |
| S5 | Persist / hypothesize | `hyp.create` | `Hypothesis` (status=hypothesis) | very-low confidence 기본값 |
| S6 | Plan + log experiment | `exp.plan`, `exp.run`, `exp.log_result` | ledger 항목 + Evidence | 매 실행마다 항목; ≥3 seed |
| S7 | Map implications | `impl.map`, `wb.estimate` | ImplicationMap + `wbtraffic.v0` | summary는 generated, 증거 아님 |
| S8 | Export (gated) | `export.stage`, `export.commit` | CAW-01/CAW-02로 번들 | proposal 전용; 사람이 `supported` 확인 |

> S1–S5는 ADR-0005의 **다섯 ingestion 단계**다(Discover → Import → Canonicalize+Dedup → Extract → Persist).
> S6–S8은 thread를 experiment, implication, export로 전진시킨다. Run은 이 모두를 하나의 재개 가능한 패스로 감싼다.

```
Run(thread_or_family):
  for stage in [S1..S8]:
    if checkpoint(thread, stage) == "done": continue          # idempotent resume
    acquire single-flight lock (per ADR-0007 per-thread lock — OQ)
    result = drive op(stage)
    if result.proposed_events: enqueue to review queue         # never auto-apply
    write checkpoint(thread, stage, status)
    heartbeat(run_receipt)                                     # dead-man's-switch sink (OQ)
```

## 스케줄링 & 트리거 (ADR-0007)
- `SchedulerAdapter`(cron v1; 스텁 문서화됨)가 `sources.yaml`(`family → adapter + query + schedule + rate_limit`)에
  따라 주기적 Run을 발화(fire)한다. 스케줄러는 **발화만** 한다 — 따라잡기, 중첩 가드(single-flight), 하트비트는
  Run 래퍼에 존재하므로 파이프라인은 평범한 cron 위에서도 올바르다.
- **트리거:** CAW-05 번들 도착(파일 드롭 / pull)이나 CLI/MCP `sched.fire(thread, now=true)`가 단일 thread를
  즉시 열거나 전진시킨다. 가벼운 기본값: CAW-05 import는 `--now`가 아니면 큐에 들어가 다음 패스에 실행됨(ADR-0001 OQ).
- 각 어댑터의 `FetchCursor`가 영속화되어 스케줄된 재실행이 증분적이고 멱등적이다(중복 없음).

```yaml
# sources.yaml (schedule registry, also drives ingestion adapters)
families:
  - family: arxiv
    adapter: ArxivSourceAdapter
    query: "test-time training OR test-time compute"
    schedule: "0 6 * * 1"        # weekly; scheduler only fires
    rate_limit: { rps: 1 }
  - family: caw05-signal
    adapter: Caw05ImportAdapter   # CAW-05 is a SEPARATE product; file/API boundary, no shared store
    trigger: on-bundle-arrival
```

## 포트 & 어댑터 (v1 구축, 나머지는 스텁 — brief §9)
| Port | v1 | 스텁(문서화됨) | Health |
|---|---|---|---|
| `SourceAdapter` | arXiv / Semantic Scholar + `Caw05ImportAdapter` | 기타 피드 | `deferred` |
| `ExperimentRunnerAdapter` | 최소 로컬 토이 runner | external compute / HW | `deferred` |
| `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, … | `deferred` |

config 기반 레지스트리가 family를 바인딩한다. 모든 스텁은 Protocol을 구현하고 `HealthStatus="deferred"`를 보고한다.

## 검토 게이트 (brief §12 — Jimmy가 검토자)
자동 scouting은 **proposal/hypothesis 생성**이다. 파이프라인은 `status=hypothesis`로 hypothesis를 생성하고,
ledger verdict로부터 `StatusEvent`를 제안하고, export 번들을 **stage**할 수 있다 — 그러나 `supported`로의 promotion과
어떤 `supported` export의 방출은 사람 확인을 위해 검토 큐에서 대기한다. 어떤 단계도 hypothesis를 자동 promotion하거나,
claim을 CAW-02로 자동 export하거나, writeback 스키마를 CAW-01로 자동 commit하지 않는다.

## 실패 처리
- 일시적 어댑터 오류(rate-limit, 네트워크) → 백오프로 재시도. 종단(terminal) 오류 → 단계 중단, 실패 체크포인트
  기록, 보고, 그리고 thread를 재개 가능한 상태로 둠.
- experiment 크래시도 ledger 항목(`invalid`/`aborted`)을 남긴다 — 실패는 절대 조용히 버려지지 않는다(ADR-0003).
  negative result는 `exp.negative_results`로 표출된다.
- 실패한 export는 로깅된다. finding은 계속 export 가능한 상태로 남는다(ADR-0004 §4).

## 파이프라인 출력으로서의 CAW-01 브리지 (공유 저장소가 아니라 export)
S7은 `wbtraffic.v0` 산출물을 생산한다(분석적 L0 추정, ADR-0004). S8의 `Caw01WritebackAdapter`는 그것을 CAW-01의
기존 L0 객체 **및 open-question 목록**으로 내리고(lower) 자기 기술적 번들을 파일 경계 너머로 보낸다. CAW-01은 자신의
IR에 대한 단언이 아니라 질문을 받는다. CAW-01 객체 이름은 export마다 재검증된다.

## 미해결 질문(Open Questions)
- TODO(open-question: synchronous Run vs resumable stage-jobs with a handle; ADR-0001.)
- TODO(open-question: heartbeat/dead-man's-switch sink given no shared substrate — local "no receipt in N days" vs external; ADR-0001/0007.)
- TODO(open-question: per-thread file locks for concurrent scheduled runs; ADR-0007.)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북에 대한 함의
- RB: Run 래퍼 + thread 생명주기(체크포인트, single-flight, 하트비트, 재개).
- RB: 스케줄러(cron fire) + 트리거 + `FetchCursor` 영속화.
- RB: 어댑터 레지스트리 + 문서화된 스텁(`HealthStatus="deferred"`).
- RB: 종단 proposed_events가 사람 확인을 요구하도록 검토 큐 배선.

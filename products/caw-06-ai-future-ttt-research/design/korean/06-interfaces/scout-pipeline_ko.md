# ExperimentScout Pipeline — 스케줄/트리거되는 Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§4 표면, §5 단계, §12 리뷰어 가드레일)
  - [./cli-and-mcp_ko.md](./cli-and-mcp_ko.md) (이 Run을 구동하는 표면들)
  - [./outputs_ko.md](./outputs_ko.md) (각 단계가 내보내는 것)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (Run 단위)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (S1–S5 인제스천 + FetchCursor)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (reproducibility gate, verdict)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (스케줄링 + 저장소)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
**하나의 파이프라인 코어** — `ExperimentScout`의 `Run` — 를 연구 thread를 여섯 단계에 걸쳐 진행시키는
**스케줄되고 트리거되는, 재개 가능한** 패스로 기술하고, 작업을 잃거나 과장하지 않으면서 어떻게 **실패를 처리**하는지를
기술한다. CLI/MCP op-set([cli-and-mcp_ko.md](./cli-and-mcp_ko.md)), 산출물 스키마([outputs_ko.md](./outputs_ko.md)),
인제스천 어댑터 계약(ADR-0005)을 정의하지는 않는다 — 이들을 오케스트레이션한다.

## Run이란 무엇인가
**Run**은 여섯 단계에 대한 하나의 재개 가능한 패스로, 하나 또는 다수의 **thread**(영속 단위; Run은 일시적)를
진행시킨다. thread는 `source → claim → hypothesis → small experiment → result (실패 포함) → implication`이며,
provenance, `status`/`uncertainty`, `boundary`를 갖는다(brief §2, §7).

```text
S1 discover ─► S2 import(CAW-05) ─► S3 canonicalize+dedup ─► S4 extract-claims ─► S5 persist
   (the FIVE ingestion stages, ADR-0005)
        │
        ▼  per-thread, on demand or scheduled (the SIX scout stages, ADR-0001 §5):
  discover ─► extract ─► hypothesize ─► plan-repro ─► log-result ─► map-implications
```

인제스천 서브파이프라인(S1–S5, ADR-0005)은 discover/extract 단계에 공급한다; experiment + implication 단계는
주장이 검증 가능해질 때 thread별로 실행된다.

## 트리거

| 트리거 | 출처 | 범위 | 비고 |
|---|---|---|---|
| **Scheduled** | `SchedulerAdapter`(cron v1)가 어댑터별 `sources.yaml` 스케줄을 읽음 | 전체 인제스천 + 준비된 thread 진행 | 주기적 scout(brief §4) |
| **CAW-05 import** | 별개 제품인 CAW-05로부터의 writeback/radar **번들 도착**(파일 드롭 / 풀) | 하나의 thread 개시/진행 | enqueue + 선택적 `--now`(ADR-0001 OQ) |
| **CLI/MCP invoke** | `caw06 run [--thread ID] [--now]` / `scout.run` | 하나의 thread 또는 전체 패스 | 온디맨드 |

스케줄러는 오직 **발화(fire)**만 한다. catch-up, 중첩 방지, 커서 전진, heartbeat는 모두 **Run 래퍼**에 있으므로,
파이프라인은 평범한 OS cron에서도 올바르다(ADR-0001 §2; ADR-0007 §5).

## 재개 가능성(Resumability)
ADR-0001 §1 및 ADR-0007 §2/§4에 따라:

- **단계별 체크포인트.** 각 thread는 마지막으로 완료된 단계를 기록한다. 크래시는 다음 단계에서 재개한다; 이미
  `done`인 thread-단계의 재실행은 **no-op**(멱등)이다.
- **FetchCursor 워터마크.** 각 인제스천 어댑터는 불투명한 `FetchCursor`(arXiv resumptionToken, Semantic Scholar
  페이지, 마지막 CAW-05 `bundle_id`)를 영속화하여, 스케줄된 재실행이 증분적이고 결코 중복을 재import하지 않게 한다
  (ADR-0005; ADR-0007 §4).
- **단일 실행 락(single-flight lock).** Run은 락을 잡는다; 중첩되는 스케줄 발화는 건너뛰어지거나(혹은 catch-up),
  동시 실행되지 않는다. TODO(open-question: per-thread file locks vs one global lock — ADR-0007 OQ on concurrency.)
- **Run receipt / heartbeat.** 각 Run은 receipt(시작, 완료된 단계, 건드린 thread, 종료/verdict)를 기록한다.
  "N일간 receipt 없음" 검사가 데드맨 스위치다. TODO(open-question: heartbeat sink given no shared
  substrate — local check vs external — ADR-0001 OQ.)
- **Append 전용 + supersede.** 어떤 것도 제자리에서 편집되지 않는다; 수정은 `lineage`/`status_log`를 통해 supersede한다.
  모든 단계가 append만 하므로 중단된 Run도 저장소를 일관되게 남긴다(ADR-0007 §2).

## 단계별 책임 & 내보내는 레코드

| 단계 | 읽음 | 내보냄 (→ [outputs_ko.md](./outputs_ko.md)) | 실패-유용성 / 과장 금지 규칙 |
|---|---|---|---|
| discover (S1–S3) | sources, CAW-05 번들 | `Source` 레코드, dedup lineage | persist 전 canonicalize+dedup; 누락된 중복 로깅 |
| extract (S4) | sources | `CandidateClaim` | 주장은 가설과 분리 유지(ADR-0002) |
| hypothesize | claims | `status=hypothesis`, `confidence=very-low`의 `Hypothesis` | 최저 상태; 결코 자동 승격되지 않음(brief §12) |
| plan-repro | hypothesis | 사전 등록된 결정 규칙 + repro config | reproducibility gate: config+seed+env 필수(ADR-0003) |
| log-result | experiment run | **run당 하나의 append 전용 ledger 항목** | 크래시/중단도 항목 기록(`invalid`/`aborted`); negative 보존 |
| map-implications | finding | `ImplicationMap`(요약은 `generated` 표시) | 생성된 요약은 증거가 아님(ADR-0006, brief §12) |

## 실패 처리

| 실패 종류 | 탐지 | 파이프라인 응답 |
|---|---|---|
| **Transient**(네트워크, rate-limit, 5xx) | 타입화된 어댑터 오류 | backoff로 재시도; 어댑터 `rate_limit` 준수; 커서는 간극을 넘어 전진하지 않음 |
| **Terminal**(auth, schema, parse) | 타입화된 어댑터 오류 | 해당 어댑터 중단, run receipt에 기록, `caw06 status`에 표면화; 다른 어댑터/thread는 계속 |
| **실험 크래시/중단** | runner 종료 / 타임아웃 | verdict `invalid`/`aborted`로 **항상 ledger 항목 기록**(ADR-0003) — 결코 조용한 누락 없음 |
| **재현 불가능한 run** | config/seed/env 누락 | reproducibility gate로 차단; 사유와 함께 `invalid`로 기록 |
| **Run 중간 크래시** | 종료 receipt 없음 | 다음 Run이 마지막 체크포인트에서 재개; 부분 append는 유효; 커서 + no-op으로 중복 없음 |
| **모호한 결과** | 결정 규칙이 결정적이지 않음 | verdict `inconclusive`; status는 `hypothesis` 방향으로 유지/회귀; 리뷰를 위해 표면화 |

코어 원칙: **실패는 일급(first-class)이다**(brief §5). 실패한 실험, 반박된 가설, 중단된 어댑터는 모두 영속적이고,
분류되며, 표면화된다 — `caw06 negative-results`가 기본으로 이들을 보여준다([cli-and-mcp_ko.md](./cli-and-mcp_ko.md)).

## Run 내부의 리뷰 게이트
Run은 **제안**한다; 결코 판결하지 않는다(brief §12; ADR-0007 §6). 구체적으로 Run은 다음을 할 수 있다:
최저 상태로 가설 생성, ledger verdict로부터 `StatusEvent` 제안, implication map 생성, export 번들 **stage**.
`supported`로의 승격을 적용하거나 `supported` export를 발행하는 것은 **결코 할 수 없다** — 그것들은 Jimmy를 위한
리뷰 큐에 안착한다([cli-and-mcp_ko.md](./cli-and-mcp_ko.md) §human gate). 생성된 증거는 결코 status를 승격할 수
없다(엄격한 evidence cap, ADR-0002).

## 시퀀스 (스케줄된 패스, 축약)

```text
cron fire ─► Run.acquire_lock()
  ├─ for adapter in sources.yaml: S1–S5 with FetchCursor (skip on rate-limit)
  ├─ for thread in ready(threads):
  │     advance(last_stage+1 … map-implications)   # each stage append-only, checkpointed
  │     on experiment: ALWAYS write ledger entry (incl. failure)
  │     on verdict: propose StatusEvent → review queue (no auto-promote)
  ├─ write Run receipt (heartbeat)
  └─ release_lock()
```

## 미해결 질문(Open Questions)
- TODO(open-question: Run = one synchronous process vs resumable stage-jobs with a handle — affects `status`
  contract; ADR-0001.)
- TODO(open-question: CAW-05 import → immediate single-thread Run vs enqueue for next pass; lean enqueue + `--now`.)
- TODO(open-question: scheduler host — long-running daemon vs OS cron invoking a CLI entrypoint; ADR-0007.)
- TODO(open-question: per-thread locking for concurrent scheduled runs; ADR-0007.)
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- RB: 락 + 체크포인트 + 커서 전진 + receipt/heartbeat를 소유하는 Run 래퍼(cron은 발화만).
- RB: 모든 실험 실행은 작업 전 ledger 항목을 기록하여, 크래시가 결과를 누락시킬 수 없게 한다.
- RB: 재시도-vs-중단을 구동하는 타입화된 어댑터 오류 분류체계(transient/terminal).
- RB: 단계 출력은 append 전용; resolver가 "current" 뷰를 계산; 인덱스는 재구축 가능(ADR-0007).

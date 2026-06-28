# RB-041: 스케줄/트리거되는 ExperimentScout Run 구축 (멱등 + 재개 가능)

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-040 (ExportAdapter 이음새), RB-1XX (ingestion S1–S5 + hypothesis), RB-2XX (experiment ledger), RB-3XX (implication map + wbtraffic.v0), RB-0XX (store 레이아웃 + 포트)]
- Implements design: [../../06-interfaces/scout-pipeline.md](../../06-interfaces/scout-pipeline_ko.md), [../../01-decisions/ADR-0001-product-surface-and-scout.md](../../01-decisions/ADR-0001-product-surface-and-scout_ko.md), [../../01-decisions/ADR-0007-storage-and-scheduling.md](../../01-decisions/ADR-0007-storage-and-scheduling_ko.md), [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger_ko.md)
- Produces: `Run` 래퍼(lock + 스테이지별 checkpoint + FetchCursor 전진 + 영수증/heartbeat), `SchedulerAdapter` (cron v1), CAW-05-import + CLI/MCP 트리거, 타입 지정된 transient/terminal 실패 처리, Run 내 review-gate staging.

## Objective
**하나의 파이프라인 코어**를 **스케줄 및 트리거되고 재개 가능한** `ExperimentScout Run`으로 배선해, 다섯 ingestion
스테이지(S1–S5)를 먹이로 여섯 scout 스테이지(discover → extract → hypothesize → plan-repro → log-result →
map-implications)를 통해 research thread를 전진시킨다. "Done"의 의미: `Run`이 single-flight lock을 획득하고, 각
thread-stage를 checkpoint하며, adapter별 `FetchCursor` watermark를 전진시키고, **실험 작업을 하기 전에 항상 ledger
항목을 쓰고**(그래서 크래시가 결코 결과를 떨어뜨리지 않음), 실패를 일급으로 분류하며, **제안하되 결코 판정하지
않고**(`supported`로 자동 승격 없음, `supported` export 자동 emit 없음 — evidence cap 준수), Run 영수증/heartbeat을
쓴다. 이미 `done`인 thread-stage를 재실행하면 no-op이다.

## Preconditions
- [ ] RB-040 병합됨: Run이 export 번들을 **stage**(emit 아님)할 수 있도록 ExportAdapter 이음새가 존재.
- [ ] Ingestion (S1–S5) + hypothesis (P1), experiment ledger (P2), implication map + `wbtraffic.v0` (P3)이
      하나의 thread에서 실행 가능.
- [ ] `store/{sources,claims,hypotheses,ledger,implications,exports,review-queue}`이 존재하고 ADR-0007에 따라
      append-only.
- [ ] adapter별 스케줄을 가진 `sources.yaml`과 최소 하나의 `SourceAdapter` v1 및 `ExperimentRunnerAdapter` v1이
      배선됨.

## Steps

1. **`Run` 래퍼 구현 (lock, checkpoint, cursor, 영수증).**
   - Do: `acquire_lock()`(single-flight)하고, ingestion adapter들을 그들의 `FetchCursor`와 함께 순회하며,
     `last_stage+1`부터 `ready(threads)`를 전진시키고, 완료 시 Run 영수증(시작, 완료된 스테이지, 건드린 thread,
     종료/verdict)을 쓰고 `release_lock()`하는 `Run.execute(scope)`를 빌드. 모든 catch-up/overlap/cursor 로직을
     래퍼에 둔다 — 스케줄러는 발사만 한다.
   - Verify: 하나의 thread에 대한 Run이 영수증을 산출; lock이 잡힌 동안의 겹치는 호출은 건너뛰어짐(또는
     catch-up), 결코 동시 실행되지 않음.

2. **모든 thread-stage를 멱등이고 checkpoint되게 만들기.**
   - Do: 각 thread의 마지막 완료 스테이지를 기록; `done`인 thread-stage 재실행은 no-op. 모든 스테이지는 append;
     수정은 `lineage`/`status_log`로 supersede — 어떤 것도 in-place로 편집되지 않음.
   - Verify: 동일 Run을 두 번 실행하면 중복 레코드 없음; Run 도중 크래시(스테이지 사이 kill)는 일관된 store와
     함께 다음 스테이지에서 재개.

3. **`FetchCursor` watermark로 ingestion 전진.**
   - Do: adapter별 불투명한 `FetchCursor`(arXiv resumptionToken, Semantic Scholar page, 마지막 CAW-05
     `bundle_id`)를 영속화해 스케줄된 재실행이 증분적이게 한다; transient 실패로 인한 gap을 넘어 cursor를
     전진시키지 말 것.
   - Verify: 두 번째 스케줄된 Run은 새 항목만 import(재import 중복 없음); 모사된 rate-limit은 cursor를 gap에
     남김.

4. **`SchedulerAdapter` (cron v1)와 트리거 구현.**
   - Do: `SchedulerAdapter`가 `sources.yaml`에서 adapter별 스케줄을 읽어 Run 래퍼를 발사(OS cron이 CLI
     엔트리포인트를 호출하는 것도 허용 — 정확성은 래퍼에 있음). 두 개의 트리거를 더 배선: 하나의 thread를
     enqueue/전진시키는 **CAW-05 번들 도착**(별도 제품에서의 파일 드롭 / pull)(선택적 `--now`), 그리고
     **CLI/MCP invoke** (`run [--thread ID] [--now]`).
   - Verify: cron 발사가 전체 ingestion을 실행하고 ready thread를 전진; 드롭된 CAW-05 번들이 정확히 하나의
     thread를 열거나 전진; `--thread`가 하나의 thread로 범위 한정.

5. **"작업 전 ledger 항목" + 실패 분류 보장.**
   - Do: `run-experiment`에서 ledger 항목을 먼저 쓰고, 그 다음 실행. 크래시/abort/timeout 시 verdict를
     `invalid`/`aborted`로 finalize; config+seed+env 누락은 **reproducibility gate**가 차단하고 이유와 함께
     `invalid`로 기록; 불확실한 decision rule은 `inconclusive`를 산출하고 status는 `hypothesis` 쪽으로
     유지/복귀. 타입 지정된 transient(retry+backoff, `rate_limit` 준수) vs terminal(해당 adapter 중단,
     `status`에 노출) 분류를 구현.
   - Verify: 실험 도중 runner를 kill하면 `aborted`/`invalid`인 ledger 항목이 남음(결코 조용한 drop 아님);
     의도적으로 실패하는 run은 보존되어 negative 결과로 분류되고 기본으로 노출됨; terminal adapter 에러는 해당
     adapter만 중단하고 다른 것들은 계속.

6. **Run 내 review 게이트 강제 (제안 전용; evidence cap).**
   - Do: Run은 floor state에서 hypothesis를 생성하고, ledger verdict로부터 `StatusEvent`를
     `store/review-queue/`에 제안하고, implication map(요약은 `generated`로 표시)을 빌드하고, export 번들을
     **stage**할 수 있다. `supported`로의 승격을 적용하거나 `supported`/승격 export를 emit해서는 **결코** 안
     된다. 생성된 증거는 결코 status를 승격할 수 없다.
   - Verify: Run 이후, 사람의 `confirm` 없이 `supported`에 있는 hypothesis 없음; Run이 산출한 export는
     `pending`/staged이고 emit되지 않음; review queue가 잘 구성된 제안과 함께 비어 있지 않음.

7. **하나의 thread에 대한 종단간 Milestone-1 통과.**
   - Do: 하나의 검증 가능한 TTT claim을 전체 Run을 통해 구동: 1 Source → 1 Claim → 1 Hypothesis
     (`status=hypothesis`) → pre-registered rule → 1 append-only ledger 항목(config+seed+env 포함) →
     ImplicationMap → CAW-01용으로 **staged**된 `wbtraffic.v0` analytic-L0 번들.
   - Verify: M1 체크리스트 항목들(milestones-and-phases.md §Milestone 1)이 store 상태에서 모두 체크 가능;
     refuting/erroring toy run도 여전히 M1을 충족(로깅된 negative 결과 + open-question이 있는 추정치가
     deliverable).

## Acceptance criteria
- [ ] `Run`이 single-flight lock을 잡음; 겹치는 스케줄 발사는 건너뛰거나 catch-up되고 결코 동시 실행되지 않음.
- [ ] 모든 thread-stage가 checkpoint되고 멱등; Run 도중 크래시는 중복 없이 깔끔하게 재개.
- [ ] adapter별 `FetchCursor`가 스케줄된 재실행을 증분적으로 만듦; 재import 중복 없음.
- [ ] 실험은 **항상** 작업 전 ledger 항목을 씀; 크래시/abort → `invalid`/`aborted`; reproducibility gate가
      config+seed+env 누락 run을 차단.
- [ ] Negative 결과가 보존·분류되고 기본으로 노출됨.
- [ ] Run은 제안만 함: `supported`로 자동 승격 없음, 승격 export 자동 emit 없음; 생성된 증거는 결코 status를
      승격하지 않음.
- [ ] Run이 영수증/heartbeat을 씀; "N일간 영수증 없음"이 탐지 가능.
- [ ] Milestone 1이 하나의 thread에서 종단간 통과; 트리 green.

## Rollback / safety
- store는 append-only다; 중단된 Run은 일관된 상태로 남음(부분 append는 유효하며 cursor + no-op 스테이지로 dedup).
  롤백하려면 미완료 Run 영수증을 drop하고 재실행 — checkpoint가 안전하게 재개.
- transient 실패 gap을 넘어 `FetchCursor`를 결코 전진시키지 말 것; 레코드를 in-place로 결코 편집하지 말 것
  (lineage로 supersede).
- Run은 proposer다: 사람의 `confirm` 없이 무언가가 `supported`에 도달하거나 승격 export를 emit하면 그것을 결함으로
  취급하고 되돌려라.

## Hand-off
- RB-042 (CLI/MCP)는 이 Run을 `run`/`status` op로 감싸고 review queue를 노출(`review`/`confirm`/`reject`);
  MCP surface는 `confirm`을 등록해서는 안 된다.
- export 이음새(RB-040)는 Run에 의해 **stage** 모드로만 호출됨; commit은 사람 게이트로 유지된다.

# RB-041: cron scheduler와 end-to-end 주간 Run 연결(incremental + dedup + resume)

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-040 (ExportAdapter + bundles), RB-031 (ledger), RB-032 (synthesis/digest), RB-011 (SourceAdapters + cursors), RB-002 (FILES-AS-TRUTH store + SQLite index), RB-003 (SchedulerAdapter port stub)]
- Implements design: [../../06-interfaces/scheduled-pipeline_ko.md](../../06-interfaces/scheduled-pipeline_ko.md), [../../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../../01-decisions/ADR-0006-storage-and-scheduling_ko.md), [../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md), [../../09-roadmap/milestones-and-phases_ko.md](../../09-roadmap/milestones-and-phases_ko.md)
- Produces: `Run` wrapper(lifecycle, single-flight lock, stage checkpoint/resume, run-receipt + dead-man check, `--since` backfill); incremental cursor store + multi-layer `seen` 인덱스; `CronSchedulerAdapter`(crontab 줄); **Milestone 1** end-to-end 주간 Run.

## Objective
하나의 명령 또는 cron 트리거가 파이프라인 core 전체 — `collect → dedup → classify → synthesize → export` —를
좁은 watch list에 대한 단일 idempotent하고 resumable한 **Run**으로 실행하여, 주간 digest를 생산하고 최소
**하나의 novelty-threat를 CAW-03로** emit한다. "Done"의 정의 = M1: radar가 incremental하게 실행되고(cursor는 완전 성공 시에만 전진),
run 간 dedup하며, 스테이지 중간 crash 후 checkpoint에서 resume하고, 두 번째 동시 트리거를 거부하며,
`run-receipt`를 써서 놓친 주가 조용히 건너뛰어지는 대신 "radar went dark" 알림을 일으킨다
(brief §1: 한 주를 조용히 건너뛰면 안 됨).

## Preconditions
- [ ] RB-002가 FILES-AS-TRUTH 레이아웃(`interests.yaml`, `findings/*.json`, `ledger/*.jsonl`, `state/*.cursor`, `runs/*.receipt.json`) + 파일로부터 재구축 가능한 SQLite 인덱스를 제공한다.
- [ ] RB-011 SourceAdapter가 실제 watch-list 데이터를 가져오고 cursor 종류를 advertise한다; legal/ToS-safe만.
- [ ] RB-021 classify 스테이지가 recall 편향 selective-review gate(abstain→human)와 함께 LF→LLM→human cascade를 실행한다.
- [ ] RB-032 FormatRenderer가 digest 포맷을 출하한다.
- [ ] RB-040 ExportAdapter가 idempotency key와 함께 등록되어 있다.
- [ ] RB-003이 `SchedulerAdapter` 포트를 노출한다; tree가 green이다.

## Steps

### 1. Run lifecycle 상태 기계 구현
- **Do:** `scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done` 상태를 가진 work 단위로 `Run`을 구현하고, 완료된 각 스테이지 후 checkpoint한다(scheduled-pipeline.md "Run lifecycle"). 각 스테이지는 idempotent하고 keyed되어 재실행이 절대 double-fetch/classify/export할 수 없어야 한다. `done` 시 `run-receipt`를 쓴다.
- **Verify:** 가짜 adapter로 하는 dry run이 모든 상태를 거치며 `done` receipt를 쓴다; `classifying` 중간 강제 crash가 checkpoint를 남기고 다음 트리거가 `collecting`이 아닌 `classifying`에서 resume한다.

### 2. single-flight lock 구현
- **Do:** `acquiring-lock`에서 `run.lock`에 `flock`을 획득한다. 두 번째 동시 트리거는 **거부**된다(로그됨, error 없음, stacking 없음).
- **Verify:** Negative test — 하나가 lock을 쥐고 있는 동안 두 번째 Run을 시작하면 "lock held" 경로(CLI에서 exit code 2)를 반환하고, 상태를 stack하거나 손상시키지 않는다.

### 3. incremental cursor 구현(advance-on-success)
- **Do:** adapter별로 `state/<source>.cursor`를 영속화한다; cursor는 그 source에 대한 **완전 성공 pass에서만** 전진한다(scheduled-pipeline.md "Incremental collection"). partial/failed source는 이전 cursor를 유지하여 다음 run이 그 window를 재시도하게 한다. per-family cursor 메커니즘을 사용한다(arXiv/S2 OAI-PMH `from=` + `resumptionToken`, `until`은 절대 설정 안 함; RSS `ETag`/`Last-Modified`/`guid`; GitHub `since=`+`pushed_at`).
- **Verify:** Negative test — 같은 window 재실행이 `new=0`을 가져온다. error로 강제된 source는 이전 cursor를 유지한다; 다른 source는 여전히 전진한다; receipt가 실패를 기록한다.

### 4. CORE의 multi-layer dedup 구현(recall-safe)
- **Do:** content-addressed `seen` 인덱스를 core에(adapter가 아님) 가장 저렴한 레이어부터 구축한다: (1) canonical id(DOI/arXiv id/URL-정규화/repo+sha), (2) 정규화된 title+abstract/body의 SHA-256. SimHash near-dup은 layer-3로 **플래그 뒤, 기본 OFF**다(false-merge는 finding을 떨어뜨림 — recall-safe 기본값 = 의심 시 **둘 다 유지**). Layer-4 = export idempotency key(이미 RB-040에 있음).
- **Verify:** 같은 DOI를 전달하는 두 source가 layer 1/2를 통해 하나의 finding으로 collapse된다; SimHash off로 ambiguous near-dup은 둘 다 유지한다. `index.sqlite`를 삭제하고 파일을 replay하면 인덱스, ledger projection, `seen` 집합이 재현된다.

### 5. state 기반 catch-up 구현(clock 아님)
- **Do:** clock-fire replay 없음. 놓친 주는 다음 Run의 window가 더 긴 시간을 span하기에 self-heal한다(cursor는 마지막 성공 시에만 전진). cursor를 무시하고 one-off 역사적 sweep을 하는 `caw05 run --since <date>`(backfill)를 추가한다 — 좁은 watch list를 시드하는 데 쓰인다(brief §6).
- **Verify:** scheduled fire를 건너뛴 뒤 한 번 실행하면 전체 gap window를 수집한다; `--since`는 cursor를 무시하고 역사를 re-sweep하며 `seen`에 대해 dedup한다.

### 6. run-receipt + dead-man's-switch 구현
- **Do:** 모든 Run이 `window`, source별 `{fetched,new,dup}`, `classified_counts`(novelty-threat/support/adjacent/noise), `exports[]`, `status`로 `runs/<run_id>.receipt.json`을 쓴다. `cadence + grace`를 지난 누락된 receipt는 **알림**("radar went dark")이며 절대 조용한 no-op이 아니다. `TODO(open-question: heartbeat sink + alert channel given no shared substrate; grace window length.)`
- **Verify:** 완료된 Run이 well-formed receipt를 쓴다; no-receipt-past-grace를 시뮬레이션하면 dead-man 알림 상태가 표면화된다(RB-042의 `caw05 status`가 소비).

### 7. failure/retry matrix 구현
- **Do:** scheduled-pipeline.md "Failure / retry / overlap"을 커버한다: crash → checkpoint에서 resume; `done` window 재실행 → no-op; export target 도달 불가 → bundle queued, idempotency key가 retry 시 dedup; 일시적 HTTP/rate-limit → adapter별 bounded retry/backoff `TODO(open-question: retry budget)`. retry는 구조상 안전하다(모든 mutating 스테이지가 keyed).
- **Verify:** retry가 double-export하지 않는다(RB-040 idempotency key로 단언); `done`-window 재실행이 new=0/dup=all을 낸다.

### 8. CronSchedulerAdapter 구현
- **Do:** `SchedulerAdapter` 포트 뒤에 `CronSchedulerAdapter`를 구현한다; `caw05 run --window weekly`를 호출하는 ONE crontab 줄을 설치하며, `$CAW05_HOME/runs/cron.log`에 append한다. scheduler는 도메인 로직을 NO로 소유한다 — cron이 결여한 모든 속성(catch-up, overlap guard, observability)은 Run wrapper에 산다. systemd-timer(`OnCalendar`+`Persistent=true`)와 cloud/Actions/Airflow는 문서화된 stub다. `TODO(open-question: exact weekly cadence/day/time + timezone.)`
- **Verify:** adapter 설치는 정확히 하나의 crontab 줄을 쓴다; 제거는 그것을 없앤다; 그 줄은 CLI Run을 호출한다. stub scheduler는 등록되고 문서화되지만 비활성화된다.

### 9. Milestone 1 컷(end-to-end)
- **Do:** watch-list source에 대해 하나의 실제 주간 Run을 실행한다: collect → dedup → classify(abstain→human gate와 함께) → digest synthesize → export. `novelty-threat`로 분류된 ≥1 finding이 confirm되고 RB-040을 통해 서명된 CAW-03 `caw05-signal` bundle로 emit됨을 보장한다. 중단 후 파일로부터 전체 Run이 resumable함을 확인한다.
- **Verify:** digest가 좁은 watch list를 커버한다; `runs/<id>.receipt.json`이 ≥1 novelty-threat와 `exports[]`의 CAW-03 항목을 보여준다; 중간 중단 + 재트리거가 re-fetch/re-export 없이 완료된다(M1 exit gate, milestones-and-phases.md P4).

## Acceptance criteria
- [ ] 하나의 명령/cron Run이 실제 watch-list source에 대해 `collect→dedup→classify→synthesize→export`를 end-to-end로 실행한다.
- [ ] cursor는 완전 성공 시에만 전진한다; window 재실행이 new=0을 낸다; 실패한 source는 다음 run에 재시도한다.
- [ ] multi-layer dedup이 CORE에서 실행된다; SimHash 기본 off(recall-safe keep-both).
- [ ] single-flight lock이 두 번째 동시 트리거를 거부한다(stack 안 됨).
- [ ] crash된 Run이 마지막 checkpoint에서 resume한다; retry는 절대 double-fetch/classify/export하지 않는다.
- [ ] 모든 Run이 `run-receipt`를 쓴다; `cadence+grace`를 지난 누락 receipt는 dead-man 알림을 일으킨다.
- [ ] `CronSchedulerAdapter`가 하나의 crontab 줄을 설치한다; systemd/cloud는 문서화된 stub다.
- [ ] M1이 성립한다: 주간 digest + CAW-03로 export된 ≥1 novelty-threat; Run이 파일로부터 resumable하다.
- [ ] 모든 scheduled-pipeline.md negative test가 통과한다; tree가 green이다.

## Rollback / safety
- crontab 줄 제거(adapter 제거)는 모든 scheduled fire를 멈춘다; 수동 `caw05 run`은 여전히 작동한다.
- cursor가 성공 시에만 전진하고 `seen` 인덱스가 content-addressed이기에, 중단/롤백된 Run은 절대 데이터를 잃거나 double-process하지 않는다 — 재트리거는 항상 안전하다.
- `index.sqlite`는 파생 캐시다: 손상되면 삭제하고 파일로부터 재구축한다(step 4에서 검증).
- classification은 abstain→human 항목을 queued로 유지하고 절대 auto-decide하지 않는다; green Run을 강제하려고 recall floor를 낮추거나 review gate를 건너뛰지 마라.

## Hand-off
- RB-042(CLI/MCP)는 이 Run을 `run`/`backfill` mutating op으로 감싸고 `status`(dead-man 상태)를 위해 receipt를 읽는다.
- M2(RB-05x)는 CAW-03 export를 verified, provenance가 완비된 `LedgerLink`를 요구하도록 강화한다; Run은 이미 `verification`과 그것이 필요한 source별 receipt count를 기록한다.
- P7 강화(retry budget, circuit breaker, embedding lane)는 lifecycle을 바꾸지 않고 이 Run wrapper 위에 구축된다.

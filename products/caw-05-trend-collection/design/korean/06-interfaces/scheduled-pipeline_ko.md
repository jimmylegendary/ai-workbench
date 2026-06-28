# Scheduled Pipeline — cron으로 구동되는 주간 Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [cli-and-mcp_ko.md](cli-and-mcp_ko.md) (`run`/`backfill`/`status`도 이 Run을 발화/점검함)
  - [digest-outputs_ko.md](digest-outputs_ko.md) (synthesize 단계의 출력들)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (Run = 작업 단위; cron이 주요 표면)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (store, lock, cursor, dedup, receipt — **권위 있음**)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (cursor 종류, RawFinding)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (classify 단계)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (export 단계 idempotency)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **예약 자동화 표면(scheduled automation surface)** — cron으로 발화되는 **주간 Run** — 과, 그것이 평범한
cron 위에서 어떻게 올바름을 유지하는지를 기술한다: source별 cursor를 통한 증분(incremental) 수집, 다층 dedup,
single-flight lock, heartbeat/dead-man's-switch, 그리고 실패/재시도/따라잡기(catch-up)다. 이 문서는 운영 독자를 위해
ADR-0006(store와 생명주기에 대해 권위 있음)을 **부연**한다; 저장 레이아웃을 재정의하거나 dedup 근거를 재진술하지
**않는다**. 모든 것을 규정하는 미션 제약: **레이더는 한 주를 조용히 건너뛰어서는 안 된다** — 놓친 근접 논문은
실존적 novelty 위험이다(brief §1).

## 스케줄러가 하는 일 — 그리고 하지 않는 일
스케줄러는 cadence에 맞춰 Run을 **발화하기만** 한다. 도메인 로직은 **하나도 소유하지 않는다**. cron이 결여한 모든
속성(catch-up, 중첩 가드, 관측 가능성)은 **Run 래퍼**에 있으므로, 레이더는 맨 cron 위에서도 올바르다(ADR-0006 §B).
`CronSchedulerAdapter`는 `SchedulerAdapter` 포트 뒤의 v1 어댑터다; systemd-timer(`OnCalendar` +
`Persistent=true`)와 cloud/Actions/Airflow는 **문서화된 stub**이다(brief §9).

```cron
# CronSchedulerAdapter installs one line (cadence illustrative — confirm on review):
# m h dom mon dow   command
  0 6 * * 1   /usr/bin/caw05 run --window weekly >> $CAW05_HOME/runs/cron.log 2>&1
```
TODO(open-question: exact weekly cadence/day/time + timezone — not yet fixed; ADR-0006 leaves cadence to review.)

## Run 생명주기 (산문이 아니라 상태)
작업 단위는 하나의 **Run**이다 — idempotent하고, 재개 가능하며, checkpoint된다(ADR-0001 §1, ADR-0006 §2/§5):

```text
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held by another run → refused (logged, no error, no stacking)
            └ any stage crash → checkpoint kept → next trigger resumes from that checkpoint
done → writes run-receipt {window, per_source:{fetched,new,dup}, classified_counts, exports[], status}
```

| Stage | Does | Recall-relevant guarantee |
|---|---|---|
| acquiring-lock | `flock` on `run.lock` | second concurrent trigger **refused**, not stacked |
| collecting | each `SourceAdapter` fetches from its cursor | advance cursor **only on full success** |
| deduping | `seen` index: canonical-id → SHA-256 (→ SimHash flagged) | recall-safe default = **keep both** on doubt |
| classifying | LF→LLM→human cascade (ADR-0004) | low confidence ⇒ abstain → human, never dropped |
| synthesizing | `FormatRenderer` over findings (ADR-0001) | `noise` not synthesized; banner stamped |
| exporting | `ExportAdapter` bundles (ADR-0007) | idempotency key ⇒ never double-route |
| done | write `run-receipt` | heartbeat proof the radar ran |

## 증분 수집 (다시 가져오지 말 것)
각 어댑터는 cursor 종류를 광고한다; 코어는 `state/<source>.cursor`를 영속화하고 **완전히 성공한 패스에서만 그것을
전진시킨다**(ADR-0006 §4). 부분적/실패한 source는 옛 cursor를 유지하므로, 다음 run이 그 window를 재시도한다 —
recall 편향적: **의심스러우면, 전진시키지 말고 다시 가져와서 dedup하라**.

| Source family | Cursor mechanism |
|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (never set `until`); carry `resumptionToken` to page |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET |
| GitHub | `since=` + repo `pushed_at` watermark |
| HN (light/stub) | Algolia `numericFilters=created_at_i>cursor` |
| Securities (stub) | EDGAR RSS / full-text `dateRange`; cursor = last accession date |

합법적/ToS 안전 ingestion만 수행한다(brief §12); rate limit과 conditional GET은 어댑터별로 준수된다.

## 다층 dedup (다시 처리/재발행하지 말 것)
콘텐츠 주소 지정(content-addressed) `seen` 인덱스로, 가장 저렴한 층부터(ADR-0006 §4):
1. **Canonical id** — DOI / arXiv id / URL 정규화 / repo+sha (정확 일치 ⇒ 이미 알려짐).
2. **Exact content hash** — 정규화된 title+abstract/body의 SHA-256 (두 source를 통한 동일 항목).
3. **Near-duplicate fingerprint** — SimHash (64-bit Hamming) — **v1 = 층 1+2; SimHash는 플래그 뒤의
   층-3이다**(잘못된 병합은 finding을 *누락*시켜 recall 우선순위를 위반함; recall-safe 기본값 = 둘 다 유지).
4. **Export idempotency** — `idempotency_key = hash(finding_id + target + classification_version)`; 동일한 key를
   재발행하는 `ExportAdapter`는 no-op이므로, 재시도는 novelty-threat를 CAW-03으로 결코 이중 경로 보내지 않는다.

## 따라잡기(Catch-up) — 놓친 주는 스스로 치유된다
catch-up은 **시계가 아니라 상태**를 통한다(ADR-0006 §C): cursor가 마지막 성공에서만 전진했으므로, 다음 Run의
window가 단순히 더 긴 시간을 포괄한다. 시계 발화 재생(clock-fire replay)은 없다(cron에 없으며; 재생은 쇄도(stampede)
위험이 있음). `caw05 run --since <date>`(backfill)는 일회성 과거 스윕을 위해 cursor를 무시한다 — 좁은 watch list를
시드하는 데 사용된다(brief §6).

## 실패 / 재시도 / 중첩
| Failure | Behavior | Why |
|---|---|---|
| Run crashes mid-stage | checkpoint kept; **next trigger resumes** at last completed stage | idempotent stages (ADR-0006 §3) |
| Re-run of a `done` window | new=0 / dup=all; no-op | idempotency keys |
| Second trigger while one in flight | **refused** (logged), not stacked | single-flight `flock` |
| One source errors | its cursor not advanced; other sources proceed; receipt records the failure | recall: re-attempt next run |
| Export target unreachable | bundle queued; idempotency key dedups on retry | ADR-0007 |
| Transient HTTP / rate-limit | per-adapter bounded retry/backoff | TODO(open-question: retry budget) |

재시도는 **설계상 안전하다**: 모든 변경 단계는 key가 부여되어 있으므로(성공 시 cursor 전진; SHA `seen`;
export idempotency key), 재실행은 결코 이중 fetch, 이중 classify, 이중 export를 할 수 없다.

## Heartbeat / dead-man's-switch
모든 Run은 `run-receipt` JSON(start, end, source별 `{fetched,new,dup}`, classified count, export, status)을
`runs/<run_id>.receipt.json`에 기록한다. **`cadence + grace`를 지난 누락된 receipt는 알림이다 — "the radar
went dark"(레이더가 어두워짐) — 조용한 no-op이 아니다**(ADR-0006 §3). 이것이 brief의 "한 주를 조용히 건너뛰면 안
된다" 보장이다. `caw05 status`가 이 상태를 표면화한다(see [cli-and-mcp_ko.md](cli-and-mcp_ko.md)).

```jsonc
// runs/<run_id>.receipt.json (shape; counts are runtime, not invented here)
{ "run_id": "r_…", "window": "weekly", "started_at": "…", "ended_at": "…",
  "per_source": { "arxiv": {"fetched": 0, "new": 0, "dup": 0} },
  "classified_counts": { "novelty-threat": 0, "support": 0, "adjacent": 0, "noise": 0 },
  "exports": [], "status": "done" }
```

## 부정 테스트 (반드시 성립해야 함 — ADR-0006에서)
- 동일한 window를 재실행하면 new=0이 된다.
- 재시도는 이중 export하지 않는다.
- `index.sqlite`를 삭제하고 파일을 재생(replay)하면 인덱스, ledger projection, `seen` 집합이 재현된다.
- 두 번째 동시 trigger는 쌓이지 않고 거부된다.
- 건너뛴 주는 조용한 no-op이 아니라 알림을 발생시킨다.

## Open Questions
- TODO(open-question: heartbeat/dead-man sink + alert channel given "no shared substrate" — local check vs
  external service?)
- TODO(open-question: per-adapter retry/backoff budget + circuit-breaker for a persistently failing source.)
- TODO(open-question: weekly cadence day/time/timezone and grace window length.)
- TODO(open-question: ledger/run-JSONL compaction + `discard` tombstone retention/TTL.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (Run wrapper):** 생명주기, single-flight lock, 단계 checkpoint/resume, run-receipt + dead-man 점검,
  `--since` backfill (가짜 어댑터로 green).
- **RB (incremental/dedup):** cursor store(성공 시 전진), `seen` 인덱스(id + SHA-256; SimHash 플래그),
  export idempotency key.
- **RB (scheduler adapter):** `CronSchedulerAdapter`가 `caw05 run --window weekly`를 호출하는 crontab 줄을
  작성함; systemd-timer/cloud는 문서화된 stub.

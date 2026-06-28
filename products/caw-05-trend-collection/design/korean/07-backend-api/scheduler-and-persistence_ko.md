# Scheduler & Persistence — cron trigger, files/SQLite store, ledger append

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md) (`run`/`backfill`/`status` op)
  - [./ingestion-service_ko.md](./ingestion-service_ko.md) (영속화하는 cursor + seen-index)
  - [./synthesis-service_ko.md](./synthesis-service_ko.md) (영속화하는 artifact)
  - [../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (the Run, 스케줄러 바인딩)
  - [../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md)
  - [../01-decisions/ADR-0005-related-work-ledger_ko.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (append-only ledger)
  - [../01-decisions/ADR-0007-export-boundaries_ko.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (export 멱등성)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
**하나의 CAW-05 배포(deployment)의 런타임 기반(substrate)** (자체 기반 — 공유 기반 없음)을 기술한다: 주간 Run을
발화(fire)하는 cron `SchedulerAdapter`, cron에 없는 catch-up/overlap/heartbeat 보장을 제공하는 Run 래퍼(wrapper),
그리고 append-only ledger 쓰기를 포함한 **files-as-truth + SQLite-index** 영속화 레이어. 이는 ADR-0006(storage +
scheduling)과 ADR-0001의 Run 생명주기를 구현한다. source fetch(형제), classification(형제), ledger 레코드
스키마(ADR-0005), export-bundle 포맷(ADR-0007)은 정의하지 **않는다**.

## 스케줄러 바인딩 (SchedulerAdapter를 통한 cron v1)
스케줄러는 Run을 **발화만** 한다. 도메인 로직을 소유하지 않는다. cron에는 catch-up, overlap guard, heartbeat이
없으므로 — 그것들은 Run 래퍼에 있으며, 이로써 plain cron에서도 레이더가 올바르게 동작한다(ADR-0001 §B, ADR-0006 §B).

```text
interface SchedulerAdapter:
  install(schedule_spec, command) -> InstallResult
  uninstall() -> Result
  list() -> ScheduleEntry[]
```

| Adapter | Tier | Catch-up | Overlap | Observability |
|---|---|---|---|---|
| `CronSchedulerAdapter` | **v1** | 없음 (wrapper) | 없음 (wrapper) | 없음 (wrapper heartbeat) |
| `SystemdTimerAdapter` | stub | native (`Persistent=true`) | native | journald |
| `CloudSchedulerAdapter` | stub | varies | varies | varies |

`CronSchedulerAdapter.install`은 `caw05 run --window weekly`를 호출하는 crontab 라인을 작성한다.
`cadence + grace`를 지나서도 run-receipt이 없으면 이는 **alert**("레이더가 어두워졌다")이며, 절대 조용한
no-op이 아니다(brief: "must not silently skip a week").

## Run 래퍼 (스케줄러와 무관한 보장)
```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held by another run → refused (logged, no error)
            └ any stage crash → checkpoint kept → next trigger resumes from checkpoint
done → writes run-receipt
```

| 보장 | 메커니즘 |
|---|---|
| **Single-flight lock** | 배타적 `run.lock` / `flock`; 진행 중일 때의 두 번째 trigger는 쌓이지 않고 거부됨 |
| **Watermark를 통한 catch-up** | 각 source는 완전히 성공한 패스에서만 `last_success_cursor`를 전진; 누락된 주는 더 넓은 다음 window가 흡수 |
| **Heartbeat / dead-man's-switch** | 모든 run은 `run-receipt`을 작성; receipt가 cadence+grace 초과로 없으면 ⇒ alert |
| **Resumable, 멱등 stage** | 크래시는 마지막 완료 단계에서 재진입; `done` Run 재실행은 no-op |
| **Backfill** | `caw05 run --since <date>`는 일회성 과거 sweep(watch-list seeding)을 위해 cursor 무시 |

**Recall 편향:** 의심스러우면 cursor를 전진시키기보다 재fetch하고 dedup하라.

```text
RunReceipt = {
  run_id, window, started_at, ended_at, status,
  per_source: { <source>: {fetched, new, dup, errors} },
  classified_counts: { <axis-combo>: int },
  exports: ExportRef[], alerts: string[],
}
```

## Persistence — files-as-truth + SQLite index/cache
**계약: 파일이 truth다; DB는 재구축 가능한 cache다**(ADR-0006 §A). `index.sqlite`를 삭제하고 파일을 재생하면 FTS5
테이블, `seen` 인덱스, ledger 투영이 재현된다.

### On-disk 레이아웃 (CAW-05 자체 트리 아래; 예시)
```text
interests.yaml | interests.json        # the typed interest artifact (ADR-0002), versioned
findings/<finding_id>.json             # one record per finding (truth)
ledger/<stream>.jsonl                  # append-only LedgerLink stream (ADR-0005)
state/<source>.cursor                  # per-source watermark
state/seen.idx                         # dedup memory (also projected into SQLite)
runs/<run_id>.receipt.json             # heartbeat receipt
artifacts/<sha>/...                    # large fetched blobs (PDFs, raw payloads) BY PATH
exports/<target>/<idempotency_key>.bundle   # signed export bundles (ADR-0007)
synthesis/<run_id>/<format>/...        # rendered markdown artifacts
index.sqlite                           # FTS5 + seen + ledger projection — REBUILDABLE
```
- 모든 텍스트 artifact는 감사/롤백을 위해 **git으로 추적 가능(git-trackable)** 하다.
- 큰 payload는 **경로로(by path)** 저장되어 provenance에서 참조되며, JSON에 절대 inline되지 않는다.

### SQLite 인덱스 (파생, 폐기 가능)
| Table/role | Built from | Used by |
|---|---|---|
| FTS5 over findings | `findings/*.json` | BM25 relevance (ADR-0002) |
| `seen` index | canonical ids + content hashes | dedup (ingestion service) |
| ledger projection | `ledger/*.jsonl` | ledger queries / verification cache |

```text
rebuild_index():            # idempotent; truth = files
    drop(index.sqlite)
    for f in findings/*.json: upsert_fts(f); add_seen(f)
    for line in ledger/*.jsonl: project_ledger(line)
```

## Ledger append (append-only)
ledger는 수정(correction)을 위해 `superseded_by`를 사용하는 append-only JSONL이다(in-place 편집은 절대 안 함 —
ADR-0005).
```text
ledger_append(link):
    assert provenance_complete(link)        # reject incomplete links
    append_jsonl(ledger/<stream>.jsonl, link)
    project_into(index.sqlite)              # cache only; file remains truth
# a correction appends a new record with superseded_by = <old_link_id>; history is preserved
```

## 멱등성 key (retry 시 이중 효과 없음)
| 관심사 | Key | Effect |
|---|---|---|
| re-fetch | per-source cursor (advance-on-success) | 재실행은 `new=0` |
| re-process | `seen` index (canonical id + SHA-256) | known 항목 skip |
| re-export | `idempotency_key = hash(finding_id + target + classification_version)` | re-emit은 no-op (ADR-0007) |

이로써 retry는 **novelty-threat를 CAW-03으로 절대 이중 라우팅하지 않는다**.

## Negative tests (반드시 성립 — ADR-0006)
- 동일 window 재실행은 `new=0`을 fetch한다.
- retry는 이중 export하지 않는다(idempotency key).
- `index.sqlite`를 삭제하고 파일을 재생하면 index, ledger projection, `seen` 집합이 재현된다.
- 두 번째 동시 trigger는 쌓이지 않고 거부된다.
- 건너뛴 주는 조용한 no-op이 아니라 alert를 일으킨다.

## Open Questions
- TODO(open-question: heartbeat/dead-man's-switch sink + alert channel given "no shared substrate" — local "no
  receipt in N days" check vs external service?)
- TODO(open-question: ledger/run-JSONL compaction + `discard` tombstone retention/TTL for dedup memory + audit.)
- TODO(open-question: long-running Run as one synchronous process vs resumable stage-jobs with a job handle —
  affects crash-resume + the `status` contract.)
- TODO(open-question: file↔index consistency check — periodic verify vs trust rebuild-on-mismatch.)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## 런북에 대한 함의
- **RB (Run wrapper):** 생명주기, single-flight lock, stage checkpoint/resume, run-receipt + heartbeat,
  `--since` backfill — fake로 green.
- **RB (store):** files-as-truth 레이아웃 + SQLite index builder + `rebuild-from-files` 명령; 큰 artifact는
  경로로.
- **RB (incremental/dedup):** cursor store (advance-on-success), `seen` index (id + SHA-256; SimHash flagged),
  export 멱등성 key.
- **RB (scheduler adapter):** crontab 라인을 작성하는 `CronSchedulerAdapter`; systemd-timer/cloud는 stub.

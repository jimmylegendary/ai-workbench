# Storage & Scheduling — files-as-truth, SQLite index/cache, cron + incremental/dedup

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: 리뷰 시 설정)
- **Related:**
  - [./data-model_ko.md](./data-model_ko.md) (여기에 저장되는 엔티티들)
  - [./provenance-and-boundaries_ko.md](./provenance-and-boundaries_ko.md) (모든 레코드가 지니는 provenance/경계)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (이 문서가 상술하는 결정)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md) (finding에 대한 FTS5 BM25)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (cursor 종류, dedup 키)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (append-only ledger JSONL)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (export idempotency 키)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **CAW-05가 상태를 어떻게 영속하고 주기적으로 실행되는가**를 확정한다: files-as-truth 온디스크 레이아웃,
재구축 가능한(rebuildable) SQLite index/ledger-cache, cron으로 트리거되는 Run 생명주기, 그리고 재실행을
중복 없이 만드는 incremental cursor + 다층 dedup. 이는 [ADR-0006](../01-decisions/ADR-0006-storage-and-scheduling_ko.md)을
파일/path/상태 수준에서 상술한다; store 선택(거기서 고정됨)을 재결정하지 않으며 엔티티 스키마([data-model](./data-model_ko.md)
참조)도 정의하지 않는다.

## 1. 저장 계약: 파일이 진실, DB는 cache
**파일(markdown/JSON/JSONL/YAML)이 단일 진실의 원천이며, `index.sqlite`는 폐기 가능하고 재구축 가능한
파생 cache다.** DB를 삭제하고 파일을 replay하면 FTS5/BM25 테이블, `seen` dedup index, ledger projection이
재생산된다 — query 목적상 bit-for-bit 동등하다. 이는 store를 git-diff 가능하고 감사 가능하게 유지하면서(brief
§7), 동시에 BM25 ranking(ADR-0002)과 빠른 ledger query를 제공한다.

| 관심사 | 디스크 상 (진실) | SQLite 내 (cache) |
|---|---|---|
| Interest 아티팩트 | `interests.yaml` (versioned) | join용 mirror row |
| Findings | `findings/*.json` (finding당 하나) | title+abstract에 대한 FTS5; relevance 컬럼 |
| Ledger | `ledger/*.jsonl` (append-only) | flatten된 link projection (`target_ref`, `relation`) |
| Dedup 메모리 | finding에서 파생 | `seen` 테이블 (canonical id, content hash) |
| Run 이력 | `runs/<run_id>.receipt.json` | last-success cursor mirror |
| 대형 blob (PDF, raw API) | path 기준 `artifacts/<sha>/…` | path 참조만 — 절대 inline 안 함 |

## 2. 온디스크 레이아웃 (CAW-05 자체 트리 아래)
```
caw05-store/
  interests.yaml                 # ADR-0002 typed interest artifact; versioned in git history
  sources.yaml                   # SourceAdapter registry (v1 + documented stubs)
  findings/
    <run_id>/fnd-<uuid>.json     # one Finding per file (raw + relevance + embedded classification)
  ledger/
    links.jsonl                  # append-only LedgerLink rows; corrections add a row (superseded_by)
    targets.yaml                 # WatchedTarget anchors (foreign_ref + label)
    sources/src-<sha>.json       # VerifiedSource, content-addressed
  digests/
    <YYYY>-<WW>.md               # rendered weekly digest (+ other FormatRenderer outputs)
  exports/
    <target>/<idempotency_key>.caw05.jsonl   # signed ExportBundle, one signal per line
  state/
    <source>.cursor              # per-source watermark (advance-on-success)
    seen.idx                     # dedup index source (canonical id + content hash)
    run.lock                     # single-flight flock
  runs/
    <run_id>.receipt.json        # heartbeat + per-source {fetched,new,dup}, classified, exports, status
  index.sqlite                   # FTS5 + seen + ledger projection — REBUILDABLE, never authoritative
```

모든 텍스트 아티팩트는 감사/rollback을 위해 git-trackable하다. `index.sqlite`는 `.gitignore`된다(파생물).

## 3. Run은 작업의 단위
Run은 idempotent하고 재개 가능한(resumable) `caw05 run --window weekly`다 — checkpoint된 파이프라인.
scheduler는 주기에 따라 Run을 *시작*만 하며, 도메인 로직을 소유하지 않는다.

```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held → refused (logged, not stacked, not an error)
            └ any stage crash → checkpoint kept → next trigger resumes from that stage
done → writes runs/<run_id>.receipt.json
```

### Run wrapper 보장 (plain cron에서 유지 — cron은 이 중 무엇도 제공하지 않음)
| 보장 | 메커니즘 | 왜 중요한가 |
|---|---|---|
| Single-flight | 배타적 `state/run.lock` (flock); 두 번째 trigger 거부 | cron은 overlap guard 없음; stampede 없음 |
| Catch-up | source별 `last_success_cursor`; 놓친 주는 다음 window를 넓힘 | 건너뛴 주가 self-heal(recall) |
| Heartbeat | 모든 Run이 receipt 기록; receipt 누락 > cadence+grace = alert | "radar가 꺼졌다"가 조용하지 않고 시끄러움 |
| Resume | stage checkpoint; `done` Run 재실행은 no-op | 죽은 Run이 깔끔히 재시작, green tree |
| Backfill | `caw05 run --since <date>`는 cursor 무시 | watch-list seeding(brief §6) |

**Recall 편향 규칙:** 의심스러우면 cursor를 전진시키기보다 다시 fetch하고 dedup하라 — 중복은 저렴하지만
놓친 논문은 치명적이다(brief §1).

## 4. Scheduling: SchedulerAdapter 뒤의 cron v1
cron은 brief가 고정한 v1 adapter다(brief §9). `CronSchedulerAdapter`는 Run을 호출하는 crontab 한 줄을
쓴다; cron이 결여한 모든 것은 Run wrapper(§3)에 산다. 따라서 정확성은 scheduler에 의존하지 않는다.

```cron
# weekly narrow radar — illustrative cadence; confirm day/time on review
# m h dom mon dow   command
  0 6 * * 1          caw05 run --window weekly >> caw05-store/runs/cron.log 2>&1
```

Documented stub (port이며 v1에서 빌드되지 않음): **systemd timer**(`OnCalendar` + `Persistent=true`가
네이티브 catch-up/overlap을 제공), cloud/Actions/Airflow. TODO(open-question: 정확한 주간 day/time — 리뷰 시
설정; 지어내지 말 것).

## 5. Incremental cursor (다시 fetch하지 않기)
각 `SourceAdapter`는 cursor 종류를 advertise한다; core는 `state/<source>.cursor` 아래에 영속하고 **완전히
성공한 pass에서만 전진**한다.

| Source family | Cursor 메커니즘 | 저장 값 |
|---|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (`until` 절대 설정 안 함); `resumptionToken` 운반 | last datestamp |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET | guid + etag |
| GitHub | `since=` + repo `pushed_at` watermark | pushed_at |
| HN (light/stub) | Algolia `numericFilters=created_at_i>cursor` | created_at_i |
| Securities (stub) | EDGAR RSS / full-text `dateRange` | last accession date |

Cursor 전진은 receipt 기록과 transactional하다: `done` 전에 crash하면 옛 cursor가 남아 다음 Run이 window를
다시 span한다(중복은 dedup으로 제거, §6).

## 6. Run 간 dedup (재처리 / 재emit 방지)
content-addressed `seen` index, 가장 저렴한 계층 우선. recall-safe 기본값: 불확실하면 **둘 다 유지**.

| Layer | Key | 잡는 것 | v1 |
|---|---|---|---|
| 1. Canonical id | DOI / arXiv id / URL-normalized / repo+sha | 정확히 동일한 항목 | **on** |
| 2. Content hash | 정규화된 title+abstract/body의 SHA-256 | 두 source를 통한 동일 항목 | **on** |
| 3. Near-dup fingerprint | SimHash (64-bit, Hamming threshold) | repost/mirror | **flagged off** (false-merge가 finding을 drop) |
| 4. Export idempotency | `hash(finding_id + target + classification_version)` | 소비자로의 이중 route | **on** |

Layer 4는 경계 보장이다: 동일한 `idempotency_key`를 재emit하는 `ExportAdapter`는 no-op(ADR-0007)이므로,
retry가 novelty-threat을 CAW-03에 절대 이중 route하지 않는다. SimHash(layer 3)는 바로 false-merge가 실제
near-collision을 *drop*하기 때문에 연기되었다 — recall-first radar에는 잘못된 tradeoff(ADR-0006).

## 7. Index rebuild & consistency
`caw05 index rebuild`는 `index.sqlite`를 drop하고 `findings/*.json` + `ledger/*.jsonl` + `state/seen.idx`를
replay하여 FTS5, `seen` 테이블, ledger projection을 재구성한다. rebuild는 consistency의 권위다: 파일↔index
drift가 의심되면 제자리 reconcile이 아니라 rebuild하라.

## Negative tests (반드시 유지)
- 동일 window 재실행 → source별 `new=0`, `dup=all`.
- retry → 이중 export 없음(idempotency key가 dedup).
- `index.sqlite` 삭제 + rebuild → index, ledger projection, `seen` set 재생산.
- 두 번째 동시 trigger → 거부, stack 안 됨.
- 건너뛴 주 → alert(receipt 누락), 조용한 no-op 아님.

## Open Questions
- TODO(open-question: "공유 substrate 없음"을 고려한 heartbeat/dead-man's-switch sink + alert 채널 — local
  "N일간 receipt 없음" 검사 vs 외부 서비스? — ADR-0006.)
- TODO(open-question: SimHash Hamming threshold + body 정규화 — v1에서 layer-3을 켜기는 하는가? — ADR-0006.)
- TODO(open-question: ledger/run-JSONL compaction + tombstone TTL — dedup 메모리 + 감사를 위해 얼마나 오래?
  — ADR-0006.)
- TODO(open-question: 장시간 실행되는 Run을 하나의 동기 프로세스로 vs job handle을 가진 재개 가능한 stage-job으로
  — crash-resume와 CLI/MCP `status` 계약에 영향.)
- TODO(open-question: 정확한 주간 cron day/time.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조 (생성 예정).

## Runbook에 대한 함의(Implications)
- **RB (store):** files-as-truth 레이아웃(§2) + SQLite index builder + `index rebuild` 명령; 대형 아티팩트는
  path 기준; DB는 `.gitignore`.
- **RB (Run wrapper):** 생명주기, single-flight flock, stage checkpoint/resume, run-receipt + heartbeat,
  `--since` backfill (fake로 green).
- **RB (incremental/dedup):** cursor store(advance-on-success), `seen` index(id + SHA-256; SimHash flagged),
  export idempotency 키; 위 다섯 negative test를 acceptance check로.
- **RB (scheduler adapter):** crontab 한 줄을 쓰는 `CronSchedulerAdapter`; systemd-timer/cloud는 stub.

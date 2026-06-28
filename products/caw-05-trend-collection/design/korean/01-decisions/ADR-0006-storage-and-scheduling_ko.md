# ADR-0006: Storage, scheduling, 그리고 run 간 incremental/dedup

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - Source of truth: [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§4, §7, §9, §11)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - Research: [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports_ko.md), [../02-research/source-ingestion.md](../02-research/source-ingestion_ko.md), [../02-research/interest-modeling.md](../02-research/interest-modeling_ko.md) (FTS5 index)
  - ADR-0002 interest model — [./ADR-0002-interest-model.md](./ADR-0002-interest-model_ko.md) (findings에 대한 SQLite FTS5)
  - ADR-0003 source adapters & ingestion — [./ADR-0003-source-adapters-and-ingestion.md](./ADR-0003-source-adapters-and-ingestion_ko.md) (SourceAdapter cursor 종류, RawFinding)
  - ADR-0004 classification & triage — [./ADR-0004-classification-and-triage.md](./ADR-0004-classification-and-triage_ko.md) (classify 단계)
  - ADR-0005 related-work ledger — [./ADR-0005-related-work-ledger.md](./ADR-0005-related-work-ledger_ko.md) (store가 영속화하는 것; append-only link)
  - ADR-0007 export boundaries — [./ADR-0007-export-boundaries.md](./ADR-0007-export-boundaries_ko.md) (export 단계 + idempotency)
  - CAW-03 (별도 제품) — 동일 registry *패턴*, 공유 registry/store 없음

## Context

radar의 가치는 **좁은 watch list에 대한 high recall을, 주간으로, 아무도 실행을 기억하지 않아도** 달성하는 것이다
(brief §1, §3). 이는 결합된 세 요구를 부과한다: 제품 자신의 것인 **store**, 즉 markdown/JSON + 가벼운
index/ledger(brief §7); 주간 run을 발사하며 한 주를 *조용히* 건너뛰지 않는 **scheduler**(건너뛴 한 주는 존재적
recall 위험); 그리고 re-run이나 retry가 re-fetch, re-classify, 또는 — 최악으로 — novelty-threat를 CAW-03로
double-emit하지 않게 하는 **incremental/dedup**.

영향 요인(Forces):
- 주간, 무인, 놓친 run을 따라잡아야 하고 실행되었음을 증명해야 함(heartbeat). 조용한 no-op이 아니어야 함.
- Re-run/retry는 모든 계층에서 중복이 없어야 함: fetch, ledger 행, exports.
- Source는 이질적이고 공개이며 rate-limited, ToS-bound이다(brief §5, §12).
- 공유 런타임 substrate 없음. export는 명시적 제품 경계를 넘는다(brief §1, §8).
- store는 사람이 diff/감사 가능(markdown/JSON)해야 하면서도 BM25 랭킹(ADR-0002)과 append-only ledger(ADR-0005)를
  지원해야 한다.

## Options considered

### A. On-disk store

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Markdown/JSON 파일(git-tracked)을 source of truth로 + SQLite (FTS5)를 재구축 가능한 index/cache로; 대형 fetch 산출물은 path로** | 사람이 diff/감사 가능; 계열 + brief §7에 부합; index는 폐기/재구축 가능; 서비스 없음 | 동기화할 두 표현(file = truth, db = derived) | **chosen** |
| SQLite를 source of truth로 | 단일 store, transactional | git diff/review에 불투명; "markdown/JSON-first"가 아님(brief §7) | truth로는 rejected (index로만 유지) |
| 외부 DB / 서비스 | 확장됨 | 공유/상주 substrate; 독립성 + brief §7 위반 | rejected |

계약: **파일이 truth, DB는 cache.** DB를 삭제하고 파일을 재생하면 index, FTS5 테이블(ADR-0002), `seen` index,
ledger 투영이 재현된다. Findings/links/run-receipt는 JSON(파일당 한 레코드 또는 run당 JSONL)이다. ledger는
`superseded_by`가 있는 append-only JSONL이다(ADR-0005). 대형 fetch payload(PDF, raw API blob)는 **path로** 저장되며
provenance에서 참조되고 절대 inline되지 않는다.

### B. Scheduler 트리거

| Option | Catch-up | Overlap guard | Observability | Fit |
|---|---|---|---|---|
| **cron** (brief에서 고정된 v1) | 기본 없음 | 기본 없음 | 기본 없음 | **chosen** (brief §9) — gap은 Run wrapper에서 보완 |
| systemd timer (`OnCalendar` + `Persistent=true`) | native | native | journald | 실제 호스트에서 최선 — `SchedulerAdapter` stub로 출하 |
| cloud/Actions/Airflow | 다양 | 다양 | 다양 | 이후 adapter |

**Decision:** cron이 v1 adapter이다. cron이 결여한 속성은 **scheduler에서 가정하지 않고 Run wrapper에서** 구현된다.
따라서 radar는 순수 cron 위에서도 올바르다. `SchedulerAdapter` 포트가 트리거를 추상화하여 systemd-timer adapter가
나중에 catch-up을 native로 제공할 수 있게 한다.

### C. Catch-up 메커니즘

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Per-source cursor watermark (시계가 아닌 state로 catch-up)** | 놓친 한 주가 자가 치유 — 다음 run의 window가 그저 더 긴 시간을 포괄; 어떤 scheduler에서도 동작 | 영속 cursor + "성공 시에만 advance" 규율 필요 | **chosen** |
| 놓친 시계 발사를 replay | 개념적으로 단순 | cron이 결여한 scheduler 기능에 의존; double-fire가 stampede 위험 | 메커니즘으로는 rejected |

## Decision

**1. Store = files-as-truth + SQLite index/ledger-cache.** CAW-05 자신의 트리 아래 레이아웃(예시):
`interests.yaml`/`.json`(ADR-0002); `findings/*.json`; `ledger/*.jsonl`(append-only, ADR-0005);
`state/<source>.cursor`; `state/seen.idx`; `runs/<run_id>.receipt.json`; `artifacts/<sha>/…`(대형 blob을 path로);
`index.sqlite`(FTS5 + `seen` + ledger 투영 — **재구축 가능**). 모든 텍스트 산출물은 감사/롤백을 위해 git-trackable이다.

**2. 작업 단위는 Run이다** — idempotent하고 resumable한 호출 `caw05 run --window weekly` — checkpoint된 단계들의
파이프라인: `collect → dedup → classify → synthesize → export → done`. scheduler는 cadence에 따라 Run을 시작만
한다. 도메인 로직은 소유하지 않는다.

**3. Run wrapper 보장 (scheduler와 무관하게):**
- **Single-flight lock** — run은 배타적 lock(`run.lock` / flock)을 획득한다. 하나가 진행 중일 때의 두 번째
  트리거는 쌓이지 않고 거부된다(cron에는 overlap guard가 없다).
- **Watermark 기반 catch-up** — 각 source는 완전 성공 pass에서만 `last_success_cursor`를 advance한다. 놓친 한
  주는 다음 run의 더 넓은 window에 흡수된다. **Recall bias: 의심스러우면 cursor를 advance하기보다 re-fetch하고
  dedup한다.**
- **Heartbeat / dead-man's-switch** — 모든 run은 `run-receipt`(start, end, per-source {fetched,new,dup},
  classified count, exports, status)를 쓴다. cadence + grace를 초과하도록 receipt가 없으면 **alert**("radar가
  멈췄다")이며, 이것이 "조용히 건너뛰지 않아야 한다"를 충족한다.
- **Resumable, idempotent 단계** — 크래시는 마지막 완료 단계에서 재진입한다. `done`인 Run을 다시 실행하면
  no-op이다(아래 idempotency 키).
- **Backfill** — `caw05 run --since <date>`는 일회성 과거 sweep을 위해 cursor를 무시한다(watch-list seeding,
  brief §6).

**4. Incremental & dedup는 코어에 있다** (그래서 모든 `SourceAdapter`가 이를 상속한다):

*Per-source cursor (re-fetch 금지)* — 각 adapter는 cursor 종류를 광고하고, 코어가 그것을 영속화한다:

| Source 계열 | Cursor 메커니즘 |
|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (`until`은 절대 설정 안 함), `resumptionToken`을 들고 페이징 |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET |
| GitHub | `since=` + repo `pushed_at` watermark |
| HN (light/stub) | Algolia `numericFilters=created_at_i>cursor` |
| Securities (stub) | EDGAR RSS / full-text `dateRange`; cursor = last accession date |

*Content-addressed dedup (re-process / re-emit 금지)* — `seen` index, 가장 저렴한 계층부터:
1. **Canonical id** — DOI / arXiv id / URL-normalized / repo+sha (exact match ⇒ known).
2. **Exact content hash** — normalized title+abstract/body의 SHA-256 (같은 항목을 두 source로 잡음).
3. **Near-duplicate fingerprint** — repost/mirror용 SimHash(64-bit, Hamming threshold). **v1 = 계층 1+2;
   SimHash는 플래그 뒤의 계층 3** (false-merge는 finding을 *떨어뜨려* recall 우선순위를 위반하므로, recall-safe
   기본값 = 둘 다 보관).
4. **Export idempotency** — 각 export bundle은 `idempotency_key = hash(finding_id + target +
   classification_version)`을 담는다. 같은 키를 re-emit하는 `ExportAdapter`는 no-op이다(ADR-0007). 따라서 retry는
   novelty-threat를 CAW-03로 결코 double-route하지 않는다.

**5. Run lifecycle (산문이 아닌 state):**
```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
            │ lock held by another run → refused (logged, no error)
            └ any stage crash → checkpoint kept → next trigger resumes from checkpoint
done → writes run-receipt {window, per_source:{fetched,new,dup}, classified_counts, exports[], status}
```

## Consequences

**Easy:** 놓친 한 주가 다음 run에서 자가 치유됨. 같은 window를 다시 실행하면 new=0/dup=all이 나옴. 죽은 Run은
마지막 단계에서 resume됨. store는 git 감사 가능하고 index는 폐기/재구축 가능함. retry는 결코 double-export하지
않음(idempotency 키). BM25(ADR-0002)와 ledger(ADR-0005)가 하나의 substrate 위에 놓임.

**Hard / follow-on:** 두 표현(file truth + DB cache)은 rebuild 경로와 일관성 점검이 필요함. heartbeat는 "공유
substrate 없음"을 존중하는 sink가 필요함(로컬 "N일간 receipt 없음" 점검 vs 외부 dead-man 서비스 — open question).
append-only ledger + run JSONL은 compaction/retention 정책 없이는 무한히 커짐. SimHash 임계값은 false-merge가
recall을 해치기 때문에 정확히 그 이유로 보류됨.

**Negative tests (반드시 성립):** 같은 window를 다시 실행하면 new=0 fetch; retry는 double-export하지 않음;
`index.sqlite`를 삭제하고 파일을 재생하면 index, ledger 투영, `seen` 집합이 재현됨; 두 번째 동시 트리거는 쌓이지
않고 거부됨; 건너뛴 한 주는 조용한 no-op이 아니라 alert를 발생시킴.

**Implications for runbooks:** **RB (core/Run-wrapper)** — Run lifecycle, single-flight lock, 단계
checkpoint/resume, run-receipt + heartbeat, `--since` backfill (fake로 green). **RB (store)** — files-as-truth
레이아웃 + SQLite index builder + rebuild-from-files 명령; 대형 artifact는 path로. **RB (incremental/dedup)** —
cursor store(advance-on-success), `seen` index(id + SHA-256; SimHash는 플래그됨), export idempotency 키.
**RB (scheduler adapter)** — `caw05 run --window weekly`를 호출하는 crontab 라인을 쓰는 `CronSchedulerAdapter`;
systemd-timer/cloud adapter는 문서화된 stub로.

## Open questions / revisit triggers

- TODO(open-question: "공유 substrate 없음"을 고려한 heartbeat/dead-man's-switch sink와 alert 채널 — 로컬 점검 vs
  외부 서비스?)
- TODO(open-question: 계층 3을 위한 SimHash Hamming threshold + body normalization — recall이 임무인 점을 고려해
  허용 가능한 false-merge rate; 계층 3을 v1에서 켜기는 하는가?)
- TODO(open-question: ledger/run-JSONL compaction + `discard` tombstone retention/TTL — dedup 메모리 + 감사를
  위해 얼마나 오래?)
- TODO(open-question: 장시간 Run을 하나의 동기 프로세스로 vs job handle을 가진 resumable stage-job로 —
  crash-resume와 CLI/MCP `status` 계약에 영향.)
- TODO(open-question: file↔index 일관성 점검 — 주기적 verify인가, 아니면 mismatch 시 rebuild를 신뢰하는가?)
- **Revisit trigger:** findings 볼륨이 file-per-record + SQLite를 초과하거나 index rebuild가 너무 느려지면,
  서비스를 추가하기 전에 store 결정을 다시 연다.
- `../08-research-plan/open-questions.md` 참조 (생성 예정).

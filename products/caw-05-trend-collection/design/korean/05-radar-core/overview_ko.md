# Radar Core — Overview(개요)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [interest-model.md](interest-model_ko.md) — typed interest artifact + explainable relevance
  - [source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md) — SourceAdapter 계약 + cursor + dedup
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) — Run + 세 surface + 다섯 format
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) — files-as-truth + Run lifecycle
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) — 유일한 export 이음새
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적(Purpose)
이 문서는 **radar core가 무엇인지** 기술한다 — public source를 triage·synthesize·export된 finding으로 바꾸는 단일
파이프라인(`Run`) — 그리고 그 단계들과 그 사이의 port들의 **폴더 맵**을 제공한다. 두 형제 deep-dive
([interest-model.md](interest-model_ko.md), [source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md))의
진입점이다. 이 문서는 어떤 ADR도 다시 결정하지 않는다: surface/format(ADR-0001), interest 모델(ADR-0002),
ingestion(ADR-0003), classify rubric(ADR-0004), ledger(ADR-0005), storage/scheduling(ADR-0006), 또는
export(ADR-0007)는 거기서 확정되어 있다. 이것은 *core의* 형태다 — 세 개의 얇은 surface가 구동하는 코드 — 어떤 surface가
아니라 core가 강제하는 네 가지 불변식을 강조한다.

## "core"가 무엇인가
CAW-05는 **독립적인 조기 경보 radar**다: public source를 ingest하고, 큐레이션된 interest 모델 대비 점수를 매기며, 각
finding을 분류·라우팅하고, 읽기 좋은 출력을 synthesize하며, 명시적 제품 경계를 가로질러 signal을 export한다. 다른 CAW
제품들과 **공유 런타임 기반(shared runtime substrate)이 없다**(brief §1).

core는 **세 개의 얇은 surface 뒤의 하나의 파이프라인**이다(ADR-0001): cron-**scheduled** 자동화 파이프라인, **CLI**(사람/CI),
그리고 **MCP** 서버(에이전트). 셋 모두 *동일한* 검증된 op-set을 구동한다. 어느 것도 자체 수집이나 governance 로직을 갖지
않는다. 작업 단위는 **Run**이다.

### 네 가지 core 불변식 (절대 surface에 살지 않음)
이것들은 load-bearing 보증이다. surface는 동작을 *요청*할 수 있고, core만이 그것을 수행한다.

| 불변식 | 의미 | 확정 위치 |
|---|---|---|
| **watch list에서의 high recall** | 임의의 `recall_priority: high` watch-list hit은 *노출되며 절대 조용히 drop되지 않음*; 점수는 순서를 지배하지 생존을 지배하지 않음 | ADR-0002 §3, [interest-model.md](interest-model_ko.md) |
| **Provenance-complete** | 모든 finding은 origin URL + `retrieved_at` + native id + `boundary=public` + `trust`를 유지; 그것 없는 레코드는 없음 | ADR-0003, [source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md) |
| **Legal/ToS-safe source만** | 공식 API + publisher feed; HTML만 존재하면 metadata-only-link; ToS-unsafe adapter는 preflight에서 거부 | brief §5/§12, ADR-0003 |
| **생성된 summary ≠ evidence** | Synthesis/classification rationale은 불변 finding에 대한 annotation; `evidence:false`로 표기; 절대 진실 원천 아님 | brief §12, ADR-0001 §5, ADR-0004 |

## Run 파이프라인 (단계)
Run은 idempotent하고 재개 가능한 호출 `caw05 run --window weekly`이며, checkpoint된 단계들의 파이프라인이다
(ADR-0001 §1, ADR-0006 §2). 크래시는 마지막으로 완료된 단계에서 재진입한다. `done`인 Run을 다시 실행하는 것은 no-op다.

```
scheduled → acquiring-lock → collect → dedup → score → classify → route → synthesize → export → done
```

> 주: ADR-0006은 lifecycle을 `collect → dedup → classify → synthesize → export`로 명명한다. **score**(ADR-0002)와
> **route**(ADR-0004)는 동일한 척추의 명시적 하위 단계로, core 맵을 위해 여기서 분리되었다. 이들은 새로운 최상위 단계가
> 아니며 receipt 계약을 바꾸지 않는다.

| 단계 | 하는 일 | 소유 불변식 | Port | 상세 |
|---|---|---|---|---|
| **collect** | cursor 이후 source별 신규/갱신 항목을 pull | legal/ToS-safe; provenance | `SourceAdapter` | [source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md) |
| **dedup** | source/run에 걸친 동일 항목을 하나의 finding, 여러 provenance 항목으로 축약 | recall-safe (false-merge 없음) | core (adapter별 아님) | [source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md) |
| **score** | `interests.json` 대비 additive explainable relevance; `relevance_explain[]` 방출 | high recall (surface-not-drop) | scorer (FTS5) | [interest-model.md](interest-model_ko.md) |
| **classify** | LF→LLM→human cascade를 통한 2축 taxonomy; abstain→human | recall-biased selective review | `Classifier` | ADR-0004 |
| **route** | knowledge/task/experiment/open-question/discard로의 deterministic config-driven route | terminal route 전 review gate | `Router` | ADR-0004 |
| **synthesize** | triage된 `Finding`에 대해 memo/digest/slide/paper-card/action-brief 렌더링 | generated ≠ evidence 배너 | `FormatRenderer` | ADR-0001 §5 |
| **export** | 유일한 export 이음새를 통해 CAW-02/03/01/06으로 signal bundle; idempotent | 공유 저장소 없음; idempotency key | `ExportAdapter` | ADR-0007 |

Run wrapper는 **어떤** scheduler에서든(ADR-0006 §3) 다음을 추가한다: **single-flight lock**, **watermark를 통한
catch-up**(놓친 주는 다음의 더 넓은 window에서 자가 치유됨), **run-receipt heartbeat**(`cadence + grace`를 지난 누락된
receipt는 조용한 no-op이 아니라 *alert*임), 그리고 watch-list seeding을 위한 `--since` **backfill**.

## 폴더 맵 (core)
CAW-05 자체 트리 아래의 예시 모듈 레이아웃. 파일이 진실이고, SQLite는 재구축 가능한 index/cache다(ADR-0006). 이것은 최종
코드가 아니라 빌드 가이드다 — 빌더가 실제 모듈을 작성한다.

```
caw05/
  core/
    run.py              # Run lifecycle: lock, stage checkpoints, resume, receipt, backfill
    pipeline.py         # stage orchestration: collect→dedup→score→classify→route→synthesize→export
    ports.py            # Protocols: SourceAdapter, Classifier, Router, FormatRenderer,
                        #            ExportAdapter, SchedulerAdapter
  ingest/
    adapters/           # ArxivAdapter, SemanticScholarAdapter, GithubAdapter, BlogRssAdapter,
                        #   HackerNewsAdapter (light); RedditAdapter/EdgarAdapter/... (stubs)
    cursors.py          # per-source watermark store (advance-on-success)
    dedup.py            # canonical-id ▸ SHA-256 ▸ SimHash(flagged); cross-source folding
    provenance.py       # origin/retrieved_at/native id/boundary/trust stamping
  interest/
    model.py            # interests.yaml → interests.json compiler + schema validation
    scorer.py           # additive formula; relevance + relevance_explain[]; recall gate
    feedback.py         # bounded weight nudge + suggestion queue + decay/re-rank
  classify/             # LF→LLM→human cascade + deterministic router (ADR-0004)
  synthesize/           # base template (provenance + "not evidence" banner) + 5 renderers
  export/               # ExportAdapter bundles to CAW-02/03/01/06 (ADR-0007)
  store/
    layout.py           # files-as-truth paths; index builder; rebuild-from-files
  surfaces/
    cli.py  mcp.py  scheduler.py   # thin drivers over one op-set (ADR-0001)
  config/
    interests.yaml  sources.yaml  caw05.config.toml
```

### On-disk store (files-as-truth, ADR-0006 §1)
```
interests.yaml / interests.json     # control surface + compiled (ADR-0002)
findings/*.json                     # one triaged Finding per file (the unit of value)
ledger/*.jsonl                      # append-only related-work ledger (ADR-0005)
state/<source>.cursor               # per-source watermark
state/seen.idx                      # dedup memory (canonical id + content hash)
runs/<run_id>.receipt.json          # heartbeat: per-source {fetched,new,dup}, exports, status
artifacts/<sha>/...                 # large fetched payloads BY PATH, never inlined
index.sqlite                        # FTS5 + seen + ledger projection — REBUILDABLE from files
```

## 데이터 척추 (하나의 Finding, 여러 view)
`RawFinding`(adapter 출력)은 **Finding**으로 dedup되며, 여기에 relevance annotation(점수 + 설명), classification +
route, 그리고 그것이 목격된 모든 source의 provenance가 축적된다. Synthesis는 그 하나의 Finding을 여러 format으로
렌더링한다. export는 경계를 가로질러 그것을 bundle한다. 하나의 진실 원천, 하나의 provenance manifest. Finding에 첨부된
생성된 prose는 항상 `evidence:false`로 표기된다.

```
RawFinding (per source)  ──dedup──▶  Finding  ──score──▶  +relevance_explain[]
                                       │ classify+route ──▶ +classification +route
                                       │ synthesize ──▶ memo | digest | slide | paper-card | action-brief
                                       └ export ──▶ CAW-02 (Source/Claim/RelatedWork) | CAW-03 (RadarSignal)
                                                    | CAW-01/06 (open questions)
```

## 상호 링크
- **core로의 입력:** [source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md) (collect + dedup).
- **load-bearing core:** [interest-model.md](interest-model_ko.md) (score + recall floor).
- **core의 downstream:** classify/route(ADR-0004), synthesis(ADR-0001 §5), export(ADR-0007) — 여기서 복제하지 않음.

## Open Questions
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.
- TODO(open-question: Run이 하나의 동기 프로세스인가, 아니면 handle을 가진 재개 가능한 stage-job인가? `status` 계약에
  영향 — ADR-0001/ADR-0006과 공동 소유.)
- TODO(open-question: "공유 substrate 없음"을 감안할 때 heartbeat/dead-man's-switch sink — local 검사 vs 외부?)
- TODO(open-question: file↔index 일관성 검사 — 주기적 verify vs rebuild-on-mismatch 신뢰?)

## 런북에 대한 함의
- **RB (Run wrapper):** lifecycle, single-flight lock, stage checkpoint/resume, run-receipt heartbeat,
  `--since` backfill; 실제 adapter가 도착하기 전 fake로 green.
- **RB (pipeline):** `ports.py` 위에 collect→dedup→score→classify→route→synthesize→export 단계 순서를 배선.
- **RB (store):** files-as-truth 레이아웃 + SQLite index builder + rebuild-from-files; 큰 artifact는 path로.
- 단계별 런북은 형제 문서/ADR가 소유한다 — 이 overview는 척추와 맵만 확정한다.

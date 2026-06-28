# 리포 구조 — 디렉터리 레이아웃, ports/adapters 이음매, files-as-truth 저장소

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow_ko.md), [./tech-stack.md](./tech-stack_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (core + 3 surface + 5 renderer)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (SourceAdapter + registry)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (files-as-truth 레이아웃)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (ExportAdapter 이음매)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports_ko.md) (포트, 레지스트리, 스텁 패턴)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-05의 **디스크 상 레이아웃**을 고정한다: 코드 패키지(core, ports, adapters, renderers,
scheduler, surfaces)와 **데이터 트리**(`interests.yaml`, `findings/`, `ledger/*.jsonl`, `state/`, `runs/`,
`exports/`). ports-and-adapters 이음매를 디렉터리로 가시화하여 새로운 source/export/scheduler가 "어댑터 파일
하나 + config 블록 하나"가 되게 한다([ports research §8](../02-research/scheduling-and-ports_ko.md)). 이 문서는
파이프라인([data-flow.md](./data-flow_ko.md))이나 도구 버전([tech-stack.md](./tech-stack_ko.md))을 재결정하지
않는다. 데이터 트리는 CAW-05의 **자체** 저장소다 — 공유 기반(substrate) 없음(brief §1, §7); export는 오직
`ExportAdapter` 이음매를 통해서만 나간다.

## 1. 최상위 레이아웃

```
caw05/                              # the product repo (CAW-05's own; independent)
├── pyproject.toml                  # deps + entry-point groups (caw05.source_adapters, …) — tech-stack.md
├── uv.lock | poetry.lock           # pinned lockfile (TODO pin — tech-stack.md)
├── README.md
├── caw05.config.toml               # the ONLY wiring file: which adapters are active per port
├── config/
│   ├── interests.yaml              # typed interest artifact (versioned) — ADR-0002
│   ├── sources.yaml                # source registry + feeds allow-list (feeds.yaml may split out)
│   ├── feeds.yaml                  # vetted blog/lab RSS allow-list (ADR-0003 OQ)
│   ├── routing.yaml               # deterministic route rules (label→destination) — ADR-0004
│   └── watchlist.yaml              # narrow watch list seed (brief §6)
│
├── src/caw05/                      # the Python package (core behind all surfaces)
│   ├── core/                       # the Run + domain; imports NO adapter concretely
│   │   ├── run.py                  # Run wrapper: lock, preflight, checkpoints, resume, receipt — ADR-0006
│   │   ├── pipeline.py             # the 8 stages wired (collect→…→export) — data-flow.md
│   │   ├── dedup.py                # multi-layer seen index (id, SHA-256, SimHash flag) — ADR-0003 §5
│   │   ├── cursors.py              # per-source watermark store (advance-on-success) — ADR-0006 §4
│   │   ├── relevance.py            # BM25 additive explainable score + recall floor — ADR-0002
│   │   ├── classify.py             # LF→LLM→human cascade + selective-review gate — ADR-0004
│   │   ├── route.py                # deterministic config-driven router — ADR-0004
│   │   ├── ledger.py               # append-only LedgerLink + S2 verification — ADR-0005
│   │   ├── synthesize.py           # drives the FormatRenderer set — ADR-0001
│   │   ├── model/                  # value objects (pydantic): RawFinding…LedgerLink, capabilities
│   │   └── registry.py             # AdapterRegistry (decorator + entry-point discovery) — ports §5
│   │
│   ├── ports/                      # typed Protocol interfaces ONLY (no I/O)
│   │   ├── source.py               # SourceAdapter (discover/fetch/health) — ports §4.1
│   │   ├── export.py               # ExportAdapter (can_accept/export) — ports §4.2 / ADR-0007
│   │   ├── scheduler.py            # SchedulerAdapter (install/status/uninstall) — ports §4.3
│   │   └── renderer.py             # FormatRenderer (render) — ADR-0001
│   │
│   ├── adapters/
│   │   ├── sources/                # one file per source family (driven)
│   │   │   ├── arxiv_s2.py         # v1: arXiv OAI/query/RSS + Semantic Scholar enrich
│   │   │   ├── rss_blog.py         # v1: generic Atom/RSS conditional GET (feeds.yaml)
│   │   │   ├── github.py           # v1: releases/tags/commits.atom + REST (ETag/since)
│   │   │   ├── hn_light.py         # v1 light: HN Algolia, metadata+link only
│   │   │   ├── reddit.py           # STUB (OAuth pre-approval) — ports §7
│   │   │   ├── edgar.py            # STUB (SEC EDGAR ≤10 req/s)
│   │   │   ├── newsletter.py       # STUB
│   │   │   └── internal_feed.py    # STUB
│   │   └── exports/                # one file per downstream target (cross-boundary)
│   │       ├── caw02_source_claim.py   # v1: Source/Claim/RelatedWork bundle — ADR-0007
│   │       ├── caw03_novelty.py        # v1: novelty RadarSignal bundle
│   │       ├── caw01_open_question.py   # v1: open-question bundle
│   │       ├── caw06_open_question.py   # v1: open-question bundle
│   │       └── _stub_target.py         # STUB template for other targets
│   │
│   ├── renderers/                  # FormatRenderer implementations (markdown-first) — ADR-0001
│   │   ├── memo.py
│   │   ├── digest.py
│   │   ├── slide_outline.py
│   │   ├── paper_card.py
│   │   ├── action_brief.py
│   │   └── templates/              # jinja2 templates (*.md.j2)
│   │
│   ├── scheduler/                  # SchedulerAdapter implementations (driving)
│   │   ├── cron.py                 # v1: CronSchedulerAdapter (writes crontab line)
│   │   ├── systemd_timer.py        # STUB (native Persistent=true catch-up)
│   │   ├── github_actions.py       # STUB
│   │   └── cloud.py                # STUB
│   │
│   └── surfaces/                   # thin entrypoints over the ONE core — ADR-0001
│       ├── cli.py                  # `caw05 run|status|interests|adapters|--since`
│       └── mcp.py                  # MCP tools: run/inspect + ledger read view
│
├── data/                          # CAW-05's OWN store — files-as-truth (ADR-0006 §1)
│   ├── findings/                  # one JSON record per finding (truth)
│   │   └── <finding_id>.json
│   ├── ledger/                    # append-only JSONL (truth) — ADR-0005
│   │   └── <yyyy-ww>.jsonl        # LedgerLink rows; superseded_by, never mutated
│   ├── state/                     # incremental + dedup state
│   │   ├── arxiv.cursor           # per-source watermark (advance-on-success)
│   │   ├── github.cursor
│   │   ├── rss.cursor
│   │   ├── hn.cursor
│   │   └── seen.idx               # content-addressed dedup index
│   ├── runs/                      # heartbeat / audit
│   │   └── <run_id>.receipt.json  # {window, per_source:{fetched,new,dup}, classified_counts, exports[], status}
│   ├── review/                    # selective-review queue (abstain→human) — ADR-0004
│   │   └── <finding_id>.json
│   ├── out/                       # rendered artifacts per run — ADR-0001
│   │   └── <run_id>/{memo,digest,slides,paper-card,action-brief}.md
│   ├── exports/                   # signed cross-boundary bundles (write-only seam) — ADR-0007
│   │   ├── caw02/ caw03/ caw01/ caw06/
│   ├── artifacts/                 # large fetched blobs BY PATH (PDFs, raw API) — ADR-0006
│   │   └── <sha>/…
│   ├── index.sqlite               # FTS5 + seen + ledger projection — REBUILDABLE cache (gitignored)
│   └── run.lock                   # single-flight flock (gitignored)
│
├── tests/                         # fakes for every port; negative tests (re-run new=0, no double-export)
│   ├── fakes/                     # FakeSourceAdapter, FakeExportAdapter, FakeScheduler
│   └── …
└── design/                        # this design tree (the docs you are reading)
```

## 2. 계층화 규칙 (의존성 방향)

```
surfaces  ─►  core  ─►  ports (Protocols)  ◄─  adapters / renderers / scheduler
                                                       (register into core.registry)
```

| 계층 | import 가능 | import 불가 |
|---|---|---|
| `surfaces/` | `core` | 어댑터 구체(concrete) 직접 |
| `core/` | `ports`, `model`, `registry` | 모든 구체 어댑터 (오직 registry 경유) |
| `ports/` | stdlib + model | core, adapters |
| `adapters/`, `renderers/`, `scheduler/` | `ports`, `model` | `core.pipeline` 내부 |

코어는 **인터페이스에만** 의존한다; 구체는 decorator 또는 entry-point로 등록된다([ports §5](../02-research/scheduling-and-ports_ko.md)).
이것이 이음매 테스트를 성립시킨다: 새 통합은 `adapters/…` 아래 파일 하나 + `caw05.config.toml`의 블록 하나를
추가하며 `core/`에는 아무것도 건드리지 않는다.

## 3. 무엇이 truth, cache, gitignored인가

| 경로 | 종류 | 비고 |
|---|---|---|
| `config/*.yaml`, `caw05.config.toml` | truth (git-tracked) | 버전 관리되는 interest/source/routing config — ADR-0002 |
| `data/findings/*.json`, `data/ledger/*.jsonl` | truth (git-trackable) | 사람이 diff 가능, 감사 가능 — ADR-0006 |
| `data/state/*`, `data/runs/*`, `data/out/*`, `data/exports/*` | truth/output | state + receipt + rendered + bundle |
| `data/artifacts/<sha>/` | truth-by-path | provenance에서 참조되는 대용량 blob, 결코 인라인 안 됨 |
| `data/index.sqlite` | **cache (gitignored)** | 파일로부터 재구축 가능; 삭제 + 재생으로 재현 |
| `data/run.lock` | runtime (gitignored) | single-flight flock |

계약 (ADR-0006): `index.sqlite`를 삭제하고 `findings/` + `ledger/`를 재생하면 FTS5, `seen` 집합, ledger
projection이 재현된다. `.gitignore`는 `index.sqlite`, `run.lock`, `artifacts/` payload를 제외한다.

## 4. 디스크 상의 스텁 관례
모든 brief-§9 미래 어댑터는 `maturity="stub"`를 가진 **등록되었으나 config-disabled된 파일**로 존재한다(예:
`adapters/sources/reddit.py`, `scheduler/systemd_timer.py`). 이것은 `registry.list()` / CLI / MCP에 나타나지만
`active`로 만들어지면 preflight가 거부하며, 구현할 파일을 가리킨다([ports §7](../02-research/scheduling-and-ports_ko.md)).
나중에 배선하는 것 = 그 파일의 메서드 본문을 채우고 `caw05.config.toml`에서 `enabled = true`로 전환하는 것.

## 5. 명명 관례
- 패키지/모듈: `snake_case`; config의 어댑터 id는 `kebab-case` (`arxiv-s2`, `caw02-source-claim`).
- finding은 `canonical_id`에서 파생된 `finding_id`로 키잉; ledger 파일은 ISO 주차로 버킷팅 `<yyyy-ww>.jsonl`.
- Run artifact는 `run_id`로 네임스페이싱; export bundle은 target 디렉터리로 네임스페이싱.
- PRODUCT-BRIEF / GLOSSARY의 엔티티 이름을 정확히 사용한다 (WatchedTarget, Finding/Signal, LedgerLink, RadarSignal).

## 열린 질문(Open Questions)
`../08-research-plan/open-questions.md`에서 추적:
- TODO(open-question: should `config/` live beside code or under `data/` for per-deployment overrides?)
- TODO(open-question: ledger/run-JSONL compaction + retention — affects `ledger/` and `runs/` growth (ADR-0006).)
- TODO(open-question: do findings shard into subdirs (by week/source) before a flat `findings/` gets too large?)
- TODO(open-question: are exported bundles git-tracked for audit, or write-only and pruned after delivery?)

## 런북에 대한 함의
- **RB (bootstrap):** 위 트리를 스캐폴딩한다; `pyproject.toml` entry-point group; cache/lock/artifacts용 `.gitignore`.
- **RB (포트):** `ports/*.py` Protocol + `core/model` value object 생성; `tests/fakes/`의 fake.
- **RB (registry/config):** `core/registry.py` + `caw05.config.toml` 로더 + preflight (no-active-stub 체크).
- **RB (store):** `data/` 레이아웃 + SQLite index 빌더 + 파일로부터 재구축 명령 생성.
- **RB (adapters/renderers/scheduler):** v1 어댑터당 파일 하나 + 모든 §9 스텁을 스텁 관례로.

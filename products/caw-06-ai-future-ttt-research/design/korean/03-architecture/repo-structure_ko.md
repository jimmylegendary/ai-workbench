# 저장소 구조 — CAW-06 레이아웃

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow_ko.md](./data-flow_ko.md), [./tech-stack_ko.md](./tech-stack_ko.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (store 레이아웃 — 권위 있음)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (core + 서피스)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (SourceAdapter), [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (runner)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (wbtraffic.v0), [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (ExportAdapter)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-06 구현을 위한 **소스 + 데이터 디렉터리 레이아웃**을 정의한다: `store/` 파일 기반 데이터 트리(ADR-0007),
파이프라인 `core/`, `ports/` 인터페이스, `adapters/{sources,runners,exports}` 구현, 그리고 `schemas/`
(`wbtraffic.v0` 포함). 이 문서는 *코드와 데이터가 어디에 살며 왜 그런지*를 설명한다; 레코드 스키마(ADR가 소유)를
재정의하거나 라이브러리 버전(see [tech-stack_ko.md](./tech-stack_ko.md))을 고르지 *않는다*. 여기의 `store/`
레이아웃은 **ADR-0007의 결정을 정교화**한다 — 충돌 시 ADR-0007이 우선한다.

brief의 두 구조적 규칙: **문서화된 스텁을 갖춘 ports & adapters**(모든 외부 의존성은 포트 뒤의 교체 가능한
어댑터)와 **독립성 / 공유 store 없음**(`store/` 트리는 CAW-06의 OWN; 유일한 outbound 경로는
`adapters/exports/`)이다.

## 디렉터리 트리

```
caw-06-ai-future-ttt-research/                 # repo root (impl lives alongside design/)
├── pyproject.toml                             # deps + lockfile (versions: tech-stack.md TODOs)
├── README.md
├── config/
│   ├── sources.yaml                           # family → adapter + query + schedule (ADR-0005/0007)
│   ├── exports.yaml                            # ExportAdapter registry: targets + transport (ADR-0008)
│   └── runner.yaml                             # toy-runner defaults + repro-gate policy (ADR-0003)
│
├── src/caw06/
│   ├── core/                                  # the ONE pipeline core (ADR-0001); no infra logic
│   │   ├── pipeline.py                        # Run orchestration: S1..S5 → H → E/R → M → W → X
│   │   ├── ingestion.py                       # S1 discover · S2 import · S3 dedup · S4 extract · S5 persist
│   │   ├── hypotheses.py                      # H: generate @ status=hypothesis (no auto-promote, ADR-0002)
│   │   ├── experiments.py                     # E: pre-register rule + launch via runner port (ADR-0003)
│   │   ├── ledger.py                          # R: one run = one append-only entry; 4-value verdict
│   │   ├── implications.py                    # M: ImplicationMap; summary marked generated (ADR-0006)
│   │   ├── writeback.py                       # W: analytic L0 estimator → wbtraffic.v0 (ADR-0004)
│   │   ├── export.py                          # X: drive ExportAdapter; gate before write (ADR-0008)
│   │   ├── store.py                           # file store reader/writer + "current" resolver (ADR-0007)
│   │   ├── index.py                           # optional derived index (rebuildable; files canonical)
│   │   ├── resolver.py                        # latest-state views over append-only records
│   │   └── review_queue.py                    # human gate: status promotions + supported exports (ADR-0007)
│   │
│   ├── ports/                                 # interfaces only (ports & adapters)
│   │   ├── source_adapter.py                  # SourceAdapter: discover/import + FetchCursor (ADR-0005)
│   │   ├── runner_adapter.py                  # ExperimentRunnerAdapter: launch → ledger entry (ADR-0003)
│   │   └── export_adapter.py                  # ExportAdapter: validate()/emit()/health() (ADR-0008)
│   │
│   ├── adapters/
│   │   ├── sources/                           # SourceAdapter implementations
│   │   │   ├── arxiv.py                        #   v1 — arXiv (OAI-PMH/Atom; resumptionToken cursor)
│   │   │   ├── semantic_scholar.py             #   v1 — S2 Graph API (page cursor)
│   │   │   ├── caw05_signal.py                 #   v1 — import CAW-05 file drop (SEPARATE product)
│   │   │   └── _stubs.py                       #   documented stubs: other sources (brief §9)
│   │   ├── runners/                           # ExperimentRunnerAdapter implementations
│   │   │   ├── pytorch_toy.py                  #   v1 — tiny-model toy runner + repro gate
│   │   │   └── _stubs.py                       #   stubs: external compute / HW runners
│   │   └── exports/                           # ExportAdapter implementations (ONLY outbound seam)
│   │       ├── caw01_writeback.py             #   v1 — Caw01WritebackAdapter (wbtraffic.v0 + open Qs)
│   │       ├── caw02_claim.py                 #   v1 — Caw02ClaimAdapter (claim + evidence)
│   │       └── _stubs.py                       #   stubs: Caw03NoveltyAdapter, HttpExportAdapter
│   │
│   ├── schemas/                               # record + bundle schemas (JSON Schema / pydantic)
│   │   ├── source.py        claim.py        hypothesis.py
│   │   ├── ledger_entry.py  implication_map.py
│   │   ├── wbtraffic_v0.py                    # wbtraffic.v0 (numerics default null; modeled vs measured)
│   │   └── export_bundle.py                   # self-describing: schema_version+producer+content_hash
│   │
│   ├── surfaces/                              # THREE thin surfaces over the one core (ADR-0001)
│   │   ├── cli.py                             #   run / inspect
│   │   ├── mcp_server.py                      #   MCP run / inspect tools
│   │   └── scheduler.py                       #   cron-like + event triggers (ADR-0007)
│   │
│   └── lib/                                   # cross-cutting: logging, retry, hashing, provenance
│
├── store/                                     # CAW-06's OWN data (ADR-0007) — git-tracked, append-only
│   ├── sources/        SRC-XXXX.{md,json}     # canonical sources + provenance (S3/S5)
│   ├── claims/         CLM-XXXX.{md,json}     # extracted claims (status-bearing) (S4)
│   ├── hypotheses/     HYP-XXXX.{md,json}     # hypothesis cards + status_log (ADR-0002)
│   ├── ledger/         EXP-XXXX/entry.{md,json}   # one append-only entry per run (ADR-0003)
│   ├── implications/   IMP-XXXX.{md,json}     # one ImplicationMap per finding (ADR-0006)
│   ├── writeback/      WBT-XXXX.{md,json}     # wbtraffic.v0 artifacts (ADR-0004)
│   ├── threads/        THR-XXXX.{md,json}     # thread index: source→claim→hyp→exp→impl refs
│   ├── exports/        EXR-XXXX.json          # export receipts (incl. failed/rejected) (ADR-0008)
│   ├── cursors/        <adapter>.json         # persisted FetchCursor watermarks (ADR-0005/0007)
│   └── index/          (rebuildable)          # optional derived index — disposable, files canonical
│
├── artifacts/                                 # large experiment artifacts BY PATH (never inlined)
│   └── EXP-XXXX/       config/ metrics/ logs/ plots/ checkpoints/
│
├── exports_outbox/                            # v1 file-drop staging for outbound bundles (one-way push)
│   ├── caw-01/                                # writeback bundles → CAW-01 (separate product's drop loc)
│   └── caw-02/                                # claim bundles → CAW-02 (separate product's drop loc)
│
├── imports_inbox/
│   └── caw-05/                                # incoming CAW-05 signal file drops (S2)
│
├── design/                                    # the design docs (this tree)
└── tests/
    ├── unit/                                  # core stages, schemas, estimator (deterministic)
    ├── adapters/                              # one test per adapter; stubs assert "not built"
    └── fixtures/                              # sample sources / a tiny toy-experiment config
```

## 레이아웃 근거

| 영역 | 규칙 | 출처 |
|---|---|---|
| `store/`는 CAW-06의 OWN | 다른 어떤 제품과도 store/registry/runtime를 공유하지 않음 | brief §1/§8, ADR-0007 |
| append-only + supersede | 수정은 레코드/`StatusEvent`를 추가; 제자리 편집 안 함 | ADR-0007 |
| 큰 아티팩트는 경로로 | `artifacts/EXP-XXXX/`를 ledger에서 참조; 결코 인라인 안 함 | ADR-0007 |
| `core/`가 로직을 가짐; `surfaces/`는 얇음 | 세 개의 서피스, 하나의 core | ADR-0001 |
| `ports/` ⟂ `adapters/` | 모든 외부 의존성은 포트 + 문서화된 스텁 뒤에 | brief §9 |
| `adapters/exports/`가 유일한 outbound 이음새 | 하나의 `ExportAdapter`; write 전 gate; 단방향 push | ADR-0008 |
| `imports_inbox/` / `exports_outbox/`는 file 경계 | CAW-05/01/02는 별개 제품 — 공유 store가 아닌 file drop | brief §8, ADR-0005/0008 |
| `index/`는 폐기 가능 | 파일에서 재구축 가능; 삭제해도 잃는 것 없음 | ADR-0007 |
| `schemas/wbtraffic_v0`는 null + modeled/measured 유지 | 수치 기본값 `null`; modeled를 구별되게 플래그 | ADR-0004 |

## ID 규약
`SRC-` source · `CLM-` claim · `HYP-` hypothesis · `EXP-` experiment/ledger · `IMP-` implication map ·
`WBT-` writeback artifact · `THR-` thread · `EXR-` export receipt. ID는 안정적이며 결코 재사용되지 않는다;
대체된 레코드는 자신의 ID를 유지하고 `lineage.supersedes`를 획득한다.

## 경계(나타나면 안 되는 것)
- 다른 제품의 store에 쓰는 코드 경로 **없음** — outbound는 오직 `exports_outbox/`(file drop)뿐이다.
- 공유 스키마 레지스트리 import **없음** — 번들 버저닝은 자기 기술적(`schema_version` in-band, ADR-0008)이다.
- `store/writeback/`에 커밋된 지어낸 숫자 **없음** — 누락된 값은 `null` + `TODO(open-question)`이다.

## 미해결 질문
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조. 레이아웃 관련:
- `TODO(open-question: is impl co-located with design/ in one repo, or a sibling repo? — affects root paths above)`
- `TODO(open-question: agreed file-drop location/auth per receiving product for exports_outbox/? — ADR-0008)`
- `TODO(open-question: index backend folder shape — SQLite file vs JSON index dir? — ADR-0007)`
- `TODO(open-question: retention/GC policy for artifacts/EXP-XXXX large failure artifacts? — ADR-0007)`

## 런북에 대한 함의
- Phase-0은 어떤 스테이지가 빌드되기 전에 이 트리를 green으로 스캐폴딩한다(빈 `core/`/`ports/`/`schemas/` 스텁이 컴파일됨).
- 각 어댑터 런북은 `adapters/<kind>/` 아래에 정확히 하나의 파일을 추가하고 관련 `config/*.yaml`에 등록한다.
- store 런북은 첫 레코드가 쓰이기 전에 `store/*` typed 디렉터리 + resolver를 생성한다.

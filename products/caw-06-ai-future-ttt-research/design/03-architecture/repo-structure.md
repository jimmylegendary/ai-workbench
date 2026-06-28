# Repo Structure — CAW-06 layout

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md), [./tech-stack.md](./tech-stack.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (store layout — authoritative)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (core + surfaces)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (SourceAdapter), [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (runner)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (wbtraffic.v0), [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (ExportAdapter)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Defines the **source + data directory layout** for the CAW-06 implementation: the `store/` file-based data tree
(ADR-0007), the pipeline `core/`, the `ports/` interfaces, the `adapters/{sources,runners,exports}`
implementations, and the `schemas/` (including `wbtraffic.v0`). It describes *where code and data live and why*;
it does NOT redefine record schemas (owned by the ADRs) or pick library versions (see
[tech-stack.md](./tech-stack.md)). The `store/` layout here **elaborates ADR-0007's decision** — ADR-0007 wins on
any conflict.

Two structural rules from the brief: **ports & adapters with documented stubs** (every external dependency is a
swappable adapter behind a port), and **independence / no shared store** (the `store/` tree is CAW-06's OWN; the
only outbound path is `adapters/exports/`).

## Directory tree

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

## Layout rationale

| Area | Rule | Source |
|---|---|---|
| `store/` is CAW-06's OWN | no shared store/registry/runtime with any other product | brief §1/§8, ADR-0007 |
| append-only + supersede | corrections add records/`StatusEvent`; never edit in place | ADR-0007 |
| large artifacts by path | `artifacts/EXP-XXXX/` referenced from ledger, never inlined | ADR-0007 |
| `core/` holds logic; `surfaces/` are thin | three surfaces, one core | ADR-0001 |
| `ports/` ⟂ `adapters/` | every external dep behind a port + documented stub | brief §9 |
| `adapters/exports/` is the only outbound seam | one `ExportAdapter`; gate before write; one-way push | ADR-0008 |
| `imports_inbox/` / `exports_outbox/` are file boundaries | CAW-05/01/02 are separate products — file drop, not shared store | brief §8, ADR-0005/0008 |
| `index/` is disposable | rebuildable from files; deleting it loses nothing | ADR-0007 |
| `schemas/wbtraffic_v0` keeps null + modeled/measured | numerics default `null`; modeled flagged distinctly | ADR-0004 |

## ID conventions
`SRC-` source · `CLM-` claim · `HYP-` hypothesis · `EXP-` experiment/ledger · `IMP-` implication map ·
`WBT-` writeback artifact · `THR-` thread · `EXR-` export receipt. IDs are stable and never reused; superseded
records keep their ID and gain `lineage.supersedes`.

## Boundaries (what must NOT appear)
- **No** code path that writes into another product's store — outbound is `exports_outbox/` (file drop) only.
- **No** shared schema registry import — bundle versioning is self-describing (`schema_version` in-band, ADR-0008).
- **No** invented numbers committed to `store/writeback/` — a missing value is `null` + a `TODO(open-question)`.

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md). Layout-relevant:
- `TODO(open-question: is impl co-located with design/ in one repo, or a sibling repo? — affects root paths above)`
- `TODO(open-question: agreed file-drop location/auth per receiving product for exports_outbox/? — ADR-0008)`
- `TODO(open-question: index backend folder shape — SQLite file vs JSON index dir? — ADR-0007)`
- `TODO(open-question: retention/GC policy for artifacts/EXP-XXXX large failure artifacts? — ADR-0007)`

## Implications for runbooks
- Phase-0 scaffolds this tree green (empty `core/`/`ports/`/`schemas/` stubs compiling) before any stage is built.
- Each adapter runbook adds exactly one file under `adapters/<kind>/` and registers it in the relevant `config/*.yaml`.
- The store runbook creates `store/*` typed dirs + the resolver before the first record is written.

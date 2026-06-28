# Repo Structure — directory layout, ports/adapters seams, and the files-as-truth store

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md), [./tech-stack.md](./tech-stack.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (core + 3 surfaces + 5 renderers)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (SourceAdapter + registry)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (files-as-truth layout)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (ExportAdapter seam)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md) (ports, registry, stub pattern)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **on-disk layout** of CAW-05: the code packages (core, ports, adapters, renderers, scheduler,
surfaces) and the **data tree** (`interests.yaml`, `findings/`, `ledger/*.jsonl`, `state/`, `runs/`, `exports/`).
It makes the ports-and-adapters seams visible as directories so a new source/export/scheduler is "one adapter
file + one config block" ([ports research §8](../02-research/scheduling-and-ports.md)). It does NOT re-decide the
pipeline (see [data-flow.md](./data-flow.md)) or tool versions (see [tech-stack.md](./tech-stack.md)). The data
tree is CAW-05's OWN store — no shared substrate (brief §1, §7); exports leave only via the `ExportAdapter` seam.

## 1. Top-level layout

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

## 2. Layering rule (dependency direction)

```
surfaces  ─►  core  ─►  ports (Protocols)  ◄─  adapters / renderers / scheduler
                                                       (register into core.registry)
```

| Layer | May import | May NOT import |
|---|---|---|
| `surfaces/` | `core` | adapter concretes directly |
| `core/` | `ports`, `model`, `registry` | any concrete adapter (only via registry) |
| `ports/` | stdlib + model | core, adapters |
| `adapters/`, `renderers/`, `scheduler/` | `ports`, `model` | `core.pipeline` internals |

The core depends on **interfaces only**; concretes register via decorator or entry-point ([ports §5](../02-research/scheduling-and-ports.md)).
This is what makes the seam test hold: a new integration adds one file under `adapters/…` + one block in
`caw05.config.toml`, touching nothing in `core/`.

## 3. What is truth vs cache vs gitignored

| Path | Kind | Notes |
|---|---|---|
| `config/*.yaml`, `caw05.config.toml` | truth (git-tracked) | versioned interest/source/routing config — ADR-0002 |
| `data/findings/*.json`, `data/ledger/*.jsonl` | truth (git-trackable) | human-diffable, auditable — ADR-0006 |
| `data/state/*`, `data/runs/*`, `data/out/*`, `data/exports/*` | truth/output | state + receipts + rendered + bundles |
| `data/artifacts/<sha>/` | truth-by-path | large blobs referenced from provenance, never inlined |
| `data/index.sqlite` | **cache (gitignored)** | rebuildable from files; delete + replay reproduces it |
| `data/run.lock` | runtime (gitignored) | single-flight flock |

Contract (ADR-0006): deleting `index.sqlite` and replaying `findings/` + `ledger/` reproduces FTS5, the `seen`
set, and the ledger projection. `.gitignore` excludes `index.sqlite`, `run.lock`, and `artifacts/` payloads.

## 4. The stub convention on disk
Every brief-§9 future adapter exists as a **registered, config-disabled file** with `maturity="stub"` (e.g.
`adapters/sources/reddit.py`, `scheduler/systemd_timer.py`). It appears in `registry.list()` / CLI / MCP but
preflight refuses it if made `active`, pointing at the file to implement ([ports §7](../02-research/scheduling-and-ports.md)).
Wiring it later = filling that one file's method bodies + flipping `enabled = true` in `caw05.config.toml`.

## 5. Naming conventions
- Packages/modules: `snake_case`; adapter id in config is `kebab-case` (`arxiv-s2`, `caw02-source-claim`).
- Findings keyed by `canonical_id`-derived `finding_id`; ledger files bucketed by ISO week `<yyyy-ww>.jsonl`.
- Run artifacts namespaced by `run_id`; export bundles namespaced by target dir.
- Use entity names from the PRODUCT-BRIEF / GLOSSARY exactly (WatchedTarget, Finding/Signal, LedgerLink, RadarSignal).

## Open Questions
Track in `../08-research-plan/open-questions.md`:
- TODO(open-question: should `config/` live beside code or under `data/` for per-deployment overrides?)
- TODO(open-question: ledger/run-JSONL compaction + retention — affects `ledger/` and `runs/` growth (ADR-0006).)
- TODO(open-question: do findings shard into subdirs (by week/source) before a flat `findings/` gets too large?)
- TODO(open-question: are exported bundles git-tracked for audit, or write-only and pruned after delivery?)

## Implications for runbooks
- **RB (bootstrap):** scaffold the tree above; `pyproject.toml` entry-point groups; `.gitignore` for cache/lock/artifacts.
- **RB (ports):** create `ports/*.py` Protocols + `core/model` value objects; fakes in `tests/fakes/`.
- **RB (registry/config):** `core/registry.py` + `caw05.config.toml` loader + preflight (no-active-stub check).
- **RB (store):** create `data/` layout + SQLite index builder + rebuild-from-files command.
- **RB (adapters/renderers/scheduler):** one file per v1 adapter + every §9 stub via the stub convention.

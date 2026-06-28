# Radar Core — Overview

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [interest-model.md](interest-model.md) — the typed interest artifact + explainable relevance
  - [source-ingestion-and-dedup.md](source-ingestion-and-dedup.md) — SourceAdapter contract + cursors + dedup
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) — the Run + three surfaces + five formats
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) — files-as-truth + Run lifecycle
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) — the only export seam
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes **what the radar core is** — the single pipeline (a `Run`) that turns public sources into
triaged, synthesized, exported findings — and gives the **folder map** of its stages and the ports between them.
It is the entry point for the two sibling deep-dives ([interest-model.md](interest-model.md),
[source-ingestion-and-dedup.md](source-ingestion-and-dedup.md)). It does NOT re-decide any ADR: surfaces/formats
(ADR-0001), the interest model (ADR-0002), ingestion (ADR-0003), the classify rubric (ADR-0004), the ledger
(ADR-0005), storage/scheduling (ADR-0006), or export (ADR-0007) are fixed there. This is the *core's* shape — the
code the three thin surfaces drive — emphasizing the four invariants the core, not any surface, enforces.

## What "the core" is
CAW-05 is an **independent early-warning radar**: it ingests public sources, scores them against a curated
interest model, classifies and routes each finding, synthesizes readable outputs, and exports signals across
explicit product boundaries. There is **no shared runtime substrate** with the other CAW products (brief §1).

The core is **one pipeline behind three thin surfaces** (ADR-0001): a cron-**scheduled** automation pipeline, a
**CLI** (humans/CI), and an **MCP** server (agents). All three drive the *same* vetted op-set; none carries its
own collection or governance logic. The unit of work is the **Run**.

### The four core invariants (never live in a surface)
These are the load-bearing guarantees; a surface may *request* an action, only the core performs it.

| Invariant | What it means | Where fixed |
|---|---|---|
| **High recall on the watch list** | Any `recall_priority: high` watch-list hit is *surfaced, never silently dropped*; score governs order, not survival | ADR-0002 §3, [interest-model.md](interest-model.md) |
| **Provenance-complete** | Every finding keeps origin URL + `retrieved_at` + native id + `boundary=public` + `trust`; no record without it | ADR-0003, [source-ingestion-and-dedup.md](source-ingestion-and-dedup.md) |
| **Legal/ToS-safe sources only** | Official APIs + publisher feeds; metadata-only-link where only HTML exists; ToS-unsafe adapter refused at preflight | brief §5/§12, ADR-0003 |
| **Generated summary ≠ evidence** | Synthesis/classification rationale is annotation over the immutable finding; marked `evidence:false`; never the source of truth | brief §12, ADR-0001 §5, ADR-0004 |

## The Run pipeline (stages)
A Run is an idempotent, resumable invocation `caw05 run --window weekly`, a pipeline of checkpointed stages
(ADR-0001 §1, ADR-0006 §2). A crash re-enters at the last completed stage; re-running a `done` Run is a no-op.

```
scheduled → acquiring-lock → collect → dedup → score → classify → route → synthesize → export → done
```

> Note: ADR-0006 names the lifecycle `collect → dedup → classify → synthesize → export`. **score** (ADR-0002)
> and **route** (ADR-0004) are explicit sub-stages of that same spine, broken out here for the core map; they are
> not new top-level stages and do not change the receipt contract.

| Stage | Does | Owns invariant | Port | Detail |
|---|---|---|---|---|
| **collect** | Pull new/updated items per source since the cursor | legal/ToS-safe; provenance | `SourceAdapter` | [source-ingestion-and-dedup.md](source-ingestion-and-dedup.md) |
| **dedup** | Collapse the same item across sources/runs to one finding, many provenance entries | recall-safe (no false-merge) | core (not per-adapter) | [source-ingestion-and-dedup.md](source-ingestion-and-dedup.md) |
| **score** | Additive explainable relevance vs `interests.json`; emit `relevance_explain[]` | high recall (surface-not-drop) | scorer (FTS5) | [interest-model.md](interest-model.md) |
| **classify** | Two-axis taxonomy via LF→LLM→human cascade; abstain→human | recall-biased selective review | `Classifier` | ADR-0004 |
| **route** | Deterministic config-driven route to knowledge/task/experiment/open-question/discard | review gate before terminal route | `Router` | ADR-0004 |
| **synthesize** | Render memo/digest/slide/paper-card/action-brief over the triaged `Finding` | generated ≠ evidence banner | `FormatRenderer` | ADR-0001 §5 |
| **export** | Bundle signals to CAW-02/03/01/06 over the only export seam; idempotent | no shared store; idempotency key | `ExportAdapter` | ADR-0007 |

The Run wrapper adds, on **any** scheduler (ADR-0006 §3): a **single-flight lock**, **catch-up via watermark**
(a missed week self-heals on the next, wider window), a **run-receipt heartbeat** (a missing receipt past
`cadence + grace` is an *alert*, not a silent no-op), and `--since` **backfill** for watch-list seeding.

## Folder map (the core)
Illustrative module layout under CAW-05's own tree. Files are truth; SQLite is a rebuildable index/cache
(ADR-0006). This is build guidance, not final code — the builder writes the real modules.

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

## Data spine (one Finding, many views)
A `RawFinding` (adapter output) is deduped into a **Finding** that accretes a relevance annotation (score +
explanation), a classification + route, and provenance from every source it was seen on. Synthesis renders that
one Finding into several formats; export bundles it across a boundary. One source of truth, one provenance
manifest. Generated prose attached to a Finding is always marked `evidence:false`.

```
RawFinding (per source)  ──dedup──▶  Finding  ──score──▶  +relevance_explain[]
                                       │ classify+route ──▶ +classification +route
                                       │ synthesize ──▶ memo | digest | slide | paper-card | action-brief
                                       └ export ──▶ CAW-02 (Source/Claim/RelatedWork) | CAW-03 (RadarSignal)
                                                    | CAW-01/06 (open questions)
```

## Cross-links
- **Inputs to the core:** [source-ingestion-and-dedup.md](source-ingestion-and-dedup.md) (collect + dedup).
- **The load-bearing core:** [interest-model.md](interest-model.md) (score + recall floor).
- **Downstream of the core:** classify/route (ADR-0004), synthesis (ADR-0001 §5), export (ADR-0007) — not
  duplicated here.

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects the
  `status` contract — owned with ADR-0001/ADR-0006.)
- TODO(open-question: heartbeat/dead-man's-switch sink given "no shared substrate" — local check vs external?)
- TODO(open-question: file↔index consistency check — periodic verify vs trust rebuild-on-mismatch?)

## Implications for runbooks
- **RB (Run wrapper):** lifecycle, single-flight lock, stage checkpoints/resume, run-receipt heartbeat,
  `--since` backfill; green with fakes before real adapters land.
- **RB (pipeline):** wire the stage order collect→dedup→score→classify→route→synthesize→export over `ports.py`.
- **RB (store):** files-as-truth layout + SQLite index builder + rebuild-from-files; large artifacts by path.
- Stage-specific runbooks are owned by the sibling docs/ADRs — this overview only fixes the spine and the map.

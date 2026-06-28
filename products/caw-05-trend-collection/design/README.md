# CAW-05 Design Set — Index

Complete design + build specification for **CAW-05, the Periodic Trend Collection & Synthesis radar** — an
independent product. Design docs say *what/why*; runbooks say *how to build it*. **No product code is written by
the design authors.**

> Read first: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF.md) and [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS.md).

## Navigate

| # | Folder | What it holds |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY.md) | the truth + the rules |
| `00` | [overview](./00-overview/) | vision, scope & non-goals, personas & use cases |
| `01` | [decisions](./01-decisions/) | 7 ADRs (surface+outputs, interest model, source adapters, classification/triage, ledger, storage+scheduling, export boundaries) |
| `02` | [research](./02-research/) | grounding research |
| `03` | [architecture](./03-architecture/) | system architecture, component boundaries, data flow, tech stack, repo structure |
| `04` | [data-layer](./04-data-layer/) | data model, storage & scheduling, provenance & boundaries |
| `05` | [radar-core](./05-radar-core/) | the heart: interest model, source ingestion & dedup, classification & triage, related-work ledger, synthesis & formats, export boundaries, ports & adapters |
| `06` | [interfaces](./06-interfaces/) | CLI & MCP, scheduled pipeline, digest outputs |
| `07` | [backend-api](./07-backend-api/) | core API, ingestion service, synthesis service, scheduler & persistence |
| `08` | [research-plan](./08-research-plan/) | research plan, validation/tests, [open questions](./08-research-plan/open-questions.md) |
| `09` | [roadmap](./09-roadmap/) | milestones/phases, dependency graph, risks |
| `10` | [runbooks](./10-runbooks/) | the executable build plan (phases 0–4) — start at [runbooks/README.md](./10-runbooks/README.md) |

## The product in one paragraph

A **high-recall early-warning radar** run as a scheduled pipeline. One core executes a **Run**
(ingest → dedup → relevance → classify → triage/route → ledger → synthesize → export). Interests are a typed,
tiered artifact driving a **BM25-first, explainable, recall-first** relevance score. Each finding is classified on
**two axes** (novelty-threat/support/adjacent/noise × signal/hype) by an **LF→LLM→human cascade** with a
recall-biased selective-review gate, then routed deterministically. An append-only **related-work ledger**
(Semantic-Scholar-verified) records what each finding threatens or supports. Findings synthesize into five
markdown formats, and an **ExportAdapter** (the only export seam) ships signed bundles to CAW-02 (knowledge),
CAW-03 (novelty), and CAW-01/CAW-06 (open questions). Storage is **files-as-truth + a SQLite cache**; sources and
exports are adapters with documented stubs. Generated summaries/rationale are never evidence.

## Build path

Follow [`10-runbooks/`](./10-runbooks/) phases 0→4. **Milestone 1** = the narrow weekly radar end-to-end
(fetch watch-list sources → relevance → classify → digest), with one novelty-threat exported to CAW-03.

## Status

All documents are **draft**; tracked [open-questions](./08-research-plan/open-questions.md).

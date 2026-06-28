# Company AI Workbench — Monorepo of 6 Independent Products

This repository hosts **six independent products** (`CAW-01`…`CAW-06`) under [`products/`](./products/).

Each product is **separately designed, implemented, and deployed**. There is **no shared runtime substrate** —
products do not share a database, UI, or service layer. Any cross-product use is an explicit **import/export
boundary** (one product publishes an artifact another consumes), never a shared platform. Future integrations
(internal wiki, experiment-server, etc.) are designed as **ports & adapters with documented stubs**, so wiring a
real connector later means filling in one adapter, not changing a core.

> **Status:** all six products are **designed** (English design set + Korean mirror). Implementation is performed
> by an AI builder following each product's `design/10-runbooks/`. No product code is in this repo yet — it holds
> the design + build instructions.

## The six products at a glance

| # | Product | What it is | Core mechanism / invariant | Key tech | Primary surfaces |
| --- | --- | --- | --- | --- | --- |
| **[CAW-01](./products/caw-01-simulation-control-plane/)** | Simulation Control Plane | Compose & run an AI workload × serving/representation × custom HW, normalize 3 evidence axes into one memory-annotated IR, compare as evidence | **L0/L1/L2 IR** + 3 coordinated canvases + git-like **work-tree**; real(OTel)/synthetic(syntorch→Chakra)/sim(LLMServingSim+ASTRA-sim) run **in parallel into one L0** | Next.js, React Flow, react-three-fiber, Python engine, SQLite→PG | Web app (nav + 1:9), MCP, CLI |
| **[CAW-02](./products/caw-02-knowledge-repository/)** | Knowledge Repository | Provenance-preserving store: source→claim→evidence→cited note | **Markdown(git) = source of truth**, SQLite = derived index; **evidence gate** (a note can never be evidence); claim→evidence in 3 layers | git + markdown, SQLite FTS5, MCP | API + MCP + CLI, read-only viewer |
| **[CAW-03](./products/caw-03-paper-patent-harness/)** | Paper & Patent Harness | Turn gated claims+evidence into papers **and** patents | **Wraps PaperOrchestra** (writing engine, not rebuilt) + governance: evidence gate, **patent-first interlock**, P1/P2/P3 ladder; hexagonal **5 ports** | TS core, PaperOrchestra (subprocess), LaTeX/PDF | CLI + MCP + review UI |
| **[CAW-04](./products/caw-04-tips-skills-web-api/)** | Tips/Skills Web + API | Public publishing of validated, public-safe tips/skills/workflows | **Public-safe by construction** (frozen static artifact); deny-by-default publish gate + core re-check; **semver+digest** immutable versions; audit fields never serialized | Astro 5 + Starlight (SSG), DTCG, MCP | Website + read-only REST API + manifest |
| **[CAW-05](./products/caw-05-trend-collection/)** | Trend Radar | Early-warning radar protecting novelty; collect→classify→synthesize | **BM25 recall-first** relevance; 2-axis classify (novelty-threat/support/adjacent/noise × signal/hype) via LF→LLM→human; related-work ledger; **export-only** | Python pipeline, SQLite, cron, Semantic Scholar | Scheduled pipeline + CLI + MCP; 5 md output formats |
| **[CAW-06](./products/caw-06-ai-future-ttt-research/)** | AI-Future / TTT Research | Scout TTT/future-AI → hypotheses → small experiments → implications | **No overclaim** (4-state hypothesis lifecycle + evidence cap); failures-useful ledger; **wbtraffic.v0** writeback-traffic schema bridged onto CAW-01's IR | Python ExperimentScout, PyTorch toy runner | Scheduled/triggered pipeline + CLI + MCP |

### Cross-product boundaries (import/export, not shared store)

```
CAW-05 radar ──signals──▶ CAW-02 (knowledge), CAW-03 (novelty), CAW-01 / CAW-06 (open questions)
CAW-01 runs  ──projections/evidence──▶ CAW-02
CAW-02 ──cited claim+evidence──▶ CAW-03 (drafting), CAW-04 (publishable content)
CAW-03 / a skills registry ──validated skills──▶ CAW-04 (publish)
CAW-06 ──wbtraffic.v0 schema + open questions──▶ CAW-01 (future workload axis)
```

## Each product's design set

Every `products/caw-0X-*/design/` follows the same structure (see the template in
[`products/_template/`](./products/_template/)):

```
design/
├─ _meta/        PRODUCT-BRIEF (single source of truth), DOC-CONVENTIONS, GLOSSARY
├─ 00-overview/  vision · scope & non-goals · personas & use cases
├─ 01-decisions/ ADRs (the opinionated "why")
├─ 02-research/  grounding research behind the ADRs
├─ 03-architecture/ · 04-data-layer/ · 05-<core>/ · 06-interfaces/ · 07-backend-api/
├─ 08-research-plan/ · 09-roadmap/
├─ 10-runbooks/  the executable, phased build plan for an AI builder
└─ korean/       a full Korean mirror (*_ko.md)
```

Start at any product's `design/README.md` (e.g. [CAW-01](./products/caw-01-simulation-control-plane/design/README.md)).

## Scale

| Product | Design docs (EN) | Korean (KO) | Runbooks |
| --- | --- | --- | --- |
| CAW-01 | 80 | 80 | 25 |
| CAW-02 | 70 | 70 | 21 |
| CAW-03 | 70 | 70 | 20 |
| CAW-04 | 66 | 66 | 18 |
| CAW-05 | 65 | 65 | 16 |
| CAW-06 | 65 | 65 | 15 |
| **Total** | **416** | **416** | **115** |

## Program-level files

- [`architecture.md`](./architecture.md) — program-level context (layer model, memory-annotated IR, trust ladder). Per-product architecture lives in each product's `design/`.
- [`TODO.md`](./TODO.md) — top-level tracking across the six independent products.
- [`products/README.md`](./products/README.md) — the products index.
- [`products/_template/`](./products/_template/) — the reusable independent-product design template (used to produce CAW-02…06).

## Guardrails (all products)

No confidential company data in public-facing outputs; never conflate public-source research with internal
Samsung/SAIT claims; keep sources/claims/evidence/generated-conclusions separate (generated summaries are not
evidence); Jimmy is the reviewer for strategic decisions.

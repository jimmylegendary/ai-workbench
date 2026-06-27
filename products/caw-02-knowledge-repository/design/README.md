# CAW-02 Design Set — Index

Complete design + build specification for **CAW-02, the Team/Personal Knowledge Repository** — an independent,
standalone product. Design docs say *what* and *why*; runbooks say *how to build it*. **No product code is
written by the design authors.**

> Read first: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF.md) (single source of truth) and
> [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS.md).

## Navigate

| # | Folder | What it holds |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY.md) | the truth + the rules |
| `00` | [overview](./00-overview/) | [vision](./00-overview/vision.md), [scope & non-goals](./00-overview/scope-and-non-goals.md), [personas & use cases](./00-overview/personas-and-use-cases.md) |
| `01` | [decisions](./01-decisions/) | 7 ADRs (surface+skill, storage, data model, provenance/trust, ingestion, retrieval, import/export) |
| `02` | [research](./02-research/) | grounding research behind the ADRs |
| `03` | [architecture](./03-architecture/) | system architecture, component boundaries, data flow, tech stack, repo structure |
| `04` | [data-layer](./04-data-layer/) | data model, storage strategy, provenance & boundaries, versioning & events |
| `05` | [knowledge-core](./05-knowledge-core/) | the heart: entity/edge model, claim↔evidence gate, ingestion, retrieval, skill-wrap, import/export flows |
| `06` | [interfaces](./06-interfaces/) | API + MCP, CLI, read-only viewer |
| `07` | [backend-api](./07-backend-api/) | core API contract, ingestion service, retrieval service, persistence + index |
| `08` | [research-plan](./08-research-plan/) | research plan, validation/tests, [open questions](./08-research-plan/open-questions.md) |
| `09` | [roadmap](./09-roadmap/) | milestones/phases, dependency graph, risks |
| `10` | [runbooks](./10-runbooks/) | the executable build plan (phases 0–5) — start at [runbooks/README.md](./10-runbooks/README.md) |

## The product in one paragraph

A provenance-preserving knowledge store whose **source of truth is markdown files in git** (entities =
frontmatter + body under `knowledge/`), with a **derived, disposable SQLite index** for retrieval. One
**transactional product core** enforces the **evidence gate** (a note can never be evidence), the
**Claim→Evidence invariant** (3 lockstep layers), a two-axis **boundary**(public/internal/confidential) ×
**visibility**(team/private) with monotone propagation, a derived **trust ladder** (T0–T3, AI capped at T2), and
an append-only audit. **API/MCP/CLI** are thin adapters codegen'd from one op manifest. Retrieval is **FTS5 +
structured filters** with citation-constrained RAG (no embeddings in v0). Cross-product use is strictly
**import/export** (CAW-01 projections, CAW-05 signals in; cited bundles out to CAW-03) — never a shared store.

## Build path

Follow [`10-runbooks/`](./10-runbooks/) phases 0→5. **Milestone 1** = the first provenance-preserving knowledge
transaction (`add-source → extract-claim → attach-evidence → synthesize-cited-note`) plus retrieval, on md-git +
SQLite index, via the skill interface.

## Status

All documents are **draft**, authored from the PRODUCT-BRIEF + research; they carry `TODO(open-question)` markers
and a tracked [open-questions](./08-research-plan/open-questions.md) list.

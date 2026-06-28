# CAW-03 Design Set — Index

Complete design + build specification for **CAW-03, the Paper & Patent Writing Harness** — an independent product
that **wraps PaperOrchestra** and adds governance. Design docs say *what/why*; runbooks say *how to build it*.
**No product code (and no PaperOrchestra rebuild) is written by the design authors.**

> Read first: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF.md) (single source of truth) and
> [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS.md).

## Navigate

| # | Folder | What it holds |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY.md) | the truth + the rules |
| `00` | [overview](./00-overview/) | [vision](./00-overview/vision.md), [scope & non-goals](./00-overview/scope-and-non-goals.md), [personas & use cases](./00-overview/personas-and-use-cases.md) |
| `01` | [decisions](./01-decisions/) | 8 ADRs (surface, writing-engine wrap, evidence gate, patents, ports&adapters, ladder/novelty, confidentiality, lifecycle) |
| `02` | [research](./02-research/) | grounding research behind the ADRs |
| `03` | [architecture](./03-architecture/) | system architecture, component boundaries, data flow, tech stack, repo structure |
| `04` | [data-layer](./04-data-layer/) | data model, storage strategy, confidentiality & provenance |
| `05` | [harness-core](./05-harness-core/) | the heart: evidence gate, input assembly, PaperOrchestra adapter, patent module, **ports & adapters**, ladder/novelty, artifact lifecycle |
| `06` | [interfaces](./06-interfaces/) | API+MCP, CLI, minimal review/status UI |
| `07` | [backend-api](./07-backend-api/) | core API contract, orchestration, adapter registry+config, persistence |
| `08` | [research-plan](./08-research-plan/) | research plan, validation/tests, [open questions](./08-research-plan/open-questions.md) |
| `09` | [roadmap](./09-roadmap/) | milestones/phases, dependency graph, risks |
| `10` | [runbooks](./10-runbooks/) | the executable build plan (phases 0–4) — start at [runbooks/README.md](./10-runbooks/README.md) |

## The product in one paragraph

A governance **harness** over **PaperOrchestra** (the v1 `WritingEngineAdapter`, run as a subprocess). One harness
core owns a finite **op-manifest** of governed operations and enforces, in the core (never in adapters): the
**evidence gate** (generated text is never evidence; P1/P2/P3 thresholds; fail-closed), the **patent-first
interlock**, and **confidentiality** (inherited from CAW-02, fail-closed export). Inputs are imported from CAW-02
(claim+evidence bundles) and CAW-01 (results), assembled into an **engine-neutral input bundle**. Patents use a
separate `PatentEngine`. Everything external is an **adapter** behind one of **five ports**, selected by config,
with **documented stubs** for future connectors (internal wiki, experiment-server, venue submission, patent filing).

## Build path

Follow [`10-runbooks/`](./10-runbooks/) phases 0→4. **Milestone 1** = one evidence-gated paper produced via
PaperOrchestra from an imported CAW-02 bundle + CAW-01 results (gate → assemble → draft → review → PDF), with
provenance and confidentiality.

## Status

All documents are **draft**; they carry `TODO(open-question)` markers and a tracked
[open-questions](./08-research-plan/open-questions.md) list.

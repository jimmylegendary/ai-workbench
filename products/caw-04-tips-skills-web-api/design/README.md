# CAW-04 Design Set — Index

Complete design + build specification for **CAW-04, the AI Tips/Skills Website & REST API** — an independent
public publishing product. Design docs say *what/why*; runbooks say *how to build it*. **No product code is
written by the design authors.**

> Read first: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF.md) and [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS.md).

## Navigate

| # | Folder | What it holds |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY.md) | the truth + the rules |
| `00` | [overview](./00-overview/) | vision, scope & non-goals, personas & use cases |
| `01` | [decisions](./01-decisions/) | 7 ADRs (surface+delivery, content model, public-safe publish gate, import+ports, storage+versioning, web stack, API design) |
| `02` | [research](./02-research/) | grounding research |
| `03` | [architecture](./03-architecture/) | system architecture, component boundaries, data flow, tech stack, repo structure |
| `04` | [data-layer](./04-data-layer/) | content model, storage & versioning, public-safe & provenance |
| `05` | [publishing-core](./05-publishing-core/) | the heart: publish gate, import & re-check, content entities, versioning, web/API rendering, ports & adapters |
| `06` | [interfaces](./06-interfaces/) | website, REST API, preview/admin |
| `07` | [backend-api](./07-backend-api/) | core API, build & publish service, import service, persistence |
| `08` | [research-plan](./08-research-plan/) | research plan, validation/tests, [open questions](./08-research-plan/open-questions.md) |
| `09` | [roadmap](./09-roadmap/) | milestones/phases, dependency graph, risks |
| `10` | [runbooks](./10-runbooks/) | the executable build plan (phases 0–4) — start at [runbooks/README.md](./10-runbooks/README.md) |

## The product in one paragraph

A **public-safe-by-construction** publishing layer. Content (Tip/Skill/Workflow/Playbook + Example/Source/
SafetyBoundary/Version) lives as **markdown/MDX in git** with **semver + content-digest** immutable versions.
One product core enforces a **deny-by-default publish gate** and a **core public-safe re-check** on every import
(upstream boundary = evidence only; audit-only provenance kept in a sidecar that **never serializes**). An **Astro
5 + Starlight SSG build** emits the website **and** a read-only REST API (static JSON + raw markdown + manifest +
MCP resources view) from one source. Inputs (CAW-02, CAW-03/skills registry) and outputs are **adapters** behind
two ports, with documented stubs for future connectors. The published artifact is frozen and static — no live path
to internal stores.

## Build path

Follow [`10-runbooks/`](./10-runbooks/) phases 0→4. **Milestone 1** = one validated Skill imported → public-safe
gate → published as a versioned web page + API resource, readable via web + API.

## Status

All documents are **draft**; tracked [open-questions](./08-research-plan/open-questions.md).

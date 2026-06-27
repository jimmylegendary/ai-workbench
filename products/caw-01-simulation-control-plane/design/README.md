# CAW-01 Design Set — Index

This folder is the complete design + build specification for **CAW-01, the Simulation Control Plane** — an
**independent, standalone product**. CAW-01 is one of a family of six separately built and deployed products
(CAW-01..06); they share **no runtime substrate**. It is meant to be handed to an **AI builder**: the design docs
say *what* and *why*; the runbooks say *how to build it*. **No product code is written by the design authors.**

> Read first: [`_meta/SOURCE-BRIEF.md`](./_meta/SOURCE-BRIEF.md) (the canonical product vision) and
> [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS.md) (how every doc + runbook is written).

## How to navigate

| # | Folder | What it holds |
| --- | --- | --- |
| `_meta` | Source brief, doc conventions, [glossary](./_meta/GLOSSARY.md) | the truth + the rules |
| `00` | [overview](./00-overview/) | [vision](./00-overview/vision.md), [scope & non-goals](./00-overview/scope-and-non-goals.md), [personas & use cases](./00-overview/personas-and-use-cases.md) |
| `01` | [decisions](./01-decisions/) | 7 ADRs (product surface, data layer, frontend, canvas, trace pipeline, design system, work-tree) |
| `02` | [research](./02-research/) | grounding research behind the ADRs |
| `03` | [architecture](./03-architecture/) | system architecture, component boundaries, data flow, tech stack, repo structure |
| `04` | [data-layer](./04-data-layer/) | data model, storage strategy, work-tree storage, run-evidence & provenance |
| `05` | [caw01-simulation-control-plane](./05-caw01-simulation-control-plane/) | the heart: L0 IR, serving/representation, trace pipeline, engine, the 3 canvases, control panel, work-tree UX |
| `06` | [frontend](./06-frontend/) | Next.js UI architecture, layout/nav, state, canvas rendering, open-design, components |
| `07` | [backend-api](./07-backend-api/) | core API contract, simulation runtime service, persistence, MCP/CLI adapters |
| `08` | [research-plan](./08-research-plan/) | research plan, validation/golden tests, [open questions](./08-research-plan/open-questions.md) |
| `09` | [roadmap](./09-roadmap/) | milestones/phases, dependency graph, risks |
| `10` | [runbooks](./10-runbooks/) | the executable build plan (phases 0–5) — start at [runbooks/README.md](./10-runbooks/README.md) |

## The product in one paragraph

A **Next.js web app** (plus CAW-01's own MCP + CLI automation surfaces over one `@caw/core` product core, so
external agents and tools can drive *this* product) whose **Simulation** screen splits
**1:9**: a left **control panel** (run/save/status) and a right **workspace** of three coordinated canvases —
**(1) AI workload flow** (an agent-turn as a graph), **(2) serving & representation** (choose vLLM/LLMServingSim ×
torch/syntorch × ASTRA-sim), **(3) hardware design** (chip→die→package→tray→rack→cluster, visualized like real
hardware, drillable + editable). All edits are versioned in a git-like **work-tree** (per-item & full save). Runs
normalize three evidence axes (real OTel / synthetic syntorch→Chakra / simulation LLMServingSim+ASTRA-sim) into
one **memory-annotated L0 IR** and produce a **comparable projection** preserved as evidence.

## Key decisions (see `01-decisions/`)

- **Surface:** one TS product core `@caw/core` + thin web/MCP/CLI surfaces (all belonging to CAW-01 alone).
- **Data:** Postgres-spine polyglot; start on SQLite (PG-portable); blobs on filesystem by path.
- **Frontend:** Next.js App Router, server shell + client islands, Zustand; Python engine out-of-process.
- **Canvas:** React Flow (C1/C2), react-three-fiber 3D (C3) with a Konva 2D fallback gated on a spike.
- **Trace:** syntorch capture → Chakra exporter → ASTRA-sim; Chakra→L0 lowering is the normalization waist; axes run in parallel into one L0.
- **Design:** "open design" = shadcn/ui + Radix + Tailwind v4 + DTCG tokens.
- **Work-tree:** git-like content-addressed object model + intent event log, in Postgres.

## Build path

Follow [`10-runbooks/`](./10-runbooks/) phases 0→5. **Milestone 1** (first comparable experiment, UC-1) is the
north-star acceptance and spans phases 0/1/3/4. Canvas-3 3D and MCP/CLI are deliberately off the Milestone-1
critical path.

## Status

All documents are **draft** and authored from the SOURCE-BRIEF + research; they contain `TODO(open-question)`
markers and a tracked [open-questions](./08-research-plan/open-questions.md) list. Jimmy is the reviewer for
strategic decisions; nothing here fabricates internal `syntorch` facts beyond the SOURCE-BRIEF.

# CAW-06 Design Set — Index

Complete design + build specification for **CAW-06, AI Future / TTT Research Automation** — an independent
product. Design docs say *what/why*; runbooks say *how to build it*. **No product code is written by the design
authors.**

> Read first: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF.md) and [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS.md).

## Navigate

| # | Folder | What it holds |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY.md) | the truth + the rules |
| `00` | [overview](./00-overview/) | vision, scope & non-goals, personas & use cases |
| `01` | [decisions](./01-decisions/) | 8 ADRs (surface+scout, hypothesis representation, experiment ledger, writeback-traffic schema, ingestion, implication mapping, storage+scheduling, export boundaries) |
| `02` | [research](./02-research/) | grounding research (TTT landscape, writeback modeling, …) |
| `03` | [architecture](./03-architecture/) | system architecture, component boundaries, data flow, tech stack, repo structure |
| `04` | [data-layer](./04-data-layer/) | data model, storage & scheduling, provenance & uncertainty |
| `05` | [ttt-research-core](./05-ttt-research-core/) | the heart: ExperimentScout pipeline, hypothesis & uncertainty, experiment ledger, writeback-traffic schema, implication mapping, export boundaries, ports & adapters |
| `06` | [interfaces](./06-interfaces/) | CLI & MCP, scout pipeline, outputs |
| `07` | [backend-api](./07-backend-api/) | core API, scout service, experiment-runner service, persistence |
| `08` | [research-plan](./08-research-plan/) | research plan, validation/tests, [open questions](./08-research-plan/open-questions.md) |
| `09` | [roadmap](./09-roadmap/) | milestones/phases, dependency graph, risks |
| `10` | [runbooks](./10-runbooks/) | the executable build plan (phases 0–4) — start at [runbooks/README.md](./10-runbooks/README.md) |

## The product in one paragraph

An **ExperimentScout** pipeline that turns uncertain TTT/future-AI claims into checkable experiments and a
memory-traffic schema. One core runs a **Run** (discover → import → dedup → extract → hypothesize → experiment →
log → implication → writeback → export). Hypotheses carry a **4-state reversible status** + calibrated uncertainty
with a **hard evidence cap** (generated evidence never promotes; a hypothesis is never a settled claim). Small
experiments are minimal reproductions in an **append-only ledger** with a pre-registered decision rule, a
reproducibility gate, and **retained negative results**. The **`wbtraffic.v0`** schema models TTT write traffic as
an analytic L0 estimate and is **exported, lowered onto CAW-01's L0 IR** (a boundary, not a shared store).
Everything external is an **adapter** behind three ports, with documented stubs. Storage is CAW-06's own
file-based ledger. Generated summaries are never evidence.

## Build path

Follow [`10-runbooks/`](./10-runbooks/) phases 0→4. **Milestone 1** = one checkable TTT claim → toy experiment
(logged, including possible failure) → implication map → a `wbtraffic.v0` analytic estimate exported to CAW-01.

## Status

All documents are **draft**; tracked [open-questions](./08-research-plan/open-questions.md) (including the
`wbq-###` writeback-modeling questions for CAW-01).

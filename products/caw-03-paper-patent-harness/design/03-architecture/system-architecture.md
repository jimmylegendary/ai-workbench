# System Architecture — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries.md](./component-boundaries.md), [data-flow.md](./data-flow.md), [../05-harness-core/ports-and-adapters.md](../05-harness-core/ports-and-adapters.md), [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The container view: the harness core, the five ports + adapter registry, the v1 adapters and future stubs, and the
one-way dependency rule. Module signatures are in [component-boundaries.md](./component-boundaries.md).

## One-way dependency rule

```
surfaces (API/MCP/CLI/UI)  →  harness core (op-manifest + governance)  →  PORTS  →  adapters
```

The core depends ONLY on ports. An adapter **cannot weaken governance** (gates run in the core, before/around
adapter calls). CAW-01/CAW-02/CAW-05 are reached only through adapters ([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters.md)).

## Container diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│  SURFACES (thin):  API   ·   MCP   ·   CLI   ·   review/status UI        │
└───────────────────────────────┬───────────────────────────────────────┘
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│  HARNESS CORE  (op-manifest of governed ops)                            │
│   Import/Ledger · Gate · Assembly · Draft-orchestration · Patent ·      │
│   Novelty/Ladder · Review · Publish        + Adapter Registry/Preflight │
│   + governance store (claim refs, artifacts, ladder, manifest, config)  │
└───┬───────────────┬───────────────┬───────────────┬───────────────┬────┘
    ▼ Source        ▼ WritingEngine ▼ PatentEngine  ▼ Sink/Publish   ▼ Novelty/Radar
 ┌─────────┐    ┌──────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
 │CAW-02   │    │PaperOrchestra│  │patent v1   │  │LaTeX / PDF │  │CAW-05 radar│
 │CAW-01   │    │ (subprocess) │  │ adapter    │  │            │  │+citation_pool
 │(v1)     │    └──────────────┘  └────────────┘  └────────────┘  └────────────┘
 │stubs:   │    stubs: other       stubs: ext      stubs: wiki      stubs: live
 │ wiki,   │     engines           patent tools    publish, venue   prior-art
 │ exp-srv │                                       submission,      search
 └─────────┘                                       patent filing
```

## Containers

| Container | Responsibility |
| --- | --- |
| **Surfaces** | Presentation/transport only; map to op-manifest ops; human-gate ops require confirmation. |
| **Harness core** | All governed logic: gate, assembly, orchestration, patent path, novelty/ladder, review, publish, confidentiality. Owns the governance store + adapter registry. |
| **SourceAdapter(s)** | Provide claim+evidence bundles + result refs. v1: CAW-02, CAW-01. Stubs: internal wiki, experiment-server. |
| **WritingEngineAdapter** | Paper drafting. v1: PaperOrchestra (subprocess over a CAW-03 workspace). Swappable. |
| **PatentEngineAdapter** | Patent drafting (separate path). v1 baseline adapter. |
| **Sink/PublishAdapter** | Outputs. v1: LaTeX/PDF files. Stubs: wiki publish, venue submission, patent filing. |
| **Novelty/RadarAdapter** | Related-work + threat signals. v1: citation_pool reuse + CAW-05 import. Stubs: live prior-art search. |

## TS ⇆ engine seam

PaperOrchestra runs as a **subprocess** over a CAW-03-owned workspace; the core feeds it the engine-neutral input
bundle and captures its outputs (LaTeX/PDF/BibTeX/scores) + provenance (figure_id ↔ result_id)
([../05-harness-core/writing-engine-adapter-paperorchestra.md](../05-harness-core/writing-engine-adapter-paperorchestra.md)).

## Cross-cutting

- **Governance before adapters:** the gate ([ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md)) and the patent-first interlock ([ADR-0004](../01-decisions/ADR-0004-patent-drafting.md)) run in the core, so no adapter can bypass them.
- **Confidentiality:** inherited CAW-02 boundary×visibility, enforced on import and on export ([ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary.md)).
- **Provenance:** every drafted artifact references its gated claims + CAW-01 results by id/URI.

## Open questions

PaperOrchestra non-interactive entrypoint (who runs its LLM/web/vision steps in subprocess mode) — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Phase-0 builds the core + ports + registry (with fakes); later phases add the v1 adapters and the documented stubs.

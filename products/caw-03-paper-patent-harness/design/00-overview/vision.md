# Vision — Paper & Patent Writing Harness (CAW-03)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [scope-and-non-goals.md](./scope-and-non-goals.md), [personas-and-use-cases.md](./personas-and-use-cases.md), [../05-harness-core/overview.md](../05-harness-core/overview.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The north star for **CAW-03**: an evidence-gated **harness** that turns verified claims + evidence into **papers
and patents** by *wrapping* an existing writing engine and adding the governance that engine lacks. This doc states
*why* the product exists and what its first credible version proves. It does NOT specify schemas or build steps.

## Thesis: a harness, not a paper-writing chatbot

The hard "write a paper" work already exists as **PaperOrchestra** (outline → plots → Semantic-Scholar-verified
literature review → section writing → refinement → autoraters → PDF). CAW-03 does **not** rebuild that. Instead it
is the **governance harness** around it:

> Only evidence-backed claims may enter a draft; results trace to real runs; confidentiality is enforced; patents
> get their own path; and the program's paper portfolio is planned and gated.

CAW-03 sits at the **top of the trust ladder** — it consumes credible, evidence-backed inputs; it never drives the
trust ladder prematurely (deferred until [CAW-01](../../../caw-01-simulation-control-plane/) has produced ≥1
credible projection).

## The unit of value

One **governed artifact**:

```
gated claim set  →  assembled engine inputs  →  draft (engine)  →  review  →  (paper PDF | patent draft)
```

with provenance preserved end-to-end (every drafted number/figure traces back to a CAW-01 result and a
CAW-02 claim+evidence).

## What CAW-03 adds over the engine (the governance delta)

| Capability | Source |
| --- | --- |
| Evidence gate + claim ledger (P1/P2/P3 typing) | new (over imported [CAW-02](../../../caw-02-knowledge-repository/) ledger) |
| Patent drafting path + patent-first interlock | new (separate `PatentEngine` port) |
| Novelty / claim-boundary + paper ladder | new (+ CAW-05 radar import) |
| Confidentiality filter (public-safe / counsel) | inherits CAW-02 boundary semantics |
| Drafting / plots / lit-review / refinement / PDF | **PaperOrchestra** (wrapped, swappable) |

## Open integration by design

CAW-03 is built as **ports & adapters** ([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters.md)). Inputs,
the writing engine, patents, novelty signals, and publish targets are all adapters behind typed ports. v1 wires
CAW-01/CAW-02 (source), PaperOrchestra (engine), LaTeX/PDF (sink), CAW-05 (novelty). Future connectors — **internal
wiki**, **internal experiment-server**, venue submission, patent filing — ship as **documented stubs**, so wiring
a real one later means filling in one adapter, not changing the core.

## First vertical slice (Milestone 1)

The smallest credible thing: produce **one evidence-gated paper** end to end —
import a CAW-02 claim+evidence bundle + CAW-01 results → gate the claims → assemble engine inputs → draft via
PaperOrchestra → review → emit a PDF — with provenance and the confidentiality filter applied. Patents and the
future-connector stubs come after.

## Design bias

Like the rest of the workbench: **control-plane feel, not chatbot** — show gate status, blocked claims, novelty/
patent flags, review/score, and the next honest action.

## Open questions

Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (notably PaperOrchestra
non-interactive invocation and jurisdiction/patent-first defaults).

## Implications for runbooks

Milestone 1 is the acceptance chain for the first runbook sequence (ports → adapters → gate → assembly → engine →
review → PDF).

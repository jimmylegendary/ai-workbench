# Vision — CAW-01 Simulation Control Plane

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [scope-and-non-goals.md](./scope-and-non-goals.md), [personas-and-use-cases.md](./personas-and-use-cases.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture.md), [../05-caw01-simulation-control-plane/overview.md](../05-caw01-simulation-control-plane/overview.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This document states the north star for **CAW-01**, an independent, standalone product (one of a family of
six separately implemented and deployed products, CAW-01..06, with no shared runtime). It frames *why* the
product exists and *what the first credible version proves*. It does NOT specify UI mechanics, schemas, or
build steps — those live in `05-*`, `04-*`, and `10-runbooks/`.

## Thesis: an instrument, not a solver

Traditional design-space exploration (DSE) searches for an optimum inside a *fixed* design space.
CAW-01's bet is different: for memory-centric AI hardware, the **workload axes and device classes are unknown,
moving, or newly created by future AI workloads**. So the product is an **instrument** that lets a domain
expert cheaply *move, add, and test* design-space axes — and preserves the evidence chain from a workload
hypothesis all the way to a memory-device implication.

Capacity-vs-bandwidth is therefore **not the starting question**. It is an *output* produced once workload
axes are chosen and run.

## The unit of value: one reproducible experiment

The product's atomic deliverable is never a screen. It is one reproducible experiment:

```
(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection
```

Everything in CAW-01 — the three canvases, the control panel, the work-tree, the engine — exists to make
that loop **composable, runnable, inspectable, and preservable as evidence**.

## Three evidence axes, one IR

CAW-01 normalizes three independent sources of truth into a single **memory-annotated IR** (`L0 → L1 → L2`
fill levels — see [l0-ir-schema.md](../05-caw01-simulation-control-plane/l0-ir-schema.md)):

| Axis | Source | Trace |
| --- | --- | --- |
| Real measurement | real service infra | OTel trace (validation anchor) |
| Synthetic execution | vLLM with torch→`syntorch` | sub-torch trace → Chakra trace |
| Simulation | LLMServingSim + ASTRA-sim (+ SST) | Chakra-driven projection |

The decisive engineering choice ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)): the three axes run
**in parallel into one L0 IR** and are compared as one experiment row — they are not literally chained.

## The product at a glance

A **Next.js web app** ([ADR-0001](../01-decisions/ADR-0001-product-surface.md),
[ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)) with a top **nav bar**
(Simulation / Module Design / User / Setting). The **Simulation** screen splits **1:9**:

- **Left (1) — Control Panel:** run / stop / configure, run status, evidence + projection readouts, per-item & full save.
- **Right (9) — Workspace:** three coordinated canvases —
  1. **AI Workload Flow** (a single agent-turn visualized as a graph),
  2. **Serving & Representation** (choose serving framework × representation layer × simulator path),
  3. **Hardware Design** (chip → die → package → tray → rack → cluster, visualized like real hardware, drillable & editable).

Every selection/edit across the three canvases is tracked as a **work-tree** with per-item and full save
([ADR-0007](../01-decisions/ADR-0007-change-management-worktree.md)).

The same product core (`@caw/core`) is also reachable via **MCP** and **CLI** — CAW-01's own automation
surfaces — so external agents and tools can drive *this* product.

## Design bias

CAW-01 must **feel like a control plane, not a chatbot**. The primary surfaces are: run status, evidence
completeness, open questions, blockers, artifact readiness, and the next honest action.

## First vertical slice (Milestone 1)

The smallest thing that proves real value (see [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)):

1. Define the **L0 memory-annotated IR**.
2. Run **one agent-turn** request through a ServingSim-style path **and** a syntorch-style path.
3. Export both to **Chakra**, lower both into the **same L0**.
4. Compute capacity-peak + rough traffic; render a **comparable projection** of the two axes.
5. Preserve the run's own sources, assumptions, and outputs as an evidence row that CAW-01 can later **export**
   to a separate paper/patent product.

## Why it matters (north star)

When this loop is credible, CAW-01 stands on its own as a memory-centric simulation instrument. Because its
runs end in preserved, cited evidence rows, CAW-01 can **export** artifacts (evidence, comparable projections,
derived requirements) across a clean product boundary to *other independent products* — e.g. a paper/patent
product (CAW-03). Those products consume CAW-01's exports; they do not share a runtime, registry, or database
with it.

## Open questions

- The literal pipeline ordering vs the parallel-axes resolution (tracked in
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).

## Implications for runbooks

Drives the milestone framing in `10-runbooks/` phase-0 → phase-5; Milestone 1 above is the acceptance target
for the first end-to-end runbook chain.

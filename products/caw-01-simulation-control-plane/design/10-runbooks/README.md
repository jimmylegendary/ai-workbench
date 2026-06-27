# Runbooks — CAW-01 Build Instructions

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** the AI builder (not a human reader)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md · conventions: [runbook-conventions.md](./runbook-conventions.md)

## What these are

Runbooks are the **executable build plan** for CAW-01. Each runbook is one cohesive build unit with atomic,
verifiable steps. The design documents in `design/00..09` say *what* and *why*; runbooks say *how to build it*.
**The product is built by an AI agent following these runbooks — not by the design author.**

## How to execute

1. Read [runbook-conventions.md](./runbook-conventions.md) and `../_meta/SOURCE-BRIEF.md` once.
2. Run runbooks in phase order; within a phase, respect each runbook's `Depends on:`.
3. Do not start a runbook whose gate (see [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md)) is not green.
4. After each runbook, confirm its **Acceptance criteria** before moving on.

## Phases (↔ [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md))

| Phase | Folder | Runbooks |
| --- | --- | --- |
| 0 Foundations | `phase-0-foundations` | RB-000 repo scaffold · RB-001 tooling/CI · RB-002 data layer · RB-003 design system |
| 1 App shell | `phase-1-app-shell` | RB-010 Next.js shell · RB-011 nav + 1:9 layout · RB-012 store + run/save wiring |
| 2 Canvases | `phase-2-canvases` | RB-020 React Flow foundation · RB-021 Canvas 1 · RB-022 Canvas 2 · RB-023 Canvas 3 3D spike (gate) · RB-024 Canvas 3 build · RB-025 work-tree UI |
| 3 Simulation engine | `phase-3-simulation-engine` | RB-030 L0 IR · RB-031 Chakra→L0 lowering · RB-032 simulation runtime · RB-033 projection + metrics |
| 4 Trace pipeline | `phase-4-trace-pipeline` | RB-040 Chakra↔ASTRA-sim reference round-trip (gate) · RB-041 syntorch capture · RB-042 Chakra exporter · RB-043 ASTRA-sim integration |
| 5 Persistence & API | `phase-5-persistence-and-api` | RB-050 MCP server · RB-051 CLI |

## Milestone 1 chain

`RB-000 → RB-001 → RB-002 → RB-010 → RB-012 → RB-030 → RB-031 → RB-033 → RB-040 → (RB-041→RB-042→RB-043)`
ending in the T2 L0 round-trip + comparable projection (UC-1).

## Budget discipline (RK-6)

Runbooks are intentionally small and resumable. If a build session is interrupted (rate limit, etc.), resume at
the next unstarted runbook — each one's **Hand-off** states what the next can assume.

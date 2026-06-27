# System Architecture — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries.md](./component-boundaries.md), [data-flow.md](./data-flow.md), [tech-stack.md](./tech-stack.md), [repo-structure.md](./repo-structure.md), [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The high-level container view of CAW-01: the shared core, the three surfaces, the engine-adapter ports, the
out-of-process Python engine, and the data layer — plus the one-way dependency rule. Module-level interfaces
and enforcement live in [component-boundaries.md](./component-boundaries.md).

## One-way dependency rule

```
surfaces  ─►  @caw/core services  ─►  engine-adapter PORTS ─►  (Python engine)
                      │
                      └────────────►  repository interfaces ─►  (data layer)
```

Arrows point **down only**. Surfaces depend on the core; the core depends on *ports/interfaces*, never on a
concrete engine or DB. Enforced by a package-boundary lint rule and a "zero `next` in `@caw/core`" rule
([ADR-0001](../01-decisions/ADR-0001-product-surface.md), [ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)).

## Container diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SURFACES (thin)                              │
│  ┌───────────────┐     ┌───────────────┐      ┌───────────────┐          │
│  │  Web app      │     │  MCP server   │      │  CLI          │          │
│  │  (Next.js)    │     │  (agents)     │      │  (scripts)    │          │
│  └──────┬────────┘     └──────┬────────┘      └──────┬────────┘          │
└─────────┼─────────────────────┼──────────────────────┼──────────────────┘
          └─────────────────────┼──────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     @caw/core  (TypeScript, zero next)                    │
│  ExperimentService · RunService · RegistryService · WorkTreeService ·     │
│  EvidenceService        +  Zod schemas (the one validation contract)      │
└───────────┬───────────────────────────────────────────┬──────────────────┘
            ▼ engine-adapter ports                       ▼ repository interfaces
┌──────────────────────────────────┐        ┌────────────────────────────────┐
│  Python engine (out-of-process)  │        │       Data layer                │
│  syntorch capture · Chakra       │        │  Postgres/SQLite (rows, graph   │
│  exporter · LLMServingSim ·      │        │  via adjacency+CTE, pgvector)   │
│  ASTRA-sim (±SST) · L0 lowering  │        │  + filesystem/object store      │
└──────────────────────────────────┘        │    (trace blobs by path/URI)    │
                                             └────────────────────────────────┘
```

## Containers

| Container | Tech | Responsibility |
| --- | --- | --- |
| **Web app** | Next.js App Router | Primary human surface: nav bar, 1:9 Simulation screen, three canvases, work-tree review. Presentation only — no domain logic. |
| **MCP server** | TS over `@caw/core` | Exposes core operations as tools so other agents drive the workbench. |
| **CLI** | TS over `@caw/core` | Scriptable access to the same operations. |
| **@caw/core** | TypeScript | All domain logic + the Zod contract. The single source of behavior. |
| **Python engine** | Python service | Runs syntorch capture, Chakra export, LLMServingSim, ASTRA-sim, and the Chakra→L0 lowering. Invoked via ports; never runs in the Next.js process. |
| **Data layer** | Postgres/SQLite + FS | System of record (rows + graphs) and artifact store (blobs by path). |

## The TS ⇆ Python seam

The core and the engine are different runtimes. They communicate through **engine-adapter ports** with a typed
contract; large artifacts are **never** passed inline — the engine writes blobs to the artifact store and
returns **paths/URIs** that the core records ([ADR-0002](../01-decisions/ADR-0002-data-layer.md),
[ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)). See
[../07-backend-api/simulation-runtime-service.md](../07-backend-api/simulation-runtime-service.md).

## Cross-cutting concerns

- **Validation:** Zod schemas in `@caw/core` are the one contract reused by every surface.
- **Provenance:** every run/commit carries who/when/from-which-surface ([ADR-0007](../01-decisions/ADR-0007-change-management-worktree.md)).
- **Fidelity tiers:** analytical backend default; ns-3/SST behind a flag ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)).

## Open questions

The exact transport for the TS⇆Python seam (subprocess + JSON-RPC vs local HTTP vs queue) is a TODO(open-question)
resolved in [../07-backend-api/simulation-runtime-service.md](../07-backend-api/simulation-runtime-service.md).

## Implications for runbooks

Phase-0 scaffolds the monorepo + `@caw/core` skeleton + data layer; phase-5 wires the Python engine service
and the MCP/CLI adapters. The one-way dependency rule is a CI check introduced in phase-0.

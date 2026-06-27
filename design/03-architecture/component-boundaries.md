# Component Boundaries — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture.md), [repo-structure.md](./repo-structure.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface.md), [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define the module/package boundaries, who owns what, the core service responsibilities at a signature level,
the port interfaces, and how boundaries are enforced. Repo directory layout is in [repo-structure.md](./repo-structure.md).

## Ownership map

| Package | Owns | Must NOT contain |
| --- | --- | --- |
| `@caw/core` | Domain services, Zod schemas, port interfaces, repository interfaces | Any `next`/React import; any concrete DB or engine code |
| `@caw/db` | Repository *implementations*, migrations, artifact-store client | Domain rules (those live in core) |
| `@caw/engine-adapters` | Concrete implementations of engine ports (talk to Python engine) | UI; domain rules |
| `apps/web` | Next.js presentation, canvases, cross-canvas coordination | Domain logic (calls core only) |
| `apps/mcp` | MCP tool definitions mapping to core ops | Domain logic |
| `apps/cli` | CLI commands mapping to core ops | Domain logic |
| `engine/` (Python) | syntorch capture, Chakra export, LLMServingSim, ASTRA-sim, L0 lowering | Knowledge of TS surfaces |

## Core services (signature-level)

> Types are Zod-validated; shown here as TS-ish signatures. Full contract in [../07-backend-api/api-surface.md](../07-backend-api/api-surface.md).

```ts
// Compose workload × serving × hardware into a runnable experiment
ExperimentService.create(input: ExperimentDraft): Experiment
ExperimentService.update(id, patch): Experiment
ExperimentService.get(id): Experiment

// Run lifecycle (state machine: draft → queued → running → done|failed)
RunService.start(experimentId, runConfig): Run
RunService.status(runId): RunStatus            // streamable
RunService.stop(runId): void

// Catalogs: models, serving frameworks, HW parts, tiling/partitioning strategy ids
RegistryService.listModels() / listServingFrameworks() / listHwParts() / listStrategyIds()

// git-like change tree across the three canvases
WorkTreeService.saveItem(experimentId, subtreePath, blob): Commit   // per-item save
WorkTreeService.saveAll(experimentId, message): Commit              // full save
WorkTreeService.branch(experimentId, fromRef, name): Ref
WorkTreeService.diff(refA, refB): TreeDiff

// Trace artifacts, metrics, projections, trust-ladder status
EvidenceService.registerArtifact(runId, kind, pathOrUri): TraceArtifact
EvidenceService.metrics(runId): Metric[]
EvidenceService.projection(experimentId, refs[]): Projection
EvidenceService.trustStatus(runId): TrustLadderStatus
```

## Engine-adapter ports (interfaces only)

```ts
interface SyntorchCapturePort { capture(spec): { chakraPaths: string[]; meta } }
interface ChakraExporterPort  { toChakra(nativeTracePath): { etPaths: string[] } }
interface ServingSimPort      { run(simConfig): { chakraPaths: string[]; metrics } }
interface AstraSimPort         { simulate(etPaths, hwConfig, backend): { metrics; artifacts } }
interface L0LoweringPort       { lower(etPaths, opts): { irPath: string; rollups } }
```

The Python engine implements these out-of-process; `@caw/engine-adapters` provides the TS side
([system-architecture.md](./system-architecture.md) seam).

## Repository interfaces (data layer)

```ts
interface ExperimentRepo { ... }   interface RunRepo { ... }
interface IrRepo { ... }           interface ArtifactStore { put/get by path/URI }
interface WorkTreeRepo { blobs, trees, commits, refs }   interface KnowledgeRepo { ... }
```

Concrete implementations live in `@caw/db` against Postgres/SQLite ([../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy.md)).

## Enforcement

- **Package-boundary lint** (e.g. dependency-cruiser / eslint-plugin-boundaries): `@caw/core` may not import `next`, React, `@caw/db`, or `@caw/engine-adapters` — only their interfaces (which live in core).
- **CI check** for the one-way dependency rule (phase-0 runbook).
- **Type-only contract:** surfaces import core types; runtime wiring is via dependency injection at the surface entry point.

## Open questions

Whether `@caw/engine-adapters` and `@caw/db` should be one "infrastructure" package or two — TODO(open-question),
revisit when the Python seam transport is chosen.

## Implications for runbooks

Phase-0 creates these packages with empty interfaces + the lint/CI guards before any feature code, so every
later runbook fills in implementations behind stable boundaries.

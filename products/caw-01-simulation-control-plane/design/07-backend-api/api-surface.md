# API Surface (`@caw/core` contract) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [simulation-runtime-service.md](./simulation-runtime-service.md), [persistence-and-storage-api.md](./persistence-and-storage-api.md), [mcp-and-cli-adapters.md](./mcp-and-cli-adapters.md), [../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The one contract every surface (web/MCP/CLI) consumes: the `@caw/core` service operations, Zod-typed. Signatures
here are the canonical reference; component boundaries are in [../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md).

## Contract principles

- All inputs/outputs are **Zod schemas** in `@caw/core/schemas` — the single validation contract.
- Services are pure domain logic; they call **ports** (engine) and **repositories** (data), never concretes.
- Errors are typed (`CawError` union): validation, not-found, conflict, engine-failure.

## Services

### ExperimentService
```ts
create(input: ExperimentDraft): Experiment        // compose workload×serving×hardware
update(id: Id, patch: ExperimentPatch): Experiment
get(id: Id): Experiment
list(filter?): Experiment[]
```

### RunService
```ts
start(experimentId: Id, runConfig: RunConfig): Run    // validates composition + grammar + hardware present
status(runId: Id): AsyncIterable<RunStatus>           // streamable (per-axis)
stop(runId: Id): void
get(runId: Id): Run
```

### RegistryService
```ts
listModels(): ModelRef[]
listServingFrameworks(): ServingRef[]      // vLLM, LLMServingSim
listHwParts(): HwPartRef[]                 // catalog for Canvas 3
listStrategyIds(): StrategyId[]            // tiling/partitioning
```

### WorkTreeService
```ts
saveItem(experimentId: Id, subtreePath: string, blob: ChangeBlob): Commit   // per-item save
saveAll(experimentId: Id, message: string): Commit                          // full save
branch(experimentId: Id, fromRef: RefName, name: RefName): Ref
diff(refA: RefName, refB: RefName): TreeDiff
history(experimentId: Id): Commit[]
```

### EvidenceService
```ts
registerArtifact(runId: Id, kind: ArtifactKind, pathOrUri: string): TraceArtifact
metrics(runId: Id): Metric[]
projection(experimentId: Id, refs: RefName[]): Projection
trustStatus(runId: Id): TrustLadderStatus
```

## Mapping to surfaces

| Operation class | Web | MCP | CLI |
| --- | --- | --- | --- |
| Mutations (create/update/save/branch) | Server Action | tool | command |
| Streams (run status) | Route Handler (SSE) | tool (poll/stream) | command (follow) |
| Reads (get/list/metrics/projection) | RSC fetch / action | tool | command |

Surface mapping detail in [mcp-and-cli-adapters.md](./mcp-and-cli-adapters.md).

## Open questions

Whether `projection` accepts arbitrary refs or only refs within one experiment in v1 — leaning single-experiment;
TODO(open-question).

## Implications for runbooks

Phase-0 defines these signatures + Zod schemas as empty contracts; later phases implement each service against
ports/repos already stubbed.

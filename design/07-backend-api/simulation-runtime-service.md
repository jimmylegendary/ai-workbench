# Simulation Runtime Service (Python engine seam) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-surface.md](./api-surface.md), [../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md](../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture.md), [../01-decisions/ADR-0005-trace-pipeline.md](../01-decisions/ADR-0005-trace-pipeline.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define the out-of-process Python engine service and the TS⇆Python seam: how `@caw/core` invokes runs, streams
status, and hands off artifact paths. The trace pipeline content is in
[../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md](../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md).

## Why out-of-process

The engine is Python (syntorch, LLMServingSim, ASTRA-sim, Chakra toolchain); the core is TypeScript. They run as
separate processes — the engine **never** runs in the Next.js process ([ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)).

## Seam contract

`@caw/engine-adapters` implements the core's engine ports by talking to the Python service. Each port maps to an
engine operation:

```
SyntorchCapturePort.capture(spec)            -> { chakraPaths[], meta }
ChakraExporterPort.toChakra(nativeTracePath) -> { etPaths[] }
ServingSimPort.run(simConfig)                -> { chakraPaths[], metrics }
AstraSimPort.simulate(etPaths, hwConfig, backend) -> { metrics, artifactPaths[] }
L0LoweringPort.lower(etPaths, opts)          -> { irPath, rollups }
```

## Transport (to decide)

| Option | Pros | Cons |
| --- | --- | --- |
| Subprocess + JSON-RPC over stdio | simple, no network | one host only |
| Local HTTP (FastAPI) | streamable, debuggable | extra service to run |
| Job queue (e.g. Redis/RQ) | durable, scalable | heavier for v1 |

v1 leaning **local HTTP (FastAPI) with SSE for status**; final choice TODO(open-question)
([../03-architecture/system-architecture.md](../03-architecture/system-architecture.md)).

## Artifact handoff

The engine writes blobs to the artifact store and returns **paths/URIs**; the core never receives inline blobs.
Path convention in [../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy.md).

## Status streaming

A run streams per-axis progress (queued/running/done/failed) back to `RunService.status`, surfaced to the web app
via a Route Handler (SSE) and to CLI via follow mode.

## Provenance pins

The engine reports its version pins (vLLM, Chakra et_def.proto rev, ASTRA-sim rev) on each run for reproducibility
([../05-caw01-simulation-control-plane/simulation-engine-and-projection.md](../05-caw01-simulation-control-plane/simulation-engine-and-projection.md)).

## Open questions

- Transport choice (stdio vs HTTP vs queue) — TODO(open-question).
- Whether LLMServingSim's embedded ASTRA-sim is invoked vs the standalone ASTRA-sim — TODO(open-question)
  ([../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).

## Implications for runbooks

Phase-4 stands up the engine service + adapters behind the ports; the reference Chakra→ASTRA-sim round-trip is the
first runbook before syntorch wiring.

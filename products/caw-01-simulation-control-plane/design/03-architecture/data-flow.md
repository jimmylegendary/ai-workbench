# Data Flow — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture.md), [../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md](../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md), [../05-caw01-simulation-control-plane/l0-ir-schema.md](../05-caw01-simulation-control-plane/l0-ir-schema.md), [../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Trace the end-to-end flows of the system: composing an experiment, running it across axes, normalizing to L0,
producing a projection, and saving via the work-tree. Storage details live in `04-*`; engine details in `05-*`.

## Flow A — compose → run → project

```
User (Canvas 1/2/3)
  │  edits  -> Zustand store -> Server Action
  ▼
@caw/core ExperimentService.create/update            (Zod-validated Experiment)
  │
  ▼  RunService.start(experimentId, runConfig)
@caw/core ───► engine-adapter ports ───► Python engine
                                          ├─ synthetic axis: syntorch capture ─► Chakra exporter ─► chakra.<rank>.et
                                          ├─ simulation axis: LLMServingSim ──────────────────────► chakra (per-iter)
                                          ├─ ASTRA-sim(analytical) times each ET ─► metrics + artifacts
                                          └─ L0 lowering: ET(s) ─► one L0 IR (+ capacity/traffic rollups)
  │  returns: artifact PATHS + metrics (never inline blobs)
  ▼
EvidenceService.registerArtifact / metrics / projection
  │
  ▼
Comparable projection rendered in control panel + canvases
```

The three axes run **in parallel into one L0**, not as a literal chain
([ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)).

## Flow B — save (work-tree)

```
Canvas edit ─► change_blob (content-addressed)
per-item save ─► WorkTreeService.saveItem(subtreePath, blob) ─► change_commit (subtree)
full save     ─► WorkTreeService.saveAll(message)            ─► change_commit (root_tree)
branch        ─► WorkTreeService.branch(fromRef, name)       ─► new ref
```

Every commit records `{author, surface, message, created_at, parents[]}` ([ADR-0007](../01-decisions/ADR-0007-change-management-worktree.md)).

## Flow C — evidence/projection export to other products

CAW-01 keeps only the run-evidence/provenance it needs for its own runs. What other products consume crosses
a strict **export boundary between independent products** — there is no shared substrate, registry, or DB.
CAW-03 (the paper/patent product) is a separate, independently deployed product that consumes these exports.

```
Experiment (refs) ─► EvidenceService.projection(refs[]) ─► Projection (comparable rows)
                  ─► EvidenceService.trustStatus(runId) ─► TrustLadderStatus
                  ─► export artifact (claims point to evidence) ─► CAW-03 paper/patent (separate product)
```

## Artifact handling rule

Large blobs (Chakra ET, OTel, raw sub-torch dumps, raw InputTrace) are written by the engine to the
filesystem/object store and referenced by **path/URI** in a Postgres row; they never travel inline across the
TS⇆Python seam ([ADR-0002](../01-decisions/ADR-0002-data-layer.md)).

## Streaming

`RunService.status(runId)` is streamable; the web app subscribes via a Route Handler (SSE/stream) while
human mutations go through Server Actions ([ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)).

## Open questions

Whether LLMServingSim's embedded ASTRA-sim is used directly for the simulation axis or replaced by the
standalone ASTRA-sim call — affects Flow A wiring ([../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).

## Implications for runbooks

Flow A is the spine of the phase-3 (engine) + phase-4 (trace pipeline) runbooks; Flow B drives the work-tree
runbook in phase-2; Flow C drives the evidence/projection runbook.

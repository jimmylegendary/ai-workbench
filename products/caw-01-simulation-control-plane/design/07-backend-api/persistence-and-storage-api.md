# Persistence & Storage API — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-surface.md](./api-surface.md), [../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy.md), [../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning.md), [../01-decisions/ADR-0002-data-layer.md](../01-decisions/ADR-0002-data-layer.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The repository interfaces over the data layer and the artifact-store API, plus transaction/consistency rules.
Storage placement is in [../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy.md); this is the code contract.

## Repository interfaces (in `@caw/core`, implemented in `@caw/db`)

```ts
interface ExperimentRepo { create, update, get, list }
interface RunRepo        { create, setStatus, get, listByExperiment }
interface IrRepo         { putL0(runId, ir|path), getL0(runId), rollups(runId) }
interface MetricRepo     { put(runId, metrics[]), list(runId) }
interface WorkTreeRepo   { putBlob, putTree, putCommit, moveRef, getRef, walk(treeHash) }
interface KnowledgeRepo  { putSource, putClaim, putEvidence, link, query }
interface ArtifactStore  { put(path, bytesStream): uri; get(uri): stream; resolve(uri): localPath }
```

All concretes target Postgres/SQLite (dialect-portable) + filesystem/object store
([ADR-0002](../01-decisions/ADR-0002-data-layer.md)).

## Artifact store

- `put` is called by the engine side (or via the adapter) using the path convention
  (`artifacts/{experiment}/{run}/{kind}/{rank}.{ext}`).
- Rows store the **URI**; bytes are never in the DB.
- Content immutable; re-runs create new run folders.

## Transaction rules

| Unit | Atomicity |
| --- | --- |
| Run completion | metrics + artifact rows + IR registration committed together |
| Work-tree save | blobs/trees written, then commit + ref move in one tx |
| Knowledge write | claim + its evidence link in one tx (claim→evidence invariant) |

## Graph access

HW tree + IR neighborhoods use adjacency tables + **recursive CTEs**; no Neo4j in v1
([../04-data-layer/data-model.md](../04-data-layer/data-model.md)).

## Consistency & migrations

- Forward-only migrations, dialect-checked in CI (SQLite + Postgres).
- pgvector behind a capability flag so SQLite builds compile.

## Open questions

Whether `IrRepo` stores L0 as rows or blob+index at L0 scale — TODO(open-question)
([../04-data-layer/data-model.md](../04-data-layer/data-model.md)).

## Implications for runbooks

Phase-0 data-layer runbook implements these repos against SQLite (PG-portable) + a local-FS `ArtifactStore`.

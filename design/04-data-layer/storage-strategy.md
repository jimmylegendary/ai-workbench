# Storage Strategy — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model.md), [work-tree-and-versioning.md](./work-tree-and-versioning.md), [../01-decisions/ADR-0002-data-layer.md](../01-decisions/ADR-0002-data-layer.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Decide *what lives where*: Postgres rows vs pgvector vs filesystem/object-store blobs vs md-first git, plus
SQLite→Postgres portability and the artifact path convention across the TS⇆Python seam.

## Placement matrix

| Data | Store | Why |
| --- | --- | --- |
| Relational entities, graphs (HW tree, IR neighborhoods), work-tree objects, metrics | **Postgres** (SQLite first) | one queryable system of record |
| Semantic search over claims/runs/IRs | **pgvector** in the same Postgres | no second store at single-expert scale; added only when needed |
| Large trace blobs: Chakra ET, OTel, raw sub-torch dumps, raw `InputTrace` | **filesystem / object store** by path/URI | rows stay small; engine writes, core records the path |
| Human-authored narrative (ADRs, design notes, this set) | **md-first git** | human-diffable source of truth |

## SQLite → Postgres portability rules

Start on SQLite for the first slice but keep it Postgres-portable so the migration is mechanical:

- Use a query builder/ORM dialect-portable subset (e.g. Drizzle/Kysely) — no SQLite-only features.
- Model JSON as `JSONB`-compatible columns; UUID text ids; ISO timestamps.
- Recursive CTEs only (supported by both) for graph traversal — no SQLite `rowid` tricks.
- pgvector is a **Postgres-only** add: gate semantic-search code behind a capability flag so SQLite builds compile without it.
- Migrations are forward-only, dialect-checked in CI against both engines.

## Artifact path/URI convention

The engine writes blobs and returns paths; the core never receives inline blobs
([ADR-0002](../01-decisions/ADR-0002-data-layer.md), [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)):

```
artifacts/{experiment_id}/{run_id}/{kind}/{rank}.{ext}
  kind ∈ {chakra, otel, native, input, ir}
```

- `TraceArtifact.path` stores this relative URI; the `ArtifactStore` resolves it to local FS or object store.
- Content is treated as immutable; re-runs write new run_id folders.

## Transactions & consistency

- A run's metrics + artifacts + IR registration are written in one transaction after the engine returns paths.
- Work-tree commits are append-only; refs move in a single transaction ([work-tree-and-versioning.md](./work-tree-and-versioning.md)).

## Backup / retention

- DB: standard PG dump; SQLite file snapshot in dev.
- Artifacts: retained per experiment; pruning is a later concern (out of scope v1).

## Open questions

Local FS vs MinIO/S3 for the artifact store at the point object storage is needed — TODO(open-question).

## Implications for runbooks

The phase-0 data-layer runbook sets up the dialect-portable schema + `ArtifactStore` interface; the phase-3/4
runbooks make the engine write to the path convention above.

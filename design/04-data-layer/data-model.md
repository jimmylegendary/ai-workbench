# Data Model — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [storage-strategy.md](./storage-strategy.md), [work-tree-and-versioning.md](./work-tree-and-versioning.md), [knowledge-substrate.md](./knowledge-substrate.md), [../05-caw01-simulation-control-plane/l0-ir-schema.md](../05-caw01-simulation-control-plane/l0-ir-schema.md), [../01-decisions/ADR-0002-data-layer.md](../01-decisions/ADR-0002-data-layer.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The logical schema for CAW-01: the knowledge substrate, the simulation substrate, and the HW hierarchy, plus
the graph-in-Postgres approach. Physical storage placement (rows vs blobs vs vectors) is in
[storage-strategy.md](./storage-strategy.md); the work-tree tables are in [work-tree-and-versioning.md](./work-tree-and-versioning.md).

## Conventions

- All tables have `id` (uuid), `created_at`, `created_by`, `surface`.
- Foreign keys are explicit; the **claim→evidence invariant** is enforced (a `Claim` with no `Evidence` is invalid for publishing).
- Graphs are stored as **adjacency/edge tables** traversed by **recursive CTEs** (no Neo4j in v1, [ADR-0002](../01-decisions/ADR-0002-data-layer.md)).

## Knowledge substrate

| Entity | Key columns | Notes |
| --- | --- | --- |
| `Source` | origin, date, author, license, retrieval_method, trust_level, boundary(public/internal/confidential) | raw input |
| `Claim` | statement, source_id, status | MUST point to evidence to be publishable |
| `Evidence` | claim_id, kind(run/source/measurement), ref (run_id or source_id or artifact path) | the proof |
| `Note` / `Concept` / `Interest` / `OpenQuestion` / `Decision` / `Assumption` | text, links | knowledge graph nodes |

See [knowledge-substrate.md](./knowledge-substrate.md) for the provenance/trust model.

## Simulation substrate

| Entity | Key columns | Relations |
| --- | --- | --- |
| `WorkloadModel` | name, agent_turn_spec, params | → Experiment |
| `InputTrace` | workload_id, path/URI, format | large blob by path |
| `SimulationConfig` | serving_choice, representation(torch/syntorch), simulator_path, hw_config_ref, backend(analytical/ns3/sst) | from Canvas 2 + Canvas 3 |
| `SimulationRun` | experiment_id, config_id, status, started_at, finished_at | state machine |
| `TraceArtifact` | run_id, kind(chakra/otel/native), path/URI, rank | blob by path |
| `Metric` | run_id, name, value, unit | numeric outputs |
| `ResultSet` | run_id, metrics[], projection_ref | grouped |
| `MemoryAnnotatedIR` | run_id, fill_level(L0/L1/L2), path/URI or rows | the normalized IR |
| `TensorNode` | ir_id, op_ref, size, dtype, allocated_at, freed_at, residency, strategy_id | IR node |
| `DataMovementEdge` | ir_id, src_tier, dst_tier, bytes, sync_async | IR edge |
| `FillLevel` | enum L0/L1/L2 | completeness marker |
| `ArchitectureProposal` | experiment_id, summary, evidence_refs[] | downstream conclusion |
| `MemoryProductRequirement` | proposal_id, requirement, evidence_refs[] | downstream conclusion |

IR detail lives in [../05-caw01-simulation-control-plane/l0-ir-schema.md](../05-caw01-simulation-control-plane/l0-ir-schema.md).

## Hardware hierarchy (Canvas 3)

A single self-referential `hw_node` adjacency table models chip→die→package→tray→rack→cluster:

```
hw_node(id, experiment_id, parent_id NULL, level ENUM(cluster,rack,tray,package,die,chip,component),
        name, spec JSONB, part_id TEXT)        -- part_id == the picking identity
```

- Traverse with a recursive CTE (bounded ~6 levels; cheap).
- `spec JSONB` holds level-specific attributes (opaque until promoted to a column by the promotion principle).
- `part_id` is the stable identity returned by canvas picking ([../05-caw01-simulation-control-plane/canvas-3-hw-design.md](../05-caw01-simulation-control-plane/canvas-3-hw-design.md)).

## Experiment as the join

```
Experiment(id, name, head_ref)         -- head_ref → work-tree ref
   ├─ WorkloadModel        (Canvas 1)
   ├─ SimulationConfig     (Canvas 2)
   ├─ hw_node tree         (Canvas 3)
   └─ SimulationRun*       → TraceArtifact*, Metric*, MemoryAnnotatedIR, ResultSet
```

The composed config across the three canvases is versioned by the **work-tree** ([work-tree-and-versioning.md](./work-tree-and-versioning.md)).

## Open questions

Whether `MemoryAnnotatedIR` stores TensorNode/DataMovementEdge as rows (queryable) or as a blob+index
(cheaper) at L0 scale — TODO(open-question), decided by IR query needs.

## Implications for runbooks

The phase-0 data-layer runbook creates these tables (SQLite, PG-portable); the IR rows are created in the
phase-3 engine runbook once L0 lowering emits them.

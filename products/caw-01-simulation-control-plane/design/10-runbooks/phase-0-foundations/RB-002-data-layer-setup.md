# RB-002: Data layer (SQLite, PG-portable) + artifact store

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [data-model.md](../../04-data-layer/data-model.md), [storage-strategy.md](../../04-data-layer/storage-strategy.md), [work-tree-and-versioning.md](../../04-data-layer/work-tree-and-versioning.md), [knowledge-substrate.md](../../04-data-layer/knowledge-substrate.md), [persistence-and-storage-api.md](../../07-backend-api/persistence-and-storage-api.md)
- Produces: `@caw/db` schema + migrations + repository impls + local-FS `ArtifactStore`

## Objective

A working data layer on SQLite kept Postgres-portable: the simulation + HW-hierarchy + work-tree + lean
run-evidence/provenance tables, the repository implementations behind the core interfaces, and a filesystem
artifact store. CAW-01 keeps only the minimal evidence/provenance it needs for *its own* runs; the general
knowledge repository (external Sources/Claims/Notes/Concepts/Interests/OpenQuestions) is a **separate product
(CAW-02)** and is out of scope here.

## Preconditions

- [ ] RB-001 complete (CI + repo interfaces stubbed in `@caw/core`).

## Steps

1. **Do:** Choose a dialect-portable query layer (Drizzle or Kysely). Configure SQLite now, Postgres target later.
   **Verify:** `cmd:` migration runs against SQLite; same migration validates against Postgres in CI.
2. **Do:** Create migrations for the **simulation substrate** (Experiment, WorkloadModel, InputTrace, SimulationConfig, SimulationRun, TraceArtifact, Metric, ResultSet, MemoryAnnotatedIR, TensorNode, DataMovementEdge) per [data-model.md](../../04-data-layer/data-model.md).
   **Verify:** `test:` insert/select round-trip for each table.
3. **Do:** Create the lean **run-evidence/provenance** tables (Evidence attached to runs, plus a Claim row for CAW-01's *own* generated conclusions) with the **claim→evidence** constraint and `trust_level`/`boundary` columns. Do **not** model the broad external-knowledge entities (Source/Note/Concept/Interest/OpenQuestion) — those live in CAW-02 (a separate product).
   **Verify:** `test:` a publishable claim without evidence is rejected.
4. **Do:** Create the **HW hierarchy** `hw_node` adjacency table (+ `part_id`); implement a recursive-CTE traversal helper.
   **Verify:** `test:` build a chip→cluster tree, traverse it via CTE.
5. **Do:** Create the **work-tree** tables (`change_blob`, `change_tree`, `change_commit`, `ref`, `intent_event`) per [work-tree-and-versioning.md](../../04-data-layer/work-tree-and-versioning.md), with content-address hashing.
   **Verify:** `test:` write a blob+tree+commit, move a ref, structural sharing on an unchanged subtree.
6. **Do:** Implement repository interfaces in `@caw/db` against these tables; implement `ArtifactStore` over local FS using the path convention `artifacts/{exp}/{run}/{kind}/{rank}.{ext}`.
   **Verify:** `test:` `ArtifactStore.put/get/resolve` round-trip; repos satisfy the `@caw/core` interfaces.

## Acceptance criteria

- [ ] All tables migrate on SQLite and validate on Postgres in CI.
- [ ] claim→evidence constraint enforced; trust/boundary columns present.
- [ ] Work-tree blob/tree/commit/ref round-trip with structural sharing.
- [ ] `ArtifactStore` stores/reads by path; no bytes in DB rows.

## Rollback / safety

Forward-only migrations; to roll back in dev, drop the SQLite file and re-migrate. Never edit a shipped migration.

## Hand-off

The engine and surfaces can now persist experiments, runs, IR, work-tree commits, and artifacts behind the repo
interfaces.

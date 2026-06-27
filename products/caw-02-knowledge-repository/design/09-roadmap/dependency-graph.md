# Dependency Graph

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [milestones-and-phases.md](milestones-and-phases.md)
  - [risks-and-mitigations.md](risks-and-mitigations.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc fixes the **build order** as a directed acyclic graph (DAG) of
capabilities and shows why each edge exists. It enforces the hard ordering
constraints: **data model before everything**, **storage + reindex before
ingestion**, **evidence gate before agent writes**, **import/export after the
core**. It does NOT restate phase entry/exit (see
[milestones-and-phases.md](milestones-and-phases.md)) nor ADR rationale.

## Hard ordering rules (must hold)

| Rule | Why |
|------|-----|
| Data model (ADR-0003) precedes ALL build work | every entity/edge/validator references the typed node + one generic edge contract |
| Storage (md-git) + deterministic reindex precede ingestion | ingestion writes entities that must round-trip through md-git → SQLite (ADR-0002) |
| Evidence gate precedes agent writes | `attach_evidence` is structural; agents must not write before the gate exists (ADR-0004) |
| Core (validator + op manifest) precedes surfaces | API/MCP/CLI are thin adapters codegen'd from the manifest; they add nothing (ADR-0001) |
| Provenance/trust + boundaries precede import/export | crossings re-redact and filter on boundary/visibility/trust (ADR-0007) |
| Retrieval precedes export bundles | exported bundles are the hydrated claim+evidence retrieval result (ADR-0006/0007) |

## DAG (ASCII)

```
                         ┌───────────────────────────┐
                         │  A. DATA MODEL (ADR-0003)  │  ← root: everything depends on this
                         │  typed nodes + 1 edge tbl  │
                         └─────────────┬─────────────┘
                                       │
                ┌──────────────────────┼───────────────────────┐
                v                      v                        v
   ┌────────────────────┐  ┌────────────────────────┐  ┌──────────────────────┐
   │ B. STORAGE md-git   │  │ C. FRONTMATTER SCHEMAS │  │ D. AUDIT/_events log │
   │ (ADR-0002, P1)      │  │ (layer 1 of invariant) │  │ (append-only, P1)    │
   └─────────┬───────────┘  └───────────┬────────────┘  └──────────┬───────────┘
             │                          │                          │
             v                          │                          │
   ┌────────────────────┐               │                          │
   │ E. DETERMINISTIC   │               │                          │
   │ REINDEX → SQLite   │◄──────────────┘                          │
   │ (idempotent, P1)   │   (layer 3 re-check of invariant)        │
   └─────────┬──────────┘                                          │
             │                                                     │
             v                                                     │
   ┌─────────────────────────────────────────────┐                │
   │ F. CORE: validator + Claim→Evidence invariant │◄──────────────┘
   │    + STRUCTURAL EVIDENCE GATE (ADR-0004)      │  (layer 2 of invariant)
   │    + op manifest (P2)                          │
   └───────────────────────┬───────────────────────┘
                            │
        ┌───────────────────┼─────────────────────────┐
        v                   v                          v
┌───────────────┐  ┌──────────────────────┐  ┌────────────────────────┐
│ G. INGESTION   │  │ H. PROVENANCE/TRUST  │  │ I. RETRIEVAL FTS5 +    │
│ 6-stage pipe   │  │ boundary+visibility  │  │ structured filters     │
│ ===> M1 (P2)   │  │ monotone, T0–T3 (P3) │  │ (ADR-0006, P5)         │
└──────┬─────────┘  └──────────┬───────────┘  └───────────┬────────────┘
       │                       │                           │
       │                       v                           │
       │            ┌────────────────────────┐             │
       │            │ J. AGENT WRITES via     │             │
       │            │ skill-wrap, confirm-by- │             │
       │            │ default (needs gate F + │             │
       │            │ trust H) — surfaces P4  │             │
       │            └──────────┬─────────────┘             │
       │                       │                           │
       └───────────┬───────────┴─────────────┬─────────────┘
                   v                          v
        ┌────────────────────────┐  ┌────────────────────────┐
        │ K. IMPORT: quarantine + │  │ L. EXPORT: fail-closed │
        │ confidentiality check   │  │ allow-list + signed    │
        │ (CAW-01/05) (P6)        │  │ bundle (CAW-03) (P6)   │
        └────────────────────────┘  └────────────────────────┘
```

## Edge list (dependency → dependent, with reason)

| From | To | Reason |
|------|----|--------|
| A data model | B,C,D | all storage/schema/audit reference the node+edge contract |
| B md-git | E reindex | reindex reads md as the single source of truth |
| C frontmatter schemas | E reindex | layer-1 invariant feeds layer-3 re-check |
| B,C,D | F core | validator enforces invariant across all three layers |
| E reindex | F core | reindex re-check is the third invariant layer |
| F core | G ingestion | the 6-stage pipeline calls core ops; gate blocks bad evidence |
| F core (gate) | J agent writes | agents may not write before the structural gate exists |
| F core (manifest) | J surfaces | API/MCP/CLI codegen'd from the op manifest |
| G ingestion | (M1) | first provenance round-trip = ingestion on B+E via F |
| H trust/boundary | J agent writes | AI-authored capped at T2; confirmation-by-default |
| H trust/boundary | K,L import/export | re-redaction + filtering depend on labels |
| I retrieval | L export | export bundle is the hydrated retrieval result |
| F,G,H,I,J | K,L | import/export come AFTER the core is stable |

## Critical path

```
A → B → E → F → G  ===>  M1 (first provenance round-trip + retrieval)
```

Everything on `H, I, J, K, L` is **post-M1**. Import/export (`K, L`) is the
deepest leaf and must not start until core + provenance + retrieval are stable.

## Parallelizable once F (core) is stable

- `H` (provenance/trust) and `I` (retrieval) can proceed in parallel.
- `J` (surfaces) needs both `F` (manifest) and `H` (trust) — joins after.
- `K` (import) and `L` (export) are independent of each other but both need `H`.

## Open Questions

- Whether retrieval `I` can begin before provenance `H` completes (filters need labels). TODO(open-question).
- See `../08-research-plan/open-questions.md`.

## Implications for runbooks

- `Depends on:` fields in runbooks must mirror the edge list above.
- No runbook in P6 may declare itself `ready` until P2/P3/P5 acceptance is met.
- M1 runbook depends only on the critical path `A → B → E → F → G`.

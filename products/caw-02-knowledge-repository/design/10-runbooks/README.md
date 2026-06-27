# CAW-02 Runbooks — Index

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [runbook-conventions.md](runbook-conventions.md)
  - [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)
  - [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This is the **execution index** for CAW-02's runbooks: the build plan an **AI
builder** follows to construct the Team/Personal Knowledge Repository
(CAW-02) — an independent, standalone product with its OWN core, data, and
surfaces (no shared substrate with CAW-01/05/03). It tells the builder *what the
runbooks are, in what order to run them, and when a phase is allowed to start*.
It does NOT restate ADR rationale (see `../01-decisions/`) nor per-step build
instructions (those live inside each `RB-*.md`). The strict runbook contract is
[runbook-conventions.md](runbook-conventions.md); the format authority is
[DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS.md).

## What a runbook is

A runbook (`RB-XXX-*.md`) is one cohesive, **resumable** build unit executed by
an AI builder. Design docs say *what & why*; runbooks say *how*. Each runbook is
self-contained, declares its dependencies, and leaves the tree **green**
(compiling, lint-passing, schema-validating) at its Acceptance checkpoint so an
interrupted build resumes cleanly. Code inside a runbook is **build guidance**
(skeletons / signatures / config); the builder writes the real code.

## How to execute

1. **Honor `Depends on:`** — never start a runbook whose dependencies are not
   `accepted`/green. The `Depends on:` graph mirrors the
   [dependency-graph.md](../09-roadmap/dependency-graph.md) edge list.
2. **Run phases in order.** Phases are largely sequential; the only sanctioned
   overlap is P5 (surfaces) and P6 (retrieval) once P2 (core) and P3
   (provenance/trust) are stable — see the milestone gates below.
3. **Treat each phase exit as a gate.** A phase's runbooks are done only when its
   milestone exit criteria in
   [milestones-and-phases.md](../09-roadmap/milestones-and-phases.md) are all
   true. No P6 runbook may declare itself `ready` until P2/P3/P5 acceptance is met.
4. **Leave the tree green at every checkpoint.** Each Acceptance checklist is a
   resume point.
5. **Never bypass the core.** Every write goes through the one transactional core
   (validator + evidence gate + append-only audit). Surfaces are thin adapters.

## Phase table

Folder numbering `10-runbooks/0X-*` maps 1:1 to roadmap phases P0–P7.

| Phase | Runbook folder | Theme | Milestone | Key design |
|-------|----------------|-------|-----------|------------|
| **P0 Foundations** | `00-foundations/` | repo, CI, `knowledge/` tree layout, frontmatter schemas, one generic typed-edge data model | M0 | [ADR-0002](../01-decisions/ADR-0002-storage.md), [ADR-0003 data model](../01-decisions/), [05-knowledge-core](../05-knowledge-core/) |
| **P1 Storage & reindex** | `01-storage-and-index/` | md-in-git = single source of truth; append-only `_events/*.jsonl`; deterministic idempotent reindex → SQLite (FTS/vector in droppable migrations) | enables M1 | [ADR-0002](../01-decisions/ADR-0002-storage.md), [04-data-layer](../04-data-layer/) |
| **P2 Core & skill-wrap** | `02-core-and-skillwrap/` | one transactional core: validator, 3-layer Claim→Evidence invariant, **structural evidence gate**, append-only + supersedes, op manifest, ingestion round-trip | **M1** | [ADR-0004 evidence gate](../01-decisions/), [ADR-0005 ingestion](../01-decisions/ADR-0005-ingestion-pipeline.md), [05-knowledge-core](../05-knowledge-core/) |
| **P3 Provenance & trust** | `03-provenance-trust/` | boundary {public/internal/confidential} × visibility {team/private} monotone propagation; trust ladder T0–T3 + contested (AI capped T2); audit/events | M2 | [ADR provenance/trust](../01-decisions/) |
| **P4 Surfaces** | `04-surfaces/` | API + MCP + CLI thin adapters codegen'd from the op manifest; confirmation-by-default for agent writes | M3 | [ADR-0001 surface & skill interface](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) |
| **P5 Retrieval** | `05-retrieval/` | SQLite FTS5/BM25 + first-class structured filters pre-ranking; citation-constrained RAG hydration; NO embeddings v0 | M4 | [ADR-0006 retrieval](../01-decisions/) |
| **P6 Import / export** | `06-import-export/` | quarantine import + confidentiality check; fail-closed export allow-list; re-redaction at every crossing; signed bundles | M5 | [ADR-0007 import/export](../01-decisions/ADR-0007-import-export-contracts.md) |
| **P7 Viewer & hardening** | `07-viewer-and-hardening/` | optional read-only viewer; dedup quality; resumability hardening | — | [PRODUCT-BRIEF §4](../_meta/PRODUCT-BRIEF.md) |

> Task framing note: the coarse "0 foundations / 1 core / 2 ingestion /
> 3 retrieval / 4 interfaces / 5 import-export" grouping collapses P0–P1 into
> foundations, folds ingestion into P2 core, and reorders surfaces vs retrieval.
> The **authoritative** sequencing is the P0–P7 table above (from
> [milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)); follow it.

## Milestone gates

| Milestone | Gate (all must be true to pass) |
|-----------|---------------------------------|
| **M0** | tree compiles/lints; CI green on empty tree; `knowledge/` + `_events/` initialized and version-controlled |
| **M1** | `add-source → extract-claim → attach-evidence → synthesize-cited-note` writes valid md-in-git, reindexes to SQLite, and is retrievable with hydrated provenance — via the skill interface, not ad-hoc edits |
| **M2** | boundary/visibility monotone propagation + T0–T3 ladder computed deterministically; evidence gate structural |
| **M3** | three surfaces codegen'd from one manifest, identical semantics; agent write without confirmation blocked |
| **M4** | filters applied pre-ranking (no confidential/private leak); RAG returns claim+evidence, never opaque blobs |
| **M5** | import quarantined + confidentiality-checked; export fail-closed allow-list; bundles signed; no shared store |

## Milestone-1 chain (the critical path)

M1 is the **critical milestone** — nothing after it is meaningful until the
provenance round-trip exists end to end on the real storage substrate. The M1
chain follows the dependency-graph critical path `A → B → E → F → G`:

```
RB-00x (P0: data model + knowledge/ tree + frontmatter schemas + CI)   [A,C,D]
   ↓
RB-01x (P1: md-git writer + append-only _events)                       [B]
   ↓
RB-01x (P1: deterministic idempotent reindex → SQLite)                 [E]
   ↓
RB-02x (P2: core validator + 3-layer Claim→Evidence invariant + gate + op manifest)  [F]
   ↓
RB-02x (P2: 6-stage ingestion round-trip via skill interface)         [G]  ===> M1
   ↓
RB-05x (P5: FTS5 retrieval returns the Note with hydrated provenance) [I]  (closes M1 retrieval criterion)
```

Everything on H (provenance/trust), J (surfaces), K/L (import/export) is
**post-M1**. The M1 runbook depends only on the critical path `A → B → E → F → G`.

## Budget discipline

- **Small, resumable runbooks.** Prefer many narrow runbooks over a few sprawling
  ones. Each should be completable and verifiable within one builder session.
- **Green at every checkpoint.** Each Acceptance checklist is a save point; a
  runbook that cannot leave the tree green is too big — split it.
- **One concern per runbook.** Storage, reindex, validator, gate, and each surface
  are separate units so a failure rolls back cleanly (see each runbook's
  Rollback / safety section).
- **No speculative scope.** v0 is **append + retrieve + skill-wrap** — NOT
  continual learning, no graph DB, no rich UI (PRODUCT-BRIEF §9). Runbooks must
  not build beyond their phase's milestone.
```

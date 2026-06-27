# Scope & Non-Goals — CAW-02

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [vision.md](./vision.md)
  - [personas-and-use-cases.md](./personas-and-use-cases.md)
  - [ADR-0001 Product surface](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [ADR-0002 Storage](../01-decisions/ADR-0002-storage.md)
  - [ADR-0006 Retrieval](../01-decisions/ADR-0006-retrieval.md)
  - [ADR-0007 Import/export contracts](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc draws the line around v1: what CAW-02 **does** build, what it **deliberately does not**, and where its
responsibilities **hand off** to the sibling products (CAW-01/05/03/04). It does not justify the architecture
(see the ADRs) or restate the vision (see [vision.md](./vision.md)). When in doubt, the
[PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF.md) wins.

## 1. In scope (v1)

| Area | In scope for v1 | Reference |
|------|-----------------|-----------|
| Knowledge transaction | The core loop `add-source → extract-claim → attach-evidence → synthesize-note (cited)` | [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md) |
| Entity set | `Source, Claim, Evidence, Note, Concept, Interest, OpenQuestion, Decision, Assumption` + imported refs `Trace, SimulationRun, Experiment` + intake `RelatedWork, RadarSignal` | [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md) |
| Invariant | `Claim → ≥1 Evidence`, enforced in three lockstep layers (schema, core validator, reindex re-check) | [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md) |
| Writes | Append-only + *supersedes*; confirmation-by-default for agent writes; append-only event log + git audit | [ADR-0002](../01-decisions/ADR-0002-storage.md) |
| Surfaces | Typed **API**, **MCP** server, **CLI** — thin adapters codegen'd from one op manifest | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) |
| Skill-wrap | Safe agent interface with the structural **evidence gate** | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) |
| Provenance & trust | PROV-shaped two-layer model; trust ladder T0–T3 + contested; AI-authored capped at T2 | [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) |
| Boundaries | Two orthogonal axes — `boundary {public,internal,confidential}` + `visibility {team,private}` — with monotone propagation | [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) |
| Retrieval | SQLite **FTS5 (BM25)**; first-class structured filters (boundary, visibility, type, trust, concept) applied before ranking; citation-constrained RAG | [ADR-0006](../01-decisions/ADR-0006-retrieval.md) |
| Signal intake | Import CAW-05 radar / related-work signals → typed nodes (classified, not loose summaries) | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) |
| Evidence import | Import CAW-01 simulation projections/evidence → `Evidence` (quarantine + confidentiality check) | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) |
| Bundle export | Export cited `Claim`+`Evidence` bundles to CAW-03 (signed, fail-closed allow-list) | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) |
| Decisions/questions | Record `Decision` / `OpenQuestion` / `Assumption`, linked to evidence | [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md) |
| Optional viewer | A minimal **read-only** knowledge viewer (browse + walk chains) | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) |

## 2. Non-goals (v1)
These are intentional exclusions. Each names *why* and *where the capability lives instead*.

| Non-goal | Why excluded from v1 | Where it lives / revisit |
|----------|----------------------|--------------------------|
| **Continual learning / autonomous self-editing** of knowledge | v0 is append + retrieve + skill-wrap; integrity first | Future phase; schema kept upgrade-ready ([ADR-0002](../01-decisions/ADR-0002-storage.md)) |
| **Heavyweight graph database** (Neo4j etc.) | Generic typed-edge table is graph-upgrade-ready without it | Future Postgres/Apache-AGE swap = engine/query change, not data rewrite ([ADR-0002](../01-decisions/ADR-0002-storage.md), [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)) |
| **Embeddings / vector search** | No measured recall/precision trigger yet; FTS5 first | Vector sidecar schema *reserved*; add sqlite-vec/pgvector on trigger ([ADR-0006](../01-decisions/ADR-0006-retrieval.md)) |
| **Rich editing UI** | Editing happens through surfaces/skill-wrap, not a GUI | Out of scope; only read-only viewer in v1 ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)) |
| **Public knowledge website** | A distinct product | **CAW-04**, a separate product |
| **Running simulations** | CAW-02 only catalogs their exports | **CAW-01**, a separate product (import boundary) |
| **Running radar / signal collection** | CAW-02 only ingests classified signals | **CAW-05**, a separate product (import boundary) |
| **Paper/patent drafting** | CAW-02 only exports cited bundles | **CAW-03**, a separate product (export boundary) |
| **Multi-tenant / org-scale access control** | Beyond team-vs-private is unneeded for v1 | Only `visibility {team,private}` in v1 |
| **In-place update / delete** | Breaks reconstructability | Append-only + *supersedes* only ([ADR-0002](../01-decisions/ADR-0002-storage.md)) |
| **Silent agent auto-accept** | Provenance corruption risk | Reviewed-by-default; rejected candidates retained for audit ([ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md)) |
| **Shared substrate** with sibling products | Independence contract | Each product owns its core/data/deploy; only file/API boundaries |

## 3. Import/export boundaries (independent products)
All cross-product interaction is an explicit **file/API boundary** — there is **no shared store, registry, or
substrate**. Every crossing performs **re-redaction** and a boundary re-check; bundles are **signed**; provenance
manifests travel both ways. Export is **fail-closed** (allow-list); import is **quarantine-on-arrival**.

```
              ┌─────────────┐   simulation projections / evidence (import)
   CAW-01 ───►│             │   → Evidence (quarantine + confidentiality check)
   (sims)     │             │
              │   CAW-02    │   radar / related-work signals (import)
   CAW-05 ───►│  knowledge  │   → Source / Claim / OpenQuestion / RelatedWork / RadarSignal
   (radar)    │  repository │
              │             │   cited Claim + Evidence bundle (export, signed, allow-list)
              │             ├──► CAW-03 (paper / patent drafting)
              └─────────────┘
```

| Peer product | Direction | Payload | Integrity rule at the boundary |
|--------------|-----------|---------|--------------------------------|
| CAW-01 (sims) | import | simulation projections/evidence | quarantine; confidentiality check; map to `Evidence` (never executed here) |
| CAW-05 (radar) | import | radar / related-work signals | classify threat/support; map to typed nodes; never loose summaries |
| CAW-03 (drafting) | export | cited `Claim`+`Evidence` bundles | fail-closed allow-list; re-redaction; signed; provenance manifest |
| CAW-04 (website) | none in v1 | — | CAW-04 is a separate product; not a CAW-02 surface |

Details and envelope format: [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) and
[02-research/import-export-boundaries.md](../02-research/import-export-boundaries.md).

## 4. Boundary cases (decisions, not omissions)
- **Generated summary as evidence** — *forbidden, structurally.* `attach_evidence` has no prose field; a Note can
  never be Evidence ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)).
- **Confidential in public export** — *cannot happen.* Fail-closed allow-list + monotone boundary propagation.
- **AI claiming high trust** — *capped.* AI-authored content is capped at T2 in the trust ladder.
- **Editing past knowledge** — *not edit; supersede.* History stays intact for audit.

## Open questions
See [08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO: create). Open here:
the concrete trigger thresholds for adding embeddings; whether the read-only viewer is in the v1 cut or deferred.

## Implications for runbooks
- Runbooks must not scaffold any non-goal (no vector store, no graph DB, no editing UI) in v1.
- Import/export runbooks must implement quarantine (in) and fail-closed allow-list (out) before any data mapping.
- The viewer, if built, is read-only and consumes the derived index — it writes nothing.

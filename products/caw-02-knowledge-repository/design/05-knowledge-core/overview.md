# Knowledge Core — Overview

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./entity-and-edge-model.md](./entity-and-edge-model.md)
  - [./claim-evidence-and-evidence-gate.md](./claim-evidence-and-evidence-gate.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes **what the knowledge core *is*** for CAW-02 — the single transactional component that owns every
write rule of the product — and **how its pieces relate**. It is the map for the `05-knowledge-core/` folder: it does
NOT re-derive the entity/edge vocabulary (see [entity-and-edge-model.md](./entity-and-edge-model.md)) or the invariant
enforcement detail (see [claim-evidence-and-evidence-gate.md](./claim-evidence-and-evidence-gate.md)), and it does NOT
decide storage layout (ADR-0002), retrieval (ADR-0006), or import/export wire formats (ADR-0007). Those are siblings the
core *uses* or *is consumed by*.

## 1. What the core is (one sentence)
The knowledge core is the **ONE transactional product core** (per [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md))
that owns ALL logic — validation, the evidence gate, trust recompute, boundary propagation, and the append-only audit —
so that the API, MCP server, and CLI can be **thin adapters** that add no rules of their own.

```
              ┌──────────── thin adapters (codegen'd from one op manifest) ────────────┐
   humans →   │   CLI            API (typed)            MCP server         (read-only viewer)
   agents →   └───────────────────────────────┬──────────────────────────────────────────┘
                                               │  one op manifest (the only way in)
                                  ┌────────────▼─────────────┐
                                  │      KNOWLEDGE CORE       │   ← everything below lives here
                                  │  • op manifest + skill-wrap│
                                  │  • input schemas (gate L1) │
                                  │  • transaction validator   │  (gate L2)
                                  │  • trust recompute          │
                                  │  • boundary propagation     │
                                  │  • append-only audit emit   │
                                  └────────────┬─────────────┘
                                               │ append-only writes (+ supersedes)
                       ┌───────────────────────┼───────────────────────────┐
            knowledge/**/*.md (SOT)   knowledge/_events/*.jsonl     git history (signed)
                       │  reindex (idempotent, gate L3 re-check)
                  SQLite index (derived, disposable: nodes, edges, FTS5)
```

## 2. The pieces and how they relate
| Piece | Responsibility | Owned by | Lives in |
|---|---|---|---|
| **Op manifest** | The single declarative list of write/read operations (`add_source`, `extract_claim`, `attach_evidence`, `synthesize_note`, `classify_signal`, `retrieve`, …). Adapters are codegen'd from it; nothing is added in an adapter. | ADR-0001 | core |
| **Skill-wrap** | The safe agent interface: each op is a vetted transaction; confirmation-by-default for agent writes. | ADR-0001, brief §5 | core |
| **Input schemas (gate layer 1)** | Per-op typed inputs; structurally bar prose-as-evidence (no prose field on `attach_evidence`). | [evidence-gate doc](./claim-evidence-and-evidence-gate.md) | core |
| **Entity + edge model** | The typed nodes and the typed relation vocabulary. | [entity-and-edge-model.md](./entity-and-edge-model.md), ADR-0003 | core + frontmatter |
| **Transaction validator (gate layer 2)** | Pre-commit checks: Claim→Evidence invariant, no Note-as-evidence, edge endpoint legality; aborts whole txn on failure. | [evidence-gate doc](./claim-evidence-and-evidence-gate.md) | core |
| **Trust recompute** | Derives `trust` (T0–T3 / contested) from the edge graph on every edge change; caller value ignored. | ADR-0004 | core |
| **Boundary propagation** | Computes monotone `boundary` + `visibility` over provenance ancestors; synthesis never downgrades. | ADR-0004 | core |
| **Audit emit** | Mirrors every skill-wrap write to `knowledge/_events/<ts>-<op>.jsonl` + one `provenance_event`; git commit is the tamper-evident record. | ADR-0002, ADR-0004 | core |
| **Reindex (gate layer 3)** | Deterministic, idempotent rebuild of the derived index from `knowledge/**`; re-runs the invariant and fails loud. | ADR-0002 | core (batch) |

The throughline: **a write enters via exactly one op; the core validates, propagates, derives trust, writes the .md +
event, and only then is the change real.** No surface and no DB constraint substitutes for the core.

## 3. Folder index / map (`05-knowledge-core/`)
| File | What it covers | Read it when… |
|---|---|---|
| [overview.md](./overview.md) (this) | What the core is; how pieces relate; folder map. | Onboarding; locating the right deep-dive. |
| [entity-and-edge-model.md](./entity-and-edge-model.md) | The typed entity set and the typed edge vocabulary (`evidence_for`, `challenges`, `extracted_from`, `cites`, `derived_from`, `about_concept`, `addresses`, `relates_to`, `supports`, `refutes`, `supersedes`, `attributed_to`); graph-upgrade readiness. | Modeling a new entity/relation; planning the graph upgrade. |
| [claim-evidence-and-evidence-gate.md](./claim-evidence-and-evidence-gate.md) | THE Claim→Evidence invariant and the structural evidence gate; the 3-layer enforcement; error taxonomy; negative tests. | Implementing/auditing the gate; writing the invariant runbook. |

## 4. What the core deliberately does NOT do
| Not in the core | Where it lives | Why |
|---|---|---|
| Physical file layout, SQLite schema DDL, FTS/vector migrations | [ADR-0002](../01-decisions/ADR-0002-storage.md), `04-data-layer/` | Storage is derived/disposable; the core is engine-agnostic. |
| Adapter ergonomics (CLI flags, MCP tool descriptions, HTTP routes) | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md), `06-interfaces/`, `07-backend-api/` | Adapters are thin and codegen'd; they add no rules. |
| Ingestion stage mechanics (parse → extract → attach → synthesize → classify) | [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md) | The pipeline *calls* core ops; the core enforces invariants per call. |
| Ranking/RAG | [ADR-0006](../01-decisions/ADR-0006-retrieval.md) | Retrieval reads the index; writes never depend on it. |
| Cross-product wire schemas + redaction | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) | File/API boundaries between INDEPENDENT products; no shared store. |
| Running simulations / collecting radar | CAW-01 / CAW-05 (separate products) | CAW-02 only *catalogs* their exports as references. |

## 5. The core's invariants (the non-negotiables it enforces)
1. **Claim→Evidence.** Every promotable `Claim` has ≥1 `evidence_for` edge from an `Evidence` that itself `extracted_from`
   a concrete artifact — never prose, never a `Note`. (Full detail: [claim-evidence-and-evidence-gate.md](./claim-evidence-and-evidence-gate.md).)
2. **Generated synthesis ≠ evidence.** `Note` carries `generated=true` and is structurally barred from being the source
   of an evidence edge.
3. **Append-only + supersedes.** No update/delete; corrections are new versions linked by `supersedes`.
4. **Derived trust & boundary.** `trust` and `boundary`/`visibility` are computed, never caller-set; synthesis never
   downgrades sensitivity (per [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)).
5. **Every write is audited.** One `provenance_event` + one `_events` line + one git commit per transaction.
6. **One enforcement, many engines.** The same checks run identically across CLI/API/MCP and across SQLite/(future)
   Postgres — they live in the core, not in DB constraints.

## 6. Reconstructability (the property the core guarantees)
Given any `Note`, the core can replay how it was reached as a fixed traversal — the chain below — plus the per-hop
`provenance_event` recording *who/what/when*:
```
note --cites--> claim --evidence_for(in)-- evidence --extracted_from--> source | trace | simulation_run | experiment
```
Nothing downstream may exist without pointing back one layer. This is what makes v0 a trustworthy *append + retrieve*
store and keeps the door open to a later graph / continual-learning upgrade without a data rewrite.

## Open Questions
- TODO(open-question: whether the read-only viewer is in-scope for v0 or deferred — see brief §4 "optional").
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (core skeleton):** scaffold the op manifest + skill-wrap; adapters are codegen targets, not hand-written rule sites.
- **RB (gate + trust + boundary):** implement validator, trust recompute, and boundary propagation as core services
  invoked by every write op; see the sibling deep-dives for the exact checks.
- **RB (audit):** every op emits one `provenance_event` + one `_events/*.jsonl` line within the same transaction.
- **RB (model docs):** generate `GLOSSARY.md` from [entity-and-edge-model.md](./entity-and-edge-model.md) so terms match.

# System Architecture — containers and one-way dependencies

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./component-boundaries.md](./component-boundaries.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describe the **runtime containers** of CAW-02 — the standalone Team/Personal Knowledge Repository — how they
fit together, and the **one-way dependency rule** that keeps all provenance/trust/boundary logic in exactly one
place. This is the C4-"container" view: what processes/modules exist and how data flows. It does NOT define
module signatures (see [component-boundaries.md](./component-boundaries.md)), storage layout (see
[ADR-0002](../01-decisions/ADR-0002-storage.md)), the data model (see
[ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)), or wire formats (see
[ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)). CAW-01/03/05 appear only as **import/export
boundaries** of separate, independent products — never as shared substrate.

## Containers at a glance
| # | Container | Responsibility | Owns logic? | Talks to |
|---|---|---|---|---|
| C1 | **Thin adapters** (API / MCP / CLI) | Translate transport ↔ core typed ops; nothing else | No (codegen'd) | C2 only |
| C2 | **Product core** (transactional) | Validation, evidence gate, trust recompute, boundary propagation, append-only audit; the single chokepoint | **Yes — all of it** | C3, C4 |
| C3 | **md-git store** | Markdown files = single source of truth; `_events` JSONL; git history | No (passive data) | — |
| C4 | **Derived SQLite index** | Disposable query/FTS index; rebuilt from C3 by reindex | No (derived) | rebuilt from C3 |
| C5 | **Reindex** | Deterministic, idempotent rebuild of C4 from C3 + invariant re-check | Re-checks (does not author) | reads C3, writes C4 |
| C6 | **Importers / Exporters** | Cross-product boundary crossings with re-redaction + allow-list | No — call C2 ops | C2 only; files to/from CAW-0x |
| C7 | **Read-only viewer** (optional) | Browse nodes/links + trust/boundary badges; no write path | No | C2 read path only |

The product ships as **one deployable unit** (a binary + a git repo): no server is required at v0
(ADR-0002 "v0 choice").

## Container diagram (ASCII)
```
                        WRITERS                                  READERS
        agent ─MCP─┐    human ─CLI─┐   CAW-0x ─API─┐        human ─▶ C7 viewer (read-only)
                   │              │                │                       │
                   ▼              ▼                ▼                       │ (boundary-filtered
              ┌─────────────────────────────────────────┐                 │  read path only)
   C6 import ▶│  C1  THIN ADAPTERS  (API · MCP · CLI)    │◀────────────────┘
   /export ──▶│  codegen'd from ONE op manifest          │
   (files     └───────────────────┬─────────────────────┘
    to/from                       │  typed ops {op, payload, idempotency_key}
    CAW-01/                       ▼
    03/05)            ┌──────────────────────────────────────────────┐
                      │  C2  PRODUCT CORE  (single transactional      │
                      │      chokepoint — owns ALL logic)             │
                      │  ┌────────┬─────────┬───────────┬──────────┐  │
                      │  │ Ingest │Provenance│ Boundary  │  Audit   │  │
                      │  │        │ /Trust   │           │(append-  │  │
                      │  │Retrieve│ (gate)   │ImportExp. │ only)    │  │
                      │  └────────┴─────────┴───────────┴──────────┘  │
                      └───────┬───────────────────────────┬──────────┘
                              │ file-first write           │ query / hydrate
                              ▼                            ▼
                ┌───────────────────────────┐   ┌──────────────────────────┐
                │  C3  md-git STORE (SoT)    │   │  C4  SQLite INDEX        │
                │  knowledge/<kind>/*.md     │   │  node · edge · event     │
                │  knowledge/_events/*.jsonl │   │  + FTS (droppable)       │
                │  git history (signed)      │◀──│  + vector (reserved)     │
                └───────────────────────────┘   └──────────────────────────┘
                              ▲   rebuild (drop & recreate)   ▲
                              └──────────── C5  REINDEX ──────┘
                                   (deterministic, idempotent,
                                    re-runs Claim→Evidence invariant)
```

## The one-way dependency rule
**Dependencies point inward toward the core; the core depends only on the store. Nothing depends on an adapter.**

```
C1 adapters ─▶ C2 core ─▶ C3 store (SoT)
C6 imp/exp  ─▶ C2 core            ▲
C7 viewer   ─▶ C2 core (reads)    │ C4 index is DERIVED from C3 (one-way, via C5)
```

Concrete constraints (each is an acceptance check for runbooks):
1. **Adapters add nothing.** C1 contains only transport mapping; every guardrail (evidence gate, append-only,
   boundary-no-downgrade) lives in C2. A new surface inherits all rules for free (ADR-0001 §1, §3).
2. **All writes go through C2.** Importers/exporters (C6) and the CLI do **not** touch C3/C4 directly; they call
   C2 typed ops. The only legitimate non-core writer of C4 is **reindex (C5)**, which authors nothing — it
   re-derives (ADR-0002 §2).
3. **C3 is canonical; C4 is disposable.** C4 can be deleted and rebuilt at any time without data loss. A
   `content_hash` mismatch on read means C4 is stale ⇒ rebuild; never silently trust a row (ADR-0002 §2).
4. **No cycles.** The core never calls an adapter; the store never calls the core; the viewer never writes.
5. **No shared substrate.** C6 is the *only* place other products are referenced, and only as files/typed-API
   boundaries (ADR-0007). There is no shared DB/registry/runtime with CAW-01/03/05 (brief §1, §7).

## Data flow — the core write transaction
Every skill-wrap write (e.g. `attach_evidence`) is **one transaction** through C2, in fixed order
(ADR-0002 §6):
```
1. adapter (C1) decodes transport → {op, payload, idempotency_key}
2. core (C2) validates payload schema (codegen'd from op manifest)
3. core runs guardrails:  evidence gate · boundary propagation (monotone) · trust recompute
4. write FILE first        → C3  knowledge/<kind>/<id>.md   (frontmatter + body)
5. mirror to index         → C4  node/edge/event rows
6. append event            → C3  knowledge/_events/<ts>-<op>.jsonl  + hash-chained audit
7. re-check Claim→Evidence invariant (validator layer 2, ADR-0003)
8. commit (git) ; on ANY failure → ABORT whole txn, no orphan file/row
9. return typed envelope { ok, result?, error?, txn_id, audit_id }
```

## Data flow — read / retrieve
```
caller ─▶ C1 (kr.search/get) ─▶ C2 Retrieve
   apply STRUCTURED FILTERS first (boundary, visibility, type, trust, concept)  [ADR-0006]
   ─▶ rank via C4 FTS5 (BM25)
   ─▶ hydrate provenance chain from C4 edges (Source→Claim→Evidence→Note)
   ─▶ boundary/visibility filter on the hydrated result
   ─▶ return RetrievalHit envelope (item + chain + trust + boundary), never an opaque blob
```
RAG/generation is an opt-in layer over an already-trustworthy result set; any kept synthesis is stored as a
cited `Note`, never as `Evidence` (ADR-0001 §7, ADR-0006).

## Cross-product boundaries (C6 only)
| Direction | Other product (independent) | Crossing | Lands as | Guardrail |
|---|---|---|---|---|
| Import | **CAW-01** simulation projections/traces | versioned envelope (files) | `Evidence`/`Source`/`Trace`/`SimulationRun` | quarantine + confidentiality check on import |
| Import | **CAW-05** radar / related-work signals | versioned envelope (files) | `Source`/`Claim`/`OpenQuestion`/`RelatedWork`/`RadarSignal` | quarantine; classify, never loose summary |
| Export | **CAW-03** paper/patent drafting | signed cited bundle | cited `Claim`+`Evidence` bundle | **fail-closed allow-list** + re-redaction |

All crossings carry a **provenance manifest** and **re-redact at every crossing** (ADR-0007). Large artifacts
are referenced by `artifact_uri`, never inlined (ADR-0002 §7).

## Deployment view (v0)
| Aspect | v0 | Upgrade trigger (ADR-0002) |
|---|---|---|
| Process | one binary + local git repo | — |
| Index | single local SQLite file | concurrent team writers / index contention → Postgres |
| Retrieval | SQLite FTS5 (BM25) | measured recall/precision fire → sqlite-vec sidecar |
| Graph | recursive CTE over `edge` | traversal depth/perf → Apache AGE on Postgres |
| Concurrency | single-writer index lock + git PR/merge | → serialized write-through API on Postgres port |

Files stay canonical at every upgrade step; each new engine (Postgres, FTS, vector, AGE) is **just another
derived index** behind C2 — not a data rewrite (ADR-0002 consequences).

## Open Questions
- `TODO(open-question: API auth model between independent products — static token vs mTLS vs signed-URL drop; owned with ADR-0007.)`
- `TODO(open-question: team write-concurrency — git PR/merge vs serialized write-through; this is the Postgres-port trigger, ADR-0002.)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- Build **C2 core + audit + guardrails first**, then **C5 reindex**, then the **op manifest + codegen** of C1,
  then C6 importers/exporters, then C7 viewer last (read-only) — matching ADR-0001's build order.
- Add an acceptance check that **no adapter, importer, or viewer writes C3/C4 directly** (one-way rule).
- Add an acceptance check that **deleting C4 and rerunning C5 yields byte-identical query results**.

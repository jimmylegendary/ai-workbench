# Retrieval Service — FTS + Filters + Provenance Hydration + Citation Assembly

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface.md](./api-surface.md)
  - [./persistence-and-index.md](./persistence-and-index.md)
  - [./ingestion-service.md](./ingestion-service.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describe the **service behind `RetrieveService`** ([api-surface.md](./api-surface.md)): how a query becomes a
boundary-safe, provenance-carrying result. It elaborates ADR-0006 — FTS5/BM25 text retrieval, first-class
structured filters applied **before** ranking, edge-traversal chain hydration, and citation-constrained synthesis.
It does NOT decide the storage substrate (ADR-0002 / [persistence-and-index.md](./persistence-and-index.md)) or the
trust/boundary vocabulary (ADR-0004). **No embeddings in v0** — the vector path is reserved, not built.

## Pipeline overview

```
query ──▶ (1) parse + filter plan
       ──▶ (2) BOUNDARY/SCOPE gate  ── pre-ranking, in SQL WHERE  (never after)
       ──▶ (3) FTS5 BM25 rank over the filtered candidate set
       ──▶ (4) chain hydration via edge traversal (Source→Claim→Evidence→Note)
       ──▶ (5) RetrievalHit envelope (item + chain + trust + boundary + locator + score)
       ──▶ (6 opt) citation-constrained synthesis (answer)  → cited Note if persisted
```

The ordering is load-bearing: **the boundary/scope filter runs before ranking and before assembly** so a
confidential or `private` item is never even scored for a viewer who may not see it (ADR-0006 §2, brief §6/§10).

## Stage 1 — query + filter plan

```ts
type SearchInput = {
  q: string
  filters?: {
    boundary?: Boundary[]; scope?: Scope[]
    kind?: Kind[]; trust?: Trust[]; concept?: Id[]; interest?: Id[]
  }
  limit?: number                     // default TODO(open-question: page size)
  viewer: { actor: Actor; max_boundary: Boundary; scope: Scope }
}
```

`viewer.max_boundary`/`viewer.scope` are **authority**, not preference: they cap what the gate will return,
independent of `filters` (which only narrow within what the viewer may already see).

## Stage 2 — boundary/scope gate (pre-ranking)

All filters compile to a single SQL `WHERE` over the relational index columns (ADR-0002 core `node` table:
`boundary`, `visibility`, `kind`, `trust`). The viewer gate is **always** ANDed in and cannot be widened by the
caller:

```sql
WHERE node.boundary <= :viewer_max_boundary          -- public<internal<confidential ordering
  AND (node.visibility = 'team' OR node.owner = :viewer)   -- private only to owner
  AND (:kind IS NULL OR node.kind IN (:kind))
  AND (:trust IS NULL OR node.trust IN (:trust))
  -- concept/interest via edge join (rel='about')
```

Boundary here is the **effective** boundary computed by `BoundaryService` (monotone propagation, ADR-0004), not
just the row's own flag — a Note inherits the strictest boundary of what it cites. `jimmy-private` items never
appear for a team viewer.

## Stage 3 — FTS5 BM25 ranking

Text retrieval is **SQLite FTS5 (BM25)** in a separate droppable migration co-located with the relational index
(ADR-0006 §1, ADR-0002 §3). Ranking is over the already-filtered candidate set:

```sql
SELECT node.id, bm25(fts) AS fts_rank
FROM fts JOIN node ON node.rowid = fts.rowid
WHERE fts MATCH :q AND <boundary/scope/filter predicate>
ORDER BY fts_rank
LIMIT :limit;
```

Ranking is **deterministic and inspectable** — the `score` is returned on every hit. FTS quality investments
(tokenization, synonym lists, `Concept`/`Interest` tags as "poor-man's semantics") substitute for embeddings until
a measured trigger fires (ADR-0006 triggers A–D). The reserved `node_vec` sidecar is unused in v0; adding
`sqlite-vec`/`pgvector` later is additive behind this same `search()` (no rewrite).

## Stage 4 — provenance/chain hydration (always on)

Text retrieval finds the **seed**; edge traversal makes it an answer. For each surviving hit, the service walks the
typed `edge` table (recursive CTE on SQLite; openCypher after an Apache AGE port — same edges, ADR-0002) to hydrate
the `Source → Claim → Evidence → Note` chain, carrying `trust` and `boundary` on each link. Hydration **re-applies
the viewer gate**: a chain link the viewer may not see is dropped, never returned as a dangling reference.

```sql
WITH RECURSIVE chain(id, kind, rel, depth) AS (
  SELECT :seed_id, kind, NULL, 0 FROM node WHERE id = :seed_id
  UNION ALL
  SELECT e.dst_id, n.kind, e.rel, c.depth+1
  FROM chain c JOIN edge e ON e.src_id = c.id JOIN node n ON n.id = e.dst_id
  WHERE c.depth < :max_depth AND n.boundary <= :viewer_max_boundary
)
SELECT * FROM chain;
```

## Stage 5 — RetrievalHit envelope

The result is the structured envelope of ADR-0006 §4 — **never a bare string**:

```ts
type RetrievalHit = {
  item:     { id: Id; kind: Kind; title?: string; text?: string }
  chain:    { id: Id; kind: Kind; rel?: Rel }[]   // hydrated Source→Claim→Evidence→Note
  trust:    Trust                                  // carried from index, not inferred at query time
  boundary: Boundary                               // effective; enforced pre-return
  scope:    Scope
  locator:  { source_uri: string; location?: string }   // where evidence physically lives
  score:    { fts_rank: number; vector_sim?: number; rerank?: number }
}
```

`get(id)` returns a single fully-hydrated hit. The viewer (read-only surface) renders Claim↔Evidence links and
trust/boundary badges from this envelope (ADR-0001 §7).

## Stage 6 — citation-constrained synthesis (`answer`, opt-in)

Default behavior is **retrieval-only** (return ranked claims+evidence, no generation). When generation is opted in
(`RetrieveService.answer`), RAG is provenance retrieval + citation-constrained synthesis (ADR-0006 §5):

1. boundary/scope gate runs first (never after generation);
2. every synthesized claim must `cites` ≥1 retrieved unit by `Id`; an **uncited claim is rejected or flagged
   `unsupported`**, never returned as fact;
3. output is structured, not prose:

```ts
type AnswerResult = {
  answer_claims: { text: string; cites: Id[] }[]
  evidence:      { id: Id; source: string; boundary: Boundary; trust: Trust; locator: string }[]
  unsupported:   { text: string }[]
  note_id?: Id   // present only if persist_as_note:true
}
```

4. a **kept** synthesis is persisted as a cited `Note` with `generated=true` via `IngestService.synthesize_note`
   ([ingestion-service.md](./ingestion-service.md)) — **never as `Evidence`** (the evidence gate). This is the only
   write the retrieval path can cause, and it routes through the ingest evidence gate like any other write.

## Boundary & failure guarantees

| Guarantee | Mechanism |
|---|---|
| No confidential leak | viewer gate in SQL `WHERE`, pre-ranking + re-applied in hydration |
| No private leak to team | `visibility='private'` rows excluded unless `owner == viewer` |
| Summary ≠ evidence | `generated`/`evidence=false` Notes never returned as Evidence; `answer` persists keepers as Notes only |
| Stale index safety | `content_hash` mismatch on a hydrated row ⇒ treat index as stale ⇒ rebuild (ADR-0002 §2); never silently trust |
| Inspectable ranking | `score` returned on every hit |

## Open Questions
- `TODO(open-question: default/max page size and pagination cursor shape)`
- `TODO(open-question: chunking unit — whole Claim/Note rows vs sub-chunked long Sources; anchor storage — ADR-0006)`
- `TODO(open-question: grounding/entailment check engine for synthesis claims in v0 vs v1 — ADR-0006)`
- `TODO(open-question: embedding model & locality when triggers A–D fire — ADR-0006)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (data-layer):** FTS5 virtual table + filter columns + reserved nullable `node_vec` sidecar (unused v0).
- **RB (retrieval service):** `search()`/`get()` returning `RetrievalHit`; boundary/scope filter before assembly;
  recursive-CTE chain hydration that re-applies the viewer gate.
- **RB (RAG/synthesis):** `answer()` citation-constrained `{answer_claims, evidence, unsupported}`; reject/flag
  uncited claims; persist keepers as cited `Note`s via the ingest evidence gate, never `Evidence`.
- **RB (interfaces):** API/MCP/CLI return the envelope; viewer renders claim↔evidence + trust/boundary badges.

# Retrieval (knowledge-core)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md) (the decision this elaborates)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md) (md SoT + SQLite index + droppable FTS migration)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md) (boundary/visibility/trust enforced here)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md) (edges traversed for hydration)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) (one core; thin adapters)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md) (fail-closed export allow-list)
  - [../02-research/retrieval-and-rag.md](../02-research/retrieval-and-rag.md) (research backing)
  - [./ingestion-pipeline.md](./ingestion-pipeline.md) (produces what this retrieves; B2 calls `search()`)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies, in build-ready depth, CAW-02's **v0 retrieval** as decided in
[ADR-0006](../01-decisions/ADR-0006-retrieval.md): **SQLite FTS5 (BM25)** text retrieval, **first-class structured
filters applied before ranking**, **provenance-chain hydration** of every hit, **citation-constrained RAG**, and
the **reserved vector sidecar** with the measured triggers that add embeddings. It does NOT re-decide the storage
substrate ([ADR-0002](../01-decisions/ADR-0002-storage.md)), the trust/boundary model
([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)), or the import/export contracts
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)) — those are consumed.

## Constraints that shape retrieval (from the brief)
- **Provenance is the product.** A hit must carry its chain (`Source → Claim → Evidence → Note`); a result without
  provenance is a defect (brief §2, §5).
- **Generated summaries are NOT evidence** (brief §10). Any synthesis keeps generated text structurally separate
  from cited `Evidence` and forces citations.
- **Boundary-aware.** Filter `boundary` + `visibility` (team/private) **before** anything leaves the store
  (brief §6, §10; [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)).
- **Single-curator scale.** Hundreds→low-thousands of items — this dominates the "embeddings worth it?" question.
- **Independent, in-process, portable.** One deployable unit; keep SQLite↔Postgres open
  ([ADR-0002](../01-decisions/ADR-0002-storage.md)).

## Engine decision (v0)
1. **Text retrieval = SQLite FTS5 (BM25)**, co-located with the relational index
   ([ADR-0002](../01-decisions/ADR-0002-storage.md)); Postgres `tsvector`/GIN if/when storage ports to Postgres.
   FTS lives in a **separate droppable migration** so it never threatens portability and can be rebuilt by the
   deterministic reindex.
2. **Structured filters are first-class and applied before ranking** — pure SQL `WHERE`.
3. **Graph/link traversal is always on** — it hydrates the provenance chain that makes a hit an answer.
4. **Embeddings are deferred** — a nullable `node_vec` sidecar is reserved (additive, no rewrite).

| Family | Verdict | Why |
|---|---|---|
| **FTS5 / BM25** | **Chosen v0** | Zero embedding cost; exact identifier/jargon recall; deterministic, inspectable; trivially boundary-filterable in SQL; same file as the index |
| Vector (`sqlite-vec` / pgvector) | Deferred, additive | Finds paraphrase; but model dependency, opaque ranking, re-embed on edits, weak on identifiers |
| Hybrid (FTS + vector via RRF) | v1 target | Best recall, after embeddings exist |
| Graph traversal | Always-on companion | Hydrates the chain; not a discovery seed alone |
| `sqlite-vss` (Faiss) / LanceDB | Avoid / reconsider | Deprecated; or overkill at v0 scale |

## Structured filters BEFORE ranking
The boundary/scope filter runs **before** results are assembled, so confidential or private items cannot leak —
boundary enforcement is in pure SQL, not a post-generation step. First-class filter columns mirrored from the md
frontmatter into the index:

| Filter | Type | Source | Purpose |
|---|---|---|---|
| `boundary` | `public \| internal \| confidential` | frontmatter | **leak prevention** — enforced pre-return |
| `visibility` | `team \| private` | frontmatter | team vs Jimmy-private separation |
| `kind` | entity type | frontmatter | `Source/Claim/Evidence/Note/Concept/...` |
| `trust` | `T0..T3 \| contested` | derived ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)) | quality floor; carried, not inferred at query time |
| `concept` / `interest` | tag/edge | edges | topical scope ("poor-man's semantics") |
| `status` | `proposed \| accepted \| ...` | frontmatter | exclude un-reviewed candidates by default |

```sql
-- shape (illustrative): filters constrain the candidate set BEFORE BM25 ranks it
SELECT n.id, n.kind, bm25(fts) AS fts_rank, n.trust, n.boundary, n.visibility
FROM fts
JOIN nodes n ON n.rowid = fts.rowid
WHERE fts MATCH :query
  AND n.boundary IN (:allowed_boundaries)   -- leak prevention, pre-rank
  AND n.visibility IN (:allowed_scopes)
  AND (:kind     IS NULL OR n.kind   = :kind)
  AND (:min_trust IS NULL OR n.trust >= :min_trust)
ORDER BY fts_rank
LIMIT :k;
```

## Provenance-chain hydration
Text retrieval finds the **seed**; edge traversal ([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)
generic typed edge table) **hydrates** the `Source→Claim→Evidence→Note` chain with `trust` and `boundary` attached.
Every result is a structured envelope, never a string:

```text
RetrievalHit {
  item:     { id, kind: Source|Claim|Evidence|Note|..., text/title }
  chain:    [ Source -> Claim -> Evidence -> Note ]   # hydrated via edge traversal
  trust:    <T0..T3 | contested>                       # carried from the item, not inferred at query time
  boundary: public | internal | confidential           # enforced pre-return
  scope:    team | private
  locator:  { source_uri, location }                   # where evidence physically lives (path/URI)
  score:    { fts_rank, (vector_sim), (rerank) }        # ranking is inspectable
}
```
Hydration walks `evidence_for` / `extracted_from` / `cites` / `about_concept` edges. **Boundary is re-checked on
every hydrated node** — a chain may not surface a `confidential` evidence node into a `public`-scoped query even if
the seed was permissible.

## Citation-constrained RAG (not chat-over-docs)
RAG here = **provenance retrieval + citation-constrained synthesis**. The default response can **skip generation**
and return ranked claims+evidence; generation is an opt-in convenience over an already-trustworthy result set.

When generation is opted in:
1. **Boundary filter first** — never after generation.
2. **Retrieve provenance-carrying units**, not opaque chunks (a `Claim`/`Evidence`/`Note` row carrying its parent
   IDs + `boundary` + `trust` + `locator`).
3. **Every synthesized sentence/claim must cite ≥1 retrieved unit by ID.** An uncited claim is **rejected or
   flagged `unsupported`**, never returned as fact.
4. **Structured output**, never prose-only:
   ```text
   {
     answer_claims: [ { text, cites: [evidence_id, ...] } ],
     evidence:      [ { id, source, boundary, trust, locator } ],
     unsupported:   [ { text } ]   # surfaced, never asserted as fact
   }
   ```
5. **Grounding check** (optional v0, recommended v1): decompose the answer into atomic claims, verify each is
   entailed by its cited evidence; surface a grounding score
   (`TODO(open-question: grounding-check engine — v0 vs v1; LLM cost/boundary)`).
6. **A kept synthesis is stored as a cited `Note`** (`generated: true`), **never** as `Evidence`
   ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) evidence gate;
   [./ingestion-pipeline.md](./ingestion-pipeline.md) A5).

Export of a cited bundle to CAW-03 (a separate product) goes through the **fail-closed export allow-list**
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)) — retrieval's boundary filter is the first gate,
the export allow-list is the second.

## Reserved vector sidecar + trigger to add embeddings
The schema reserves a **nullable `node_vec` sidecar** (a separate droppable migration, like FTS) so adding
`sqlite-vec` (SQLite) or `pgvector` (Postgres) is **additive, not a rewrite** (brief §6). At v0 scale brute-force
similarity is fine — **no ANN tuning**. Embeddings are adopted only when a **measured** trigger fires:

| Trigger | Signal (measured, not speculative) |
|---|---|
| **A — recall gap** | FTS repeatedly misses items the curator knows exist (vocabulary/synonym mismatch) |
| **B — corpus diversity** | sources span enough sub-domains that shared vocabulary breaks down |
| **C — agent/NL queries** | agents ask conceptual questions ("evidence related to X") and FTS under-recalls |
| **D — cross-lingual / heavy synonymy** | such content appears |

Until a trigger fires, invest in FTS quality (tokenization, synonym lists, `Concept`/`Interest` tags as
"poor-man's semantics", structured filters). When embeddings land:
**Hybrid (FTS + vector fused via RRF) → optional cross-encoder reranker over the fused top-N** is **v1**, behind the
same `search()` interface, only if measured recall/precision needs it. `node_vec` stays nullable so un-embedded
items remain retrievable via FTS throughout the migration.

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) and
[ADR-0006](../01-decisions/ADR-0006-retrieval.md):
- `TODO(open-question: embedding model & locality — local vs API; does API embedding violate confidential-boundary rules?)`
- `TODO(open-question: re-embedding policy on model upgrades / edited items without stale vectors)`
- `TODO(open-question: grounding-check engine — automated claim-entailment in v0 or v1)`
- `TODO(open-question: chunking unit — whole Claim/Note rows vs sub-chunk long sources; anchor storage)`
- `TODO(open-question: synonym/concept tagging investment to delay embeddings)`

## Implications for runbooks
- **RB (data-layer):** FTS5 virtual table (or `tsvector` + GIN) with `boundary`, `visibility`, `kind`, `trust`,
  `status`, entity-link columns; nullable `node_vec` sidecar reserved (unused in v0); both as droppable migrations
  rebuilt by the deterministic reindex.
- **RB (retrieval service):** `search()` → `RetrievalHit` envelope; boundary/scope filter **before** assembly;
  edge-traversal chain hydration with per-node boundary re-check.
- **RB (RAG/synthesis):** citation-constrained `{answer_claims[], evidence[], unsupported[]}`; reject/flag uncited
  claims; persist kept syntheses as cited `Note`s, never `Evidence`; export path goes through the fail-closed
  allow-list.
- **RB (interfaces):** API/MCP/CLI (thin adapters) return the envelope; viewer renders claim↔evidence links + trust;
  default response may be retrieval-only (no generation).
- **RB (v1 upgrade):** add embeddings behind the same `search()`; RRF fusion + optional rerank; gate on measured
  triggers A–D.

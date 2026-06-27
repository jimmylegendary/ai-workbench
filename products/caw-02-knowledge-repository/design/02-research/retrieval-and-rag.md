# Retrieval & RAG

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../01-decisions/](../01-decisions/), [../04-data-layer/](../04-data-layer/), [../05-knowledge-core/](../05-knowledge-core/), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc researches **retrieval** for CAW-02's provenance-preserving knowledge store and recommends a v0 approach.
It covers: keyword/full-text (FTS) vs semantic/vector search; the concrete engine options (SQLite FTS5,
`sqlite-vec`, pgvector, LanceDB); when embeddings are actually worth it at single-curator scale; hybrid search;
and — most important for this product — **RAG patterns that return citations (claim + evidence), not opaque
generated blobs**. It does NOT decide the storage substrate (that is a separate storage ADR; this doc assumes the
md-first + relational-index direction from the brief §6 and stays portable across SQLite/Postgres). It does NOT
cover ingestion/extraction (separate pipeline ADR) or the import/export contracts with CAW-01/05/03.

## Design constraints that shape retrieval (from the brief)
- **Provenance is the product.** Retrieval must return *items with their chain* (`Source → Claim → Evidence →
  Note`), never a detached text span. A result without provenance is a defect, not a convenience.
- **Generated summaries are NOT evidence** (guardrail §10). Any RAG/synthesis layer must keep generated text
  visibly separate from cited `Evidence` and force every synthesized claim to carry citations.
- **Boundary-aware.** Every item has `boundary` (public/internal/confidential) + team-vs-private. Retrieval must
  filter by boundary *before* anything leaves the store; public exports return public-safe items only.
- **Single-curator scale (v0).** Jimmy + a small team + a few agents. Corpus is hundreds→low-thousands of
  sources/claims, not millions. This dominates the "embeddings worth it?" question.
- **Independent product.** Its own store/deploy; no shared substrate. Prefer engines that embed in-process so the
  whole product ships as one deployable unit.
- **Portability.** Storage ADR keeps SQLite↔Postgres open; retrieval choices should not lock that door.

## Retrieval families compared

| Family | What it is | Strengths | Weaknesses | Fit for CAW-02 v0 |
|---|---|---|---|---|
| **Keyword / FTS** (SQLite FTS5, Postgres `tsvector`, BM25) | Lexical index over tokens; rank by term frequency | Zero embedding cost; exact-term + identifier/jargon recall; cheap to operate; deterministic & inspectable; trivially boundary-filterable via SQL | Misses synonyms/paraphrase; no semantic "near" matches; query must share vocabulary | **Strong default.** Matches small, jargon-heavy technical corpus and inspectability requirement |
| **Semantic / vector** (`sqlite-vec`, pgvector, LanceDB) | Embed text → ANN/brute-force nearest-neighbour over vectors | Finds paraphrase/conceptual matches; good for "what do we know about X" fuzzy intent | Embedding model dependency + cost; opaque ranking; drift if model changes; weak on exact identifiers; needs re-embed on edits | **Additive, not first.** Worth it once FTS recall demonstrably fails |
| **Hybrid** (FTS + vector, fused via RRF) | Run both, merge ranked lists | Best recall; lexical catches exact terms, vector catches paraphrase | Two indexes to maintain; more moving parts | **v1 target** once embeddings exist |
| **Graph traversal** (follow `Claim→Evidence→Note` links) | Walk the provenance edges | Native to the domain; powers "show the chain"; no ML | Not a discovery mechanism by itself; needs a seed | **Always-on companion** to whichever text retrieval is used |

Key insight: for this product, **graph/link traversal is not optional regardless of text-retrieval choice** —
it is how a hit becomes a *provenance-carrying* answer. Text retrieval finds the seed item; edge traversal
hydrates the chain and trust level.

## Engine options (embedded-first, portable)

| Engine | Mode | Notes (grounded) | Verdict for v0 |
|---|---|---|---|
| **SQLite FTS5** | In-process, built into SQLite | Mature, ubiquitous BM25-style ranking; no extra dependency; same file as the relational index | **Recommended v0 text retrieval** |
| **Postgres FTS (`tsvector`/`ts_rank`)** | Server | Native if/when we go Postgres-portable; GIN index | Use if storage ADR picks Postgres |
| **`sqlite-vec`** | In-process SQLite extension (pure C, no deps) | Active successor to the **deprecated `sqlite-vss`** (which had Faiss build/training pain); brute-force ANN via virtual tables; runs anywhere SQLite runs | **Recommended path when embeddings are added** (stays single-file, in-process) |
| **`sqlite-vss`** | SQLite extension (Faiss) | **Deprecated** by its author in favour of `sqlite-vec`; slow index training reported | Avoid |
| **pgvector** | Postgres extension | Most production-mature; vectors live next to relational data; good if already on Postgres | Use only if we are already on Postgres |
| **LanceDB** | Embedded, in-process, columnar (Lance format) | Disk-based ANN, larger-than-memory, zero-copy, no server; newer, smaller community, concurrent-write limits | Overkill at v0 scale; reconsider if corpus grows large/multimodal |

At our scale (low-thousands of vectors), **brute-force similarity is fine** — ANN index tuning is unnecessary,
which further favors the simplest in-process option matching the storage substrate (`sqlite-vec` for SQLite,
pgvector for Postgres).

## When are embeddings actually worth it?
Embeddings add a model dependency, an embed-on-write/edit cost, re-embedding risk on model upgrades, and an
opaque ranking surface — all of which fight the inspectability the brief demands. At single-curator scale the
default answer is **"not yet."** Adopt embeddings when *measured* triggers fire, not speculatively:

- **Trigger A — recall gap:** FTS misses items the curator knows exist because of vocabulary mismatch
  (synonyms/paraphrase), observed repeatedly in real queries.
- **Trigger B — corpus size/diversity:** sources span enough sub-domains that shared vocabulary breaks down.
- **Trigger C — agent/NL queries:** agents ask conceptual questions ("evidence related to X") rather than
  keyword lookups, and FTS under-recalls.
- **Trigger D — cross-lingual / heavy synonymy** content appears.

Until then: invest in FTS quality (good tokenization, synonym lists, `Concept`/`Interest` tags as cheap
"poor-man's semantics", structured filters on boundary/entity-type) instead of an embedding stack. Keep the
schema ready (a nullable `embedding` column / sidecar vector table) so embeddings are an **additive upgrade, not
a rewrite** — consistent with brief §6's "no rewrite" requirement.

## RAG that returns citations (claim + evidence), not blobs
The dangerous failure mode for this product is a fluent generated paragraph mistaken for evidence. The RAG layer
is therefore designed around **attribution as a hard output contract**, drawing on current citation-aware /
claim-grounding RAG practice:

1. **Retrieve provenance-carrying units, not raw chunks.** The retrievable unit is a `Claim`/`Evidence`/`Note`
   row (or a chunk that *carries* its parent IDs + `boundary` + `trust` as metadata). Spatial/source anchors
   (source URI, location/offset) travel with the chunk from indexing through synthesis so they can be surfaced.
2. **Boundary filter first.** Apply `boundary` + team/private filters at the SQL/retrieval layer before anything
   reaches a model or a response — never filter after generation.
3. **Synthesize with mandatory inline citations.** Every generated sentence/claim must cite ≥1 retrieved unit by
   ID (claim → cited evidence IDs, with start/end demarcation). A synthesized statement with no citation is
   rejected or flagged "unsupported", never returned as fact.
4. **Return structured, not prose-only.** The response is `{answer_claims:[{text, cites:[evidence_id...]}],
   evidence:[{id, source, boundary, trust, locator}], unsupported:[...]}`. The viewer/CLI renders citations;
   the generated layer is visually and structurally distinct from `Evidence` (guardrail §10).
5. **Grounding check (optional v0, recommended v1).** Decompose the answer into atomic claims and verify each is
   entailed by its cited evidence; surface a grounding/trust score. Catches "fake citations" where text doesn't
   match the cited span.
6. **Store the synthesis as a `Note`, not as `Evidence`.** A generated answer worth keeping becomes a cited
   `Note` linked to its evidence — preserving reconstructability (source→claim→evidence→note).

This makes RAG here a **provenance retrieval + citation-constrained synthesis** layer, not a generic
"chat-over-docs". The default retrieval response can even skip generation entirely and return ranked
claims+evidence — generation is an opt-in convenience over an already-trustworthy result set.

## Hybrid search & ranking (v1 path)
When embeddings exist, combine FTS and vector results with **Reciprocal Rank Fusion (RRF)** — it merges by rank
position, so it needs no score calibration between incompatible BM25 and cosine scales, and is the robust default
in current practice. Optional second stage: a **cross-encoder reranker** over the fused top-N to restore
precision before synthesis (retrieve broad with RRF → rerank top ~10 → cite). At v0 scale a reranker is likely
unnecessary; revisit when result lists get long or noisy.

## Recommended v0 retrieval
- **Text retrieval:** **SQLite FTS5** (BM25 ranking) as the primary index, co-located with the relational
  knowledge index. (Postgres `tsvector` if the storage ADR selects Postgres.)
- **Structured filters first-class:** boundary, team/private, entity-type, `Concept`/`Interest`, trust level —
  all SQL `WHERE`, applied before ranking.
- **Provenance hydration:** every hit is expanded via link traversal into its `Source→Claim→Evidence→Note` chain
  with `trust` and `boundary` attached. This is the actual "result".
- **RAG/synthesis:** citation-constrained, structured output (claims + cited evidence IDs + unsupported list);
  generation is optional over the trustworthy result set; synthesized keepers are stored as cited `Note`s.
- **Embeddings:** **deferred.** Schema reserves a nullable vector sidecar so adding `sqlite-vec` (or pgvector) is
  additive. Adopt when Triggers A–D fire.
- **Hybrid + RRF + optional reranker:** **v1**, after embeddings, only if measured recall/precision needs it.

## How results carry provenance & trust
Every retrieval result is a structured envelope, not a string:

```
RetrievalHit {
  item:      { id, type: Source|Claim|Evidence|Note|..., text/title }
  chain:     [ Source -> Claim -> Evidence -> Note ]   # hydrated via link traversal
  trust:     <level>                                   # carried from the item, see provenance/trust ADR
  boundary:  public | internal | confidential          # enforced pre-return
  scope:     team | private
  locator:   { source_uri, location }                  # where evidence physically lives (path/URI per brief §6)
  score:     { fts_rank, (vector_sim), (rerank) }      # ranking is inspectable
}
```
- **Trust is data, not inferred at query time** — retrieval surfaces the stored trust/boundary of each item.
- **No blob answers:** even the synthesized RAG response is decomposed into `claim → cited evidence IDs`.
- **Boundary is enforced at the retrieval boundary** so confidential items cannot leak into public-facing
  exports (brief §6/§10).

## Open Questions
- `TODO(open-question: storage substrate)` — SQLite vs Postgres vs both decides whether text retrieval is FTS5 vs
  `tsvector` and vector is `sqlite-vec` vs pgvector. Tracked in the storage ADR.
- `TODO(open-question: embedding model & locality)` — if/when embeddings land, which model (local vs API), and
  does an API embedding step violate confidential-boundary rules for `confidential` items? Likely local-only for
  confidential content.
- `TODO(open-question: re-embedding policy)` — how to handle model upgrades / edited items without breaking
  provenance or stale vectors.
- `TODO(open-question: grounding-check engine)` — is automated claim-entailment verification in v0 or v1, and
  does it require an LLM call (cost/boundary implications)?
- `TODO(open-question: chunking unit)` — retrieve whole `Claim`/`Note` rows vs sub-chunk long sources; how
  anchors/locators are stored for long imported artifacts.
- `TODO(open-question: synonym/concept tagging)` — how much "poor-man's semantics" (Concept/Interest tags,
  synonym lists) we invest in to delay embeddings.

## Implications for runbooks
- **RB (data-layer):** create FTS5 virtual table (or `tsvector` + GIN) over indexed text; include `boundary`,
  `scope`, `type`, `trust`, entity-link columns so filtering is pure SQL. Reserve a nullable vector sidecar
  table/column (unused in v0) so embeddings are additive.
- **RB (retrieval service):** implement `search()` returning the `RetrievalHit` envelope above — FTS rank +
  structured filters + link-traversal hydration of the provenance chain. Boundary/scope filter applied *before*
  results are assembled.
- **RB (RAG/synthesis):** citation-constrained synthesis producing structured `{answer_claims[], evidence[],
  unsupported[]}`; reject/flag uncited claims; persist kept syntheses as cited `Note`s, never as `Evidence`.
- **RB (interfaces):** API/MCP/CLI return the structured envelope; viewer renders claim↔evidence links and trust;
  default response may be retrieval-only (no generation).
- **RB (upgrade path / v1):** add embeddings (`sqlite-vec`/pgvector) behind the same `search()` interface; add
  RRF fusion and optional cross-encoder rerank; gate adoption on the measured Trigger A–D criteria.

## Sources
- [sqlite-vec (GitHub)](https://github.com/asg017/sqlite-vec) / [sqlite-vss deprecation (GitHub)](https://github.com/asg017/sqlite-vss) / [State of Vector Search in SQLite](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite)
- [pgvector vs LanceDB comparison (Zilliz)](https://zilliz.com/comparison/pgvector-vs-lancedb) / [Best Vector Databases 2026 (Encore)](https://encore.dev/articles/best-vector-databases)
- [Citation-Aware RAG (Tensorlake)](https://www.tensorlake.ai/blog/rag-citations) / [Explicit Evidence Grounding via Structured Inline Citation (arXiv)](https://arxiv.org/html/2606.07130) / [eTracer: claim-level grounding (arXiv)](https://arxiv.org/pdf/2601.03669) / [Trustworthy RAG with in-text citations](https://haruiz.github.io/blog/improve-rag-systems-reliability-with-citations)
- [RRF for hybrid search (OpenSearch)](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/) / [Hybrid search + reranking playbook](https://optyxstack.com/rag-reliability/hybrid-search-reranking-playbook) / [Hybrid search ranking (Azure AI Search)](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)

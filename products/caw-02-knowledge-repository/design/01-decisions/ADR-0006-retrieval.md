# ADR-0006: Retrieval — FTS-first, citation-returning, embeddings deferred

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../02-research/retrieval-and-rag.md](../02-research/retrieval-and-rag.md)
  - [./ADR-0002-storage.md](./ADR-0002-storage.md)
  - [./ADR-0004-provenance-and-trust.md](./ADR-0004-provenance-and-trust.md)
  - [./ADR-0007-import-export-contracts.md](./ADR-0007-import-export-contracts.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide CAW-02's **v0 retrieval**: keyword/full-text vs semantic/vector, when embeddings are added, and how results carry
citations (claim + evidence) rather than opaque generated blobs. It builds on the md-first + SQLite index of
[ADR-0002](./ADR-0002-storage.md) and the trust/boundary model of [ADR-0004](./ADR-0004-provenance-and-trust.md). It does
NOT decide the storage substrate or the import/export contracts (see [ADR-0007](./ADR-0007-import-export-contracts.md)).

## Context
- **Provenance is the product.** Retrieval must return *items with their chain* (`Source → Claim → Evidence → Note`); a
  result without provenance is a defect (brief §2, §5).
- **Generated summaries are NOT evidence** (brief §10) — any synthesis layer must keep generated text structurally
  separate from cited `Evidence` and force citations.
- **Boundary-aware:** filter `boundary` + team/private *before* anything leaves the store (brief §6, §10).
- **Single-curator scale:** hundreds→low-thousands of items, not millions — this dominates the "embeddings worth it?"
  question (brief §3).
- **Independent, in-process, portable:** ship as one deployable unit; keep SQLite↔Postgres open ([ADR-0002](./ADR-0002-storage.md)).

## Options considered
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Keyword / FTS (SQLite FTS5, BM25)** | Zero embedding cost; exact identifier/jargon recall; deterministic, inspectable; trivially boundary-filterable in SQL; same file as the index | Misses synonyms/paraphrase | **Chosen v0 default** |
| Semantic / vector (`sqlite-vec`, pgvector) | Finds paraphrase/conceptual matches | Model dependency + embed cost; opaque ranking; re-embed on edits; weak on exact identifiers | **Additive, deferred** — adopt on measured triggers |
| Hybrid (FTS + vector, fused via RRF) | Best recall | Two indexes; more moving parts | **v1 target**, after embeddings exist |
| Graph/link traversal | Native to the domain; hydrates the provenance chain | Not a discovery seed by itself | **Always-on companion**, not optional |
| `sqlite-vss` (Faiss) | — | Deprecated by author; slow index training | Avoid |
| LanceDB | Larger-than-memory ANN | Overkill at v0 scale; concurrent-write limits | Reconsider only if corpus grows large/multimodal |

## Decision
1. **Text retrieval = SQLite FTS5 (BM25)** co-located with the relational index ([ADR-0002](./ADR-0002-storage.md));
   Postgres `tsvector`/GIN if/when the storage ADR ports to Postgres. FTS lives in a **separate droppable migration** so
   it never threatens portability.
2. **Structured filters are first-class and applied before ranking:** `boundary`, `visibility` (team/private),
   entity-`kind`, `Concept`/`Interest`, `trust` — all SQL `WHERE`. The boundary/scope filter runs **before** results are
   assembled, so confidential items cannot leak (brief §6/§10, [ADR-0004](./ADR-0004-provenance-and-trust.md)).
3. **Graph/link traversal is always on.** Text retrieval finds the seed; edge traversal hydrates the
   `Source→Claim→Evidence→Note` chain with `trust` and `boundary`. This is what makes a hit a *provenance-carrying*
   answer.
4. **Results are a structured envelope, never a string:**
   ```
   RetrievalHit {
     item:     { id, kind: Source|Claim|Evidence|Note|..., text/title }
     chain:    [ Source -> Claim -> Evidence -> Note ]   # hydrated via edge traversal
     trust:    <T0..T3 | contested>                       # carried, not inferred at query time
     boundary: public | internal | confidential           # enforced pre-return
     scope:    team | private
     locator:  { source_uri, location }                   # where evidence physically lives (path/URI)
     score:    { fts_rank, (vector_sim), (rerank) }        # ranking is inspectable
   }
   ```
5. **RAG = provenance retrieval + citation-constrained synthesis, not chat-over-docs.** The default response can skip
   generation and return ranked claims+evidence. When generation is opted in:
   - boundary filter first (never after generation);
   - every synthesized sentence/claim must cite ≥1 retrieved unit by ID; an uncited claim is rejected or flagged
     `unsupported`, never returned as fact;
   - structured output `{ answer_claims:[{text, cites:[evidence_id...]}], evidence:[{id, source, boundary, trust,
     locator}], unsupported:[...] }`;
   - a kept synthesis is stored as a cited **`Note`** (`generated=true`), never as `Evidence`
     ([ADR-0004](./ADR-0004-provenance-and-trust.md) evidence gate).
6. **Embeddings are deferred.** The schema reserves a **nullable vector sidecar** (`node_vec`) so adding `sqlite-vec`
   (SQLite) or `pgvector` (Postgres) is additive, not a rewrite (brief §6).

## Embeddings trigger (adopt on *measured* signals, not speculatively)
- **A — recall gap:** FTS repeatedly misses items the curator knows exist due to vocabulary/synonym mismatch.
- **B — corpus diversity:** sources span enough sub-domains that shared vocabulary breaks down.
- **C — agent/NL queries:** agents ask conceptual questions ("evidence related to X") and FTS under-recalls.
- **D — cross-lingual / heavy synonymy** content appears.

Until a trigger fires, invest in FTS quality (tokenization, synonym lists, `Concept`/`Interest` tags as "poor-man's
semantics", structured filters). When embeddings land: brute-force similarity is fine at v0 scale (no ANN tuning).
**Hybrid (FTS + vector fused via RRF), then an optional cross-encoder reranker, is v1** — only if measured
recall/precision needs it.

## Consequences
- **Easy:** deterministic, inspectable ranking that suits a small jargon-heavy technical corpus; one in-process engine,
  no model dependency in v0; boundary/trust enforced in pure SQL before anything leaves; citation-returning results that
  make "summary mistaken for evidence" structurally hard.
- **Hard:** FTS misses paraphrase until embeddings are added; long imported artifacts need a chunking/anchor strategy;
  any future embedding step over `confidential` items raises a locality question (likely local-only model).
- **Follow-on:** data-layer RB (FTS5 virtual table + filter columns + reserved nullable vector sidecar); retrieval-service
  RB (`search()` returning the `RetrievalHit` envelope with pre-ranking boundary/scope filter + chain hydration);
  RAG/synthesis RB (citation-constrained structured output; persist keepers as cited `Note`s); v1 upgrade RB (embeddings
  behind the same `search()` interface, RRF, optional rerank, gated on triggers A–D).

## Open questions / revisit triggers
- `TODO(open-question: embedding model & locality — local vs API; does API embedding violate confidential-boundary rules?)`
- `TODO(open-question: re-embedding policy on model upgrades / edited items without stale vectors)`
- `TODO(open-question: grounding-check engine — automated claim-entailment in v0 or v1; LLM cost/boundary)`
- `TODO(open-question: chunking unit — whole Claim/Note rows vs sub-chunk long sources; anchor storage)`
- `TODO(open-question: synonym/concept tagging investment to delay embeddings)`
- **Revisit trigger → embeddings:** any of A–D fires, measured.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (data-layer):** FTS5 virtual table (or `tsvector` + GIN) with `boundary`, `scope`, `kind`, `trust`, entity-link
  columns; nullable vector sidecar reserved (unused in v0).
- **RB (retrieval service):** `search()` → `RetrievalHit` envelope; boundary/scope filter before assembly; edge-traversal
  chain hydration.
- **RB (RAG/synthesis):** citation-constrained `{answer_claims[], evidence[], unsupported[]}`; reject/flag uncited
  claims; persist kept syntheses as cited `Note`s, never `Evidence`.
- **RB (interfaces):** API/MCP/CLI return the envelope; viewer renders claim↔evidence links + trust; default response may
  be retrieval-only (no generation).

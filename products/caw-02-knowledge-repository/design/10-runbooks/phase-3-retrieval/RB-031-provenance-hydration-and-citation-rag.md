# RB-031: Hydrate the provenance chain into RetrievalHit and build citation-constrained RAG

- Status: ready
- Phase: phase-3-retrieval
- Depends on: [RB-030 (FTS5/BM25 + structured filters → `searchCandidates()`), RB-020 (core op manifest + `synthesize_note` + structural evidence gate), RB-011 (generic `edge` table)]
- Implements design:
  - [../../01-decisions/ADR-0006-retrieval.md](../../01-decisions/ADR-0006-retrieval.md) §3, §4, §5
  - [../../05-knowledge-core/retrieval.md](../../05-knowledge-core/retrieval.md) ("Provenance-chain hydration", "Citation-constrained RAG")
  - [../../07-backend-api/retrieval-service.md](../../07-backend-api/retrieval-service.md) Stages 4–6 + "Boundary & failure guarantees"
  - [../../01-decisions/ADR-0004-provenance-and-trust.md](../../01-decisions/ADR-0004-provenance-and-trust.md) (evidence gate; summary ≠ evidence)
  - [../../05-knowledge-core/ingestion-pipeline.md](../../05-knowledge-core/ingestion-pipeline.md) (A5 synthesize cited note)
- Produces:
  - `search()`/`get()` returning the `RetrievalHit` envelope: item + hydrated `Source→Claim→Evidence→Note` chain + trust + effective boundary + scope + locator + score.
  - A recursive edge-traversal hydrator that **re-applies the viewer gate per node** (no dangling references to nodes the viewer may not see).
  - `answer()`: citation-constrained RAG returning `{ answer_claims[], evidence[], unsupported[] }` — claim+evidence units, never opaque blobs; every claim cites ≥1 retrieved unit by ID.
  - A persist path where a **kept** synthesis is written as a cited `Note` (`generated=true`) via the core `synthesize_note` op — **never** as `Evidence`.

## Objective
"Done" means: a search seed from RB-030 is hydrated into a `RetrievalHit` whose `chain` walks the typed `edge` table (`evidence_for`/`extracted_from`/`cites`/`about_concept`) to assemble `Source→Claim→Evidence→Note`, with the viewer boundary/scope gate **re-applied on every hydrated node** so a chain can never surface a confidential/private node even when the seed was permissible. The default response is retrieval-only (ranked claims+evidence with provenance). The opt-in `answer()` performs citation-constrained synthesis: boundary filter first, every synthesized claim cites ≥1 retrieved unit by ID, uncited claims are rejected or flagged `unsupported` (never asserted as fact), output is structured, and any **kept** synthesis is persisted as a cited `Note` with `generated=true` through the core evidence gate — structurally impossible to store as `Evidence`.

## Preconditions
- [ ] RB-030 acceptance met: `searchCandidates()` returns boundary-safe, filter-before-rank seeds with `score`, `trust`, `boundary`, `visibility`.
- [ ] RB-020 acceptance met: the core `synthesize_note` op exists and routes through the structural evidence gate (`attach_evidence` has no prose; `artifact_ref` must resolve; a Note with `generated=true` can never be an Evidence node).
- [ ] The generic `edge` table carries the provenance relations (`evidence_for`, `extracted_from`, `cites`, `about_concept`/`about`) with `src_id`, `dst_id`, `rel` (ADR-0003).
- [ ] `node` carries effective (monotone-propagated) `boundary` and a `content_hash` per row (ADR-0002/0004).
- [ ] Fixture corpus from RB-030 plus at least one full `Source→Claim→Evidence→Note` chain that mixes boundaries (e.g. a permissible Claim whose Evidence is `confidential`).

## Steps

1. **Implement the recursive chain hydrator with a per-node viewer gate.**
   - Do: For each seed, walk the `edge` table via a recursive CTE to build the `Source→Claim→Evidence→Note` chain, carrying `trust` and `boundary` on each link, bounded by `:max_depth`. Re-apply the viewer gate inside the traversal so any link the viewer may not see is **dropped, not returned as a dangling reference**:
     ```sql
     WITH RECURSIVE chain(id, kind, rel, depth) AS (
       SELECT :seed_id, kind, NULL, 0 FROM node WHERE id = :seed_id
       UNION ALL
       SELECT e.dst_id, n.kind, e.rel, c.depth+1
       FROM chain c
       JOIN edge e ON e.src_id = c.id
       JOIN node n ON n.id = e.dst_id
       WHERE c.depth < :max_depth
         AND n.boundary <= :viewer_max_boundary
         AND (n.visibility = 'team' OR n.owner = :viewer)
     )
     SELECT * FROM chain;
     ```
   - Verify: For the mixed-boundary fixture chain, a viewer below the Evidence's boundary gets the Claim but the confidential Evidence link is **absent** (not a placeholder); a fully-authorized viewer gets the complete chain.

2. **Assemble the `RetrievalHit` envelope (never a bare string).**
   - Do: Build `RetrievalHit { item{id,kind,title?,text?}, chain[{id,kind,rel?}], trust, boundary (effective), scope, locator{source_uri,location?}, score{fts_rank, vector_sim?, rerank?} }` per [retrieval-service.md](../../07-backend-api/retrieval-service.md) Stage 5. `locator` resolves to where the Evidence physically lives (path/URI), carried not inferred.
   - Verify: `search()` returns a list of envelopes; `get(id)` returns one fully-hydrated envelope; no code path returns a plain string. Schema test asserts required fields present.

3. **Add the stale-index guard.**
   - Do: On a hydrated row, compare `content_hash` against the md-git source; on mismatch treat the index as stale → signal rebuild (reindex), never silently trust (design "Boundary & failure guarantees").
   - Verify: Corrupting a row's `content_hash` causes the hit to be flagged stale / trigger rebuild rather than returned as authoritative.

4. **Make retrieval-only the default response.**
   - Do: Ensure the default `search()` returns ranked claims+evidence with provenance and performs **no** generation. Generation is reachable only via the explicit `answer()` entrypoint.
   - Verify: Calling `search()` never invokes any LLM/synthesis code path (assert via a no-generation test/spy).

5. **Implement `answer()` citation-constrained synthesis.**
   - Do: Per [retrieval-service.md](../../07-backend-api/retrieval-service.md) Stage 6 / ADR-0006 §5:
     1. run the boundary/scope gate **first** (reuse RB-030 filter + step-1 hydration; never filter after generation);
     2. feed the synthesizer only **provenance-carrying units** (`Claim`/`Evidence`/`Note` rows with parent IDs + `boundary` + `trust` + `locator`), never opaque chunks;
     3. require every synthesized claim to `cites` ≥1 retrieved unit by `Id`; an uncited claim is **rejected or routed to `unsupported`**, never returned as fact;
     4. return structured output:
        ```ts
        type AnswerResult = {
          answer_claims: { text: string; cites: Id[] }[]
          evidence:      { id: Id; source: string; boundary: Boundary; trust: Trust; locator: string }[]
          unsupported:   { text: string }[]
          note_id?: Id   // present only if persist_as_note:true
        }
        ```
   - Verify: A synthesized claim with no valid `cites` lands in `unsupported`, not `answer_claims`. Every `cites` ID resolves to a unit in `evidence[]`. No `evidence[]` entry exceeds the viewer's boundary.

6. **Persist a kept synthesis as a cited Note via the evidence gate — never as Evidence.**
   - Do: When `persist_as_note:true`, write the kept synthesis through the core `synthesize_note` op (RB-020) producing a `Note` with `generated=true` carrying citations to the Claim/Evidence it used; set `note_id`. Route exclusively through the ingest evidence gate — this is the only write the retrieval path can cause.
   - Verify: The persisted item is a `Note` (`generated=true`) under `knowledge/notes/`; attempting to persist it as `Evidence` is rejected by the gate at all layers; reindex picks it up and it is retrievable with its citation chain. A test asserts a `generated`/`evidence=false` Note is never returned as Evidence.

7. **Boundary & failure guarantee tests.**
   - Do: Cover the design guarantee table: no confidential leak (gate in WHERE + re-applied in hydration), no private-to-team leak, summary≠evidence (kept synthesis only ever a Note), stale-index safety (`content_hash` mismatch ⇒ rebuild), inspectable ranking (`score` on every hit).
   - Verify: All guarantee tests pass; weakening the hydration gate makes the confidential-chain test fail (proving it real).

8. **Note the export hand-off (do not build export here).**
   - Do: Document that a cited bundle exported to CAW-03 (a separate product) passes retrieval's boundary filter as the **first** gate and the fail-closed export allow-list (ADR-0007, phase-5) as the **second** — export itself is out of scope for phase-3.
   - Verify: No export code is added in this runbook; the cross-link to ADR-0007 / phase-5 is present.

## Acceptance criteria
- [ ] `search()`/`get()` return the `RetrievalHit` envelope with a hydrated `Source→Claim→Evidence→Note` chain; never a bare string.
- [ ] The viewer boundary/scope gate is **re-applied on every hydrated node**; a confidential/private chain link never surfaces even when the seed is permissible; dropped links are absent (no dangling references).
- [ ] Default response is retrieval-only; generation occurs only via explicit `answer()`.
- [ ] `answer()` returns `{ answer_claims, evidence, unsupported }`; every `answer_claims[].cites` resolves; uncited claims are flagged `unsupported`, never asserted; outputs are claim+evidence units, never opaque blobs.
- [ ] A kept synthesis is persisted only as a cited `Note` (`generated=true`) via the core evidence gate; storing it as `Evidence` is rejected at all layers.
- [ ] Stale-index guard (`content_hash` mismatch) triggers rebuild instead of returning stale rows; `score` is present on every hit.
- [ ] Tree is green (build + lint + tests) at this checkpoint.

## Rollback / safety
- Hydration and `search()`/`get()` are read-only over the disposable SQLite index; a failure cannot corrupt md-git. Drop the index and reindex to recover.
- The only write path (`answer(persist_as_note:true)`) goes through the core `synthesize_note` evidence gate; if synthesis behavior is suspect, disable `persist_as_note` (retrieval-only still works) without touching stored knowledge.
- Fail closed: if the per-node hydration gate or citation check cannot be verified, return retrieval-only / drop the unverifiable link rather than risk a boundary leak or an uncited claim asserted as fact.

## Hand-off
- Phase-4 (surfaces) can assume: thin API/MCP/CLI adapters return the `RetrievalHit` envelope and `AnswerResult` unchanged; the read-only viewer renders Claim↔Evidence links + trust/boundary badges from the envelope.
- Phase-5 (import/export) can assume: retrieval's boundary filter is the first export gate; cited bundles to CAW-03 are the hydrated claim+evidence result, then pass the fail-closed allow-list (ADR-0007).
- v1 upgrade can assume: embeddings drop in behind the same `search()`/`answer()` (RRF fusion + optional rerank, gated on measured triggers A–D); `node_vec` (reserved in RB-030) stays nullable so un-embedded items remain retrievable.

# RB-020: Score findings with BM25-first additive explainable relevance + recall-first floor

- **Status:** ready
- **Phase:** phase-2-relevance-and-classify
- **Depends on:** [RB-010 (interest store + compiler), RB-011 (SourceAdapters + dedup), RB-012 (FILES-AS-TRUTH store + SQLite index)]
- **Implements design:** [../../05-radar-core/interest-model.md](../../05-radar-core/interest-model.md), [../../01-decisions/ADR-0002-interest-model.md](../../01-decisions/ADR-0002-interest-model.md), [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P2)
- **Produces:** the **score stage** of the Run: a `RelevanceScorer` that annotates each deduped `Finding` with `relevance`, `relevance_explain[]`, `matched_watch_list[]`; a SQLite **FTS5** index over findings; a **recall-first floor** gate; an OFF-by-default flagged embedding lane seam.

## Objective
"Done" = every deduped finding on the Run's working set carries a `relevance` float and an additive, human-readable `relevance_explain[]` (one row per matched interest/lane with raw + contribution), plus `matched_watch_list[]`. Scores are **metadata over the immutable finding** — the scorer never rewrites source text (brief §12). The score governs **ordering, not survival**: any finding hitting a `recall_priority: high` watch-list interest is marked surface-not-drop so the downstream classify/triage stages can never silently discard it. The spine is exact/alias + BM25 (SQLite FTS5); the embedding lane is wired behind `enable_embeddings: false` / `α: 0.0` and contributes nothing in v1. Ranking is reproducible from files.

## Preconditions
- [ ] P1 exit gate met: `interests.json` compiled from `interests.yaml` (versioned), seeded from brief §6 as the `memory-centric-dse` watch list with `recall_priority: high`.
- [ ] Deduped findings exist as `findings/*.json` with title/abstract/body fields and provenance (origin/date/retrieval); dedup ran in CORE (RB-011).
- [ ] SQLite index from RB-012 is buildable; FTS5 compiled into the SQLite build (verify before starting).
- [ ] Tree is green (compiles, lint-passes).

## Steps

1. **Build the FTS5 index over findings.**
   - **Do:** Create a virtual table `findings_fts USING fts5(finding_id UNINDEXED, title, abstract, body)` with column ranking weights title>abstract>body (apply via `bm25(findings_fts, w_title, w_abstract, w_body)` at query time, weights in config, not constants). Populate it from `findings/*.json` as a derived cache (rebuildable from files — never the source of truth).
   - **Verify:** `SELECT count(*) FROM findings_fts` equals the number of deduped findings; deleting and rebuilding the index from `findings/*.json` yields identical rows.

2. **Implement the exact/alias match lane (core).**
   - **Do:** For each interest, match `terms` + `aliases` (case-insensitive, acronym variants e.g. `Mem-OS`/`MemOS`) against title/abstract/body. Emit a normalized `[0,1]` lane score and the matched surface form for the explanation.
   - **Verify:** A finding whose title contains `MemOS` produces an explain row `{interest_id: int-memos, lane: exact, raw, contribution>0}` naming the matched term.

3. **Implement the BM25 lexical lane (core).**
   - **Do:** Build an OR-expansion FTS5 query from the **positive** interest terms; run `bm25()`. FTS5 `bm25()` is **negative** (more relevant = more negative) → **negate, then per-batch min-max normalize to [0,1]** so contributions are comparable across lanes and across the batch. Carry per-term tf/idf detail into the explanation.
   - **Verify:** On a 2-finding fixture where finding A contains 3 watch-list terms and B contains 1, A's normalized BM25 lane score > B's; the normalized values lie in [0,1].

4. **Implement the entity/author/venue lane (core).**
   - **Do:** When an adapter supplied structured metadata (author/venue id), match against interest `canonical_id` (e.g. Minsoo Rhu authorId). Emit a lane score + name the entity. Where `canonical_id` is a TODO/null, fall back to name-string match but flag lower confidence.
   - **Verify:** A finding authored by the configured Rhu `canonical_id` yields an explain row `{lane: entity, interest_id: int-rhu}`; a same-name author without the id does not produce a high-confidence entity hit.

5. **Wire the additive scoring contract.**
   - **Do:** Compute `relevance = Σ_positive[weight × lane_score × decay_factor] − Σ_negative[weight × lane_score] + α × embedding_lane`, with `α = 0` default. Emit `relevance_explain[]` as `{interest_id, type, lane, raw, contribution}` **ordered by contribution desc**, and `matched_watch_list[]`. Apply `decay` per interest. Negative-polarity matches produce **negative contributions (demote)** but per ADR-0002 never delete.
   - **Verify:** For a hand-built finding, summing the `contribution` fields in `relevance_explain[]` equals `relevance` (within float tolerance); a negative-polarity match shows a negative contribution and lowers but does not zero/drop the finding.

6. **Enforce the recall-first floor (surface-not-drop).**
   - **Do:** Set `surface_not_drop: true` on any finding matching ≥1 interest in a `recall_priority: high` watch list, **regardless of score** (even score near 0). This flag is the contract RB-022's routing/discard MUST honor. Tie-break ordering: recency, then count of distinct interests matched.
   - **Verify:** A finding with a single low-weight `memory-centric-dse` hit and otherwise low score still carries `surface_not_drop: true` and appears in the ranked output (not filtered out).

7. **Wire the embedding lane seam (OFF, gated).**
   - **Do:** Add config `enable_embeddings: false`, `α: 0.0`. When off, the lane contributes 0 and adds no dependency. Reserve the explain shape: if ever on, report nearest interest + cosine labeled `"semantic"` — never a bare number. Document that enabling requires a labeled eval set (P7 alpha gate).
   - **Verify:** With defaults, scores are identical whether or not the embedding code path is present (α=0); no embedding model is loaded; a unit test asserts `α==0` ⇒ embedding contribution == 0.

8. **Persist scores as immutable-finding metadata.**
   - **Do:** Write `relevance`, `relevance_explain[]`, `matched_watch_list[]`, `surface_not_drop` into the finding's annotation layer (sidecar fields / metadata block), never mutating raw `title/abstract/body`. Re-running the scorer is idempotent for a fixed `interests.json` version.
   - **Verify:** A byte-diff of raw source fields before/after scoring shows no change; two consecutive scorer runs over the same inputs produce identical `relevance` values.

## Acceptance criteria
- [ ] Every deduped finding has `relevance` + a non-empty `relevance_explain[]` when any interest matched, ordered by contribution.
- [ ] `Σ contribution == relevance` holds on fixtures (additive/explainable by construction).
- [ ] FTS5 `bm25()` is negated + per-batch min-max normalized; lane scores ∈ [0,1].
- [ ] Recall floor: any `recall_priority: high` hit ⇒ `surface_not_drop: true`, independent of score.
- [ ] Embedding lane is OFF (`enable_embeddings:false`, `α:0`) and provably contributes 0; no embedding dependency loaded.
- [ ] Scorer is a pure annotation layer (raw source bytes unchanged) and reproducible from files.
- [ ] Tree is green at this checkpoint.

## Rollback / safety
- The FTS5 index and all score annotations are **derived**; delete the index + strip the annotation block to return to the pre-RB-020 state — `findings/*.json` raw content is untouched.
- If normalization is suspect, gate the scorer behind a `--no-score` dry-run that emits explanations without persisting, compare, then commit.
- Never enable the embedding lane here; raising `α` without the P7 labeled eval set violates ADR-0002.

## Hand-off
RB-021 (classification cascade) can assume each finding carries `relevance{score, explain[], matched_watch_list, surface_not_drop}` as stable, immutable metadata, rendered verbatim downstream. RB-022's routing inherits `surface_not_drop` as the recall-first floor it must not relax. The embedding seam exists for P7 with no redesign required.

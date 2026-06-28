# Interest Modeling & Relevance

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc decides how CAW-05 **represents and updates interests** (keywords, topics, entities, authors,
venues) and how it produces an **explainable relevance score** that ranks/prioritizes incoming findings
against the narrow watch list (Brief §6). It delivers three things: an **Interest schema**, a **relevance
ranking approach**, and an **update mechanism**. It is the load-bearing core called out in Brief §10.

It does **NOT** cover: source adapters/ingestion mechanics, the classify step
(novelty-threat/support/adjacent/noise — that consumes the relevance score but is a separate decision),
the related-work ledger, storage/scheduling, or export boundaries. Those are separate docs/ADRs. Per Brief
§11/§12, v1 stays **simple, explainable, and high-recall on a narrow list** — no heavy ML relevance models.

## Design forces

| Force | Implication for this doc |
|---|---|
| **High recall on a narrow watch list** (Brief §1, §19) | Relevance must err toward *surfacing* over *filtering*; thresholds bias to recall. Interests are a small curated set, not a learned profile. |
| **Explainable** (Brief §11, §92) | Every score must decompose into named contributing signals ("matched entity *MemOS*, author *Minsoo Rhu*"). No opaque single number. |
| **v1 simple, no heavy ML** | Lexical/BM25 first; embeddings as an *optional, additive* signal, not a dependency. |
| **Findings are proposals, Jimmy reviews** (Brief §89, §99) | Update mechanism is human-in-the-loop: Jimmy edits interests; feedback nudges weights, never auto-rewrites the watch list. |
| **Own store, markdown/JSON + lightweight index** (Brief §7) | Interest model is a versioned JSON/YAML file in CAW-05's own repo; index is SQLite FTS5 (no external service required). |
| **Generated summaries are not evidence** (Brief §97) | Relevance scores rank *raw findings*; the score is metadata, never rewritten source content. |

## 1. Interest schema

Interests are a small, hand-curated, **versioned** set of typed entries. Each entry is independently
explainable and independently weighted. Representation: one `interests.yaml` (human-edited) compiled to
`interests.json` (machine-consumed). Keep it readable — this is Jimmy's control surface.

```yaml
# interests.yaml — CAW-05 interest model (v1)
version: 3                      # bumped on every accepted edit; enables diff/rollback
updated: TODO                   # do not invent dates
watch_lists:
  - id: memory-centric-dse      # the narrow radar (Brief §6). Multiple lists allowed later.
    label: "Memory-centric DSE & LLM memory wall"
    default_weight: 1.0
    recall_priority: high       # high => low surfacing threshold; never silently drop

interests:
  - id: int-memos
    type: topic                 # enum: keyword | topic | entity | author | venue
    terms: ["MemOS", "memory operating system for LLM"]
    aliases: ["Mem-OS"]
    weight: 1.0                 # base contribution to relevance
    watch_list: memory-centric-dse
    polarity: positive          # positive | negative (negative = de-rank / noise hint)
    provenance: seed-brief-§6    # where this interest came from (auditable)
    decay: none                 # none | slow | fast — relevance half-life of the interest
    notes: "novelty-threat candidate cluster"

  - id: int-rhu
    type: author
    terms: ["Minsoo Rhu"]
    canonical_id: "TODO(open-question: Semantic Scholar authorId / ORCID for disambiguation)"
    weight: 1.2                 # named-person hit is a strong signal on this watch list
    watch_list: memory-centric-dse
    polarity: positive
    provenance: seed-brief-§6

  - id: int-ttt-writeback
    type: keyword
    terms: ["TTT writeback", "test-time training memory traffic", "test-time compute memory"]
    weight: 0.9
    watch_list: memory-centric-dse
    polarity: positive
    provenance: seed-brief-§6

  - id: int-llm-serving-sim
    type: topic
    terms: ["LLM serving simulation", "memory-hierarchy simulation", "Chakra trace workload"]
    weight: 0.8
    watch_list: memory-centric-dse
    polarity: positive
    provenance: seed-brief-§6

  - id: int-generic-llm-noise
    type: keyword
    terms: ["prompt engineering", "chatbot UX"]
    weight: 0.5
    polarity: negative          # down-weight generic LLM hype off the watch list
    provenance: seed-jimmy
```

### Field rationale

| Field | Why it exists | Explainability role |
|---|---|---|
| `type` | Different signals (an author vs a keyword) are matched and weighted differently. | Score breakdown names the type that fired. |
| `terms` / `aliases` | Surface forms for lexical/BM25 matching, incl. acronym variants. | "matched alias *Mem-OS*". |
| `canonical_id` | Disambiguate authors/venues via external IDs (Semantic Scholar authorId, ORCID, arXiv category). | Avoids false author hits. |
| `weight` | Tunable per-interest contribution; updated by feedback. | Shown as the multiplier in the breakdown. |
| `polarity` | Negative interests demote generic hype → supports signal-vs-hype (Brief §51). | "de-ranked: matched negative *prompt engineering*". |
| `decay` | Some interests are timely (a hot thread), others standing (memory wall). | Explains why an old interest faded. |
| `provenance` | Every interest is auditable to seed/Jimmy/feedback. | Keeps interests, like findings, traceable (Brief §97). |

## 2. Relevance ranking approach

A finding's relevance = **transparent sum of per-interest signal contributions**, not a black box.
v1 uses **lexical/BM25 as the spine**, with embeddings as an **optional additive lane** behind a flag.

### Signal lanes

| Lane | What it does | v1 status | Explainable? |
|---|---|---|---|
| **Exact/alias match** | Direct hit on `terms`/`aliases` in title/abstract. Highest-confidence, cheapest. | **core** | Yes — names the term. |
| **BM25 lexical** (SQLite **FTS5** `bm25()`) | Rank free-text findings against the OR-expansion of all positive interest terms; column weights boost title>abstract>body. | **core** | Yes — per-term tf/idf via FTS5. |
| **Entity/author/venue match** | Structured match on `canonical_id` when adapters supply structured metadata (arXiv author list, S2 authorId). | **core** | Yes — names the entity. |
| **Embedding similarity** | Cosine sim between finding text and interest centroid; catches paraphrase/synonyms BM25 misses (e.g. "memory wall" ≈ "bandwidth bottleneck"). | **optional / flagged** | Partially — report nearest interest + score, label as "semantic". |

### Scoring formula (explainable by construction)

```
relevance(finding) =
    Σ_over_matched_positive_interests [ interest.weight × lane_score × decay_factor ]
  − Σ_over_matched_negative_interests [ interest.weight × lane_score ]
  + α × embedding_lane            # α default 0 in v1; raise only after eval

# lane_score normalized to [0,1] per lane. FTS5 bm25() is negative (more relevant = more
# negative) → negate + min-max normalize per batch before combining.

explanation(finding) = ordered list of {interest.id, type, lane, raw, contribution}
```

Output per finding: a `relevance` float **plus** a `relevance_explain[]` array (the contribution list)
and the `matched_watch_list`. The classify step and the digest both render the explanation verbatim, so a
reader always sees *why* something surfaced.

### Why BM25-first, embeddings-optional

| Option | Pros | Cons | Fit for v1 |
|---|---|---|---|
| **Keyword/alias only** | Trivial, fully explainable, zero infra. | Misses paraphrase; brittle to new phrasings → recall risk on narrow list. | Necessary but insufficient alone. |
| **BM25 (FTS5)** | Built into SQLite (no service), tf-idf is inspectable, column weights, prefix/phrase/boolean queries. | Still lexical — no semantics. | **Chosen spine.** |
| **Embeddings (dense) only** | Best paraphrase recall. | Opaque, needs a model + vector store, harder to explain, over-surfaces loosely-related → noise. | Rejected as primary. |
| **Hybrid (BM25 + embeddings, weighted/RRF)** | Best recall+precision; 2025 production evidence favors hybrid, but BM25 still wins many real queries. | More moving parts; weight/α tuning. | **Target after v1 eval; α-flag built in now.** |

For a narrow, jargon-heavy watch list (proper nouns like *MemOS*, *Chakra*, *DeepStack*, *Minsoo Rhu*),
**exact/BM25 matching already captures most true positives** — these are rare distinctive tokens, exactly
where lexical excels. Embeddings mainly help catch *new* work that avoids the known vocabulary; that is a
real recall gap, so we keep the lane wired but disabled until we can measure it against a labeled set.

### Recall-first thresholds

- A finding matching **any** `recall_priority: high` watch-list interest is **always surfaced** for triage
  (never auto-discarded), even at low score. The score governs ordering, not survival.
- Negative-polarity matches **demote** within the digest but do not delete (Jimmy reviews — Brief §89).
- Tie-break by recency, then by number of distinct interests matched (breadth = stronger signal).

## 3. Update mechanism

Interests evolve via three channels, all **human-gated** and **versioned** (Brief §36 use case "update
interests → radar re-prioritizes"; §89 "Jimmy is the reviewer").

| Channel | Trigger | Effect | Guardrail |
|---|---|---|---|
| **Direct edit** | Jimmy edits `interests.yaml` (add/remove/reweight). | Recompile to `interests.json`; bump `version`; re-rank backlog. | Git diff = full audit trail; rollback by version. |
| **Feedback nudge** | Jimmy marks a digest item useful / not-useful / "more like this". | Adjust matched interests' `weight` by a small bounded step (e.g. ±0.1, clamped [0.1, 2.0]); log to `interest-feedback.jsonl`. | Never creates/deletes interests; never edits `terms`. Bounded so one click can't dominate. |
| **Suggestion queue** | Recurring high-relevance tokens/authors co-occurring with accepted findings. | Propose *candidate* interests (`provenance: suggested`) into a review queue. | Inert until Jimmy promotes them — no silent watch-list growth (Brief §88 non-goal). |

### Update properties

- **Explainable & reversible:** every weight change is logged with the finding/feedback that caused it;
  `version` + git make any state reproducible and revertible.
- **Decay applied on schedule:** the cron run applies `decay` to timely interests so stale ones fade
  without manual pruning; decayed-to-floor interests surface in the suggestion queue for removal.
- **No learned profile in v1:** we deliberately avoid an implicit ML user-model. The interest set stays a
  small artifact a human can read in one screen — central to keeping the radar auditable and high-trust.
- **Re-prioritization is cheap:** because scoring is a transparent sum over a small interest set, an
  interest edit just re-runs scoring over the current backlog; no retraining.

## Tradeoffs summary

| Decision | Chosen | Rejected alternative | Why |
|---|---|---|---|
| Interest representation | Curated typed YAML/JSON, versioned | Learned user embedding/profile | Explainability + recall control + Brief "no heavy ML". |
| Ranking spine | BM25 via SQLite FTS5 + exact match | Dense embeddings primary | Distinctive proper-noun watch list; no infra; inspectable. |
| Semantics | Optional embedding lane (α-flagged, default off) | None / always-on | Wire the seam now (ports & adapters), prove value before enabling. |
| Filtering | Recall-first: surface-not-drop on watch-list hits | Precision threshold gate | Missed close paper = existential novelty risk (Brief §19). |
| Updates | Human-gated edits + bounded feedback nudges | Auto-learning weights/auto-grow list | Jimmy is reviewer; avoid drift/auto scope-creep. |

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO: create).

- TODO(open-question: author/venue disambiguation — Semantic Scholar `authorId` vs ORCID vs name-string for `Minsoo Rhu`; how to handle homonyms and unaffiliated reposts?)
- TODO(open-question: which embedding model for the optional lane — local (e.g. small sentence-transformer) vs API — given the legal/ToS + own-store constraints, and is the added recall worth the opacity?)
- TODO(open-question: what labeled eval set defines "high recall" for the narrow list, and what default α/threshold values come out of it? No benchmark numbers asserted here.)
- TODO(open-question: feedback nudge step size and clamps (±0.1? [0.1,2.0]?) — tune against real digest interaction.)
- TODO(open-question: decay function shape/half-life per `decay` tier — none/slow/fast mapped to what concretely?)
- TODO(open-question: should negative-polarity interests ever hard-suppress, or always only demote, given recall-first stance?)

## Implications for runbooks

- **RB (interest store):** scaffold `interests.yaml` seeded from Brief §6 watch list; compiler to
  `interests.json` with schema validation; `version` bump + git-committed on every change.
- **RB (index):** build SQLite **FTS5** virtual table over finding title/abstract/body with column
  weights; expose `bm25()` query that OR-expands positive interest terms; negate+normalize scores.
- **RB (scorer):** implement the additive scoring formula emitting `relevance` + `relevance_explain[]` +
  `matched_watch_list`; embedding lane behind `enable_embeddings` flag with `α` config (default 0).
- **RB (recall gate):** enforce surface-not-drop for `recall_priority: high` matches before classify.
- **RB (feedback):** CLI/MCP action to mark digest items; append to `interest-feedback.jsonl`; bounded
  clamped weight nudge job; suggestion queue for candidate interests (inert until promoted).
- **RB (decay/re-rank):** cron step applies decay and re-runs scoring over the backlog after any interest
  `version` change; emits a re-prioritized digest ordering.
- Scores/explanations are metadata only — never mutate raw source content (Brief §97).

## Sources

- [SQLite FTS5 BM25 in practice](https://thelinuxcode.com/sqlite-full-text-search-fts5-in-practice-fast-search-ranking-and-real-world-patterns/)
- [Hybrid search in production: why BM25 still wins on queries that matter](https://tianpan.co/blog/2026-04-12-hybrid-search-production-bm25-dense-embeddings)
- [Hybrid search (BM25 + vector embeddings)](https://medium.com/@mahima_agarwal/hybrid-search-bm25-vector-embeddings-the-best-of-both-worlds-in-information-retrieval-0d1075fc2828)
- [Implementing hybrid semantic + lexical search](https://kentcdodds.com/blog/implementing-hybrid-semantic-lexical-search)

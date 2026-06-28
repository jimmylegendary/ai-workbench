# Radar Core — Interest Model & Relevance

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [overview.md](overview.md) — where the score stage sits in the Run
  - [source-ingestion-and-dedup.md](source-ingestion-and-dedup.md) — supplies the structured metadata the entity lane needs
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md) — the decision this elaborates
  - [../02-research/interest-modeling.md](../02-research/interest-modeling.md) — schema, formula, update channels (research)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) — consumes `relevance` + inherits the recall floor
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) — SQLite FTS5 over findings; decay on the cron run
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc is the **build-facing elaboration** of CAW-05's load-bearing core (brief §10, ADR-0002): the **typed
interest artifact**, the **BM25-first additive explainable relevance score**, the **recall-first floor**, the
**optional embedding lane**, the **human-gated versioned updates**, and **watch-list seeding** from brief §6. It
fixes schemas, the scoring contract, and the score stage's outputs. It does NOT decide ingestion (it consumes
deduped findings — see [source-ingestion-and-dedup.md](source-ingestion-and-dedup.md)) or the classify taxonomy
that *consumes* the score (ADR-0004). Per brief §11/§12, v1 stays **simple, explainable, high-recall — no heavy
ML relevance model**.

## Why this is load-bearing
Relevance ranking decides what surfaces for triage. Getting it wrong **silently loses a close paper** — an
existential novelty risk (brief §1, §19). So the design biases to **surfacing over filtering** and makes every
score **decompose into named signals**. The watch list is jargon-heavy proper nouns (*MemOS, Chakra, DeepStack,
Minsoo Rhu, MC-DLA, SECDA-DSE, TTT writeback*) — exactly where exact/BM25 lexical matching captures most true
positives and where opaque embeddings risk over-surfacing noise.

## 1. The typed interest artifact
Interests are a **small, hand-curated, versioned** set of typed entries: one `interests.yaml` (Jimmy's control
surface) compiled to `interests.json` (machine-consumed). It fits on one screen and is fully git-auditable.

```yaml
# interests.yaml — CAW-05 interest model (illustrative; seeded from brief §6)
version: 1                      # bump on every accepted edit → diff/rollback
updated: TODO                   # do not invent dates
watch_lists:
  - id: memory-centric-dse      # the narrow weekly radar (brief §6)
    label: "Memory-centric DSE & LLM memory wall"
    default_weight: 1.0
    recall_priority: high       # high ⇒ surface-not-drop floor (never silently drop)

interests:
  - id: int-memos
    type: topic                 # enum: keyword | topic | entity | author | venue
    terms: ["MemOS", "memory operating system for LLM"]
    aliases: ["Mem-OS"]
    weight: 1.0                 # base contribution to relevance
    watch_list: memory-centric-dse
    polarity: positive          # positive | negative (negative = de-rank / hype hint)
    decay: none                 # none | slow | fast — relevance half-life of the interest
    canonical_id: null          # author/venue disambiguation id (S2 authorId / ORCID / arXiv cat)
    provenance: seed-brief-§6    # auditable origin: seed | jimmy | feedback | suggested
  - id: int-rhu
    type: author
    terms: ["Minsoo Rhu"]
    canonical_id: "TODO(open-question: Semantic Scholar authorId / ORCID for disambiguation)"
    weight: 1.2                 # a named-person hit is a strong signal on this list
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

### Field roles (each field earns its explainability)
| Field | Why it exists | Role in the score breakdown |
|---|---|---|
| `type` | An author vs a keyword is matched + weighted differently | Names the type that fired |
| `terms` / `aliases` | Surface forms (incl. acronym variants) for lexical/BM25 match | "matched alias *Mem-OS*" |
| `canonical_id` | Disambiguate authors/venues via external IDs | Avoids false author hits |
| `weight` | Tunable per-interest contribution; nudged by feedback | The multiplier shown in the breakdown |
| `polarity` | Negative interests demote generic hype → signal-vs-hype | "de-ranked: matched negative *prompt engineering*" |
| `decay` | Some interests are timely, others standing | Explains why an old interest faded |
| `provenance` | Every interest is auditable to seed/Jimmy/feedback | Keeps interests traceable like findings (brief §12) |

## 2. BM25-first additive explainable relevance
A finding's relevance is a **transparent sum of per-interest lane contributions**, never a black box. The spine
is lexical/BM25; embeddings are an **optional additive lane** behind a flag, default off.

### Signal lanes
| Lane | What it does | v1 status | Explainable? |
|---|---|---|---|
| **Exact/alias match** | Direct hit on `terms`/`aliases` in title/abstract — highest-confidence, cheapest | **core** | Yes — names the term |
| **BM25 lexical** (SQLite **FTS5** `bm25()`) | Rank free text vs the OR-expansion of positive terms; column weights title>abstract>body | **core** | Yes — per-term tf/idf |
| **Entity/author/venue** | Structured match on `canonical_id` when adapters supply metadata | **core** | Yes — names the entity |
| **Embedding similarity** | Cosine vs interest centroid; catches paraphrase BM25 misses | **optional / flagged** | Partial — reports nearest interest, labeled "semantic" |

### Scoring contract (explainable by construction)
```
relevance(finding) =
    Σ_matched_positive [ interest.weight × lane_score × decay_factor ]
  − Σ_matched_negative [ interest.weight × lane_score ]
  + α × embedding_lane            # α = 0 default in v1; raise only after a labeled eval

# lane_score normalized to [0,1] per lane. FTS5 bm25() is NEGATIVE (more relevant = more
# negative) ⇒ negate + per-batch min-max normalize before combining, so contributions stay
# comparable across lanes.

# Emitted PER finding (metadata over the immutable finding — never rewrites source text):
relevance        : float
relevance_explain: [ {interest_id, type, lane, raw, contribution}, ... ]  # ordered by contribution
matched_watch_list: [ watch_list_id, ... ]
```

Triage (ADR-0004) and the digest (ADR-0001) render `relevance_explain[]` **verbatim**, so a reader always sees
*why* something surfaced. The scorer is a pure annotation layer — it never mutates raw source content (brief §12).

### Why BM25-first, embeddings-optional
| Option | Pros | Cons | Fit for v1 |
|---|---|---|---|
| Keyword/alias only | Trivial, fully explainable, zero infra | Misses paraphrase; brittle to new phrasings → recall risk | Necessary, insufficient alone |
| **BM25 (FTS5)** | In SQLite (no service); inspectable tf-idf; column weights; boolean/phrase queries | Lexical only — no semantics | **Chosen spine** |
| Embeddings (dense) only | Best paraphrase recall | Opaque; needs model + vector store; over-surfaces loosely-related → noise | Rejected as primary |
| Hybrid (BM25 + embeddings) | Best recall+precision | More moving parts; α tuning needs a labeled eval set | **Target post-v1; α-flag wired now, default off** |

## 3. Recall-first floor (the surface-not-drop contract)
This is the floor ADR-0004's `noise` route MUST honor.

- A finding matching **any** `recall_priority: high` watch-list interest is **always surfaced** for triage —
  never auto-discarded — **even at low score**. The score governs **ordering**, not survival.
- **Negative-polarity** matches **demote** within the digest but never delete (Jimmy reviews — brief §89).
  `TODO(open-question: may a negative interest ever hard-suppress, or always only demote, given recall-first?)`
- **Tie-break:** recency, then number of distinct interests matched (breadth = stronger signal).

## 4. Optional embedding lane (alpha, gated)
The hybrid seam exists now so semantics can be added **without redesign** — raising `α` is a config change, not
a rewrite. It stays **off** until proven against a labeled eval set, because opacity is a real cost on a list
where lexical already captures most true positives.

| Aspect | v1 decision |
|---|---|
| Flag | `enable_embeddings: false` (default); `α: 0.0` |
| When to enable | Only after a labeled eval shows lexical-only **measurably misses** watch-list-adjacent work |
| Explainability | Report nearest interest + cosine, labeled "semantic" — never a bare number |
| Model | `TODO(open-question: local sentence-transformer vs API, given legal/ToS + own-store constraints)` |
| Eval | `TODO(open-question: the labeled set defining "high recall" + the default α it yields — no numbers asserted)` |

## 5. Human-gated versioned updates
Interests evolve via three channels, **all human-gated and versioned** (brief §36 use case, §89 "Jimmy is the
reviewer"). No learned profile in v1.

| Channel | Trigger | Effect | Guardrail |
|---|---|---|---|
| **Direct edit** | Jimmy edits `interests.yaml` | Recompile to `interests.json`; bump `version`; re-rank backlog | Git diff = full audit; rollback by version |
| **Feedback nudge** | `mark-feedback` op (ADR-0001) on a digest item | Adjust matched interests' `weight` by a small bounded clamped step; log to `interest-feedback.jsonl` | Never creates/deletes interests; never edits `terms` |
| **Suggestion queue** | Recurring high-relevance tokens/authors co-occurring with accepted findings | Propose candidate interests (`provenance: suggested`) into a review queue | **Inert** until Jimmy promotes — no silent watch-list growth (brief §88) |

- **Decay on schedule:** the cron Run applies `decay` so timely interests fade without manual pruning;
  decayed-to-floor interests surface in the suggestion queue for removal.
- **Re-prioritization is cheap:** scoring is a transparent sum over a small set, so an edit just re-runs scoring
  over the current backlog — no retraining.
- `TODO(open-question: feedback nudge step size + clamps; decay function shape/half-life per tier — no numbers asserted.)`

## 6. Watch-list seeding (brief §6)
The v1 artifact is seeded as the `memory-centric-dse` watch list with `recall_priority: high`, from brief §6:
memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall line; MemOS; SECDA-DSE;
TTT writeback / test-time compute memory traffic; Chakra / trace-based workload modeling; LLM-serving &
memory-hierarchy simulation. Seeding entries carry `provenance: seed-brief-§6`. A one-off `caw05 run --since
<date>` backfill (ADR-0006) sweeps history to populate the index before the first weekly run.
`TODO(open-question: confirm canonical author/venue ids for seed entries — e.g. Minsoo Rhu authorId.)`

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md). Carried from ADR-0002:
author/venue disambiguation; embedding model choice; the labeled eval set + default α; feedback step/clamps;
decay shape; whether negative interests may hard-suppress.

## Implications for runbooks
- **RB (interest store):** scaffold `interests.yaml` seeded from brief §6; compiler → `interests.json` with
  schema validation; `version` bump + git commit on every change.
- **RB (FTS5 index):** SQLite FTS5 over finding title/abstract/body with column weights; `bm25()` query that
  OR-expands positive terms; negate + per-batch min-max normalize.
- **RB (scorer):** additive formula emitting `relevance` + `relevance_explain[]` + `matched_watch_list`;
  embedding lane behind `enable_embeddings`/`α` (default off/0).
- **RB (recall gate):** enforce surface-not-drop for `recall_priority: high` matches before classify.
- **RB (feedback):** `mark-feedback` → `interest-feedback.jsonl`; bounded clamped nudge; inert suggestion queue.
- **RB (decay/re-rank):** cron step applies decay + re-runs scoring after any `version` change.
- Scores/explanations are **metadata only** — never mutate raw source content (brief §12).

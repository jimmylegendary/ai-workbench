# ADR-0002: Interest model — curated typed interests, BM25-first explainable relevance, human-gated updates

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0001-product-surface-and-outputs.md](ADR-0001-product-surface-and-outputs.md) (the `mark-feedback` op feeds updates)
  - [ADR-0003-source-adapters-and-ingestion.md](ADR-0003-source-adapters-and-ingestion.md) (supplies the `RawFinding`s scored here)
  - [ADR-0004-classification-and-triage.md](ADR-0004-classification-and-triage.md) (consumes the relevance score + recall floor)
  - [../02-research/interest-modeling.md](../02-research/interest-modeling.md) (schema, scoring formula, update channels)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide CAW-05's **load-bearing core** (brief §10): how interests are **represented**, how a finding's **relevance
is scored and explained**, and how interests are **updated**. It fixes a curated typed interest artifact, a
BM25-first additive scoring formula that decomposes into named contributions, a **recall-first surface-not-drop**
rule, and **human-gated** updates. It does NOT decide ingestion (ADR-0003), the classification taxonomy that
*consumes* this score (ADR-0004), the ledger, or synthesis — those are separate ADRs. Per brief §11/§12, v1 stays
**simple, explainable, high-recall on a narrow list — no heavy ML relevance model**.

## Context
- This is the decision the brief calls **load-bearing** (§10). Relevance ranking drives what surfaces for triage;
  getting it wrong silently loses a close paper — an existential novelty risk (§1).
- Design forces (interest-modeling research §Design forces): **high recall on a narrow watch list** (bias to
  surfacing, not filtering), **explainable** (every score decomposes into named signals), **v1 no heavy ML**
  (lexical first, embeddings optional), **findings are proposals, Jimmy reviews** (updates human-gated), **own
  store, markdown/JSON + lightweight index** (versioned YAML/JSON + SQLite FTS5, no external service).
- The watch list (§6) is **jargon-heavy proper nouns** — *MemOS, Chakra, DeepStack, Minsoo Rhu, MC-DLA,
  SECDA-DSE, TTT writeback* — exactly where exact/BM25 lexical matching captures most true positives, and where
  opaque embeddings risk over-surfacing noise.
- Generated content is never evidence (§12): relevance scores are **metadata over raw findings**; the scorer never
  rewrites source text.

## Options considered

### A. Interest representation
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Curated typed entries, versioned `interests.yaml` → compiled `interests.json`** | Human-readable control surface; per-entry weight/polarity/decay/provenance; git diff = audit | Hand-curated (by design) | **Chosen** |
| Learned user embedding / profile | Adapts automatically | Opaque, un-auditable, drifts, needs ML infra — violates §11/§12 | Rejected |
| Flat keyword list | Trivial | No types/weights/polarity → no explainable breakdown, no de-ranking of hype | Rejected |

### B. Relevance ranking spine
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Exact/alias match + BM25 via SQLite FTS5, additive per-interest contributions** | Inspectable tf-idf, no service, column weights (title>abstract>body), explainable by construction | Lexical only — misses paraphrase | **Chosen spine** |
| Dense embeddings primary | Best paraphrase recall | Opaque, needs model + vector store, over-surfaces loosely-related → noise | Rejected as primary |
| Hybrid BM25 + embeddings (RRF/weighted) | Best recall+precision | More moving parts; α tuning needs a labeled eval set | **Target post-v1; α-flag wired now, default off** |

### C. Filtering posture
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Recall-first: any `recall_priority: high` watch-list hit is always surfaced; score governs order, not survival** | Never silently drops a close paper (§1) | More items to triage | **Chosen** |
| Precision threshold gate (drop below τ) | Less reviewer load | A wrong drop = missed novelty = existential | Rejected |

### D. Update mechanism
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Human-gated: direct edit + bounded feedback nudge + inert suggestion queue, all versioned** | Jimmy is reviewer (§11); reversible; no scope-creep | Manual curation | **Chosen** |
| Auto-learning weights / auto-grow watch list | Hands-off | Silent drift + scope-creep (brief §88 non-goal); un-auditable | Rejected |

## Decision
**A small curated typed interest artifact, a BM25-first additive explainable relevance score with a recall-first
floor, and human-gated versioned updates.**

1. **Interest schema.** Interests live in a versioned `interests.yaml` (Jimmy's control surface) compiled to
   `interests.json`. Each entry has `id`, `type` (`keyword | topic | entity | author | venue`), `terms`/`aliases`,
   `weight`, `watch_list`, `polarity` (`positive | negative`), `decay` (`none | slow | fast`), `canonical_id`
   (for author/venue disambiguation), and `provenance`. Seeded from the brief §6 watch list as the
   `memory-centric-dse` list with `recall_priority: high`. Schema and field rationale per
   [interest-modeling.md](../02-research/interest-modeling.md) §1.
2. **Scoring formula (explainable by construction).**
   `relevance(finding) = Σ positive[weight × lane_score × decay] − Σ negative[weight × lane_score] + α × embedding_lane`,
   with `α = 0` default in v1. Lanes: **exact/alias match**, **BM25 lexical** (SQLite FTS5 `bm25()`, negated +
   min-max normalized per batch, column weights title>abstract>body), **entity/author/venue match** on
   `canonical_id` — all **core**; the **embedding lane** is optional behind `enable_embeddings`, default off.
   Every finding carries `relevance` **plus** a `relevance_explain[]` list of `{interest.id, type, lane, raw,
   contribution}` and `matched_watch_list`, rendered verbatim by triage (ADR-0004) and the digest (ADR-0001).
3. **Recall-first floor.** A finding matching **any** `recall_priority: high` watch-list interest is **always
   surfaced** for triage — never auto-discarded — even at low score. The score governs **ordering**, not survival.
   Negative-polarity matches **demote** within the digest but never delete. Tie-break: recency, then number of
   distinct interests matched. This floor is the contract ADR-0004's `noise` route must honor.
4. **Update mechanism (human-gated, versioned).** Three channels: **direct edit** (Jimmy edits `interests.yaml`;
   recompile, bump `version`, re-rank backlog; git diff = audit); **feedback nudge** (the `mark-feedback` op from
   ADR-0001 adjusts matched interests' `weight` by a small bounded clamped step, logged to
   `interest-feedback.jsonl`; never creates/deletes interests or edits `terms`); **suggestion queue** (recurring
   high-relevance tokens/authors proposed as `provenance: suggested`, inert until Jimmy promotes — no silent
   watch-list growth). `decay` is applied on the cron run so timely interests fade without manual pruning.
5. **Scores are metadata only.** The scorer never mutates raw source content (brief §12); explanations and scores
   are an annotation layer over the immutable finding.

## Consequences
- **Easy:** a reader always sees *why* something surfaced (named term/author/lane); an interest edit just re-runs a
  transparent sum over a small set — no retraining; the artifact fits on one screen and is fully git-auditable.
- **Easy:** the hybrid seam exists now (α-flagged embedding lane) so semantics can be added after a labeled eval
  without redesign.
- **Hard / cost:** lexical-only v1 can miss *new* work that avoids the known vocabulary — a real recall gap the
  embedding lane is reserved to close once measurable; FTS5 `bm25()` normalization (negate + per-batch min-max)
  must be implemented carefully so contributions stay comparable.
- **Follow-on:** ADR-0003 must deliver structured author/venue metadata so the entity lane can fire; ADR-0004
  consumes `relevance` + `relevance_explain[]` and inherits the recall-first floor; ADR-0001's `mark-feedback`
  op is the feedback channel. Runbooks: interest store + compiler/validator; FTS5 index; scorer emitting
  `relevance_explain[]`; recall-gate; feedback + suggestion queue; decay/re-rank cron step.

## Open questions / revisit triggers
- TODO(open-question: author/venue disambiguation — Semantic Scholar `authorId` vs ORCID vs name-string for
  *Minsoo Rhu*; homonyms and unaffiliated reposts.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: which embedding model for the optional lane — local vs API — given legal/ToS + own-store
  constraints, and is the added recall worth the opacity?)
- TODO(open-question: labeled eval set defining "high recall" for the narrow list, and the default α/threshold
  values it yields. No benchmark numbers asserted.)
- TODO(open-question: feedback nudge step size and clamps; decay function shape/half-life per tier.)
- TODO(open-question: may negative-polarity interests ever hard-suppress, or always only demote, given recall-first?)
- **Revisit trigger:** if lexical v1 measurably misses watch-list-adjacent work, enable the embedding lane (raise
  `α`) — not a redesign, a config change validated against the eval set.

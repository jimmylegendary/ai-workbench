# Classification & Triage

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - sibling: `./interest-model-and-ranking.md` (relevance scoring feeds classification) — TODO(link once written)
  - sibling: `./source-ingestion-and-dedup.md` (SourceAdapter, dedup, boundary) — TODO(link once written)
  - sibling: `./related-work-ledger-and-provenance.md` (the ledger this writes into) — TODO(link once written)
  - sibling: `./synthesis-and-output-formats.md` (consumes routed findings) — TODO(link once written)
  - export boundaries: CAW-02 / CAW-03 / CAW-01 / CAW-06 (each a separate product) — TODO(link export-boundaries doc)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **how CAW-05 classifies each finding and routes it**: the **classification taxonomy** (the
`novelty-threat / support / adjacent / noise` relevance class **and** the orthogonal `signal vs hype` score), the
**routing rules** that turn a classified finding into one of `knowledge / task / experiment / open-question /
discard`, and the **review & confidence model** (LLM-assisted classification, calibrated confidence, abstention,
human-in-the-loop). It does NOT design the interest model / relevance ranking (that feeds classification — sibling
doc), the source adapters or dedup (upstream), the related-work ledger internals or the export bundle schemas
(downstream — it only specifies what routing emits), or the synthesis/output formats. It assumes a deduped finding
with provenance already exists.

## 1. The one non-negotiable rule
**Classification is a proposal, never a decision; the LLM's label and rationale are generated text, not evidence.**
Per brief §11/§12, automatic collection generates *proposals*; Jimmy is the reviewer for strategic decisions. So
the classifier may *attach* a class, a confidence, and a rationale to a finding, but (1) the rationale is stored as
a `Note` (`evidence=false`) and can never back a downstream claim, (2) every routed output carries the finding's
**provenance** (source origin/date/retrieval URL) so the human and the importing product see the original artifact,
not the summary, and (3) a `novelty-threat` route is **advisory** to CAW-03 — CAW-05 never asserts that novelty is
lost, only that a candidate close result exists. This keeps sources, claims, and generated conclusions separate
across the export boundary.

## 2. Taxonomy — two orthogonal axes
A finding gets **two independent labels**. Collapsing them loses information: a hype-heavy blog post can still be a
genuine novelty-threat (it points at a real paper), and a rigorous paper can be pure noise (off the watch list).

### 2.1 Axis A — relevance class (vs. the watch list + interest model)
Anchored on the narrow radar watch list (brief §6: memory-centric DSE, memory device for LLM, DeepStack, Rhu /
MC-DLA / memory-wall line, MemOS, SECDA-DSE, TTT writeback, Chakra / trace-based workload modeling, LLM-serving &
memory-hierarchy simulation).

| Class | Definition | Example trigger | Default disposition |
|---|---|---|---|
| **novelty-threat** | Plausibly overlaps or pre-empts a CAW-03 claim / our strategy axis — could erase novelty | a paper proposing the same tiling-for-traffic idea we plan to claim | route → CAW-03 + open-question; **high recall, low threshold** |
| **support** | Strengthens our position: citable related work, a baseline, a corroborating result | a benchmark we can cite / compare against | route → knowledge (CAW-02 Source/Claim) |
| **adjacent** | On-topic but not directly threatening or supporting; context / future-axis | a survey of an adjacent accelerator class | route → knowledge (lower priority) or experiment idea |
| **noise** | Off the watch list, duplicate angle, or low-trust marketing | a vendor press release with no technical content | route → discard (logged, not deleted) |

### 2.2 Axis B — signal vs hype (credibility / substance)
A 0–1 score (bucketed `hype / mixed / signal`) **independent of relevance**. It gates *how* a finding flows, not
*whether*. Cheap, explainable features first (these are the v1 weak-supervision labeling functions, Snorkel-style),
LLM judgment second.

| Signal feature (raises) | Hype feature (lowers) |
|---|---|
| peer-reviewed / arXiv with code/artifact; reproducible | press release / launch blog with no method |
| concrete numbers + method + baseline | superlatives ("revolutionary", "10x") w/o measurement |
| named authors in the watch-list line (e.g. Rhu) | anonymous / aggregator re-post of a re-post |
| primary source | N-th-hand summary; we already have the primary |

Source-family trust priors (from ingestion) seed Axis B: `arXiv/conf ≈ high`, `lab blog/GitHub ≈ medium`,
`HN/Reddit/newsletter ≈ low` — adjusted by the features above. **Trust is carried, not re-derived** from the LLM.

## 3. The classified-finding record (provenance-first)
The classifier reads a deduped finding and writes one record into the related-work ledger. Every field that the LLM
produced is marked so review and downstream products can tell generated content from facts.

```yaml
classified_finding:
  finding_id: caw05-fnd-0001
  provenance:                       # carried from ingestion; NEVER synthesized
    source_family: arxiv|lab-blog|github|hn|reddit|securities|newsletter
    origin_url: https://arxiv.org/abs/...
    retrieved_at: 2026-..T..Z
    boundary: public                # brief §7; v1 ingest is public-only
    source_trust_prior: high|medium|low
    dedup_key: sha256:...           # set upstream; classifier does not re-dedup
  relevance:
    class: novelty-threat|support|adjacent|noise
    watchlist_hits: [memory-centric-dse, chakra]   # which interests matched
    confidence: 0.0-1.0             # calibrated (§5)
  signal:
    score: 0.0-1.0
    bucket: hype|mixed|signal
  rationale_note:                   # GENERATED — evidence=false, never backs a claim
    text: "Matches Chakra trace line; proposes ... overlaps planned claim P1-ladder"
    model: { name: TODO, version: TODO, prompt_hash: sha256:... }
    evidence: false
  method:
    labeler: lf+llm|llm|human        # provenance of the LABEL itself
    self_consistency: { samples: 3, agreement: 0.67 }   # §4
    abstained: false
  review:
    state: auto-accepted|queued|human-confirmed|human-overridden
    reviewer: jimmy|null
    decided_at: 2026-..T..Z|null
  routing:
    decision: knowledge|task|experiment|open-question|discard
    targets: [caw02, caw03]          # export adapters; explicit boundaries
    digest_eligible: true
```

Key properties: (1) `provenance` and `dedup_key` are upstream facts the classifier may read but not invent.
(2) `rationale_note.evidence=false` is the §1 invariant in the data model. (3) `method`/`review` record **who/what
assigned the label**, so the ledger is auditable end to end.

## 4. LLM-assisted classification pipeline
A **three-stage cascade**, cheap → expensive, so most findings never reach the LLM and the LLM never reaches the
human unless it is unsure. This keeps cost down and gives the recall the radar needs.

```
finding ──▶ [1] Labeling Functions (rules) ──▶ [2] LLM judge (self-consistent) ──▶ [3] Human review (selective)
              cheap, explainable               only when LFs weak/disagree         only when low-confidence /
              high-precision watchlist regex   classes A+B + rationale              novelty-threat / disagreement
```

1. **Labeling functions (LF).** Deterministic, explainable rules: watch-list keyword/author/venue regex →
   `novelty-threat` candidate; known-aggregator domain → `noise`; has-code + numbers → signal++. LFs are
   high-precision and produce the first-pass label + features. (Snorkel-style weak supervision: combine noisy LFs,
   keep their agreement/disagreement as a feature.) Because watch-list recall is existential, LF **misses fall
   through to the LLM** rather than defaulting to `noise`.
2. **LLM judge.** Invoked when LFs are weak, conflict, or a watch-list term is near-miss. One prompt returns **both
   axes + a rationale**, run **N=3 self-consistent samples**; the **agreement rate is the raw confidence signal**
   (low agreement = uncertain → escalate). LLM-as-judge is known to be self-inconsistent across seeds, so a single
   sample is never trusted. Token-probability / verbalized confidence is recorded but treated as a *secondary*,
   un-calibrated signal.
3. **Human review.** Only the slice §5 routes to a person. The human confirms/overrides; the override becomes a new
   labeled example that feeds LF/threshold tuning (active learning).

## 5. Review & confidence model (selective, recall-biased)
We do **selective prediction**: auto-accept high-confidence labels, **abstain → human** on low-confidence ones. The
abstention threshold is the knob that trades human effort for accuracy. Two properties make this safe: calibration
(so the threshold means something) and an **asymmetric cost** (a missed novelty-threat is far worse than a false
alarm — brief §1).

| Confidence (calibrated) | Class | Action | Rationale |
|---|---|---|---|
| high (≥ τ_high) | support / adjacent / noise | **auto-accept**, route | bulk; low cost if wrong |
| any | **novelty-threat** | **always queue for human** (even if high-conf) | existential cost; recall > precision |
| mid (τ_low–τ_high) | any | **queue for human** | model unsure |
| low (< τ_low) **or** self-consistency disagreement | any | **abstain → queue**, never silent-discard | a silent wrong `noise` = missed paper |

- **Recall-first floor:** a finding is **never auto-discarded as `noise`** if it has ≥1 watch-list hit; it queues
  instead. False positives cost a reviewer a few seconds; a false negative can erase novelty.
- **Calibration:** raw scores (LF agreement + LLM self-consistency + verbalized confidence) are mapped to a
  calibrated probability via a small logistic fit on Jimmy's confirm/override history (50–100 labels suffice for a
  usable calibration). Track ECE; recalibrate when override rate drifts.
- **Confidence inputs (ranked):** (1) LF/LLM agreement, (2) N-sample self-consistency, (3) watch-list match
  specificity, (4) source trust prior, (5) verbalized confidence (weakest).
- **Review queue & SLA:** queued findings surface in the weekly digest's "needs-review" section; `novelty-threat`
  is flagged for same-cycle review. Nothing is exported until its `review.state ∈ {auto-accepted, human-confirmed,
  human-overridden}`.

τ_high / τ_low are **config, not constants** (start conservative, tune from the override log). Initial values are an
open question — do not hard-code numbers.

## 6. Routing rules (classification → destination → export)
Routing is a deterministic function of `(relevance class, signal bucket, review state)`. It maps to the five
dispositions in brief §2/§5 and the export boundaries in brief §8. CAW-05 **emits export bundles across explicit
file/API boundaries**; it never writes into another product's store.

| Relevance | Signal | Disposition | Export target(s) | Notes |
|---|---|---|---|---|
| novelty-threat | signal/mixed | **open-question** + flag | **CAW-03** (novelty signal), **CAW-01/CAW-06** (open question) | advisory only; human-confirmed before export |
| novelty-threat | hype | **open-question** (low pri) | CAW-03 | still surfaced — recall floor; marked low-signal |
| support | signal | **knowledge** | **CAW-02** as Source/Claim/RelatedWork | the canonical "becomes citable" path |
| support | mixed/hype | **knowledge** (watchlist only) else discard | CAW-02 | hype support is usually redundant |
| adjacent | signal | **knowledge** (low pri) **or** **experiment** | CAW-02; experiment idea note | future-workload-axis material |
| adjacent | mixed/hype | **discard** (logged) | — | unless watch-list hit → queue |
| noise | any | **discard** (logged, not deleted) | — | retained for audit + dedup memory |
| (actionable, any class) | — | **task** | CAW-06 / digest action-brief | e.g. "read & compare against baseline X" |

Mapping to brief's five routes: **knowledge** → CAW-02; **open-question** → CAW-01 + CAW-06; **task** → CAW-06 /
action-brief; **experiment** → experiment-idea note (digest; candidate CAW-01 input); **discard** → logged tombstone
(kept for dedup + audit, never hard-deleted). A single finding may produce **multiple** routes (e.g. a
novelty-threat is both an open-question to CAW-01 *and* a novelty signal to CAW-03).

## 7. Generalization (the seam, per brief §5/§9)
Classification is a **policy object behind ports**, not hard-coded logic:
- **Classifier port.** v1 = LF + LLM cascade; the contract is `finding → {relevance, signal, confidence,
  rationale_note}`. A future fine-tuned model or a different LLM adapter must satisfy the same shape; routing does
  not know which classifier produced the label.
- **Routing table is config.** The §6 matrix is a named **triage profile** (`profile: narrow-radar-weekly`). New
  watch-list lines or export targets = new profile rows, not core changes.
- **ExportAdapter-agnostic.** Routing emits a neutral `routed_finding`; the per-target bundle shape (CAW-02 vs
  CAW-03) lives in each ExportAdapter. The classifier never imports another product's schema.
- The invariant **no profile can relax:** generated rationale is `evidence=false`, and `novelty-threat` is never
  silently auto-discarded.

## Open Questions
- TODO(open-question: initial τ_high / τ_low and the N for self-consistency — set empirically from the first weeks' override log; do not hard-code.)
- TODO(open-question: is `signal-vs-hype` a single score or per-feature vector surfaced to the reviewer? lean: score + top contributing features.)
- TODO(open-question: which LLM/model + prompt for the judge stage, and is it local or API? cross-cuts cost/latency and the claude-api choice — owned with the classification ADR.)
- TODO(open-question: do `task` and `experiment` routes export anywhere in v1, or only appear in the digest until CAW-01/CAW-06 contracts firm up? cross-boundary.)
- TODO(open-question: retention/TTL for `discard` tombstones — how long do we keep noise for dedup memory + audit?)
- TODO(open-question: multi-label relevance — can one finding be both support AND novelty-threat? lean: yes, store a set, route the union.)
- TODO(open-question: how is calibration data captured without leaking confidential review context into a public-facing model? owned with guardrails.)
- See `../08-research-plan/open-questions.md` (to be created).

## Implications for runbooks
- **RB (labeling functions):** implement watch-list LFs (keyword/author/venue regex, aggregator-domain noise rule,
  has-code/has-numbers signal features); LF miss on a watch-list term must **fall through to the LLM**, never default
  to `noise`. Emit features + per-LF votes for the confidence model.
- **RB (LLM classifier):** one prompt → both axes + rationale; run N self-consistent samples; record agreement,
  `model.version`, `prompt_hash`; store rationale as `Note(evidence=false)`. Acceptance: a single-sample run is never
  emitted as final.
- **RB (confidence + review queue):** implement calibrated scoring (logistic fit over override log; track ECE);
  selective routing per §5; **never auto-discard a watch-list-hit finding**; always queue `novelty-threat`. Persist
  `review.state` and block export until confirmed.
- **RB (routing engine):** implement §6 as a **config-selected triage profile**; support multi-route findings; emit
  a neutral `routed_finding` consumed by ExportAdapters. Acceptance tests: each row in the §6 table + negative tests
  (N1: high-conf `noise` with a watch-list hit must queue, not discard; N2: rationale passed as evidence is refused;
  N3: export attempted before review-confirmed is refused).
- **RB (ports/config):** classifier and routing behind their ports; triage profile + thresholds in config; the
  "generated rationale is not evidence" + "novelty-threat never silent-discard" invariants hold across all profiles.

Sources: [Snorkel: Rapid Training Data Creation with Weak Supervision (arXiv:1711.10160)](https://arxiv.org/abs/1711.10160),
[Snorkel AI — Active learning and weak supervision](https://docs.snorkel.ai/docs/25.4/user-guide/intro/active-learning-weak-supervision/),
[Rating Roulette: Self-Inconsistency in LLM-as-a-Judge Frameworks (arXiv:2510.27106)](https://arxiv.org/pdf/2510.27106),
[A survey on LLM-as-a-judge (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2666675825004564),
[The Art of Abstention: Selective Prediction and Error Regularization for NLP](https://www.researchgate.net/publication/353492014_The_Art_of_Abstention_Selective_Prediction_and_Error_Regularization_for_Natural_Language_Processing),
[Confidence-Based Abstention (EmergentMind)](https://www.emergentmind.com/topics/confidence-based-abstention),
[Calibration in ML: Confidence, Accuracy & ECE](https://mbrenndoerfer.com/writing/calibration-machine-learning-confidence-accuracy-ece).

# ADR-0004: Classification & triage — two-axis taxonomy, LF+LLM cascade, recall-biased review, config-driven routing

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0001-product-surface-and-outputs.md](ADR-0001-product-surface-and-outputs.md) (the `confirm`/`export` review gate; digest renders rationale)
  - [ADR-0002-interest-model.md](ADR-0002-interest-model.md) (relevance score + recall floor feed classification)
  - [ADR-0003-source-adapters-and-ingestion.md](ADR-0003-source-adapters-and-ingestion.md) (deduped findings + trust priors)
  - [../02-research/classification-and-triage.md](../02-research/classification-and-triage.md) (taxonomy, cascade, confidence model, routing matrix)
  - [../02-research/related-work-ledger.md](../02-research/related-work-ledger.md) (the ledger routing writes into + export bundles)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide **how CAW-05 classifies each finding and routes it**: the **two-axis taxonomy**
(`novelty-threat / support / adjacent / noise` relevance class **and** an orthogonal `signal-vs-hype` score), the
**LF + LLM + human cascade** that assigns labels, the **recall-biased selective-review** model, and the
**config-driven routing** to `knowledge / task / experiment / open-question / discard` with exports to
CAW-01/02/03/06. It does NOT decide the interest/relevance ranking it consumes (ADR-0002), ingestion/dedup
(ADR-0003), the ledger schema or export wire format (consumes them as a stable boundary), or synthesis. It assumes
a deduped, scored finding with provenance already exists.

## Context
- **The one non-negotiable rule** (brief §11/§12): **classification is a proposal, never a decision; the LLM's
  label and rationale are generated text, not evidence.** The classifier may *attach* a class/confidence/rationale,
  but the rationale is stored as a `Note(evidence=false)` that can never back a downstream claim, every routed
  output carries provenance, and a `novelty-threat` route is **advisory** to CAW-03 (we never assert novelty is
  lost, only that a candidate close result exists).
- **Asymmetric cost** (§1): a missed `novelty-threat` is far worse than a false alarm. So the whole pipeline is
  **recall-biased** — it inherits ADR-0002's surface-not-drop floor and adds a never-silent-discard rule.
- Two axes are **orthogonal** (classification research §2): a hype-heavy blog can still point at a real
  novelty-threat; a rigorous paper can be pure off-watch-list noise. Collapsing them loses information.
- Per-source `trust` priors from ADR-0003 seed the signal axis (`arXiv/conf ≈ high`, `lab blog/GitHub ≈ medium`,
  `HN/Reddit/newsletter ≈ low`) — **carried, not re-derived** by the LLM.
- The classifier and routing are **policy objects behind ports** (§5, §9): a future model satisfies the same
  `finding → {relevance, signal, confidence, rationale_note}` shape; routing is a named, config-selected profile.

## Options considered

### A. Taxonomy shape
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Two orthogonal axes: relevance class (4) × signal-vs-hype (0–1 bucketed)** | Keeps "real but hyped" and "rigorous but irrelevant" distinct; gates *how* vs *whether* a finding flows | Two labels to assign/review | **Chosen** |
| Single combined relevance+credibility label | Fewer states | Conflates substance with relevance → loses a hyped pointer to a real threat | Rejected |

### B. Classification pipeline
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Three-stage cascade: labeling functions → self-consistent LLM judge (N samples) → selective human review** | Cheap→expensive; most findings never reach the LLM, LLM never reaches the human unless unsure; LF agreement + LLM self-consistency = confidence signal | Cascade + calibration to build | **Chosen** |
| LLM-only on every finding | Simple wiring | Costly; self-inconsistent across seeds; no cheap explainable first pass | Rejected |
| Rules-only | Cheap, explainable | Brittle; misses near-phrasings → recall risk on the narrow list | Rejected |

### C. Review / confidence model
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Selective prediction: auto-accept high-confidence; abstain→human on low; ALWAYS queue novelty-threat; never auto-discard a watch-list hit** | Recall-first; asymmetric cost honored; calibrated threshold = real knob | Needs a calibration fit + reviewer time | **Chosen** |
| Auto-accept everything | Zero human load | A silent wrong `noise` = missed paper = existential | Rejected |
| Human-review everything | Max precision | Defeats automation; unscalable | Rejected |

### D. Routing
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Deterministic config-selected triage profile: `(relevance, signal, review state) → disposition + export target(s)`; multi-route allowed** | Auditable; new watch-list lines/targets = new profile rows, not core edits; one finding can route to several targets | Profile table to maintain | **Chosen** |
| Hard-coded routing logic | Direct | Every new target/line = core change; not the §9 seam | Rejected |

## Decision
**A two-axis taxonomy assigned by an LF→LLM→human cascade, a recall-biased selective-review gate, and
deterministic config-driven routing — all behind classifier/routing ports, with generated rationale never
evidence and novelty-threat never silently discarded.**

1. **Taxonomy (two orthogonal axes).** **Axis A — relevance class** vs the watch list:
   `novelty-threat | support | adjacent | noise` (definitions + default dispositions per classification research
   §2.1). **Axis B — signal-vs-hype** (0–1, bucketed `hype | mixed | signal`), seeded by the ADR-0003 source-trust
   prior and adjusted by cheap explainable features (has-code/numbers/method/baseline raise; superlatives /
   press-release / N-th-hand lower). Axis B gates *how* a finding flows, not *whether*.
2. **Classified-finding record (provenance-first).** The classifier reads a deduped, scored finding and writes one
   record (classification research §3) with `provenance` + `dedup_key` (upstream facts, never invented),
   `relevance{class, watchlist_hits, confidence}`, `signal{score, bucket}`, a
   `rationale_note{text, model, evidence:false}`, `method{labeler, self_consistency, abstained}`,
   `review{state, reviewer, decided_at}`, and `routing{decision, targets, digest_eligible}`. The
   `rationale_note.evidence=false` flag is the §1 invariant encoded in the data model.
3. **Three-stage cascade.** (1) **Labeling functions** — deterministic, high-precision watch-list keyword/author/
   venue regex, known-aggregator-domain `noise` rule, has-code/has-numbers signal features; **an LF miss on a
   watch-list term falls through to the LLM, never defaults to `noise`**. (2) **LLM judge** — invoked when LFs are
   weak/conflict/near-miss; one prompt returns **both axes + rationale**, run **N self-consistent samples** whose
   agreement is the raw confidence; a single sample is never trusted. (3) **Human review** — only the slice §5
   routes to a person; an override becomes a labeled example for LF/threshold tuning.
4. **Recall-biased selective review.** Auto-accept high-confidence `support/adjacent/noise`; **always queue
   `novelty-threat`** (even high-confidence — existential cost); queue mid-confidence; **abstain→queue on low
   confidence or self-consistency disagreement, never silent-discard.** **Recall-first floor:** a finding with ≥1
   watch-list hit is **never auto-discarded as `noise`** — it queues (honoring ADR-0002's surface-not-drop).
   Confidence is **calibrated** (small logistic fit over Jimmy's confirm/override history; track ECE). `τ_high`/
   `τ_low`/`N` are **config, not constants** — start conservative, tune from the override log. **Nothing exports
   until `review.state ∈ {auto-accepted, human-confirmed, human-overridden}`** (enforced by ADR-0001's
   proposal-only `confirm`/`export` ops).
5. **Config-driven routing.** A deterministic function of `(relevance class, signal bucket, review state)` selected
   by a named **triage profile** (`profile: narrow-radar-weekly`, classification research §6). Mapping to the five
   brief routes: **knowledge → CAW-02** (Source/Claim/RelatedWork); **open-question → CAW-01 + CAW-06**;
   **task → CAW-06 / action-brief**; **experiment → experiment-idea note**; **discard → logged tombstone** (kept
   for dedup + audit, never hard-deleted). `novelty-threat` routes to **CAW-03** (advisory novelty signal) **and**
   an open-question to CAW-01/CAW-06 — a finding may take **multiple routes**. Routing emits a neutral
   `routed_finding`; per-target bundle shape lives in each `ExportAdapter` (the classifier never imports another
   product's schema).
6. **The invariant no profile can relax:** generated rationale is `evidence=false`, and `novelty-threat` is never
   silently auto-discarded.

## Consequences
- **Easy:** most findings clear on cheap LFs; the LLM and the human are spent only where uncertainty is real;
  a reader sees the named rationale + the relevance_explain from ADR-0002; new watch-list lines or export targets
  are profile rows, not core edits.
- **Easy:** the export boundary stays clean — CAW-02/03/01/06 receive provenance + `evidence:false` rationale and
  re-classify; CAW-05 never writes into their stores (brief §8).
- **Hard / cost:** calibration needs ~50–100 labeled decisions before the threshold means anything; LLM
  self-inconsistency forces N-sample runs (cost/latency); the LLM/model + prompt choice is an open question
  cross-cutting the claude-api decision.
- **Follow-on:** the ledger (related-work research) persists these as append-only `LedgerLink`s and verifies papers
  via Semantic Scholar before export; synthesis (synthesis research) renders confirmed findings into the five
  formats with the provenance manifest. Runbooks: labeling functions (LF miss → LLM, never `noise`); LLM
  classifier (N samples, `prompt_hash`, rationale as `Note(evidence=false)`); confidence + review queue
  (calibrated, never auto-discard watch-list hits, block export pre-confirm); routing engine (config profile,
  multi-route, neutral `routed_finding`) with negative tests N1–N3.

## Open questions / revisit triggers
- TODO(open-question: initial `τ_high`/`τ_low` and `N` for self-consistency — set empirically from the first
  weeks' override log; do not hard-code.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: is signal-vs-hype a single score or a per-feature vector surfaced to the reviewer? lean:
  score + top contributing features.)
- TODO(open-question: which LLM/model + prompt for the judge stage, local or API? cross-cuts cost/latency and the
  claude-api choice — owned here.)
- TODO(open-question: do `task`/`experiment` routes export anywhere in v1, or only appear in the digest until
  CAW-01/CAW-06 contracts firm up?)
- TODO(open-question: retention/TTL for `discard` tombstones — how long for dedup memory + audit?)
- TODO(open-question: multi-label relevance — can one finding be both `support` AND `novelty-threat`? lean: yes,
  store a set, route the union.)
- TODO(open-question: capturing calibration data without leaking confidential review context into a public-facing model.)
- **Revisit trigger:** if a profile or surface ever needs to relax `evidence=false` or auto-discard a watch-list
  hit, stop — that is the one invariant no profile may relax.

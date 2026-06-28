# Radar Core — Classification & Triage

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth — §5 core domain, §11 non-goals, §12 guardrails)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (the decision this elaborates)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md) (relevance score + recall floor feed Axis A)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (deduped finding + trust priors)
  - [../02-research/classification-and-triage.md](../02-research/classification-and-triage.md) (taxonomy, cascade, confidence model, routing matrix — full citations)
  - sibling: [./related-work-ledger.md](./related-work-ledger.md) (the ledger routing writes into; relation = class minus noise)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO: create)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the **radar-core build contract** for classification and triage: the concrete component boundaries, data
shapes, cascade control flow, gate predicates, and routing engine an AI builder implements inside one **Run**. It
turns ADR-0004 (the decision) and [../02-research/classification-and-triage.md](../02-research/classification-and-triage.md)
(the rationale + citations) into something codeable. It does NOT re-argue the taxonomy or re-cite the literature
(see the research doc), define the interest/relevance score it consumes (ADR-0002), define ingestion/dedup
(ADR-0003), or define the ledger schema / export wire format (see [./related-work-ledger.md](./related-work-ledger.md)).
It assumes a **deduped, scored `Finding` with provenance** already exists on the Run's working set.

## 1. The invariant this core enforces (do not relax)
Two rules are encoded in the data model and checked by negative tests; **no triage profile may relax either**:

1. **Generated rationale is never evidence.** Any text the LLM produced is stored under `rationale_note` with
   `evidence: false`. It can prompt a human, render in a digest, or explain a route — it can **never** be the
   backing for a downstream claim. The backing is always the provenance + (post-verification) the source locator.
2. **`novelty-threat` is never silently auto-discarded.** A finding with ≥1 watch-list hit is **never** auto-routed
   to `discard`; at worst it queues for human review. A missed close paper is an existential novelty risk (brief §1).

These are the brief §12 guardrails ("keep sources, claims, evidence, generated conclusions separate"; "automatic
collection is proposal generation; Jimmy is the reviewer") made executable.

## 2. Component map (within one Run)
```
                 deduped+scored Finding (from ingestion + interest model)
                                   │
                          ┌────────▼─────────┐
                          │  LF stage         │  deterministic, explainable
                          │  (labeling fns)   │  watch-list regex, aggregator rule, signal features
                          └────────┬─────────┘
                  strong+agreeing  │  weak / conflict / near-miss
                ┌──────────────────┴──────────────────┐
                ▼                                      ▼
        (skip LLM, cheap label)            ┌──────────────────┐
                │                          │  LLM judge        │  N self-consistent samples
                │                          │  (Classifier port)│  → both axes + rationale_note
                │                          └────────┬─────────┘
                └───────────────┬───────────────────┘
                                ▼
                       ┌──────────────────┐
                       │  Confidence +     │  calibrate → selective gate
                       │  selective review │  (recall-biased; never silent-discard)
                       └────────┬─────────┘
                  auto-accepted │ queued → human → confirmed/overridden
                                ▼
                       ┌──────────────────┐
                       │  Routing engine   │  config triage profile
                       │  (Routing port)   │  → routed_finding (multi-route)
                       └────────┬─────────┘
                                ▼
            ledger LedgerLink  +  export bundles (see ./related-work-ledger.md)
```
Both the **Classifier** and **Routing** stages are policy objects behind ports (brief §9): a future fine-tuned
model satisfies the same `finding → {relevance, signal, confidence, rationale_note}` contract; routing is a named,
config-selected profile, not hard-coded logic.

## 3. The two-axis taxonomy
Two **orthogonal** labels per finding. Collapsing them loses information (a hyped blog can point at a real threat; a
rigorous paper can be pure off-list noise). Axis A decides *whether/where* a finding flows; Axis B gates *how*.

### 3.1 Axis A — relevance class (vs. the watch list)
Anchored on the narrow watch list (brief §6).

| Class | Definition | Default disposition |
|---|---|---|
| **novelty-threat** | Plausibly overlaps / pre-empts a CAW-03 claim or our strategy axis | route → CAW-03 (advisory) + open-question; **always queue**; recall-first |
| **support** | Citable related work, baseline, corroborating result | route → knowledge (CAW-02 Source/Claim/RelatedWork) |
| **adjacent** | On-topic context / future-axis, not directly threat/support | route → knowledge (low pri) or experiment idea |
| **noise** | Off-list, duplicate angle, low-trust marketing | route → discard (logged tombstone, never hard-deleted) |

### 3.2 Axis B — signal vs hype (substance, 0–1, bucketed)
Seeded by the ADR-0003 source-trust prior (`arXiv/conf ≈ high`, `lab blog/GitHub ≈ medium`, `HN/Reddit/newsletter ≈
low`) — **carried, not re-derived by the LLM** — then adjusted by cheap explainable features.

| Raises (→ `signal`) | Lowers (→ `hype`) |
|---|---|
| arXiv/peer-reviewed + code/artifact; reproducible | press release / launch blog, no method |
| concrete numbers + method + baseline | superlatives ("revolutionary", "10x") w/o measurement |
| named watch-list author (e.g. Rhu) | anonymous / aggregator re-post of a re-post |
| primary source | N-th-hand summary; primary already held |

Buckets: `hype | mixed | signal` (cut points are config, not constants — TODO(open-question)). Axis B never sends a
finding to `discard` on its own — a `novelty-threat × hype` finding is still surfaced (recall floor).

## 4. The classified-finding record
The single record each finding produces; written into the ledger. Every LLM-produced field is flagged so review and
importing products distinguish generated content from facts.

```yaml
classified_finding:
  finding_id: caw05-fnd-0001
  provenance:                       # carried from ingestion; NEVER synthesized
    source_family: arxiv|lab-blog|github|hn|reddit|securities|newsletter
    origin_url: https://arxiv.org/abs/...
    retrieved_at: <RFC3339>
    boundary: public                # brief §7; v1 ingest is public-only
    source_trust_prior: high|medium|low
    dedup_key: sha256:...           # set upstream; classifier does not re-dedup
  relevance:
    class: novelty-threat|support|adjacent|noise
    watchlist_hits: [memory-centric-dse, chakra]   # which interests matched
    confidence: 0.0-1.0             # calibrated (§6)
  signal:
    score: 0.0-1.0
    bucket: hype|mixed|signal
  rationale_note:                   # GENERATED — evidence=false, never backs a claim
    text: "Matches Chakra trace line; overlaps planned claim P1-ladder"
    model: { name: TODO, version: TODO, prompt_hash: sha256:... }
    evidence: false
  method:
    labeler: lf|lf+llm|llm|human    # provenance of the LABEL itself
    self_consistency: { samples: 3, agreement: 0.67 }
    abstained: false
  review:
    state: auto-accepted|queued|human-confirmed|human-overridden
    reviewer: jimmy|null
    decided_at: <RFC3339>|null
  routing:
    decision: knowledge|task|experiment|open-question|discard
    targets: [caw02, caw03]         # export adapters; explicit boundaries
    digest_eligible: true
```
Invariants in the shape: `provenance`/`dedup_key` are read-only upstream facts; `rationale_note.evidence=false` is
the §1 rule in data; `method`/`review` make the label's authorship auditable end-to-end.

## 5. The LF→LLM→human cascade
Cheap → expensive, so most findings clear on rules, the LLM is spent only on uncertainty, and the human only on the
slice §6 selects.

| Stage | Trigger to run it | Output | Cost posture |
|---|---|---|---|
| **1. Labeling functions** | always | first-pass class + per-LF votes + signal features | cheap, deterministic |
| **2. LLM judge** (Classifier port) | LFs weak / conflicting / watch-list near-miss | both axes + `rationale_note`, `agreement` over N samples | metered (N calls) |
| **3. Human review** | only the §6 review slice | confirm / override → labeled example | scarce |

**Stage 1 — labeling functions.** Deterministic high-precision rules: watch-list keyword/author/venue regex →
`novelty-threat` candidate; known-aggregator domain → `noise` candidate; `has-code`/`has-numbers`/`has-baseline` →
signal++. Snorkel-style: combine noisy LFs, keep their agreement as a confidence feature. **Critical recall rule:
an LF miss on a watch-list term falls through to the LLM — it never defaults to `noise`.**

**Stage 2 — LLM judge.** Invoked only when LFs are weak/conflicting/near-miss. ONE prompt returns **both axes + a
rationale**; run **N self-consistent samples** and use the **agreement rate as the raw confidence signal** (LLM-as-
judge is self-inconsistent across seeds, so a single sample is never trusted). Record `model.version` + `prompt_hash`.
Verbalized/token-prob confidence is logged but treated as a weak, un-calibrated secondary signal.

**Stage 3 — human review.** The reviewer confirms or overrides; every override becomes a labeled example that tunes
LFs and recalibrates the gate (active learning).

## 6. Selective-review gate (recall-biased)
Selective prediction: auto-accept high-confidence labels; **abstain → human** otherwise; **never silent-discard**.
Asymmetric cost (brief §1) means a false positive costs the reviewer seconds, a false negative can erase novelty.

| Calibrated confidence | Class | Action |
|---|---|---|
| high (≥ `τ_high`) | support / adjacent / noise | **auto-accept**, route |
| any | **novelty-threat** | **always queue** (even high-conf) — existential cost |
| mid (`τ_low`–`τ_high`) | any | **queue** — model unsure |
| low (< `τ_low`) **or** self-consistency disagreement | any | **abstain → queue**; never discard |

- **Recall-first floor.** A finding with ≥1 watch-list hit is **never** auto-discarded as `noise` — it queues
  (honors ADR-0002's surface-not-drop floor).
- **Calibration.** Map raw scores (LF agreement, N-sample self-consistency, watch-list specificity, source-trust
  prior, verbalized confidence) to a calibrated probability via a small logistic fit over Jimmy's confirm/override
  history; track ECE; recalibrate when override rate drifts. ~50–100 labels make the threshold meaningful.
- **`τ_high` / `τ_low` / `N` are config, not constants** — start conservative, tune from the override log.
  TODO(open-question: initial values — set empirically; do not hard-code.)
- **Export gate.** Nothing exports until `review.state ∈ {auto-accepted, human-confirmed, human-overridden}`
  (enforced with ADR-0001's proposal-only `confirm`/`export` ops). Queued items surface in the digest "needs-review"
  section; `novelty-threat` is flagged for same-cycle review.

## 7. Deterministic routing engine
Routing is a **deterministic function of `(relevance class, signal bucket, review state)`** selected by a named
**triage profile** (`profile: narrow-radar-weekly`). New watch-list lines or export targets are new profile rows,
not core edits. A finding may take **multiple routes**.

| Relevance | Signal | Disposition | Export target(s) |
|---|---|---|---|
| novelty-threat | signal/mixed | **open-question** + flag | **CAW-03** (advisory) + **CAW-01/CAW-06** |
| novelty-threat | hype | **open-question** (low pri) | CAW-03 — still surfaced (recall floor), marked low-signal |
| support | signal | **knowledge** | **CAW-02** (Source/Claim/RelatedWork) |
| support | mixed/hype | **knowledge** (watch-list only) else discard | CAW-02 |
| adjacent | signal | **knowledge** (low pri) or **experiment** | CAW-02; experiment-idea note |
| adjacent | mixed/hype | **discard** (logged) | — unless watch-list hit → queue |
| noise | any | **discard** (logged tombstone) | — kept for dedup + audit |
| (actionable, any) | — | **task** | CAW-06 / action-brief |

Mapping to the brief's five routes: **knowledge → CAW-02**; **open-question → CAW-01 + CAW-06**; **task → CAW-06 /
action-brief**; **experiment → experiment-idea note** (digest; candidate CAW-01 input); **discard → logged
tombstone** (dedup + audit, never hard-deleted). Routing emits a neutral `routed_finding`; the per-target bundle
shape lives in each `ExportAdapter` (the classifier never imports another product's schema — see
[./related-work-ledger.md](./related-work-ledger.md) §4).

## 8. Builder acceptance — negative tests (must hold)
| ID | Scenario | Required behavior |
|---|---|---|
| N1 | high-confidence `noise` with a watch-list hit | **queue**, not discard (recall floor) |
| N2 | `rationale_note` passed as a claim's evidence | **refused** (`evidence=false`) |
| N3 | export attempted before `review.state` confirmed | **refused** |
| N4 | LF miss on a watch-list term | falls through to LLM, **never** defaults to `noise` |
| N5 | single-sample LLM run emitted as final | **refused** (N≥2 self-consistency required) |

## Open Questions
- TODO(open-question: initial `τ_high`/`τ_low` and `N` — from the first weeks' override log; do not hard-code.)
- TODO(open-question: signal-vs-hype as a single score or a per-feature vector to the reviewer? lean: score + top features.)
- TODO(open-question: which LLM/model + prompt for the judge stage, local or API? cross-cuts cost/latency + the claude-api choice.)
- TODO(open-question: do `task`/`experiment` routes export in v1, or only appear in the digest until CAW-01/CAW-06 contracts firm up?)
- TODO(open-question: retention/TTL for `discard` tombstones — dedup memory + audit window.)
- TODO(open-question: multi-label relevance — can one finding be both `support` AND `novelty-threat`? lean: yes, store a set, route the union.)
- TODO(open-question: capturing calibration data without leaking confidential review context into a public-facing model.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (to be created).

## Implications for runbooks
- **RB (labeling functions):** watch-list LFs (keyword/author/venue regex, aggregator-domain noise rule,
  has-code/has-numbers/has-baseline signal features); LF miss → LLM, never `noise`; emit features + per-LF votes.
- **RB (LLM classifier):** one prompt → both axes + rationale; N self-consistent samples; record `agreement`,
  `model.version`, `prompt_hash`; store rationale as `Note(evidence=false)`. Acceptance: N5.
- **RB (confidence + review queue):** calibrated logistic scoring (track ECE); selective gate per §6; never
  auto-discard a watch-list hit; always queue `novelty-threat`; persist `review.state`; block export pre-confirm.
- **RB (routing engine):** §7 as a config-selected triage profile; multi-route; neutral `routed_finding`.
  Acceptance: each §7 row + N1–N3.
- **RB (ports/config):** Classifier + Routing behind ports; profile + thresholds in config; the two §1 invariants
  hold across all profiles.

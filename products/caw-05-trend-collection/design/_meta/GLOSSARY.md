# GLOSSARY — Ubiquitous Language (CAW-05)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on first review)
- **Related:** [PRODUCT-BRIEF](./PRODUCT-BRIEF.md), [DOC-CONVENTIONS](./DOC-CONVENTIONS.md), [ADR-0001](../01-decisions/ADR-0001-product-surface-and-outputs.md), [ADR-0002](../01-decisions/ADR-0002-interest-model.md), [ADR-0003](../01-decisions/ADR-0003-source-adapters-and-ingestion.md), [ADR-0004](../01-decisions/ADR-0004-classification-and-triage.md), [ADR-0005](../01-decisions/ADR-0005-related-work-ledger.md), [ADR-0006](../01-decisions/ADR-0006-storage-and-scheduling.md), [ADR-0007](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** ./PRODUCT-BRIEF.md

## Purpose
This document fixes the **ubiquitous language** for CAW-05 — the early-warning radar. Every design doc, ADR,
and runbook MUST use these terms with these meanings. It is a dictionary, not a decision record: it does NOT
re-decide anything (ADRs own decisions) and does NOT define internal facts, dates, or numbers. Where a term's
exact value is undecided, it is marked `TODO(open-question: ...)`. When a term appears in a sibling doc, that
doc should link here rather than re-defining it.

## How to read this glossary
Terms are grouped by domain area. Each entry gives a one-line definition, then the canonical rule(s) that keep
usage consistent. Cross-product names always appear as "CAW-0X, a separate product" — never as a shared store.

---

## 1. Product identity & boundaries

| Term | Definition |
| --- | --- |
| **CAW-05** | This product: Periodic Trend Collection & Synthesis, the early-warning **radar**. Independent, standalone, own core/data/deploy. |
| **Radar** | The product's role metaphor: it scans public sources to **protect novelty** — missing one close paper/system can erase the novelty of the whole strategy. Implies **high recall** on the narrow watch list. |
| **CAW-0X** | Any sibling product in the `ai-workbench` family of 6. Referenced ONLY across explicit boundaries. v1 export targets: **CAW-02** (knowledge), **CAW-03** (paper novelty), **CAW-01** and **CAW-06** (open questions). |
| **Boundary** | An explicit file/API seam between two independent products. CAW-05 ingests public sources (read-only) across an inbound boundary and exports bundles across outbound boundaries. **No shared runtime substrate / store / registry.** |
| **Independence contract** | The rule that CAW-05's core, data, and surfaces are its own; integration happens only through ports + boundaries. |

---

## 2. Interest model & relevance (ADR-0002)

| Term | Definition |
| --- | --- |
| **Interest** | A single typed entry in the curated interest artifact: a keyword, topic, entity, author, or venue, with a **tier** (priority weight) and **polarity** (interesting vs. anti-interest). |
| **Interest artifact** | The small, curated, **typed**, human-authored set of Interests (stored as `interests.yaml`). Drives relevance. Versioned; changes are **human-gated**. |
| **Watch list** | The narrow seed set of Interests the radar starts from (e.g. memory-centric DSE, MemOS, Chakra/trace-based workload modeling — see PRODUCT-BRIEF §6). The v1 radar runs **narrow + weekly** before any broad collection. |
| **Tier** | A coarse priority band on an Interest used as a weight in the relevance score. |
| **Polarity** | Whether an Interest pulls a finding toward relevance or pushes it away (anti-interest). |
| **Relevance score** | An **additive, explainable** score per finding: the sum of per-Interest contributions (BM25 term matches, entity/author/venue hits, tier weights, polarity). Every point is attributable to a named Interest. |
| **BM25** | The ranking function used as the **first-pass** lexical relevance signal over finding text (title/abstract/body). "BM25-first" = lexical matching is the default lane; ML is opt-in. |
| **Recall-first floor** | A rule that any finding matching a high-tier watch-list Interest is **kept for review regardless of score** — recall is never sacrificed to precision on the watch list. |
| **Embedding lane (alpha)** | An OPTIONAL semantic-similarity lane that augments BM25, **gated** on a labeled eval set before it can affect routing. Not load-bearing in v1. |
| **Interest version** | An immutable, human-gated revision of the interest artifact; findings record which version scored them. |

---

## 3. Sources & ingestion (ADR-0003)

| Term | Definition |
| --- | --- |
| **Source** | An external, **public**, legal/ToS-safe origin of items (arXiv, Semantic Scholar, GitHub, curated blog RSS, HN-light). A Source is reached through exactly one **SourceAdapter**. |
| **Source family** | A class of Sources sharing an access pattern (academic API, RSS, code host, forum). Adapters are written per family. |
| **SourceAdapter** | The single inbound **port** for fetching items from a Source family. v1 adapters: arXiv + Semantic Scholar, GitHub, RSS/blogs, HN-light. Documented **stubs**: Reddit, SEC/EDGAR, newsletters, internal feeds. |
| **Item** | A raw fetched record from a Source before it becomes a Finding (e.g. one arXiv entry, one RSS post, one repo). |
| **Cursor / watermark** | The incremental-fetch position per Source (a date and/or ETag). On each Run the adapter fetches only what is newer than the stored cursor; the cursor advances after a successful Run. |
| **Dedup** | Multi-layer de-duplication in the **core** (not the adapter): collapses the same work seen across Sources/Runs (by id, normalized title, DOI/URL keys). See also **verification**. |
| **Legal/ToS-safe** | The hard ingestion guardrail: only sources whose terms permit programmatic read access. Paywalled / ToS-violating sources are out of scope. |

---

## 4. Findings, classification & triage (ADR-0004)

| Term | Definition |
| --- | --- |
| **Finding** | A de-duplicated, scored item promoted into the radar's domain: `source → signal → classification → routed output` with provenance. The atomic **unit of value**. |
| **Signal** | (1) The substance of a Finding — the actual paper/repo/post being tracked; (2) the radar's output sense: a relevant Finding that crossed the relevance floor (as opposed to filtered noise). Context disambiguates; prefer "Finding" for the record and "Signal" for what is exported. |
| **Classification** | Assignment of a Finding on the **two-axis taxonomy**. Axis 1 (relevance type): **novelty-threat / support / adjacent / noise**. Axis 2 (quality): **signal vs hype**. |
| **novelty-threat** | A Finding that could undermine the novelty of our strategy/papers — the highest-priority class; routed to CAW-03. |
| **support** | A Finding that reinforces or provides evidence for our direction. |
| **adjacent** | A Finding related to interests but not directly threatening or supporting. |
| **noise** | A Finding judged irrelevant; routed to **discard**. |
| **signal vs hype** | The quality axis: substantive/credible (**signal**) vs. inflated/low-substance (**hype**). |
| **Triage** | The end-to-end act of classifying a Finding and deciding its route. |
| **Cascade (LF→LLM→human)** | The triage pipeline: cheap deterministic **labeling functions (LF)** first, then an **LLM** classifier, then a **human** for anything the gate flags. |
| **Labeling function (LF)** | A deterministic rule (keyword/venue/author/regex) that emits a candidate label cheaply before any LLM call. |
| **Selective-review gate** | A **recall-biased** gate: when classifier confidence is low the Finding **abstains → routed to human review** rather than being auto-decided. Protects recall on the watch list. |
| **Routing** | Deterministic, **config-driven** dispatch of a classified Finding to exactly one destination: **knowledge / task / experiment / open-question / discard**. |
| **knowledge / task / experiment / open-question / discard** | The five routing destinations. `knowledge` → CAW-02 export; `open-question` → CAW-01/CAW-06 export; `task`/`experiment` → internal action artifacts; `discard` → dropped (but retained in the ledger for audit). |
| **Rationale** | The generated explanation attached to a classification. **Rationale is NEVER evidence** — it explains a decision; the underlying Source is the evidence. |

---

## 5. Related-work ledger (ADR-0005)

| Term | Definition |
| --- | --- |
| **Related-work ledger** | The **append-only** auditable record linking Findings/Signals to the claims/strategy they threaten or support. Stored as `ledger/*.jsonl`. The single source of audit truth. |
| **WatchedTarget** | A protected claim/strategy/paper-direction that the radar guards (e.g. a novelty claim). LedgerLinks attach Findings to WatchedTargets. |
| **LedgerLink** | The single **provenance-complete** auditable record connecting one Finding to one WatchedTarget, carrying classification, relation (threatens/supports), provenance, and a verification record. |
| **Verification** | The check that a Finding refers to a real, correctly identified work, via **Semantic Scholar**: a **Levenshtein** title-similarity gate + **year ±1** match + multi-key dedup. Produces a verification record on the LedgerLink. |
| **Levenshtein** | Edit-distance metric used as the fuzzy title-match gate during verification (threshold `TODO(open-question: set match threshold)`). |
| **Verification record** | The stored outcome of verification (matched paperId, title similarity, year delta, decision) embedded in a LedgerLink. |
| **Provenance** | The full origin trail of a Finding: Source origin, retrieval date/method, cursor, interest-version, classifier-version. Required on every Finding and LedgerLink. |

---

## 6. Synthesis & output formats (ADR-0001)

| Term | Definition |
| --- | --- |
| **Synthesis** | Turning Findings into readable, **markdown-first** outputs. Generated summaries are clearly marked and are **not evidence**. |
| **FormatRenderer** | The single **port** behind all output formats; one renderer per format, selected by config. |
| **Memo** | A short prose write-up of one or a few Findings. |
| **Digest** | The primary periodic (weekly) roll-up of the Run's Findings — the main radar deliverable. |
| **Slide outline** | A presentation-structured rendering of Findings. |
| **Paper-card** | A compact per-paper card (title, venue, claim, relation to a WatchedTarget) suited to novelty review. |
| **Action brief** | A decision-oriented rendering: what changed, why it matters, what to do. |

---

## 7. Surfaces, runs & storage (ADR-0001, ADR-0006)

| Term | Definition |
| --- | --- |
| **Run** | One execution of the **pipeline core**: fetch (cursors) → dedup → score → classify → route → synthesize → export. The same core backs all three surfaces. |
| **Pipeline core** | The single shared implementation of a Run; surfaces are thin. |
| **Surface** | One of the three thin entrypoints to the core: the **scheduled pipeline**, the **CLI**, and the **MCP** server. |
| **SchedulerAdapter** | The **port** that triggers Runs on a schedule. v1 = **cron**; stubs = other schedulers. |
| **ExportAdapter** | The single outbound **port** for emitting **export bundles**. v1 targets: CAW-02/CAW-03/CAW-01/CAW-06; stubs = others. The ONLY export seam. |
| **Export bundle** | A **signed** package of Signals/records emitted across a boundary to a sibling product. No shared store — the bundle IS the integration. |
| **Files-as-truth** | The storage principle: markdown/JSON files are authoritative; SQLite is a rebuildable index/ledger-cache. Layout: `interests.yaml` + `findings/*.json` + `ledger/*.jsonl`. |
| **Index** | The SQLite **derived** index over the files (search/dedup acceleration); never the source of truth. |
| **Port / Adapter** | A port is a stable interface in the core; an adapter is a concrete implementation. Ports in CAW-05: SourceAdapter, ExportAdapter, SchedulerAdapter, FormatRenderer, classifier, routing. Every port ships v1 adapters + **documented stubs**. |
| **Stub** | A documented, registered, non-functional adapter placeholder that proves the seam without implementing it. |

---

## Naming rules (consistency contract)
1. Use these exact terms in all docs/runbooks; do not invent synonyms.
2. **Generated summaries/rationales are never evidence** — keep Source, Finding, classification, and generated text distinct.
3. **High recall** wins ties on the watch list (recall-first floor, selective-review gate).
4. Only **legal/ToS-safe** Sources; never conflate public research with internal claims.
5. Cross-product = boundary language only; never imply a shared substrate.

## Open Questions
- Levenshtein title-match threshold and `year ±1` exact tolerance — TODO(open-question: see [08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).
- Relevance-score floor value and tier weights — TODO(open-question).
- Whether "Signal" should be split into two formally distinct terms (record vs. export) — TODO(open-question).

## Implications for runbooks
- Runbooks MUST reference entities (Finding, LedgerLink, WatchedTarget, Run) and ports (SourceAdapter, ExportAdapter, SchedulerAdapter, FormatRenderer) by these exact names.
- Any new term introduced by a runbook or ADR MUST be added here in the same change.

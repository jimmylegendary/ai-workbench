# Scope & Non-Goals — CAW-05 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](vision.md)
  - [personas-and-use-cases.md](personas-and-use-cases.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)

## Purpose
This doc draws the **boundary of v1**: what the narrow weekly radar *does* build, what it deliberately *does not*,
and where it ends and a sibling product begins. It is the contract a reviewer uses to reject scope creep. It does
NOT make design decisions — it points to the ADRs that do — and it never contradicts the brief (brief §11 wins on
any conflict).

## 1. In scope (v1 — the narrow weekly radar)

| # | In scope | Realized by |
|---|---|---|
| S1 | A curated typed **interest artifact** (`interests.yaml`) seeded from the §6 watch list, human-gated versioned updates | ADR-0002 |
| S2 | **Scheduled weekly ingestion** (cron) from the academic-weighted v1 source set: arXiv + Semantic Scholar + GitHub + curated blog RSS + HN-light, behind one `SourceAdapter` port | ADR-0003 / ADR-0006 |
| S3 | Incremental cursors (date/ETag watermarks) + multi-layer **dedup** across runs, in the core | ADR-0003 / ADR-0006 |
| S4 | **BM25-first additive explainable** relevance scoring with a recall-first floor; embedding lane wired but default-off | ADR-0002 |
| S5 | **Two-axis classification** (novelty-threat/support/adjacent/noise × signal/hype) via LF→LLM→human cascade; recall-biased selective review | ADR-0004 |
| S6 | **Config-driven routing** to knowledge / task / experiment / open-question / discard via the `narrow-radar-weekly` profile | ADR-0004 |
| S7 | An append-only **related-work ledger** with Semantic Scholar verification; provenance-complete `LedgerLink` | ADR-0005 |
| S8 | **Five markdown-first output formats** behind a `FormatRenderer` port: memo, digest, slide outline, paper-card, action brief (v1 emphasis: the weekly **digest**) | ADR-0001 |
| S9 | **Three thin surfaces** over one pipeline core: scheduled pipeline + CLI + MCP | ADR-0001 |
| S10 | **Export bundles** to CAW-02 / CAW-03 / CAW-01 / CAW-06 via the `ExportAdapter` file-drop port; signed; idempotent | ADR-0007 |
| S11 | **Files-as-truth** own store (`interests.yaml` + `findings/*.json` + `ledger/*.jsonl`) + SQLite index/ledger-cache | ADR-0006 |
| S12 | **Documented stubs** for deferred source families, export targets, and schedulers (config-driven registry) | ADR-0003 / ADR-0007 |

## 2. Non-goals (v1) — and what to do instead

Each non-goal is from brief §11/§12. The point of listing them is to give a reviewer a crisp reason to say "no".

| # | NOT in v1 | Why | Do instead |
|---|---|---|---|
| N1 | **Broad / whole-internet trend collection** | recall and the evidence boundary must be proven on a hand-verifiable list first | Start with the narrow weekly watch-list radar (§6); widen only on an explicit trigger |
| N2 | **Autonomous decisions** — auto-confirming, auto-exporting, auto-editing strategy | a wrong autonomous call on novelty is existential; the radar advises, Jimmy decides | Findings are **proposals**; human-gated review before export (ADR-0004, ADR-0007) |
| N3 | **Paywalled / ToS-violating ingestion** | legal/source safety is a hard guardrail (brief §12) | Public, legal/ToS-safe sources only; paywalled families stay documented stubs (ADR-0003) |
| N4 | **Becoming the knowledge repo** (that is CAW-02) | CAW-05 produces signals, not the curated knowledge base | **Export** Source/Claim/RelatedWork to CAW-02 across the boundary (ADR-0007) |
| N5 | **Becoming the paper / novelty harness** (that is CAW-03) | CAW-05 raises advisory novelty signals, it never asserts novelty is lost | **Export** an advisory novelty signal to CAW-03's gate (ADR-0007) |
| N6 | **Heavy ML relevance models** | v1 must be simple + explainable + auditable | BM25-first additive scoring; embedding lane behind `enable_embeddings`, default off (ADR-0002) |
| N7 | **Treating generated summaries as evidence** | conflating prose with evidence corrupts every consumer | `rationale_note(evidence=false)`; `raw_summary` tagged `kind=generated-summary`, excluded from evidence fields (ADR-0004, ADR-0007) |
| N8 | **A shared runtime substrate / writing into a sibling's store** | independence is structural | File-drop export bundles; consumers **pull** (ADR-0007) |
| N9 | **Real-time / continuous streaming** in v1 | the slice is weekly + reviewable in a sitting | Cron-scheduled weekly run with incremental cursors (ADR-0006) |

## 3. The line between CAW-05 and its siblings

CAW-05 ends at the **`ExportAdapter` file-drop boundary**. It emits a versioned `caw05-signal` bundle; the consumer
**pulls** and re-classifies. CAW-05 never imports a consumer's schema and never writes a consumer's store
(ADR-0007).

| Boundary | CAW-05 emits | Sibling (a separate product) does |
|---|---|---|
| → **CAW-02** (knowledge) | Source / Claim / RelatedWork link with provenance | curates into its own knowledge base; re-enforces evidence rules |
| → **CAW-03** (novelty) | **confirmed-only** advisory novelty signal (`threat`/`support`/`neutral`) | runs its novelty gate; CAW-05 never asserts the verdict |
| → **CAW-01 / CAW-06** | open-question bundle (from an action brief) | imports as an open question / workload item |
| ← **inbound** | nothing from siblings | CAW-05 ingests **public sources only** (read-only external) |

Rules that hold at every boundary (ADR-0007 negative tests N1–N6): no generated summary in an evidence field; no
non-public item in a public bundle; no unreviewed proposal to CAW-03's gate; retries are no-ops (idempotent); a
`noise` finding is never exported; an empty bundle is refused, never silently emitted.

## 4. Scope-change protocol
Anything in §2 enters scope only by: (1) an explicit revisit trigger firing (e.g. ADR-0002's "lexical v1
measurably misses watch-list-adjacent work" enables the embedding lane), and (2) a new or amended ADR. Widening the
watch list or adding a source family is a **config + stub-promotion** change, not a core redesign — that is the
whole point of the ports-and-stubs pattern.

## Open Questions
- TODO(open-question: the explicit trigger to widen from narrow-weekly to broader/more-frequent collection.)
- TODO(open-question: do `task` / `experiment` routes export anywhere in v1, or stay in the digest until
  CAW-01/CAW-06 contracts firm up? — shared with ADR-0004 / ADR-0007.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- Every runbook states which scope row (S1–S12) it implements; a runbook touching a non-goal (N1–N9) is blocked
  pending an ADR.
- Stub source families / export targets ship as documented stubs with a registry entry, never as half-built core.

# Vision — CAW-05, the Early-Warning Radar that Protects Novelty

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [scope-and-non-goals.md](scope-and-non-goals.md)
  - [personas-and-use-cases.md](personas-and-use-cases.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)

## Purpose
This doc states CAW-05's **north star**: why the product exists, what its single unit of value is, and what the
first vertical slice looks like. It frames the *whole* product so every ADR and runbook can be checked against one
intent. It does NOT decide mechanics — the interest model (ADR-0002), classification/triage (ADR-0004), sources
(ADR-0003), the ledger (ADR-0005), storage/scheduling (ADR-0006), or export boundaries (ADR-0007) own those. It
elaborates the brief; it never redefines it.

## 1. North star
CAW-05 is an **independent early-warning radar**: it automatically collects public AI papers, repos, articles, and
community trends per Jimmy's and the team's interests, **classifies** each finding, and **synthesizes** it into
readable, routable outputs. It is the **radar that protects novelty** — missing one close paper or system can erase
the novelty of the whole control-plane / paper strategy. That asymmetric cost is the product's reason for being:
**a missed close result is an existential risk, a false alarm is cheap.** Therefore the radar is **recall-first**.

It is one of six products in the `ai-workbench` family but shares **no runtime substrate** with any of them. It
ingests **public sources only** (read-only, legal/ToS-safe) and **exports signals** across explicit file boundaries
to siblings — it never reads or writes their stores.

> One sentence: *be the standing watch that surfaces every close result on the narrow watch list, explains why it
> surfaced, and routes it to the product that should act — before novelty is quietly lost.*

## 2. The unit of value
The atom of the product is **one triaged, synthesized finding**, carried end to end with provenance:

```
source  →  signal  →  classification  →  routed output
(public)   (relevance,   (two-axis:        (knowledge | task |
            explained)    novelty-threat/   experiment |
                          support/adjacent/  open-question |
                          noise × signal/    discard)
                          hype)
```

A finding is *done* when it has crossed all four stages and landed in exactly one (or several) of the five
dispositions, each with a complete provenance trail. Anything short of a routed, provenance-complete finding is
work-in-progress, not value.

| Stage | What it produces | Owning decision |
|---|---|---|
| **Source** | a deduped `RawFinding` with origin/date/retrieval provenance + trust prior | ADR-0003 |
| **Signal** | an additive, **explainable** relevance score + `relevance_explain[]` + watch-list hits | ADR-0002 |
| **Classification** | two orthogonal axes + a `rationale_note(evidence=false)` + review state | ADR-0004 |
| **Routed output** | a disposition + export target(s) + a synthesized format | ADR-0004 / ADR-0007 / ADR-0001 |

## 3. The three load-bearing invariants
These hold across every surface, profile, and release. They come straight from the brief (§11/§12) and are
re-asserted in the ADRs that enforce them.

| Invariant | Why it is non-negotiable | Enforced by |
|---|---|---|
| **High recall on the watch list** — any watch-list hit is surfaced, never silently dropped | a wrong drop = missed novelty = existential | ADR-0002 recall-first floor; ADR-0004 never-silent-discard |
| **Generated summaries are not evidence** — a synthesized rationale can never back a downstream claim | conflating prose with evidence corrupts every consumer | ADR-0004 `evidence:false`; ADR-0007 excludes `raw_summary` from evidence fields |
| **Findings are proposals; Jimmy reviews and routes** — nothing exports unreviewed | the radar advises; humans decide strategy | ADR-0004 review gate; ADR-0007 confirmed-only to CAW-03 |

A fourth, structural invariant underpins them: **independence** — CAW-05's core, data, and surfaces are its own; it
crosses to siblings only through the `ExportAdapter` port (ADR-0007), never a shared store.

## 4. Why a separate product
Continuous multi-source ingestion + scheduling + triage + multi-format synthesis is its own concern with its own
legal/source constraints. Folding it into the knowledge repo (CAW-02) or the paper harness (CAW-03) would couple
their stores to a noisy, public-facing ingestion surface and blur the evidence boundary. Keeping it standalone lets
the radar stay recall-biased and public-only while its consumers stay precision-biased and curated.

## 5. Narrow weekly radar first
The first deliverable is deliberately **narrow and weekly**, not broad and continuous (brief §6, §11):

- **Watch list (seed):** memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall
  line; MemOS; SECDA-DSE; TTT writeback / test-time compute memory traffic; Chakra / trace-based workload modeling;
  LLM serving & memory-hierarchy simulation. *(Verify and refine in the first research run — these are jargon-heavy
  proper nouns where lexical/BM25 matching wins, per ADR-0002.)*
- **Cadence:** one scheduled weekly run (cron), reviewable in a sitting.
- **Output:** a **weekly digest** of triaged findings, ordered by explainable relevance, each showing *why* it
  surfaced and its proposed route.

Narrow-first is a strategy, not a limitation: it lets us prove recall, explainability, and the evidence boundary on
a list small enough to hand-verify before widening scope.

## 6. First vertical slice
A thin but complete path through all four value stages — the smallest thing that delivers a real triaged finding:

1. **Seed** `interests.yaml` from the §6 watch list (`recall_priority: high`) — ADR-0002.
2. **Ingest** one weekly window from the academic-weighted v1 source set (arXiv + Semantic Scholar + GitHub +
   curated RSS + HN-light) behind one `SourceAdapter`, deduped with incremental cursors — ADR-0003.
3. **Score** each finding with the BM25-first additive scorer, emitting `relevance_explain[]` and honoring the
   recall-first floor — ADR-0002.
4. **Classify & triage** with the LF→LLM→human cascade; recall-biased selective review; route via the
   `narrow-radar-weekly` profile — ADR-0004.
5. **Synthesize** confirmed findings into the **weekly digest** (markdown-first), with rationale marked
   `evidence:false` — ADR-0001.
6. **Export** at least one confirmed `novelty-threat` to CAW-03 and one Source/Claim to CAW-02 through the
   `ExportAdapter` file-drop boundary — ADR-0007.

Done = one weekly run that lands a provenance-complete finding in the digest and a signed bundle a sibling can pull.

## 7. What success looks like (qualitative, v1)
- No watch-list-relevant paper from the weekly window is silently absent from the digest. *(Recall — the metric is
  defined against a labeled eval set; no numbers asserted yet — TODO(open-question).)*
- Every surfaced finding shows a human-readable *why* (named terms/authors/lanes) before any LLM rationale.
- No generated summary ever appears in an evidence field of any export bundle (ADR-0007 negative test N1).
- Jimmy can run, inspect, and route a week's findings in one sitting via CLI/MCP.

## Open Questions
- TODO(open-question: the labeled eval set that defines "high recall" for the narrow list, and the target it sets.)
- TODO(open-question: when to widen from the narrow weekly radar to broader/more-frequent collection — the trigger.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- The first runbook phase must realize the §6 vertical slice end to end (seed → ingest → score → triage →
  digest → one export), not breadth across sources or formats.
- Every runbook acceptance check must be expressible against the §2 unit of value and the §3 invariants.

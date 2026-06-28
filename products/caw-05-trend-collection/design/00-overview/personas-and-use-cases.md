# Personas & Use Cases — CAW-05

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](vision.md)
  - [scope-and-non-goals.md](scope-and-non-goals.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)

## Purpose
This doc names **who uses CAW-05** and the **six use cases** the narrow weekly radar must serve (brief §3). Each use
case is a concrete walk through the §2 unit of value — `source → signal → classification → routed output`. It does
NOT specify UI, prompts, or schemas (those live in the ADRs and research docs it links). Use cases are framed so a
runbook acceptance check can be derived from them.

## 1. Personas

| Persona | Role | Primary surface | What they need | Hard guardrail |
|---|---|---|---|---|
| **Jimmy** | Owner / curator / reviewer | CLI + MCP + editing `interests.yaml` | Define interests; run the weekly radar; review the digest; **confirm/override** classifications; route findings | He is the reviewer for all strategic decisions; findings are proposals (brief §11) |
| **The team** | Readers / consumers | The weekly digest + other emitted formats | A readable, ordered, explainable digest; the *why* behind each finding; multi-format outputs (memo / slide / paper-card / action brief) | No confidential data in public-facing outputs; generated summaries marked not-evidence |
| **AI agents** | Downstream consumers in sibling products (CAW-01/02/03/06) | The `ExportAdapter` file-drop bundles | Provenance-complete, signed, `evidence:false`-tagged signals in **their own** id namespace, pulled — never pushed | They re-classify on import; CAW-05 never writes their store; confirmed-only to CAW-03's gate |

Note: agents acting *inside* CAW-05 (e.g. invoking export as a vetted skill action) hit the **same**
redaction/confidentiality checks as humans — no raw bypass (ADR-0007 §6).

## 2. Use cases

### UC-1 — Weekly radar → digest
**Actor:** Jimmy (run), the team (read). **Trigger:** the weekly cron run (or `run` via CLI/MCP).
**Flow:** the scheduled pipeline ingests the weekly window from the v1 source set behind one `SourceAdapter`
(ADR-0003), dedups via incremental cursors (ADR-0006), scores each finding with the BM25-first additive scorer
emitting `relevance_explain[]` and honoring the recall-first floor (ADR-0002), runs the LF→LLM→human cascade
(ADR-0004), and synthesizes confirmed findings into the **weekly digest** (markdown-first, ADR-0001).
**Value produced:** a digest of triaged findings, ordered by explainable relevance, each showing *why* it surfaced
and its proposed route. **Acceptance:** no watch-list-relevant item from the window is silently absent; every entry
shows a human-readable *why* before any LLM rationale.

### UC-2 — Novelty-threat → CAW-03
**Actor:** Jimmy (confirm), CAW-03 (pull). **Trigger:** a finding is classified `novelty-threat`.
**Flow:** `novelty-threat` is **always queued** for human review (even at high confidence — asymmetric cost,
ADR-0004), never auto-discarded. On Jimmy's confirm, the routing engine emits a routed signal; the `ExportAdapter`
projects the confirmed `LedgerLink` into a `caw05-signal` bundle with the WatchedTarget's `foreign_ref` in CAW-03's
namespace and writes a file-drop bundle (ADR-0007). **Value produced:** an **advisory** novelty signal CAW-03 pulls
into its gate. **Acceptance:** only confirmed, public, verified-or-flagged links reach CAW-03's gate; an unreviewed
proposal is refused (negative test N3); CAW-05 never asserts novelty is lost — only that a candidate close result
exists.

### UC-3 — Finding → CAW-02 (knowledge)
**Actor:** Jimmy (confirm), CAW-02 (pull). **Trigger:** a finding routes to `knowledge`.
**Flow:** the ledger verifies the paper via Semantic Scholar (Levenshtein title gate + year±1 + multi-key dedup,
ADR-0005); on confirm, the `ExportAdapter` emits a Source/Claim/RelatedWork link with provenance, `extracted_claims`
backed by `evidence_locator`, and `raw_summary` tagged `kind=generated-summary` (excluded from evidence fields,
ADR-0007). **Value produced:** a Source/Claim CAW-02 curates into its knowledge base. **Acceptance:** no generated
summary in an evidence field (negative test N1); `canonical_key` lets CAW-02 dedup our Source against an existing
one.

### UC-4 — Open question → CAW-01 and/or CAW-06
**Actor:** Jimmy (confirm), CAW-01 / CAW-06 (pull). **Trigger:** a finding raises an open question (often a
`novelty-threat` also takes this route; one finding may take multiple routes, ADR-0004).
**Flow:** routing produces an **action brief** synthesis (ADR-0001); the `ExportAdapter` emits an open-question
bundle carrying the synthesis manifest with `evidence:false` to CAW-01 (questions) and/or CAW-06 (future workload),
file-drop, idempotent (ADR-0007). **Value produced:** an open question / workload item a sibling imports.
**Acceptance:** the receiving product re-classifies and never stores the prose as evidence.
TODO(open-question: do `task`/`experiment` routes export in v1 or stay in the digest until CAW-01/06 contracts
firm up? — shared with ADR-0004 / ADR-0007.)

### UC-5 — Update interests; the radar re-prioritizes
**Actor:** Jimmy. **Trigger:** Jimmy edits `interests.yaml`, or the `mark-feedback` op fires, or a suggestion is
promoted.
**Flow:** three human-gated, versioned channels (ADR-0002): **direct edit** (recompile, bump `version`, re-rank the
backlog), **feedback nudge** (bounded clamped weight step logged to `interest-feedback.jsonl`; never creates/deletes
interests), **suggestion queue** (recurring tokens/authors proposed `provenance: suggested`, inert until promoted —
no silent watch-list growth). `decay` is applied on the cron run. **Value produced:** re-prioritized future runs
with a git-auditable change trail. **Acceptance:** every interest change is versioned and reversible; no auto-grown
watch list.

### UC-6 — Emit a finding in multiple formats
**Actor:** Jimmy / the team / an agent. **Trigger:** a confirmed finding needs a format other than the digest.
**Flow:** the `FormatRenderer` port renders the same finding into any of the five markdown-first formats — **memo,
digest, slide outline, paper-card, action brief** (ADR-0001). The **paper-card** feeds CAW-02 + CAW-03; the
**action brief** feeds CAW-01/CAW-06 (ADR-0007 §6). All carry the synthesis manifest with rationale
`evidence:false`. **Value produced:** the right artifact for the audience without re-deriving the finding.
**Acceptance:** every format renders the same provenance + the `evidence:false` marker; no format leaks confidential
data into a public-facing output.

## 3. Persona × use case coverage

| Use case | Jimmy | Team | AI agents |
|---|---|---|---|
| UC-1 weekly radar → digest | run + review | read | — |
| UC-2 novelty-threat → CAW-03 | confirm | read | pull |
| UC-3 finding → CAW-02 | confirm | read | pull |
| UC-4 open-question → CAW-01/06 | confirm | read | pull |
| UC-5 update interests | edit / curate | — | — |
| UC-6 multi-format emit | request | read | pull / request |

## Open Questions
- TODO(open-question: do `task`/`experiment` routes (UC-4) export anywhere in v1, or stay in the digest?)
- TODO(open-question: what minimal read view, if any, does the team get over the ledger + digests in v1 — brief §4
  secondary surface?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- Each use case maps to an acceptance scenario: a runbook for UC-2/3/4 must include the ADR-0007 negative tests
  (N1–N6) for its boundary.
- The CLI/MCP runbook must expose the ops these use cases need: `run`, review/`confirm`/`override`, `export`,
  `mark-feedback`, and format selection for UC-6.

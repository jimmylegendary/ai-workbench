# Risks & Mitigations

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./milestones-and-phases.md](./milestones-and-phases.md), [./dependency-graph.md](./dependency-graph.md), [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md), [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md), [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md), [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc enumerates the delivery + operational risks for CAW-05 and the concrete mitigations baked into the design.
It frames *why* the key ADR choices exist (recall-first, legal-only sources, generated-summary≠evidence, ports with
stubs, export boundaries, resumable runbooks). It does NOT re-derive those decisions — it links to them.

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation (design hook) |
|----|------|-----------|--------|--------------------------|
| R1 | **Missing a close paper/repo → novelty loss** (existential per BRIEF §1) | Med | **Critical** | High-recall posture: recall-first relevance floor + recall-biased selective-review gate; watch-list coverage audit |
| R2 | **Source ToS / rate limits / blocking** | Med | High | Legal/ToS-safe-only adapters; per-source rate budgets + backoff; incremental cursors; documented stubs for risky sources |
| R3 | **Hype false positives** (loud-but-empty signals routed as threats) | High | Med | Second taxonomy axis (signal vs hype); LF→LLM→human cascade; human confirms novelty-threat before export |
| R4 | **Export coupling** (drift into a shared substrate) | Low | High | Single ExportAdapter seam; signed file/API bundles; NO shared store (ADR-0007); independence contract |
| R5 | **Build-budget interruption** strands a half-built pipeline | High | Med | Small resumable runbooks; FILES-AS-TRUTH + append-only ledger; green tree at each Acceptance checkpoint |
| R6 | **Generated summary mistaken for evidence** | Med | High | Rationale stored separately, flagged non-evidence; LedgerLink carries source provenance, not the summary |
| R7 | **False novelty export** (wrong/duplicate paper sent to CAW-03) | Med | High | Semantic Scholar verification (Levenshtein title gate + year±1 + multi-key dedup); provenance-complete LedgerLink required |
| R8 | **Interest drift / stale watch list** | Med | Med | Curated typed interest artifact; human-gated VERSIONED updates; seeded from narrow watch list |
| R9 | **Duplicate/noisy findings across runs** | High | Low | Multi-layer dedup in CORE + cursor watermarks across runs |
| R10 | **LLM cost/latency in the cascade** | Med | Med | LF stage filters before LLM; LLM only on uncertain items; digest-first scope keeps volume narrow |
| R11 | **Embedding lane over-promises** (opaque, unvalidated ranking) | Med | Med | Embedding lane is alpha, flag-gated on a labeled eval set; BM25 explainable score stays default |

## Detail on the load-bearing risks

### R1 — Novelty loss (the radar's whole reason to exist)
A single missed close result can erase the novelty of the control-plane / paper strategy. The design biases every
recall/precision tradeoff toward **recall**:
- **Relevance:** additive explainable score with a **recall-first floor** — borderline items surface rather than
  drop (ADR-0002).
- **Triage:** recall-biased **selective-review** gate — low-confidence items **abstain → human**, never silent
  discard (ADR-0004).
- **Coverage:** a watch-list coverage check per Run confirms each PRODUCT-BRIEF §6 target was queried across the v1
  source set. TODO(open-question: define a recall target + labeled eval set) →
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- **Trade accepted:** more noise/human review volume; mitigated by R3/R10 controls.

### R2 — Source ToS & rate limits
- Only legally/ToS-safe ingestion (BRIEF §12). Paywalled / ToS-violating sources are **out** — they become
  documented stubs, not enabled adapters (ADR-0003).
- Each SourceAdapter declares a rate budget; the CORE enforces backoff + retry; incremental cursors (date/ETag)
  minimize request volume.
- A source going dark degrades gracefully (other adapters still run); the Run records which sources were skipped.

### R3 — Hype false positives
- The taxonomy's **signal vs hype** axis exists precisely to catch loud-but-empty items.
- The **LF → LLM → human cascade** means a novelty-threat export is human-confirmed; generated rationale is recorded
  but is **never evidence** (R6).

### R4 — Export coupling
- The ExportAdapter is the **only** export seam; bundles to CAW-02/03/01/06 are signed and written across explicit
  file/API boundaries. No shared store, registry, or runtime substrate (ADR-0007, independence contract).
- Revisit trigger: any proposal to read another product's DB directly = stop, it violates the boundary.

### R5 — Build-budget interruptions
- Runbooks are small, single-purpose, and ordered by the [dependency graph](./dependency-graph.md); each leaves the
  tree green at its Acceptance checkpoint.
- State is FILES-AS-TRUTH (`interests.yaml`, `findings/*.json`, append-only `ledger/*.jsonl`) + a rebuildable SQLite
  index, so a Run — and a build — resumes from disk, not memory (ADR-0006).
- M1 is deliberately the smallest end-to-end slice so an interruption never leaves the radar non-functional.

## Revisit triggers
- Recall audit shows a known close item was dropped → tighten the floor / add a source (R1).
- A source issues a ToS/rate warning → demote to stub, document (R2).
- Human review queue volume exceeds capacity → re-tune cascade thresholds, not recall floor (R1/R3/R10).
- Any cross-product direct read proposed → reject; reaffirm export boundary (R4).

## Open Questions
- Recall target + labeled eval set (shared with relevance + embedding lane) — TODO(open-question).
- Human-review SLA / queue capacity for the selective-review gate — TODO(open-question).
- Bundle signing mechanism + key handling across export boundaries — TODO(open-question).

## Implications for runbooks
- Every runbook's **Rollback / safety** section relies on FILES-AS-TRUTH + append-only ledger (R5).
- Adapter runbooks must encode rate budgets + ToS notes and ship risky sources as disabled stubs (R2).
- The novelty-export runbook must block on a provenance-complete, S2-verified LedgerLink before writing a CAW-03
  bundle (R7).

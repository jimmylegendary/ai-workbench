# CAW-05 Runbooks — Index

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./runbook-conventions.md](./runbook-conventions.md), [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md), [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md), [../05-radar-core/overview.md](../05-radar-core/overview.md), [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the **execution index** for the CAW-05 runbooks — the build instructions an AI builder executes to construct
the **independent early-warning radar** (PRODUCT-BRIEF §1). It states what a runbook is, the order/gates in which
runbooks run, the phase table that maps each phase folder to its runbooks, the **Milestone-1 chain**, and the
**budget discipline** that keeps the tree resumable. It does NOT restate component internals — those live in
[../05-radar-core/](../05-radar-core/) and the ADRs in [../01-decisions/](../01-decisions/). It does NOT restate the
strict runbook format or builder rules — those live in [./runbook-conventions.md](./runbook-conventions.md), which
every builder MUST read first.

## What these runbooks are
- Each runbook (`RB-XXX-*.md`) is **one cohesive, atomic build unit** with `Do:`/`Verify:` steps, executed top to
  bottom by an AI builder. Code inside is **build guidance only** (skeletons/signatures/config); the builder writes
  the real code.
- Runbooks **implement design**, they do not decide it. Every runbook links back to the ADR(s) and
  `05-radar-core/` doc it implements. If a runbook and the design conflict, the design wins; if the design and the
  brief conflict, the **brief wins** (PRODUCT-BRIEF §0).
- Runbooks are **resumable**: each leaves the tree green (compiles, lints, tests pass) at its Acceptance checkpoint
  so an interrupted build resumes cleanly (FILES-AS-TRUTH, ADR-0006).

## Execution order & gates
1. **Read first:** [./runbook-conventions.md](./runbook-conventions.md) (strict format + CAW-05 builder rules).
2. **Follow the DAG**, not just the file order. The build order is fixed by
   [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md) invariants:
   - Ports + store **before** adapters.
   - Interest model + sources **before** relevance.
   - Classify **before** route/export.
   - Ledger **before** novelty-export hardening.
   - No export except through the single ExportAdapter port (no shared store).
3. **Phase gates:** do not start a phase until the prior phase's exit gate in
   [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md) is met. A runbook is `blocked`
   until every runbook in its `Depends on:` list has passed Acceptance.
4. **Within a phase:** runbooks run in ascending `RB-XXX` order unless `Depends on:` says otherwise. The two P1
   tracks (interest model, source adapters) run as **independent parallel tracks that join before relevance**.

## Phase table
Phase folders here group the roadmap phases (P0–P7) into five build stages. Runbook numbers follow `RB-0XX` = stage 0,
`RB-1XX` = stage 1, and so on (DOC-CONVENTIONS §6).

| Stage | Folder | Roadmap phases | Theme | Key runbooks (planned) |
|-------|--------|----------------|-------|------------------------|
| 0 | [`phase-0-foundations/`](./phase-0-foundations/) | P0 | Repo, pipeline core (a Run), 3 thin surfaces, ALL ports as documented stubs, FILES-AS-TRUTH store + SQLite index | RB-001 repo+toolchain; RB-002 Run pipeline skeleton (ingest→…→export no-op); RB-003 ports + documented stubs; RB-004 FILES store + SQLite index; RB-005 CLI + MCP + scheduled surfaces reach core |
| 1 | [`phase-1-ingestion/`](./phase-1-ingestion/) | P1 | Typed interest model (seeded from watch list) + v1 SourceAdapters + cursors + multi-layer dedup in CORE | RB-101 `interests.yaml` typed/tiered/versioned; RB-102 SourceAdapter contract + cursors; RB-103 arXiv; RB-104 Semantic Scholar; RB-105 GitHub; RB-106 curated blog RSS; RB-107 HN-light; RB-108 dedup-in-core + incremental re-run |
| 2 | [`phase-2-relevance-and-classify/`](./phase-2-relevance-and-classify/) | P2 + P3 | BM25-first additive **explainable** relevance with recall floor; two-axis classification via LF→LLM→human cascade; selective-review abstain→human gate; config-driven routing | RB-201 BM25 index + additive score + recall floor; RB-202 score-breakdown explanation; RB-203 LF stage; RB-204 LLM stage + abstain; RB-205 human-review queue (selective review); RB-206 config-driven routing; RB-207 rationale store (non-evidence) |
| 3 | [`phase-3-ledger-and-synthesis/`](./phase-3-ledger-and-synthesis/) | P4 + P5 | FormatRenderer (digest first); append-only related-work ledger + Semantic Scholar verification + provenance-complete LedgerLink | RB-301 FormatRenderer port + digest; RB-302 stub formats (memo/slide/card/brief) as NotImplemented; RB-303 append-only `ledger/*.jsonl`; RB-304 S2 verification (Levenshtein title + year±1 + dedup); RB-305 LedgerLink provenance record |
| 4 | [`phase-4-export-and-schedule/`](./phase-4-export-and-schedule/) | P4 (M1 export) + P6 + P7 | ExportAdapter seam; CAW-03 novelty export (M1); CAW-02/01/06 exports; cron scheduling hardening | RB-401 ExportAdapter contract + signing; RB-402 CAW-03 novelty bundle (M1); RB-403 cron weekly Run; RB-404 CAW-02 Source/Claim/RelatedWork; RB-405 CAW-01/06 open questions; RB-406 retries/backoff/resumable cursors |

> Exact runbook splits may be refined inside each folder, but the **DAG ordering and phase gates above are fixed**.

## Milestone-1 chain (the hard vertical slice)
M1 = the narrow weekly radar end-to-end: **fetch watch-list sources → relevance → classify → digest**, with **≥1
novelty-threat exported to CAW-03** (milestones doc, North star). Build exactly this critical path first and defer
breadth:

```
RB-001..005  (stage 0: core + surfaces + ports + store, green no-op Run)
      │
      ├── RB-101 interests.yaml (watch list seed)  ┐
      │                                            ├─ join
      └── RB-102..108 watch-list SourceAdapters    ┘  (arXiv/S2/GitHub/RSS/HN-light + dedup in core)
                          │
                   RB-201..202  relevance (BM25-first, additive, recall floor + explanation)
                          │
                   RB-203..207  classify (LF→LLM→human, abstain→human) + config routing
                          │
                   RB-301       digest (FormatRenderer)
                          │
                   RB-401..402  ExportAdapter + CAW-03 novelty bundle (pulled forward from P5, minimal)
                          │
                   RB-403       weekly cron Run
                          ▼
                   ★ MILESTONE 1 ★  weekly digest + 1 novelty-threat → CAW-03
```

Only the **minimal** CAW-03 export seam is pulled forward into M1; full ledger verification + signing is M2 (stage 3
RB-303..305 + stage 4 hardening). See [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md)
"Critical path to M1".

## Budget discipline
- **Thin vertical slice over broad scaffolding** (PRODUCT-BRIEF §12). Build the M1 chain end-to-end before widening
  sources, formats, or export targets. A build-budget interruption must never strand the radar mid-pipeline.
- **Leave the tree green** at every Acceptance checkpoint so an interrupted build resumes from files, not memory.
- **Stubs cost nothing now:** non-v1 sources (Reddit, SEC/EDGAR, newsletters), the four non-digest formats, and the
  non-CAW-03 exports ship as **documented `NotImplemented` stubs** behind their ports — wired, listed, disabled.
- **Recall before breadth:** spend budget on not missing close work on the narrow watch list, not on covering more
  sources (missing one close paper is the existential risk, PRODUCT-BRIEF §1).
- **LLM spend is gated:** the classification cascade runs cheap LFs first and only escalates to the LLM stage, then
  abstains to a human queue on low confidence — never burn LLM budget to force a decision (ADR-0004).

## Hand-off
A builder starting here should: (1) read [./runbook-conventions.md](./runbook-conventions.md); (2) confirm the prior
phase's exit gate in [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md); (3) open the
lowest-numbered `ready` runbook in the current phase folder and execute it step by step.

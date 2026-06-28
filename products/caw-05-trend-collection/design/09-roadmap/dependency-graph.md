# Dependency Graph

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./milestones-and-phases.md](./milestones-and-phases.md), [./risks-and-mitigations.md](./risks-and-mitigations.md), [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md), [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md), [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc states the **build-order DAG** for CAW-05: what must exist before what. It is the ordering rationale behind
[./milestones-and-phases.md](./milestones-and-phases.md). It does NOT define component internals or schedules.

## Invariants (the edges that must never reverse)
1. **Ports + store before adapters** — every adapter plugs into a port + the FILES-AS-TRUTH store; build the seams
   first (ADR-0001/0006).
2. **Interest model + sources before relevance** — relevance scores interests against ingested findings; both
   inputs must exist (ADR-0002/0003).
3. **Classify before route/export** — routing and export decisions consume the two-axis classification (ADR-0004).
4. **Ledger before novelty export** — a CAW-03 novelty signal must trace to a provenance-complete, verified
   LedgerLink (ADR-0005/0007).
5. **No export without a port** — the ExportAdapter is the ONLY export seam; no direct cross-product writes,
   no shared store (ADR-0007).

## DAG (ASCII)

```
                         ┌─────────────────────────┐
                         │ P0  Pipeline core (Run)  │
                         │ + 3 surfaces (sched/CLI/ │
                         │   MCP) + ALL ports (stub)│
                         │ + FILES store + SQLite   │
                         └────────────┬─────────────┘
                                      │ (ports+store before adapters)
              ┌───────────────────────┼───────────────────────┐
              v                       v                        v
   ┌────────────────────┐  ┌────────────────────┐   ┌────────────────────┐
   │ P1 Interest model  │  │ P1 SourceAdapters  │   │  (ExportAdapter    │
   │ interests.yaml     │  │ arXiv/S2/GitHub/   │   │   port stub, used  │
   │ (typed, tiered,    │  │ RSS/HN-light       │   │   later by P4/P5)  │
   │  versioned)        │  │ + cursors + dedup  │   └─────────┬──────────┘
   └─────────┬──────────┘  └─────────┬──────────┘             │
             │                       │                         │
             └───────────┬───────────┘                        │
                         v  (interests + sources before relevance)
              ┌────────────────────────┐                      │
              │ P2 Relevance           │                      │
              │ BM25-first, additive,  │                      │
              │ explainable, recall    │                      │
              │ floor                  │                      │
              └───────────┬────────────┘                      │
                          v  (relevance before classify)      │
              ┌────────────────────────┐                      │
              │ P3 Classification      │                      │
              │ 2-axis, LF→LLM→human   │                      │
              │ cascade + selective    │                      │
              │ review gate            │                      │
              └───────────┬────────────┘                      │
                          │ (classify before route/export)    │
            ┌─────────────┴─────────────┐                     │
            v                           v                     │
 ┌────────────────────┐     ┌────────────────────────┐       │
 │ P3 Routing         │     │ P4 Synthesis           │       │
 │ config-driven →    │     │ FormatRenderer:        │       │
 │ knowledge/task/exp/│     │ DIGEST first (M1)      │       │
 │ open-q/discard     │     │ memo/slide/card/brief  │       │
 └─────────┬──────────┘     └───────────┬────────────┘       │
           │                            │                     │
           │                            v                     │
           │                 ┌─────────────────────┐          │
           │                 │  ★ MILESTONE 1 ★    │          │
           │                 │ weekly digest +     │◄─────────┘
           │                 │ 1 novelty-threat    │  (export via port)
           │                 │ → CAW-03            │
           │                 └──────────┬──────────┘
           │                            │
           v                            v
 ┌────────────────────┐     ┌────────────────────────┐
 │ P5 Ledger          │     │ (ledger before novelty │
 │ append-only jsonl  │────▶│  export hardening)     │
 │ + S2 verification  │     │ P5 CAW-03 export (M2)  │
 │ (Levenshtein+yr±1) │     │ signed, LedgerLink-    │
 │ + LedgerLink       │     │ backed                 │
 └─────────┬──────────┘     └───────────┬────────────┘
           │                            │
           v                            v
 ┌────────────────────────────────────────────────────┐
 │ P6 Remaining exports (CAW-02 Source/Claim/RelatedWork│
 │    ; CAW-01/CAW-06 open questions) + all 5 formats   │  (M3)
 └───────────────────────┬─────────────────────────────┘
                         v
 ┌────────────────────────────────────────────────────┐
 │ P7 Scheduling hardening; embedding lane (alpha, gated│
 │    on labeled eval set); documented source stubs     │  (M4)
 └────────────────────────────────────────────────────┘
```

## Critical path to M1
`P0 (core+ports+store) → P1 (interests ∥ sources) → P2 (relevance) → P3 (classify) → P4 (digest + CAW-03 export)`.
The two P1 branches (interest model, source adapters) run in **parallel** but **join** before P2. The minimal
CAW-03 ExportAdapter is the only piece pulled forward from P5 into M1 — just enough to emit one signal; full ledger
verification is M2.

## Edge table

| From | To | Why (which invariant) |
|------|----|-----------------------|
| P0 ports+store | P1 adapters | (1) adapters need port + store |
| P1 interests | P2 relevance | (2) scoring needs interests |
| P1 sources | P2 relevance | (2) scoring needs findings |
| P2 relevance | P3 classify | classification scores ranked findings |
| P3 classify | P3 routing | (3) routing consumes class |
| P3 classify | P4 synthesis / export | (3) export consumes class |
| P0 ExportAdapter port | P4 CAW-03 export | (5) export only via port |
| P5 ledger | P5 CAW-03 export hardening | (4) novelty traces to LedgerLink |
| P5 ledger | P6 CAW-02 export | (4) RelatedWork traces to ledger |

## Open Questions
- Can the minimal CAW-03 export at M1 emit an *unverified* signal flagged "pending-ledger-verification", or must
  even M1 carry a LedgerLink? TODO(open-question) → [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- Order runbooks by this DAG; a runbook may not depend on a later-phase artifact except the one pulled-forward
  CAW-03 export seam noted above.
- Keep the P1 interest/source split as two independent runbook tracks that join at P2.

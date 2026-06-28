# Dependency Graph

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./milestones-and-phases_ko.md](./milestones-and-phases_ko.md), [./risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md), [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md), [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md), [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 CAW-05의 **빌드 순서 DAG**를 명시한다: 무엇이 무엇보다 먼저 존재해야 하는가. 이는
[./milestones-and-phases_ko.md](./milestones-and-phases_ko.md) 뒤에 있는 순서 결정의 근거다. 컴포넌트 내부나
일정은 정의하지 않는다.

## Invariants (절대 역전되어서는 안 되는 edge들)
1. **adapter보다 ports + store 먼저** — 모든 adapter는 port + FILES-AS-TRUTH store에 plug-in한다; seam을
   먼저 구축(ADR-0001/0006).
2. **relevance보다 interest model + sources 먼저** — relevance는 ingested된 finding에 대해 interest를 점수화한다;
   두 입력 모두 존재해야 한다(ADR-0002/0003).
3. **route/export보다 classify 먼저** — routing과 export 결정은 two-axis classification을 소비한다(ADR-0004).
4. **novelty export보다 ledger 먼저** — CAW-03 novelty signal은 provenance-complete, verified된 LedgerLink로
   추적되어야 한다(ADR-0005/0007).
5. **port 없는 export 없음** — ExportAdapter가 유일한 export seam이다; 직접 cross-product write 없음,
   shared store 없음(ADR-0007).

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

## M1까지의 Critical path
`P0 (core+ports+store) → P1 (interests ∥ sources) → P2 (relevance) → P3 (classify) → P4 (digest + CAW-03 export)`.
두 P1 branch(interest model, source adapters)는 **병렬로** 실행되지만 P2 전에 **합류**한다. 최소 CAW-03
ExportAdapter는 P5에서 M1으로 앞당겨지는 유일한 조각이다 — signal 하나를 emit할 만큼만; 완전한 ledger
verification은 M2다.

## Edge table

| From | To | Why (which invariant) |
|------|----|-----------------------|
| P0 ports+store | P1 adapters | (1) adapter는 port + store가 필요 |
| P1 interests | P2 relevance | (2) scoring에 interest 필요 |
| P1 sources | P2 relevance | (2) scoring에 finding 필요 |
| P2 relevance | P3 classify | classification은 ranked finding을 점수화 |
| P3 classify | P3 routing | (3) routing이 class를 소비 |
| P3 classify | P4 synthesis / export | (3) export가 class를 소비 |
| P0 ExportAdapter port | P4 CAW-03 export | (5) export는 port를 통해서만 |
| P5 ledger | P5 CAW-03 export hardening | (4) novelty는 LedgerLink로 추적 |
| P5 ledger | P6 CAW-02 export | (4) RelatedWork는 ledger로 추적 |

## Open Questions
- M1의 최소 CAW-03 export가 "pending-ledger-verification"으로 flag된 *unverified* signal을 emit할 수 있는가,
  아니면 M1조차 LedgerLink를 지녀야 하는가? TODO(open-question) →
  [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## Implications for runbooks
- 이 DAG로 runbook을 순서 지을 것; runbook은 위에 언급된 앞당겨진 CAW-03 export seam 하나를 제외하고는
  later-phase artifact에 의존해서는 안 된다.
- P1 interest/source 분할을 P2에서 합류하는 두 개의 독립 runbook 트랙으로 유지할 것.

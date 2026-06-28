# Dependency Graph — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases.md), [../10-runbooks/README.md](../10-runbooks/README.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The dependency DAG between phases/components so runbooks run in a valid order.

## Phase DAG

```
phase-0 (core skeleton + ports + registry/preflight + governance store + fakes)
   │
   ▼
phase-1 (ledger import + GATE + assembly + confidentiality)         ← gate before anything drafts
   │
   ▼
phase-2 (WritingEngine=PaperOrchestra adapter + orchestration; Patent path + patent-first interlock)
   │
   ├──► phase-3 (novelty + paper ladder; CAW-05 import)
   │
   ▼
phase-4 (publish/sink + lifecycle + review; documented stubs: wiki/exp-server/venue/filing)
```

## Component dependencies

```
ports + registry/preflight ──► every adapter
GATE + claim ledger ──► input assembly ──► engine draft ──► review ──► publish
confidentiality ──► import AND publish (fail-closed)
patent-first interlock ──► publish (default-deny)         ← interlock must exist before any publish
citation_pool (engine output) + CAW-05 import ──► novelty ──► claim flags ──► interlock
SourceAdapter (CAW-02/01) ──► ledger ; future wiki/exp-server = stubs behind same port
```

## Critical path to Milestone 1

```
phase-0 ─► phase-1 (gate+assembly) ─► phase-2 (PaperOrchestra adapter + orchestration)
        ─► review ─► publish(PDF)        = one evidence-gated paper (UC-1 / T8)
```

Patent path, novelty/ladder, and the future-connector stubs are OFF the Milestone-1 critical path.

## Hard gates

| Gate | Blocks |
| --- | --- |
| ports + registry + lint/CI (phase-0) | all adapters |
| GATE implemented + tested (phase-1) | any assembly/draft |
| patent-first interlock (phase-2) | any publish |
| confidentiality fail-closed (phase-1) | any export |

## Open questions

Whether phase-3 (novelty) can fully parallel phase-2 given engine coupling — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Each runbook's `Depends on:` must reflect this DAG; no publish runbook ships before the interlock + confidentiality.

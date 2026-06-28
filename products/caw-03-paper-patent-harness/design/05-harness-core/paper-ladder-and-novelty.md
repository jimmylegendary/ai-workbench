# Paper Ladder & Novelty — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [evidence-gate-and-claim-ledger.md](./evidence-gate-and-claim-ledger.md), [patent-drafting-module.md](./patent-drafting-module.md), [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue.md), [../01-decisions/ADR-0006-paper-ladder-and-novelty.md](../01-decisions/ADR-0006-paper-ladder-and-novelty.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

How CAW-03 governs novelty/claim-boundary and plans the P1/P2/P3 paper ladder. **The harness decides; the engine
and radar only supply.**

## Novelty inputs (supply only)

| Source | Provides |
| --- | --- |
| PaperOrchestra `citation_pool` | Semantic-Scholar-verified **paper prior-art** (reused, not re-queried) |
| `Novelty/RadarAdapter` ← CAW-05 | related-work + **threat/support signals** (imported across the boundary) |
| (stub) live prior-art/patent search | patent prior-art (future adapter) |

The harness combines these to flag each claim.

## Claim flags

- **novel** — no blocking prior-art found.
- **threatened** — prior-art/radar overlaps; needs differentiation before drafting.
- **patent-sensitive** — should be patent-first; sets the interlock ([patent-drafting-module.md](./patent-drafting-module.md)).

## The P1/P2/P3 ladder

The planned program paper sequence (from items/03), each a `PaperLadderEntry` with claim refs, readiness, threats:

1. **P1** — syntorch as an executable synthetic frontend for memory-centric DSE of unbuilt AI hardware.
2. **P2** — control-plane method for tracking moving memory-demand axes in evolving AI workloads.
3. **P3** — TTT-class inference writeback traffic as a new architectural memory axis. *(future-device → stricter gate, often patent-first)*

Readiness = gate status of its claims + novelty flags + (for P3) patent-first clearance.

## Confidentiality of prior-art queries

Querying a third-party prior-art API with internal claim text can leak ideas. Restrict queries to **public-boundary
claim text only**; redact the query string before it leaves (TODO(open-question) on exact rule).

## Open questions

Overlap threshold + embedding model without a shared dependency on CAW-05's scorer; whether CAW-05 signals key to
CAW-03 claim ids or CAW-02 ids (re-map); novelty freshness SLA before submission — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The novelty/ladder runbook implements the Novelty/Radar port import + citation_pool reuse + claim flagging + ladder
tracking, with the public-only prior-art query guard.

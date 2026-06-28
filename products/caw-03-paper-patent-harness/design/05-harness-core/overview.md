# Harness Core Overview (Folder Map) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** every doc in this folder; [../00-overview/vision.md](../00-overview/vision.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Index + mental model for the harness core. The core owns all governed logic; adapters supply data/engines behind
ports. This folder elaborates each core concern.

## The core in one picture

```
import → ledger → GATE → assemble → draft(engine) → review → publish
                   │                    │                        │
            (P1/P2/P3, fail-closed)  (engine-neutral)   (confidentiality + patent-first interlock)
   novelty/ladder feeds the gate/flagging; patent path branches after the shared gated front
```

## Document map

| Concern | Doc |
| --- | --- |
| Evidence gate + claim ledger | [evidence-gate-and-claim-ledger.md](./evidence-gate-and-claim-ledger.md) |
| Assembling engine-neutral inputs | [input-assembly.md](./input-assembly.md) |
| WritingEngine port + PaperOrchestra adapter | [writing-engine-adapter-paperorchestra.md](./writing-engine-adapter-paperorchestra.md) |
| Patent path + interlock | [patent-drafting-module.md](./patent-drafting-module.md) |
| Ports & adapters (open seams) | [ports-and-adapters.md](./ports-and-adapters.md) |
| Paper ladder + novelty | [paper-ladder-and-novelty.md](./paper-ladder-and-novelty.md) |
| Artifact lifecycle | [artifact-lifecycle.md](./artifact-lifecycle.md) |

## Invariants the core guarantees

- No ungated claim is ever drafted (gate before assembly).
- Generated text is never evidence.
- An adapter cannot weaken a gate, the interlock, or confidentiality.
- Every artifact's content traces to CAW-02 claims+evidence and CAW-01 results.

## Open questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

This folder maps onto the phase-1 (core/gate/assembly), phase-2 (engine/patent), phase-3 (novelty/ladder), and
phase-4 (publish/lifecycle) runbooks.

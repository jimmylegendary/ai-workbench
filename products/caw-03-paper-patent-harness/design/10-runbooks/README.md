# Runbooks — CAW-03 Build Instructions

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** the AI builder
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md · conventions: [runbook-conventions.md](./runbook-conventions.md)

## What these are

The executable build plan for CAW-03 — the paper/patent **harness** that wraps PaperOrchestra and adds governance.
Design docs (`design/00..09`) say *what/why*; runbooks say *how to build it*. The builder writes the code; it does
NOT rebuild PaperOrchestra.

## How to execute

1. Read [runbook-conventions.md](./runbook-conventions.md) + `../_meta/PRODUCT-BRIEF.md`.
2. Run phases in order; respect each runbook's `Depends on:` and the gates in [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md).
3. Confirm Acceptance criteria before moving on.

## Phases

| Phase | Folder | Runbooks |
| --- | --- | --- |
| 0 Foundations | `phase-0-foundations` | RB-000 scaffold · RB-001 tooling+op-manifest · RB-002 ports+registry+preflight · RB-003 governance store |
| 1 Gate & assembly | `phase-1-gate-and-assembly` | RB-010 source adapters + ledger import · RB-011 evidence gate · RB-012 input assembly · RB-013 confidentiality |
| 2 Engine & patent | `phase-2-engine-and-patent` | RB-020 PaperOrchestra WritingEngine adapter · RB-021 orchestration + lifecycle · RB-022 patent module · RB-023 patent-first interlock |
| 3 Novelty & ladder | `phase-3-novelty-and-ladder` | RB-030 novelty/radar + citation_pool · RB-031 paper ladder |
| 4 Publish, interfaces, stubs | `phase-4-publish-interfaces-stubs` | RB-040 publish/sink + confidentiality · RB-041 review · RB-042 API/MCP/CLI · RB-043 documented stubs (wiki/exp-server/venue/filing) |

## Milestone 1 chain

`RB-000 → RB-001 → RB-002 → RB-003 → RB-010 → RB-011 → RB-012 → RB-013 → RB-020 → RB-021 → RB-040 → RB-041`
= one evidence-gated paper produced via PaperOrchestra (UC-1 / T8). Patent path, novelty, and stubs follow.

## Budget discipline

Runbooks are small and resumable; resume at the next unstarted runbook after any interruption.

# Research Plan — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [validation-and-tests.md](./validation-and-tests.md), [open-questions.md](./open-questions.md), [../02-research/](../02-research/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The uncertainty-reduction backlog that runs alongside the build, each tied to an ADR + phase.

## Research tracks

| # | Track | Question | Ties to | Resolve by |
| --- | --- | --- | --- | --- |
| R1 | PaperOrchestra invocation | non-interactive entrypoint + who runs its LLM/web/vision steps headless | [ADR-0002](../01-decisions/ADR-0002-writing-engine-integration.md) | phase-2 |
| R2 | PaperOrchestra versioning | pin suite + outline.json/citation_pool schema (EngineDescriptor.version) | ADR-0002 | phase-0/2 |
| R3 | Claim typing | P1/P2/P3 auto-inferred (human confirm) vs human-assigned | [ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md) | phase-1 |
| R4 | Gate thresholds | minimum trust/evidence per claim type + per venue | ADR-0003 | phase-1 |
| R5 | Jurisdiction & patent-first | grace vs absolute-novelty default; provisional-first; counsel hand-off | [ADR-0004](../01-decisions/ADR-0004-patent-drafting.md) | phase-2 |
| R6 | Source fan-in | precedence + provenance merge when multiple SourceAdapters active | [ADR-0005](../01-decisions/ADR-0005-ports-and-adapters.md) | phase-1 |
| R7 | Sync vs async engine | blocking draft() vs job-handle/poll (port signature) | ADR-0005 | phase-2 |
| R8 | Novelty threshold | overlap threshold + embedding without depending on CAW-05's scorer | [ADR-0006](../01-decisions/ADR-0006-paper-ladder-and-novelty.md) | phase-3 |
| R9 | Prior-art confidentiality | redact query text before third-party API; public-only | ADR-0006/[ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary.md) | phase-3 |
| R10 | Redaction ruleset home | vendored+pinned vs envelope-pinned (no shared dependency) | ADR-0007 | phase-0 |
| R11 | Storage shape | SQLite single-file vs dir-of-files; md-first for governance? | [ADR-0008](../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md) | phase-0 |

## Method

- Each track resolves into a doc update (decision recorded) or a spike runbook with an acceptance gate.
- Findings update the owning ADR and clear the matching row in [open-questions.md](./open-questions.md).

## Sequencing vs build

```
phase-0  ── R2, R10, R11
phase-1  ── R3, R4, R6
phase-2  ── R1, R5, R7
phase-3  ── R8, R9
```

## Implications for runbooks

R1/R2 gate the engine adapter; R5 gates the patent path; R8/R9 gate the novelty runbook.

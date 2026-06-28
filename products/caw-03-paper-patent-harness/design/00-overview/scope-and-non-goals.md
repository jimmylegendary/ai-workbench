# Scope & Non-Goals — CAW-03 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision.md](./vision.md), [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md), [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Hard boundary around **CAW-03 v1** so it stays a thin governance harness over PaperOrchestra, not a re-implemented
paper pipeline and not a premature integrations project.

## In scope (v1)

| Area | v1 commitment |
| --- | --- |
| Harness core | op-manifest of governed operations; one core, thin surfaces ([ADR-0001](../01-decisions/ADR-0001-product-surface.md)) |
| Writing engine | wrap **PaperOrchestra** as the v1 `WritingEngineAdapter` (subprocess) ([ADR-0002](../01-decisions/ADR-0002-writing-engine-integration.md)) |
| Evidence gate + claim ledger | type-specific configurable gate over imported CAW-02 ledger; generated-text-never-evidence ([ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md)) |
| Input assembly | build engine-neutral inputs from gated claims + CAW-01 result refs |
| Patent path | `PatentEngine` port + v1 baseline adapter + patent-first interlock ([ADR-0004](../01-decisions/ADR-0004-patent-drafting.md)) |
| Ports & adapters | 5 ports + config registry + capability preflight + **documented stubs** ([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters.md)) |
| Novelty + paper ladder | harness-decides-novelty; reuse citation_pool + CAW-05 import; P1/P2/P3 ([ADR-0006](../01-decisions/ADR-0006-paper-ladder-and-novelty.md)) |
| Confidentiality | inherit CAW-02 boundary×visibility; public-safe export ([ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary.md)) |
| Surfaces | API + MCP + CLI + minimal review/status UI |
| Data | CAW-03's own governance data (file/SQLite); CAW-01/02 referenced by id/URI |

## Out of scope / explicit non-goals (v1)

- **Rebuilding the writing pipeline** — outline/plots/lit-review/section-writing/refinement stay in PaperOrchestra.
- **Implementing the internal wiki / experiment-server connectors** — define the **ports + documented stubs ONLY**.
- **Autonomous venue submission or patent filing** — a human (and counsel for patents) gate is mandatory.
- **Owning the knowledge repository** (CAW-02) or **the simulation runs** (CAW-01) — referenced, never duplicated.
- **Re-querying paper prior-art** — reuse PaperOrchestra's Semantic-Scholar-verified `citation_pool`.
- **Legal judgment** — patentability/eligibility is flagged for human/counsel, not decided by the harness.
- **Full portfolio automation** — v1 tracks the P1/P2/P3 ladder; Jimmy decides what/when to write & file.

## Deferred but seam-anticipated

These are NOT built in v1 but the ports must not preclude them: internal wiki source+sink, experiment-server
source, live prior-art/patent search adapters, venue-submission and patent-filing sinks, alternate writing engines.
Each ships as a stub adapter (interface + not-implemented marker + config example).

## Guardrails (inherited)

- No confidential data in public-facing outputs; public outputs from public-safe sources only.
- Never conflate public-source research with internal Samsung/SAIT claims.
- Generated summaries are not evidence; keep sources/claims/evidence/conclusions separate.

## Open questions

Jurisdiction & patent-first defaults, claim-typing auto vs human, PaperOrchestra version pinning — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Each non-goal becomes a "do NOT build / stub only" guard in the relevant runbook; the in-scope table is the v1
completeness checklist.

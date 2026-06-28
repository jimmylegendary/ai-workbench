# Open Questions (Tracked) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan.md](./research-plan.md), all ADRs in [../01-decisions/](../01-decisions/), all research in [../02-research/](../02-research/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The single tracked list aggregated from the research docs + ADRs.

## Tracked questions

| ID | Question | Owner | Resolve by | Status |
| --- | --- | --- | --- | --- |
| OQ-01 | PaperOrchestra **non-interactive entrypoint** — does a headless PO CLI exist or does CAW-03 embed an agent runner for its LLM/web/vision steps? | [ADR-0002](../01-decisions/ADR-0002-writing-engine-integration.md) | phase-2 | open |
| OQ-02 | PO **version/schema pinning** (outline.json / citation_pool.json) policy | ADR-0002 | phase-0 | open |
| OQ-03 | Reliable **figure_id ↔ result_id** binding across PO PlotOn/PlotOff | ADR-0002 | phase-2 | open |
| OQ-04 | Exact **engine-neutral IdeaDoc/ExpLog schema** so non-PO engines reuse it | ADR-0002 | phase-1 | open |
| OQ-05 | Do PO intermediate artifacts (outline.json etc.) need the **confidentiality filter** before storage? | [ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary.md) | phase-2 | open |
| OQ-06 | **Claim typing** P1/P2/P3 auto-infer (human confirm) vs human-assigned | [ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md) | phase-1 | open |
| OQ-07 | **Minimum trust per venue** (is T1 enough for a P1 paper claim?) | ADR-0003 | phase-1 | open |
| OQ-08 | **Re-gating** in-flight artifacts when a CAW-02 bundle is superseded (poll/webhook/re-import) | ADR-0003 | phase-1 | open |
| OQ-09 | Who owns the patent **§112 enablement** check (harness rule / human / PatentEngine)? | [ADR-0004](../01-decisions/ADR-0004-patent-drafting.md) | phase-2 | open |
| OQ-10 | **Jurisdiction** (grace vs absolute-novelty) + provisional-first strategy + counsel hand-off SLA/format | ADR-0004 | phase-2 | open |
| OQ-11 | Can the harness flag **101/eligibility** risk or defer entirely? | ADR-0004 | phase-2 | open |
| OQ-12 | **Source fan-in** precedence + provenance merge across multiple SourceAdapters | [ADR-0005](../01-decisions/ADR-0005-ports-and-adapters.md) | phase-1 | open |
| OQ-13 | **Sync vs async** engine run (job-handle/poll) → WritingEngine port signature | ADR-0005 | phase-2 | open |
| OQ-14 | Adapter **discovery** (entry-point group vs manifest) + SemVer/compat policy | ADR-0005 | phase-0 | open |
| OQ-15 | Per-adapter **secrets/auth** model (env refs only?) given no shared substrate | ADR-0005 | phase-1 | open |
| OQ-16 | Is **Novelty** one port or split (related-work vs threat/radar)? | ADR-0005/[ADR-0006](../01-decisions/ADR-0006-paper-ladder-and-novelty.md) | phase-3 | open |
| OQ-17 | Novelty **overlap threshold + embedding** without depending on CAW-05's scorer | ADR-0006 | phase-3 | open |
| OQ-18 | Do CAW-05 signals key to **CAW-03 claim ids or CAW-02 ids** (re-map)? | ADR-0006 | phase-3 | open |
| OQ-19 | **Prior-art query confidentiality** — public-only claim text + query redaction | ADR-0006/ADR-0007 | phase-3 | open |
| OQ-20 | **'counsel' tier** above 'internal' for patent egress + its redaction profile | ADR-0007 | phase-2 | open |
| OQ-21 | **Redaction-ruleset home** (vendored+pinned vs envelope-pinned; no shared dep) | ADR-0007 | phase-0 | open |
| OQ-22 | **Reclassification authority** (local clearance vs CAW-02 re-import) | ADR-0007 | phase-2 | open |
| OQ-23 | **Storage shape** SQLite single-file vs dir-of-files; md-first governance? | [ADR-0008](../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md) | phase-0 | open |
| OQ-24 | Persist **blocked claims** as first-class backlog (leaning yes) | ADR-0003 | phase-1 | open (lean yes) |

## Process

Close a question by recording the decision in its owning ADR/doc and flipping Status to `resolved`.

## Implications for runbooks

Gating questions (OQ-01/02 engine, OQ-10 patent-first, OQ-14 discovery, OQ-21/23 storage) must resolve in their
phase's first runbook before dependent work.

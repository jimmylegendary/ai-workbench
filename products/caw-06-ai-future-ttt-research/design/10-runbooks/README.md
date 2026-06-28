# Runbooks — CAW-06 (AI Future / TTT Research Automation)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./runbook-conventions.md](./runbook-conventions.md), [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md), [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md), [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This folder holds the **build instructions an AI builder executes** to construct CAW-06: an independent AI-future / TTT research-automation product. Each runbook (`RB-XXX`) is one cohesive, verifiable build unit in the STRICT format of [DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS.md). This README is the **index + execution order + gate map**. It does NOT decide design (see `../01-decisions/` ADRs) or schemas (see `../05-ttt-research-core/`). The builder writes the real code; runbook code blocks are guidance only.

## What these runbooks build
ONE pipeline core — the **ExperimentScout Run**: `discover → import (from CAW-05) → dedup → extract claims → hypothesize → plan + run toy experiment → log → implication map → writeback schema → export` — behind **3 thin surfaces** (scheduled/triggered pipeline, CLI, MCP), producing **5 output artifact kinds** (research-thread records, experiment ledger entries, hypothesis cards, implication maps, writeback-traffic schema bundles). The store is **CAW-06's OWN**; every export crosses an explicit boundary with **no shared store**.

## Execution order & gates
Runbooks are topologically sorted by [dependency-graph.md](../09-roadmap/dependency-graph.md). Execute in ascending number; a runbook may only `Depends on:` upstream runbooks. **Do not start a phase until the previous phase's exit gate (in [milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)) is green.** Leave the tree compiling + lint-passing at every Acceptance checkpoint so an interrupted build resumes cleanly.

Hard ordering rules (from the DAG):
- **R1** Store layout + record schemas before everything.
- **R2** Ports before adapters (stubs documented first, raise `NotImplemented`-style guards).
- **R3** Ingestion (S1–S5) + hypothesis before experiment.
- **R4** Experiment ledger + writeback schema before export.
- **R5** `wbtraffic.v0` schema before `Caw01WritebackAdapter`.
- **R6** Implication map after a finding exists.

## Phase table

| Phase | Folder | Theme | Runbooks | Exit gate (summary) |
|-------|--------|-------|----------|---------------------|
| P0 Foundations | `phase-0-foundations/` (`RB-0XX`) | Store layout, domain records, ports (no adapters) | RB-001 store layout; RB-002 record schemas + validators (Source/Claim/Hypothesis/Ledger/Implication); RB-003 three port interfaces + documented stubs | `store/{sources,claims,hypotheses,ledger,implications}` round-trips; every record kind has schema+validator; 3 ports compile with stubs raising `NotImplemented`; tree green (ADR-0007, ADR-0001) |
| P1 Ingestion + Hypothesis | `phase-1-ingestion-and-hypothesis/` (`RB-1XX`) | S1–S5 pipeline; claim → hypothesis | RB-101 `SourceAdapter` v1 (arXiv/Sem.Scholar + CAW-05 import); RB-102 ingestion S1–S5 (discover→import→dedup→extract→persist), idempotent + resumable; RB-103 hypothesis records (4-state status, calibrated uncertainty, evidence cap) | One thread persisted from a real source; Hypothesis default `hypothesis` + qualitative uncertainty; re-run does not duplicate; nothing crosses a boundary stripped of status/uncertainty (ADR-0002, ADR-0005) |
| P2 Experiment | `phase-2-experiment/` (`RB-2XX`) | Pre-registered toy experiments | RB-201 `ExperimentRunnerAdapter` v1 (minimal local runner); RB-202 ledger entry (pre-registered decision rule → 4-value verdict, append-only); RB-203 reproducibility gate (config+seed+env) + negative-result classification/surfacing | One `ledger/EXP-XXXX` append-only entry with pre-registered rule, four-value verdict, passing reproducibility gate; a deliberately-failing run recorded + classified + surfaced by default (ADR-0003) |
| P3 Writeback + Implication | `phase-3-writeback-and-implication/` (`RB-3XX`) | Implication maps; `wbtraffic.v0` L0 estimate | RB-301 ImplicationMap across ADR-0006 domains (generated-summary flag); RB-302 `wbtraffic.v0` analytic L0 estimate (all fields present, numerics default `TODO(open-question)`, basis marked, open questions, CAW-01 IR names re-verified) | One ImplicationMap + one self-describing writeback bundle, modeled-vs-measured marked, CAW-01 IR names re-verified against CAW-01 (ADR-0006, ADR-0004) |
| P4 Export + Schedule | `phase-4-export-and-schedule/` (`RB-4XX`) | ExportAdapter v1; surfaces hardened | RB-401 ExportAdapter registry + `Caw01WritebackAdapter` (bundle + open questions → boundary path); RB-402 `Caw02ClaimAdapter` (claims + evidence → boundary path) + inert documented stubs; RB-403 scheduled/triggered scout + CLI + MCP surfaces over the one core | Both adapters emit boundary bundles one-way (no shared store); stubs registered but inert; surfaces wrap the same core; M1 checklist fully green (ADR-0008, ADR-0001) |

> Runbook numbering within a phase is the builder's local sequence; the table lists the minimum units. Split a unit only if each split keeps the tree green and stays atomically verifiable.

## Milestone 1 — the proving slice (LOAD-BEARING)
M1 is the acceptance spine threaded through RB-1XX..RB-4XX: one checkable TTT claim travels the whole thread and produces an exported `wbtraffic.v0` analytic estimate for CAW-01 (a separate product). The chain:

```
RB-001/002/003 (store + schemas + ports)
  → RB-101 SourceAdapter v1 → RB-102 ingest S1..S5 → RB-103 hypothesis (status=hypothesis)
  → RB-201 runner v1 → RB-202 ledger entry (verdict) + RB-203 reproducibility gate
  → RB-301 ImplicationMap (generated-summary flagged)  +  RB-302 wbtraffic.v0 (analytic L0)
  → RB-401 Caw01WritebackAdapter → [boundary path] CAW-01
```

M1 **succeeds even if the toy experiment refutes the claim or errors** — the thread, the logged negative result, and the estimate-with-open-questions are the deliverable, not a positive finding. The ImplicationMap hangs off the finding and joins before the checklist closes but is off the schema→CAW-01 critical path. Full done-checklist in [milestones-and-phases.md §Milestone 1](../09-roadmap/milestones-and-phases.md).

## Builder discipline (read before executing any runbook)
See [runbook-conventions.md](./runbook-conventions.md) for the full rules. The non-negotiables:
- **No overclaim** — honor the 4-state status lifecycle; a hypothesis is never a settled claim.
- **Evidence cap** — generated evidence can NEVER promote a hypothesis's status.
- **Failures useful** — negative results are retained, classified, and surfaced by default.
- **Reproducibility gate** — no ledger entry without config+seed+env captured.
- **Writeback is an export onto CAW-01** — a self-describing bundle lowered onto CAW-01's L0 objects + open questions; one-way push, no shared store, CAW-01 IR names re-verified.
- **Generated summaries are not evidence** — mark them generated.
- **Stubs are `NotImplemented`** — documented, registered, inert.
- **Leave the tree green** at every Acceptance checkpoint.

## Budget discipline
Prefer the **smallest vertical slice** over broad scaffolding (brief §12). For each runbook: build only the v1 unit named in the phase table; defer breadth (multiple SourceAdapters, 5–10 themes, toy-grounded grounding, extra export stubs) to M2–M4. Do not invent numerics, dates, or benchmark values — unknowns are `TODO(open-question: ...)`. Toy experiments are minimal reproductions only; v1 does no large-scale training or real TTT at scale. Every byte of compute and every model call should serve closing one M1 checkbox.

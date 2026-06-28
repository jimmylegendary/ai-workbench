# Review / Status UI (minimal) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-and-mcp.md](./api-and-mcp.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

A deliberately minimal read/act surface for the human gates. Control-plane feel, not an editor.

## Views

| View | Shows |
| --- | --- |
| **Artifact board** | artifacts by lifecycle state (gated→assembled→drafting→drafted→reviewed→published / filing-gate / held) |
| **Gate view** | per-claim gate status + the **blocked-claim backlog** (why each failed) |
| **Novelty/ladder** | claim flags (novel/threatened/patent-sensitive) + P1/P2/P3 readiness |
| **Review** | checklist + autorater scores; approve → publish/filing-gate |
| **Adapters** | registry + capability preflight status (incl. which future connectors are stubs) |

## Actions (all go through the core)

- Approve review; trigger `publish` (confirmation + interlock + confidentiality in core).
- Send patent draft to the human/counsel **filing-gate** (never auto-files).
- Release a patent-first interlock once counsel clears.

## Non-goals

Editing claims/evidence (that's CAW-02), editing drafts (that's the engine), or bypassing any gate. The UI cannot
do what the op-manifest forbids.

## Open questions

Whether v1 ships the UI or CLI-only first (UI is "minimal" and could follow) — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The UI runbook is thin: read lifecycle/gate/novelty/review state + invoke the same governed ops; it is optional for
Milestone 1 (CLI suffices).

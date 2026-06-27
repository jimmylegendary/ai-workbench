# Runbook Conventions — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** the AI builder
- **Source of truth:** ../_meta/SOURCE-BRIEF.md · ../_meta/DOC-CONVENTIONS.md §6

## The contract

Every runbook follows the strict format from [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md) §6:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder>
- Depends on: [RB-###, ...]
- Implements design: [links]
- Produces: <artifacts/files/components>

## Objective        — one paragraph; what "done" looks like
## Preconditions     — checklist that must be true before starting
## Steps             — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off          — what the next runbook can assume
```

## Rules for the builder

- **One runbook = one cohesive unit.** Do not skip ahead; respect `Depends on:` and phase gates.
- **Every step has a Verify.** If a Verify fails, stop and fix before proceeding — do not batch past failures.
- **Code in runbooks is guidance** (skeletons, signatures, config). You write the real implementation, matching
  the surrounding codebase style.
- **Honor the boundaries**: `@caw/core` has zero `next` deps; the Python engine never runs in the Next.js process
  ([../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md)).
- **Honor non-goals**: do not build deferred features ([../00-overview/scope-and-non-goals.md](../00-overview/scope-and-non-goals.md)).
- **Mark unknowns**: if a step hits an open question ([../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)),
  use the documented default and note it; do not invent facts about `syntorch` beyond the SOURCE-BRIEF.
- **Resumability**: leave the tree in a green (compiling, lint-passing) state at each Acceptance checkpoint so an
  interrupted build can resume cleanly (RK-6).

## Verify vocabulary

- `cmd:` a shell command whose exit code / output is the check.
- `test:` a unit/e2e test that must pass.
- `view:` a manual/visual confirmation (screenshot or described state).

## Status meaning

- `ready` — all `Depends on:` are complete and gate is green.
- `blocked` — waiting on a dependency, a gate, or an open question; state which.

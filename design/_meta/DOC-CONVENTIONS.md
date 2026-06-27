# DOC CONVENTIONS — how every file in `design/` is written

All authors (human or AI) follow these conventions so the doc set reads as one coherent system.

## 1. Language & audience
- **Language: English** for all design artifacts and runbooks (technical precision + tooling).
- Two audiences: (a) **Jimmy / reviewers** (design docs: what & why), (b) **the AI builder** (runbooks: how).

## 2. File header (every doc starts with this)
```
# <Title>

- **Status:** draft | reviewed | accepted
- **Owner:** Jimmy
- **Last-reviewed:** (leave as TODO; do not invent dates)
- **Related:** [relative links to sibling docs]
- **Source of truth:** ../_meta/SOURCE-BRIEF.md
```
Then a one-paragraph **Purpose** stating what this doc decides/describes and what it explicitly does NOT cover.

## 3. Structure
- Use `##`/`###` headings, short paragraphs, tables for comparisons, fenced code for schemas/snippets.
- Prefer **decision tables** and **explicit tradeoffs** over prose walls.
- End design docs with **Open Questions** (link them into `08-research-plan/open-questions.md`)
  and **Implications for runbooks** (which RB files this doc drives).
- Do NOT invent dates, benchmark numbers, or internal facts. Mark unknowns as `TODO(open-question: ...)`.

## 4. Cross-linking
- Link with relative paths, e.g. `[L0 IR](../05-caw01-simulation-control-plane/l0-ir-schema.md)`.
- Every ADR referenced by a design doc must be linked; every design doc that a runbook implements must be linked back.

## 5. ADR format (`01-decisions/ADR-XXXX-*.md`)
```
# ADR-XXXX: <decision title>
- Status: proposed | accepted | superseded
- Context: <forces, constraints, what we must satisfy>
- Options considered: <table: option | pros | cons | fit>
- Decision: <the chosen option, stated plainly>
- Consequences: <what becomes easy/hard; follow-on work>
- Open questions / revisit triggers
```

## 6. Runbook format (`10-runbooks/**/RB-*.md`) — STRICT
Runbooks are executed by an AI builder. Each runbook is **one cohesive build unit** and MUST contain:
```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-### , RB-###]   # runbooks that must complete first
- Implements design: [links to design docs this realizes]
- Produces: <artifacts/files/components this runbook creates>

## Objective
One paragraph: what "done" looks like for this runbook.

## Preconditions
Checklist of state that must already be true before starting.

## Steps
Numbered, atomic, verifiable steps. Each step:
  - **Do:** the concrete action (commands, files to create, code skeleton)
  - **Verify:** how the AI confirms the step worked (command output, test, screenshot)
Steps should be small enough that a wrong one is caught at its own Verify.

## Acceptance criteria
A checklist that, when all true, means the runbook is complete. Must be objectively checkable.

## Rollback / safety
How to undo if a step fails midway.

## Hand-off
What the next runbook(s) can now assume.
```
- Runbooks reference design docs for rationale; they do NOT re-explain the why at length.
- Code in runbooks is **build guidance** (skeletons, signatures, config). The builder writes the real code.
- Number scheme: `RB-0XX` phase 0, `RB-1XX` phase 1, ... matching the phase folder.

## 7. Naming
- Files: kebab-case `.md`. ADRs: `ADR-XXXX-topic.md`. Runbooks: `RB-XXX-topic.md`.
- Use the entity names from the SOURCE-BRIEF exactly (e.g. `MemoryAnnotatedIR`, `syntorch`, `Chakra trace`).

## 8. Consistency contract
- The pipeline, the 3 canvases, the 1:9 layout, the nav bar, the work-tree, the L0/L1/L2 fill levels,
  and the syntorch description are FIXED by the SOURCE-BRIEF. Elaborate them; do not redefine them.

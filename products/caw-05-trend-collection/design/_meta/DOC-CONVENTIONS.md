# DOC CONVENTIONS — how every file in a product's `design/` is written

Product-agnostic conventions. Copy this file to `<product>/design/_meta/DOC-CONVENTIONS.md`. Read together with
that product's `_meta/PRODUCT-BRIEF.md` (the single source of truth).

## 1. Language & audience
- **Language: English** for all design artifacts and runbooks (technical precision + tooling).
- Two audiences: reviewers (design docs: what & why) and the **AI builder** (runbooks: how).

## 2. File header (every doc starts with this)
```
# <Title>

- **Status:** draft | reviewed | accepted
- **Owner:** Jimmy
- **Last-reviewed:** (leave as TODO; do not invent dates)
- **Related:** [relative links to sibling docs]
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
```
Then a one-paragraph **Purpose** stating what this doc decides/describes and what it does NOT cover.

## 3. Structure
- Use `##`/`###` headings, short paragraphs, tables for comparisons, fenced code for schemas/snippets.
- Prefer **decision tables** and **explicit tradeoffs** over prose walls.
- End design docs with **Open Questions** (link into `08-research-plan/open-questions.md`) and **Implications
  for runbooks**.
- Do NOT invent dates, benchmark numbers, or internal facts. Mark unknowns as `TODO(open-question: ...)`.

## 4. Cross-linking
- Link with relative paths. Link every ADR a doc relies on; link back from runbooks to the design they implement.
- Cross-product references are **import/export boundaries** — name the other product (e.g. "CAW-05, a separate
  product") and never imply a shared store/registry/substrate.

## 5. ADR format (`01-decisions/ADR-XXXX-*.md`)
```
# ADR-XXXX: <decision title>
- Status: proposed | accepted | superseded
- Context: <forces, constraints>
- Options considered: <table: option | pros | cons | fit>
- Decision: <the chosen option, stated plainly>
- Consequences: <what becomes easy/hard; follow-on work>
- Open questions / revisit triggers
```

## 6. Runbook format (`10-runbooks/**/RB-*.md`) — STRICT
Each runbook is one cohesive build unit executed by an AI builder:
```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [links]
- Produces: <artifacts/components>

## Objective         — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```
- Code in runbooks is **build guidance** (skeletons/signatures/config); the builder writes the real code.
- Number scheme: `RB-0XX` phase 0, `RB-1XX` phase 1, … matching the phase folder.
- Leave the tree green (compiling, lint-passing) at each Acceptance checkpoint so an interrupted build resumes cleanly.

## 7. Naming
- Files: kebab-case `.md`. ADRs: `ADR-XXXX-topic.md`. Runbooks: `RB-XXX-topic.md`.
- Use the entity/term names from the product's `PRODUCT-BRIEF.md` and `GLOSSARY.md` exactly.

## 8. Independence contract
- The product's core, data, and surfaces are its OWN. No shared runtime substrate with other products.
- The pieces fixed by the `PRODUCT-BRIEF.md` are FIXED — elaborate them; do not redefine them.

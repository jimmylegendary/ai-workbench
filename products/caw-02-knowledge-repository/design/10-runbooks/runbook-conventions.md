# CAW-02 Runbook Conventions — the builder contract

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [README.md](README.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)
  - [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc restates the **strict runbook contract** from
[DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS.md) and adds the **builder rules
specific to CAW-02** — the invariants an AI builder must never violate while
executing any `RB-*.md`. It does NOT define the phase sequence (see
[README.md](README.md)) nor the design decisions themselves (see
`../01-decisions/`). If anything here contradicts the
[PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF.md), the brief wins.

## 1. The strict runbook format (mandatory)

Every runbook is `10-runbooks/0X-<phase>/RB-XXX-<topic>.md`, kebab-case, with the
number scheme `RB-0XX` = P0, `RB-1XX` = P1, … matching its phase folder. It MUST
contain exactly this skeleton:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [relative links]
- Produces: <artifacts/components>

## Objective          — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```

Rules that bind every runbook:

- **Atomic, verifiable steps.** Each step has a concrete **Do:** and a
  **Verify:** that is objectively checkable (a command, a file's existence, a
  test result). No step is "done" until its Verify passes.
- **Code is build guidance only.** Skeletons, signatures, schemas, and config are
  illustrative; the builder writes the real code.
- **`Depends on:` mirrors the DAG.** It must match the edge list in
  [dependency-graph.md](../09-roadmap/dependency-graph.md). A runbook is `blocked`
  until every dependency is accepted/green.
- **Cross-link the design.** `Implements design:` links every ADR / design doc the
  runbook builds; link back from the runbook to the design it implements.
- **Use exact names.** Entity and term names come verbatim from
  [PRODUCT-BRIEF §5](../_meta/PRODUCT-BRIEF.md) and the GLOSSARY.
- **Green tree at every Acceptance checkpoint** — see rule 8 below.

## 2. Honor the evidence gate (structural, non-negotiable)

The evidence gate is **structural, not advisory**. Every runbook that touches
writes MUST preserve it:

- `attach_evidence` has **no prose field**. Evidence references a concrete
  artifact/source by `artifact_ref`, which **must resolve**. A note is NOT
  evidence; a generated summary is NEVER stored as Evidence.
- The **Claim→Evidence(≥1)** invariant is enforced in **three lockstep layers**:
  (1) frontmatter JSON-schema, (2) core validator, (3) reindex re-check. A Claim
  with zero Evidence must be **rejected at all three**. A runbook may not weaken
  any layer, and adding a layer-1 field requires updating layers 2 and 3 in the
  same runbook.
- Keep sources, claims, evidence, and generated conclusions **separate**
  (PRODUCT-BRIEF §10). Never conflate public research with internal claims.

## 3. md-git is the single source of truth

- The entity = a `.md` file (YAML frontmatter + body) under
  `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/`.
  These markdown files in git are the **only** authoritative store.
- **SQLite is a derived, disposable index.** Any runbook must assume the SQLite
  file can be deleted and fully reconstructed by the **deterministic, idempotent
  reindex** from `knowledge/` alone. Reindex on a fixed corpus must produce
  byte-identical content on repeat runs. FTS5 / vector schemas live in
  **separate droppable migrations** — never in the relational core schema.
- Builders must NOT make SQLite a source of truth, cache state that cannot be
  rebuilt from md-git, or write entity data anywhere except a `.md` file via the core.

## 4. Append-only + supersedes (no destructive writes)

- There is **no update and no delete** of knowledge. Corrections happen by
  writing a new version that **supersedes** the prior node; history is preserved.
- Every write appends **exactly one** line to `knowledge/_events/<ts>-<op>.jsonl`,
  and the git commit is the audit record. Runbooks must keep the events log
  append-only and one-line-per-write.
- Audit must reconstruct how every node reached its state (events + signed git
  commits/blame). Do not rewrite history.

## 5. One transactional core; surfaces are thin

- All validation, the evidence gate, trust recompute, boundary propagation, and
  the append-only audit live in **one transactional product core**.
- API, MCP, and CLI are **thin adapters codegen'd from one op manifest** — they
  add **zero** logic and **cannot bypass** the core validator or evidence gate. A
  conformance test must show identical behavior across all three surfaces.
- The op manifest (`add_source`, `parse`, `extract_claim`, `attach_evidence`,
  `synthesize_note`, classify/link) is the single definition surfaces generate from.

## 6. Agent safety: confirmation-by-default, no silent auto-accept

- Agent writes are **confirmation-by-default**; an agent write without
  confirmation is **blocked**. Rejected candidates are retained for audit.
- AI-authored nodes are **capped at trust T2** (never T3). Trust is recomputed
  deterministically by reindex.
- Boundary/visibility propagation is **monotone**: synthesizing from a
  `confidential` input never yields a less-restrictive boundary; private/team
  separation is never downgraded.
- Automatic generation is **proposal generation**; Jimmy reviews strategic
  decisions (PRODUCT-BRIEF §10).

## 7. No continual learning (v0 scope guard)

- v0 = **append + retrieve + skill-wrap**. Continual learning / autonomous
  self-editing of knowledge is a **non-goal** (PRODUCT-BRIEF §9). No runbook may
  build self-editing, a heavyweight graph DB (Neo4j), a rich editing UI, a public
  website, simulation/radar execution, or org-scale access control beyond
  team-vs-private. Keep the upgrade path open; do not implement it.
- No confidential company data in public-facing outputs; exports are public-safe
  only and fail-closed.

## 8. Leave the tree green at every checkpoint

- Each Acceptance checklist is a **resume point**: at it the tree must compile,
  lint, and schema-validate. An interrupted build resumes from the last green
  checkpoint.
- A runbook that cannot reach green within one builder session is **too big** —
  split it. Prefer small, single-concern, resumable runbooks (budget discipline,
  see [README.md](README.md)).
- The **Rollback / safety** section must describe how to undo a mid-way failure
  cleanly (revert the commit, drop and rebuild the SQLite index from md-git,
  discard a quarantined import) so the tree returns to the prior green state.

## 9. Independence contract

CAW-02 has its OWN core, data, and surfaces — **no shared runtime substrate** with
other products. CAW-01 / CAW-05 / CAW-03 interactions are **import/export
boundaries only** (files/APIs), with re-redaction at every crossing and **no
shared store/registry/DB**. Runbooks must name the other product as "a separate
product" and never imply a shared substrate.
```

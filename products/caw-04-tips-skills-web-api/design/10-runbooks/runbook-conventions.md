# Runbook Conventions — CAW-04

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./README.md](./README.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc restates the **strict runbook format** (from
[DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS.md)) and adds the **CAW-04-specific builder rules**
every runbook author and executor must obey. It does NOT decide product design (see the ADRs) nor
sequence the work (see [README.md](./README.md) and the roadmap). Where this conflicts with
DOC-CONVENTIONS or the PRODUCT-BRIEF, those win.

## Strict runbook format (DOC-CONVENTIONS §6)

Every runbook lives at `10-runbooks/phase-N-*/RB-XXX-topic.md` (kebab-case) and follows exactly:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [links to ADRs / design docs]
- Produces: <artifacts/components>

## Objective         — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```

Rules carried from DOC-CONVENTIONS:

- **Code is build guidance only** — skeletons, signatures, config. The builder writes the real code.
- **Number by phase band:** `RB-0XX` = phase 0 … `RB-4XX` = phase 4, matching the phase folder.
- **Atomic, verifiable steps:** each step is independently checkable; the `Verify:` is the contract,
  not the `Do:`.
- **Leave the tree green** (compiles, lints, tests pass) at every Acceptance checkpoint so an
  interrupted build resumes cleanly.
- **Cross-link:** link every ADR/design doc the runbook implements; cross-product references are
  import/export boundaries — name the other product (e.g. "CAW-03, a separate product") and never
  imply a shared store/registry/substrate.
- **Use exact entity/term names** from the [PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF.md): the 8 entities
  `Tip, Skill, Workflow, Playbook, Example, Source, SafetyBoundary, Version`; the two ports
  `ContentSourceAdapter`, `PublishSinkAdapter`; the v1 sink `SiteAndApi`.
- **No invented dates/benchmarks/internal facts.** Mark unknowns `TODO(open-question: ...)`.

## CAW-04 builder rules (non-negotiable)

These encode the load-bearing invariants. A runbook that violates one is **wrong**, even if it
"works". Each must show up as an explicit `Verify:` step and an Acceptance-criteria line.

1. **Public-safe re-check is a CORE stage — never in an adapter.**
   The public-safe re-check runs inside the hexagonal core, on every import, before any git write.
   An upstream `ContentSourceAdapter`'s boundary claim is **evidence only** — never trusted as the
   decision. Adapters may not contain gate or re-check logic; they must not be able to bypass it.
   *Verify:* a confidential-tagged fixture marked "public" upstream is still **denied**.

2. **Audit fields are NEVER serialized to web or API.**
   `origin_ref` and `origin_version` (and any audit-only field) live in the **sidecar**, never in the
   publishable frontmatter and never in HTML/JSON/raw-markdown output. This is **test-enforced**:
   ship an automated test that fails if any audit field appears in any public artifact.

3. **Deny-by-default publish gate.**
   Nothing is published without (a) a validated internal `Source` AND (b) a public-safe
   `SafetyBoundary`. Missing either ⇒ deny. Redaction applies before publish. **Curator approval
   (Jimmy) is mandatory**; generated/unverified content is never published. Default = refuse.

4. **Immutable, addressable versions.**
   A published `(slug, semver)` pair is **frozen forever**. Re-publishing an existing pair must
   **fail the build**. Edits create a **new** `Version`; old versions stay addressable.
   Unpublish/redact is via **HTTP 410 tombstone + bounded CDN purge**, never by mutating or deleting
   a frozen artifact in place.

5. **Public-safe by construction.**
   The frozen static artifact (SSG output: HTML + prebuilt JSON + raw markdown + `index.json`
   manifest) has **NO live code path** to internal stores. The build reads frozen git content only;
   the served surfaces query nothing internal at request time.

6. **Stubs are `NotImplemented`, never silent.**
   Future `ContentSourceAdapter`/`PublishSinkAdapter` seams (internal wiki, curated bundle; external
   docs host, package registry, syndication) are **documented and throw `NotImplemented`** when
   invoked. They are registered in the config-driven registry as stubs — never a no-op that silently
   succeeds or returns empty.

7. **Web/API parity from one build.**
   One Astro build emits all surfaces; there is **one canonical resource per artifact** across HTML,
   raw markdown, and JSON. Do not fork per-surface content pipelines.

8. **Leave the tree green.**
   Restated because it is load-bearing for resumability: every Acceptance checkpoint compiles, lints,
   and passes tests. Never commit a runbook checkpoint that breaks the build.

## Authoring checklist (before marking a runbook `ready`)

- [ ] Header complete; `Depends on:` matches the [dependency-graph](../09-roadmap/dependency-graph.md).
- [ ] Every step has both `Do:` and `Verify:`.
- [ ] The applicable builder rules (1–8) each appear as a `Verify:` step and an Acceptance line.
- [ ] `Rollback / safety` undoes a mid-way failure without leaving a partial publish.
- [ ] `Hand-off` states exactly what the next runbook may assume.
- [ ] Tree is green at the final Acceptance checkpoint.
```

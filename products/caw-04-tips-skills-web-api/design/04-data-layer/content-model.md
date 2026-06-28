# Content Model — On-Disk Schemas, Reuse Contract, Public-Projection Split

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./storage-and-versioning.md](./storage-and-versioning.md) — where these records live + how versions freeze
  - [./public-safe-and-provenance.md](./public-safe-and-provenance.md) — boundary model + the audit sidecar
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (ratifies the entity set)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../02-research/content-model-and-metadata.md](../02-research/content-model-and-metadata.md) (research backing)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This is the **data-layer schema of record** for CAW-04: the concrete frontmatter shape of the 8 entities as they
sit on disk, the reusable/auditable Skill metadata standard, and the **public-projection split** — the rule that
audit-only fields live in a sidecar and **never serialize** to web/API. It elaborates [ADR-0002](../01-decisions/ADR-0002-content-model.md)
into the exact YAML a builder writes and validates. It does **NOT** decide the on-disk layout or version freezing
(see [storage-and-versioning](./storage-and-versioning.md)), the gate algorithm (see [public-safe-and-provenance](./public-safe-and-provenance.md)
and [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)), or the wire/resource scheme
([ADR-0007](../01-decisions/ADR-0007-api-design.md)).

## The two-record principle (load-bearing)

Every publishable artifact is stored as **two records that share an `id@semver`**:

| Record | Lives | Contains | Serializes to web/API? |
|---|---|---|---|
| **Public projection** | the `.md(x)` frontmatter + body | everything a reader/agent may see | **yes** — this *is* the published artifact |
| **Audit sidecar** | a sibling file (see [storage](./storage-and-versioning.md)) | `origin_ref`, `origin_version`, redaction internals, reviewer notes | **never** (test-enforced) |

This split is what makes the public surface **public-safe by construction**: the audit fields physically do not
travel with the rendered file. A serializer cannot leak `origin_ref` because it is not in the object it serializes.
The rule is enforced by a test asserting audit-only keys never appear in any built page, JSON, or markdown output
(see [public-safe-and-provenance](./public-safe-and-provenance.md#serialization-firewall)).

## Entity map

```
Source ──(derives)──▶ Tip ───────┐
   │                  Skill ──────┤
   │                  Workflow ───┼──▶ each publishable record pins exactly
   │                  Playbook ───┘    1 Source + 1 SafetyBoundary + 1 Version
   └─ Example attaches to a parent (id@version) and carries its OWN SafetyBoundary
```

- **Tip** — smallest unit: one validated, public-safe insight.
- **Skill** — a reusable, parameterized capability (the reuse contract; see standard below).
- **Workflow** — an ordered composition of Skills/steps toward a goal.
- **Playbook** — a scenario-driven bundle (Workflows + Skills + Tips + decision guidance).
- **Example** — a worked instance attached to a parent; **gated independently** (examples leak most).
- **Source** — the validated upstream origin (provenance anchor; audit fields go to the sidecar).
- **SafetyBoundary** — the classification + re-check record that gates publication.
- **Version** — the immutable, addressable snapshot.

`Source`, `SafetyBoundary`, and `Version` are **not standalone published pages**; they are embedded/pinned into the
four publishable kinds and (for audit fields) the sidecar.

## Common fields (every publishable entity)

| Field | Type | Req | Projection | Notes |
|---|---|---|---|---|
| `id` | slug (kebab) | yes | public | Stable public identifier; unique within `kind`. |
| `kind` | enum | yes | public | `tip\|skill\|workflow\|playbook`. |
| `title` | string | yes | public | Human-readable; `name` in API. |
| `summary` | string | yes | public | 1–3 sentence public-safe abstract; agent triage field. |
| `tags` | string[] | no | public | Faceted browse + API filter. |
| `version` | semver | yes | public | The immutable snapshot label (see [storage](./storage-and-versioning.md)). |
| `status` | enum | yes | public | `draft\|in-review\|published\|unpublished\|redacted`. |
| `license` | SPDX id | yes | public | e.g. `CC-BY-4.0`; reuse permission. |
| `source` | embedded Source (public subset) | yes | mixed | Public subset inline; `origin_ref`/`origin_version` to sidecar. |
| `boundary` | embedded SafetyBoundary | yes | public | Must be `public-safe` + `recheck_status=pass`. |
| `content_hash` | `sha256:` digest | yes | public | Immutability proof; frozen at publish. |
| `created_at` / `updated_at` | ISO-8601 | yes | public | Curation timestamps (set at build; never invented). |

## Per-entity frontmatter schemas

### Skill (the reuse contract)

```yaml
---
id: summarize-pr-diff           # = SKILL.md `name`
kind: skill
title: Summarize a PR diff for review
summary: Reviewer-focused summary of a pull-request diff.
description: |                   # = SKILL.md `description` (triggering text: what + when)
  Produce a reviewer-focused summary of a unified diff; use before code review.
version: 1.2.0
license: CC-BY-4.0
tags: [code-review, summarization]
inputs:  [{ name: diff, type: string, required: true, description: unified diff text, schema_ref: null }]
outputs: [{ name: summary, type: string, required: true, description: reviewer summary }]
preconditions:  [{ id: has-diff, description: a non-empty unified diff is provided }]
postconditions: [{ id: covers-all-files, description: every changed file is mentioned }]
steps:
  - { order: 1, instruction: "Parse hunks and group by file", tool: null }
  - { order: 2, instruction: "Summarize intent per file, then overall" }
tools_required: []              # ToolRef[] — schema.org HowToTool
failure_modes: ["binary diff → no text to summarize"]
idempotent: true
est_cost: { tokens: TODO(open-question), time: null, money: null }
source:   { origin_product: caw-03, validated: true, derivation: summarized }  # audit refs → sidecar
boundary: { classification: public-safe, recheck_status: pass, rechecked_at: TODO }
content_hash: "sha256:…"        # set at publish, immutable
---
```

`inputs`/`outputs` use the shared `Param` shape and are JSON-Schema-backed (`schema_ref`) so an agent validates I/O
without reading prose. `description` mirrors the Claude Agent `SKILL.md` convention so the artifact drops into skill
loaders unchanged (unknown governance fields are ignored by them).

### Workflow

| Field | Type | Req | Notes |
|---|---|---|---|
| (common) | — | yes | |
| `goal` | string | yes | Outcome achieved (schema.org `yield`). |
| `steps` | Step[] | yes | A step may `uses` a Skill by `id@version`. |
| `inputs` / `outputs` | Param[] | yes | Aggregate contract. |
| `preconditions` | Condition[] | yes | |
| `branches` | Branch[] | no | Conditional paths (`when` → step set). |
| `skills_used` | ref[] | yes | Pinned `id@version` of every composed Skill — the **audit graph**. |

### Playbook

| Field | Type | Req | Notes |
|---|---|---|---|
| (common) | — | yes | |
| `scenario` | markdown | yes | The situation addressed. |
| `decision_guide` | markdown | no | When to pick which contained workflow. |
| `contains` | ref[] | yes | `id@version` of Workflows/Skills/Tips bundled. |
| `outcomes` | string[] | no | Expected results / success signals. |

### Tip

| Field | Type | Req | Notes |
|---|---|---|---|
| (common) | — | yes | |
| `body` | markdown | yes | The insight, public-safe. |
| `rationale` | markdown | no | Why it holds; kept separate from `body`. |
| `applies_to` | string[] | no | Contexts/tools it is valid for. |
| `confidence` | enum | no | `low\|medium\|high`, as asserted by the validated Source. |

### Example (independently gated)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `parent` | ref | yes | The Skill/Workflow/Playbook it illustrates (`id@version`). |
| `input_sample` / `output_sample` | object | no | Must match parent contract; public-safe (redacted if needed). |
| `narrative` | markdown | no | Walkthrough. |
| `boundary` | embedded SafetyBoundary | yes | **Own** boundary — examples carry the highest leak risk. |

### Embedded Source / SafetyBoundary / Version (public subset)

```yaml
# Source — only the public subset is inline; origin_ref/origin_version → sidecar
source:   { origin_product: caw-02|caw-03|skills-registry, validated: true,
            derivation: verbatim|redacted|summarized }
# SafetyBoundary — public subset (full reviewer/redaction internals → sidecar)
boundary: { classification: public-safe, recheck_status: pass|fail|pending, rechecked_at: ISO-8601 }
# Version — see storage doc for freeze semantics
version_meta: { version: "1.2.0", content_hash: "sha256:…", published_at: ISO-8601, supersedes?: "1.1.0" }
```

## Shared value objects

```yaml
Param:     { name, type, required, description, schema_ref?, example? }   # JSON-Schema-backed
Condition: { id, description, check? }                                    # check = optional machine assertion
Step:      { order, instruction, uses?(id@version), tool?, supply?, expected? }
ToolRef:   { name, url?, version?, optional }                             # schema.org HowToTool
Redaction: { field, action(remove|mask|summarize), reason }              # internals → sidecar
Branch:    { when, then_steps[] }
```

## The reusable/auditable Skill metadata standard

A Skill/Workflow is **publishable as reusable** only when all blocking pillars hold. This is the single
`isPublishable(record)` predicate the gate ([ADR-0003 G5](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)) consumes.

| Pillar | Required fields | Blocking | Why it matters |
|---|---|---|---|
| **Identity** | `id`, `title`, `description`, `version` | yes | Discovery + deterministic `id@version` pinning. |
| **Contract** | `inputs`, `outputs` (typed) | yes | Agent calls without reading prose; validates I/O. |
| **Pre/Post** | `preconditions` (+ `postconditions`) | yes | Applicability check before, verification after. |
| **Procedure** | `steps` (+ `tools_required`) | yes | Executable sequence; tools named, not implied. |
| **Provenance** | `source` (validated, pinned upstream version) | yes | Traces to a validated internal origin. |
| **Safety** | `boundary = public-safe` + `recheck_status = pass` | yes | Nothing internal/confidential reaches public. |
| **Provability** | `content_hash`, `published_at`, `license` | yes | Immutable, addressable, legally reusable. |
| **Reliability** | `failure_modes`, `idempotent`, `est_cost` | no | Retry/cost decisions; recommended, not blocking. |

**Rule:** `published` requires *Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧ Provenance ∧ Safety ∧ Provability*.
Missing any blocking pillar → status stays `in-review`, never `published`. This is intended default-deny friction.

## Open Questions

Promote to `../08-research-plan/open-questions.md`:

- TODO(open-question: JSON Schema vs MCP tool schemas as the `inputs/outputs` contract language for agent interop.)
- TODO(open-question: is a 3-level `classification` enough, or are per-field sensitivity labels needed?)
- TODO(open-question: does `content_hash` cover the sidecar, or only the public projection? — affects what "immutable" means legally; coordinate with [storage](./storage-and-versioning.md).)
- TODO(open-question: license policy — single default SPDX vs per-artifact, and inheritance from upstream Source.)

## Implications for runbooks

- Define all 8 entities + 6 value objects as **schema-as-code** (Zod/JSON Schema) with `isPublishable(record)` as a
  single predicate; ship golden fixtures (one fully-populated Skill, one Workflow pinning a Skill by `id@version`).
- Implement the **public projection** that strips audit-only fields before any output, plus the test asserting they
  never serialize (see [public-safe-and-provenance](./public-safe-and-provenance.md#serialization-firewall)).
- Validation runs at import (post re-check) and at build; an invalid or boundary-failing record cannot reach the sink.

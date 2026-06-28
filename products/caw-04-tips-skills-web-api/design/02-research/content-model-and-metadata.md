# Content Model & Metadata

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc defines the **content model** for CAW-04: the entities `Tip, Skill, Workflow, Playbook, Example,
Source, SafetyBoundary, Version` and their fields, plus the **reusable-skill metadata standard** that makes a
published Skill/Workflow both **reusable** (an agent can fetch and execute it) and **auditable** (every claim
traces to a validated internal source and a public-safe boundary). It feeds the storage ADR, the publish-gate
design, and the API schema doc. It does **NOT** decide storage layout (md/MDX vs DB), the public-safe gate
algorithm, the wire/serialization format, or the import adapter mechanics — those are separate ADRs/docs. It
does not author content; it defines the shape content must take to be publishable.

## Design principles (constraints from the brief)

1. **Publish-safe by construction.** Every published record carries a `boundary` that is `public-safe` and a
   `provenance` link to a validated upstream source. A record missing either is not publishable (brief §5, §11).
2. **Immutable, addressable Versions.** Published content is versioned; a published `Version` is immutable and
   addressable forever (brief §5). Edits create new Versions; old ones stay readable.
3. **Reuse needs a contract, not prose.** A Skill/Workflow is reusable only if its `inputs`, `outputs`,
   `preconditions`, and `safety boundary` are machine-readable, not buried in markdown (brief §5).
4. **Separation of layers.** Sources/claims/evidence and generated summaries are distinct fields, never merged
   (brief §11). The model never co-mingles internal-source identifiers into public-rendered fields.
5. **Ground on real standards.** Frontmatter follows the [Claude Agent Skill `SKILL.md`](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
   pattern (`name`/`description` required); step semantics borrow from
   [schema.org/HowTo](https://schema.org/HowTo) (`tool`/`supply`/`step`/`yield`); provenance borrows from
   [W3C PROV](https://www.w3.org/TR/prov-overview/) `wasDerivedFrom`; licenses use SPDX identifiers.

## Entity map

```
Source ──(derives)──▶ Tip ───────┐
   │                  Skill ──────┤
   │                  Workflow ───┼──▶ has 1 SafetyBoundary, 1+ Example, 1+ Version
   │                  Playbook ───┘
   └─ every publishable entity references exactly one validated Source + one SafetyBoundary per Version
```

- **Tip** — smallest unit: one validated, public-safe insight ("do X because Y").
- **Skill** — a reusable, parameterized capability (the heart of the reuse contract).
- **Workflow** — an ordered composition of Skills/steps toward an outcome.
- **Playbook** — a higher-order, scenario-driven bundle (Workflows + Tips + decision guidance).
- **Example** — a concrete worked instance attached to a Skill/Workflow/Playbook.
- **Source** — the validated upstream origin (CAW-02 knowledge / CAW-03 skills registry) — provenance anchor.
- **SafetyBoundary** — the classification + redaction record that gates publication.
- **Version** — an immutable, addressable snapshot of any publishable entity.

## Common fields (every publishable entity)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug (kebab) | yes | Stable public identifier; unique within entity type. |
| `kind` | enum | yes | `tip\|skill\|workflow\|playbook`. |
| `title` | string | yes | Human-readable; rendered on web + `name` in API. |
| `summary` | string | yes | 1–3 sentence public-safe abstract; the API/agent triage field. |
| `tags` | string[] | no | Faceted browse + API filter. |
| `source` | ref(Source) | yes | Provenance anchor; publish gate fails if absent or unvalidated. |
| `boundary` | ref(SafetyBoundary) | yes | Must resolve to `public-safe` to publish. |
| `version` | ref(Version) | yes | The immutable snapshot this record represents. |
| `status` | enum | yes | `draft\|in-review\|published\|unpublished\|redacted`. |
| `license` | SPDX id | yes | e.g. `CC-BY-4.0`; what readers/agents may do with it. |
| `created_at` / `updated_at` | ISO-8601 | yes | Curation timestamps (not invented; set at build). |

## Per-entity fields

### Tip

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | See above. |
| `body` | markdown | yes | The insight, public-safe. |
| `rationale` | markdown | no | Why it holds; keep separate from `body`. |
| `applies_to` | string[] | no | Contexts/tools the tip is valid for. |
| `confidence` | enum | no | `low\|medium\|high` as asserted by validated Source. |

### Skill (reuse contract — see standard below)

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | `name` (=`id`) + `description` (=`summary`) mirror SKILL.md. |
| `description` | string | yes | Triggering text: what it does + when to use it. |
| `inputs` | Param[] | yes | Typed input contract (JSON-Schema-backed). |
| `outputs` | Param[] | yes | Typed output contract. |
| `preconditions` | Condition[] | yes | What must be true before running. |
| `postconditions` | Condition[] | no | What is guaranteed after. |
| `steps` | Step[] | yes | Ordered actions (`instruction`, `tool`, `supply`). |
| `tools_required` | ToolRef[] | no | Named external tools/APIs (schema.org `tool`). |
| `failure_modes` | string[] | no | Known ways it breaks + mitigations. |
| `idempotent` | bool | no | Safe to re-run? Drives agent retry behavior. |
| `est_cost` | object | no | `{tokens?, time?, money?}` — best-effort, mark estimates. |

### Workflow

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | |
| `goal` | string | yes | The outcome the workflow achieves (schema.org `yield`). |
| `steps` | Step[] | yes | Ordered; a step may `uses` a Skill by `id@version`. |
| `inputs` / `outputs` | Param[] | yes | Aggregate contract for the whole workflow. |
| `preconditions` | Condition[] | yes | |
| `branches` | Branch[] | no | Conditional paths (`when` → step set). |
| `skills_used` | ref(Skill)[] | yes | Pinned `id@version` of every composed Skill (audit graph). |

### Playbook

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | |
| `scenario` | markdown | yes | The situation this playbook addresses. |
| `decision_guide` | markdown | no | When to pick which contained workflow. |
| `contains` | ref[] | yes | `id@version` of Workflows/Skills/Tips bundled. |
| `outcomes` | string[] | no | Expected results / success signals. |

### Example

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `parent` | ref | yes | The Skill/Workflow/Playbook it illustrates (`id@version`). |
| `input_sample` | object | no | Concrete inputs matching the parent contract. |
| `output_sample` | object | no | Resulting output (public-safe; redacted if needed). |
| `narrative` | markdown | no | Walkthrough. |
| `boundary` | ref(SafetyBoundary) | yes | Examples leak most; gated independently. |

### Source (provenance anchor)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `origin_product` | enum | yes | `caw-02\|caw-03\|skills-registry`. |
| `origin_ref` | string | yes | Opaque internal identifier in the origin product. |
| `origin_version` | string | yes | Pin to the exact validated upstream version. |
| `validated` | bool | yes | Must be `true` to publish (re-checked at import). |
| `validated_by` | string | yes | Who/what validated upstream (process, not secret). |
| `imported_at` | ISO-8601 | yes | When CAW-04 imported it. |
| `derivation` | enum | yes | `verbatim\|redacted\|summarized` (PROV `wasDerivedFrom`). |
| `internal_only` | bool | yes | Marks fields that must NEVER render publicly. |

> `origin_ref`/`origin_version` are **never** rendered on the public surface — they are audit-only fields,
> stored beside the record but excluded from web/API output (separation of layers, brief §11).

### SafetyBoundary (publish gate record)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `classification` | enum | yes | `public-safe\|internal-only\|confidential`. Only `public-safe` publishes. |
| `recheck_status` | enum | yes | `pass\|fail\|pending` from CAW-04's own re-check (never trust upstream). |
| `rechecked_at` | ISO-8601 | yes | When CAW-04 re-verified the boundary. |
| `redactions` | Redaction[] | no | What was removed/transformed to reach public-safe. |
| `reviewer` | string | yes | Curator who approved (brief §11: Jimmy approves every publish). |
| `rationale` | markdown | no | Why this classification holds. |
| `expires_at` | ISO-8601 | no | Optional re-review trigger; on expiry → `pending`. |

### Version (immutable snapshot)

| Field | Type | Req | Notes |
|---|---|---|---|
| `version` | semver-ish | yes | Public version label, e.g. `1.2.0`. |
| `content_hash` | hash | yes | Content-addressed digest of the full record (immutability proof). |
| `supersedes` | ref(Version) | no | Prior version this replaces; old one stays addressable. |
| `published_at` | ISO-8601 | yes | Set at publish; immutable thereafter. |
| `change_note` | string | no | What changed vs `supersedes`. |
| `source_at_publish` | ref(Source) | yes | The Source pinned at publish (audit determinism). |
| `boundary_at_publish` | ref(SafetyBoundary) | yes | The boundary record in force at publish. |

## Shared value objects

```yaml
Param:        { name, type, required, description, schema_ref?, example? }   # type backed by JSON Schema
Condition:    { id, description, check? }                                    # check = optional machine assertion
Step:         { order, instruction, uses?(skill id@version), tool?, supply?, expected? }
ToolRef:      { name, url?, version?, optional }                             # schema.org HowToTool
Redaction:    { field, action(remove|mask|summarize), reason }
Branch:       { when, then_steps[] }
```

## The reusable-skill metadata standard

A Skill/Workflow is **publishable as reusable** only if it satisfies all of the following. This is the
contract an external agent relies on when it fetches the artifact via the REST API.

| Pillar | Required fields | Why it matters for reuse/audit |
|---|---|---|
| **Identity** | `id`, `title`, `description`, `version` | Agent discovery + deterministic pinning (`id@version`). |
| **Contract** | `inputs`, `outputs` (typed, JSON-Schema-backed) | Agent can call without reading prose; validate I/O. |
| **Pre/Post** | `preconditions` (+ `postconditions`) | Agent checks applicability before running; verifies after. |
| **Procedure** | `steps` (+ `tools_required`) | Executable sequence; tools named, not implied. |
| **Provenance** | `source` (validated, pinned `origin_version`) | Every artifact traces to a validated internal origin. |
| **Safety** | `boundary` = `public-safe` + `recheck_status=pass` | Nothing internal/confidential reaches the public surface. |
| **Reliability** | `failure_modes`, `idempotent`, `est_cost` | Agent retry/cost decisions; sets reuse expectations. |
| **Provability** | `content_hash`, `published_at`, `license` | Immutable, addressable, legally reusable. |

**Reusable-skill rule:** an artifact is `published` only when *Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧
Provenance ∧ Safety ∧ Provability* are all satisfied. Reliability is recommended but not blocking. Missing any
blocking pillar → status stays `in-review`, never `published`.

### Public frontmatter projection (md/MDX-first)

The on-disk source of truth is markdown with YAML frontmatter; the API index is derived from it. Audit-only
fields (`origin_ref`, `origin_version`, redaction internals) live in a **sidecar** record, never in the
public frontmatter that gets rendered/served.

```yaml
---
id: summarize-pr-diff
kind: skill
title: Summarize a PR diff for review
description: Produce a reviewer-focused summary of a pull request diff; use before code review.
version: 1.2.0
license: CC-BY-4.0
tags: [code-review, summarization]
inputs:  [{ name: diff, type: string, required: true, description: unified diff text }]
outputs: [{ name: summary, type: string, required: true, description: reviewer summary }]
preconditions: [{ id: has-diff, description: a non-empty unified diff is provided }]
steps:
  - { order: 1, instruction: "Parse hunks and group by file", tool: null }
  - { order: 2, instruction: "Summarize intent per file, then overall" }
source: { ref: src-caw02-0042, validated: true, derivation: summarized }   # ref is opaque, audit-only
boundary: { classification: public-safe, recheck_status: pass }
content_hash: "sha256:…"     # set at publish, immutable
---
```

## Tradeoffs / decisions deferred to ADRs

| Question | Options | Lean (this doc) | Decide in |
|---|---|---|---|
| Typed contract backing | ad-hoc YAML vs JSON Schema `$ref` vs OpenAPI components | JSON Schema (`schema_ref`) | content-model ADR |
| Version label scheme | semver vs date vs content-hash-only | semver label + `content_hash` for immutability | versioning ADR |
| Where audit fields live | inline (hidden) vs sidecar file vs DB row | sidecar record, excluded from served output | storage ADR |
| Skill ↔ schema.org HowTo | adopt vocabulary vs custom | borrow `tool/supply/step/yield` semantics, own field names | content-model ADR |
| Examples boundary | inherit parent vs independent gate | independent `SafetyBoundary` (examples leak most) | publish-gate doc |

## Open Questions

- TODO(open-question: do CAW-02/CAW-03 expose a stable, versioned `origin_ref` we can pin, or only mutable
  handles? Pinning `origin_version` is required for deterministic audit.)
- TODO(open-question: is JSON Schema the agreed contract language for `inputs/outputs` across the family, or do
  we align to MCP tool schemas for agent interop?)
- TODO(open-question: minimum viable `SafetyBoundary.classification` enum — is a 3-level scale enough, or do we
  need per-field sensitivity labels?)
- TODO(open-question: should `Version.content_hash` cover the sidecar/audit fields too, or only the public
  projection? Affects what "immutable" legally means.)
- TODO(open-question: license policy — single default SPDX license vs per-artifact, and how it inherits from
  the upstream Source.)

## Implications for runbooks

- A runbook must define the **content schema as code** (e.g. Zod/JSON Schema) for all 8 entities + the 6 value
  objects, with the blocking-pillar validation as a single `isPublishable(record)` gate.
- A runbook must implement the **public projection** that strips audit-only fields (`origin_ref`,
  `origin_version`, redaction internals) before any web/API output — with a test asserting these never serialize.
- A runbook must compute and freeze `content_hash` + `published_at` at publish time and forbid mutation of a
  `published` Version (append-only; new Version on edit).
- A runbook must implement the **import re-check** that re-derives `SafetyBoundary.recheck_status` inside CAW-04
  and refuses publish on `fail`/`pending`, independent of any upstream boundary flag.
- Fixtures/golden files should include one fully-populated reusable Skill and one Workflow that pins a Skill by
  `id@version`, to lock the reuse contract.

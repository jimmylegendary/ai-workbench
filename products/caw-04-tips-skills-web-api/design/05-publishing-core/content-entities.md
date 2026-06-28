# Content Entities — the 8-entity model in depth

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./versioning-and-immutability.md](./versioning-and-immutability.md)
  - [./rendering-web-and-api.md](./rendering-web-and-api.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (the decision this elaborates)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (the gate that consumes `isPublishable`)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (on-disk layout + sidecar)
  - [../02-research/content-model-and-metadata.md](../02-research/content-model-and-metadata.md) (field-by-field research)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc is the **implementation-facing reference** for CAW-04's eight content entities — `Tip`, `Skill`,
`Workflow`, `Playbook`, `Example`, `Source`, `SafetyBoundary`, `Version` — their relationships, the **public /
audit projection split**, and the **reusable-skill metadata contract** an external agent relies on. It turns
[ADR-0002](../01-decisions/ADR-0002-content-model.md) into a builder-ready entity map. It does NOT restate every
field table (see [content-model research](../02-research/content-model-and-metadata.md)), nor decide versioning
mechanics (see [versioning-and-immutability](./versioning-and-immutability.md)) or rendering (see
[rendering-web-and-api](./rendering-web-and-api.md)). The load-bearing property elaborated here: **a record is
public-safe by construction — it is structurally unpublishable until provenance and a passing public-safe boundary
both exist, and audit-only fields cannot serialize to web/API.**

## 1. Entity taxonomy

Eight entities in three roles. Only four are **publishable** (they own a URL); the rest are **support records**
attached to a publishable artifact.

| Role | Entities | URL of its own? | Carries `boundary`? |
|---|---|---|---|
| **Publishable artifacts** | Tip, Skill, Workflow, Playbook | yes (`/{type}/{slug}`) | yes (own SafetyBoundary) |
| **Attached content** | Example | sub-resource only (`/{type}/{slug}/examples`) | yes (gated independently) |
| **Governance / audit** | Source, SafetyBoundary, Version | never (embedded or sidecar) | n/a |

The four publishable artifacts form a **composition ladder** — each higher tier references lower tiers by pinned
`id@version`, never by copy:

```
Tip        ── atomic insight ("do X because Y")
Skill      ── reusable parameterized capability (the reuse contract)
Workflow   ── ordered composition of Skills (steps may `uses: skill@semver`)
Playbook   ── scenario bundle of Workflows + Skills + Tips (`contains: [id@version]`)
```

## 2. Relationship map

```
                 ┌───────────── Source (provenance anchor, 1 per Version) ──────────────┐
                 │                                                                        │ audit-only
   SafetyBoundary┤  (1 gate record per Version; only classification=public-safe publishes)│  origin_ref
                 │                                                                        │  origin_version
                 ▼                                                                        ▼  (SIDECAR)
   ┌───────► Tip ─────────┐
   │         Skill ───────┤── each: 1 Source + 1 SafetyBoundary + 1+ Version + 0..n Example
   │         Workflow ────┤
   │         Playbook ────┘
   │            │
   │            ├─ Workflow.skills_used[]  → pins Skill   by id@version  (audit graph)
   │            ├─ Workflow.steps[].uses   → pins Skill   by id@version
   │            └─ Playbook.contains[]     → pins Workflow/Skill/Tip by id@version
   │
   └─ Example.parent → pins one artifact by id@version (Example has its OWN boundary)
```

Three relationship rules make the graph auditable and immutable-safe:

1. **Composition is by pinned reference, never embedding.** A Workflow does not copy a Skill's body; it pins
   `skill@2.1.0`. The set of pins is the **audit graph** — every transitively-used artifact is enumerable and
   traces to its own validated Source ([ADR-0002](../01-decisions/ADR-0002-content-model.md)).
2. **Pins are version-exact.** Because `(slug, semver)` is frozen forever
   ([versioning-and-immutability](./versioning-and-immutability.md)), a pin resolves to byte-identical content for
   the life of the referrer. TODO(open-question: do workflow step refs allow a range / `latest`, or only exact
   `id@version`? — carried from [ADR-0007](../01-decisions/ADR-0007-api-design.md)).
3. **Every publishable record references exactly one `Source` and one `SafetyBoundary` per `Version`.** These are
   captured *at publish* as `source_at_publish` / `boundary_at_publish` so the audit is deterministic even if the
   live records later change.

## 3. The public / audit projection split (load-bearing)

Every entity field belongs to exactly one of two projections. This split is the structural guarantee behind the
brief's most critical guardrail (§11): **public outputs from public-safe sources only.**

| Projection | Where it lives | Serialized to web/API? | Example fields |
|---|---|---|---|
| **Public projection** | rendered YAML frontmatter + markdown body | **yes** | `id`, `title`, `summary`, `inputs`, `outputs`, `boundary.classification`, `version`, `digest`, `license` |
| **Audit sidecar** | sidecar record beside the file (`*.audit.json` per [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)) | **NEVER** | `Source.origin_ref`, `Source.origin_version`, `Redaction` internals, `internal_only` markers |

```
src/content/skills/triage-incident/
  2.1.0.mdx          # public projection — what renders + serializes
  2.1.0.audit.json   # audit sidecar — origin_ref, origin_version, redaction internals (NEVER served)
```

Enforcement is **code + test, not convention**:

- A single `toPublicProjection(record)` function strips audit-only fields before any web/API emit.
- A build-time invariant asserts `boundary.classification === "public-safe"` and `recheck_status === "pass"` for
  every emitted record and fails the build otherwise.
- A regression test asserts the audit field names (`origin_ref`, `origin_version`, …) never appear in any emitted
  HTML/JSON/markdown byte stream. This is the test [ADR-0002](../01-decisions/ADR-0002-content-model.md) mandates.

`boundary` (sensitivity classification) and **visibility** are deliberately distinct fields — they never collapse
into one. A record can be `internal-only` and simply absent from the build; it is never "published but hidden".

## 4. Entity quick-reference

Full field tables live in the [content-model research](../02-research/content-model-and-metadata.md); this is the
at-a-glance contract. **Req** = required for that entity to reach `published`.

| Entity | Defining fields (beyond common) | Req-critical additions |
|---|---|---|
| **Tip** | `body`, `rationale?`, `applies_to?`, `confidence?` | `body` |
| **Skill** | `description`, `inputs[]`, `outputs[]`, `preconditions[]`, `steps[]`, `postconditions?`, `tools_required?`, `failure_modes?`, `idempotent?`, `est_cost?` | `description`, `inputs`, `outputs`, `preconditions`, `steps` |
| **Workflow** | `goal`, `steps[]` (`uses: skill@semver`), `inputs/outputs`, `preconditions[]`, `branches?`, `skills_used[]` | `goal`, `steps`, `skills_used` (pinned) |
| **Playbook** | `scenario`, `decision_guide?`, `contains[]` (`id@version`), `outcomes?` | `scenario`, `contains` (pinned) |
| **Example** | `parent` (`id@version`), `input_sample?`, `output_sample?`, `narrative?`, **own `boundary`** | `parent`, own `boundary` |
| **Source** | `origin_product`, `origin_ref`*, `origin_version`*, `validated`, `validated_by`, `imported_at`, `derivation`, `internal_only` | `validated == true` |
| **SafetyBoundary** | `classification`, `recheck_status`, `rechecked_at`, `redactions?`, `reviewer`, `rationale?`, `expires_at?` | `classification == public-safe`, `recheck_status == pass` |
| **Version** | `version` (semver), `content_hash`, `supersedes?`, `published_at`, `change_note?`, `source_at_publish`, `boundary_at_publish` | `version`, `content_hash`, `published_at` |

\* `origin_ref` / `origin_version` are **audit-only** (sidecar; never serialized) — §3.

**Common fields** (every publishable entity): `id`, `kind`, `title`, `summary`, `tags?`, `source`, `boundary`,
`version`, `status`, `license`, `created_at`, `updated_at`. See research for types.

## 5. Shared value objects

```yaml
Param:      { name, type, required, description, schema_ref?, example? }   # type backed by JSON Schema
Condition:  { id, description, check? }                                    # check = optional machine assertion
Step:       { order, instruction, uses?(skill id@version), tool?, supply?, expected? }
ToolRef:    { name, url?, version?, optional }                             # schema.org HowToTool semantics
Redaction:  { field, action(remove|mask|summarize), reason }              # internals live in the audit sidecar
Branch:     { when, then_steps[] }
```

`inputs`/`outputs` are `Param[]` whose `type` is JSON-Schema-backed (`schema_ref`) so an agent validates I/O
without reading prose. TODO(open-question: JSON Schema vs MCP tool-schema as the family contract language — from
[ADR-0002](../01-decisions/ADR-0002-content-model.md)).

## 6. The reusable-skill metadata contract

A `Skill`/`Workflow` becomes `published` only when **all blocking pillars** hold. This is the predicate
[ADR-0002](../01-decisions/ADR-0002-content-model.md) names `isPublishable(record)`, and the gate check G5 in
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) maps directly onto it.

| Pillar | Blocking? | Required fields | What it buys the consumer |
|---|---|---|---|
| **Identity** | yes | `id`, `title`, `description`, `version` | discovery + deterministic `id@version` pinning |
| **Contract** | yes | `inputs`, `outputs` (typed) | call without reading prose; validate I/O |
| **Pre/Post** | yes | `preconditions` (+ `postconditions?`) | check applicability before, verify after |
| **Procedure** | yes | `steps` (+ `tools_required?`) | executable sequence; tools named, not implied |
| **Provenance** | yes | `source` (validated, pinned `origin_version`) | every artifact traces to a validated internal origin |
| **Safety** | yes | `boundary = public-safe` ∧ `recheck_status = pass` | nothing internal/confidential reaches the surface |
| **Provability** | yes | `content_hash`, `published_at`, `license` | immutable, addressable, legally reusable |
| **Reliability** | no (recommended) | `failure_modes`, `idempotent`, `est_cost` | agent retry/cost decisions |

```text
isPublishable(record) :=
      Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧ Provenance ∧ Safety ∧ Provability
# Missing ANY blocking pillar → status stays `in-review`, never `published` (default-deny).
# Reliability missing → still publishable, flagged as best-effort.
```

`status` lifecycle: `draft → in-review → published → (deprecated) → unpublished | redacted`. Only the gate moves a
record into `published`; only a Jimmy-approved removal op moves it out
([versioning-and-immutability](./versioning-and-immutability.md) §removal).

## 7. Public frontmatter example (Skill)

The on-disk source of truth; the API index is derived from it. Audit-only fields are absent here (they live in the
sidecar).

```yaml
---
id: triage-incident
kind: skill
title: Triage an incoming incident
description: Classify and route a new incident before on-call escalates; use at first alert.
version: 2.1.0
license: CC-BY-4.0
tags: [ops, incident-response]
inputs:  [{ name: alert, type: string, required: true, description: raw alert payload }]
outputs: [{ name: triage_report, type: markdown, required: true }]
preconditions: [{ id: has-alert, description: a non-empty alert payload is provided }]
steps:
  - { order: 1, instruction: "Classify severity from the alert signature" }
  - { order: 2, instruction: "Route to the owning team and draft the triage report" }
source:   { ref: src-caw03-0117, validated: true, derivation: summarized }  # ref opaque; details in sidecar
boundary: { classification: public-safe, recheck_status: pass }
content_hash: "sha256:…"   # set at publish, immutable
---
```

## 8. Open Questions

Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):

- TODO(open-question: do CAW-02 / CAW-03 expose a stable, versioned `origin_ref` to pin, or only mutable handles?)
- TODO(open-question: JSON Schema vs MCP tool-schema as the `inputs/outputs` contract language.)
- TODO(open-question: is a 3-level `classification` enough, or are per-field sensitivity labels needed?)
- TODO(open-question: license policy — single default SPDX vs per-artifact, and inheritance from upstream Source.)
- TODO(open-question: workflow step pins — exact `id@version` only vs range/`latest`.)

## 9. Implications for runbooks

- Define all 8 entities + 6 value objects as **schema-as-code** (Zod/JSON Schema) with `isPublishable(record)` as a
  single blocking-pillar gate.
- Implement `toPublicProjection(record)` that strips audit-only fields, plus the regression test asserting those
  field names never serialize to HTML/JSON/markdown.
- Ship golden fixtures: one fully-populated reusable Skill and one Workflow pinning a Skill by `id@version`, to lock
  the reuse contract and the audit graph.
- Persist the audit sidecar beside each version file; assert the sidecar is excluded from the build output set.

# ADR-0002: Content model (Tip/Skill/Workflow/Playbook/Example/Source/SafetyBoundary/Version) + reusable/auditable metadata

- **Status:** proposed
- **Owner:** Jimmy
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
- **Related:**
  - [ADR-0001-product-surface-and-delivery.md](./ADR-0001-product-surface-and-delivery.md)
  - [ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate.md)
  - ADR-0004 (import, ports & adapters — group B), ADR-0005 (storage & versioning — group B), ADR-0006 (web & API stack — group B)
  - [../02-research/content-model-and-metadata.md](../02-research/content-model-and-metadata.md), [../02-research/skills-distribution-and-api-resources.md](../02-research/skills-distribution-and-api-resources.md)

## Context

CAW-04's unit of value is **one published, versioned, public-safe artifact** carrying provenance + a safety
boundary (brief §2, §5). The model must make an artifact both **reusable** (an agent can fetch and execute a Skill
from its metadata alone) and **auditable** (every claim traces to a validated internal Source and a public-safe
SafetyBoundary). The brief fixes the entity set; this ADR ratifies their fields, the reuse contract, and the rule
that decides when a record is publishable. It does NOT decide storage layout (ADR-0005), the gate algorithm
(ADR-0003), the wire/resource scheme (ADR-0006), or import mechanics (ADR-0004).

Forces:
- **Publish-safe by construction** (brief §5, §11): a record missing a validated `source` or a `public-safe`
  `boundary` is structurally unpublishable.
- **Reuse needs a machine-readable contract, not prose** (brief §5): `inputs`/`outputs`/`preconditions`/`steps`
  must be typed fields, not buried in markdown.
- **Separation of layers** (brief §11): sources/claims/evidence and generated summaries stay distinct; internal
  identifiers never co-mingle into public-rendered fields.
- **Immutable, addressable Versions** (brief §5): edits create new Versions; old ones stay readable.
- **Ground on real standards** so artifacts interoperate with agent runtimes.

## Options considered

| Decision | Options | Choice | Why |
|---|---|---|---|
| Entity set | brief's 8 entities vs a flattened "document" model | **brief's 8 entities** (Tip, Skill, Workflow, Playbook, Example, Source, SafetyBoundary, Version) | fixed by brief §5; each carries distinct reuse/audit semantics |
| Reuse-contract backing | ad-hoc YAML vs **JSON-Schema-backed typed fields** vs OpenAPI components | **JSON-Schema-backed** `inputs/outputs` (`schema_ref`) | agents validate I/O without reading prose; aligns with MCP tool schemas |
| Frontmatter base | invent CAW-04 format vs **align to Claude Agent `SKILL.md`** | **align** (`name`=`id`, `description`=`summary`) + additive governance fields | drops into skill loaders; unknown fields ignored by them |
| Step/procedure vocab | custom vs **borrow schema.org/HowTo** semantics | borrow `tool/supply/step/yield` semantics, own field names | proven vocabulary, no lock-in |
| Provenance vocab | custom vs **W3C PROV `wasDerivedFrom`** | borrow PROV `derivation` enum (`verbatim\|redacted\|summarized`) | standard, audit-grade |
| Where audit-only fields live | inline-hidden vs **sidecar** vs DB row | **sidecar**, excluded from served output | guarantees internal refs never serialize publicly |
| License | none vs **SPDX id per artifact** | SPDX id (e.g. `CC-BY-4.0`) | tells readers/agents what reuse is permitted |

## Decision

Adopt the **8-entity model** with the field schemas in
[../02-research/content-model-and-metadata.md](../02-research/content-model-and-metadata.md):

- **Common fields** (every publishable entity): `id`, `kind` (`tip|skill|workflow|playbook`), `title`, `summary`,
  `tags?`, `source` (ref → Source), `boundary` (ref → SafetyBoundary), `version` (ref → Version),
  `status` (`draft|in-review|published|unpublished|redacted`), `license` (SPDX), `created_at`/`updated_at`.
- **Tip:** `body`, `rationale?`, `applies_to?`, `confidence?`.
- **Skill (the reuse contract):** `description` (triggering text), `inputs[]`, `outputs[]` (typed, JSON-Schema-backed),
  `preconditions[]`, `postconditions?`, `steps[]`, `tools_required?`, `failure_modes?`, `idempotent?`, `est_cost?`.
- **Workflow:** `goal`, `steps[]` (a step may `uses` a Skill by `id@version`), aggregate `inputs/outputs`,
  `preconditions[]`, `branches?`, `skills_used[]` (pinned `id@version` — the audit graph).
- **Playbook:** `scenario`, `decision_guide?`, `contains[]` (`id@version`), `outcomes?`.
- **Example:** `parent` (`id@version`), `input_sample?`, `output_sample?`, `narrative?`, and **its own
  `boundary`** — examples leak most, so they are gated independently of their parent.
- **Source (provenance anchor):** `origin_product` (`caw-02|caw-03|skills-registry`), `origin_ref`,
  `origin_version`, `validated`, `validated_by`, `imported_at`, `derivation` (PROV), `internal_only`.
  `origin_ref`/`origin_version` are **audit-only** — stored in a sidecar, **never rendered** on web/API.
- **SafetyBoundary (gate record):** `classification` (`public-safe|internal-only|confidential` — only
  `public-safe` publishes), `recheck_status` (`pass|fail|pending` from CAW-04's OWN re-check), `rechecked_at`,
  `redactions?`, `reviewer`, `rationale?`, `expires_at?`.
- **Version (immutable snapshot):** `version` (semver label), `content_hash` (content-addressed digest),
  `supersedes?`, `published_at`, `change_note?`, `source_at_publish`, `boundary_at_publish`.

Shared value objects: `Param`, `Condition`, `Step`, `ToolRef`, `Redaction`, `Branch` (shapes per research).

**The reusable-skill rule (the publishability contract):** a Skill/Workflow becomes `published` only when all
blocking pillars hold — **Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧ Provenance ∧ Safety ∧ Provability**.
Reliability (`failure_modes`/`idempotent`/`est_cost`) is recommended, not blocking. Missing any blocking pillar →
status stays `in-review`, never `published`. This is expressed as a single `isPublishable(record)` predicate that
ADR-0003's gate consumes (gate check G5 maps onto it).

**Layer separation is structural:** audit-only fields live in a **sidecar** record; a public projection strips
them before any web/API output. `boundary` (sensitivity) and visibility never collapse into one field, and a
validated `source` plus `boundary = public-safe / recheck_status = pass` are *required* for any record to publish.

## Consequences

- **Easy:** an agent can fetch a Skill's JSON and call it (typed I/O, preconditions, pinned `id@version`) without
  reading prose; an auditor can trace any artifact to a validated Source + safety review.
- **Easy:** Workflows/Playbooks pin composed Skills by `id@version`, giving a deterministic audit graph and stable
  reuse under change (ties to ADR-0005 immutability).
- **Hard:** every artifact must carry the full metadata before it can publish — partial imports stay `in-review`.
  This is intended friction (default-deny).
- **Hard:** sidecar/public-projection split must be enforced by code + a test asserting audit fields never serialize.
- **Follow-on:** ADR-0005 ratifies semver bump semantics + `content_hash` canonicalization; ADR-0003 wires
  `isPublishable` into the gate; a runbook defines the 8 entity schemas as code (Zod/JSON Schema) with golden
  fixtures (one fully-populated Skill, one Workflow pinning a Skill by `id@version`).

## Open questions / revisit triggers

- TODO(open-question: do CAW-02/CAW-03 expose a stable, versioned `origin_ref` to pin, or only mutable handles?
  Deterministic audit requires pinning `origin_version`.)
- TODO(open-question: is JSON Schema the family-wide contract language for `inputs/outputs`, or align to MCP tool
  schemas for agent interop?)
- TODO(open-question: is a 3-level `classification` enough, or are per-field sensitivity labels needed?)
- TODO(open-question: does `content_hash` cover sidecar/audit fields, or only the public projection?)
- TODO(open-question: license policy — single default SPDX vs per-artifact, and inheritance from upstream Source.)
- **Revisit trigger:** if a new entity or a non-public boundary tier is ever needed, re-open the entity set (note:
  publishing above public is a standing non-goal, brief §10).

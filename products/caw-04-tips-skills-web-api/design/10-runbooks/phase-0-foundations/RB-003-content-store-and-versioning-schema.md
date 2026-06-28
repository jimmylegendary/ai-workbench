# RB-003: Content-store schemas, the slug/semver layout, audit sidecar, and the semver+digest model

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001, RB-002]
- Implements design: [../../04-data-layer/content-model.md](../../04-data-layer/content-model.md), [../../04-data-layer/storage-and-versioning.md](../../04-data-layer/storage-and-versioning.md), [../../01-decisions/ADR-0002-content-model.md](../../01-decisions/ADR-0002-content-model.md), [../../01-decisions/ADR-0005-storage-and-versioning.md](../../01-decisions/ADR-0005-storage-and-versioning.md)
- Produces: the full md/MDX YAML frontmatter schemas for the 8 entities (`src/content/config.ts`), the public-projection split with audit sidecar, the `<slug>/<semver>` layout convention, and the semver + content-digest identity model (canonical-serialization + digest helpers in `src/lib/`). Schema-level only; the write path lands in phase 2.

## Objective

CAW-04 gains its **schema of record** ([content-model.md](../../04-data-layer/content-model.md)): the four publishable kinds (Tip/Skill/Workflow/Playbook) plus the embedded/attached Example/Source/SafetyBoundary/Version, each as validated Astro content-collection frontmatter. The **two-record principle** is encoded structurally: the served `.md(x)` frontmatter holds the **public projection** only, while audit-only fields (`origin_ref`, `origin_version`, redaction internals, reviewer notes) are declared in a **separate sidecar schema** that NEVER serializes to web/API. The `<slug>/<semver>` on-disk layout and the semver + content-digest identity model (`digest = "sha256:" + sha256(canonical_serialization(public_projection))`) are codified with helpers and the freeze/never-reuse invariant documented. "Done" = the schemas validate a fixture, the sidecar is separately typed, and the canonical-serialization + digest helpers are deterministic — all on a green tree. This is **node A→D** of the DAG; no build/serialize runbook may precede it.

## Preconditions

- [ ] RB-002 complete: `PublicProjection` / `PublishableItem` value objects exist in `src/core/model/`.
- [ ] `src/content/config.ts` exists with the common-field stub from RB-000.
- [ ] `_audit/sidecar/` tree exists and is never served (RB-000).

## Steps

1. **Encode the common fields for every publishable entity.**
   - Do: in `src/content/config.ts` define a shared Zod base schema with: `id` (kebab slug), `kind` (`tip|skill|workflow|playbook`), `title`, `summary`, `tags?`, `version` (semver), `status` (`draft|in-review|published|unpublished|redacted`), `license` (SPDX id), `source` (embedded public subset), `boundary` (embedded SafetyBoundary), `content_hash` (`sha256:` digest), `created_at`/`updated_at` (ISO-8601). Mark every field's projection per [content-model §Common-fields](../../04-data-layer/content-model.md) — all are `public`.
   - Verify: `astro check`/`typecheck` passes; the base schema rejects a non-semver `version` and a non-SPDX `license`.

2. **Define the four publishable-kind schemas.**
   - Do: extend the base into four collections:
     - **Skill** (the reuse contract): `description`, `inputs[]`/`outputs[]` (`Param`), `preconditions[]`/`postconditions[]` (`Condition`), `steps[]` (`Step`), `tools_required[]` (`ToolRef`), `failure_modes[]`, `idempotent`, `est_cost`. `description` mirrors the Agent `SKILL.md` convention; `id` = SKILL.md `name`.
     - **Workflow**: `goal`, `steps[]` (`uses?: id@version`), `inputs[]`/`outputs[]`, `preconditions[]`, `branches[]?`, `skills_used[]` (pinned `id@version` — the audit graph).
     - **Playbook**: `scenario`, `decision_guide?`, `contains[]` (`id@version`), `outcomes[]?`.
     - **Tip**: `body`, `rationale?`, `applies_to[]?`, `confidence?` (`low|medium|high`).
   - Verify: each collection validates a minimal fixture and rejects a missing blocking field.

3. **Define Example as an independently-gated attached entity.**
   - Do: add an `examples` schema: `id`, `parent` (`id@version`), `input_sample?`/`output_sample?` (must match parent contract; public-safe/redacted), `narrative?`, and its **own** embedded `boundary` (examples carry the highest leak risk).
   - Verify: an Example with no `boundary` fails validation.

4. **Define the embedded Source / SafetyBoundary / Version public subsets.**
   - Do: define the inline public subsets per [content-model §Embedded](../../04-data-layer/content-model.md):
     - `source`: `{ origin_product: caw-02|caw-03|skills-registry, validated: true, derivation: verbatim|redacted|summarized }` — **public subset only**; `origin_ref`/`origin_version` are NOT here.
     - `boundary`: `{ classification: public-safe, recheck_status: pass|fail|pending, rechecked_at: ISO-8601 }`.
     - `version_meta`: `{ version, content_hash, published_at, supersedes? }`.
   - Verify: the `source` schema has no `origin_ref`/`origin_version` key (the split is structural).

5. **Define the audit sidecar schema — separate, never served.**
   - Do: in `src/core/model/` (and a loader keyed to `_audit/sidecar/{type}/<slug>/<semver>.audit.json|.yml`) define the sidecar type holding `origin_ref`, `origin_version`, reviewer notes, and `Redaction[]` internals (`{field, action: remove|mask|summarize, reason}`). It shares `id@semver` with the public record but is a **distinct type** the page/endpoint code may never import (the RB-001 boundary lint already forbids `src/pages/**` importing `_audit/**`).
   - Verify: `typecheck` passes; the sidecar type and `PublicProjection` share no audit-only keys; a test asserts `PublicProjection` cannot hold `origin_ref`.

6. **Codify the `<slug>/<semver>` layout convention.**
   - Do: document + helper-encode the layout `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)` with the sibling sidecar at `_audit/sidecar/{type}/<slug>/<semver>.audit.json`. Add a path helper in `src/lib/` that derives both paths from `(kind, slug, semver)`. State (no write path yet) the invariants: a new version is a **new file** in the same `<slug>/` dir; `(slug,semver)` is **frozen forever** and **never reused** — enforcement lands in the phase-2 storage runbook.
   - Verify: the path helper round-trips `(kind, slug, semver)` ↔ both file paths.

7. **Implement the semver + content-digest model.**
   - Do: in `src/core/version/` + `src/lib/` implement: (a) semver validation + the content-adapted bump-rule documentation (MAJOR = different action; MINOR = additive; PATCH = cosmetic, per [storage-and-versioning §bump-rules](../../04-data-layer/storage-and-versioning.md)); (b) `canonicalSerialization(publicProjection)` — frontmatter keys sorted, LF newlines, trailing whitespace trimmed, body after a single normalized delimiter, covering the **public projection only**; (c) `contentDigest(projection) = "sha256:" + sha256(canonicalSerialization(projection))`. Mark the exact canonicalization/algorithm spec as `TODO(open-question: sha256 vs multihash; which metadata fields are inside the hashed envelope)` — do not invent.
   - Verify: `canonicalSerialization` is deterministic (same input → byte-identical output, key order independent); `contentDigest` is stable across runs; re-serializing the sidecar fields does NOT change the digest (they are not in the projection).

8. **Add the serialization-firewall test (the public-safe guard).**
   - Do: add a test asserting that for a fixture with a populated sidecar, the canonical serialization / public projection contains **no** audit-only key (`origin_ref`, `origin_version`, redaction internals). This is the schema-level half of the B3 "audit fields never serialize" guarantee (the dist-output test lands in phase 4).
   - Verify: the test passes; adding `origin_ref` to the projection fixture fails it.

## Acceptance criteria

- [ ] `src/content/config.ts` validates all four publishable kinds + Example with the full per-entity fields; rejects missing blocking fields and bad semver/SPDX.
- [ ] The audit sidecar is a **separate** schema/type at `_audit/sidecar/...`; `PublicProjection` shares no audit-only key with it (type-enforced test passes).
- [ ] The embedded `source` public subset contains no `origin_ref`/`origin_version`.
- [ ] The `<slug>/<semver>` path helper round-trips `(kind, slug, semver)` ↔ content path + sidecar path.
- [ ] `canonicalSerialization` is deterministic and key-order independent; `contentDigest` is stable and computed over the **public projection only** (sidecar changes do not alter it).
- [ ] The serialization-firewall test confirms no audit-only field appears in the projection/serialization.
- [ ] Freeze/never-reuse invariants are documented (enforcement deferred to phase 2); `typecheck`/`lint`/`test`/`astro build` stay green.

## Rollback / safety

- Schema + helper work only; revert via `git` to RB-002. No content is written, so nothing is frozen yet.
- Do NOT add `origin_ref`/`origin_version` or any redaction internal to a served frontmatter schema — they belong only in the sidecar type; this is the load-bearing public-safe split.
- Do NOT implement the freeze/never-reuse write enforcement here — it belongs to the phase-2 storage runbook so the green tree stays I/O-free in phase 0.
- Leave digest/canonicalization open-questions as `TODO(open-question: ...)`; do not invent the spec.

## Hand-off

Phase-1 (import + core re-check + gate) and phase-2 (git content store + write path) runbooks can assume: validated frontmatter schemas for the 8 entities; a structurally separate audit sidecar type; the `<slug>/<semver>` layout helper; and deterministic canonical-serialization + content-digest functions over the public projection. The freeze + never-reuse write enforcement, the actual sidecar write, and the `index.json` derivation are phase-2; the dist-level "audit fields never serialize" test is phase-4 (M1 acceptance).

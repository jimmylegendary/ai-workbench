# Validation & Tests — public-safe-by-construction acceptance suite

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:** [./research-plan.md](./research-plan.md), [./open-questions.md](./open-questions.md), [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md), [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md), [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc specifies the **executable guarantees** that make CAW-04 public-safe by construction. Each invariant
below is a **test family** the AI builder must implement and keep green; these are acceptance gates, not
suggestions. It does NOT define the build steps (runbooks) or re-decide policy (ADRs) — it pins the behaviour
those decisions promise into tests. The guiding rule: **if a test in V1–V7 is red, nothing ships.** Tests are
named `V<n>-*` and should run in CI on every change and as a release gate.

## Invariant map

| ID | Invariant | Enforces ADR | Failure = |
|----|-----------|--------------|-----------|
| V1 | Nothing publishes without validated source + public-safe (deny-by-default) | ADR-0003, ADR-0004 | confidential/unverified leak |
| V2 | Audit-only fields NEVER serialize to web/API | ADR-0002 | provenance/internal-ref leak |
| V3 | Published `(slug, semver)` is immutable, frozen forever | ADR-0005 | broken addressable identity |
| V4 | Tombstone returns HTTP 410 | ADR-0003, ADR-0005 | withdrawn content still served |
| V5 | Import re-check re-derives boundary in core (claims = evidence only) | ADR-0004 | upstream trusted blindly |
| V6 | Web/API parity from one source | ADR-0007, ADR-0006 | drift between HTML/MD/JSON |
| V7 | Stub sink is safe (no publish, no live internal path) | ADR-0004, ADR-0006 | future connector leaks |

---

## V1 — Deny-by-default publish gate

**Property:** an artifact reaches a publish sink **iff** it has (a) a validated internal `Source` AND (b) a
public-safe effective boundary AND (c) recorded curator approval. Absence of any input = **deny** (not error-open).

| Case | Input | Expected |
|------|-------|----------|
| V1-a | no validated source | DENY |
| V1-b | source valid, boundary = confidential | DENY |
| V1-c | source valid, boundary public-safe, **no curator approval** | DENY (held in preview) |
| V1-d | source valid, boundary public-safe, approval present | PUBLISH |
| V1-e | generated/unverified content (no provenance) | DENY |
| V1-f | gate input missing/null (fuzz) | DENY (fail-closed, never default-open) |

```text
assert publish(artifact) == ALLOW
  requires validated_source(artifact)
       and boundary_eff(artifact) == PUBLIC_SAFE
       and approval_record(artifact).curator == "Jimmy"
otherwise -> DENY  # deny-by-default; missing inputs deny, never allow
```

- Property/fuzz test: randomized missing-field artifacts must **never** yield ALLOW.
- The curator approval is mandatory and recorded (ADR-0003); auto-generation only proposes.

## V2 — Audit-only fields never serialize to web/API

**Property:** sidecar/audit-only fields (`origin_ref`, `origin_version`, and any field flagged audit-only in the
content model) appear in NO public artifact — HTML, raw markdown, JSON, `index.json`, `SKILL.md`, `manifest.json`,
MCP resources view, sitemap, or search index.

| Case | Surface | Expected |
|------|---------|----------|
| V2-a | rendered HTML page | no audit field substrings |
| V2-b | raw `.md` output | no audit field substrings |
| V2-c | per-artifact `.json` | keys are public-projection allowlist only |
| V2-d | `index.json` / `manifest.json` | no audit fields |
| V2-e | `SKILL.md` + MCP resource | no audit fields |
| V2-f | search index (if built, T7) | no audit fields |

```text
PUBLIC_ALLOWLIST = {id, kind, title, summary, version, safety_boundary, ...public fields}
for each built file f in dist/:
    parsed = parse(f)
    assert keys(parsed) ⊆ PUBLIC_ALLOWLIST
    assert not contains_any(text(f), AUDIT_ONLY_FIELDS)   # origin_ref, origin_version, ...
```

- Enforced as a **whole-tree scan of the build output** (`dist/`), not just unit serializers — catches leaks via
  any rendering path. This is the test ADR-0002 calls "test-enforced".
- Also assert the JSON serializer uses an **allowlist** (deny-by-default field projection), not a denylist.

## V3 — Immutable `(slug, semver)` frozen forever

**Property:** once published, a `(slug, semver)` pair's bytes and content-digest never change across rebuilds;
edits create a **new** version; the old version stays addressable.

| Case | Action | Expected |
|------|--------|----------|
| V3-a | rebuild unchanged content | identical content-digest (reproducible) |
| V3-b | edit a published version in place | CI fails (frozen-version guard) |
| V3-c | publish edited content | new semver; old version still served |
| V3-d | digest mismatch vs recorded | release blocked |

```text
for (slug, semver) in published_index:
    assert digest(build(slug, semver)) == frozen_digest[(slug, semver)]
# canonical serialization per ADR-0005 / research-plan T9 -> reproducible hash
```

- Depends on the canonical serialization + digest scheme (research-plan **T9**).
- The frozen digest set is committed; any drift is a hard CI failure.

## V4 — Tombstone returns HTTP 410

**Property:** an `unpublish`/`redact` replaces the artifact with a **410 Gone tombstone** across all surfaces;
the public bytes are removed from the served artifact and from the index.

| Case | Request | Expected |
|------|---------|----------|
| V4-a | GET redacted artifact (HTML) | 410 Gone |
| V4-b | GET redacted artifact (`.json`/`.md`) | 410 Gone |
| V4-c | redacted artifact in `index.json` | absent or flagged tombstone |
| V4-d | edge/CDN GET after purge | 410 (purge bound, research-plan **T4**) |
| V4-e | tombstone body | no leaked original content |

- Static-host 410 mechanism is hosting-dependent (TODO(open-question: hosting target)); test asserts the served
  status + that original bytes are gone, plus the edge purge per **T4**.
- Sitemap/index behaviour for deprecated-but-served versions is an open question (see open-questions).

## V5 — Import re-check re-derives boundary in core

**Property:** the public-safe boundary is recomputed by the **core** from the provenance ancestor graph; the
upstream bundle's boundary claim is **evidence only** and can never by itself promote an artifact to public-safe.

| Case | Bundle claim | Ancestor graph | Expected |
|------|-------------|----------------|----------|
| V5-a | "public-safe" | all ancestors public-safe | core may PUBLISH (if V1 holds) |
| V5-b | "public-safe" | one ancestor confidential | core DENY (claim overridden) |
| V5-c | unsigned/invalid bundle | any | reject before re-check (research-plan T5) |
| V5-d | re-check runs in adapter, not core | — | architecture test fails |

```text
boundary_eff = recompute_in_core(ancestor_graph)   # NOT read from bundle claim
assert publish_allowed implies boundary_eff == PUBLIC_SAFE
# adapter cannot override core re-check / human gate / boundary policy (ADR-0004)
```

- Architecture test: assert the re-check symbol lives in the core package and that no `PublishSinkAdapter` or
  `ContentSourceAdapter` imports/embeds it (couples to research-plan **T1**, **T5**, **T8**).

## V6 — Web/API parity from one source

**Property:** HTML, raw markdown, and JSON for an artifact are generated by the **same Astro build from one
source file**; the canonical fields agree across all three.

| Case | Check | Expected |
|------|-------|----------|
| V6-a | per artifact, HTML vs JSON vs MD canonical fields | equal (id, kind, title, summary, version, boundary) |
| V6-b | every published artifact has all three representations | present |
| V6-c | `.md`/`.json` suffix routes emitted statically | present (ADR-0007 / research-plan T6) |
| V6-d | `index.json` lists exactly the published set | 1:1 with content dir |

```text
for artifact in published:
    h, j, m = read_html(artifact), read_json(artifact), read_md(artifact)
    assert canonical_fields(h) == canonical_fields(j) == canonical_fields(m)
```

- Guards the ADR-0007 "one canonical resource per artifact in HTML/markdown/JSON" promise; prevents the JSON API
  drifting from the rendered site.

## V7 — Stub sink is safe

**Property:** documented future-connector stubs (external docs host, package registry, syndication) and any
disabled adapter **cannot publish** and have **no live path to internal stores**.

| Case | Check | Expected |
|------|-------|----------|
| V7-a | stub `publish()` called | no-op / explicit `NotImplemented`, emits nothing public |
| V7-b | stub reads internal store directly | forbidden (no such import/path) |
| V7-c | config enables only v1 `SiteAndApi` sink | registry refuses unlisted sinks |
| V7-d | adapter attempts boundary override | rejected by core |

- The v1 site is a **frozen vetted static artifact with no live path to internal stores** (ADR-0006); test that
  the deployed bundle has no runtime credential/connection to CAW-02/CAW-03 or internal data.
- Stub registration is config-driven (ADR-0004); test that stubs are inert until explicitly built + re-gated.

## Test execution & gating

| Tier | When | Blocks |
|------|------|--------|
| Unit (serializer allowlist, gate logic) | every commit | merge |
| Build-output scan (V2, V3, V6) | every build | merge |
| Integration (V1, V4, V5, V7) | every PR | merge |
| Release gate | pre-deploy | deploy |

- V1, V2, V5 are the **load-bearing** public-safe trio — a red result here is a release stop, no override.
- Numeric thresholds (redaction recall, purge time bound) are TODO(open-question) until the matching research
  track (research-plan T2, T4) measures them.

## Implications for runbooks

- Each P-phase runbook's Acceptance criteria must reference the V-IDs it satisfies.
- The build-output whole-tree scan (V2) must be wired before the first artifact is published (P2).
- The frozen-digest set (V3) is committed and updated only by adding new versions, never editing existing ones.

# Risks & Mitigations

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./milestones-and-phases.md](./milestones-and-phases.md)
  - [./dependency-graph.md](./dependency-graph.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc enumerates the delivery + operational risks for CAW-04 — the **public** publishing layer —
and the concrete mitigations baked into the design. Because CAW-04 is the public surface, the
highest-severity risks are confidentiality leaks. It does NOT restate the gate design (see
[ADR-0003]) — it maps risks to the controls that already exist and flags gaps as open questions.

## Risk register

| ID | Risk | Likelihood | Impact | Severity |
|----|------|-----------|--------|----------|
| R1 | Confidential/internal data reaches a public surface | Low (by design) | Critical | **High** |
| R2 | Audit-only provenance fields serialized to web/API | Medium | Critical | **High** |
| R3 | Stale or cached copy survives an unpublish/redact | Medium | High | **High** |
| R4 | Upstream provenance/boundary insufficient or wrong | Medium | High | High |
| R5 | Scope creep into authoring / original content | Medium | Medium | Medium |
| R6 | Build-budget interruptions leave a half-published state | Medium | Medium | Medium |
| R7 | Frozen `(slug, semver)` violated by an edit-in-place | Low | High | Medium |
| R8 | Adapter becomes a bypass around the core gate | Low | Critical | High |

---

## R1 — Confidential leak on the public surface

**The product's defining failure mode.** A tip/skill carrying company-confidential know-how is served
to the world.

**Mitigations (design-level):**

- Deny-by-default publish gate: nothing publishes without BOTH a validated internal source AND a
  public-safe boundary ([ADR-0003]).
- Public-safe re-check is a **CORE** stage, not in adapters ([ADR-0004]); upstream "public" claims are
  treated as **evidence only**, never trusted.
- The published artifact is a **frozen static SSG build with no live path** to any internal store
  ([ADR-0006]) — public-safe by construction.
- Curator (Jimmy) approval is mandatory before publish; automatic generation is proposal-only.

**Tests/controls:** confidential-tagged fixture must be denied even when upstream marks it public;
red-team fixture suite in CI. TODO(open-question: define the confidential-content fixture corpus).

## R2 — Audit field serialization

`origin_ref` / `origin_version` are audit-only and must NEVER appear in web/API output.

**Mitigations:**

- Public-projection split: audit-only fields live in a **sidecar**, separate from publishable
  frontmatter ([ADR-0002], [ADR-0005]).
- **Test-enforced** serialization boundary: a golden test asserts no sidecar key appears in any HTML,
  JSON, raw-markdown, `index.json`, or MCP resource output.
- The serializer accepts only the public projection type — sidecar fields are not in its input type.

**Control:** the M1 acceptance checklist includes "audit-only fields absent from every public output".

## R3 — Stale / unpublish cache

After an unpublish or redact, a cached or CDN copy keeps serving the withdrawn artifact.

**Mitigations:**

- Unpublish/redact via **HTTP 410 tombstone** ([ADR-0005], [ADR-0003]) — an explicit gone marker, not a
  silent delete.
- Rebuild + redeploy the full static artifact on any lifecycle change; cache invalidation step is part
  of the unpublish runbook.
- Versioning guarantees the withdrawn `(slug, semver)` is identifiable for purge.

**Gap:** CDN/cache purge target not yet pinned — TODO(open-question: specify cache invalidation hooks
for the chosen host).

## R4 — Upstream provenance insufficiency

CAW-02 / CAW-03 (separate products) supply content whose provenance or boundary metadata is missing,
wrong, or over-optimistic.

**Mitigations:**

- Core re-check does not rely on upstream verdicts; missing/ambiguous boundary ⇒ deny.
- ContentSource writes to git **only after** the re-check passes ([ADR-0005]).
- Provenance is required common-field metadata; an item without a validated source ref is denied.

**Gap:** the minimum provenance schema accepted from each upstream — TODO(open-question: pin per-source
provenance contract).

## R5 — Scope creep into authoring

Pressure to "just write the tip here" turns the publishing layer into an authoring tool — violating
PRODUCT-BRIEF §10 non-goals.

**Mitigations:**

- Architecture has no authoring port — only `ContentSourceAdapter` (import) and `PublishSinkAdapter`
  (publish) ([ADR-0004]).
- Content can only enter via an import adapter + re-check; there is no "create from blank" path.
- Roadmap marks authoring as permanently deferred ([milestones-and-phases.md](./milestones-and-phases.md)).

## R6 — Build-budget interruptions

A long build/import is interrupted (timeout, budget), risking a partially-published or inconsistent
state.

**Mitigations:**

- Small, **resumable runbooks** numbered by phase band; each leaves the tree green at its acceptance
  checkpoint ([DOC-CONVENTIONS §6]).
- Git content store is the source of truth; the SSG build is a pure, re-runnable function of git —
  re-running the build is idempotent and safe.
- Publish is atomic at the artifact level: a half-built static output is never promoted to the live
  surface (build-then-swap). TODO(open-question: confirm atomic promotion mechanism for the host).

## R7 — Frozen-version violation

An edit mutates an already-published `(slug, semver)` instead of creating a new version.

**Mitigations:**

- Published `(slug, semver)` is frozen FOREVER ([ADR-0005]); the store rejects re-writes of an existing
  pair at build time.
- Content-digest provides an immutability proof; a digest mismatch on a frozen pair fails the build.
- Edits create a new semver; old versions stay addressable.

## R8 — Adapter bypass of the gate

A future adapter writes content to the store without passing the core re-check.

**Mitigations:**

- The re-check + gate are **core** stages, structurally upstream of every adapter in the DAG
  ([dependency-graph.md](./dependency-graph.md)).
- Adapters depend on the gate (build order); ContentSource writes git only via the post-re-check path.
- Documented stubs are spec-only until they route through the same core gate.

## Severity matrix

| | Impact: Medium | Impact: High | Impact: Critical |
|---|---|---|---|
| **Likelihood: Medium** | R5 | R3, R4 | R2 |
| **Likelihood: Low** | — | R7 | R1, R8 |

## Open Questions

- Confidential-content fixture corpus (R1) — TODO(open-question).
- Cache/CDN purge hooks (R3) and atomic promotion (R6) — TODO(open-question).
- Per-source provenance contract (R4) — TODO(open-question).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- Add a red-team fixture step to the gate runbook (R1) and a serialization golden-test to the build
  runbook (R2).
- The unpublish runbook must include cache invalidation + tombstone verification (R3).
- Keep every runbook small and idempotent so interruptions are recoverable (R6).

# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./dependency-graph.md](./dependency-graph.md)
  - [./risks-and-mitigations.md](./risks-and-mitigations.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc sequences CAW-04 delivery into phases that map 1:1 to runbook phase folders
(`10-runbooks/RB-0XX` … `RB-5XX`), with **entry** and **exit** criteria per phase and named
milestones. It defines *what ships when* and the order that preserves the
**public-safe-by-construction** property. It does NOT define the DAG edges (see
[dependency-graph.md](./dependency-graph.md)) nor risk handling (see
[risks-and-mitigations.md](./risks-and-mitigations.md)). It does not redefine any ADR decision.

## Phase ↔ runbook mapping

Each phase corresponds to a runbook number band so an interrupted build resumes at a known
checkpoint. Phases are deliberately small and vertically sliced; every phase leaves the tree
green (builds, lints, tests pass).

| Phase | Runbook band | Theme | Milestone gate |
|-------|--------------|-------|----------------|
| P0 Foundations | RB-0XX | Repo scaffold, content model types, config registry skeleton | — |
| P1 Core & ports | RB-1XX | Hexagonal core, two ports, deny-by-default gate stages | — |
| P2 Storage & versioning | RB-2XX | Git content store, semver + content-digest, sidecar split | — |
| P3 Import & re-check | RB-3XX | v1 ContentSource adapters + core public-safe re-check | — |
| P4 Build & publish | RB-4XX | Astro/Starlight SSG, SiteAndApi sink, web + API parity | **M1** (see below) |
| P5 Hardening & ops | RB-5XX | Tombstones, cache/unpublish, audit reports, stubs documented | M2 |

> Cross-product note: CAW-02 (knowledge) and CAW-03 (skills registry) are **separate products**;
> CAW-04 imports across explicit boundaries and never shares a runtime substrate with them.

---

## Phase P0 — Foundations

**Goal:** an empty but well-typed product skeleton.

| Entry | Exit |
|-------|------|
| PRODUCT-BRIEF + ADRs accepted | Repo builds clean (CI green) |
| Doc conventions in place | 8-entity content model types defined ([ADR-0002]) |
| — | Config-driven adapter registry skeleton exists (no live adapters) |
| — | Public-projection schema declared with sidecar separation |

Deliverables: TypeScript content-model types; frozen common-field set (`id, kind, title, summary,
version, safety_boundary, provenance`); the **sidecar** declaration for audit-only fields
(`origin_ref`, `origin_version`).

## Phase P1 — Core & ports

**Goal:** the hexagonal core with the gate, before any adapter exists.

| Entry | Exit |
|-------|------|
| P0 exit met | Two ports defined: `ContentSourceAdapter`, `PublishSinkAdapter` ([ADR-0004]) |
| — | Deny-by-default publish gate stages implemented as **core** stages ([ADR-0003]) |
| — | Public-safe re-check is a CORE stage (NOT in adapters); upstream claims treated as evidence only |
| — | Gate unit tests: no validated source OR no public-safe boundary ⇒ publish denied |

Rationale (see DAG): ports + registry + gate must exist **before** adapters so adapters can never
become a bypass path around the gate.

## Phase P2 — Storage & versioning

**Goal:** durable, immutable, addressable content store.

| Entry | Exit |
|-------|------|
| P1 exit met | Git content store at `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)` ([ADR-0005]) |
| — | semver = public identity; content-digest = immutability proof; both computed on write |
| — | Audit-only fields persisted to **sidecar**, never to the publishable frontmatter |
| — | Frozen `(slug, semver)` enforced: re-publish of an existing pair fails the build |

Versioning lands here because **no update path may exist before versioning exists** — edits create
a new version; the old version stays addressable.

## Phase P3 — Import & re-check

**Goal:** validated upstream content lands in the store, re-checked by the core.

| Entry | Exit |
|-------|------|
| P2 exit met | v1 adapters: CAW-02 knowledge import, CAW-03/skills-registry import ([ADR-0004]) |
| — | Stubs documented (not built): internal wiki, curated bundle |
| — | Core re-check runs on every import; upstream boundary claim is EVIDENCE ONLY |
| — | ContentSource writes to git **only after** the re-check passes ([ADR-0005]) |
| — | Test: a confidential-tagged fixture is denied even if upstream marked it "public" |

## Phase P4 — Build & publish — **Milestone M1**

**Goal:** the end-to-end vertical slice is live on both surfaces.

| Entry | Exit (M1) |
|-------|-----------|
| P3 exit met | Astro 5 + Starlight SSG static build from git ([ADR-0006]) |
| — | `SiteAndApi` PublishSink emits HTML pages + prebuilt JSON + raw markdown ([ADR-0007]) |
| — | One canonical resource per artifact across HTML/markdown/JSON (web/API parity) |
| — | `index.json` manifest + `SKILL.md`/`manifest.json` distribution + MCP resources view |
| — | **Test-enforced:** audit-only sidecar fields never serialize to web or API output |

### Milestone M1 (definition of the first shippable value)

> **M1 = one validated Skill, imported from upstream → through the public-safe gate → published as a
> versioned web page AND a versioned API resource, readable over both the website and the REST API.**

M1 acceptance checklist:

- [ ] A real validated Skill is imported via the CAW-03 ContentSource adapter.
- [ ] The core re-check passes (validated source present + public-safe boundary present).
- [ ] Content is written to git at `skills/<slug>/<semver>.mdx` with a content-digest.
- [ ] The SSG build produces an HTML page at the canonical URL.
- [ ] The same artifact is fetchable as JSON and as raw markdown (parity verified).
- [ ] `index.json` lists the artifact; the MCP resources view exposes it.
- [ ] Audit-only fields are absent from every public output (automated test passes).
- [ ] The static artifact has NO live path to any internal store (public-safe by construction).

## Phase P5 — Hardening & ops — Milestone M2

**Goal:** lifecycle, cache, audit, and future-proofing.

| Entry | Exit (M2) |
|-------|-----------|
| M1 met | Unpublish/redact via **HTTP 410 tombstone** ([ADR-0005], [ADR-0003]) |
| — | Boundary-change flow: deprecate / unpublish / redact |
| — | Cache invalidation on unpublish documented + tested (no stale public copy) |
| — | Audit report: every published item traces to its validated internal source + safety review |
| — | All future stubs documented (external docs host, package registry, syndication) |

## Deferred (explicit non-scope for v1)

| Deferred item | Revisit trigger |
|---------------|-----------------|
| Runtime search | Catalog size makes prebuilt index insufficient |
| Accept-header content negotiation | Consumers demand single-URL negotiation |
| Authoring UI | Never — authoring is a CAW-04 non-goal (PRODUCT-BRIEF §10) |
| Public write API / accounts | Out of scope (read-only public surface) |

## Open Questions

- Hosting/CDN target for the static artifact — TODO(open-question: pin deploy target).
- Cadence of M1 → M2 — TODO(open-question: depends on upstream validated-entry availability).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- Number runbooks by phase band (`RB-0XX`…`RB-5XX`); keep each unit small + resumable.
- The gate (P1) and re-check (P3) must precede the publish path (P4) in every runbook ordering.
- M1 is the first "demo-able" runbook checkpoint — split it so an interrupted build resumes cleanly.

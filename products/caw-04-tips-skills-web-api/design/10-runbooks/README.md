# Runbooks — CAW-04 (Tips / Skills Website & REST API)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./runbook-conventions.md](./runbook-conventions.md)
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)
  - [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This index tells an **AI builder** how to execute the CAW-04 runbooks: what they are, the order to
run them, the gates between phases, and the chain that delivers **Milestone M1**. It does NOT make
design decisions — those live in [`../01-decisions/`](../01-decisions/) (ADRs) and the roadmap docs.
If anything here conflicts with the [PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF.md), the brief wins.

## What these runbooks are

- Each runbook (`RB-XXX-*.md`) is **one cohesive, resumable build unit** an AI builder executes
  end-to-end. The builder writes the real code; runbook code is **build guidance only** (skeletons,
  signatures, config).
- The strict format and CAW-04-specific builder rules are defined once in
  [runbook-conventions.md](./runbook-conventions.md) — read it **before executing any runbook**.
- Runbooks build **CAW-04: an independent public publishing product** — three surfaces (public
  website, public read-only REST API, internal preview/admin) over **one hexagonal core**, each
  surface a `PublishSinkAdapter`. CAW-04 **imports** validated content from CAW-02 and
  CAW-03/skills-registry (separate products) across explicit boundaries; it never shares a runtime
  substrate with them.

## How to execute (phase order, Depends-on, gates)

1. **Run phases in order** (`phase-0` → `phase-4`). Each phase folder maps to a runbook number band
   (`RB-0XX` … `RB-4XX`) so an interrupted build resumes at a known checkpoint.
2. **Topologically sort within a phase** using each runbook's `Depends on:` list, which mirrors the
   build-order DAG in [dependency-graph.md](../09-roadmap/dependency-graph.md). **Never schedule an
   adapter runbook before the gate runbook** — that would create a bypass path around the gate.
3. **Each runbook is a gate.** Do not start a runbook until its `Preconditions` checklist is true and
   every runbook in its `Depends on:` list has met its `Acceptance criteria`.
4. **Leave the tree green** at every Acceptance checkpoint (builds, lints, tests pass) so a resumed
   build is clean.
5. **Verify, do not assume.** Every step has a `Do:` and a `Verify:`; the `Verify:` is the contract.

### Load-bearing invariants every runbook must preserve

| Invariant | Where enforced |
|-----------|----------------|
| Public-safe **re-check is a CORE stage** (not in adapters); upstream boundary = evidence only | phase-1 gate + phase-1 import |
| **Deny-by-default** publish: no validated source OR no public-safe boundary ⇒ denied | phase-1 gate |
| **Audit-only fields** (`origin_ref`, `origin_version`) live in a sidecar, **never serialized** to web/API | phase-0 model + phase-2 build (test-enforced) |
| **Immutable versions**: published `(slug, semver)` frozen forever; edits = new version | phase-2 storage + phase-3 lifecycle |
| **Public-safe by construction**: the frozen static artifact has NO live path to internal stores | phase-2 build |
| **Stubs are documented `NotImplemented`**, never silent | phase-4 interfaces |

## Phase table

> Folder names are authoritative. Runbook IDs below are the planned units; create/refine per the DAG.
> These phase folders consolidate the roadmap's P0–P5 (see
> [milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)).

| Phase folder | Band | Theme | Runbooks (planned) | Implements |
|--------------|------|-------|--------------------|------------|
| `phase-0-foundations` | RB-0XX | Repo scaffold, 8-entity content model + **sidecar split**, config-driven adapter registry skeleton | RB-001 repo-scaffold-and-ci · RB-002 content-model-types-and-sidecar · RB-003 adapter-registry-skeleton | [ADR-0002](../01-decisions/ADR-0002-content-model.md) |
| `phase-1-import-and-gate` | RB-1XX | Hexagonal core, **two ports**, **deny-by-default gate**, **public-safe re-check (core stage)**, v1 ContentSource adapters | RB-101 hexagonal-core-and-ports · RB-102 publish-gate-deny-by-default · RB-103 public-safe-recheck-core-stage · RB-104 contentsource-caw02-and-caw03 | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |
| `phase-2-build-and-publish` | RB-2XX | Git content store + semver + content-digest, Astro 5 + Starlight SSG, `SiteAndApi` sink (HTML + JSON + raw md + manifest), parity | RB-201 git-content-store-and-versioning · RB-202 astro-starlight-ssg-build · RB-203 siteandapi-sink-web-api-parity · RB-204 audit-fields-never-serialized-test | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md), [ADR-0006](../01-decisions/ADR-0006-web-stack.md), [ADR-0007](../01-decisions/ADR-0007-api-design.md) |
| `phase-3-versioning-and-lifecycle` | RB-3XX | Immutable `(slug,semver)` enforcement, new-version edits, unpublish/redact via HTTP 410 tombstone + bounded CDN purge, audit reports | RB-301 frozen-version-enforcement · RB-302 unpublish-redact-tombstone · RB-303 cache-purge-and-audit-report | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md) |
| `phase-4-interfaces-and-stubs` | RB-4XX | Documented `NotImplemented` stubs (internal wiki, curated bundle source; external docs host, package registry, syndication sinks), MCP resources view | RB-401 contentsource-stubs · RB-402 publishsink-stubs · RB-403 mcp-resources-and-distribution | [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md), [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md) |

## The Milestone-1 chain

> **M1 = one validated Skill, imported from upstream → through the public-safe gate → published as a
> versioned web page AND a versioned API resource, readable over both the website and the REST API.**

Execute this critical path (mirrors the DAG `A → D → (B,C → E) → F → G → {H,I}`):

```
RB-001 ─► RB-002 ─► RB-003 ─┐
                            ├─► RB-101 ─► RB-102 ─► RB-103 ─► RB-104 ─► RB-201 ─► RB-202 ─► RB-203 ─► RB-204  =  M1
RB-201 (git store) ─────────┘  (storage may build in parallel after RB-002; gate must precede RB-104)
```

M1 is met when (see [milestones-and-phases.md](../09-roadmap/milestones-and-phases.md) for the full
checklist): a real validated Skill imports via the CAW-03 adapter, the **core re-check** passes,
content is written to `skills/<slug>/<semver>.mdx` with a content-digest, the SSG emits the HTML page,
the same artifact is fetchable as JSON and raw markdown (**parity**), `index.json` lists it, **audit
fields are absent from every public output (automated test)**, and the static artifact has **no live
path to any internal store**. Phase-3/4 (lifecycle, stubs, MCP view) follow immediately but are not on
the M1 critical path.

## Budget discipline

- **Small vertical slices over broad scaffolding** (PRODUCT-BRIEF §11). Prefer the M1 critical path;
  defer anything not required to publish one Skill end-to-end.
- **Build only v1 adapters; stub the rest.** Future sources/sinks are *documented* `NotImplemented`
  seams (phase-4), not implementations — design the seam, skip the build.
- **Respect explicit non-scope** (no authoring UI, no public write API/accounts, no runtime search,
  no content negotiation — see [milestones-and-phases.md](../09-roadmap/milestones-and-phases.md)
  "Deferred"). Do not spend budget on deferred items without a revisit trigger firing.
- **One build, parallel writers.** The `G → {H,I,J}` fan-out is a single build runbook with parallel
  sink writers — not three pipelines. Do not duplicate build logic per surface.
- **Stop at the green checkpoint.** When a runbook's Acceptance criteria pass and the tree is green,
  end the unit; do not gold-plate beyond the runbook's `Produces`.
```

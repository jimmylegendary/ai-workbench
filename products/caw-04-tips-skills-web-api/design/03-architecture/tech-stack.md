# Tech Stack — components, languages, and version pins

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md) (the flows these components run)
  - [./repo-structure.md](./repo-structure.md) (where each component lives)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md) (Astro 5 + Starlight, SSG)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (static JSON + raw md + manifest + MCP)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (git store, semver+digest)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md) (ports/adapters, re-check in core)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack.md) (the research these pins ratify)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc names the concrete components, languages, and runtimes CAW-04 is built from, and records the version pins
(as `TODO` where not yet fixed — do not invent). It elaborates [ADR-0006](../01-decisions/ADR-0006-web-stack.md)
and [ADR-0007](../01-decisions/ADR-0007-api-design.md); it does NOT re-decide them, nor define the content model,
the gate, or the API contract (their own ADRs). The unifying property: every component is **build-time only on the
public path** — there is no request-time runtime that can reach an internal store, so the stack is **public-safe by
construction**.

## Stack at a glance

| Layer | Choice | Role | Public path? |
|-------|--------|------|--------------|
| Language | TypeScript | core, adapters, endpoints, build config | build-time only |
| Web framework | Astro 5 | SSG; content collections; file-based endpoints | build-time |
| Docs UI | Starlight | nav, search shell, per-version routing, layout | build-time |
| Content store | markdown/MDX + YAML frontmatter in CAW-04's own git repo | source of truth | n/a (not served live) |
| Audit store | sidecar files + hash-chained `_events` ledger | provenance/audit, NEVER served | never |
| API | static JSON + raw `.md` + `index.json`/manifest via Astro endpoints | machine read surface | static files |
| Distribution | `SKILL.md` ⇆ `manifest.json`, `.skill` bundle | agent/loader format | static files |
| MCP | resources view (`resources/list`/`read`) over the same corpus | MCP hosts | static/derived |
| Search | client-side prebuilt index (Pagefind-style) | website search | static index |
| Deploy | static host + CDN behind `SiteAndApiSinkAdapter` | publish | edge-cached static |
| Runtime on public path | **none** | — | — |

## Components

### Language — TypeScript (core + adapters + endpoints)
The hexagonal **core** (normalize, public-safe re-check, redaction, semver assignment, digest, public projection)
and both ports (`ContentSourceAdapter`, `PublishSinkAdapter` — [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md))
are TypeScript so they share types with Astro content-collection schemas and the JSON envelope. The re-check is a
**core module imported by the build**, never inside an adapter, so no source/sink swap can bypass the gate.

- Pin: TODO(open-question: Node.js LTS version) · TODO(open-question: TypeScript version) · package manager
  TODO(open-question: pnpm vs npm).

### Web framework — Astro 5
Content-first SSG. **Content collections** give typed, schema-validated frontmatter whose schema IS the
[ADR-0002](../01-decisions/ADR-0002-content-model.md) entity model. File-based **endpoints** import the same
`getCollection()` data the pages use and serialize it to JSON / raw `.md` at build → one source, two surfaces
([ADR-0006](../01-decisions/ADR-0006-web-stack.md)). Output mode is **static (SSG)**; no SSR adapter on the public
path in v1.

- Pin: TODO(open-question: exact Astro 5.x minor) — pin in `package.json` + lockfile for reproducible builds.

### Docs UI — Starlight
Supplies sidebar nav, the search shell, and per-version routing so navigation is not hand-rolled. Layout is
opinionated; some entities may need custom Astro pages.

- Pin: TODO(open-question: Starlight version compatible with the chosen Astro 5.x).
- TODO(open-question: does Starlight's doc-centric layout/versioning fit Tip/Skill/Workflow/Playbook, or do some
  entities need custom Astro pages — [ADR-0006](../01-decisions/ADR-0006-web-stack.md)).

### Content store — markdown/MDX in CAW-04's own git repo
Source of truth, written by the `ContentSourceAdapter` **after** the core re-check
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). Layout
`src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`; large assets by path/CDN. Diffable PR review
is part of the curator gate. **No headless/DB CMS** — that would add a shared-substrate runtime and a leak surface.

- Versioning: **semver** (public addressable identity) + **content-digest** (`sha256:` over canonical serialization;
  immutability proof + strong `ETag`). `(slug, semver)` frozen forever, never reused.
- Pin: TODO(open-question: canonical serialization spec + digest algorithm/prefix — `sha256:` vs multihash).

### Audit store — sidecar + hash-chained ledger
Audit-only provenance (`origin_ref`, `origin_version`, redaction internals) lives in a **sidecar beside the file**,
loaded for gate checks but **excluded from all served output** (B3 public projection). The hash-chained append-only
`_events` ledger ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)) is the publish
record; git history is the redundant second witness. A test asserts sidecar fields never appear in `dist/`.

### API — static JSON + raw markdown + manifest (Astro endpoints)
Read-only, prebuilt by the same build ([ADR-0007](../01-decisions/ADR-0007-api-design.md)). One canonical resource,
many representations:

```
GET /api/v1/{type}                          list/index (cursor pagination, whitelisted filters)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          all versions (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/manifest.json     distribution manifest (machine form)
GET /api/v1/index.json                      manifest of all items+versions+boundary+links (no bodies)
```
`{type} ∈ tips | skills | workflows | playbooks`. Representations: `text/html` (page), `text/markdown` (body + small
YAML header), `application/json` (envelope). `Accept` header is canonical; `.md`/`.json` suffix aliases are the
edge-cacheable escape hatch. Runtime search + full `Accept`-negotiation are **deferred** (would force a runtime).

### Distribution — SKILL.md / manifest.json / .skill bundle
Two interchangeable encodings of one manifest: **`SKILL.md`** (open Agent Skills shape — required `name`,
`description`; `name` = slug — plus additive CAW-04 governance fields `version`, `boundary`, `provenance`,
`license`) and **`manifest.json`** (canonical machine form). A pinned version downloads as a **`.skill` bundle**
(`SKILL.md`, `manifest.json`, `references/`, `examples/`, `assets/`) keyed by `slug@semver`.

- Pin: TODO(open-question: adopt the `SKILL.md` spec verbatim vs a CAW-04 superset profile — drift risk).
- TODO(open-question: `references/`/`assets/` size limits + secret/virus scan before bundling).

### MCP — resources view
The catalog as an MCP **resources** view (`resources/list` + `resources/read`): `uri = caw04://{type}/{slug}@{semver}`,
`mimeType = text/markdown | application/json`. It is **one `PublishSinkAdapter`** over the same canonical resources —
just another projection, no shared substrate.

- Pin: TODO(open-question: MCP SDK/protocol version; MCP Registry listing in v1 vs a later stub).

### Search — client-side prebuilt index
v1 = Pagefind-style client-side index built into `dist/`; no server. A runtime search endpoint is a documented later
adapter, not v1.

- Pin: TODO(open-question: Pagefind version, or Starlight's bundled search).

### Deploy / CDN — static host behind the sink adapter
SSG `dist/` → static host + CDN; rebuild+deploy is the `SiteAndApiSinkAdapter` action on an approved publish event.
Pinned `/v/{semver}` files served `Cache-Control: public, max-age=31536000, immutable`; moving URLs + `index.json` +
manifests purged on publish/unpublish/redact.

- Pin: TODO(open-question: static host + CDN provider) · TODO(open-question: rebuild trigger — webhook vs
  CI-on-git-push vs scheduled) · TODO(open-question: CDN handling of `Vary: Accept` — suffix aliases as cache-safe path).

## Version-pin summary (fill on first build; do not invent)

| Component | Pin |
|-----------|-----|
| Node.js | TODO(open-question) |
| TypeScript | TODO(open-question) |
| Package manager | TODO(open-question: pnpm vs npm) |
| Astro | TODO(open-question: 5.x minor) |
| Starlight | TODO(open-question) |
| Search (Pagefind/Starlight) | TODO(open-question) |
| MCP SDK | TODO(open-question) |
| Static host + CDN | TODO(open-question) |
| Digest algorithm | TODO(open-question: sha256 vs multihash) |

## Why this stack is public-safe by construction

1. **No public runtime** — every component runs at build time; a public request hits only static files (no path back
   into CAW-02/CAW-03 or any confidential store).
2. **One source, all surfaces** — pages, JSON, raw md, manifest, MCP all serialize the same `getCollection()` corpus,
   so there is no second store to drift out of the gate.
3. **Three backstops** — core re-check (B1) → build invariant `boundary==="public"` (B2) → public projection strips
   sidecar fields (B3); see [./data-flow.md](./data-flow.md).
4. **Nothing shared** — core/adapters/store are CAW-04's own; sinks (web, API, MCP, future) are swappable behind one
   port.

## Open Questions

> Mirror into `../08-research-plan/open-questions.md`. (All version pins above are open until the first build.)

- TODO(open-question: client-side index sufficient for v1 vs server-side query/filter forcing a runtime).
- TODO(open-question: publish a static `/api/v1/openapi.json` description of the read API for agents).
- TODO(open-question: `published_at`/timezone policy — do not invent).

## Implications for runbooks

- **RB (scaffold):** init Astro 5 + Starlight with collection schemas matching [ADR-0002](../01-decisions/ADR-0002-content-model.md);
  commit a lockfile and fill the pin table.
- **RB (core + ports):** TypeScript hexagonal core with the re-check; `ContentSourceAdapter` + `PublishSinkAdapter`
  interfaces and a config-driven registry with documented stubs.
- **RB (endpoints):** build-time JSON / raw md / `index.json` / manifest endpoints via `getCollection()` + the
  `boundary === "public"` assertion.
- **RB (distribution + MCP):** `SKILL.md`/`manifest.json` schema + `.skill` bundling + the MCP resources adapter.
- **RB (deploy):** SSG build → static host/CDN behind the sink; wire the rebuild trigger and cache rules.

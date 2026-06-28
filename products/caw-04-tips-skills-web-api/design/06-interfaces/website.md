# Website — public browse/read surface (Astro + Starlight)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./rest-api.md](./rest-api.md) (the API co-generated from the same source)
  - [./preview-admin.md](./preview-admin.md) (internal curator surface that promotes content to this site)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Describes the **public website** surface: the human browse/read experience over published Tips, Skills, Workflows,
and Playbooks — navigation, per-artifact pages, version routing, tombstones, and (deferred) search. It elaborates
[ADR-0006](../01-decisions/ADR-0006-web-stack.md) (Astro 5 + Starlight, SSG static) and [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md)
(three surfaces). It does NOT define the API resource scheme ([rest-api.md](./rest-api.md)), the content model
([ADR-0002](../01-decisions/ADR-0002-content-model.md)), the gate ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)),
or storage/versioning ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

## Public-safe by construction (the load-bearing property)

The website is a **frozen, vetted, static artifact** with **no request-time path into any internal/upstream store**
([ADR-0006](../01-decisions/ADR-0006-web-stack.md)). Every page is rendered at build time from CAW-04's own git repo,
which only ever contains content that already passed the import re-check ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md))
and the publish gate ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)). Two backstops
guard the public surface:

1. **Build-time invariant** — every emitted page asserts `boundary === "public"`; the build **fails** otherwise.
2. **Public projection** — audit-only provenance fields (`origin_ref`/`origin_version`, the sidecar per
   [ADR-0002](../01-decisions/ADR-0002-content-model.md)) are stripped before render; a test asserts they never appear
   in any HTML output.

There is no login, no comment box, no public write path (brief §10). The site is read-only by construction.

## Information architecture

Top-level navigation is one section per publishable entity type, plus supporting pages.

| Nav section | Route prefix | Contents |
|---|---|---|
| Tips | `/tips/` | atomic, single-idea practice notes |
| Skills | `/skills/` | reusable units w/ inputs/outputs, preconditions, examples |
| Workflows | `/workflows/` | ordered compositions of pinned skills |
| Playbooks | `/playbooks/` | curated bundles (`contains[]`) for a scenario |
| About / Safety | `/about/`, `/safety/` | what "public-safe" + "validated" mean; provenance policy |
| API docs | `/api-docs/` | human-readable guide to [rest-api.md](./rest-api.md); links to `index.json`, `SKILL.md`, MCP |

`Example`, `Source`, `SafetyBoundary`, and `Version` are **not** top-level nav. Examples render inline on the parent
artifact page; Source/SafetyBoundary surface as metadata blocks; Version drives the version selector (below).

### Sidebar (Starlight)

Starlight supplies the left sidebar, auto-built per section. Within a type, list items are grouped by `tag` and
sorted by `title`. Each entry shows title + one-line `summary`. Deprecated-but-still-published items get a badge;
unpublished/redacted items are absent (excluded from sidebar, sitemap, and search index).

## Artifact page anatomy

A single Astro/Starlight page template per type renders one artifact at its **latest** published version.

```
┌─ Title (h1)  + type badge + version pill (semver) + status badge ─────────┐
│ Summary (one paragraph)                                                    │
│ ── Metadata card ──────────────────────────────────────────────────────  │
│   Inputs · Outputs · Preconditions   (Skills/Workflows)                    │
│   Provenance: source_product, validated ✓, public_safe_recheck: passed    │
│   Boundary: public      License: TODO(open-question: license field)        │
│   Version: <semver>  · digest: <short>  · published_at: <ts>              │
│ ── Body (rendered markdown/MDX) ───────────────────────────────────────── │
│   Steps[] (Workflows, each linking the pinned skill id@version)            │
│   contains[] (Playbooks, each linking the member artifact)                 │
│ ── Examples (inline) ──────────────────────────────────────────────────── │
│ ── "Get this" panel: links to .md / .json / manifest.json / .skill ─────── │
│ ── Version history (selector → immutable version pages) ──────────────────│
└───────────────────────────────────────────────────────────────────────── ┘
```

The "Get this" panel cross-links the same artifact's other representations served by [rest-api.md](./rest-api.md):
`Accept`-negotiated content plus the `.md`/`.json` suffix aliases, the `manifest.json`, and the `.skill` bundle. This
is how a human discovers the agent-facing forms.

## Version routing

Surfaces the [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md) identity model directly in URLs.

| URL | Meaning | Caching | `rel=canonical` |
|---|---|---|---|
| `/{type}/{slug}/` | **moving** — renders latest published version | revalidate / short | self |
| `/{type}/{slug}/v/{semver}/` | **immutable** — one frozen version | `public, max-age=31536000, immutable` | → moving URL |
| `/{type}/{slug}/versions/` | version index (list of all semvers + status) | short | self |

- Published `(slug, semver)` is **frozen forever**; an edit is a new version page, never an in-place change.
- The version selector on the moving page lists every version; selecting one navigates to its immutable page.
- A reader landing on an old immutable page sees a non-blocking banner: "A newer version exists → latest".

### Tombstones (unpublish / redact)

When an artifact or a specific version is unpublished or redacted ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md),
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)) the address renders an **HTTP 410 Gone tombstone
page**, not a 404 and not the old content:

```
410 Gone — this artifact (or version) was withdrawn.
  reason: <deprecated | boundary-changed | redacted>     (no confidential detail)
  superseded_by: /{type}/{slug}/v/{newer-semver}/         (optional)
```

Tombstoned addresses are excluded from the sidebar, sitemap, and search index. Static hosting serves the 410 via a
per-route status mapping emitted by the build. TODO(open-question: CDN/edge purge time-to-purge bound for an already
edge-cached page — shared with [ADR-0006](../01-decisions/ADR-0006-web-stack.md)/[rest-api.md](./rest-api.md)).

## Search (deferred to a client-side index)

v1 search = a **prebuilt client-side index** (Pagefind-style), generated at build over the same vetted corpus
([ADR-0006](../01-decisions/ADR-0006-web-stack.md)). It indexes only `boundary=public` rendered pages, so it cannot
leak anything the pages don't already show. No query reaches a server.

| Aspect | v1 (now) | Deferred |
|---|---|---|
| Index | static, built into `dist/`, loaded in-browser | server-side query endpoint |
| Scope | published latest pages (+ optionally version pages) | cross-version / faceted server search |
| Privacy | no network query; nothing logged | n/a |

A runtime/server search endpoint is a documented later `PublishSinkAdapter`-adjacent capability — it would force a
runtime substrate and is therefore explicitly out of v1. TODO(open-question: is a client-side index sufficient at
catalog scale, or do agents need server-side filter — shared with [rest-api.md](./rest-api.md)).

## Cross-surface parity

The website and the REST API are **two projections of one source** (`getCollection()` data, [ADR-0006](../01-decisions/ADR-0006-web-stack.md)).
Every HTML page has a 1:1 markdown and JSON counterpart described in [rest-api.md](./rest-api.md); provenance and the
public-safe boundary travel with all three. The site never holds content the API lacks (or vice versa).

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md). Key items:
- TODO(open-question: does Starlight's doc-centric layout fit all four entity types, or do some need custom Astro pages — [ADR-0006](../01-decisions/ADR-0006-web-stack.md)).
- TODO(open-question: public `license` field rendering + default SPDX id — [ADR-0007](../01-decisions/ADR-0007-api-design.md)).
- TODO(open-question: `published_at` timestamp + timezone display policy — do not invent).
- TODO(open-question: client-side search sufficiency vs server search).
- TODO(open-question: edge-cache purge bound on unpublish/redact).

## Implications for runbooks

- Scaffold Astro 5 + Starlight with one page template per entity type bound to the [ADR-0002](../01-decisions/ADR-0002-content-model.md) collection schema.
- Implement moving vs immutable version routes + version selector + `rel=canonical`/`Cache-Control` rules.
- Emit 410 tombstone pages from the build; exclude tombstoned + non-`public` items from sidebar/sitemap/search.
- Wire the build-time `boundary === "public"` assertion and the public-projection strip test into CI.
- Build the Pagefind-style client-side index over published pages only; leave a documented stub for server search.

# Rendering — Web + API parity from one source (Astro SSG)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-entities.md](./content-entities.md) (the entities + public projection being rendered)
  - [./versioning-and-immutability.md](./versioning-and-immutability.md) (URL/resource scheme, tombstones)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md) (Astro 5 + Starlight, SSG)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (the decision this elaborates)
  - [../02-research/skills-distribution-and-api-resources.md](../02-research/skills-distribution-and-api-resources.md)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc describes **how one markdown/MDX source becomes every published representation** — HTML pages, static JSON,
raw markdown, `manifest.json` / `SKILL.md`, the `index.json` manifest, and the MCP resources view — through a single
**Astro 5 + Starlight SSG** build. It elaborates [ADR-0006](../01-decisions/ADR-0006-web-stack.md) and
[ADR-0007](../01-decisions/ADR-0007-api-design.md). It does NOT redefine the resource/URL scheme
([versioning-and-immutability](./versioning-and-immutability.md)), the entity fields
([content-entities](./content-entities.md)), or the gate ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).
The property elaborated: **web/API parity is by construction — every representation is a projection of the same
`getCollection()` corpus, so a frozen vetted static artifact has no live path back into any internal store.**

## 1. The one-source pipeline

```
CAW-02 / CAW-03 import (ContentSourceAdapter)
        │  cross-boundary; public-safe RE-CHECK runs in CORE here (deny-by-default)
        ▼
CAW-04 git repo: src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
        │            + <semver>.audit.json  (sidecar — NEVER built into output)
        ▼
Astro Content Collections  ── typed, schema-validated load → ONE in-memory corpus (getCollection)
        ├──────────► HTML pages     src/pages/{type}/[slug]/[...].astro       (Starlight UI)
        ├──────────► JSON resources src/pages/api/v1/{type}/[slug]/...json.ts (Response JSON)
        ├──────────► Raw markdown   src/pages/api/v1/{type}/[slug]/...md.ts   (Response markdown)
        ├──────────► Manifests      manifest.json / SKILL.md per artifact
        ├──────────► index.json     src/pages/api/v1/index.json.ts (all items+versions+boundary+links)
        └──────────► MCP view       resources/list + resources/read (PublishSinkAdapter)
        ▼
astro build (SSG) → dist/ static files (HTML + .json + .md)  →  CDN
```

Every emitter imports the **same** `getCollection()` data the pages use, so the API is a *serialization of the
rendered corpus*. There is no second content store and no drift. The website build, REST API, and MCP view are three
**PublishSinkAdapters** over one core ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).

## 2. Representations from one resource

| Representation | Built artifact | Consumer | Notes |
|---|---|---|---|
| **HTML** | `/{type}/{slug}/` (+ `/v/{semver}/`) | human reader | Starlight nav/search/version routing |
| **JSON** | `/api/v1/{type}/{slug}.json` (+ `/versions/{semver}.json`) | HTTP agent, MCP | structured envelope (public projection) |
| **Raw markdown** | `/api/v1/{type}/{slug}.md` (+ `/versions/{semver}.md`) | agent feeding an LLM | body + small YAML header; ~80% fewer tokens than HTML |
| **manifest.json** | `/api/v1/{type}/{slug}/manifest.json` | skill loaders, MCP | canonical machine form |
| **SKILL.md** | inside the `.skill` bundle | Claude-style loaders | same fields as manifest, frontmatter+body |
| **index.json** | `/api/v1/index.json` | crawlers, agents | all items+versions+boundary+links, no bodies |

### 2.1 Content negotiation

Per [ADR-0007](../01-decisions/ADR-0007-api-design.md): **`Accept` header is the canonical mechanism; `.md` / `.json`
suffix aliases are the secondary, edge-cacheable escape hatch.** Because the build is SSG (no per-request server),
the suffix files are the load-bearing static artifacts; an `Accept`-header rule is a thin CDN/edge layer over them.

| `Accept` | Suffix alias | Served |
|---|---|---|
| `text/html` | (none / `/`) | rendered Starlight page (website host default) |
| `text/markdown` | `.md` | body + YAML frontmatter header (agent content fetch) |
| `application/json` | `.json` | structured envelope (machine reasoning; `api.` host default) |

Set `Vary: Accept`, emit `Content-Type` explicitly. TODO(open-question: CDN behaviour for `Vary: Accept` — some CDNs
handle it poorly; suffix aliases are the cache-safe path — from [ADR-0007](../01-decisions/ADR-0007-api-design.md)).

### 2.2 Canonical JSON envelope (public projection)

```jsonc
{
  "id": "triage-incident",
  "type": "skill",
  "version": "2.1.0",
  "title": "Triage an incoming incident",
  "summary": "One-line public-safe description.",
  "boundary": "public",                 // asserted after the public-safe re-check
  "tags": ["ops", "incident-response"],
  "inputs":  [{ "name": "alert", "type": "string", "required": true }],
  "outputs": [{ "name": "triage_report", "type": "markdown" }],
  "preconditions": ["a non-empty alert payload is provided"],
  "body": { "format": "markdown", "ref": "/api/v1/skills/triage-incident.md" },  // by REF in lists
  "provenance": {                        // reference only — NO internal payload (sidecar stays unserved)
    "source_product": "CAW-03",
    "validated": true,
    "public_safe_recheck": "passed"
  },
  "links": {
    "self":     "/api/v1/skills/triage-incident",
    "pinned":   "/api/v1/skills/triage-incident/versions/2.1.0",
    "html":     "https://.../skills/triage-incident",
    "manifest": "/api/v1/skills/triage-incident/manifest.json"
  },
  "digest": "sha256:cc…",
  "published_at": "TODO(open-question: timestamp policy)"
}
```

`body` is delivered **by reference** in lists/JSON (keeps lists light) and **inlined** in the markdown
representation. Workflows add ordered `steps[]` (each pins a skill `id@version`); Playbooks add `contains[]`. Note
the public projection ([content-entities](./content-entities.md) §3): `origin_ref` / `origin_version` are absent —
the audit sidecar never enters the build.

## 3. Distribution format — manifest, bundle, MCP

Two interchangeable encodings of **one** manifest ([ADR-0007](../01-decisions/ADR-0007-api-design.md)):

**(a) `SKILL.md`** — open Agent Skills shape (required `name`=slug, `description`) + additive CAW-04 governance
fields (`version`, `boundary`, `provenance`, `license`), ignored by loaders that don't know them.

**(b) `manifest.json`** — the same fields as the §2.2 envelope; the canonical machine form and the body MCP reads.

A pinned version downloads as a **`.skill` bundle** keyed by `slug@semver` — self-contained, provenance-stamped,
offline-runnable:

```
triage-incident@2.1.0/
  SKILL.md        # manifest (a)
  manifest.json   # manifest (b) — identical fields
  references/     # supporting docs loaded into agent context
  examples/       # Example sub-resources (each public-safe; own boundary)
  assets/         # templates (large assets by path, brief §6)
```

Workflows add `workflow.json` listing ordered `{skill_id, version}` steps for reproducibility. TODO(open-question:
`references/` / `assets/` size limits + secret/virus scan before bundling — public-safe, from
[ADR-0007](../01-decisions/ADR-0007-api-design.md)).

### 3.1 MCP resources view

Expose the catalog as an MCP **resources** view (`resources/list` + `resources/read`) — one more
PublishSinkAdapter over the same canonical resources, no shared substrate:

| MCP concept | CAW-04 mapping |
|---|---|
| Resource `uri` | `caw04://{type}/{slug}@{semver}` |
| `name` / `description` | manifest `title` / `summary` |
| `mimeType` | `text/markdown` (body) or `application/json` (manifest) |
| `resources/read` payload | the `.md` body or `manifest.json` |

`/llms.txt` (markdown index of top artifacts) is published as a convenience entry point — nice-to-have; the
load-bearing mechanism is per-URL markdown via content negotiation. TODO(open-question: MCP Registry listing in v1
vs a later PublishSinkAdapter stub — from [ADR-0007](../01-decisions/ADR-0007-api-design.md)).

## 4. Lists, filters, search

Static delivery means these are **precomputed at build**, not request-time
([ADR-0006](../01-decisions/ADR-0006-web-stack.md)).

| Concern | v1 mechanism |
|---|---|
| **Pagination** | cursor + stable envelope `{ data:[refs], pagination:{ next_cursor, has_more, total_count } }`; `next` also as a `Link` header. `total_count` best-effort. |
| **Filtering** | whitelisted first-class fields only: `type`, `tag`, `source_product`, `q`, `updated_since`, `sort`. **`boundary` is NOT a filter** — offering it would imply non-public values exist. |
| **Search** | client-side / prebuilt index (Pagefind-style) or a static `search-index.json`; a runtime search endpoint is a deferred, optional adapter. |

## 5. Public-safe-by-construction enforcement (the build invariant)

The gate is enforced **at build and at every emit**, not trusted from upstream — the API-side backstop behind the
import re-check ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)) and the publish gate
([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).

```text
for every record entering ANY representation (HTML | JSON | MD | manifest | MCP):
    assert boundary == "public"            ∧
           public_safe_recheck == "passed" ∧
           toPublicProjection(record) contains NO audit-only field
    else  → FAIL THE BUILD (do not emit)
```

This is why the deployed corpus is a **frozen vetted static file set with no live path to internal stores** — the
strongest reading of brief §11. Removed resources emit **410 + machine-readable tombstone** bodies, not 404
([versioning-and-immutability](./versioning-and-immutability.md) §3).

## 6. Open Questions

Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):

- TODO(open-question: ship `.json`/`.md` suffix routes only, or also an edge `Accept`-header rule — introduces an edge layer?)
- TODO(open-question: is a prebuilt client-side search index enough for v1, or do agents need a server-side query endpoint?)
- TODO(open-question: publish an OpenAPI/JSON-Schema description at a static `/api/v1/openapi.json` for agents?)
- TODO(open-question: does Starlight's doc-centric layout/versioning fit all four entity types, or need custom Astro pages?)
- TODO(open-question: rebuild trigger for the PublishSinkAdapter on approve/update/unpublish — webhook vs CI vs scheduled.)
- TODO(open-question: adopt the Agent Skills `SKILL.md` spec verbatim vs a CAW-04 superset profile — drift risk.)
- TODO(open-question: does `total_count` stay cheap as the catalog grows, or drop it for pure cursor?)

## 7. Implications for runbooks

- **Scaffold runbook:** Astro 5 + Starlight; content-collection schemas matching the [content-entities](./content-entities.md) frontmatter.
- **API endpoints runbook:** build-time endpoints for per-item/per-version JSON + raw markdown + collection lists +
  `index.json`, all reading via `getCollection()`; cursor envelope; whitelisted filters; `Accept` + `.md`/`.json`
  negotiation with `Vary: Accept`; default format per host.
- **Manifest runbook:** `SKILL.md` frontmatter schema ⇆ `manifest.json` JSON Schema; the emit-time validator
  asserting `boundary==public` ∧ `public_safe_recheck==passed` ∧ no audit field in the projection.
- **Bundle runbook:** `.skill` packaging keyed by `slug@semver` with a content scan.
- **MCP adapter runbook:** `resources/list` + `resources/read` over the canonical resources; registry-listing stub.
- **CI safety check:** fail the build if any non-public-boundary item, or any audit-only field, would reach web or API.

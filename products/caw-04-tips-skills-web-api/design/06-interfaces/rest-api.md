# REST API — read-only resource model (one resource, many representations)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./website.md](./website.md) (co-generated from the same source; web/API parity)
  - [./preview-admin.md](./preview-admin.md) (internal-only; no public write)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (the API contract this elaborates)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md) (prebuilt static JSON + raw md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (semver+digest, 410 tombstones)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (the JSON envelope fields + public projection)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (boundary=public only)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Specifies the **read-only REST API** surface: the resource tree, the canonical JSON envelope, raw-markdown form,
content negotiation, version addressing, the `index.json` manifest, pagination, and filtering. It elaborates
[ADR-0007](../01-decisions/ADR-0007-api-design.md) for builders. It does NOT re-decide the stack ([ADR-0006](../01-decisions/ADR-0006-web-stack.md)),
the content model ([ADR-0002](../01-decisions/ADR-0002-content-model.md)), or the gate ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md));
the `.skill` bundle and MCP view are summarized here and owned by [ADR-0007](../01-decisions/ADR-0007-api-design.md).

## Public-safe by construction

The API is **prebuilt static JSON + raw markdown** emitted by the same Astro build as the website
([ADR-0006](../01-decisions/ADR-0006-web-stack.md)) — there is **no runtime substrate and no request-time path into
internal stores**. Every response is a frozen file over a CDN. Before any representation is emitted, the build asserts
`boundary == "public"` **and** `provenance.public_safe_recheck == passed`, else it fails. Audit-only provenance fields
live in a sidecar and **never serialize** to any representation ([ADR-0002](../01-decisions/ADR-0002-content-model.md));
a test enforces this. `boundary` is **not** a filter parameter — exposing it as a filter would imply non-public values
exist.

## Resource tree

Contract version is the path prefix `/api/v1`, orthogonal to content `{semver}`. `{type} ∈ tips | skills | workflows | playbooks`.

```
GET /api/v1/{type}                          list/index (latest of each; cursor pagination, whitelisted filters)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable, pinned version
GET /api/v1/{type}/{slug}/examples          Example sub-resource
GET /api/v1/{type}/{slug}/manifest.json     distribution manifest (machine form)
GET /api/v1/index.json                      manifest of ALL items+versions+boundary+links (no bodies)
GET /api/v1/search                          cross-type lightweight refs (powers website global search)
GET /api/v1/openapi.json                    TODO(open-question: ship a static OpenAPI description)
```

`Source` is **never** a standalone resource — provenance is an embedded *reference* only, never a fetchable internal
document (brief §11). `SafetyBoundary` is an embedded asserted field, always `public`. Removed resources/versions
return **HTTP 410 Gone** with a machine-readable tombstone body (never 404), per [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md).

## Canonical JSON envelope

The public projection of the [ADR-0002](../01-decisions/ADR-0002-content-model.md) entity. Lists deliver `body` **by
reference** to stay light; the markdown representation inlines it.

```jsonc
{
  "id": "skills/safe-prompt-redaction",
  "type": "skill",
  "version": "1.4.0",                      // resolved semver
  "title": "Safe prompt redaction",
  "summary": "Strip identifiers before sending text to an LLM.",
  "boundary": "public",                    // always "public" on this surface
  "tags": ["safety", "redaction"],
  "inputs":  [{ "name": "text", "type": "string", "required": true }],
  "outputs": [{ "name": "redacted_text", "type": "string" }],
  "preconditions": ["caller has the raw text"],
  "body": { "ref": "/api/v1/skills/safe-prompt-redaction.md" }, // inlined in md rep
  "provenance": {                          // reference only — NO origin_ref/origin_version
    "source_product": "CAW-03",
    "source_ref": "skills-registry/safe-prompt-redaction",
    "validated": true,
    "public_safe_recheck": "passed"
  },
  "links": {
    "self":     "/api/v1/skills/safe-prompt-redaction",
    "pinned":   "/api/v1/skills/safe-prompt-redaction/versions/1.4.0",
    "html":     "/skills/safe-prompt-redaction/",
    "manifest": "/api/v1/skills/safe-prompt-redaction/manifest.json"
  },
  "digest": "sha256:…",                    // immutability proof
  "published_at": "TODO(open-question: timestamp+tz policy)"
}
```

Type extensions: **Workflows** add ordered `steps[]`, each pinning a skill `id@version`; **Playbooks** add `contains[]`
member refs. Tips carry the common fields only.

## Content negotiation

Same canonical resource, three representations ([ADR-0007](../01-decisions/ADR-0007-api-design.md)).

| `Accept` | Suffix alias | Body | Primary consumer |
|---|---|---|---|
| `text/html` | — | rendered page (see [website.md](./website.md)) | human (website host default) |
| `text/markdown` | `.md` | artifact body + small YAML frontmatter (manifest fields) | HTTP agent fetching *content* (~80% fewer tokens than HTML) |
| `application/json` | `.json` | the envelope above | MCP / programmatic (API host default) |

- `Accept` header is the **canonical** mechanism; `.md`/`.json` suffixes are the **secondary, edge-cacheable** alias
  for dumb/static clients. Set `Vary: Accept`; emit `Content-Type` explicitly.
- **Integrity:** every version response carries `digest` in the body and a strong `ETag` derived from it; `latest`
  responses include the resolved `semver` + `digest` so a caller can deterministically re-pin
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- **CORS** open for public read. No auth, no rate-limit identity (static CDN).
- TODO(open-question: some CDNs handle `Vary: Accept` poorly — suffix aliases are the cache-safe path, per [ADR-0007](../01-decisions/ADR-0007-api-design.md)).

## Version addressing

| URL | Meaning | Cache |
|---|---|---|
| `/api/v1/{type}/{slug}` | latest published (moving); body carries resolved `semver`+`digest` | short / revalidate |
| `/api/v1/{type}/{slug}/versions/{semver}` | immutable pin; frozen forever | `public, max-age=31536000, immutable` |
| `/api/v1/{type}/{slug}/versions` | list `[{semver, digest, published_at, status}]` | short |

Published `(slug, semver)` is immutable; edits create new versions; boundary changes deprecate/unpublish/redact via a
410 tombstone ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

```jsonc
// HTTP 410 Gone tombstone body
{ "status": 410, "id": "skills/old-thing", "version": "0.9.0",
  "tombstone": true, "reason": "boundary-changed",   // no confidential detail
  "superseded_by": "/api/v1/skills/old-thing/versions/1.0.0" }
```

## index.json — the catalog manifest

A single bodiless manifest of everything published — the agent/crawler entry point.

```jsonc
{
  "api_version": "v1",
  "generated_at": "TODO(timestamp policy)",
  "items": [
    { "id": "skills/safe-prompt-redaction", "type": "skill", "latest": "1.4.0",
      "boundary": "public", "digest": "sha256:…",
      "versions": ["1.4.0", "1.3.0", "1.0.0"],
      "links": { "self": "/api/v1/skills/safe-prompt-redaction",
                 "manifest": "/api/v1/skills/safe-prompt-redaction/manifest.json" } }
  ]
}
```

Companion discovery entry points: `/llms.txt` (markdown index of top artifacts, nice-to-have) and the MCP resources
view (`uri = caw04://{type}/{slug}@{semver}`) — both projections of the same corpus, each a `PublishSinkAdapter`
([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)), no shared substrate.

## Pagination & filtering (precomputed, static)

Because delivery is static ([ADR-0006](../01-decisions/ADR-0006-web-stack.md)), list pages are **precomputed**.

**Pagination** — cursor-based, stable envelope (stable under publishes; agent-loop friendly):

```jsonc
{ "data": [ /* lightweight refs (no bodies) */ ],
  "pagination": { "next_cursor": "…", "has_more": true, "total_count": 42 } }
```

`next` is also emitted as a fully-formed `Link` header. `total_count` is best-effort. TODO(open-question: keep
`total_count` cheap at scale or drop for pure cursor — [ADR-0007](../01-decisions/ADR-0007-api-design.md)).

**Filtering** — whitelisted first-class fields only (cacheable; arbitrary DSL rejected):

| Param | Meaning |
|---|---|
| `type` | tip / skill / workflow / playbook |
| `tag` | match a tag |
| `source_product` | provenance origin (e.g. CAW-02, CAW-03) — reference label only |
| `q` | lightweight keyword (precomputed; see `/search`) |
| `updated_since` | items changed after a timestamp |
| `sort` | whitelisted sort key |

`boundary` is deliberately **not** a filter. Runtime/server-side search is deferred — a documented later capability
that would introduce a runtime substrate (shared open question with [website.md](./website.md)).

## Distribution format (summary)

A published artifact is one manifest in two interchangeable encodings ([ADR-0007](../01-decisions/ADR-0007-api-design.md)):
`SKILL.md` (open Agent Skills frontmatter+body, `name`=slug, plus additive governance fields `version`/`boundary`/
`provenance`/`license`) and `manifest.json` (same fields, canonical machine form). A pinned version downloads as a
`.skill` bundle keyed by `slug@semver` (`SKILL.md`, `manifest.json`, `references/`, `examples/`, `assets/`),
provenance-stamped and offline-runnable; Workflows add `workflow.json` with ordered `{skill_id, version}` steps.

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- TODO(open-question: adopt `SKILL.md` spec verbatim vs CAW-04 superset; drift risk).
- TODO(open-question: public `license` field + default SPDX id + inheritance from upstream Source).
- TODO(open-question: `published_at`/`updated_at` timestamp + timezone policy).
- TODO(open-question: `total_count` cost at scale).
- TODO(open-question: ship static `/api/v1/openapi.json`).
- TODO(open-question: `Vary: Accept` CDN behavior; suffix alias as cache-safe path).
- TODO(open-question: `references/`/`assets/` size limits + secret/virus scan before bundling).
- TODO(open-question: workflow step pin exact `id@version` vs range/`latest`).

## Implications for runbooks

- Generate Astro file-based endpoints for every route from the same `getCollection()` data as the pages.
- Emit JSON envelope + raw `.md` per artifact/version; wire `Vary: Accept`, `ETag`/`digest`, `Cache-Control` per route.
- Precompute list/index pages with cursor envelope, `Link` header, and whitelisted filters; build `index.json`, `/llms.txt`.
- Wire the emit-time `boundary==public ∧ public_safe_recheck==passed` validator + the public-projection (no-sidecar) test.
- Emit 410 tombstone bodies for removed resources/versions; build the `.skill` bundle packaging + MCP `resources/*` adapter.

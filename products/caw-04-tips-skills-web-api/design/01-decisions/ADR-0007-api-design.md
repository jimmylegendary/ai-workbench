# ADR-0007: REST API — one canonical resource, many representations; SKILL.md/manifest distribution

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§3 agents fetch via API, §4 web+REST, §5 immutable versions)
  - [../02-research/skills-distribution-and-api-resources.md](../02-research/skills-distribution-and-api-resources.md) (research this ADR ratifies)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack.md)
  - [./ADR-0006-web-stack.md](./ADR-0006-web-stack.md) (API is co-generated from the same Astro content collections)
  - [./ADR-0005-storage-and-versioning.md](./ADR-0005-storage-and-versioning.md) (semver+digest identity, 410 tombstones)
  - [./ADR-0002-content-model.md](./ADR-0002-content-model.md) (the JSON envelope fields)
  - [./ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate.md) (`boundary=public` only, edge enforcement)
  - [./ADR-0004-import-and-ports.md](./ADR-0004-import-and-ports.md) (REST + MCP views are PublishSinkAdapters)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

Three consumer classes pull the **same** published artifact and each needs a different representation: a human
reader (HTML, via the website), an HTTP agent (low-token markdown or JSON), and an MCP host (JSON resource catalog)
— brief §3. The API is **read-only** (publish is curator-only, out of band — brief §10) and serves the same vetted,
public-safe corpus as the website ([ADR-0006](./ADR-0006-web-stack.md)), with immutable, addressable versions
(brief §5, [ADR-0005](./ADR-0005-storage-and-versioning.md)). Design rule: **one canonical resource, many
representations** — HTML/markdown/JSON are projections selected by content negotiation, never separate sources of
truth, so provenance + safety boundary stay attached to every representation.

## Options considered

| Decision point | Options | Chosen | Why |
|---|---|---|---|
| Resource identity | per-format sources vs one canonical resource, many representations | **one canonical resource, many representations** | provenance + `boundary=public` stay attached to every projection |
| Version addressing | query `?version=` vs path segments | **`/{id}` = latest (moving); `/{id}/versions/{semver}` = immutable pin** | cacheable, addressable, brief §5; agents pin known-good |
| Content negotiation | `Accept` header vs `.md`/`.json` suffix vs `?format=` | **`Accept` header (primary, canonical) + `.md`/`.json` suffix (secondary alias)** | HTTP-native + shareable/edge-cacheable; static-file friendly for agents |
| Pagination | offset/limit vs cursor/keyset | **cursor + stable envelope (+ `Link` header)** | stable under publishes; agent-loop friendly |
| Filtering | arbitrary DSL vs whitelisted first-class fields | **whitelisted fields only** (`type`,`tag`,`source_product`,`q`,`updated_since`,`sort`) | cacheable; `boundary` is NOT a filter (would imply non-public values exist) |
| Manifest format | custom vs open Agent Skills `SKILL.md` | **`SKILL.md` (frontmatter+body) ⇆ `manifest.json`, same fields** | drops into Claude-style loaders + MCP/JSON clients |
| Catalog discovery | REST only vs REST + MCP + `/llms.txt` | **all three** | covers HTTP agents, MCP hosts, crawlers |

## Decision

**A read-only REST API, prebuilt as static JSON + raw markdown by the same Astro build ([ADR-0006](./ADR-0006-web-stack.md)),
exposing one canonical resource per artifact in HTML/markdown/JSON, plus a `SKILL.md`/`manifest.json` distribution
format and an MCP resources view.**

**Resource model** — resources map 1:1 to the [ADR-0002](./ADR-0002-content-model.md) entities; the API
contract version is the prefix `/api/v1`, kept **orthogonal** to a content `{semver}`:

```
GET /api/v1/{type}                          list/index (latest of each; cursor pagination, whitelisted filters)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/examples          Example sub-resource
GET /api/v1/{type}/{slug}/manifest.json     the distribution manifest (machine form)
GET /api/v1/index.json                      manifest of all items+versions+boundary+links (no bodies)
GET /api/v1/search                          cross-type lightweight refs (website global search)
```
`{type} ∈ tips | skills | workflows | playbooks`. `Source` is **never a standalone resource** — provenance is an
embedded *reference* (`source_product`, `source_ref`, `validated`, `public_safe_recheck`), never a fetchable internal
document (brief §11). `SafetyBoundary` is an embedded asserted field, always `public` on this surface. Removed
resources return **HTTP 410 Gone** with a machine-readable tombstone body (not 404), per [ADR-0005](./ADR-0005-storage-and-versioning.md).

**Canonical JSON envelope** (the [ADR-0002](./ADR-0002-content-model.md) public projection): `id`,
`type`, `version`, `title`, `summary`, `boundary:"public"`, `tags`, `inputs[]`, `outputs[]`, `preconditions[]`,
`body` (by `ref` in lists, inlined when fetched as markdown), `provenance` (reference only), `links`
(`self`/`pinned`/`html`/`manifest`), `digest`, `published_at`. Workflows add ordered `steps[]` (each pins a skill
`id@version`); Playbooks add `contains[]`. **Lists deliver `body` by reference** to stay light; the markdown
representation inlines it.

**Content negotiation** — same resource, three representations:
- `text/html` → rendered page (website host default).
- `text/markdown` → artifact body + a small YAML frontmatter header (the manifest fields); what an agent fetching
  *content* gets (~80% fewer tokens than HTML). Agents (Claude Code / OpenCode) send `Accept: text/markdown` today.
- `application/json` → the structured envelope above (machine reasoning, lists, MCP; `api.` host default).

`Accept` header is the canonical mechanism; `.md`/`.json` suffix aliases are the secondary, edge-cacheable escape
hatch for dumb clients. Set `Vary: Accept`, emit `Content-Type` explicitly. **Integrity:** every version response
carries `digest` in the body and a strong `ETag` derived from it; `latest` responses include the resolved `semver` +
`digest` so a caller can deterministically re-pin ([ADR-0005](./ADR-0005-storage-and-versioning.md)). CORS open for
public read.

**Pagination** — cursor-based with a stable envelope `{ data:[refs], pagination:{ next_cursor, has_more,
total_count } }`; `next` also as a fully-formed `Link` header. `total_count` best-effort.

**Skill/Workflow distribution format** — a published artifact is distributed as a **manifest envelope** in two
interchangeable encodings of one manifest:
- **(a) `SKILL.md`** — open Agent Skills shape (required `name`, `description`; `name` = artifact slug) + additive
  CAW-04 governance fields (`version`, `boundary`, `provenance`, `license`), ignored by loaders that don't know them.
- **(b) `manifest.json`** — the same fields as the JSON envelope, served at `/api/v1/{type}/{slug}/manifest.json`;
  the canonical machine form and the body referenced by MCP resources.

A pinned version is downloadable as a **`.skill` bundle** (folder convention: `SKILL.md`, `manifest.json`,
`references/`, `examples/`, `assets/`) keyed by `slug@semver` — self-contained, provenance-stamped, offline-runnable.
Workflows add a `workflow.json` listing ordered `{skill_id, version}` steps for reproducibility.

**MCP discoverability** — expose the catalog as an MCP **resources** view (`resources/list` + `resources/read`):
`uri = caw04://{type}/{slug}@{semver}`, `name/description` = manifest `title/summary`, `mimeType =
text/markdown | application/json`. The MCP view is **one `PublishSinkAdapter`** ([ADR-0004](./ADR-0004-import-and-ports.md))
over the same canonical resources — alongside the website + REST API sinks. No shared substrate; MCP is just another
projection. `/llms.txt` (markdown index of top artifacts) is published as a convenience entry point, treated as
nice-to-have (the load-bearing mechanism is per-URL markdown via content negotiation).

**Edge enforcement of the gate** — before any representation is emitted, a validator asserts `boundary == "public"`
and `provenance.public_safe_recheck == passed` (the [ADR-0006](./ADR-0006-web-stack.md) build-time invariant applied
to every endpoint). This is the API-side backstop behind the import re-check ([ADR-0004](./ADR-0004-import-and-ports.md))
and the publish gate ([ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate.md)).

## Consequences

- **Easy:** humans, HTTP agents, and MCP hosts reuse one corpus; provenance + boundary travel with every
  representation; pinning by `semver` (compat) or `digest` (bytes) is deterministic.
- **Easy:** static JSON + `.md` files are trivially CDN-cacheable; no runtime substrate on the public path
  ([ADR-0006](./ADR-0006-web-stack.md)).
- **Hard / cost:** static delivery means filters/pagination are precomputed and search starts client-side; `Vary:
  Accept` needs CDN care; the `SKILL.md`/MCP shapes track external specs that may drift.
- **Follow-on runbooks:** API routes + cursor envelope + whitelisted filters + `Accept`/`.md` negotiation (`Vary:
  Accept`, default format per host); the `SKILL.md` frontmatter schema + `manifest.json` JSON Schema + a validator
  asserting `boundary==public` ∧ `public_safe_recheck==passed` before emit; the `.skill` bundle packaging with a
  content scan; the MCP `resources/*` adapter + a registry-listing stub; 410 + machine-readable tombstone bodies for
  removed resources ([ADR-0005](./ADR-0005-storage-and-versioning.md)).

## Open questions / revisit triggers

- TODO(open-question: adopt the open Agent Skills `SKILL.md` spec verbatim vs a CAW-04 superset profile; drift risk).
- TODO(open-question: per-artifact public `license` field — required for redistribution, and the default SPDX id;
  how it inherits from the upstream Source). Coordinated with [ADR-0002](./ADR-0002-content-model.md).
- TODO(open-question: `published_at`/`updated_at` timestamp + timezone policy — do not invent).
- TODO(open-question: does `total_count` stay cheap as the catalog grows, or drop it for pure cursor).
- TODO(open-question: MCP Registry listing in v1 scope vs a later PublishSinkAdapter stub only).
- TODO(open-question: `references/`/`assets/` size limits + secret/virus scan before bundling — public-safe).
- TODO(open-question: CDN behavior for `Vary: Accept`; some CDNs handle it poorly — suffix aliases as the cache-safe path).
- TODO(open-question: whether to publish an OpenAPI/JSON-Schema description of the read API at a static
  `/api/v1/openapi.json` for agents).
- TODO(open-question: workflow step refs across versions — pin exact `id@version` vs allow range/`latest`).
- **Revisit trigger:** agent query needs outgrowing static (server-side filter/search) would introduce a runtime
  search endpoint — behind the same `PublishSinkAdapter` seam, reopening the static-delivery decision.

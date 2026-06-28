# RB-041: Build the read-only REST API resource model

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-020 (Astro SSG build), RB-021 (SiteAndApi sink), RB-030 (versioning + tombstones), RB-040 (website parity source)]
- **Implements design:** [../../06-interfaces/rest-api.md](../../06-interfaces/rest-api.md), [../../01-decisions/ADR-0007-api-design.md](../../01-decisions/ADR-0007-api-design.md), [../../01-decisions/ADR-0006-web-stack.md](../../01-decisions/ADR-0006-web-stack.md), [../../01-decisions/ADR-0005-storage-and-versioning.md](../../01-decisions/ADR-0005-storage-and-versioning.md), [../../01-decisions/ADR-0002-content-model.md](../../01-decisions/ADR-0002-content-model.md), [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
- **Produces:** the `/api/v1` resource tree as prebuilt static JSON + raw markdown emitted by the SAME Astro build; the canonical JSON envelope (public projection), content negotiation (`Accept` + `.md`/`.json` aliases), version addressing, `index.json` manifest, precomputed cursor pagination + whitelisted filters, 410 tombstone bodies, and the emit-time public-safe validator.

## Objective

The REST API is a **prebuilt static JSON + raw markdown** surface emitted by the same Astro build as the website — **no runtime substrate, no request-time path into internal stores**. "Done" = every published artifact is one canonical resource available in three representations (HTML via RB-040, raw markdown, JSON envelope) at `(slug, latest)` and at every immutable `(slug, semver)`; `index.json` lists all items+versions; list endpoints are precomputed with cursor pagination + whitelisted filters; withdrawn resources return HTTP 410. Web/API parity holds because both are projections of one `getCollection()` source. Audit-only sidecar fields **never serialize** to any representation (test-enforced).

## Preconditions

- [ ] RB-040 produced a typed `getCollection()` source whose public projection excludes the audit sidecar.
- [ ] Versioning (semver + content-digest) and tombstone status data are available from RB-030.
- [ ] The Astro build can emit file-based endpoints (JSON + `.md` files) alongside HTML pages.
- [ ] Every collection item carries `boundary` and `provenance.public_safe_recheck`.

## Steps

1. **Resource tree (file-based endpoints).**
   - Do: Generate, from the same `getCollection()` data, the `/api/v1` routes: `GET /api/v1/{type}` (index/list, latest of each); `/{type}/{slug}` (latest moving); `/{type}/{slug}/versions` (every version); `/{type}/{slug}/versions/{semver}` (one immutable pin); `/{type}/{slug}/examples`; `/{type}/{slug}/manifest.json`; `/api/v1/index.json`; `/api/v1/search`. `{type} ∈ tips|skills|workflows|playbooks`. Do NOT expose `Source` as a fetchable resource (provenance is an embedded reference only). The `/api/v1` prefix is the contract version, orthogonal to content `{semver}`.
   - Verify: Each route emits a static file; there is no `Source` endpoint; `{type}` is restricted to the four publishable kinds.

2. **Canonical JSON envelope (public projection).**
   - Do: Emit the ADR-0002 public projection envelope: `id, type, version (resolved semver), title, summary, boundary:"public", tags, inputs, outputs, preconditions, body (by-reference in lists / inlined in markdown), provenance {source_product, source_ref, validated, public_safe_recheck}, links {self, pinned, html, manifest}, digest, published_at`. Workflows add ordered `steps[]` pinning skill `id@version`; Playbooks add `contains[]` member refs; Tips carry common fields only. Provenance MUST be reference-only — **no `origin_ref`/`origin_version`**.
   - Verify: A Skill JSON resource matches the envelope; the provenance block contains no audit-only origin fields; lists deliver `body` by reference, markdown inlines it.

3. **Content negotiation (three representations).**
   - Do: Serve one canonical resource as: `text/html` (RB-040 page), `text/markdown` (`.md` alias — body + small YAML frontmatter of manifest fields), `application/json` (`.json` alias — the envelope). Treat the `Accept` header as canonical and `.md`/`.json` suffixes as the cache-safe alias for static/dumb clients. Set `Vary: Accept`, emit explicit `Content-Type`, open CORS for public read, no auth.
   - Verify: The same `(slug,semver)` resolves to HTML, `.md`, and `.json` with matching content and correct `Content-Type`; `Vary: Accept` is present.

4. **Version addressing + integrity.**
   - Do: `/{type}/{slug}` = latest moving (body carries resolved `semver` + `digest`, short/revalidate cache). `/{type}/{slug}/versions/{semver}` = immutable pin (`Cache-Control: public, max-age=31536000, immutable`). `/{type}/{slug}/versions` = list `[{semver, digest, published_at, status}]`. Every version response carries `digest` in the body and a strong `ETag` derived from it; `latest` responses include resolved `semver`+`digest` so callers can re-pin deterministically.
   - Verify: The latest body exposes `semver`+`digest`; the pinned response carries the immutable cache header and an `ETag` matching `digest`; re-publishing an existing `(slug,semver)` is impossible (frozen).

5. **`index.json` manifest.**
   - Do: Emit `/api/v1/index.json` — a single bodiless manifest of everything published: per item `{id, type, latest, boundary, digest, versions[], links{self, manifest}}` plus `api_version` and `generated_at`. Optionally emit `/llms.txt` (markdown index of top artifacts).
   - Verify: `index.json` lists every published item with all its versions and resolves the linked resources; it contains no bodies and no audit fields.

6. **Pagination & filtering (precomputed, static).**
   - Do: Precompute list pages with a cursor envelope `{data:[lightweight refs], pagination:{next_cursor, has_more, total_count}}`; emit `next` also as a `Link` header. Implement whitelisted filters only: `type, tag, source_product, q, updated_since, sort`. Reject arbitrary DSL. `boundary` is deliberately **not** a filter (exposing it would imply non-public values exist).
   - Verify: List endpoints page via cursor with a `Link` header; an unknown filter param is ignored/rejected; `boundary` is not accepted as a filter.

7. **410 tombstone bodies.**
   - Do: For removed resources/versions emit a machine-readable HTTP 410 body `{status:410, id, version, tombstone:true, reason, superseded_by?}` with no confidential detail — never a 404.
   - Verify: A withdrawn `(slug,semver)` returns HTTP 410 with the tombstone body and an optional `superseded_by`.

8. **Emit-time public-safe validator + no-sidecar test.**
   - Do: Before any representation is written, assert `boundary == "public"` AND `provenance.public_safe_recheck == "passed"`, else fail the build. Add a test asserting audit-only sidecar fields never appear in any JSON or markdown output.
   - Verify: A fixture with `public_safe_recheck != passed` or a non-public boundary fails the build; a fixture leaking a sidecar field into JSON/md fails the no-sidecar test.

## Acceptance criteria

- [ ] Every published artifact resolves as HTML, raw `.md`, and JSON for both latest and each immutable version.
- [ ] The JSON envelope matches ADR-0002 public projection and carries no `origin_ref`/`origin_version`.
- [ ] `index.json` enumerates all items + versions with working links and no bodies.
- [ ] List endpoints are precomputed with cursor pagination + `Link` header + whitelisted filters; `boundary` is not a filter.
- [ ] Immutable versions carry the long-immutable cache header and an `ETag` derived from `digest`.
- [ ] Withdrawn resources/versions return HTTP 410 tombstone bodies, never 404.
- [ ] CI fails on a non-public / not-re-checked emit and on any audit-only field in JSON or markdown output.
- [ ] Web/API parity: every RB-040 page has a 1:1 JSON + markdown counterpart from the same source.

## Rollback / safety

- The API is static files in `dist/`; rollback = redeploy the previous build. No runtime state, no DB migration.
- The emit-time validator and no-sidecar test fail closed — a failing build deploys nothing. Never disable them to ship.
- No request-time path to internal stores may be introduced; the API is a frozen CDN artifact by construction.

## Hand-off

- RB-043 (MCP + stubs) builds the MCP `resources/*` view and `.skill` bundle packaging as further facets of the same `SiteAndApiSinkAdapter`, reusing this runbook's envelope and `index.json`.
- RB-042 (preview/admin) relies on this runbook's emit-time validator being identical to the one its public-preview pane runs.
- Lifecycle ops (tombstones/cache) from RB-030 drive the 410 bodies emitted here.

# RB-040: Build the public Starlight website surface

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-020 (Astro/Starlight SSG build), RB-021 (SiteAndApi sink), RB-030 (versioning + tombstones)]
- **Implements design:** [../../06-interfaces/website.md](../../06-interfaces/website.md), [../../01-decisions/ADR-0006-web-stack.md](../../01-decisions/ADR-0006-web-stack.md), [../../01-decisions/ADR-0001-product-surface-and-delivery.md](../../01-decisions/ADR-0001-product-surface-and-delivery.md), [../../01-decisions/ADR-0002-content-model.md](../../01-decisions/ADR-0002-content-model.md), [../../01-decisions/ADR-0005-storage-and-versioning.md](../../01-decisions/ADR-0005-storage-and-versioning.md), [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
- **Produces:** Starlight site IA (one nav section per publishable entity), per-type artifact page template, moving/immutable/version-index routes, 410 tombstone pages, client-side search index, and the build-time public-safe assertions wired into the website projection of the `SiteAndApiSinkAdapter`.

## Objective

The public website is a **frozen, vetted, static artifact** rendered at build time from CAW-04's own git content repo, with **no request-time path into any internal or upstream store**. "Done" = a reader can browse Tips/Skills/Workflows/Playbooks, open one artifact at its latest version, jump to any immutable pinned version, see version history, hit a 410 tombstone for a withdrawn item, and use client-side search — and every emitted page asserts `boundary === "public"` and contains no audit-only sidecar field. The site is read-only by construction: no login, no comment box, no public write path.

## Preconditions

- [ ] The Astro 5 + Starlight project scaffolds and builds clean (from RB-020).
- [ ] A typed content collection is bound to the ADR-0002 schema; `getCollection()` returns published items with `boundary`, `provenance.public_safe_recheck`, `version`, `digest`.
- [ ] The public-projection split exists: audit-only `origin_ref`/`origin_version` live in a sidecar and are absent from the collection's public view.
- [ ] At least one published artifact exists in git at `src/content/{type}/<slug>/<semver>.md(x)` (from RB-030 / the import path).
- [ ] Tombstone status data (unpublished/redacted `(slug,semver)`) is available to the build from RB-030.

## Steps

1. **Information architecture (top-level nav).**
   - Do: Configure Starlight with exactly one nav section per publishable entity type: Tips (`/tips/`), Skills (`/skills/`), Workflows (`/workflows/`), Playbooks (`/playbooks/`), plus supporting pages About (`/about/`), Safety (`/safety/`), and API docs (`/api-docs/`). Do NOT create top-level nav for `Example`, `Source`, `SafetyBoundary`, or `Version`.
   - Verify: The built site exposes the four content sections and three supporting pages; no nav entry exists for the four non-publishable entities.

2. **Sidebar generation.**
   - Do: Auto-build the left sidebar per section from `getCollection()`; within a type, group items by `tag` and sort by `title`; show title + one-line `summary`. Add a "deprecated" badge to deprecated-but-still-published items. Exclude any item that is non-`public`, unpublished, or tombstoned.
   - Verify: A seeded deprecated item shows the badge; a seeded tombstoned item is absent from the sidebar.

3. **Per-type artifact page template.**
   - Do: Build one Astro/Starlight page template per type that renders an artifact at its **latest** published version with: h1 title + type badge + version pill (semver) + status badge; one-paragraph summary; a metadata card (Inputs/Outputs/Preconditions for Skills/Workflows; provenance `source_product` + `validated` + `public_safe_recheck: passed`; `boundary: public`; `version` + short `digest` + `published_at`); rendered markdown/MDX body; `steps[]` for Workflows (each linking the pinned skill `id@version`); `contains[]` for Playbooks (each linking the member artifact); inline Examples; a "Get this" panel; and version history.
   - Verify: A Skill page renders Inputs/Outputs/Preconditions and the provenance block; a Workflow renders linked pinned steps; a Playbook renders linked members.

4. **"Get this" cross-surface panel.**
   - Do: In the panel, link the same artifact's other representations from [../../06-interfaces/rest-api.md](../../06-interfaces/rest-api.md): the `.md` and `.json` suffix aliases, `manifest.json`, and the `.skill` bundle.
   - Verify: Each link resolves to the matching API artifact for the same `(slug, semver)`.

5. **Version routing.**
   - Do: Emit three route shapes per artifact: `/{type}/{slug}/` (moving — latest, `rel=canonical` self, short/revalidate cache); `/{type}/{slug}/v/{semver}/` (immutable — one frozen version, `Cache-Control: public, max-age=31536000, immutable`, `rel=canonical` → moving URL); `/{type}/{slug}/versions/` (version index listing every semver + status, short cache). On an immutable page, render a non-blocking "a newer version exists → latest" banner when applicable.
   - Verify: The moving URL renders the latest; the immutable URL renders the exact pinned version with the immutable cache header and canonical link; re-rendering an existing `(slug,semver)` never changes its output (frozen forever).

6. **Tombstone pages (unpublish / redact).**
   - Do: For an unpublished or redacted artifact/version, emit an **HTTP 410 Gone** tombstone page (not 404, not old content) carrying `reason ∈ {deprecated, boundary-changed, redacted}` and an optional `superseded_by` link, with NO confidential detail. Emit the 410 status via a per-route status mapping from the build; exclude tombstoned addresses from sidebar, sitemap, and search index.
   - Verify: A seeded tombstoned address returns HTTP 410 with the tombstone body and is absent from sitemap/sidebar/search.

7. **Client-side search.**
   - Do: Generate a prebuilt client-side search index (Pagefind-style) at build over only `boundary=public` rendered pages, bundled into `dist/` and loaded in-browser; no query reaches a server. Leave a documented stub note for a future server-side search endpoint (out of v1; would force a runtime substrate).
   - Verify: Search returns published pages only; no network request leaves the browser on query; tombstoned/non-public pages never appear in results.

8. **Public-safe backstops in the website projection.**
   - Do: Wire two CI-enforced backstops: (a) build-time invariant — every emitted page asserts `boundary === "public"`, build **fails** otherwise; (b) public-projection strip test — assert `origin_ref`/`origin_version` (the audit sidecar) never appear in any HTML output.
   - Verify: A fixture page with `boundary !== "public"` fails the build; a fixture carrying a sidecar field in HTML fails the strip test.

## Acceptance criteria

- [ ] Four publishable types are browsable, each with its own nav section and sidebar; non-publishable entities are not top-level nav.
- [ ] One artifact renders at moving, immutable, and version-index routes with correct `rel=canonical` and `Cache-Control` per route.
- [ ] Published `(slug, semver)` output is frozen — identical on rebuild.
- [ ] Withdrawn artifacts/versions return HTTP 410 tombstones and are excluded from sidebar/sitemap/search.
- [ ] Client-side search indexes only public pages and issues no server query.
- [ ] CI fails on any non-public page (build-time assertion) and on any audit-only field appearing in HTML (strip test).
- [ ] The website holds no content the API lacks (parity counterpart in RB-041 exists for every page).

## Rollback / safety

- The website is a static `dist/` artifact; rollback = redeploy the previous `dist/` build. No data migration, no runtime state.
- If the build fails the `boundary === "public"` assertion or the strip test, the build is the rollback — fail closed, nothing is deployed. Never bypass these assertions to ship.
- Re-checks and the gate are upstream (core); this runbook only renders already-vetted git content and must never add a request-time path to internal stores.

## Hand-off

- RB-041 (REST API) co-generates the 1:1 markdown/JSON counterpart of every page from the same `getCollection()` source; this runbook guarantees the HTML projection and the parity links it points to.
- RB-042 (preview/admin) reuses this runbook's public-projection render (same `boundary===public` assertion + strip test) as its "public preview" pane.
- RB-043 (MCP + stubs) treats this website projection as one facet of the `SiteAndApiSinkAdapter`.

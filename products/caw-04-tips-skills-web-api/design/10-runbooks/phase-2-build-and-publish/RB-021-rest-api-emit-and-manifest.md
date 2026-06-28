# RB-021: Emit the REST API (JSON + raw markdown), manifests, index.json, and MCP resources view from the same build

- Status: ready
- Phase: phase-2-build-and-publish
- Depends on: [RB-020 (Astro SSG + getCollection corpus + boundary gate + public projection)]
- Implements design:
  - [../../06-interfaces/rest-api.md](../../06-interfaces/rest-api.md) (resource tree, JSON envelope, negotiation, index.json)
  - [../../05-publishing-core/rendering-web-and-api.md](../../05-publishing-core/rendering-web-and-api.md) (§2 representations, §3 distribution + MCP, §4 lists)
  - [../../07-backend-api/build-and-publish-service.md](../../07-backend-api/build-and-publish-service.md) (emit stages, verify-output parity)
  - [../../01-decisions/ADR-0007-api-design.md](../../01-decisions/ADR-0007-api-design.md) (API contract)
- Produces: build-time Astro endpoints that emit, from the SAME `getCollection()` corpus as the HTML pages, the static REST API — per-item/per-version JSON envelopes and raw markdown, per-skill `manifest.json` + `SKILL.md`, the catalog `index.json`, list/search endpoints with cursor pagination + whitelisted filters, and an MCP `resources/list` + `resources/read` view — all public-projection-only and parity-verified.

## Objective

"Done" means: one `astro build` emits, alongside the HTML from RB-020, the full read-only API as static files under `dist/api/v1/...`, where each artifact is fetchable as JSON (`.json`), as raw markdown (`.md`), as a distribution manifest (`manifest.json` + `SKILL.md`), is listed in `index.json`, and is exposed through an MCP resources view — **all serialized from the identical corpus the pages use**, so web and API never drift. Every emitter routes through `toPublicProjection()`; the audit sidecar fields (`origin_ref`, `origin_version`) appear in NO output; a parity check asserts HTML/markdown/JSON agree per `(slug, semver, digest)`; the build fails closed on any boundary, leak, or parity violation. This runbook adds emitters only; RB-022 deploys the artifact.

## Preconditions

- [ ] RB-020 complete and green: Astro SSG, typed `getCollection()`, the fail-closed boundary assert, sidecar exclusion, and `toPublicProjection()` all in place.
- [ ] The seeded validated Skill renders to HTML (canonical + pinned).
- [ ] The canonical JSON envelope shape and `index.json` shape from [rest-api.md](../../06-interfaces/rest-api.md) are the authority for field names.

## Steps

1. **Define the canonical JSON envelope serializer (public projection).**
   - Do: Implement `toEnvelope(projectedRecord)` producing the [rest-api.md](../../06-interfaces/rest-api.md) envelope: `id, type, version, title, summary, boundary, tags, inputs, outputs, preconditions, body:{ref}, provenance:{source_product, source_ref, validated, public_safe_recheck}, links, digest, published_at`. `body` is by reference in JSON; `provenance` carries reference fields only — never `origin_ref`/`origin_version`. Workflows add `steps[]` (each pins `skill id@version`); Playbooks add `contains[]`.
   - Verify: A test snapshots the envelope for the seeded Skill and asserts no `origin_ref`/`origin_version` keys at any depth.

2. **Emit per-item and per-version JSON endpoints.**
   - Do: Add Astro endpoints reading via `getCollection()`: `/api/v1/{type}/{slug}.json` (latest, moving; body carries resolved `semver`+`digest`), `/api/v1/{type}/{slug}/versions.json` (list of `{semver, digest, published_at, status}`), `/api/v1/{type}/{slug}/versions/{semver}.json` (immutable pin). Set `Content-Type: application/json`, a strong `ETag` derived from `digest`, and `Cache-Control` per route (`immutable` for pinned, short/revalidate for latest).
   - Verify: `dist/api/v1/skills/<slug>.json` and `.../versions/<semver>.json` exist and validate against the envelope; the pinned route's `Cache-Control` contains `immutable`.

3. **Emit raw markdown representations.**
   - Do: Add `/api/v1/{type}/{slug}.md` and `/api/v1/{type}/{slug}/versions/{semver}.md`, each emitting the artifact body inlined plus a small YAML frontmatter header of the manifest fields. `Content-Type: text/markdown`.
   - Verify: The `.md` body matches the source markdown body; the frontmatter contains no audit-only field.

4. **Wire content negotiation aliases.**
   - Do: Treat the `.json`/`.md` suffix files as the load-bearing static artifacts (SSG has no per-request server). Emit `Vary: Accept` and explicit `Content-Type` on each. Document the host defaults (website host → HTML; `api.` host → JSON) for the edge layer in RB-022. Do NOT build a runtime negotiation server.
   - Verify: Each emitted endpoint sets `Vary: Accept` and the correct `Content-Type`; no SSR route was added.

5. **Emit `manifest.json` + `SKILL.md` per skill (distribution format).**
   - Do: Add `/api/v1/{type}/{slug}/manifest.json` (same fields as the envelope, canonical machine form) and a `SKILL.md` (open Agent Skills frontmatter: `name`=slug, `description`, plus additive governance fields `version`, `boundary`, `provenance`, `license`). Both are projections of one manifest.
   - Verify: `manifest.json` and `SKILL.md` carry identical governance fields for the seeded Skill; both lack audit-only fields.

6. **Emit the `index.json` catalog manifest and list/search endpoints.**
   - Do: Add `/api/v1/index.json` listing all items+versions+boundary+links with **no bodies**. Add per-type list endpoints and `/api/v1/search` with the cursor envelope `{data:[refs], pagination:{next_cursor, has_more, total_count}}`, a `Link: next` header, and whitelisted filters only (`type, tag, source_product, q, updated_since, sort`). `boundary` is NOT a filter. Optionally emit `/llms.txt`.
   - Verify: `index.json` lists the seeded Skill with its versions; a list request returns the cursor envelope + `Link` header; passing `?boundary=` has no effect (not whitelisted).

7. **Emit the MCP resources view.**
   - Do: Build a `resources/list` + `resources/read` projection over the same canonical resources, `uri = caw04://{type}/{slug}@{semver}`, `name`/`description` from `title`/`summary`, `mimeType` `text/markdown` (body) or `application/json` (manifest), `resources/read` returning the `.md` body or `manifest.json`. This is one more PublishSinkAdapter over the corpus — no shared substrate.
   - Verify: `resources/list` includes the seeded Skill's `uri`; `resources/read` of that uri returns the same body bytes as the `.md` endpoint.

8. **Add the emit-time validator + verify-output parity/leak scan.**
   - Do: At every emit assert `boundary === "public"` ∧ `provenance.public_safe_recheck === "passed"` ∧ projection contains no audit-only field, else fail the build. After build, run verify-output over `dist/api/**` asserting HTML/markdown/JSON projections agree per `(slug, semver, digest)` (`PARITY_MISMATCH`) and re-scanning for leaked sidecar fields (`LEAK_DETECTED`).
   - Verify: A fixture with mismatched digest across representations fails `PARITY_MISMATCH`; an injected `origin_version` in any emitted file fails `LEAK_DETECTED`; the clean corpus passes both.

9. **Keep the tree green.**
   - Do: Fold all emitters + checks into the single `build` script from RB-020 so one command emits HTML + JSON + md + manifests + index + MCP and runs all assertions.
   - Verify: `npm run build` exits 0 on the clean corpus; `lint` + `typecheck` green.

## Acceptance criteria

- [ ] One `astro build` emits HTML (RB-020) AND JSON + raw `.md` + `manifest.json` + `SKILL.md` + `index.json` + MCP view from the same `getCollection()` corpus.
- [ ] The seeded Skill is fetchable as JSON and as raw markdown; both match the HTML (parity verified per `(slug, semver, digest)`).
- [ ] `index.json` lists the artifact + versions; the MCP `resources/list` exposes it and `resources/read` returns the body.
- [ ] Pinned-version JSON/md carry `Cache-Control: immutable` + `ETag` from `digest`; latest carries resolved `semver`+`digest`.
- [ ] Lists use the cursor envelope + `Link` header + whitelisted filters only; `boundary` is not a filter.
- [ ] No emitted file contains `origin_ref`/`origin_version` (test-enforced); emit-time + verify-output scans pass.
- [ ] Build fails closed on boundary, leak, or parity violation; clean corpus is green.

## Rollback / safety

- All emitters share the RB-020 fail-closed gate; a boundary/leak/parity failure aborts before `dist/` is finalized, so no API file ships if any representation could leak or drift.
- If an emitter is broken, revert that endpoint file; the HTML surface (RB-020) and git store (RB-012) are unaffected.
- Never widen the filter whitelist to include `boundary`, and never disable the parity/leak scan to force a green build.

## Hand-off

RB-022 can assume a complete, parity-verified, leak-free static artifact in `dist/` containing all three surfaces (HTML, REST API JSON+md, MCP view) plus manifests and `index.json`, every file a public-projection serialization of one frozen corpus with no live path to internal stores. RB-022 wraps this artifact in the `SiteAndApi` PublishSink for atomic deploy and the rebuild/purge lifecycle.

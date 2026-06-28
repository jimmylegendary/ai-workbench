# RB-022: Implement the SiteAndApi PublishSink — atomic static/CDN deploy + rebuild triggers

- Status: ready
- Phase: phase-2-build-and-publish
- Depends on: [RB-020 (SSG HTML), RB-021 (REST API + manifests + index + MCP), RB-001 (config-driven adapter registry + PublishSinkAdapter port)]
- Implements design:
  - [../../07-backend-api/build-and-publish-service.md](../../07-backend-api/build-and-publish-service.md) (PublishSink, atomic flip, triggers, purge)
  - [../../05-publishing-core/rendering-web-and-api.md](../../05-publishing-core/rendering-web-and-api.md) (§5 public-safe by construction)
  - [../../01-decisions/ADR-0004-import-and-ports.md](../../01-decisions/ADR-0004-import-and-ports.md) (ports; sink does no boundary logic)
  - [../../01-decisions/ADR-0001-product-surface-and-delivery.md](../../01-decisions/ADR-0001-product-surface-and-delivery.md) (delivery; rebuild on publish/unpublish)
- Produces: a `SiteAndApiSinkAdapter` implementing the `PublishSinkAdapter` port that takes the verified `dist/` `BuildArtifact` and deploys it to the static host/CDN with an atomic immutable flip; a `requestRebuild(scope)` trigger wired to curator approve/update/unpublish; config-disabled sink stubs; and the M1 end-to-end readability proof on both web and API.

## Objective

"Done" means: the verified static artifact from RB-020/RB-021 is published to a static host/CDN by the `SiteAndApiSinkAdapter` as a new immutable artifact, then the served root is atomically flipped (no half-deployed state; rollback = re-point to the previous artifact). The adapter performs **no** boundary logic — it accepts only an already re-checked, approved, `boundary=public` artifact (boundary is core-only). A `requestRebuild(scope)` entry point triggers a full rebuild+deploy on curator approve/update/unpublish, and a content-repo push is the redundant trigger. This runbook completes Milestone M1: the seeded validated Skill is readable as a versioned web page AND a versioned API resource over a public CDN, with no live path to any internal store. (Full unpublish/redact 410-tombstone + purge-verify lifecycle is hardened in phase-3; this runbook wires the `requestRebuild` + deploy seams and the stub guard.)

## Preconditions

- [ ] RB-020 + RB-021 green: `npm run build` produces a parity-verified, leak-free `dist/` artifact (HTML + JSON + md + manifests + index.json + MCP view).
- [ ] RB-001 complete: the `PublishSinkAdapter` port + config-driven registry exist; `requiresPublicSafe: true` is a port capability a sink cannot self-disable.
- [ ] A static host/CDN target is selectable via config (TODO(open-question: pin deploy target — see [milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) Open Questions); the adapter must abstract the host behind config).

## Steps

1. **Implement the `BuildArtifact` packager.**
   - Do: After the verified build, compute a content-addressed `artifact_id`, `built_at`, `item_count`, and `digests: {slug@semver -> sha256}` over `dist/`. Emit this `BuildArtifact` manifest into the artifact root.
   - Verify: Two builds of the unchanged corpus yield byte-identical `digests` (immutability/no-drift); the `artifact_id` changes only when corpus content changes.

2. **Implement `SiteAndApiSinkAdapter` against the port.**
   - Do: Implement `capabilities()` (returns `requiresPublicSafe: true`), `canAccept(item)`, `publish(artifact, ctx)`, `unpublish(ref, ctx)`, `requestRebuild(scope)`. `publish` uploads the immutable artifact to the host then performs the atomic served-root flip; it returns a `PublishReceipt {artifact_id, deployed_at, urls[], purged?[]}`. The adapter does NO boundary checks — it trusts the build's fail-closed gate and core re-check (ADR-0004 §2).
   - Verify: A unit test confirms the adapter contains no boundary/`public_safe` decision logic; `publish` of a valid artifact returns a receipt with the deployed URLs.

3. **Make deploy atomic + immutable-by-build with rollback.**
   - Do: Upload to a new immutable path keyed by `artifact_id`; flip the served root pointer atomically (symlink/alias/origin config) only after upload completes. Implement rollback = re-point the root to the previous `artifact_id`. Old pinned versions re-emit byte-identically (digest guard from step 1).
   - Verify: During an in-progress upload the live root still serves the prior artifact (no half-deploy); a forced flip failure leaves the prior root live; rollback re-points and serves the previous artifact.

4. **Wire rebuild triggers.**
   - Do: Expose `requestRebuild(scope)` called by the curator surface on `approve` (reason `publish`), `update` (reason `publish`), and `unpublish`/`redact` (those reasons). v1 default scope is `mode: "full"` (curator-paced, low-frequency; removes incremental-staleness leak risk). Add a content-repo push webhook as the redundant trigger. Document the chosen mechanism. TODO(open-question: webhook vs CI vs scheduled — [build-and-publish-service.md](../../07-backend-api/build-and-publish-service.md) Open Questions).
   - Verify: A simulated `approve` invokes `requestRebuild({mode:"full", reason:"publish"})` → build → `publish`; a content-repo push invokes the same path.

5. **Guard the sink stubs (config-disabled).**
   - Do: Register `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter` as documented stubs with `maturity="stub"`, config-disabled. A preflight refuses to run if a stub is marked `active`.
   - Verify: Marking a stub `active` makes preflight refuse with a clear error; with only `SiteAndApi` active, deploy proceeds.

6. **Set CDN cache headers + integrity per route.**
   - Do: Configure the host so pinned `(slug, semver)` URLs (HTML/.md/.json) carry `Cache-Control: public, max-age=31536000, immutable`, latest/moving URLs carry short/revalidate, and `ETag` (from `digest`) + `Vary: Accept` are honored. Document host defaults: website host → HTML, `api.` host → JSON.
   - Verify: `curl -I` of a pinned API URL shows `immutable`; of a latest URL shows a short/revalidate policy + `ETag`.

7. **Prove M1 end-to-end readability on both surfaces.**
   - Do: Deploy the artifact containing the seeded validated Skill. Fetch the canonical + pinned HTML page, the JSON envelope, and the raw markdown from the deployed CDN; confirm the MCP `resources/read` and `index.json` resolve. Confirm none of the deployed bytes reference an internal store and no audit-only field is present.
   - Verify: All M1 acceptance checks from [milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) pass: web page live at canonical URL; same artifact fetchable as JSON and raw md (parity); `index.json` + MCP list it; audit fields absent (automated test); static artifact has no live path to internal stores.

## Acceptance criteria

- [ ] `SiteAndApiSinkAdapter` implements the full `PublishSinkAdapter` port and contains NO boundary logic (core-only).
- [ ] `publish` deploys an immutable `artifact_id` path then atomically flips the served root; rollback re-points to the previous artifact.
- [ ] In-progress deploy never serves a half-deployed state; a flip failure leaves the prior artifact live.
- [ ] `requestRebuild(scope)` is invoked on curator approve/update/unpublish (default `mode:"full"`); content-repo push is a redundant trigger.
- [ ] Sink stubs are registered `maturity="stub"`, config-disabled; preflight refuses an `active` stub.
- [ ] Pinned URLs serve `Cache-Control: immutable` + `ETag`; latest serves revalidate; `Vary: Accept` honored.
- [ ] M1 proven: the seeded Skill is readable as a versioned web page AND a versioned API resource over the public CDN, with no audit-field leak and no live internal path.

## Rollback / safety

- Deploy is atomic: a failed flip leaves the previous artifact live; explicit rollback re-points the served root to the prior `artifact_id`. No partial state is ever public.
- The adapter never relaxes the build's fail-closed gate; an artifact that did not pass RB-020/RB-021 verification cannot be packaged for deploy.
- A CDN purge failure after an unpublish (phase-3 lifecycle) is an incident, not a warning — stale public bytes breach brief §11; until purge is confirmed, treat the item as still exposed. (Full purge-then-verify 410 flow lands in phase-3.)
- Never mark a sink stub `active`; the preflight guard must stay enforced.

## Hand-off

Phase-3 lifecycle runbooks can assume: a working `SiteAndApiSinkAdapter` with atomic immutable deploy + rollback, a `requestRebuild(scope)` trigger surface, config-disabled stubs, and a live M1 deployment of the validated Skill on web + API. Phase-3 builds the unpublish/redact → HTTP 410 tombstone + bounded CDN purge-then-verify flow and the hash-chained audit ledger on top of this sink.

# RB-043: Build the MCP resources view and ship the documented stub adapters

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-011 (ports + value objects), RB-012 (config registry + preflight), RB-021 (SiteAndApi sink), RB-041 (API envelope + index.json)]
- **Implements design:** [../../05-publishing-core/ports-and-adapters.md](../../05-publishing-core/ports-and-adapters.md), [../../06-interfaces/rest-api.md](../../06-interfaces/rest-api.md), [../../01-decisions/ADR-0004-import-and-ports.md](../../01-decisions/ADR-0004-import-and-ports.md), [../../01-decisions/ADR-0007-api-design.md](../../01-decisions/ADR-0007-api-design.md), [../../01-decisions/ADR-0002-content-model.md](../../01-decisions/ADR-0002-content-model.md)
- **Produces:** the MCP `resources/*` view (`uri = caw04://{type}/{slug}@{semver}`) as a facet of the `SiteAndApiSinkAdapter`; and the five brief-§8 documented stub adapters (internal wiki + curated bundle sources; external docs host + package registry + syndication sinks) shipped as registered `NotImplemented` bodies with `maturity="stub"`, config examples, and preflight refusal-when-active.

## Objective

"Done" = (1) the same vetted corpus is exposed as an MCP resources view (a projection of the same `getCollection()` source as website + API, no shared substrate, no live path to internal stores), and (2) every future connector named in PRODUCT-BRIEF §8 ships as a **documented stub**: the real interface implemented with `NotImplemented` bodies, a capability descriptor with `maturity="stub"` and `requiresPublicSafe:true`, a config example (disabled by default), and discoverability via `registry.list()` and the preview/admin UI. Wiring a stub later means filling in *that one file's* method bodies + flipping one config block — no core edit. Preflight refuses to run any `active` stub, pointing at the file to implement. The safety property survives the stub pattern: even a fully-wired future sink still receives only a `PublishableItem` and still sits behind the core's gate.

## Preconditions

- [ ] `ContentSourceAdapter` and `PublishSinkAdapter` interfaces + value objects (`CandidateItem`, `PublishableItem`, `AdapterCapabilities`, `Acceptance`, `PublishReceipt`) exist (RB-011).
- [ ] The config-driven registry + preflight exist (RB-012), including the rules: unknown id rejected; `maturity:"stub"` active rejected; `requiresPublicSafe:false` rejected.
- [ ] The `SiteAndApiSinkAdapter` and `index.json` + JSON envelope are built (RB-021 / RB-041).

## Steps

1. **MCP resources view — enumeration.**
   - Do: As a facet of the `SiteAndApiSinkAdapter` (not a separate port), expose an MCP `resources/list` over the same published corpus, one resource per published `(slug, semver)` plus the moving latest, with `uri = caw04://{type}/{slug}@{semver}`, derived from the same `getCollection()` source as the website/API and from `index.json`.
   - Verify: `resources/list` enumerates every published item+version with the `caw04://` URI scheme and matches `index.json`.

2. **MCP resources view — read.**
   - Do: Implement `resources/read` returning the canonical public projection (JSON envelope from RB-041) and/or raw markdown for a given `caw04://` URI. Reuse the emit-time public-safe validator + no-sidecar test so audit-only fields never serialize.
   - Verify: Reading a resource returns the public envelope/markdown with no `origin_ref`/`origin_version`; a tombstoned URI returns the 410-equivalent tombstone, not stale content.

3. **Source stubs — internal wiki + curated bundle.**
   - Do: Implement `InternalWikiSourceAdapter` and `CuratedBundleSourceAdapter` against `ContentSourceAdapter`: `discover`/`fetch`/`health` bodies throw `NotImplemented`; capability descriptor `{port:"source", id, version:"0.0.0", provides:[...], requiresConfig:[...], requiresPublicSafe:true, maturity:"stub"}`. Register each via the registry; add a config example (`enabled: false`). Document in the file header the contract, the brief reference, and the config keys.
   - Verify: Both appear in `registry.list()`; calling `fetch` throws `NotImplemented`; neither can be constructed as a `PublishableItem` (type-enforced — a source mints only `CandidateItem`).

4. **Sink stubs — external docs host, package registry, syndication.**
   - Do: Implement `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter` against `PublishSinkAdapter`: `canAccept` returns `Acceptance.no("stub not wired")`; `publish`/`unpublish` throw `NotImplemented`; descriptor `{port:"sink", id, accepts:[...], features:[...], requiresConfig:[...], requiresPublicSafe:true, maturity:"stub"}`. Register each; add config examples (`enabled: false`). Document contract + that they must respect the core gate and accept only `boundary=public`.
   - Verify: All three appear in `registry.list()`; `publish` throws `NotImplemented`; `canAccept` refuses; each descriptor declares `requiresPublicSafe:true`.

5. **Config examples.**
   - Do: Add each stub to `caw04.config.yaml` under the correct port with `{ enabled: false }`, alongside the v1 active adapters, matching the ports-and-adapters §6 layout. Keep the re-check profile in the core, never in any adapter.
   - Verify: The config parses; all stub blocks are present and disabled; the only `active` sink remains `site-and-api` and sources remain the v1 set.

6. **Preflight refusal of active stubs.**
   - Do: Confirm/extend preflight (RB-012) so that forcing any stub `active` fails with an actionable message naming the file to implement, and any descriptor declaring `requiresPublicSafe:false` fails.
   - Verify: Setting `external-docs-host` (or any stub) `active` fails preflight with "stub `<id>` is active — implement <file> or disable"; a tampered `requiresPublicSafe:false` descriptor fails preflight.

7. **Seam test (open-by-design).**
   - Do: Add a test asserting that wiring a stub touches only that one adapter file + one config block — no core/re-check/gate/other-adapter edit. A new connector cannot widen the leak surface (still consumes/produces only the value-object types).
   - Verify: The seam test passes for each of the five stubs; attempting to publish from a source without going through the core (no `publish()` caller other than the core) is impossible.

## Acceptance criteria

- [ ] MCP `resources/list`/`resources/read` expose the same published corpus as website + API under `caw04://{type}/{slug}@{semver}`, with no audit-only fields and tombstone handling.
- [ ] All five brief-§8 stubs (`internal-wiki`, `curated-bundle`, `external-docs-host`, `package-registry`, `syndication`) ship as registered `NotImplemented` adapters with `maturity="stub"` and `requiresPublicSafe:true`.
- [ ] Every stub appears in `registry.list()` and in the preview/admin UI but is config-disabled by default.
- [ ] Preflight refuses any `active` stub with a file-pointing message and refuses any `requiresPublicSafe:false` descriptor.
- [ ] `caw04.config.yaml` lists all stubs disabled; only the v1 adapters are active; the re-check profile lives in the core.
- [ ] The seam test confirms a future connector touches only one adapter file + one config block, never the core/gate/re-check.
- [ ] A source cannot mint a `PublishableItem`; a sink accepts only `boundary=public` items (type-enforced).

## Rollback / safety

- Stubs are inert (`NotImplemented`); they cannot publish or import, so shipping them has no runtime effect. Rollback = remove the adapter file + its config block.
- The MCP view is a static projection facet; rollback = redeploy the previous build. No request-time path to internal stores.
- Preflight is the safety net: a misconfigured-active stub fails the run rather than producing a partial/unsafe publish. Never bypass preflight to force a stub active.

## Hand-off

- This completes the phase-4 interface fan-out (website RB-040, API RB-041, preview/admin RB-042, MCP+stubs RB-043) over the one `SiteAndApiSinkAdapter`.
- Future connector work = implement one stub file's bodies + flip its config block; no further runbook depends on the core changing.
- Hardening/ops (tombstone cache invalidation, audit reports, remaining stub documentation in phase-5) builds on the registered stubs and MCP view delivered here.

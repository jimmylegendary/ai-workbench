# RB-002: Define the two ports, the config-driven registry, preflight, and documented stubs

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [../../05-publishing-core/ports-and-adapters.md](../../05-publishing-core/ports-and-adapters.md), [../../01-decisions/ADR-0004-import-and-ports.md](../../01-decisions/ADR-0004-import-and-ports.md)
- Produces: the `ContentSourceAdapter` + `PublishSinkAdapter` port interfaces; the load-bearing value objects (`CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`, `Acceptance`, `PublishReceipt`, `PublishedRef`, `HealthStatus`); a config-driven registry with `caw04.config.yaml` loader + env-ref secrets; capability preflight; the documented-stub pattern for all brief-§8 future connectors; and in-memory fakes. No concrete I/O.

## Objective

The two seams of the publishing core exist as engineering contracts ([ports-and-adapters.md](../../05-publishing-core/ports-and-adapters.md)). The type boundary IS the safety boundary: a `ContentSourceAdapter` can mint only a `CandidateItem` (carrying `upstream_boundary_claim` as **evidence only**), and a `PublishSinkAdapter` consumes only a `PublishableItem` — a type the **core alone** mints post-re-check, with `boundary:"public"` and audit-only fields (`origin_ref`/`origin_version`) already stripped to the sidecar. A config-driven **registry** maps logical id → adapter factory and selects which are `active`; **preflight** validates wiring before any I/O and refuses a `stub`-maturity adapter that is `active` or any descriptor declaring `requiresPublicSafe:false`. Every future connector ships as a **documented stub** (real interface, `NotImplemented` body, descriptor, config example). "Done" = the tree is green with fakes only, and a test proves a source **cannot construct** a `PublishableItem`.

## Preconditions

- [ ] RB-001 complete: boundary rule + op-manifest in place; CI green.
- [ ] `src/ports/`, `src/adapters/{sources,sinks}/`, `src/adapters/registry.ts` exist as placeholders.

## Steps

1. **Define the value objects (the only things crossing the ports).**
   - Do: in `src/core/model/` define `CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`, `Acceptance`, `PublishContext`, `PublishReceipt`, `PublishedRef`, `HealthStatus`, `SourceRef`, `CandidateRef`, `SourceQuery` per [ports-and-adapters.md §2](../../05-publishing-core/ports-and-adapters.md). Enforce the safety shape:
     - `CandidateItem.upstream_boundary_claim` is typed `string` and documented "EVIDENCE ONLY — never a verdict".
     - `PublishableItem.boundary` is the literal type `"public"` (the only allowed value), carries `publicView: PublicProjection` (audit-only fields structurally absent), `semver`, `content_digest`, `verdict_ref`.
     - Make `PublishableItem` constructible **only** via a core factory (e.g. a branded type / private constructor / `mintPublishable()` in `src/core/`); a source cannot build one.
   - Verify: `typecheck` passes; `PublicProjection` has no `origin_ref`/`origin_version` keys.

2. **Define the two port interfaces.**
   - Do: in `src/ports/ContentSourceAdapter.ts` declare `capabilities`, `discover(query): Promise<CandidateRef[]>`, `fetch(ref): Promise<CandidateItem>`, `health(): Promise<HealthStatus>`. In `src/ports/PublishSinkAdapter.ts` declare `capabilities`, `canAccept(item): Promise<Acceptance>`, `publish(item, ctx): Promise<PublishReceipt>`, `unpublish(ref, ctx): Promise<PublishReceipt>`. Add the per-method "Must NOT" contracts as doc-comments (e.g. source must NOT set `boundary:"public"` or strip audit fields; sink must NOT re-derive boundary or mutate a frozen `(slug,semver)`).
   - Verify: `typecheck` passes; the interfaces match [ports-and-adapters §3/§4](../../05-publishing-core/ports-and-adapters.md) exactly.

3. **Define `AdapterCapabilities` + the `requiresPublicSafe` invariant.**
   - Do: type `AdapterCapabilities` with `port`, `id`, `version`, `provides?`, `accepts?`, `features?`, `requiresConfig?`, `maturity: "v1"|"stub"|"experimental"`, and `requiresPublicSafe: true` (literal `true`, not `boolean`). A descriptor with `requiresPublicSafe:false` must be a **type error** and also rejected at preflight (defence in depth).
   - Verify: assigning `requiresPublicSafe: false` fails `typecheck`.

4. **Implement the config-driven registry.**
   - Do: implement `src/adapters/registry.ts` — `registerAdapter()` + `registry.list()` + `registry.resolve(id)`; the registry maps logical id → factory and never lets an adapter override the core re-check/gate/boundary (ports-and-adapters §6). Add a `caw04.config.yaml` loader that reads `ports.source.active[]` / `ports.sink.active[]`, per-adapter config blocks, `enabled:false` stubs, and resolves secrets as **env refs only** (`auth: "env:CAW02_TOKEN"`). The `profiles.recheck` block is read but owned by the **core**, never an adapter.
   - Verify: loading the example `caw04.config.yaml` (from ports-and-adapters §6) resolves active ids and leaves stubs disabled; a missing env ref surfaces a clear error.

5. **Implement capability preflight.**
   - Do: implement preflight applying all rules from [ports-and-adapters §5](../../05-publishing-core/ports-and-adapters.md): each active id resolves; active sink `accepts` what the build emits; active source `provides` the needed kinds; `requiresConfig`/env refs present; **no active adapter has `maturity:"stub"`**; `health()` ok; and **reject any descriptor with `requiresPublicSafe:false`**. Each failure returns an actionable message.
   - Verify: forcing a stub `active` fails preflight pointing at the file to implement; removing a required env ref fails with the named key.

6. **Ship documented stubs for every brief-§8 future connector.**
   - Do: in each stub dir create a class implementing its port with `maturity:"stub"`, `NotImplemented` method bodies, a descriptor, and a config example doc-comment — per the §7 pattern. Stubs: sources `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`; sinks `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`. Register them (so they appear in `registry.list()`) but leave `enabled:false`.
   - Verify: `registry.list()` includes every stub; preflight refuses each when forced `active`.

7. **Add in-memory fakes (no concrete I/O).**
   - Do: add `FakeSourceAdapter` (returns a hard-coded `CandidateItem`) and `FakeSinkAdapter` (records the `PublishableItem` it received) under `tests/` or a `__fakes__` dir, used only by tests. The v1 concrete adapters (`Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`, `SiteAndApiSinkAdapter`) are **not** implemented here — they are later-phase runbooks.
   - Verify: tests can wire fakes through the registry.

8. **Prove the type boundary.**
   - Do: add a test/`@ts-expect-error` assertion that a `ContentSourceAdapter` (or the `FakeSourceAdapter`) **cannot construct a `PublishableItem`** — only the core factory can mint one. Add a test that a `FakeSinkAdapter.publish` receives a `publicView` with no `origin_ref`/`origin_version` keys.
   - Verify: removing the core-only restriction makes the `@ts-expect-error` test fail.

## Acceptance criteria

- [ ] `ContentSourceAdapter` + `PublishSinkAdapter` interfaces and all §2 value objects type-check.
- [ ] `PublishableItem.boundary` is the literal `"public"`; `requiresPublicSafe` is literal `true` (a `false` is a type error).
- [ ] A source/adapter **cannot construct** a `PublishableItem` (type-enforced test passes); only the core factory mints it.
- [ ] The registry loads `caw04.config.yaml`, selects `active` adapters, resolves env-ref secrets, and never overrides the core re-check/gate.
- [ ] Preflight rejects: a stub forced active (pointing at the file), a missing env ref (named), an incapable sink/source, and any `requiresPublicSafe:false`.
- [ ] Every brief-§8 stub appears in `registry.list()`, is `enabled:false`, and is refused by preflight when active.
- [ ] Fakes wire through the registry; CI stays green. No concrete network/file I/O added.

## Rollback / safety

- All work is interfaces, registry, stubs, and fakes — revert via `git` to RB-001.
- Do NOT implement a concrete CAW-02/CAW-03 source or the SiteAndApi sink here (later phases) — keeping phase 0 I/O-free preserves the green, resumable tree.
- Never add a port method that lets a source emit to a sink directly — the core must remain the only caller of `publish()` (no-bypass invariant).

## Hand-off

Phase-1 import/gate runbooks can assume: stable port contracts; value objects with the safety type boundary; a config-driven registry + preflight that refuses unsafe or stub wiring; and documented stubs for every future connector. The core re-check, curator gate, and `mintPublishable()` factory referenced here are implemented in phase 1; the v1 concrete adapters in phase 1/2. RB-003 finalizes the frontmatter schemas and versioning model that `PublicProjection`/`PublishableItem` carry.

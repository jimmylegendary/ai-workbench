# RB-010: Build the v1 ContentSource adapters and the pull-based import service

- Status: ready
- Phase: phase-1-import-and-gate
- Depends on: [RB-001 (content-model types + sidecar declaration), RB-002 (hexagonal core + two ports), RB-003 (config-driven adapter registry)]
- Implements design:
  - [../../05-publishing-core/import-and-recheck.md](../../05-publishing-core/import-and-recheck.md)
  - [../../07-backend-api/import-service.md](../../07-backend-api/import-service.md)
  - [../../01-decisions/ADR-0004-import-and-ports.md](../../01-decisions/ADR-0004-import-and-ports.md)
- Produces: `ContentSourceAdapter` port impls (`Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`), documented stubs (`InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`), the pull import service (`discover` → `fetch` → staging), idempotent staging store, preflight + health.

## Objective

CAW-04 can pull candidate content from the two sibling products (CAW-02 knowledge, CAW-03 / skills registry) across an explicit, read-only, id/URI/version-only boundary, landing each `CandidateItem` in a **staging quarantine that is never served and never built**. Adapters are pure read-only plumbing: an adapter **never knows the re-check exists** (RB-011) and cannot bypass it. Future sources (internal wiki, curated bundle) ship as registered, config-disabled stubs. "Done" = the import service stages a validated upstream Skill candidate via the CAW-03 adapter, idempotently, with full provenance captured — but writes nothing to the git content store (that only happens after re-check + curator approval).

## Preconditions

- [ ] RB-001 has landed the 8-entity content-model types, the common-field set, and the **audit sidecar** declaration (`origin_ref`, `origin_version` are sidecar-only).
- [ ] RB-002 has landed the hexagonal core with the two ports declared, including `ContentSourceAdapter`.
- [ ] RB-003 has landed the config-driven adapter registry skeleton (no live adapters yet).
- [ ] The pipeline order `import → re-check → curator gate → version → publish` is fixed in the core (ADR-0004 §2); this runbook implements only the `import` stage.
- [ ] Secrets policy: upstream credentials are **env refs only** (no inline secrets in config).

## Steps

1. **Finalize the `ContentSourceAdapter` port contract.**
   - Do: In the core ports module, confirm/define the read-only interface exactly: `capabilities()`, `discover(query)`, `fetch(ref)`, `health()`. `fetch` returns a `CandidateItem` = `{ payload, upstream_boundary_claim, source_ref, upstream_metadata }`. `capabilities()` returns `AdapterCapabilities` with `port, id, version, provides, features, requiresConfig, requiresPublicSafe: true, maturity`.
   - Do: Make `requiresPublicSafe` a fixed `true` that an adapter **cannot self-disable** (ADR-0004 §3).
   - Verify: A type/lint check confirms no adapter method can return or write into the git content store, and `requiresPublicSafe` has no setter. The port has no method named or shaped like a re-check.

2. **Define the import envelope schema + semver gate.**
   - Do: Implement parsing of the import envelope (`contract_version`, `source_product`, `declared_boundary`, `redaction_applied`, `payload_sha256`, `provenance.graph`, `payload`) per [import-and-recheck.md](../../05-publishing-core/import-and-recheck.md). Treat `declared_boundary` and `redaction_applied` as **evidence-only** fields — store them, never act on them as authority.
   - Do: Reject an unknown `contract_version` MAJOR (never guess). Reject a `payload_sha256` mismatch against the canonicalized payload (integrity).
   - Verify: Unit tests — an envelope with an unknown MAJOR is rejected; a tampered payload (digest mismatch) is rejected; a well-formed envelope parses and retains the raw `declared_boundary`/`redaction_applied` as evidence fields only.

3. **Implement `Caw02KnowledgeSourceAdapter` (concrete, v1).**
   - Do: Implement `discover(query)` returning `CandidateRef[]` referencing CAW-02 items by **id/URI/version only** — never a shared store handle. Implement `fetch(ref)` returning a provenance-tagged `CandidateItem` for validated knowledge / cited tips.
   - Do: `capabilities().provides` lists knowledge/claims/citations; `maturity = "concrete"`.
   - Verify: Against a CAW-02 fixture, `discover` returns refs and `fetch` returns a `CandidateItem` whose `source_ref.product == "CAW-02"` and whose payload carries no shared-store handle (only id/URI/version).

4. **Implement `Caw03SkillsRegistrySourceAdapter` (concrete, v1).**
   - Do: Same shape; authoritative for Skill/Workflow/Playbook execution metadata (inputs/outputs/preconditions). `source_ref.product == "CAW-03"`.
   - Verify: Against a CAW-03 skills-registry fixture, `fetch` returns a Skill `CandidateItem` with reuse/audit metadata populated and `upstream_boundary_claim` captured as evidence only.

5. **Ship documented stubs: `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`.**
   - Do: Real interface, `NotImplemented` body, descriptor `maturity = "stub"`, a config example. Registered + discoverable but **config-disabled by default** (ADR-0004 §5).
   - Verify: The registry lists all four adapters; the two stubs report `maturity = "stub"` and are inactive by default.

6. **Wire the config-driven registry + preflight (refuse active stubs).**
   - Do: Resolve active adapters from config. Preflight (before any I/O) validates wiring (ADR-0004 §3): source `provides` what the content model needs; required config/auth present as **env refs**; `requiresPublicSafe` is on; **no `active` adapter is a `stub`**.
   - Do: Ensure the registry can wire which adapters are active but can **never** let an adapter override the re-check, the human gate, or the boundary policy (ADR-0004 §4).
   - Verify: Test — marking a stub `active` fails preflight with an actionable message; a valid concrete config passes; preflight runs before any network/fetch call.

7. **Implement the pull import service (`discover` → `fetch` → staging).**
   - Do: v1 is **pull** — curator-triggered or scheduled. Call `discover()` across active sources (fan-in allowed), then `fetch()` per selected ref. Land each `CandidateItem` in a **staging quarantine** that is never served and never built.
   - Do: Make staging **idempotent** per `(source_ref.product, source_ref.id, origin_version)` — an unchanged upstream version does not create a duplicate staged record.
   - Verify: Test — two imports of the same upstream version yield one staged record; staging is on a path excluded from the build; no git content-store write occurs at this stage.

8. **Capture provenance into the sidecar (not the public projection).**
   - Do: On staging, route `origin_ref`, `origin_version`, `validated_by`, `imported_at` into the **audit sidecar** record per [public-safe-and-provenance.md](../../04-data-layer/public-safe-and-provenance.md). Public-projection provenance (`origin_product`, `validated`, `derivation`) may be derived but is not yet published.
   - Verify: Test — a staged candidate's `origin_ref`/`origin_version` exist only in the sidecar structure and are absent from any object shaped for serialization.

9. **Health + failure modes.**
   - Do: Implement `health()` per adapter and the import failure codes (`SOURCE_UNAVAILABLE` → skip source, no partial publish; `SCHEMA_NONCONFORMANT` → reject + audit). Fan-in collisions are flagged `DUPLICATE_PRECEDENCE` and held (dedup/precedence algorithm is an open question — do not auto-merge).
   - Verify: Test — an unavailable source is skipped (surfaced by health/preflight) with no partial state; a schema-nonconformant fetch is rejected and audited.

## Acceptance criteria

- [ ] `ContentSourceAdapter` is read-only; adapters reference upstream by id/URI/version only and never write the content store.
- [ ] `requiresPublicSafe` is fixed `true` and not self-disablable; no adapter has any re-check method.
- [ ] Both concrete v1 adapters (`Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`) stage candidates from fixtures.
- [ ] Both stubs are registered, `maturity="stub"`, config-disabled; preflight refuses an `active` stub.
- [ ] Import is pull-based; `fetch` lands candidates in a staging quarantine that is never served/built.
- [ ] Staging is idempotent per `(product, id, origin_version)`.
- [ ] Envelope semver gate rejects unknown MAJOR; integrity check rejects digest mismatch; `declared_boundary`/`redaction_applied` are stored as evidence only.
- [ ] `origin_ref`/`origin_version` land in the sidecar only; absent from any serialization-shaped object.
- [ ] Tree is green (builds, lints, tests pass).

## Rollback / safety

- All work here is **pre-store**: nothing reaches the git content store or any served surface, so a mid-way failure cannot publish anything. Safe rollback = discard staging records (quarantine is disposable) and revert the registry config to no active adapters.
- If an adapter is found to leak a shared-store handle or to expose a re-check influence point, disable it in config (registry) immediately; the gate (RB-012) still denies by default, but the adapter must be fixed before re-activation.

## Hand-off

The next runbook (RB-011, core public-safe re-check) can assume: staged `CandidateItem`s exist in a never-served quarantine, each carrying the parsed envelope (with `provenance.graph`), an evidence-only `upstream_boundary_claim`, and a sidecar provenance record. RB-011 consumes staged candidates and produces a typed `RecheckVerdict`; it must re-derive boundary locally and never trust the captured upstream claim. RB-012 (publish gate + curator queue) then consumes re-checked candidates.

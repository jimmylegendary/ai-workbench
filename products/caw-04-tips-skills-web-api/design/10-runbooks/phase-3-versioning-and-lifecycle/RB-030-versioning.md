# RB-030: Assign semver + content-digest, freeze versions, emit canonical + pinned addresses

- Status: ready
- Phase: phase-3-versioning-and-lifecycle
- Depends on: [RB-020 (storage layout + sidecar split), RB-021 (publish gate write path), RB-022 (SiteAndApi build/emit)]
- Implements design:
  - [../../05-publishing-core/versioning-and-immutability.md](../../05-publishing-core/versioning-and-immutability.md)
  - [../../04-data-layer/storage-and-versioning.md](../../04-data-layer/storage-and-versioning.md)
  - [../../01-decisions/ADR-0005-storage-and-versioning.md](../../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../../01-decisions/ADR-0007-api-design.md](../../01-decisions/ADR-0007-api-design.md)
- Produces: a version-identity module (`assign-semver`, `compute-digest`, `freeze-check`), write-time freeze/never-reuse enforcement, per-`Version` index records, and the moving-canonical + immutable-pinned URL/API resource emitters.

## Objective

When a curator-approved artifact reaches the write path, the system assigns a curator-chosen **semver**, computes a frozen **content-digest** over the canonical serialization of the **public projection only**, and persists the version as a new immutable file under `src/content/{kind}/<slug>/<semver>.md(x)` with its audit sidecar. Re-publishing an existing `(slug, semver)` pair — or reusing a pair that was ever published, even after removal — fails the build. The build then emits, per artifact, a **moving canonical** address (always latest published) and an **immutable pinned** address per version, with correct `rel=canonical`, immutable cache headers, strong `ETag`, and a `/versions` history. "Done" = an edit to a published artifact produces a brand-new addressable version while every prior pinned address still returns byte-identical content and the same digest.

## Preconditions

- [ ] RB-020 storage layout exists: `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)` plus `<semver>.audit.yml` sidecar, and the build firewall excludes `*.audit.yml` from output.
- [ ] RB-021 publish gate runs the public-safe re-check as a **core** stage and only invokes the write path on PASS (deny-by-default).
- [ ] RB-022 emits HTML + JSON + raw markdown from the same Astro 5 + Starlight build.
- [ ] Content-model types expose the public-projection body separate from the audit sidecar (`origin_ref`, `origin_version` live ONLY in the sidecar).
- [ ] `_events/ledger.ndjson` append-only hash-chained ledger exists (RB-021).

## Steps

1. **Define the version-identity module surface.**
   - Do: Create `src/core/version/identity.ts` exposing pure functions (signatures are build guidance):
     ```ts
     // semver assigned by curator; never derived from bytes
     function validateSemver(input: string): Semver            // reject non-semver
     function assertBump(prev: Semver | null, next: Semver): void // reject downgrade & reuse
     function canonicalize(pub: PublicProjection): string       // §1.2 canonical serialization
     function computeDigest(pub: PublicProjection): string      // "sha256:" + sha256(canonicalize(pub))
     ```
   - Verify: Unit test imports the module; `validateSemver("2.1.0")` passes, `validateSemver("v2")` throws.

2. **Implement canonical serialization (digest is reproducible).**
   - Do: In `canonicalize`, normalize per design: sort frontmatter keys into the fixed normalized order, LF newlines only, trim trailing whitespace, append the markdown body after a single normalized delimiter. Hash the **public projection only** — never the audit sidecar.
   - Verify: A golden-file test serializes a fixture twice (and after a re-read round-trip) and asserts byte-identical output; `computeDigest` returns the same `sha256:…` across two runs and across a rebuild.

3. **Enforce content-adapted semver bump intent.**
   - Do: `assertBump(prev, next)` rejects: a `next` ≤ the latest existing semver for that slug (downgrade/reuse), and any `next` equal to a previously-used pair. Record the curator-asserted bump class (MAJOR/MINOR/PATCH) in the version record. Do NOT auto-derive the bump — semver is curator-assigned.
   - Verify: Tests: publishing `2.0.0` after `2.1.0` throws (downgrade); `2.1.0` after `2.1.0` throws (reuse); `2.2.0` after `2.1.0` passes.
   - Note: who assigns/validates the bump class is `TODO(open-question)` per versioning-and-immutability.md §1.1 — wire the field, do not invent policy.

4. **Implement write-time freeze + never-reuse enforcement.**
   - Do: In the storage write path (`src/core/storage/write-version.ts`), before writing `<slug>/<semver>.md(x)`: (a) refuse if the target file already exists (frozen), (b) refuse if `(slug, semver)` appears anywhere in the `_events` ledger or index history even when the file is absent (never-reuse — covers unpublished/redacted addresses), (c) write the public projection to `<semver>.md(x)` and audit-only fields to `<semver>.audit.yml`. Writing is append-only: never edit an existing version file.
   - Verify: Test re-running a publish for an existing pair fails with a freeze error and writes nothing; a pair recorded as redacted in the ledger but with no file still fails never-reuse.

5. **Persist the per-`Version` index record.**
   - Do: On successful write, record `{slug, kind, semver, digest, published_at, status: "published", successor: null, audit_record_ref}` into the regenerable `index.json` derivation source. Files remain source of truth; `index.json` is rebuilt from scratch at build.
   - Verify: After two publishes for one slug, the regenerated `index.json` lists both versions with distinct digests; deleting and rebuilding `index.json` reproduces it byte-for-byte.

6. **Emit moving-canonical + immutable-pinned web pages.**
   - Do: In the build (RB-022 emitters), for each artifact generate: `/{type}/{slug}` → 200 latest published, `rel=canonical` to itself; `/{type}/{slug}/v/{semver}` → the pinned page, `rel=canonical` pointing to the moving URL, served `Cache-Control: public, max-age=31536000, immutable`; `/{type}/{slug}/versions` → human-readable history/changelog. `{type}` ∈ `tips|skills|workflows|playbooks`.
   - Verify: Built HTML for a 2-version skill shows the moving page rendering the latest semver, a pinned page per version, and the pinned pages carrying the immutable cache header and self-vs-moving canonical links.

7. **Emit the API resource tree with integrity fields.**
   - Do: Emit static JSON for `GET /api/v1/{type}/{slug}` (latest, moving), `/versions` (every version: semver, digest, published_at, status), `/versions/{semver}` (one pinned version). Every version response carries `digest`/`content_hash` in the body and a strong `ETag` derived from it. `latest` responses include the resolved `semver` + `digest` so a caller can deterministically re-pin. Keep `/api/v1` (API-contract axis) orthogonal to the content `{semver}` axis.
   - Verify: `GET /api/v1/skills/<slug>` JSON includes resolved `semver` + `digest`; `/versions/<semver>` returns that exact version; the body digest matches the `ETag`; re-pinning to the returned semver returns byte-identical JSON.

8. **Confirm the audit-fields-never-serialized invariant holds across all version surfaces.**
   - Do: Add a test that scans every emitted HTML page, raw markdown, and JSON resource (moving, pinned, `/versions`, `index.json`) for the sidecar keys (`origin_ref`, `origin_version`, any `*.audit.*` content).
   - Verify: The scan finds zero occurrences across all version-related outputs; the test fails the build if any appears.

## Acceptance criteria

- [ ] `computeDigest` is reproducible: identical bytes → identical `sha256:` across rebuilds (golden test green).
- [ ] Publishing an existing `(slug, semver)` fails (frozen); reusing a previously-used pair fails (never-reuse), including pairs with no current file.
- [ ] An edit to a published artifact yields a NEW version file; all prior pinned files are unchanged byte-for-byte with unchanged digests.
- [ ] Each artifact exposes a moving canonical page/resource AND an immutable pinned page/resource per version, with correct `rel=canonical` and `Cache-Control: …immutable` on pinned pages.
- [ ] API version responses carry `digest`/`content_hash` + strong `ETag`; `latest` returns resolved `semver` + `digest` enabling deterministic re-pin; `/api/v1` stays orthogonal to `{semver}`.
- [ ] Audit-only sidecar fields appear in ZERO version-related outputs (automated scan green).
- [ ] `index.json` is fully regenerable from the files and reproduces byte-for-byte.
- [ ] Tree is green (build, lint, tests).

## Rollback / safety

- All work is additive to the build/write path; no published version file is ever edited or deleted by this runbook — a mid-way failure leaves existing frozen versions intact.
- If digest/canonicalization changes mid-development, recompute is safe ONLY before first real publish; after a real publish, a digest change for an existing pair is forbidden (would break immutability) — bump as a new version instead.
- Revert is a clean removal of the new module + emitter wiring; the storage layout (RB-020) and gate (RB-021) remain functional.
- Never weaken freeze/never-reuse to "fix" a test — these are the immutability contract.

## Hand-off

- The next runbook (RB-031) can assume: every published `Version` has a stable `{slug, semver, digest, status, successor}` record, a moving + pinned address on web and API, and a write-time guarantee that `(slug, semver)` is frozen and never reused.
- RB-031 builds the failure-mode twin of publishing — deprecate / unpublish / redact via HTTP 410 tombstones + bounded cache purge — flipping `status`, re-pointing `latest`, and writing audit records, all on top of the immutable identity established here.

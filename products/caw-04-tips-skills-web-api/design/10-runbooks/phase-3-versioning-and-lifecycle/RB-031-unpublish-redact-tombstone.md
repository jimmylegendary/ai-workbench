# RB-031: Deprecate / unpublish / redact via HTTP 410 tombstone + bounded cache purge + audit trail

- Status: ready
- Phase: phase-3-versioning-and-lifecycle
- Depends on: [RB-030 (semver + digest + freeze + moving/pinned addresses), RB-021 (publish gate + `_events` ledger), RB-022 (SiteAndApi emit)]
- Implements design:
  - [../../05-publishing-core/versioning-and-immutability.md](../../05-publishing-core/versioning-and-immutability.md)
  - [../../04-data-layer/storage-and-versioning.md](../../04-data-layer/storage-and-versioning.md)
  - [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../../01-decisions/ADR-0005-storage-and-versioning.md](../../01-decisions/ADR-0005-storage-and-versioning.md)
- Produces: three Jimmy-approved lifecycle operations (`deprecate`, `unpublish`, `redact`), HTTP 410 tombstone pages + machine-readable tombstone bodies, `latest` re-pointing, bounded CDN/cache invalidation, and immutable audit-ledger records written before any byte purge.

## Objective

Provide the failure-mode twin of publishing: a Jimmy-approved, audited path to take published content out of public circulation without ever breaking the immutability promise. **Deprecate** keeps a version/item served but flags it with a successor pointer. **Unpublish** turns every route of a whole item into **HTTP 410 Gone** and removes it from index/listing/sitemap. **Redact** turns a single version into a 410 tombstone, leaves siblings intact, and re-points `latest` to the newest non-redacted version. Because `(slug, semver)` is never reused (RB-030), a redacted address resolves **permanently** to a 410 tombstone carrying `{id, semver, digest, redacted_at, reason_code, successor}` — a cacher learns the content was pulled rather than receiving swapped bytes. Every operation writes an immutable, hash-chained audit record **before** public bytes are purged, and triggers a bounded CDN/cache purge of exactly the affected addresses. "Done" = a redacted version returns 410 on web + API, its siblings and `latest` behave correctly, no stale public copy survives the purge window, and the audit trail still links to the internal Source.

## Preconditions

- [ ] RB-030 complete: every `Version` has `{slug, semver, digest, published_at, status, successor}` and moving + pinned addresses on web and API.
- [ ] `_events/ledger.ndjson` is append-only and hash-chained (`hash = H(prev_hash ‖ canonical(line))`); git history is the redundant second witness.
- [ ] The audit sidecar (`<semver>.audit.yml`) retains provenance (`origin_ref`, `origin_version`) and is excluded from build output.
- [ ] A deploy/CDN target exists with an invalidation API. `TODO(open-question: pin deploy/CDN target — milestones-and-phases.md Open Questions)`.
- [ ] 410 status is expressible for static routes on the chosen host (tombstone artifact + host config). `TODO(open-question: host 410 mechanism)`.

## Steps

1. **Model the three operations as approved lifecycle events.**
   - Do: Create `src/core/lifecycle/ops.ts` with `deprecate`, `unpublish`, `redact`, each taking `{target, reason_code, approver, successor?}` and emitting a ledger event. Deny-by-default: an op runs only with an explicit Jimmy approval token; none is a silent delete.
   - Verify: Calling any op without an approval token throws and writes no ledger entry.

2. **Implement Deprecate (still served, flagged).**
   - Do: Set `status: "deprecated"` on the target version or item; set `successor`. Keep bytes served. Surface a visible `deprecated` flag + successor pointer on web and an API warning field/header. Treat `deprecated` as a mutable side-band flag OUTSIDE the frozen digest envelope (do not recompute the version digest). `TODO(open-question: is deprecated inside/outside the hashed envelope — versioning-and-immutability.md §1.2)`.
   - Verify: A deprecated version still returns 200 with the flag + successor on web and API; its digest is unchanged from before deprecation.

3. **Implement Unpublish (whole item → 410).**
   - Do: Set `status: "unpublished"` for the item (all versions). The build emits **HTTP 410 Gone** for every item route (`/{type}/{slug}`, `/{type}/{slug}/v/{semver}`, `/{type}/{slug}/versions`) — a web tombstone page and a machine-readable JSON body for API routes. Remove the item from `index.json`, listings, and sitemap. Retain provenance + metadata in the sidecar/ledger.
   - Verify: After unpublish + rebuild, every item route returns 410 (not 404); the item is absent from `index.json` and sitemap; the audit sidecar still resolves `origin_ref`.

4. **Implement Redact (single version → 410, siblings intact, latest re-points).**
   - Do: Set `status: "redacted"` on exactly one `(slug, semver)`. That version's web + API addresses emit a 410 tombstone; sibling versions remain 200. Re-point the moving `latest` (web canonical + `GET /api/v1/{type}/{slug}`) to the newest **non-redacted, non-unpublished** version. Purge the redacted public bytes per policy; the `(slug, semver)` is never reused (enforced by RB-030 write path). `TODO(open-question: purge bytes immediately vs retain encrypted internally for audit — retention policy)`.
   - Verify: Redacting `2.0.0` of a 3-version skill: `2.0.0` → 410, `1.0.0`/`2.1.0` → 200, `latest` resolves to `2.1.0`; re-publishing `2.0.0` is rejected by the freeze/never-reuse check.

5. **Emit the 410 tombstone body (machine-readable).**
   - Do: For unpublished/redacted API addresses, emit a 410 body shaped per design:
     ```jsonc
     {
       "status": "redacted",        // or "unpublished"
       "id": "<slug>",
       "type": "<kind>",
       "version": "<semver>",       // present for redacted version; absent for whole-item unpublish
       "digest": "sha256:…",       // the digest that USED to resolve here
       "redacted_at": "<timestamp>",
       "reason_code": "boundary-change",  // machine-readable; NO confidential detail
       "successor": "/api/v1/{type}/{slug}/versions/<semver>"  // or null
     }
     ```
     Use **410, never 404** (404 = "never existed", undermines auditability); **301 only** for a genuine move (rename/merge), never for a boundary removal. The body MUST carry no confidential detail (reason is a code, not prose).
   - Verify: A redacted API address returns HTTP 410 with the exact body shape; a scan confirms the body (and tombstone page) contain no sidecar/internal fields beyond the allowed `digest`/`reason_code`.

6. **Write the immutable audit record BEFORE byte purge.**
   - Do: For every op, append a hash-chained `_events/ledger.ndjson` entry `{op, target, reason_code, approver, redacted_at, prev_hash, hash}` and ensure provenance survives in the sidecar. Only after the ledger write + chain verification succeeds may public bytes be purged. Git history is the redundant second witness.
   - Verify: The ledger chain validates (`hash == H(prev_hash ‖ canonical(line))`) after each op; a forced purge attempted before a successful ledger write is blocked by the op ordering.

7. **Trigger a bounded CDN/cache invalidation.**
   - Do: After rebuild + deploy, invalidate exactly the affected addresses (the redacted/unpublished routes + the moving canonical + `index.json`/sitemap), within a bounded, documented purge window. Pinned immutable sibling addresses are NOT purged (their bytes are unchanged).
   - Verify: Within the documented bound, a fetch (bypassing local cache) of a redacted address returns 410; the moving canonical reflects the re-pointed `latest`; a sibling pinned address still serves its original bytes with its long-lived immutable cache header.

8. **Regression-guard the immutability + public-safe invariants.**
   - Do: Add tests: (a) a redacted/unpublished `(slug, semver)` can never be re-published (never-reuse); (b) no tombstone output contains audit-only sidecar fields; (c) deprecate does not mutate a version digest; (d) every lifecycle op has a matching ledger entry (no silent delete).
   - Verify: All four guards green; build fails if any tombstone leaks a sidecar field.

## Acceptance criteria

- [ ] Three operations exist (`deprecate`, `unpublish`, `redact`), each requiring explicit Jimmy approval; none performs a silent delete.
- [ ] Unpublish: every item route returns **410** (not 404); item removed from `index.json`/listing/sitemap; provenance retained.
- [ ] Redact: target version → 410 tombstone; siblings 200; `latest` re-points to newest non-redacted version.
- [ ] Deprecate: target still served (200) with visible flag + successor and API warning; version digest unchanged.
- [ ] 410 API bodies match the design shape, carry the prior `digest` + `reason_code`, and contain NO confidential detail.
- [ ] A redacted/unpublished `(slug, semver)` is permanently non-reusable (freeze/never-reuse honored).
- [ ] Immutable hash-chained audit record is written and chain-verified BEFORE any byte purge; git history is a second witness.
- [ ] Bounded CDN/cache invalidation removes stale public copies of affected addresses within the documented window; immutable sibling pins untouched.
- [ ] No tombstone output (page or body) serializes any audit-only sidecar field.
- [ ] Tree is green (build, lint, tests).

## Rollback / safety

- Operations are append-only ledger events: a mid-way failure leaves the prior state recoverable from the ledger + git history; re-running an op is idempotent on status.
- Reversing a **deprecate** is allowed (clear the flag) since bytes were never removed. Reversing an **unpublish** is allowed only by publishing a NEW version — the original `(slug, semver)` stays non-reusable. A **redact** byte-purge is NOT reversible; treat the audit record as the durable truth.
- If the CDN purge fails, the operation is incomplete: keep the address marked and re-attempt purge — do not consider the op done while a stale public copy may survive.
- Never downgrade a 410 to 404 to "simplify" hosting — 410 is required for auditability and honest cache behavior.
- The static public artifact retains NO live code path to any internal store; tombstones and provenance are served from the frozen build + ledger only.

## Hand-off

- After this runbook the lifecycle is complete: published versions are immutable + addressable (RB-030), and deprecate/unpublish/redact provide an audited, public-safe removal path with permanent 410 tombstones and bounded cache purge.
- Downstream (phase-4 interfaces/stubs and ops): the audit-report tooling can read `_events/ledger.ndjson` to prove every published item traces to its validated internal Source + safety review, and every removal traces to an approver + reason_code; future PublishSink stubs (external docs host, package registry, syndication) must honor the same 410-tombstone + never-reuse contract.

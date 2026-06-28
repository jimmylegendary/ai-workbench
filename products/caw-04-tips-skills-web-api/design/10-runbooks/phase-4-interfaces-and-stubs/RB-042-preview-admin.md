# RB-042: Build the internal curator preview/approve surface

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-010 (core gate + re-check), RB-030 (git write + versioning + tombstones), RB-040 (public-projection render), RB-041 (emit-time validator)]
- **Implements design:** [../../06-interfaces/preview-admin.md](../../06-interfaces/preview-admin.md), [../../01-decisions/ADR-0001-product-surface-and-delivery.md](../../01-decisions/ADR-0001-product-surface-and-delivery.md), [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [../../01-decisions/ADR-0004-import-and-ports.md](../../01-decisions/ADR-0004-import-and-ports.md), [../../01-decisions/ADR-0005-storage-and-versioning.md](../../01-decisions/ADR-0005-storage-and-versioning.md), [../../01-decisions/ADR-0002-content-model.md](../../01-decisions/ADR-0002-content-model.md)
- **Produces:** an internal-only curator surface — review queue, candidate detail view (public preview + internal audit pane + diff), curator actions (approve/redact-then-approve/hold/reject/unpublish), the approve→assign-semver→write-git→emit-publish-event path, and an append-only audit log. No public write path.

## Objective

The preview/admin surface is the **internal, curator-only** workspace where gate-passing candidates are reviewed and **approved** — the *only* path that promotes a candidate to the public website and API. "Done" = Jimmy can see the queue of imported candidates with their core re-check findings, inspect a candidate as both the exact public projection and a richer internal audit pane (sidecar + raw findings), diff against the published latest, and take an explicit per-artifact decision. Approval is mandatory and deny-by-default: only an `approved` candidate is written to git and published. This surface writes to git and triggers a rebuild; it exposes **no runtime write endpoint reachable from the public internet**, and it never ships to the public host.

## Preconditions

- [ ] The core public-safe re-check (RB-010) runs upstream of this surface and produces per-candidate findings (`pass`/`fail`/`needs-redaction`) — this surface consumes findings, it never re-runs trust on upstream boundary claims.
- [ ] The git write path + semver/digest assignment + tombstone write (RB-030) are callable.
- [ ] The public-projection render (RB-040) and the emit-time validator + no-sidecar test (RB-041) are reusable as a library.
- [ ] An internal-only host/auth context exists (TODO(open-question: hosting + auth mechanism — do not invent)).

## Steps

1. **Enforce the internal-only boundary.**
   - Do: Build the surface as an internal-only app/tool. It must never be deployed to the public CDN/host and must expose no public write endpoint. It writes to CAW-04's git repo and triggers a rebuild; the public surfaces stay read-only static artifacts.
   - Verify: The surface is unreachable from the public host config; there is no public-facing write route; CI/deploy config excludes it from the public deploy target.

2. **Review queue.**
   - Do: Render the candidate queue with columns: candidate (`{type}/{slug}` + proposed semver), source (`source_product` + `source_ref`), gate result (`pass`/`fail`/`needs-redaction` from core re-check), diff (new artifact / new version / boundary change vs published latest), status (`pending`/`held`/`approved`/`rejected`/`redacted`). States are deny-by-default.
   - Verify: A seeded candidate appears with its gate result and a status that is not auto-`approved`.

3. **Candidate detail — public preview pane.**
   - Do: Render the **exact** public projection the website/API would emit, running the **same** `boundary===public` assertion and no-sidecar test as the real build (RB-040/RB-041), so the preview can never show more than the public surface would.
   - Verify: The preview pane output is byte-equivalent to the public projection of the same candidate; a non-public candidate fails the same assertion here as in the real build.

4. **Candidate detail — internal audit pane.**
   - Do: Render the internal-only audit pane: full provenance including the sidecar `origin_ref`/`origin_version`, the raw gate findings, and any spans the re-check flagged for redaction. These fields are displayed for the decision only and are **never** serialized to a public projection.
   - Verify: The audit pane shows sidecar fields; the public preview pane (Step 3) for the same candidate shows none of them.

5. **Candidate detail — diff pane.**
   - Do: Diff the candidate against the current published latest: changed fields, body diff, and classification as new artifact / new version / **boundary change**. A boundary change routes to deprecate/unpublish/redact, not an edit.
   - Verify: A boundary-change candidate is flagged and routed to the lifecycle action, not the edit path.

6. **Curator actions.**
   - Do: Implement: **Approve & publish** (assign/confirm semver; write `<slug>/<semver>.md(x)` + sidecar to git; emit publish event); **Redact then approve** (apply redactions to the public projection, re-run the re-check, then approve — raw stays internal); **Hold** (keep in queue, no git write); **Reject** (mark rejected with reason, no git write); **Unpublish/redact live item** (write a tombstone → rebuild → 410 on both public surfaces, excluded from index/sitemap/search). Published `(slug, semver)` is frozen forever — corrections are a new version, never an in-place edit.
   - Verify: Only `approve` (or `redact then approve`) writes git; hold/reject perform no git write; unpublish writes a tombstone; re-approving an existing `(slug,semver)` is rejected (frozen).

7. **Append-only audit log.**
   - Do: Record every curator action append-only: who (curator), what (candidate + version + digest), when (timestamp), why (reason / gate-findings snapshot).
   - Verify: Each action appends an immutable entry capturing who/what/when/why; entries are not editable or deletable.

8. **Rebuild / deploy trigger.**
   - Do: On approve/unpublish/redact, emit a **publish event** consumed by the `SiteAndApiSinkAdapter` to rebuild + redeploy the static artifact (TODO(open-question: webhook vs CI-on-git-push vs scheduled)).
   - Verify: An approve emits exactly one publish event that triggers a rebuild of the public artifact.

## Acceptance criteria

- [ ] The surface is internal-only, never on the public host, with no public write path.
- [ ] The queue shows core re-check findings; nothing is auto-approved (deny-by-default).
- [ ] The public-preview pane runs the identical `boundary===public` assertion + no-sidecar test as the real build and cannot show more than the public surface.
- [ ] The audit pane shows sidecar/raw-findings; those fields never reach the public projection.
- [ ] Only `approved` (incl. redact-then-approve) candidates are written to git and published.
- [ ] Approve assigns/confirms semver and writes `<slug>/<semver>.md(x)` + sidecar; published `(slug,semver)` is frozen forever.
- [ ] Unpublish/redact writes a tombstone → 410 on website + API → excluded from index/sitemap/search.
- [ ] Every action is captured in an append-only who/what/when/why audit log.

## Rollback / safety

- This surface only proposes git writes; an erroneous approval is corrected by a new version or an unpublish/redact tombstone — never an in-place edit of a frozen `(slug,semver)`.
- Curator approval is the **human** gate layer; it does not replace the machine gates. If an approved candidate carries a non-public boundary or leaks a sidecar field, the build-time assertion and emit-time validator (RB-040/RB-041) **fail closed** — the public surface stays public-safe by construction.
- If the surface itself is unavailable, no publishing happens (deny-by-default); the public artifact is unaffected.

## Hand-off

- The publish event handed to the `SiteAndApiSinkAdapter` drives RB-040 (website) and RB-041 (API) rebuilds.
- RB-043 (MCP + stubs) surfaces the registered stub adapters in this admin UI (each appears in `registry.list()`), but no stub may be approved as `active`.
- Lifecycle/cache invalidation on unpublish is owned by RB-030 ops; this surface only triggers it.

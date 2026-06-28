# Build & Publish Service (Astro SSG + PublishSink)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./api-surface.md](./api-surface.md) (Build/Publish operation contract)
  - [./import-service.md](./import-service.md) (what fills the corpus before build)
  - [./persistence.md](./persistence.md) (the md-in-git source the build reads)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc describes the **build & publish service**: how the Astro 5 + Starlight SSG turns the md-in-git corpus into a
frozen static artifact (HTML + raw markdown + JSON + manifests), how that artifact is deployed through the
`SiteAndApiSinkAdapter`, what triggers a rebuild, and how unpublish/redact purge cache/CDN. It does NOT define the
content model, the re-check (see [./import-service.md](./import-service.md)), nor the public REST resource scheme (that
is the published artifact, [ADR-0007](../01-decisions/ADR-0007-api-design.md)).

## Design property: public-safe by construction

The deployed artifact is a **frozen, vetted static file set with no request-time path back into any internal or
upstream store** ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md),
[ADR-0006](../01-decisions/ADR-0006-web-stack.md)). The build is the last enforcement point: a **fail-closed
invariant** asserts `boundary == public` for every emitted item and **fails the whole build otherwise** — nothing
deploys. Web/API parity is structural: one build emits all projections from the one canonical source
([ADR-0007](../01-decisions/ADR-0007-api-design.md)).

## Build pipeline (stages)

```
read corpus (md-in-git, sidecar excluded)
  -> validate frontmatter against content-model schema
  -> ASSERT boundary == public for every item        [fail-closed gate]
  -> render HTML pages (Starlight)                    [human surface]
  -> emit raw .md per (slug, semver)                  [low-token agent surface]
  -> emit JSON envelope per (slug, semver)            [MCP/programmatic surface]
  -> emit SKILL.md + manifest.json (skills)           [distribution format, ADR-0007]
  -> emit index.json manifest + per-kind listings     [discovery]
  -> emit MCP resources view                          [MCP host]
  -> emit sitemap (excludes unpublished/redacted)
  -> verify-output stage (parity + leak scan)
  -> hand artifact to PublishSinkAdapter.publish
```

| Stage | Input | Output | Fail mode |
|---|---|---|---|
| read | git working tree | in-memory entries | `READ_ERROR` |
| schema-validate | entries | typed entries | `SCHEMA_NONCONFORMANT` (build fails) |
| **boundary assert** | typed entries | confirmed-public entries | `BOUNDARY_NOT_PUBLIC` (build fails) |
| render/emit | entries | static files | `RENDER_ERROR` |
| verify-output | static files | verified artifact | `PARITY_MISMATCH` / `LEAK_DETECTED` (build fails) |

The **verify-output** stage is a second, post-render defense: it re-scans the *rendered* output for confidential
patterns and for any leaked `origin_ref`/`origin_version` (sidecar fields, [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)),
and asserts HTML/markdown/JSON projections agree per `(slug, semver, digest)`.

## Build scope

```ts
interface BuildScope {
  mode: "full" | "incremental";       // v1: full is the safe default
  reason: "publish" | "unpublish" | "redact" | "deprecate" | "manual" | "scheduled";
  slugs?: string[];                   // hint only; correctness never depends on it
}
interface BuildArtifact {
  artifact_id: string;                // content-addressed build id
  built_at: string;
  item_count: number;
  digests: Record<string, string>;    // (slug@semver) -> sha256 of emitted canonical body
}
```

- **v1 default is a full rebuild.** Publish cadence is curator-paced and low-frequency
  ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md)), so a full rebuild is cheap and removes any
  incremental-staleness leak risk. Incremental is a deferred optimization, gated on the same boundary assertion.
- Old versions remain as static files (immutability, [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md));
  a rebuild re-emits them byte-identically (digest check guards drift).

## Rebuild triggers

Every publish/unpublish triggers a rebuild+deploy ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md)
§Consequences). Triggers:

| Trigger | Source | Scope.reason | Notes |
|---|---|---|---|
| Curator `approve` | curator surface ([api-surface](./api-surface.md)) | publish | the primary path; promotes + rebuilds |
| `unpublish` / `redact` | curator surface | unpublish/redact | MUST also purge CDN (below) |
| `deprecate` | curator surface | deprecate | still served; flag + successor re-emitted |
| Git push to content repo | corpus repo main | manual | PR merge IS the curator gate ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)) |
| Scheduled drift check | scheduler | scheduled | re-verifies deployed digest == corpus digest |

The trigger mechanism itself is an open question ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md)
TODO: rebuild-trigger). v1 direction: the `PublishSinkAdapter` exposes a `requestRebuild(scope)` the curator surface
calls on approve/unpublish; a webhook on content-repo push is the redundant trigger.

## Deploy via PublishSinkAdapter

Deploy is delegated to the active sink ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §1). v1 sink =
`SiteAndApiSinkAdapter`; documented stubs = `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`,
`SyndicationSinkAdapter` (config-disabled; preflight refuses an `active` stub).

```ts
interface PublishSinkAdapter {
  capabilities(): AdapterCapabilities;          // requiresPublicSafe: true (cannot self-disable)
  canAccept(item: PublishableItem): Acceptance;
  publish(artifact: BuildArtifact, ctx: PublishCtx): PublishReceipt;
  unpublish(ref: ItemRef, ctx: PublishCtx): PublishReceipt;
  requestRebuild(scope: BuildScope): void;
}
interface PublishReceipt { artifact_id: string; deployed_at: string; urls: string[]; purged?: string[]; }
```

- The adapter receives only a built `BuildArtifact` of `PublishableItem`s — already re-checked, approved, versioned,
  `boundary=public`. It performs **no** boundary logic (that is core-only, [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §2).
- Deploy is **atomic + immutable-by-build**: publish a new immutable artifact, then atomically flip the served root
  (no half-deployed state). Roll back = re-point to the previous artifact.

## Unpublish / redact → cache & CDN purge

Removal is real and audited ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). Because the deployed set
is static and cached, removal MUST purge every cached copy or a 410'd item could still be served.

| Op | Build effect | Routing | CDN/cache purge |
|---|---|---|---|
| **Deprecate** | re-emit version with `deprecated` flag + successor | still 200, warning field/header | purge changed pages only |
| **Unpublish** (item) | drop all versions from index/listing/sitemap; emit web tombstone | all item routes → **HTTP 410 Gone** | purge all item URLs (HTML/.md/.json) + index + sitemap |
| **Redact** (version) | drop that version; `latest` re-points to newest non-redacted; emit tombstone | that version → **410 Gone**; siblings unaffected | purge that version's URLs + `latest` alias + index |

Purge rules:

- Use **410 Gone, not 404** — "existed, deliberately removed"; honest to agents, correct for SEO de-index
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). `301` only for genuine moves (rename/merge), never
  for boundary removal.
- Purge order: **deploy the tombstone artifact first, then issue CDN purge** for the affected paths — so a cache miss
  re-fetches the 410, never the stale public bytes. A purge-verify step re-requests purged URLs and asserts 410.
- `(slug, semver)` is never reused, so a redacted address permanently resolves to its 410 tombstone (id, semver,
  digest, `redacted_at`, machine-readable reason) — immutability promise kept *and* removal honored.
- The sink `PublishReceipt.purged[]` records purged URLs; an audit event (`unpublish`/`redact`) is appended to the
  hash-chained ledger ([./api-surface.md](./api-surface.md) Audit ops).

## Failure & rollback

| Failure | Behavior |
|---|---|
| Boundary/leak/parity assertion fails | build aborts; previous artifact stays live; nothing deploys |
| Deploy flip fails | served root unchanged (atomic flip); retry or roll back |
| CDN purge fails after unpublish | **alert + retry**; treat as incident — stale public bytes are a guardrail breach (brief §11) until purge confirmed |
| Drift check finds deployed digest != corpus | trigger full rebuild; alert |

## Open Questions

- TODO(open-question: rebuild-trigger mechanism — sink `requestRebuild` vs webhook vs CI; [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md)).
- TODO(open-question: CDN/host choice + exact purge API; whether purge is path-level or tag-level — affects the sink adapter).
- TODO(open-question: incremental build safety — can it ever skip the full boundary assertion? Default no).
- TODO(open-question: search — prebuilt client index vs deferred runtime endpoint; [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md)).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- A runbook stands up the Astro 5 + Starlight project reading the corpus from git ([ADR-0006](../01-decisions/ADR-0006-web-stack.md)), emitting HTML + .md + .json + manifests in one build ([ADR-0007](../01-decisions/ADR-0007-api-design.md)).
- A runbook wires the **fail-closed `boundary == public`** assertion AND the post-render verify-output leak/parity scan into CI; a green build is a precondition for deploy.
- A runbook implements `SiteAndApiSinkAdapter` with atomic flip + rollback, and the unpublish/redact **purge-then-verify** flow returning 410.
- A runbook ships the sink stubs (`maturity="stub"`, config-disabled) per [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md).

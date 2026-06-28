# Repo Structure — the product layout

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md) (what flows through these dirs)
  - [./tech-stack.md](./tech-stack.md) (the components that live here)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (content layout, sidecar, ledger)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md) (Astro pages + endpoints)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (endpoint routes, manifest, bundle)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md) (core/ports/adapters)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc fixes the on-disk layout of CAW-04's product repo: the git content store
(`src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>`), the audit sidecar dir, the hexagonal
`core/ports/adapters`, the Astro pages, the build-time API endpoints, and the build artifact. It elaborates
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)/[ADR-0006](../01-decisions/ADR-0006-web-stack.md);
it does NOT re-decide them. The separation of **served content** from the **audit sidecar** is the structural
expression of the public-safe-by-construction property — audit-only fields physically live outside the served tree.

## Top-level tree

```
caw-04-tips-skills-web-api/                  (product repo = source of truth, ADR-0005)
├─ src/
│  ├─ content/                               # SERVED CORPUS — vetted, public-safe, frozen
│  │  ├─ tips/<slug>/<semver>.md(x)
│  │  ├─ skills/<slug>/<semver>.md(x)
│  │  ├─ workflows/<slug>/<semver>.md(x)
│  │  ├─ playbooks/<slug>/<semver>.md(x)
│  │  └─ config.ts                           # Astro content collections schema = ADR-0002 entities
│  │
│  ├─ pages/                                 # Astro routes (ADR-0006)
│  │  ├─ index.astro
│  │  ├─ {tips,skills,workflows,playbooks}/
│  │  │  └─ [slug]/
│  │  │     ├─ index.astro                   # moving canonical page (renders latest)
│  │  │     └─ v/[semver].astro              # immutable pinned page (long-TTL)
│  │  └─ api/v1/                             # BUILD-TIME API ENDPOINTS (ADR-0007)
│  │     ├─ index.json.ts                    # manifest: all items+versions+boundary+links (no bodies)
│  │     ├─ [type].json.ts                   # list/index per type (cursor, whitelisted filters)
│  │     └─ [type]/[slug]/
│  │        ├─ index.json.ts                 # latest (moving)
│  │        ├─ index.md.ts                   # latest raw markdown (body + yaml header)
│  │        ├─ versions.json.ts              # all versions
│  │        ├─ versions/[semver].json.ts     # immutable version
│  │        ├─ versions/[semver].md.ts       # immutable raw markdown
│  │        └─ manifest.json.ts              # distribution manifest
│  │
│  ├─ core/                                  # HEXAGONAL CORE (TS) — no I/O; gate lives here (ADR-0004)
│  │  ├─ model/                              # entity types + public-projection types (ADR-0002)
│  │  ├─ recheck/                            # PUBLIC-SAFE RE-CHECK (deny-by-default) — CORE, not adapter
│  │  ├─ redact/                             # redaction transforms
│  │  ├─ version/                            # semver assignment + content-digest (ADR-0005)
│  │  ├─ projection/                         # split public vs sidecar; strip audit-only fields (B3)
│  │  └─ gate/                               # approval state machine + ledger writer (ADR-0003)
│  │
│  ├─ ports/                                 # PORT INTERFACES (ADR-0004)
│  │  ├─ ContentSourceAdapter.ts
│  │  └─ PublishSinkAdapter.ts
│  │
│  ├─ adapters/
│  │  ├─ sources/                            # ContentSourceAdapter impls
│  │  │  ├─ caw02-knowledge/                 # v1
│  │  │  ├─ caw03-skills-registry/           # v1
│  │  │  ├─ stub-internal-wiki/              # documented stub
│  │  │  └─ stub-curated-bundle/             # documented stub
│  │  ├─ sinks/                              # PublishSinkAdapter impls
│  │  │  ├─ site-and-api/                    # v1 = the Astro build + deploy
│  │  │  ├─ mcp-resources/                   # v1 = MCP resources view (projection)
│  │  │  ├─ stub-external-docs-host/         # documented stub
│  │  │  ├─ stub-package-registry/           # documented stub
│  │  │  └─ stub-syndication/                # documented stub
│  │  └─ registry.ts                         # config-driven adapter registry
│  │
│  ├─ lib/                                   # shared helpers (digest, canonical-serialize, manifest build)
│  └─ components/                            # Astro/Starlight UI components (incl. 410 tombstone)
│
├─ _audit/                                   # AUDIT SIDECAR — NEVER served, NEVER in dist/ (ADR-0005/0003)
│  ├─ sidecar/
│  │  └─ {type}/<slug>/<semver>.audit.json   # origin_ref, origin_version, redaction internals
│  └─ _events.log                            # hash-chained append-only publish ledger (ADR-0003)
│
├─ public/                                   # static passthrough (llms.txt, robots.txt, favicon)
├─ dist/                                     # BUILD ARTIFACT (gitignored) → deployed by the sink
│  ├─ {type}/<slug>/...                      # HTML pages (moving + /v/<semver>)
│  ├─ api/v1/...                             # static .json + .md + index.json + manifests
│  ├─ skills/.../<slug>@<semver>.skill/      # downloadable bundles (ADR-0007)
│  └─ pagefind/                              # client-side search index
│
├─ tests/                                    # incl. test: audit-only fields NEVER appear in dist (B3)
├─ astro.config.mjs
├─ package.json + lockfile                   # version pins (see tech-stack.md)
└─ tsconfig.json
```

## Where each ADR concept lands

| Concept | Location | ADR |
|---------|----------|-----|
| Served corpus (frozen, vetted) | `src/content/{type}/<slug>/<semver>.md(x)` | [0005](../01-decisions/ADR-0005-storage-and-versioning.md) |
| Collection schema = entity model | `src/content/config.ts` | [0002](../01-decisions/ADR-0002-content-model.md)/[0006](../01-decisions/ADR-0006-web-stack.md) |
| Audit-only sidecar (never served) | `_audit/sidecar/{type}/<slug>/<semver>.audit.json` | [0002](../01-decisions/ADR-0002-content-model.md)/[0005](../01-decisions/ADR-0005-storage-and-versioning.md) |
| Hash-chained publish ledger | `_audit/_events.log` | [0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| Public-safe re-check (deny-by-default) | `src/core/recheck/` | [0004](../01-decisions/ADR-0004-import-and-ports.md) |
| Public projection / strip sidecar | `src/core/projection/` | [0002](../01-decisions/ADR-0002-content-model.md)/[0006](../01-decisions/ADR-0006-web-stack.md) |
| semver + content-digest | `src/core/version/` + `src/lib/` | [0005](../01-decisions/ADR-0005-storage-and-versioning.md) |
| Ports | `src/ports/` | [0004](../01-decisions/ADR-0004-import-and-ports.md) |
| v1 + stub adapters | `src/adapters/{sources,sinks}/` | [0004](../01-decisions/ADR-0004-import-and-ports.md) |
| HTML pages (moving + pinned) | `src/pages/{type}/[slug]/` | [0006](../01-decisions/ADR-0006-web-stack.md) |
| API endpoints (JSON/md/manifest) | `src/pages/api/v1/` | [0007](../01-decisions/ADR-0007-api-design.md) |
| Build artifact (deployed) | `dist/` (gitignored) | [0006](../01-decisions/ADR-0006-web-stack.md) |

## Layout rules (load-bearing)

1. **Served vs audit are physically separate trees.** `src/content/` is served; `_audit/` is **never** read by any
   endpoint and **never** copied into `dist/`. A test asserts no `_audit`/sidecar field appears in `dist/` (B3 — see
   [./data-flow.md](./data-flow.md)). This is the structural public-safe guarantee.
2. **`<semver>` is a file/dir name, frozen forever.** Once `src/content/{type}/<slug>/<semver>.md(x)` is published it
   is never edited and the `(slug, semver)` pair is never reused — an edit is a **new** `<semver>` file
   ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
3. **The gate lives in `src/core/`, not in adapters.** Adapters only move bytes across the import/export boundary;
   the deny-by-default re-check and approval state machine are core, so swapping a source/sink cannot bypass them.
4. **`dist/` is derived and gitignored.** The source of truth is `src/content/` + `_audit/` + git history; `dist/` is
   regenerable by `astro build` and owned by the `SiteAndApiSinkAdapter`.
5. **Stubs are real directories with documented interfaces**, not TODO comments — future sources/sinks plug in
   without redesign ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).

## Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Type dir | plural, fixed set | `skills/` |
| Slug | kebab-case, stable, URL segment | `triage-incident` |
| Version file | semver `.md`/`.mdx` | `2.1.0.md` |
| Sidecar | `<semver>.audit.json` under `_audit/sidecar/{type}/<slug>/` | `2.1.0.audit.json` |
| Bundle | `<slug>@<semver>.skill/` | `triage-incident@2.1.0.skill/` |
| MCP uri | `caw04://{type}/{slug}@{semver}` | `caw04://skills/triage-incident@2.1.0` |

## Open Questions

> Mirror into `../08-research-plan/open-questions.md`.

- TODO(open-question: does a slug ever change (rename) — 301 from old slug vs new item + provenance link).
- TODO(open-question: do some entities need custom Astro pages outside the Starlight layout — [ADR-0006](../01-decisions/ADR-0006-web-stack.md)).
- TODO(open-question: large-asset placement — `assets/` by path/CDN vs in-repo; size limits before bundling).
- TODO(open-question: exact sidecar field set inside vs outside the hashed digest envelope — [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

## Implications for runbooks

- **RB (scaffold):** create the tree above; wire `src/content/config.ts` to the entity schema; gitignore `dist/`.
- **RB (content-from-git landing):** the import adapter writes `src/content/{type}/<slug>/<semver>.md(x)` + the
  `_audit/sidecar/...` record after the core re-check.
- **RB (endpoints):** implement `src/pages/api/v1/**` from `getCollection()`; add the B3 served-vs-audit test.
- **RB (adapters):** scaffold v1 sources/sinks + documented stub dirs + `registry.ts`.

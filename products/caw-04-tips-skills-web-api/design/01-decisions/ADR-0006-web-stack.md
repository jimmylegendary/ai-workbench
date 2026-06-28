# ADR-0006: Web stack — Astro + Starlight, content-from-git, SSG static output

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§4 surfaces, §6 data, §10 non-goals, §11 guardrails)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack.md) (research this ADR ratifies)
  - [./ADR-0005-storage-and-versioning.md](./ADR-0005-storage-and-versioning.md) (md/MDX-first source + version identity)
  - [./ADR-0002-content-model.md](./ADR-0002-content-model.md) (collection schema = the entities)
  - [./ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate.md) (only `boundary=public` may be emitted)
  - [./ADR-0004-import-and-ports.md](./ADR-0004-import-and-ports.md) (the build is the `SiteAndApiSinkAdapter`)
  - [./ADR-0007-api-design.md](./ADR-0007-api-design.md) (the JSON/markdown API co-generated from the same source)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

CAW-04's primary surface is a **public website** (browse/read) plus a **REST API** (programmatic read), serving the
same content as **markdown and/or JSON** (brief §4, §6). Driving constraints:

- **Read-only public surface**; no public write API, no user accounts (brief §10) → favors prebuilt/static output;
  no per-request app server on the public path.
- **Public-safe only; never leak confidential data** (brief §11, the most critical guardrail) → the build must emit
  ONLY a vetted corpus; **no live pull from internal/upstream stores at request time**.
- **Markdown/MDX-first in git + an index for the API** (brief §6, [ADR-0005](./ADR-0005-storage-and-versioning.md))
  → content-from-git; the website and the API read the **same files**.
- **One source → web + REST, two surfaces** (brief §4) → need a single pipeline emitting HTML pages and JSON/markdown.
- **Immutable, addressable versions** (brief §5) → URLs carry version; old versions stay reachable as static files.
- **Ports & adapters, no shared substrate** (brief §1, §8) → the website build = the `PublishSinkAdapter` and must be
  swappable without bleeding another product's runtime.

## Options considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Astro 5 + Starlight** | Content-first SSG; typed **content collections** (schema-validated frontmatter); file-based **endpoints** emit `*.json`/`*.md` from the SAME collections at build → web + API from one source, no second store; Starlight gives docs UX (search, nav, per-version routing); minimal JS shipped | Smaller React app-ecosystem if heavy interactivity later; Starlight layout opinionated | **Chosen** — the only candidate that co-generates the API from the same content (satisfies brief §4/§6 directly) |
| Next.js | Most flexible; route handlers = real REST API; ISR | Heaviest runtime; pulls in a React app server (tension w/ read-only/no-extra-substrate); larger attack surface | Overkill v1; revisit only if rich interactivity needed |
| Docusaurus / VitePress / Nextra | Proven docs UX; built-in versioning/search | No native "emit JSON API from same source" path; you bolt on a separate API → drift risk | Web-only viable; loses the unified web+API win |
| MkDocs / Hugo / Eleventy | Very fast builds; mature | API-from-same-source is manual glue; weaker typed content schema | Workable, more glue |

Delivery model: **prebuilt static JSON + raw markdown** (build-time endpoints) over a runtime/SSR API — the static
artifact is the safest reading of the public-safe guardrail (no request-time code path back into internal stores).

## Decision

**v1 web stack: Astro 5 + Starlight, content-from-git, SSG static output, deployed behind the `SiteAndApiSinkAdapter`.**

- **Web framework:** **Astro 5 with Starlight**. Content lives as **content collections** with typed frontmatter
  whose schema is the [ADR-0002](./ADR-0002-content-model.md) entity model (id, kind, title, version,
  boundary, source/provenance, inputs/outputs, preconditions, status). Starlight supplies search, sidebar nav, and
  per-version routing so we do not hand-roll navigation.
- **Source of truth:** **markdown/MDX in CAW-04's own git repo** ([ADR-0005](./ADR-0005-storage-and-versioning.md)),
  populated by import adapters **after** the public-safe re-check ([ADR-0004](./ADR-0004-import-and-ports.md)). Large
  assets by path/CDN. **No headless/DB CMS** — that conflicts with brief §6 and the no-shared-substrate posture.
- **Rendering strategy: SSG (prebuild everything).** The published set is a frozen, vetted, static artifact;
  smallest attack surface; cheapest; old versions persist as static files. SSR/ISR are rejected for v1 (a runtime
  substrate + leak surface unjustified at curator-paced, low-frequency publishing). Rebuild is triggered by the
  `PublishSinkAdapter` on approve/update/unpublish.
- **One source → two surfaces:** Astro's file-based **endpoints** import the **same** `getCollection()` data the
  pages use, serializing the exact same entries to JSON and raw `.md` at build time (the API contract is owned by
  [ADR-0007](./ADR-0007-api-design.md)). This guarantees web/API parity from one store — no second source of truth,
  no drift.
- **Public-safe by construction (defense for brief §11):** a **build-time invariant asserts `boundary === "public"`
  for every emitted item** (page, JSON, and markdown) and **fails the build** otherwise. This is the last static
  backstop behind the import re-check ([ADR-0004](./ADR-0004-import-and-ports.md)) and the gate ([ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate.md)).
  The **public projection** strips audit-only fields ([ADR-0002](./ADR-0002-content-model.md)) before
  any serialization; a test asserts they never appear in output.
- **Search:** v1 = prebuilt **client-side index** (Pagefind-style). A runtime search endpoint is a documented later
  adapter, not v1 (it would force a runtime substrate).
- **Versioning surfaced in URLs** ([ADR-0005](./ADR-0005-storage-and-versioning.md)): a **moving** canonical page per
  artifact (renders latest; `rel=canonical` to itself) and **immutable** `/{type}/{slug}/v/{semver}` pages (set
  `rel=canonical` to the moving URL, served `Cache-Control: public, max-age=31536000, immutable`). Redacted version
  addresses and unpublished item addresses render **410 Gone** tombstone pages, excluded from sitemap/index.
- **Deploy:** static hosting + CDN; rebuild+deploy is the `PublishSinkAdapter` action on an approved publish event.
  Keeping it behind the adapter lets an alternate sink (external docs host, package registry, syndication — brief §8)
  plug in without touching the content model.

```
import (ADR-0004) → public-safe re-check → git repo (ADR-0005)
  src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
        │  Astro Content Collections (typed, one in-memory corpus)
        ├─► Pages:    src/pages/{type}/[slug]/[semver].astro       → HTML (Starlight)
        ├─► JSON API: src/pages/api/v1/{type}/[slug]/[semver].json.ts (ADR-0007)
        ├─► Raw MD:   src/pages/api/v1/{type}/[slug]/[semver].md.ts
        └─► Manifest: src/pages/api/v1/index.json.ts
        ▼  astro build (SSG) → dist/ (HTML + .json + .md) → CDN
        ▲  build-time assert: every emitted item boundary === "public", else fail
```

## Consequences

- **Easy:** one content set feeds pages + JSON/`.md` endpoints — web/API parity for free; nothing live-queries
  internal data; cheap, cacheable, low attack surface; nothing shared with sibling products.
- **Easy:** old versions are just static files (immutable, addressable per [ADR-0005](./ADR-0005-storage-and-versioning.md)).
- **Hard / cost:** updates require rebuild+deploy (fine at curator cadence); precomputed-only filtering/pagination
  on the static path (search starts client-side); thousands of large media need asset-by-path discipline.
- **Follow-on runbooks:** scaffold Astro 5 + Starlight with collection schemas matching [ADR-0002](./ADR-0002-content-model.md);
  content-from-git landing path used by [ADR-0004](./ADR-0004-import-and-ports.md); the `boundary === "public"`
  build-time assertion + public-projection test; build & deploy wired as the `SiteAndApiSinkAdapter`; client-side
  search index with a documented stub for a future runtime search endpoint.

## Open questions / revisit triggers

- TODO(open-question: does Starlight's doc-centric layout/versioning fit the Tip/Skill/Workflow/Playbook entity model,
  or do some entities need custom Astro pages).
- TODO(open-question: rebuild+deploy trigger mechanism for the `PublishSinkAdapter` — webhook vs CI-on-git-push vs
  scheduled). Ties to [ADR-0005](./ADR-0005-storage-and-versioning.md) publish events.
- TODO(open-question: cache/CDN purge bound on unpublish/redact — a public artifact may be edge-cached; what is the
  time-to-purge guarantee). Shared with [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate.md)/[ADR-0007](./ADR-0007-api-design.md).
- TODO(open-question: is a client-side Pagefind-style index sufficient for v1, or do agents need a server-side
  query/filter endpoint — which would force a runtime).
- **Revisit trigger:** a requirement for rich per-request interactivity or dynamic queries would reopen SSG-vs-SSR
  (toward Next.js / an SSR adapter) — but only behind the same `PublishSinkAdapter` seam.

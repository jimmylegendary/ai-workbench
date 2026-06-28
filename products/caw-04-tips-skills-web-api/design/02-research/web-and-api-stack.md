# Web & API Stack

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - `../01-decisions/ADR-0006-web-and-api-stack.md` (TODO: to be written from this doc)
  - `../08-research-plan/open-questions.md` (TODO: link when created)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc decides the **web framework + REST API stack** for CAW-04's public read surface, and the mechanism by
which a single **markdown source of truth** becomes BOTH rendered web pages AND machine-readable API responses
(markdown and/or JSON). It compares static-site/web options (Astro, Next.js, Docusaurus/Starlight, others), API
delivery styles, and content-from-git vs headless CMS, then recommends a v1 stack.

It does NOT decide the content model/entities (Tip/Skill/Workflow/…), the public-safe publish gate, the import
adapters, or the versioning scheme — those have their own ADRs. It assumes the brief's direction: **markdown/MDX-
first in git as source of truth + an index for the API** (brief §6), read-only public surface, curator-only
publish (brief §10), ports & adapters (brief §8).

## Constraints that drive the choice (from the brief)

| # | Constraint | Stack implication |
|---|------------|-------------------|
| C1 | Public surface, **read-only**; no public write API, no user accounts (§10) | Favors static/prebuilt output; no per-request app server needed for the public path |
| C2 | **Public-safe only**; never leak confidential data (§11, the most critical guardrail) | Build must publish ONLY a vetted, public corpus; no live pull from internal stores at request time |
| C3 | Markdown/MDX-first in git as source of truth + an index for the API (§6) | Content-from-git, not a headless CMS DB; the SSG and the API read the same files |
| C4 | Same content served as **web + REST**, markdown and/or JSON (§4) | Need one pipeline that emits HTML pages and JSON/markdown endpoints from one source |
| C5 | Versioned, immutable, addressable published versions (§5) | URLs/endpoints must carry version; old builds/versions stay reachable |
| C6 | Ports & adapters, no shared substrate (§8) | The `PublishSinkAdapter` = "web build + REST API" must be swappable; stack must not bleed other products' runtimes |
| C7 | Agents fetch skills/workflows via API (§3) | Stable, documented JSON contract + content negotiation; CORS open for public read |

## Decision 1 — Web / static-site framework

Candidates grounded in current (2026) tooling. Docs-focused frameworks (Starlight, Docusaurus, Nextra, VitePress)
vs general content frameworks (Astro, Next.js).

| Option | What it is | Pros | Cons | Fit for CAW-04 |
|--------|-----------|------|------|----------------|
| **Astro (+ Starlight)** | Content-first SSG; islands; Content Layer API for typed collections; file-based **endpoints** that emit JSON at build | Minimal JS shipped; first-class markdown/MDX **content collections** with schema validation; **endpoints** generate `*.json` from the SAME collections → web + API from one source; Starlight gives docs UX (search, nav, versions) out of the box | Smaller React ecosystem if heavy app UI later; Starlight opinionated layout | **Strong.** Directly satisfies C3/C4 — one content set → pages + `.json` endpoints. Best alignment. |
| **Next.js** | Full-stack React; App Router, RSC, API routes, SSR/ISR | Most flexible; route handlers give a real REST API; ISR for incremental updates | Heaviest runtime; pulls in a React app server (tension with C1 "read-only, prebuilt" and C6 "no extra substrate"); more attack surface for a public read site | Overkill for v1 read-only docs; revisit only if rich interactivity needed |
| **Docusaurus** | Meta's React+MDX docs platform | Proven for OSS docs; built-in versioning, search, i18n | React/MDX heavier output; **no native "emit JSON API" path** — you bolt on a separate API; versioning is doc-centric, not item/provenance-centric | Good docs UX but weak on the API-from-same-source requirement (C4) |
| **VitePress / Nextra** | Vue (VitePress) / Next-based (Nextra) docs SSGs | Fast, simple, popular in 2026 | Same gap as Docusaurus for a co-generated JSON API; Nextra ties to Next runtime | Viable web-only; lose the unified web+API win |
| **MkDocs / Hugo / Eleventy** | Python (MkDocs) / Go (Hugo) / JS (Eleventy) SSGs | Very fast builds; mature | API-from-same-source is manual; less type-safe content schema than Astro collections | Workable but more glue for C4 |

**Pick: Astro + Starlight** for the website. The deciding factor is C4: Astro **content collections** (one typed
markdown/MDX corpus) feed BOTH the rendered pages AND file-based **endpoints** (`src/pages/api/...json.ts`) that
serialize the exact same entries to JSON at build time — no second content store, no drift. Starlight layers on the
docs UX (search, sidebar, per-version routing) so we don't hand-roll navigation.

## Decision 2 — REST API delivery style

The API is **read-only** and serves the same corpus as the website. Two delivery models:

| Option | How it works | Pros | Cons | Fit |
|--------|--------------|------|------|-----|
| **Prebuilt static JSON (build-time endpoints)** | Astro endpoints emit `/api/v1/skills.json`, `/api/v1/skills/{id}.json`, `/api/v1/skills/{id}/{version}.json`, plus `.md` raw files, written as static files at build | No server to run; cacheable on CDN; cheap; matches C1/C2 (nothing live-queries internal stores); trivially scalable | No request-time logic (filtering/pagination must be precomputed); updates only on rebuild | **v1 default** |
| **Runtime API (SSR route handlers / small service)** | A server (Astro SSR adapter, or a tiny separate API app) reads the index/files per request | Dynamic queries, search params, pagination, content negotiation logic | Adds a runtime substrate + ops + attack surface (tension w/ C1/C6); harder public-safe guarantee | Defer; only if query needs outgrow static |
| **Hybrid** | Static JSON for items/lists + one small search endpoint (or client-side search index) | Keeps bulk static; adds search where static struggles | Two delivery paths to maintain | Likely **v1.x** for search |

**Pick: prebuilt static JSON + raw markdown files, generated by the same build.** This is the safest reading of
C2 — the public artifact is a frozen, vetted set of files; there is no live code path from a public request back
into any internal or upstream store. Search starts as a **client-side index** (Starlight/Pagefind-style) or a
prebuilt `search-index.json`; a runtime search endpoint is a later, optional adapter.

### Content negotiation & shapes

Serve three representations of each item, all built from one source entry:

| Representation | URL pattern | Use |
|----------------|-------------|-----|
| HTML page | `/skills/{id}/` (latest), `/skills/{id}/{version}/` | Human web reading |
| JSON | `/api/v1/skills/{id}.json`, `/api/v1/skills/{id}/{version}.json` | Agents/programmatic; structured metadata (inputs/outputs, provenance, boundary, version) |
| Raw markdown | `/api/v1/skills/{id}.md` (or `.../{version}.md`) | Agents that want the source body to feed an LLM |

Plus collection/index endpoints: `/api/v1/skills.json`, `/api/v1/index.json` (manifest of all items + versions +
boundary tag, no bodies). Optional `Accept`-header negotiation (`text/markdown` vs `application/json`) can be a
thin CDN/edge rule later; **explicit extensions are the v1 contract** because they are static-file friendly and
unambiguous for agents (avoids needing SSR to branch on headers). See GitHub/GitLab markdown render APIs and the
`restdown`/`markdown-to-api` patterns for prior art on emitting HTML + JSON from one markdown source.

## Decision 3 — Content-from-git vs headless CMS

| Option | Pros | Cons | Fit for CAW-04 |
|--------|------|------|----------------|
| **Content-from-git (markdown/MDX in repo)** | Own your content; no network at build; versioning via git + frontmatter `version`; diffable review = natural fit for a **curator approval / publish gate**; no extra runtime (C6); cheapest public-safe story (the repo IS the vetted corpus) | Rebuild per change; weak for thousands of large media assets (store by path/CDN); editing UX is files+PR, not a WYSIWYG | **Chosen.** Matches brief §6 exactly and the publish gate is a PR/curator step. |
| **Git-based CMS (editor on top of git, e.g. CloudCannon/Decap-style)** | Adds editing UX while keeping git as source of truth | Extra tool; still rebuild-on-change | Optional later for curator ergonomics; does not change the architecture |
| **API/headless CMS (DB-backed, e.g. Sanity/Contentful-style)** | Editorial workflows, real-time, scales to many pages; faster builds at scale | Content leaves git; adds a service + DB (shared-substrate smell, C6); content-leak surface; provenance/version harder to pin to git history | **Rejected for v1.** Conflicts with §6 and the public-safe/own-data posture. |

CAW-04 imports validated entries from **CAW-02 (a separate product)** and **CAW-03 / a skills registry (a separate
product)** through the `ContentSourceAdapter`. Those imports land as markdown/MDX files in CAW-04's OWN repo after
the **public-safe re-check** (brief §7). The website build and the API both read those files — this is the import
boundary, not a shared store.

## Decision 4 — SSG vs SSR for the public read path

| Strategy | Pros | Cons | Fit |
|----------|------|------|-----|
| **SSG (prebuild everything)** | Fastest, cheapest, most cacheable; smallest attack surface; the published set is a frozen vetted artifact (C2); old versions stay as static files (C5) | Content updates require a rebuild+deploy; not for second-by-second data (irrelevant here — curator-paced publishes) | **v1 choice** |
| **ISR / on-demand** | Incremental updates without full rebuild | Needs a runtime; marginal benefit at our publish cadence | Defer |
| **SSR** | Per-request dynamic | Runtime substrate, ops, leak surface; unjustified for read-only curated content | Reject for v1 |

Publish cadence is curator-gated and low-frequency, so **SSG** wins on every axis that matters (cost, safety,
simplicity). Rebuild is triggered by the `PublishSinkAdapter` when an item is approved/updated/unpublished.

## Recommended v1 stack

- **Web:** **Astro 5+ with Starlight**, content as **content collections** (typed frontmatter via schema).
- **API:** **build-time Astro endpoints** emitting static **JSON** + **raw markdown** files + an `index.json`
  manifest; collection and per-item/per-version routes; **SSG** output to a CDN/static host.
- **Source of truth:** **markdown/MDX in CAW-04's own git repo** (content-from-git), populated by import adapters
  after the public-safe re-check; large assets by path/CDN.
- **Search:** client-side / prebuilt search index (Pagefind-style) in v1; runtime search endpoint deferred.
- **Versioning:** version in frontmatter + in URL/endpoint path; published versions are immutable static files.
- **Deploy:** static hosting + CDN; rebuild triggered by approved publish events. Keep the build as a swappable
  `PublishSinkAdapter` so an alternate sink (external docs host, package registry, syndication — brief §8) can plug
  in without touching the content model.

### Why this stack (summary)

1. **One source, two surfaces (C3/C4):** Astro collections feed pages AND JSON/`.md` endpoints — no second store,
   no drift, no live query into internal data.
2. **Public-safe by construction (C2):** the deployed artifact is a frozen, vetted, static file set; no request-time
   path back into CAW-02/CAW-03 or any confidential store.
3. **Cheap + simple + low attack surface (C1/C6):** no app server/DB runtime for the public path; nothing shared
   with sibling products.
4. **Versionable + auditable (C5):** git history + frontmatter + per-version URLs/files give immutable, addressable
   versions and a provenance trail.

## How markdown source becomes web pages AND API responses (the pipeline)

```
CAW-02 / CAW-03 import (ContentSourceAdapter)
        │  (cross-boundary; public-safe RE-CHECK happens here)
        ▼
CAW-04 git repo: src/content/{tips,skills,workflows,playbooks}/<id>/<version>.md(x)
        │  frontmatter: id, title, version, boundary=public, source(provenance),
        │               inputs/outputs, preconditions, status
        ▼
Astro Content Collections  ── typed, schema-validated load (one in-memory corpus)
        ├──────────────► Pages:     src/pages/skills/[id]/[version].astro  → HTML (Starlight UI)
        ├──────────────► JSON API:  src/pages/api/v1/skills/[id]/[version].json.ts → GET → Response(JSON)
        ├──────────────► Raw MD:    src/pages/api/v1/skills/[id]/[version].md.ts   → GET → Response(markdown)
        └──────────────► Manifest:  src/pages/api/v1/index.json.ts → list (id,version,boundary,links)
        ▼
astro build (SSG)  → dist/ static files (HTML + .json + .md)  → CDN
```

Key point: the JSON/markdown endpoints import the **same** `getCollection()` data the pages use, so the API is a
serialization of the rendered corpus — guaranteeing web/API parity and that **only published, public-safe items**
ever appear in either. A build-time invariant should assert `boundary === "public"` for every emitted item and fail
the build otherwise (defense for C2).

## Open Questions

> Mirror into `../08-research-plan/open-questions.md` when created.

- TODO(open-question: content-negotiation) — Ship explicit-extension routes only (`.json`/`.md`), or also add an
  edge/CDN `Accept`-header rule? Decision affects whether any runtime/edge layer is introduced.
- TODO(open-question: search) — Is a prebuilt client-side index (Pagefind-style) sufficient for v1, or do agents
  need a server-side query/filter endpoint (forcing SSR/runtime)?
- TODO(open-question: api-versioning) — Pin the API path prefix as `/api/v1`; what is the deprecation policy when
  the JSON schema changes vs when an item's content version changes (two different "versions")?
- TODO(open-question: starlight-fit) — Does Starlight's doc-centric layout/versioning fit the Tip/Skill/Workflow/
  Playbook entity model, or do we need custom Astro pages for some entities?
- TODO(open-question: rebuild-trigger) — Mechanism for the `PublishSinkAdapter` to trigger rebuild+deploy on
  approve/update/unpublish (webhook vs CI on git push vs scheduled). Ties to versioning ADR.
- TODO(open-question: openapi) — Do we publish an OpenAPI/JSON-Schema description of the read API for agents, and
  where does it live (static `/api/v1/openapi.json`)?
- TODO(open-question: unpublish) — How does unpublish/redact (§3 use case 4) reconcile with "immutable static
  versions" — remove from manifest + add tombstone, or also delete the file?

## Implications for runbooks

- **RB (scaffold web app):** init Astro 5 + Starlight; define content collection schemas matching the content-model
  ADR's entities and frontmatter (id, version, boundary, provenance, inputs/outputs, preconditions, status).
- **RB (content-from-git source):** create `src/content/<entity>/<id>/<version>.md(x)` layout; document the import
  landing path used by `ContentSourceAdapter` after the public-safe re-check.
- **RB (API endpoints):** implement build-time endpoints for per-item/per-version JSON, raw markdown, collection
  lists, and `index.json` manifest, all reading via `getCollection()`; add the `boundary === "public"` build-time
  assertion.
- **RB (build & deploy as PublishSinkAdapter):** SSG build → static host/CDN behind the adapter interface; wire the
  rebuild trigger; ensure old versions remain addressable.
- **RB (search):** add prebuilt/client-side search index; leave a documented stub for a future runtime search
  endpoint.
- **Safety check in CI:** fail the build if any non-public-boundary item would be emitted to web or API.

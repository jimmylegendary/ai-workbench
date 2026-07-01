# OSS / self-host tool survey — choosing the UI base

> ⚠️ **HISTORICAL (2026-07-02):** this survey scoped the OLD design — a public-safe, read-only, **static** publisher.
> CAW-04 was that same day redefined as an **internal interactive platform** (runtime + DB + auth), which invalidates
> the static/public-safe premise and the Astro+Starlight conclusion below. See
> [../03-architecture/v2-interactive-platform-decision.md](../03-architecture/v2-interactive-platform-decision.md)
> for the current decision (Payload 3 + Next.js + shadcn).

- **Status:** superseded (static scope)
- **Owner:** Jimmy
- **Last-reviewed:** 2026-07-02
- **Related:**
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md) (this survey validates + refines it)
  - [./web-and-api-stack.md](./web-and-api-stack.md)
  - [../06-interfaces/website.md](../06-interfaces/website.md), [../06-interfaces/rest-api.md](../06-interfaces/rest-api.md)
  - [../03-architecture/tech-stack.md](../03-architecture/tech-stack.md), [../03-architecture/repo-structure.md](../03-architecture/repo-structure.md)

## Purpose

Before building the Open-Design-compatible UI, survey the field of **OSS + self-hostable** tools to see whether any
turnkey product satisfies CAW-04's requirements, and if not, pick the best-fit foundation to base the UI on. Method:
per-candidate live web research (2025-2026) scored against a 12-point rubric, then adversarial verification of the
load-bearing claims for promising candidates, plus a completeness pass for missed tools.

## Requirement rubric (R1-R12)

R1 OSS + self-hostable · R2 public-safe by construction (static SSG, no request-time path to internal store) ·
R3 docs IA (top nav + per-section left sidebar + right TOC) · R4 typed structured content model (per-collection
schema; provenance/boundary/steps[]/contains[]) · R5 **per-artifact** semver versioning (immutable `/v/{semver}` +
moving latest + selector + versions index) · R6 410 Gone tombstones · R7 co-generated read-only REST API from the
same source (JSON envelope + raw .md + content negotiation + index.json + pagination/filters) · R8 SKILL.md /
manifest.json / .skill bundle · R9 MCP resources view · R10 client-side prebuilt search (Pagefind-style) ·
R11 git-backed markdown, no DB CMS · R12 Open Design compatibility (DTCG tokens -> Tailwind v4 -> shadcn/Radix).

## Bottom line: no turnkey tool meets all 12

CAW-04's four *defining* requirements structurally conflict with every off-the-shelf docs product:

| Blocker | Why turnkey fails |
|---|---|
| **R5 per-artifact semver** | Every tool with versioning (Docusaurus, mkdocs+mike, Read the Docs, Antora, `starlight-versions`) does **whole-site snapshots** (v1/v2), the exact anti-pattern the spec rejects. Per-artifact `/{type}/{slug}/v/{semver}` is custom everywhere. |
| **R7 co-generated API** | Only engines with programmable build-time endpoints (Astro static endpoints, Hugo custom output formats, Eleventy/Next route handlers) can emit HTML + JSON + raw md from one source. Accept-negotiation + cursor/whitelist filters need a host/edge layer. |
| **R2 public-safe static** | Rules out all DB-backed tools (Backstage, Outline/Wiki.js/BookStack/Docmost, GitBook self-host) — a live request-time path to the store always exists. |
| **R6 410 · R9 MCP** | A frozen static artifact cannot emit a real 410 or serve MCP; both need a host rule (nginx/`_headers`) or a small separate server. |

## Scored matrix (adjusted after verification)

FULL = native · PART = buildable in custom code · NONE = unsupported / out of scope.

| Tool | Fit | FULL reqs | Verdict |
|---|---|---|---|
| **Astro 5 Content Collections (raw, no Starlight)** | best 9/12 | R1,R2,R4,R5,R7,R8,R10,R11,R12 | Tightest structural fit: enforced Zod schema (R4) + native JSON/raw-md endpoints from one `getCollection()` (R7) + best DTCG->Tailwind->shadcn path (R12). R3 (nav/sidebar/TOC) must be hand-built. |
| **Astro 5 + Starlight** | moderate | R1,R2,R3,R4,R10,R11 | Same engine; Starlight gives R3 + Pagefind (R10) free. R5/R6/R7/R8 are custom-but-buildable, R9 out of scope. Honestly scored, not inflated. |
| Fumadocs (Next.js) | moderate | 7 (…+R12) | Highest native count + Tailwind/shadcn native, but R5/R6/R8/R9 **NONE** — whole governance/distribution layer absent. |
| Next.js `output:export` + Velite | 8/12 | R1,R2,R4,R5,R7,R10,R11,R12 | Route handlers static-export the API; Velite gives typed layer. R3/R6/R8/R9 custom. |
| VitePress / Nextra | moderate | 5 | Typed schema, versioning, API mostly custom. |
| Docusaurus 3 | weak | 5 | **R5 snapshot versioning conflicts with semver model.** |
| MkDocs Material / Sphinx+RTD | weak | 5 | R5 snapshot + R12 wrong theming ecosystem (not Tailwind/shadcn). |
| Backstage | weak | 2 | Catalog model (R4) fits, but runtime + Postgres violate R2/R11 — opposite architecture. |
| Redocly/Scalar/Stoplight/Zudoku | weak | 1 | Cover the `/api-docs` surface only, not the catalog. |
| DB KBs (Outline/Wiki.js/BookStack/Docmost) | weak | 0 | Live-DB serving fails public-safe. |
| Keystatic / TinaCMS | n/a | — | Authoring layer, not a publishing surface; pairs with an SSG. |

Completeness pass (net-new): raw Astro (above), Next+Velite (above), **Hugo** (Hextra/Docsy — native custom output
formats give real R7, 6/12), **Eleventy** (flexible JSON output, 6/12), **Zola** (fast + built-in search, 5/12),
**Antora** (native versioning but at wrong *component* granularity, AsciiDoc), **Velite** (typed content layer — the
R4/R7 backbone to pair with any JS generator). Excluded on verification: GitBook self-host (calls hosted API — fails
R2), Fern Docs self-host (enterprise, not free OSS — fails R1), Mintlify (not OSS), Docsify (client-side render, no
frozen artifact).

## Decision

**Base the UI on Astro 5 + Starlight** (consistent with ADR-0006). Rationale: the engine choice (Astro) is
unambiguous — it is the only OSS SSG whose typed content collections + static endpoints natively deliver the
"one source -> website + JSON/md API" parity (R4+R7) that is CAW-04's load-bearing property, on a frozen public-safe
artifact (R2). Within Astro, **Starlight** is chosen over a raw custom shell to get the docs IA (R3) and Pagefind
search (R10) for free and reach a working UI fastest, accepting that the brand theme is layered onto Starlight's CSS
system rather than a pure shadcn build.

Caveat recorded: raw Astro (no Starlight) scored higher (9/12) because Starlight's opinionated layout must be
overridden for per-artifact version routing and for full shadcn/DTCG fidelity. If Starlight's chrome later fights the
version-routing / custom entity pages / brand spec too hard, dropping to a raw-Astro shell is the fallback — same
engine, no migration of the content model or API endpoints.

## What is NOT native (build on top of Starlight)

- **R5** per-artifact semver routes — `getStaticPaths` dynamic routes for `/{type}/{slug}/v/{semver}` + moving latest + version selector + versions index; immutable cache headers at host level.
- **R6** 410 tombstones — build a Gone page (reason + superseded_by, excluded from sidebar/sitemap/search); emit real 410 status via host rule (nginx / `_headers`).
- **R7** API — static endpoints emit JSON envelope + raw .md + `index.json` + `.md`/`.json` suffix aliases + pre-baked pagination/filter files natively; Accept-header negotiation + arbitrary cursor/filter queries need an edge/host layer.
- **R8** distribution — `SKILL.md` <-> `manifest.json` endpoint + `.skill` bundle zip keyed by `slug@semver` via an `astro:build:done` hook.
- **R9** MCP — a small separate server wrapping the emitted `index.json` (list) + raw `.md` (read); no shared substrate.

## Open Design pipeline (applies regardless)

`DESIGN.md` (tokens frontmatter) -> DTCG `*.tokens.json` -> **Style Dictionary / Terrazzo** transform -> Tailwind v4
`@theme` (CSS custom properties) -> Starlight theme override + shadcn/ui + Radix components as React islands. DTCG is
not consumed natively by Astro/Tailwind, so the transform tool is the (standard) bridge.

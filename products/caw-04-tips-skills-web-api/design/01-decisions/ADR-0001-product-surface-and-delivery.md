# ADR-0001: Product surface (website + REST API + preview/admin) and content delivery (markdown + JSON + HTML)

- **Status:** proposed
- **Owner:** Jimmy
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
- **Related:**
  - [ADR-0002-content-model.md](./ADR-0002-content-model.md)
  - [ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate.md)
  - ADR-0004 (import, ports & adapters — group B), ADR-0005 (storage & versioning — group B), ADR-0006 (web & API stack — group B)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack.md), [../02-research/skills-distribution-and-api-resources.md](../02-research/skills-distribution-and-api-resources.md), [../02-research/versioning-and-immutability.md](../02-research/versioning-and-immutability.md)

## Context

CAW-04 is the **final publishing/read layer** of the `ai-workbench` family: it publishes already-validated,
public-safe Tips/Skills/Workflows/Playbooks over a public surface (brief §1, §4). It authors nothing and shares no
runtime substrate with the sibling products (brief §1, §11). This ADR fixes **which surfaces exist** and **in what
representations content is delivered** — the outer shape that ADR-0002 (content model), ADR-0003 (publish gate),
and the group-B stack/versioning ADRs all build against.

Forces:
- **Public, read-only, no accounts, curator-only publish** (brief §10). The public path needs no per-request app
  server and should have the smallest possible attack surface.
- **Public-safe-by-construction** (brief §11, the most critical guardrail): there must be no live code path from a
  public request back into any internal/upstream store. The served artifact must be a frozen, vetted set.
- **Three consumer classes, one artifact** (research: skills-distribution §1): human reader (HTML), HTTP agent
  (low-token markdown or JSON), MCP host (JSON catalog). They must be *projections* of one canonical resource, not
  separate sources of truth — so provenance + boundary stay attached to every representation.
- **Curator needs a place to approve** before anything goes live (brief §4): an internal preview/admin surface.
- **Ports & adapters** (brief §8): each surface is a `PublishSinkAdapter` over one core; surfaces must be swappable
  without touching the content model or the gate.

## Options considered

### A. Which surfaces

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Website only** | simplest | no programmatic/agent reuse — kills the "agents fetch skills via API" use case (brief §3) | reject |
| **API only** | machine-first | no human browse surface (brief §4 primary) | reject |
| **Website + REST API + internal preview/admin** (chosen) | covers humans, agents, MCP, and the curator approval step; matches brief §4 exactly | three surfaces to build | **chosen** |
| Website + API + **public** write/admin | editorial UX in-product | violates "no public write API / curator-only" (brief §10) | reject |

### B. Content delivery representation

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **JSON only** | structured, agent-parseable | no human page; markdown agents pay HTML/JSON token tax | reject |
| **Markdown only** | low-token, agent-friendly | no typed envelope for MCP/strict clients; no rendered web | reject |
| **HTML + Markdown + JSON, all projected from one source** (chosen) | one canonical resource → HTML page (humans), raw markdown (`~80%` fewer tokens for agents per research), JSON envelope (MCP/programmatic); provenance+boundary travel with each | must keep three projections in parity | **chosen** |

### C. How the public path is served

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **SSG: prebuild everything to static files** (chosen) | cheapest, most cacheable, smallest attack surface; the deployed set is a frozen vetted artifact (no request-time path into internal stores); old versions stay as static files | rebuild+deploy per publish | **chosen** — publish cadence is curator-paced + low-frequency |
| SSR / runtime API | dynamic queries at request time | adds a runtime substrate + ops + leak surface; unjustified for read-only curated content | defer |
| Hybrid (static + one search endpoint) | dynamic search where static struggles | two delivery paths | v1.x for search only |

## Decision

CAW-04 ships **three surfaces over one product core**, each a `PublishSinkAdapter` (brief §8):

1. **Public website** — human browse/read; rendered **HTML** pages.
2. **Public REST API** — read-only programmatic access for agents and MCP hosts.
3. **Internal preview/admin** — the curator (Jimmy) reviews gate findings and approves publication (brief §4, §11).
   This surface is never public and is the *only* path that promotes a gate-passing candidate to live (see ADR-0003 G8).

**Delivery = markdown AND JSON AND HTML, all projected from one canonical source entry.** Per published artifact and
version we serve: an HTML page, a raw `.md` body (frontmatter + body), and a structured JSON envelope (body +
reusable/auditable metadata per ADR-0002). These are projections of a single resource — never independent stores —
so provenance and the public-safe boundary stay attached to every representation.

The public path is **statically pre-built (SSG)**: the deployed artifact is a frozen, vetted, static file set with
**no request-time path back into any internal or upstream store**. A build-time invariant asserts
`boundary == public` for every emitted item and **fails the build otherwise** (defense for brief §11; see ADR-0003).
Search starts as a prebuilt/client-side index; a runtime search endpoint is a deferred, optional adapter.

**Content negotiation:** explicit `.md`/`.json` extensions/suffixes are the v1 contract (static-file friendly,
unambiguous for agents), with `Accept`-header negotiation (`text/markdown` vs `application/json`) as the canonical
secondary mechanism where an edge layer exists. Default representation: HTML on the website host, JSON on the API
host. Detailed resource tree, pagination, filtering, and the `.skill`/MCP distribution forms are fixed in
ADR-0006 / the skills-distribution research; this ADR fixes only that **all three representations exist and derive
from one source**.

The concrete framework (Astro + Starlight), the API resource scheme, and the build/deploy pipeline are decided in
**ADR-0006** (group B). This ADR constrains them: read-only, prebuilt, one-source-many-projections, no shared substrate.

## Consequences

- **Easy:** cheap CDN hosting; trivial horizontal scale; strong public-safe story (frozen vetted files); web/API
  parity is structural because every projection reads the same source entry.
- **Easy:** adding a surface later (external docs host, package registry, syndication, MCP registry listing) is a new
  `PublishSinkAdapter` over the same core (brief §8) — no content-model or gate change.
- **Hard:** any feature needing request-time logic (dynamic filtering beyond precomputed indexes, server-side search,
  personalization) requires introducing a runtime adapter later — deliberately deferred.
- **Hard:** every publish/unpublish triggers a rebuild+deploy; the rebuild trigger mechanism is follow-on work.
- **Follow-on:** ADR-0006 picks the stack and resource scheme; ADR-0005 fixes versioned addressing the surfaces must
  honor; ADR-0003's `boundary == public` build assertion must be wired into CI.

## Open questions / revisit triggers

- TODO(open-question: content-negotiation) — extension-only routes vs an added `Accept`-header edge rule (decides
  whether any runtime/edge layer enters). See [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack.md).
- TODO(open-question: search) — is a prebuilt client-side index enough for v1, or do agents need a server-side
  query/filter endpoint (which would force a runtime)?
- TODO(open-question: rebuild-trigger) — how the `PublishSinkAdapter` triggers rebuild+deploy on approve/update/unpublish.
- **Revisit trigger:** if interactivity or query needs outgrow static delivery, re-open Option C (runtime/SSR adapter).

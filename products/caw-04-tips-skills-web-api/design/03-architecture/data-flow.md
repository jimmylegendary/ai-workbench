# Data Flow — import, build, publish, unpublish/redact

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./tech-stack.md](./tech-stack.md) (the components each stage runs on)
  - [./repo-structure.md](./repo-structure.md) (where each artifact lives on disk)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md) (ports; re-check is a CORE stage)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (git store, semver+digest, 410 tombstones)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md) (Astro SSG, boundary build invariant)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (static JSON + raw md + manifest)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (deny-by-default gate, hash-chained ledger)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc describes the four data flows that move content through CAW-04: **import** (discover → re-check → write
markdown to git), **build** (Astro SSG → HTML + static JSON + raw markdown + `index.json`/manifest), **publish**
(deploy via a `PublishSinkAdapter`), and **unpublish/redact** (tombstone + cache purge). It shows where the
public-safe property is enforced and why the deployed artifact is **public-safe by construction**. It does NOT
re-decide stack, storage, or API contracts (those are their ADRs) — it sequences them.

## The one invariant every flow protects

A public byte may exist on the website/API **only if** it passed the **core public-safe re-check** AND carries
`boundary == "public"` AND `provenance.public_safe_recheck == passed`. Upstream boundary claims are **evidence
only**; the gate is **deny-by-default**. The re-check is a **core stage, not an adapter** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)),
so it cannot be bypassed by swapping a source. Three independent backstops enforce this on the path to a reader:

| # | Backstop | Stage | Mechanism |
|---|----------|-------|-----------|
| B1 | Core re-check | import | deny-by-default gate; redaction; curator approval; writes file only on pass |
| B2 | Build invariant | build | `astro build` asserts `boundary === "public"` for every emitted item, else **fails the build** |
| B3 | Public projection | build | audit-only sidecar fields stripped before any serialization; test asserts they never appear in output |

## Flow 1 — Import (discover → re-check → write markdown to git)

The `ContentSourceAdapter` (v1: CAW-02 knowledge, CAW-03/skills-registry; stubs: internal wiki, curated bundle —
[ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)) proposes candidates. The **core** re-checks and, on
curator approval, writes the public projection as a markdown/MDX file plus an audit-only **sidecar**.

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │ UPSTREAM (separate products — import boundary, never a shared store)     │
  │   CAW-02 knowledge        CAW-03 / skills-registry      [stub] wiki/...  │
  └───────────────┬──────────────────┬───────────────────────────┬─────────┘
                  │   ContentSourceAdapter.discover() / fetch()    │
                  ▼                                                ▼
        ┌───────────────────────── CAW-04 CORE (hexagonal) ───────────────────┐
        │  1. NORMALIZE candidate → internal content model (ADR-0002)          │
        │  2. PUBLIC-SAFE RE-CHECK  (deny-by-default; upstream claim = EVIDENCE)│
        │       fail ─► reject + record reason (no file written)               │
        │  3. REDACT  (strip/transform anything not public-safe)               │
        │  4. CURATOR APPROVAL  (Jimmy; mandatory — ADR-0003)                  │
        │  5. ASSIGN semver + COMPUTE content-digest (ADR-0005)               │
        │  6. SPLIT projection:                                                │
        │       public frontmatter+body ─► file                                │
        │       origin_ref/origin_version/redaction internals ─► SIDECAR       │
        └───────────────┬───────────────────────────────┬────────────────────┘
                        │ write (only on pass+approve)   │ append
                        ▼                                ▼
        src/content/{type}/<slug>/<semver>.md(x)   _audit sidecar + hash-chained
                        │                            _events ledger (ADR-0003/0005)
                        ▼
                 git commit  ◄── diffable PR review IS part of the curator gate
```

Outcome: the git repo holds a **frozen, vetted corpus**. `(slug, semver)` is frozen forever and never reused, even
after removal ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). Nothing downstream ever calls
upstream again — the import boundary is crossed exactly once, here.

## Flow 2 — Build (Astro SSG → HTML + static JSON + raw markdown + index/manifest)

One `astro build` reads the **same** content collection (`getCollection()`) and emits every representation, so
web/API parity is structural — there is no second source of truth ([ADR-0006](../01-decisions/ADR-0006-web-stack.md),
[ADR-0007](../01-decisions/ADR-0007-api-design.md)).

```
   git repo: src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
            (+ _audit sidecar — loaded for gate checks, NEVER serialized)
                                   │
                                   ▼
            Astro Content Collections — typed, schema-validated
            one in-memory corpus ── B2 assert boundary==="public" (else FAIL)
                                   │       B3 public projection (drop sidecar fields)
        ┌──────────────┬──────────┴───────────┬──────────────────┬───────────────┐
        ▼              ▼                       ▼                  ▼               ▼
   HTML pages     JSON envelopes         raw markdown        index.json      SKILL.md /
   (Starlight)    /api/v1/{type}/        /api/v1/{type}/     manifest        manifest.json
   moving +       {slug}[/versions/      {slug}[.md]         (all items,     + .skill bundle
   /v/{semver}    {semver}].json         (body + yaml hdr)   versions,       (slug@semver)
                                                             boundary,links) + MCP resources view
                                   │
                                   ▼
                       dist/  (HTML + .json + .md + manifests)
                                   │
                          content-digest frozen into every version body + strong ETag
```

Key properties:
- **Pinned/version routes** (`/{type}/{slug}/v/{semver}`, `.../versions/{semver}.json`) are immutable static files
  served `Cache-Control: public, max-age=31536000, immutable`.
- The **MCP resources** view and the **REST API** are additional projections of the same `dist/` corpus — each is a
  `PublishSinkAdapter`, no shared substrate ([ADR-0007](../01-decisions/ADR-0007-api-design.md)).
- If B2/B3 fail, `dist/` is never produced — a non-public item can never reach deploy.

## Flow 3 — Publish (deploy via PublishSinkAdapter)

Publishing is the `SiteAndApiSinkAdapter` taking the frozen `dist/` artifact to the static host + CDN. There is **no
live path** from a public request back into any internal store — the deployed artifact is self-contained.

```
   approved publish/update event
            │  (trigger: TODO(open-question: webhook vs CI-on-git-push vs scheduled — ADR-0006))
            ▼
   SiteAndApiSinkAdapter
            ├─ run Flow 2 (astro build) → dist/
            ├─ upload immutable static files → object store / static host
            ├─ invalidate moving URLs + index.json + manifests on CDN
            └─ leave pinned /v/{semver} files untouched (immutable, long-TTL)
            ▼
   CDN edge  ──►  web readers (HTML) · HTTP agents (.md/.json) · MCP hosts · crawlers (/llms.txt)
```

Alternate sinks (external docs host, package registry, syndication — [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md))
plug in behind the same adapter seam without touching the content model. Each is a separate projection of `dist/`.

## Flow 4 — Unpublish / redact (tombstone + cache purge)

Boundary changes are the failure-mode counterpart of the re-check. Three distinct, audited, Jimmy-approved
operations ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)); **tombstone, never rewrite**, because
`(slug, semver)` is never reused.

| Operation | Scope | Public result | Cache action |
|-----------|-------|---------------|--------------|
| Deprecate | version or item | still served; `deprecated` flag + successor pointer; API warning | purge moving URL + index |
| Unpublish | whole item | item routes → **HTTP 410 Gone**; removed from index/sitemap; web tombstone page | purge all item URLs + index |
| Redact | single version/field | that version → **410 tombstone**; siblings intact; `latest` re-points | purge that version URL + index |

```
   curator decision (boundary changed) ─► core records audit (what/why/when/who)
            │
            ├─ mark item/version status in store + sidecar; public bytes purged on redact
            ├─ re-run Flow 2: removed addresses now emit 410 tombstone bodies
            │     (id, semver, digest, redacted_at, machine-readable reason — ADR-0007)
            ├─ Flow 3 deploy: tombstones replace prior files; sitemap/index regenerated
            └─ CDN PURGE the affected URLs (bounded — TODO(open-question: time-to-purge guarantee))
```

- **410 Gone, not 404** — "existed, deliberately removed"; honest to agents, correct for SEO de-index.
- **301** only when content genuinely *moved* (rename/merge), never for a boundary removal.
- Provenance to the internal source is **retained for audit** even after public bytes are purged.

## End-to-end at a glance

```
 upstream ──import(re-check, core)──► git(frozen) ──build(SSG,assert)──► dist ──publish(sink)──► CDN ──► consumers
                    │                                   │                                          ▲
                    └─ deny/reject (no file)            └─ fail build if any item ≠ public          │
 unpublish/redact ──audit──► status+tombstone ──rebuild──► dist(410) ──deploy+CDN PURGE────────────┘
```

## Open Questions

> Mirror into `../08-research-plan/open-questions.md`.

- TODO(open-question: rebuild+deploy trigger for the `PublishSinkAdapter` — webhook vs CI-on-git-push vs scheduled).
- TODO(open-question: CDN time-to-purge guarantee on unpublish/redact; edge-cached public bytes).
- TODO(open-question: on redact, purge public bytes immediately vs retain encrypted internally for audit retention).
- TODO(open-question: who/what assigns the semver bump — curator only vs diff-assisted proposal Jimmy approves).

## Implications for runbooks

- **RB (import adapter + core re-check):** discover→normalize→re-check→redact→approve→write file+sidecar; gate is
  deny-by-default and lives in core, not the adapter.
- **RB (build invariant):** the B2 `boundary === "public"` assertion and B3 public-projection test wired into CI.
- **RB (publish sink):** `astro build` → upload + CDN invalidation behind the `SiteAndApiSinkAdapter` interface.
- **RB (tombstones):** 410 bodies + sitemap/index removal + bounded CDN purge for unpublish/redact.

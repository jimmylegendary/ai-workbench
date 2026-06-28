# Skills Distribution & API Resources

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **(a) the REST API resource model** and **(b) the on-the-wire distribution format** for published
Skills/Workflows so that both **humans** (website) and **agents** (programmatic fetch + MCP discovery) can reuse
CAW-04 content. It covers resource shape, pagination, filtering, content negotiation (markdown vs JSON), and the
skill/workflow manifest envelope. It does **NOT** decide storage/versioning internals (separate ADR), the
public-safe publish gate (load-bearing ADR), or the web UI framework. CAW-04 only *publishes* validated,
public-safe artifacts imported from CAW-02 (a separate product) and CAW-03 / a skills registry (a separate
product); it never authors content and never serves anything above the public boundary.

---

## 1. What "distribution" must satisfy

Three consumer classes pull the same artifact and each needs a different representation of it:

| Consumer | Wants | Native format | Discovery path |
|---|---|---|---|
| Human reader (browser) | rendered, navigable page | HTML | website nav / search |
| AI agent (HTTP client) | low-token, parseable body | Markdown or JSON | REST list + filter |
| AI agent (MCP host) | machine-discoverable catalog | JSON resources | MCP `resources/list` |

Design rule: **one canonical resource, many representations.** A published artifact has a single stable identity
and version; HTML, Markdown, and JSON are *projections* of it selected by content negotiation — never separate
sources of truth. This keeps provenance + safety boundary attached to every representation.

---

## 2. API resource model

Resources map 1:1 to the brief's domain entities. All are **read-only** on the public surface (publish is
curator-only, out of band).

| Resource | Path | Notes |
|---|---|---|
| Tip | `/v1/tips/{id}` | smallest unit; single insight + source |
| Skill | `/v1/skills/{id}` | reusable operating pattern w/ I/O + preconditions |
| Workflow | `/v1/workflows/{id}` | ordered multi-step composition of skills |
| Playbook | `/v1/playbooks/{id}` | scenario-level bundle of workflows/tips |
| Example | `/v1/skills/{id}/examples` | sub-resource; concrete usage instances |
| Version | `/v1/skills/{id}/versions/{semver}` | immutable, addressable snapshot |
| Source | embedded `provenance` block | not a public top-level resource (internal ref) |
| SafetyBoundary | embedded `boundary` field | always `public` on this surface; value asserted, not negotiable |

Design decisions:
- **Versioned addressing.** `/{id}` resolves to the latest published version; `/{id}/versions/{semver}` is the
  immutable pin. Both carry `version` in the body and an `ETag`. This satisfies brief §5 (published versions are
  immutable + addressable) and lets agents pin a known-good skill.
- **`Source` is never a standalone resource.** Provenance is exposed as a *reference* (e.g. internal source id +
  validation status), not a fetchable document — publishing the internal source could leak confidential context
  (brief §11). Only the public-safe re-checked projection is served.
- **Flat catalog + typed collections.** `/v1/skills`, `/v1/workflows`, etc., each a paginated collection; a
  cross-type `/v1/search` returns lightweight references for the website's global search.

### 2.1 Canonical JSON shape (skill example)
```jsonc
{
  "id": "skill.pr-triage",
  "type": "skill",
  "version": "2.1.0",
  "title": "Triage an incoming pull request",
  "summary": "One-line, public-safe description.",
  "boundary": "public",            // asserted after public-safe re-check
  "tags": ["code-review", "agents"],
  "inputs":  [{ "name": "pr_url", "type": "string", "required": true }],
  "outputs": [{ "name": "triage_report", "type": "markdown" }],
  "preconditions": ["read access to the repo"],
  "body": { "format": "markdown", "ref": "/v1/skills/skill.pr-triage?format=md" },
  "provenance": {                  // reference only, no internal payload
    "source_product": "CAW-03",
    "source_ref": "registry://skills/pr-triage@validated",
    "validated": true,
    "public_safe_recheck": "passed"
  },
  "links": {
    "self": "/v1/skills/skill.pr-triage",
    "pinned": "/v1/skills/skill.pr-triage/versions/2.1.0",
    "html": "https://.../skills/pr-triage",
    "manifest": "/v1/skills/skill.pr-triage/manifest.json"
  },
  "published_at": "TODO(open-question: timestamp policy)"
}
```
`body` is delivered **by reference** in the list/JSON view (keeps lists light) and **inlined** when the artifact
itself is fetched as markdown. Workflows add an ordered `steps[]` array (each step references a skill `id` +
`version`); Playbooks add `contains[]`.

### 2.2 Pagination

| Option | Pros | Cons | Fit for CAW-04 |
|---|---|---|---|
| Offset/limit (`?page=&size=`) | trivial, jump-to-page, total counts | drifts on insert, slow deep scans | OK — catalog is small + curated |
| Cursor/keyset (`?cursor=`) | stable under writes, scales deep | opaque, no random page jump | future-proof; matches agent loops |

**Decision:** cursor-based as the contract, with a stable envelope so we can keep it regardless of internal store.
Curated catalog is small, but agents iterate the full list and the cursor stays valid as new versions publish.
```jsonc
{ "data": [ /* resource refs */ ],
  "pagination": { "next_cursor": "eyJ...", "has_more": true, "total_count": 142 } }
```
`total_count` is best-effort (cheap here). Include `next` as a fully-formed URL in a `Link` header too, so dumb
clients can follow without parsing the body.

### 2.3 Filtering & sorting
- Filter by first-class fields only (avoid arbitrary query DSL): `?type=`, `?tag=`, `?source_product=`,
  `?q=` (full-text over title/summary/tags), `?updated_since=`.
- Sort: `?sort=published_at|title|-updated_at` (leading `-` = descending), whitelisted fields only.
- `boundary` is **not** a filter — everything on this surface is already `public`; offering the param would imply
  other values exist publicly.

### 2.4 Content negotiation (the core call)

| Strategy | Mechanism | Pros | Cons |
|---|---|---|---|
| `Accept` header | `Accept: text/markdown` / `application/json` / `text/html` | clean, one URL, HTTP-native, agents already send `text/markdown` | needs server negotiation + caching by `Vary` |
| `.md`/`.json` suffix | `/skills/x.md` | trivially cacheable, copy-pasteable, no header logic | URL proliferation, weaker "one resource" story |
| `?format=` query | `?format=md` | explicit, easy to debug | pollutes cache keys, not idiomatic |

**Decision:** support **both** `Accept`-header negotiation (primary, canonical) **and** a `.md` suffix alias
(secondary, for shareable agent-friendly links + edge caching). Set `Vary: Accept` and emit `Content-Type`
explicitly. Default when nothing is specified: HTML on the website host, JSON on the `api.` host.

Representations per resource:
- `text/html` — rendered page (website).
- `text/markdown` — the artifact body + a small YAML frontmatter header (the manifest fields). This is what an
  agent fetching the *content* gets; ~80% fewer tokens than HTML per Cloudflare's published measurement.
- `application/json` — the structured envelope in §2.1 (machine reasoning, list views, MCP).

Also publish a root **`/llms.txt`** (markdown index of top artifacts) as a convenience entry point. Treat it as a
nice-to-have, not a guarantee — public measurement (Search Engine Journal, Nov 2025) shows no proven citation
lift; the load-bearing mechanism is per-URL markdown via content negotiation, which Claude Code / OpenCode are
confirmed to request (`Accept: text/markdown`).

---

## 3. Skill / Workflow distribution format (the manifest)

A published Skill/Workflow is distributed as a **manifest envelope** that any agent runtime can ingest. We align
the manifest with the de-facto **`SKILL.md` shape** (YAML frontmatter + markdown body) so artifacts drop into
Claude-style skill loaders, while *also* exposing the same fields as JSON for MCP and generic clients.

### 3.1 Two interchangeable encodings of one manifest

**(a) `SKILL.md` (markdown + frontmatter)** — for human authors + skill-folder loaders:
```markdown
---
name: pr-triage
description: Triage an incoming pull request and produce a structured report.
version: 2.1.0
boundary: public
license: TODO(open-question: public license per artifact)
provenance: { source_product: CAW-03, validated: true }
inputs:  [pr_url]
when_to_use: When a new PR needs initial classification before review.
---

# Triage an incoming pull request
...markdown body: steps, constraints, examples...
```
Required frontmatter follows the open Agent Skills spec (`name`, `description`); `name` matches the artifact slug.
We add CAW-04 governance fields (`version`, `boundary`, `provenance`) — additive, ignored by loaders that don't
know them.

**(b) `manifest.json`** — the same fields as the §2.1 envelope, served at `/v1/{type}/{id}/manifest.json`. This is
the canonical machine form and the body referenced by MCP resources.

### 3.2 Packaging for download
A pinned version is downloadable as a **`.skill` bundle** (a zip/tar following the skill-folder convention):
```
pr-triage@2.1.0/
  SKILL.md            # manifest (a)
  manifest.json       # manifest (b), identical fields
  references/         # supporting docs loaded into agent context
  examples/           # Example sub-resources
  assets/             # templates (large assets by path, per brief §6)
```
This lets an agent (or human) `GET` a self-contained, version-pinned, provenance-stamped unit and run it offline.
Workflows ship the same way with an added `workflow.json` listing ordered `{skill_id, version}` steps so the
bundle is reproducible.

### 3.3 MCP discoverability
Expose the catalog through an MCP **resources** view so MCP hosts can `resources/list` and `resources/read`
without bespoke integration:

| MCP concept | CAW-04 mapping |
|---|---|
| Resource `uri` | `caw04://skills/pr-triage@2.1.0` |
| Resource `name` / `description` | manifest `title` / `summary` |
| Resource `mimeType` | `text/markdown` (body) or `application/json` (manifest) |
| `resources/read` payload | the `.md` body or `manifest.json` |

This is a **PublishSinkAdapter** (brief §8): the MCP view is one adapter over the same canonical resources; the
website + REST API are the other v1 adapters. An optional future sink is listing CAW-04 in the public **MCP
Registry**. No shared substrate — MCP is just another projection.

---

## 4. Tradeoff summary (decisions)

| Decision point | Chosen | Why |
|---|---|---|
| Resource identity | one canonical resource, many representations | provenance + boundary stay attached |
| Versioning | latest at `/{id}`, immutable pin at `/versions/{semver}` | brief §5 immutability + addressability |
| Pagination | cursor + stable envelope (+ `Link` header) | stable under publishes, agent-loop friendly |
| Filtering | whitelisted first-class fields only | no leak via boundary filter, cacheable |
| Negotiation | `Accept` header (primary) + `.md` alias (secondary) | HTTP-native + shareable/cacheable |
| Markdown body | frontmatter + body, ~80% token cut vs HTML | agents request `text/markdown` today |
| Manifest | `SKILL.md` ⇆ `manifest.json` (same fields) | reuse open skill spec + MCP/JSON clients |
| Packaging | `.skill` bundle (folder convention) | self-contained, pinned, offline-runnable |
| Catalog discovery | REST list + MCP `resources/*` + `/llms.txt` | covers HTTP agents, MCP hosts, crawlers |

---

## 5. Open Questions
Track in `../08-research-plan/open-questions.md`:
- **OQ:** Adopt the open Agent Skills `SKILL.md` spec verbatim, or define a CAW-04 superset profile? Risk of drift
  if the upstream spec changes.
- **OQ:** Per-artifact public **license** field — required for redistribution? What default?
- **OQ:** `published_at` / `updated_at` timestamp + timezone policy (don't invent).
- **OQ:** Does `total_count` stay cheap as the catalog grows, or drop it for pure cursor?
- **OQ:** MCP Registry listing — in v1 scope or a later PublishSinkAdapter stub only?
- **OQ:** How are `references/`/`assets/` size-limited and virus/secret-scanned before bundling (public-safe)?
- **OQ:** Cache strategy / CDN behavior for `Vary: Accept` (some CDNs handle it poorly).
- **OQ:** Workflow step references across artifact versions — pin exact versions or allow range/`latest`?

## 6. Implications for runbooks
- **API runbook:** implement the §2 resource routes, cursor pagination envelope, whitelisted filters, and
  `Accept`/`.md` negotiation with `Vary: Accept`; default format per host.
- **Manifest runbook:** define the `SKILL.md` frontmatter schema + the equivalent `manifest.json` JSON Schema, and
  a validator asserting `boundary == public` and `provenance.public_safe_recheck == passed` before any
  representation is emitted (publish gate enforcement at the edge).
- **Bundle runbook:** build the `.skill` packaging step (zip of `SKILL.md` + `manifest.json` + `references/` +
  `examples/` + `assets/`) keyed by pinned version, with a content scan step.
- **MCP adapter runbook:** implement `resources/list` + `resources/read` over the canonical resources as a
  PublishSinkAdapter; document the registry-listing stub.
- **Ports & adapters:** website build, REST API, and MCP view are three PublishSinkAdapters over one core; keep the
  canonical resource model independent of any adapter.

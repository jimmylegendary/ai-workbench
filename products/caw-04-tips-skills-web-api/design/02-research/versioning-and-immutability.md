# Versioning & Immutability

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - `../_meta/PRODUCT-BRIEF.md`
  - `./` (sibling research: content-model, storage, publish-gate — TODO when authored)
  - `../01-decisions/ADR-XXXX-versioning-model.md` (TODO: ADR to be raised from this doc)
  - `../01-decisions/ADR-XXXX-url-and-api-resource-scheme.md` (TODO)
  - `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

CAW-04 publishes one unit of value: a **published, versioned, public-safe artifact** (Tip / Skill / Workflow /
Playbook). The brief fixes that "published versions are immutable + addressable" (§5, §6). This doc decides **how**:
the version identity scheme (semver vs date vs content-hash), the immutability + addressability guarantees,
unpublish/redact/deprecate handling, and the mapping from `Version` to web URLs and API resources.

It does NOT decide the storage substrate (md/MDX-first vs DB — separate ADR), the content model fields, or the
publish-gate policy. It assumes those exist and shows where versioning hooks into them.

## Forces & constraints

- **Public read surface, curator-only writes.** No public write API; every publish is Jimmy-approved (§3, §11).
  This removes the multi-author race conditions that force pure content-hash schemes elsewhere.
- **Immutability is load-bearing for trust + audit.** Each published item must trace to a validated internal source
  + safety review (§5 use case 5). A consumer (human or agent) that pinned a version must get byte-identical content
  back, or a clear tombstone — never silently mutated content.
- **Agents are first-class consumers.** They fetch skills/workflows via API and may cache or pin by version. They
  need a stable, machine-checkable identity (integrity) AND a human-readable compatibility signal.
- **Public-safe boundary can change after publish.** Redaction/unpublish must be a real capability (§3 use case 4),
  but must not violate the immutability promise to honest cachers. The reconciliation is **tombstones**, not edits.
- **Ports & adapters.** The `PublishSinkAdapter` (website build + REST API) and any future sink must consume the
  same version identity; the scheme cannot assume one specific sink.

## Versioning model — option comparison

| Scheme | What it is | Pros | Cons | Fit for CAW-04 |
|---|---|---|---|---|
| **Date-based** (`2026-06-28`, CalVer) | version = publish date/time | trivial; intuitive recency; good for changelogs | no compatibility signal; collisions on same-day re-publish; agents can't tell breaking vs trivial change | as **metadata only** (good) |
| **Semver** (`MAJOR.MINOR.PATCH`) | semantic compatibility contract | machine-readable compat (breaking/feature/fix); industry-standard for API consumers; npm-proven | requires human judgement on bump; not self-verifying (says nothing about bytes) | **primary human/agent identity** |
| **Content-hash / digest** (`sha256:…`) | id = hash of canonicalized content | self-verifying integrity; intrinsically immutable; dedup-free addressing; matches OCI/IPFS/git | opaque to humans; no compat signal; verbose URLs | **immutability + integrity layer** |

**Recommendation — hybrid, mirroring the OCI/Docker (`tag` + `@digest`) and npm (`semver` + `integrity`) pattern:**

1. **Semver** is the *published version identity* a curator assigns at publish (`skill-name @ 2.1.0`). It is the
   human- and agent-facing compatibility contract and the primary path component.
2. **Content digest** (`sha256:` of the canonicalized markdown body + the audited metadata envelope) is computed at
   publish and stored on every `Version`. It is the *immutability proof* and an alternate addressable key. Agents can
   pin by digest for byte-exactness; the API returns it (and may serve it as a `Digest:`/`ETag` header).
3. **`published_at` date** is required metadata (recency, audit, sort), never the identity.

This gives both axes the brief implies: semver answers "is this a breaking change?"; digest answers "is this the
exact bytes I trust?". Neither alone is sufficient.

### Immutability rules (the contract)

- A `(slug, semver)` pair, once published, is **frozen forever**. Its bytes and its digest never change.
- A `(slug, semver)` pair, once used, is **never reused** — even after unpublish (npm's rule; prevents a redacted
  version being silently replaced by different content at the same address).
- Any change to a published artifact = a **new `Version`** with a new semver (and necessarily a new digest).
- The digest is computed over a **canonical serialization** (normalized front-matter key order, LF newlines, trimmed
  trailing whitespace) so the same logical content always hashes identically across rebuilds. TODO(open-question:
  exact canonicalization spec + which metadata fields are inside vs outside the hashed envelope).
- A "trivial" curator fix (typo) is still a new PATCH version — there is no in-place edit of a published version.

### Semver semantics for *content* (not code)

Semver was designed for code APIs; we adapt it to content artifacts. Proposed mapping (to ratify in ADR):

| Bump | Meaning for a Tip/Skill/Workflow |
|---|---|
| **MAJOR** | guidance changed in a way that would lead a reader/agent to a *different action* (steps removed/reordered, preconditions changed, reversed recommendation) |
| **MINOR** | additive, backward-compatible (new example, extra optional step, clarified rationale) |
| **PATCH** | cosmetic/no-behaviour-change (typo, formatting, link fix) |

This keeps "an agent pinned to `^2.0.0`" meaningful: it will not silently receive action-changing guidance.

## Unpublish, redact, deprecate — distinct operations

The brief's use case 4 ("unpublish / redact if its boundary changes") is really **three** operations with different
semantics. Conflating them is the main risk here.

| Operation | Scope | Public behaviour | Internal record | When |
|---|---|---|---|---|
| **Deprecate** | a version or whole item | still served; carries a visible `deprecated` flag + successor pointer; API sets a warning field/header | kept | superseded but still safe and true |
| **Unpublish** | whole item (all versions) | item routes return **HTTP 410 Gone**; removed from index/listing/sitemap; web shows a tombstone page | metadata + provenance retained for audit; bytes may be retained or purged per policy | item should no longer be public at all |
| **Redact** | a single version (or a field) | that version returns **410 Gone**; sibling versions unaffected; `latest` re-points to newest non-redacted version | **immutable audit record of what/why/when/who** retained internally; public bytes purged | one version leaked above the public-safe boundary |

Key rules:

- **410 Gone, not 404.** 410 says "this existed and was deliberately removed" — correct for SEO (de-indexes fast),
  honest to agents, and consistent with the audit trail. 404 would imply "never existed," undermining auditability.
  Use **301** only when content genuinely *moved* to a new canonical URL (rename/merge), not for boundary removal.
- **Tombstone, don't rewrite.** Because `(slug, semver)` is never reused, a redacted version's address permanently
  resolves to a 410 tombstone (id, semver, digest, `redacted_at`, machine-readable reason code). A cacher that pinned
  it learns it was pulled rather than receiving swapped content — this is how we keep the immutability promise *and*
  allow removal.
- **Redaction is itself an audited, Jimmy-approved event** (mirrors publish gate, §11). The audit record lives in
  CAW-04's own store; provenance back to the internal source is retained even after public bytes are purged.
- **Boundary re-check on every (re)publish** (§7): unpublish/redact is the failure-mode counterpart to the gate.

## URL + API resource scheme

Principle: **two address shapes per artifact** — a *moving* canonical address (always the latest published version)
and an *immutable pinned* address (one exact version). This is the Read-the-Docs `latest`/`stable` alias pattern plus
the OCI `tag@digest` pin, adapted to content.

### Web URLs

```
/{type}/{slug}                     canonical; 200 → renders latest published version; rel=canonical points here
/{type}/{slug}/v/{semver}          immutable; pinned version (e.g. /skills/triage-incident/v/2.1.0)
/{type}/{slug}/v/{semver}          → 410 Gone (tombstone page) if that version was redacted
/{type}/{slug}                     → 410 Gone if whole item unpublished
/{type}/{slug}/versions            human-readable version history / changelog
```

- `{type}` ∈ `tips | skills | workflows | playbooks` (entity names from §5).
- The canonical page sets `rel=canonical` to itself (the moving URL) so search engines index *latest*, not stale
  pinned pages — the documented Read-the-Docs fix for "old version is the top search result."
- Pinned `/v/{semver}` pages set `rel=canonical` to the moving URL while remaining directly reachable, and SHOULD be
  served with long-lived immutable cache headers (`Cache-Control: public, max-age=31536000, immutable`).

### API resources

```
GET /api/v1/{type}                          list/index (latest of each; supports filters, pagination)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          list every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/versions/{semver} → 410 Gone (machine-readable tombstone body) if redacted
GET /api/v1/{type}/{slug}                    → 410 Gone if unpublished
```

- **Two version axes, kept separate** (a classic source of confusion): the **API contract version** is the URL
  prefix `/api/v1` (changes only on breaking API shape changes); the **content version** is the `{semver}` path
  segment / resource field. Never overload one for the other.
- **Content negotiation for format** (markdown vs JSON, brief §4/§6): same resource, `Accept: text/markdown` →
  raw published markdown; `Accept: application/json` → structured envelope (body + reusable/auditable metadata:
  inputs/outputs, preconditions, provenance, safety boundary, version, digest). Optionally a `.md`/`.json` suffix
  as an escape hatch for dumb clients. TODO(open-question: header-negotiation vs suffix as the canonical mechanism).
- **Integrity surfaced to clients:** every version response carries `digest` in the body and an `ETag` (strong,
  derived from the digest). `latest` responses also include the resolved `semver` + `digest` so a caller can re-pin
  deterministically.
- **`?version=` query is discouraged** in favour of path segments (cacheable, addressable, log-friendly). A `latest`
  literal in the path (`/versions/latest`) MAY alias the moving resource for symmetry with docs tooling.

### Why not content-hash in the public URL

Digest-in-URL (`…@sha256:abcd…`) is offered only as an *optional* API pin alias, not the primary public web URL:
it is unreadable, unshareable, and bad for SEO. Semver paths stay human-facing; digests stay in
headers/bodies/optional pins. (OCI does exactly this split: humans use tags, machines/pins use digests.)

## Recommendation summary

- **Identity:** hybrid — **semver** (assigned, human/agent compat contract) + **content digest** (computed,
  immutability/integrity) + **`published_at`** (metadata). Adopt content-adapted semver bump rules.
- **Immutability:** `(slug, semver)` frozen and never reused; all edits are new versions; digest over canonical
  serialization.
- **Removal:** three distinct operations — **deprecate** (served + warned), **unpublish** (item → 410), **redact**
  (version → 410 tombstone, siblings intact, `latest` re-points). Audit record retained even when bytes purged.
- **Addressing:** moving canonical URL + immutable pinned `/v/{semver}` URL; API mirrors with `/versions/{semver}`;
  format via content negotiation; API-contract version (`/api/v1`) kept orthogonal to content version.

## Open Questions

Promote each to `../08-research-plan/open-questions.md`:

- TODO(open-question: exact canonical serialization + which metadata fields are inside the hashed envelope vs
  mutable-around-it, e.g. is `deprecated` flag inside the digest or a side-band attribute?).
- TODO(open-question: who/what assigns the semver bump — curator judgement only, or a diff-assisted proposal that
  Jimmy approves? How is a mis-judged bump corrected without breaking immutability?).
- TODO(open-question: on redact, do we purge public bytes immediately or retain encrypted internally for audit? Legal/
  boundary retention policy needed).
- TODO(open-question: digest algorithm + prefix convention (`sha256:` vs multihash) and whether to expose a
  digest-pin URL alias at v1 or defer).
- TODO(open-question: format addressing — `Accept` header negotiation as canonical with `.md`/`.json` suffix as
  fallback, or suffix-first?).
- TODO(open-question: does an item slug ever change (rename), and if so is that a 301 from old slug or a new item +
  provenance link? Interaction with immutability of old version URLs).
- TODO(open-question: sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged?).

## Implications for runbooks

- **Storage/index runbook** must persist, per `Version`: `slug`, `semver`, `digest`, `published_at`, `status`
  (`published | deprecated | redacted`), successor pointer, and the audit record (who/why/when) — and enforce the
  "never reuse `(slug, semver)`" invariant at write time.
- **Publish-gate runbook** must, on approval: assign/validate semver (reject downgrades/reuse), compute the digest
  over the canonical serialization, and record provenance + boundary-recheck result before the version becomes
  addressable.
- **Website build runbook (PublishSinkAdapter)** must emit both the moving canonical page and immutable `/v/{semver}`
  pages, set `rel=canonical` + immutable cache headers correctly, generate 410 tombstone pages for unpublished/
  redacted addresses, and exclude unpublished items + (per policy) deprecated versions from sitemap/index.
- **REST API runbook (PublishSinkAdapter)** must implement the resource tree above, content negotiation (md/JSON),
  `ETag`/`digest` headers, and **410 + machine-readable tombstone bodies** (not 404) for removed resources; keep
  `/api/v1` orthogonal to content `{semver}`.
- **Unpublish/redact runbook** must be a Jimmy-approved, audited operation that flips status, re-points `latest`,
  invalidates caches/CDN for the affected addresses, and writes the immutable audit record before bytes are purged.

---

Sources (external grounding): npm immutable-version + unpublish policy (`docs.npmjs.com/policies/unpublish`),
MDN HTTP 410 Gone (`developer.mozilla.org/en-US/docs/Web/HTTP/Status/410`), Read the Docs canonical-URL/version-alias
guidance (`docs.readthedocs.com`), SemVer for APIs (`zuplo.com/learning-center/semantic-api-versioning`), OCI/Docker
tag-vs-digest and IPFS content-addressing patterns. Internal product facts are from the CAW-04 PRODUCT-BRIEF only.

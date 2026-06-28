# Versioning & Immutability — semver + digest, frozen versions, tombstones

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-entities.md](./content-entities.md) (the `Version` entity + composition pins)
  - [./rendering-web-and-api.md](./rendering-web-and-api.md) (how URLs/resources are emitted)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (the decision this elaborates)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (resource/URL scheme, 410 tombstone bodies)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (re-check on every (re)publish)
  - [../02-research/versioning-and-immutability.md](../02-research/versioning-and-immutability.md) (option comparison + external grounding)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc fixes **how a published artifact stays immutable and addressable forever** (brief §5): the hybrid
**semver + content-digest** identity, the rules that freeze `(slug, semver)`, the "edits = new version" model, the
three removal operations (deprecate / unpublish / redact) and their **tombstones**, and the mapping from a
`Version` to web URLs and API resources. It elaborates [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)
and [ADR-0007](../01-decisions/ADR-0007-api-design.md). It does NOT define entity fields
([content-entities](./content-entities.md)) or build mechanics ([rendering-web-and-api](./rendering-web-and-api.md)).
The property carried throughout: **a pinned version returns byte-identical content or an honest tombstone — never
silently mutated content.**

## 1. Identity — two axes, never conflated

| Axis | Value | Assigned vs computed | Answers | Surfaced as |
|---|---|---|---|---|
| **Semver** | `MAJOR.MINOR.PATCH` (e.g. `2.1.0`) | curator-**assigned** at publish | "is this a breaking change?" | URL/path segment, `version` field |
| **Content digest** | `sha256:<hex>` over canonical serialization | **computed** + frozen at publish | "are these the exact bytes I trust?" | `digest` body field + strong `ETag` |
| **`published_at`** | ISO-8601 timestamp | recorded at publish | recency / sort / audit | metadata only — **never** identity |

This mirrors OCI `tag@digest` and npm `semver+integrity`: humans/agents address by readable semver; machines verify
by digest. Neither alone suffices — semver carries no integrity proof; a digest carries no compatibility signal.

### 1.1 Content-adapted semver bump rules

Semver was built for code APIs; CAW-04 adapts it to **content** (ratified in
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)):

| Bump | Trigger for a Tip / Skill / Workflow / Playbook |
|---|---|
| **MAJOR** | guidance changed so a reader/agent would take a *different action* — steps removed/reordered, preconditions changed, recommendation reversed |
| **MINOR** | additive, backward-compatible — new example, optional step, clarified rationale |
| **PATCH** | cosmetic, no behaviour change — typo, formatting, link fix |

This keeps "an agent pinned to `^2.0.0`" meaningful: it will never silently receive action-changing guidance.
TODO(open-question: who assigns the bump — curator judgement only vs a diff-assisted proposal Jimmy approves; how a
mis-judged bump is corrected without breaking immutability — from [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

### 1.2 The digest — what is hashed

```text
digest = sha256( canonical_serialization( public_projection_body + audited_metadata_envelope ) )

canonical_serialization:
  - normalized frontmatter key order
  - LF newlines only
  - trailing whitespace trimmed
  → the same logical content hashes identically across rebuilds
```

TODO(open-question: exact canonicalization spec + whether mutable side-band flags like `deprecated` are inside the
hashed envelope or outside it; whether the digest covers the audit sidecar or only the public projection — from
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md) / [content-entities](./content-entities.md) §3).
TODO(open-question: digest algorithm + prefix convention — `sha256:` vs multihash.)

## 2. Immutability — the contract

| Rule | Statement | Enforced where |
|---|---|---|
| **Frozen** | a published `(slug, semver)` pair's bytes + digest never change | storage write-time check |
| **Never reused** | a `(slug, semver)` pair, once used, is never reissued — *even after unpublish* | storage write-time check |
| **Edits = new version** | any change to published content = a new `Version` with a new semver (⇒ new digest) | publish gate |
| **No in-place edit** | even a typo fix is a new PATCH; there is no mutation of a published version | publish gate |

"Never reused" is the rule (from npm) that prevents a redacted address from being silently re-filled with different
content. Combined with tombstones (§3) it lets CAW-04 *remove* content **without** breaking the immutability promise
to an honest cacher.

```
src/content/skills/triage-incident/
  1.0.0.mdx   (frozen)        ← published_at T0, digest sha256:aa…
  2.0.0.mdx   (frozen)        ← MAJOR: steps reordered, digest sha256:bb…
  2.1.0.mdx   (frozen, latest)← MINOR: added example,    digest sha256:cc…
# 2.0.0.mdx is NEVER edited; a fix to it ships as 2.0.1 or 2.1.0.
```

## 3. Removal — three distinct, audited, Jimmy-approved operations

The brief's use case 4 ("unpublish / redact if its boundary changes") is **three** operations. Conflating them is
the primary risk; each has different scope and public behaviour
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

| Operation | Scope | Public behaviour | Record kept | When |
|---|---|---|---|---|
| **Deprecate** | version or whole item | still served; visible `deprecated` flag + successor pointer; API warning field/header | full | superseded but still safe & true |
| **Unpublish** | whole item (all versions) | all item routes → **HTTP 410 Gone**; removed from index/listing/sitemap; web tombstone page | provenance + metadata retained | item should no longer be public at all |
| **Redact** | single version (or field) | that version → **410 Gone** tombstone; siblings unaffected; `latest` re-points to newest non-redacted | immutable audit record (what/why/when/who); public bytes purged | one version crossed the public-safe boundary |

### 3.1 Tombstone rules

- **410 Gone, not 404.** 410 means "existed, deliberately removed" — correct for fast SEO de-index, honest to
  agents, consistent with the audit trail. 404 ("never existed") would undermine auditability.
- **301 only for genuine moves** (rename/merge to a new canonical URL), never for a boundary removal.
- **Tombstone, never rewrite.** Because `(slug, semver)` is never reused, a redacted address permanently resolves to
  a 410 tombstone. A cacher that pinned it *learns it was pulled* rather than receiving swapped content.
- **Provenance survives byte-purge.** The audit record (and the link back to the internal Source) is retained even
  after public bytes are purged. TODO(open-question: purge public bytes immediately vs retain encrypted internally
  for audit — legal/retention policy, from [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- **Re-check is the counterpart.** The public-safe re-check runs on every (re)publish
  ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)); unpublish/redact is its failure-mode
  twin.

### 3.2 Machine-readable tombstone body (410)

```jsonc
{
  "status": "redacted",                 // or "unpublished"
  "id": "triage-incident",
  "type": "skill",
  "version": "2.0.0",                   // present for a redacted version; absent for whole-item unpublish
  "digest": "sha256:bb…",              // the digest that USED to resolve here
  "redacted_at": "TODO(open-question: timestamp policy)",
  "reason_code": "boundary-change",     // machine-readable; no confidential detail
  "successor": "/api/v1/skills/triage-incident/versions/2.1.0"  // null if none
}
```

## 4. URL + API resource mapping

Principle (from [ADR-0007](../01-decisions/ADR-0007-api-design.md)): **two address shapes per artifact** — a
*moving* canonical address (always latest published) and an *immutable pinned* address (one exact version).

### 4.1 Web URLs

```
/{type}/{slug}                 canonical; 200 → latest published version; rel=canonical points here
/{type}/{slug}/v/{semver}      immutable pinned page (e.g. /skills/triage-incident/v/2.1.0)
/{type}/{slug}/versions        human-readable version history / changelog
/{type}/{slug}/v/{semver}      → 410 Gone tombstone page if that version was redacted
/{type}/{slug}                 → 410 Gone if the whole item was unpublished
```

- `{type}` ∈ `tips | skills | workflows | playbooks`.
- The **moving** canonical page sets `rel=canonical` to itself so search engines index *latest*, not stale pinned
  pages (the Read-the-Docs fix for "old version is the top search result").
- **Pinned** `/v/{semver}` pages set `rel=canonical` to the moving URL while staying directly reachable, served with
  `Cache-Control: public, max-age=31536000, immutable` (safe because the bytes are frozen).

### 4.2 API resources

```
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/versions/{semver} → 410 + tombstone body if redacted
GET /api/v1/{type}/{slug}                    → 410 if unpublished
```

| Concern | Rule |
|---|---|
| **Two version axes** | API-contract version = path prefix `/api/v1` (changes on breaking API shape); content version = `{semver}` segment. Never overload one for the other. |
| **Integrity to clients** | every version response carries `digest` in body + a strong `ETag` derived from it. |
| **Re-pin determinism** | `latest` responses include the resolved `semver` + `digest` so a caller can deterministically re-pin. |
| **Digest in URL** | offered only as an *optional* API pin alias, never the primary public URL (unreadable, unshareable, bad SEO). TODO(open-question: expose a digest-pin alias at v1 or defer — from [ADR-0007](../01-decisions/ADR-0007-api-design.md)). |
| **`?version=` query** | discouraged in favour of path segments (cacheable, addressable, log-friendly). |

Content negotiation (markdown vs JSON), pagination, and the `index.json` manifest are specified in
[rendering-web-and-api](./rendering-web-and-api.md) and [ADR-0007](../01-decisions/ADR-0007-api-design.md) — not
repeated here.

## 5. Lifecycle at a glance

```
in-review ──[gate: assign semver, compute digest, freeze]──▶ published ──▶ (latest)
                                                               │
                              edit (any change) ──────────────┘  ⇒ NEW Version (new semver, new digest)
published ──[deprecate]──▶ deprecated (still served, warned, successor pointer)
published ──[unpublish]──▶ 410 (whole item; provenance retained)
version   ──[redact]────▶ 410 tombstone (this version; siblings intact; latest re-points)
```

## 6. Open Questions

Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):

- TODO(open-question: exact canonical serialization + which metadata is inside vs outside the hashed envelope.)
- TODO(open-question: who/what assigns the semver bump; correcting a mis-judged bump without breaking immutability.)
- TODO(open-question: on redact, purge public bytes immediately vs retain encrypted internally — retention policy.)
- TODO(open-question: digest algorithm/prefix; expose a digest-pin URL alias at v1 or defer.)
- TODO(open-question: does a slug ever change (rename) — 301 from old slug vs new item + provenance link.)
- TODO(open-question: sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged.)
- TODO(open-question: timestamp + timezone policy for `published_at` / `redacted_at` — do not invent.)

## 7. Implications for runbooks

- **Storage/index runbook:** persist per `Version` `{slug, semver, digest, published_at, status, successor, audit
  record}`; enforce "never reuse `(slug, semver)`" at write time.
- **Publish-gate runbook:** on approval, assign/validate semver (reject downgrade/reuse), compute the digest over the
  canonical serialization, record provenance + boundary-recheck result, *then* make the version addressable.
- **Website build runbook:** emit moving + pinned pages; set `rel=canonical` + immutable cache headers; generate 410
  tombstone pages; exclude unpublished items (+ per policy deprecated versions) from sitemap/index.
- **API runbook:** resource tree above; `digest`/`ETag`; **410 + machine-readable tombstone bodies** (not 404);
  keep `/api/v1` orthogonal to content `{semver}`.
- **Unpublish/redact runbook:** Jimmy-approved, audited op that flips status, re-points `latest`, invalidates
  CDN/caches for affected addresses, and writes the immutable audit record before bytes are purged.

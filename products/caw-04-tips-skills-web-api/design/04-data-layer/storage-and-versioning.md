# Storage & Versioning — md/MDX-in-Git, the slug/semver Layout, Immutable Versions, Tombstones

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-model.md](./content-model.md) — the records being stored (public projection + audit sidecar)
  - [./public-safe-and-provenance.md](./public-safe-and-provenance.md) — what the sidecar holds + the re-check
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (ratifies this)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (gate + audit ledger)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md) / [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (consume version identity)
  - [../02-research/versioning-and-immutability.md](../02-research/versioning-and-immutability.md) (research backing)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This data-layer doc specifies **where published content physically lives** and **how versions become immutable and
addressable**: the markdown/MDX-in-git source of truth, the `<slug>/<semver>` on-disk layout, the
semver + content-digest hybrid identity, the freeze/never-reuse rules, and removal via deprecate / unpublish /
redact (HTTP 410 tombstones). It elaborates [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md). It does
**NOT** define the frontmatter fields ([content-model](./content-model.md)), the boundary re-check
([public-safe-and-provenance](./public-safe-and-provenance.md)), or the web/API resource scheme ([ADR-0007](../01-decisions/ADR-0007-api-design.md)).

## Source of truth: markdown/MDX in CAW-04's own git repo

Published content is **markdown/MDX with YAML frontmatter in CAW-04's own git repo** — no DB, no shared substrate.
The repo IS the vetted public corpus: a frozen, diffable file set with **no live path from a public request into any
internal store**. This is the cheapest public-safe-by-construction story (see [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)
and [ADR-0006](../01-decisions/ADR-0006-web-stack.md)).

Files are written by the `ContentSourceAdapter` **after** the in-core public-safe re-check passes (see
[public-safe-and-provenance](./public-safe-and-provenance.md) and [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)) — nothing
lands on disk before it is re-derived public-safe.

### Repository layout

```
src/content/
  tips/        <slug>/<semver>.md        + <slug>/<semver>.audit.yml   (sidecar, never served)
  skills/      <slug>/<semver>.mdx       + <slug>/<semver>.audit.yml
  workflows/   <slug>/<semver>.mdx       + <slug>/<semver>.audit.yml
  playbooks/   <slug>/<semver>.mdx       + <slug>/<semver>.audit.yml
assets/        <slug>/…                  large media by path (CDN-backed)
_events/       ledger.ndjson             hash-chained publish/unpublish/redact log
index.json                              derived API manifest (regenerable; NOT source of truth)
```

| Path piece | Rule |
|---|---|
| `{kind}/` | one of the four publishable kinds; matches `kind` in frontmatter |
| `<slug>/` | the artifact's stable public `id`; a directory holds **all** versions of one artifact |
| `<semver>.md(x)` | one immutable published version; the **public projection** only |
| `<semver>.audit.yml` | the **audit sidecar** for that exact version; excluded from build output (see firewall) |
| `index.json` | derived from the files at build; the files remain the source of truth |
| `_events/ledger.ndjson` | append-only, hash-chained audit ledger ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)); git history is the redundant second witness |

A new version is a **new file** in the same `<slug>/` directory — never an edit to an existing one.

## Version identity — semver + content-digest hybrid

Mirrors OCI `tag@digest` and npm `semver+integrity`: two axes, neither sufficient alone.

| Axis | What | Assigned/computed | Role |
|---|---|---|---|
| **semver** (`2.1.0`) | compatibility contract | **assigned** by curator at publish | human/agent-facing identity; the URL/path segment |
| **content-digest** (`sha256:…`) | integrity proof | **computed** at publish over canonical serialization | immutability proof; alternate addressable key; strong `ETag` |
| **`published_at`** | recency/sort | recorded at publish | metadata only — **never** the identity |

### Content-adapted semver bump rules

Semver was designed for code; here it gates **action change**, so an agent pinned to `^2.0.0` never silently
receives action-changing guidance.

| Bump | Meaning for a Tip/Skill/Workflow/Playbook |
|---|---|
| **MAJOR** | a reader/agent would take a *different action* (steps removed/reordered, preconditions changed, reversed recommendation) |
| **MINOR** | additive, backward-compatible (new example, optional step, clarified rationale) |
| **PATCH** | cosmetic / no behaviour change (typo, formatting, link fix) |

### Content digest

```
digest = "sha256:" + sha256( canonical_serialization(public_projection) )

canonical_serialization:
  - frontmatter keys sorted (normalized order)
  - LF newlines; trailing whitespace trimmed
  - markdown body appended after a single normalized delimiter
  - covers the PUBLIC PROJECTION (see open question on whether the sidecar is in/out)
```

The digest is computed and **frozen at publish**, stored on the `Version`, surfaced as `content_hash` in API bodies
and as a strong `ETag`. `latest` responses include the resolved `semver` + `digest` so a caller can re-pin
deterministically. TODO(open-question: exact canonicalization spec + which metadata fields are inside the hashed
envelope; digest algorithm/prefix convention `sha256:` vs multihash.)

## Immutability rules (the contract)

1. A `(slug, semver)` pair, once published, is **frozen forever** — bytes and digest never change.
2. A `(slug, semver)` pair, once used, is **never reused** — even after unpublish/redact. This prevents a redacted
   address from being silently re-filled with different content. Enforced at write time by the storage runbook.
3. Every change to a published artifact = a **new `Version`** with a new semver (hence a new digest). A typo fix is a
   new PATCH; there is no in-place edit.

A consumer that pinned a version therefore gets byte-identical content back **or a clear tombstone** — never silently
mutated content.

## Removal — three distinct, audited, Jimmy-approved operations

Brief §3 use-case 4 ("unpublish / redact if boundary changes") is really three operations. Conflating them is the
main risk. All three are Jimmy-approved events written to the `_events` ledger; none is a silent delete.

| Operation | Scope | Public behaviour | Record kept |
|---|---|---|---|
| **Deprecate** | version or item | still served; visible `deprecated` flag + successor pointer; API warning field/header | full record |
| **Unpublish** | whole item (all versions) | every item route → **HTTP 410 Gone**; removed from index/listing/sitemap; web tombstone page | provenance + metadata retained for audit; bytes per policy |
| **Redact** | single version (or field) | that version → **410 Gone** tombstone; siblings unaffected; `latest` re-points to newest non-redacted | immutable audit record (what/why/when/who); public bytes purged |

### Tombstone semantics

- **410 Gone, not 404.** 410 says "existed, deliberately removed" — correct for fast SEO de-index, honest to agents,
  consistent with the audit trail. **301** is used only when content genuinely *moved* (rename/merge), never for a
  boundary removal.
- **Tombstone, never rewrite.** Because `(slug, semver)` is never reused, a redacted address permanently resolves to
  a 410 tombstone carrying `{id, semver, digest, redacted_at, reason_code}`. A cacher that pinned it learns it was
  pulled rather than receiving swapped content — this keeps the immutability promise *and* allows removal.

```json
// 410 machine-readable tombstone body (API)
{
  "status": "gone",
  "id": "summarize-pr-diff",
  "semver": "1.2.0",
  "digest": "sha256:…",
  "redacted_at": "TODO(set at redact)",
  "reason_code": "boundary-changed",
  "successor": null
}
```

- **Provenance is retained even after bytes are purged** (see [public-safe-and-provenance](./public-safe-and-provenance.md#audit-trail)).
- The boundary re-check runs on every (re)publish; unpublish/redact is its failure-mode counterpart.

## Derived index & audit witnesses

- `index.json` is **regenerable** from the files at build time (consumed by the API, [ADR-0007](../01-decisions/ADR-0007-api-design.md));
  it is never the source of truth and is rebuilt from scratch.
- The publish ledger (`_events/ledger.ndjson`) is **append-only and hash-chained**
  (`hash = H(prev_hash ‖ canonical(line))`, [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md));
  **git history is the redundant second witness**. Two independent witnesses make tampering detectable.

## Open Questions

Promote to `../08-research-plan/open-questions.md`:

- TODO(open-question: exact canonical serialization spec + which metadata fields are inside the hashed envelope vs a mutable side-band — e.g. is `deprecated` inside the digest?)
- TODO(open-question: who/what assigns the semver bump — curator-only vs diff-assisted proposal Jimmy approves; how a mis-judged bump is corrected without breaking immutability.)
- TODO(open-question: on redact, purge public bytes immediately vs retain encrypted internally for audit — legal/retention policy.)
- TODO(open-question: digest algorithm + prefix convention; expose a digest-pin URL alias at v1 or defer? Coordinate with [ADR-0007](../01-decisions/ADR-0007-api-design.md).)
- TODO(open-question: does a slug ever change (rename) — 301 from old slug vs new item + provenance link; interaction with old-version URL immutability.)
- TODO(open-question: sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged.)

## Implications for runbooks

- **Storage runbook** persists, per `Version`: `{slug, semver, digest, published_at, status, successor, audit-record-ref}`
  and **enforces "never reuse `(slug, semver)`"** at write time; lays down the `<kind>/<slug>/<semver>` layout with the
  sidecar beside each file.
- **Publish-gate runbook** assigns/validates semver (reject downgrade/reuse), computes the digest over the canonical
  serialization, and records provenance + boundary-recheck result before a version becomes addressable.
- **Build runbook** regenerates `index.json` from the files and emits 410 tombstone pages/bodies for
  unpublished/redacted addresses; excludes unpublished items (and, per policy, deprecated versions) from sitemap/index.
- **Unpublish/redact runbook** is a Jimmy-approved, audited operation that flips status, re-points `latest`,
  invalidates caches/CDN for affected addresses, and writes the immutable audit record before bytes are purged.

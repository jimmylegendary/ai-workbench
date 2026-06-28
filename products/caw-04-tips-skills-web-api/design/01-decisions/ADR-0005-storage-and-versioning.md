# ADR-0005: Storage as markdown/MDX-first in git; immutable content-addressable versions

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§5 versioning, §6 data)
  - [../02-research/versioning-and-immutability.md](../02-research/versioning-and-immutability.md) (research this ADR ratifies)
  - [../02-research/content-model-and-metadata.md](../02-research/content-model-and-metadata.md)
  - [./ADR-0002-content-model.md](./ADR-0002-content-model.md) (the entities + frontmatter being stored)
  - [./ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate.md) (the gate + hash-chained audit)
  - [./ADR-0004-import-and-ports.md](./ADR-0004-import-and-ports.md) (re-checked items land here)
  - [./ADR-0006-web-stack.md](./ADR-0006-web-stack.md) / [./ADR-0007-api-design.md](./ADR-0007-api-design.md) (consume version identity)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

CAW-04 owns its content store (brief §6) and publishes one unit of value: a **published, versioned, public-safe
artifact** whose published versions are **immutable + addressable** (brief §5). Forces:

- **Public read surface, curator-only writes; no public write API** (brief §10). Every publish is Jimmy-approved.
  This removes the multi-author write races that elsewhere force pure content-hash schemes.
- **Immutability is load-bearing for trust + audit** (brief §5 uc5). A consumer that pinned a version must get
  byte-identical content back, or a clear tombstone — never silently mutated content.
- **Agents are first-class consumers** — they pin/cache and need both a machine-checkable integrity key and a
  human-readable compatibility signal.
- **The boundary can change after publish** (brief §3 uc4) — redaction/unpublish must be real, without breaking the
  immutability promise to honest cachers.
- **No shared substrate; ports & adapters** (brief §1, §8) — the store cannot be a service shared with siblings, and
  the version identity must be sink-agnostic ([ADR-0004](./ADR-0004-import-and-ports.md)).

## Options considered

### Storage substrate

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Markdown/MDX-first in CAW-04's own git repo** (+ derived index, large assets by path/CDN) | Own the content; git history = redundant audit witness; diffable PR review *is* the curator gate; no runtime/DB substrate (brief §1); repo IS the vetted public corpus (cheapest public-safe story) | Rebuild per change; weak for thousands of large media (mitigated: assets by path) | **Chosen** — matches brief §6 exactly |
| Git-based CMS (editor over git) | Editing UX, git stays source of truth | Extra tool; same rebuild model | Optional later for curator ergonomics; no architecture change |
| DB-backed / headless CMS | Editorial workflow, scales to many pages | Content leaves git; adds a service+DB (shared-substrate smell); provenance/version harder to pin; larger leak surface | Rejected v1 — conflicts brief §6/§1 |

### Version identity

| Scheme | Pros | Cons | Fit |
|---|---|---|---|
| Date / CalVer | intuitive recency | no compat signal; same-day collisions | metadata only |
| **Semver** | machine-readable compat (breaking/feature/fix); agent-pinnable; industry standard | needs human bump judgement; not self-verifying | **primary human/agent identity** |
| **Content digest** (`sha256:` of canonical serialization) | self-verifying integrity; intrinsically immutable; alternate addressable key | opaque to humans; no compat signal | **immutability/integrity layer** |

## Decision

**Storage:** markdown/MDX with YAML frontmatter in CAW-04's **own git repo** is the source of truth, populated by the
`ContentSourceAdapter` *after* the public-safe re-check ([ADR-0004](./ADR-0004-import-and-ports.md)). Layout:
`src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`. Audit-only fields (`origin_ref`,
`origin_version`, redaction internals — [ADR-0002](./ADR-0002-content-model.md)) live in a **sidecar
record beside the file, excluded from served output**, never in the rendered frontmatter. Large assets by path/CDN.
A derived **index** (`index.json` manifest) is built from the files for the API ([ADR-0007](./ADR-0007-api-design.md)) —
the files remain the source of truth; the index is regenerable. The publish ledger is the hash-chained append-only
`_events` log from [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate.md), with git history as the redundant
second witness.

**Version identity — hybrid** (mirroring OCI `tag@digest` and npm `semver+integrity`):

1. **Semver** = the published version identity a curator assigns at publish (`triage-incident @ 2.1.0`); the
   human/agent compatibility contract and primary URL/path segment. Content-adapted bump rules:
   - **MAJOR** = guidance changed such that a reader/agent would take a *different action* (steps removed/reordered,
     preconditions changed, reversed recommendation).
   - **MINOR** = additive, backward-compatible (new example, optional step, clarified rationale).
   - **PATCH** = cosmetic / no behaviour change (typo, formatting, link fix).
2. **Content digest** = `sha256:` over a **canonical serialization** (normalized frontmatter key order, LF newlines,
   trimmed trailing whitespace) of the markdown body + the audited metadata envelope. Computed and frozen at publish;
   stored on every `Version`; the immutability proof + an alternate addressable key; surfaced as `digest` in API
   bodies and as a strong `ETag`.
3. **`published_at`** = required metadata (recency, audit, sort), never the identity.

**Immutability rules (the contract):**

- A `(slug, semver)` pair, once published, is **frozen forever** — bytes and digest never change.
- A `(slug, semver)` pair, once used, is **never reused** — even after unpublish (prevents a redacted address being
  silently re-filled with different content). Enforced at write time by the storage runbook.
- Every change to a published artifact = a **new `Version`** with a new semver (hence a new digest). A typo fix is a
  new PATCH; there is no in-place edit.

**Removal — three distinct, audited, Jimmy-approved operations** (do not conflate brief §3 uc4):

| Operation | Scope | Public behaviour | Record |
|---|---|---|---|
| **Deprecate** | version or item | still served; visible `deprecated` flag + successor pointer; API warning field/header | kept |
| **Unpublish** | whole item | item routes return **HTTP 410 Gone**; removed from index/listing/sitemap; web tombstone page | provenance + metadata retained for audit |
| **Redact** | single version (or field) | that version → **410 Gone** tombstone; siblings unaffected; `latest` re-points to newest non-redacted | immutable audit record (what/why/when/who); public bytes purged |

- **410 Gone, not 404** — says "existed, deliberately removed" (correct for SEO de-index, honest to agents,
  consistent with audit). **301** only when content genuinely *moved* (rename/merge), not for boundary removal.
- **Tombstone, never rewrite** — because `(slug, semver)` is never reused, a redacted address permanently resolves to
  a 410 tombstone (id, semver, digest, `redacted_at`, machine-readable reason). This keeps the immutability promise
  *and* allows removal. Provenance to the internal source is retained even after bytes are purged.
- Boundary re-check runs on every (re)publish ([ADR-0004](./ADR-0004-import-and-ports.md)); unpublish/redact is its
  failure-mode counterpart.

## Consequences

- **Easy:** the deployed/published corpus is a frozen, vetted file set — no live path from a public request into any
  internal store ([ADR-0006](./ADR-0006-web-stack.md) builds on this). Audit is "git history + hash-chained ledger."
- **Easy:** agents get both axes — semver answers "is this a breaking change?", digest answers "is this the exact
  bytes I trust?". `latest` responses include resolved `semver` + `digest` so a caller can deterministically re-pin.
- **Hard / cost:** content updates require a rebuild+deploy (acceptable at curator cadence — [ADR-0006](./ADR-0006-web-stack.md)).
  Large media needs an asset-by-path discipline. Semver bumps need human judgement (diff-assisted proposal possible).
- **Follow-on:** the storage runbook persists per `Version` `{slug, semver, digest, published_at, status, successor,
  audit record}` and enforces "never reuse `(slug, semver)`"; the publish-gate runbook assigns/validates semver
  (reject downgrade/reuse) and computes the digest before a version becomes addressable.

## Open questions / revisit triggers

- TODO(open-question: exact canonical serialization spec + which metadata fields are inside the hashed envelope vs
  mutable side-band — e.g. is `deprecated` inside the digest).
- TODO(open-question: who/what assigns the semver bump — curator only vs diff-assisted proposal Jimmy approves; how a
  mis-judged bump is corrected without breaking immutability).
- TODO(open-question: on redact, purge public bytes immediately vs retain encrypted internally for audit —
  legal/retention policy).
- TODO(open-question: digest algorithm + prefix convention (`sha256:` vs multihash); expose a digest-pin URL alias at
  v1 or defer). Coordinated with [ADR-0007](./ADR-0007-api-design.md).
- TODO(open-question: does a slug ever change (rename) — 301 from old slug vs new item + provenance link; interaction
  with old-version URL immutability).
- TODO(open-question: sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged).
- **Revisit trigger:** catalog/media volume that makes git+rebuild painful would reopen the substrate choice (toward
  a git-based CMS, not a DB).

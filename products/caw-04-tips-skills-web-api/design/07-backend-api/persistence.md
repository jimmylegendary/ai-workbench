# Persistence (md-in-git Content Store + Sidecar Audit + Index)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./api-surface.md](./api-surface.md) (Versioning + Audit operation contract)
  - [./import-service.md](./import-service.md) (what writes into the store, after re-check + approval)
  - [./build-and-publish-service.md](./build-and-publish-service.md) (what reads the store to build)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc describes the **persistence layer**: the markdown/MDX-in-git content store that is CAW-04's source of truth,
the **audit-only sidecar** that holds provenance and never serializes to web/API, the derived **index** that feeds the
API, and how upstream is referenced by `origin_ref`. It elaborates [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)
(storage + versioning) and [ADR-0002](../01-decisions/ADR-0002-content-model.md) (the public-projection split) for the
backend; it does NOT decide the build/deploy ([./build-and-publish-service.md](./build-and-publish-service.md)) nor the
re-check ([./import-service.md](./import-service.md)).

## Design property: the store IS the vetted public corpus

The content repo is CAW-04's **own git repo** ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)) — no DB,
no shared runtime substrate (brief §1). It is written by the `ContentSourceAdapter` **only after** the public-safe
re-check + curator approval ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)). The committed file set is the
frozen, vetted public corpus; git history is a redundant audit witness; the diffable PR review IS the curator gate
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). The **public projection split** is the load-bearing
rule: audit-only fields live in a sidecar that NEVER serializes to web/API (test-enforced,
[ADR-0002](../01-decisions/ADR-0002-content-model.md)).

## Repository layout

```
src/content/
  tips/<slug>/<semver>.md
  skills/<slug>/<semver>.mdx
  workflows/<slug>/<semver>.md
  playbooks/<slug>/<semver>.md
.sidecar/                          # audit-only; NEVER built, NEVER served
  <kind>/<slug>/<semver>.audit.json
_events/                           # hash-chained append-only publish ledger (ADR-0003)
  ledger.ndjson
assets/                            # large media by path/CDN (not inlined)
index.json                         # DERIVED manifest (regenerable; not source of truth)
caw04.config.yaml                  # port/adapter registry + profiles.recheck (core)
```

`(slug, semver)` is the addressable identity; the file path encodes it directly. One file per published version — there
is no in-place edit ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

## Published file: frontmatter + body (PUBLIC projection only)

```yaml
---
id: triage-incident            # stable slug
kind: skill                    # tip | skill | workflow | playbook
title: Triage a production incident
summary: Decision-ordered steps to triage and escalate.
version: 2.1.0                 # semver = published identity (ADR-0005)
digest: "sha256:..."          # content digest; immutability proof + strong ETag
boundary: public              # ONLY public is ever committed/served
published_at: 2026-01-01T00:00:00Z   # TODO(open-question: real value at write time)
status: published             # published | deprecated | unpublished | redacted
successor: null               # semver pointer when deprecated/redacted
safety_boundary: public-safe  # the SafetyBoundary entity (ADR-0002)
# reusable + auditable skill metadata (ADR-0002):
inputs: [...]
outputs: [...]
preconditions: [...]
provenance_public: "Imported from validated internal source; details audited internally."
---
<markdown body>
```

There is **no `origin_ref` / `origin_version` here.** Those audit-only fields live solely in the sidecar
([ADR-0002](../01-decisions/ADR-0002-content-model.md)/[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
`provenance_public` is a public-safe statement only; it never names confidential internals.

## Sidecar (audit-only — never web/API)

```json
{
  "slug": "triage-incident",
  "semver": "2.1.0",
  "digest": "sha256:...",
  "origin_ref": { "product": "CAW-03", "id": "skl_8f12", "uri": "caw03://skills/skl_8f12" },
  "origin_version": "5.4.0",
  "fetched_at": "2026-01-01T00:00:00Z",
  "recheck_evidence_ref": "_events#seq=842",
  "redaction": { "applied": false, "internals": [] },
  "approved_by": "Jimmy",
  "approved_at": "2026-01-01T00:00:00Z"
}
```

- The sidecar is **excluded from the Astro build input** and from every served projection. A build-time + test-time
  guard asserts no sidecar field (especially `origin_ref`/`origin_version`) leaks into any HTML/.md/.json output
  ([ADR-0002](../01-decisions/ADR-0002-content-model.md), test-enforced).
- Provenance is retained even after public bytes are purged on redact (audit survives removal,
  [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- Upstream is referenced **by `origin_ref` only** — id/URI/version, never a shared store
  ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)). CAW-04 holds its own copy of the content.

## Version identity (semver + content-digest)

| Axis | Role | Computed |
|---|---|---|
| `semver` | human/agent compat + primary URL/path segment | curator-assigned at approve ([./import-service.md](./import-service.md)) |
| `digest` | self-verifying immutability proof + alternate key + strong ETag | `sha256:` over canonical serialization at write |
| `published_at` | recency/audit/sort — **never** identity | write time |

Semver bump rules ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)): MAJOR = reader/agent would take a
*different action*; MINOR = additive backward-compatible; PATCH = cosmetic/no behavior change.

**Canonical serialization** for the digest: normalized frontmatter key order, LF newlines, trimmed trailing
whitespace, over the markdown body + the audited metadata envelope. (Exact spec + which fields are inside the hashed
envelope vs mutable side-band is TODO(open-question), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md).)

## Immutability + removal (write-time enforcement)

| Rule | Enforcement |
|---|---|
| `(slug, semver)` frozen forever | write rejects any change to an existing path; digest re-verified on rebuild |
| `(slug, semver)` never reused | write rejects a path that ever existed (even unpublished/redacted) |
| every edit = new Version | no in-place edit; a typo fix is a new PATCH |

Removal — three distinct audited ops ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)); the store-side
effect:

| Op | Store effect | Public effect |
|---|---|---|
| Deprecate | set `status: deprecated` + `successor` in a NEW version (not in-place); keep file | still served, flagged |
| Unpublish | mark item `unpublished`; drop from `index.json`/sitemap; retain provenance | all routes → 410 ([build-and-publish-service](./build-and-publish-service.md)) |
| Redact | mark version `redacted`; purge public bytes; retain immutable audit record | version → 410 tombstone; `latest` re-points |

A redacted/unpublished address permanently resolves to a 410 tombstone carrying `{id, semver, digest, redacted_at,
reason}` — never re-filled, because the path is never reused.

## Derived index

`index.json` is **regenerated from the files** at build; the files remain source of truth
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). It powers the API discovery manifest
([ADR-0007](../01-decisions/ADR-0007-api-design.md)) and lists only `published`/`deprecated` versions (excludes
unpublished/redacted, except as tombstone references).

```json
{
  "generated_at": "2026-01-01T00:00:00Z",
  "items": [
    { "slug": "triage-incident", "kind": "skill",
      "latest": "2.1.0",
      "versions": [
        { "semver": "2.1.0", "digest": "sha256:...", "status": "published", "url": "/skills/triage-incident/2.1.0" },
        { "semver": "2.0.0", "digest": "sha256:...", "status": "deprecated", "successor": "2.1.0" }
      ] }
  ]
}
```

`latest` always resolves to the newest **non-redacted** version, with resolved `semver` + `digest` so a caller can
deterministically re-pin ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

## Audit ledger (`_events`)

The publish ledger is the hash-chained append-only `_events/ledger.ndjson`
([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)); git history is the redundant second
witness. Every mutating op (import/recheck/approve/reject/publish/unpublish/redact/deprecate) appends exactly one event
with `{seq, prev_hash, hash, op, slug?, semver?, digest?, actor, at}` ([./api-surface.md](./api-surface.md) Audit ops).
A `LEDGER_BROKEN` hash-chain verification failure halts publish.

## Open Questions

- TODO(open-question: canonical serialization spec + which metadata fields are inside the hashed envelope vs mutable side-band — e.g. is `deprecated` inside the digest; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- TODO(open-question: on redact, purge public bytes immediately vs retain encrypted internally for audit — retention policy; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- TODO(open-question: digest algorithm + prefix (`sha256:` vs multihash); expose a digest-pin URL alias at v1 or defer; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)/[ADR-0007](../01-decisions/ADR-0007-api-design.md)).
- TODO(open-question: slug rename — 301 from old slug vs new item + provenance link; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- TODO(open-question: sitemap/index behavior for deprecated-but-served versions; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- A runbook scaffolds the repo layout (`src/content/<kind>/<slug>/<semver>`, `.sidecar/`, `_events/`, `index.json`, `caw04.config.yaml`).
- A runbook implements the **write guard**: reject mutation of any existing path and reject reuse of any path that ever existed; compute + store the digest before a version is addressable.
- A runbook implements the sidecar writer + a **test that no sidecar field serializes** into any HTML/.md/.json output ([ADR-0002](../01-decisions/ADR-0002-content-model.md)).
- A runbook implements the index generator (regenerable from files) and the hash-chained ledger appender with chain verification.

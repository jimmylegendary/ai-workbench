# Backend Core Operation Contract (Typed)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./import-service.md](./import-service.md) (Import + re-check pipeline)
  - [./build-and-publish-service.md](./build-and-publish-service.md) (Build/Publish via PublishSink)
  - [./persistence.md](./persistence.md) (md-in-git store + sidecar + index)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc defines the **typed operation contract of the CAW-04 product core** — the hexagonal application layer that
sits between the two ports (`ContentSourceAdapter`, `PublishSinkAdapter`) and the md-in-git store. It enumerates the
core operations (Import, ReCheckGate, Versioning, Build/Publish, Audit) with their signatures, inputs, outputs, and
failure modes. It does NOT decide the implementation language, the HTTP/REST shape of the *public* read surface
(that is the published artifact, [ADR-0007](../01-decisions/ADR-0007-api-design.md)), nor the adapter internals — only
the **internal core API** every adapter and the curator surface call. Types are tech-agnostic pseudo-schemas; the
binding language is fixed by [ADR-0006](../01-decisions/ADR-0006-web-stack.md)/[ADR-0007](../01-decisions/ADR-0007-api-design.md).

## Core invariant (public-safe by construction)

Every mutating operation that can reach the public surface routes through **one pipeline**:
`import → re-check → curator gate → version → build → publish`. There is **no operation** that writes to the published
corpus while skipping the re-check or the curator approval. Deny-by-default: an item not positively confirmed
`boundary_eff == public` is never versioned and never built. Adapters call the core; the core never lets an adapter
self-bypass the gate ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).

## Operation map

| Group | Operation | Caller | Mutates corpus? | Requires curator? |
|---|---|---|---|---|
| Import | `discoverCandidates` / `importCandidate` | curator surface / scheduler | no (staging only) | no |
| ReCheckGate | `runRecheck` | core (auto after import) | no (verdict only) | no |
| Curator gate | `listQueue` / `approve` / `reject` | curator surface | promotes on approve | **yes** |
| Versioning | `assignVersion` / `resolveLatest` | core / read | writes Version on publish | yes (via approve) |
| Build/Publish | `build` / `publish` / `unpublish` / `redact` / `deprecate` | publish service | yes | yes |
| Audit | `appendEvent` / `getProvenance` / `listEvents` | all ops (write) / curator (read) | append-only ledger | no |

## Shared types

```ts
type Kind = "tip" | "skill" | "workflow" | "playbook";
type Boundary = "public" | "internal" | "confidential";
type Decision = "publish" | "quarantine" | "reject";

// Upstream-tagged candidate produced by a ContentSourceAdapter (ADR-0004).
interface CandidateItem {
  kind: Kind;
  payload: ContentPayload;            // body + reusable/auditable metadata (ADR-0002)
  source_ref: OriginRef;              // id/URI/version of the upstream item
  upstream_boundary_claim: Boundary;  // EVIDENCE ONLY — never trusted as verdict
  upstream_metadata: Record<string, unknown>;
}

// Audit-only; lives in SIDECAR, NEVER serialized to web/API (ADR-0002/0005).
interface OriginRef { product: string; id: string; origin_version: string; fetched_at: string; }

// A re-checked, curator-approved, versioned, public artifact ready for a sink.
interface PublishableItem {
  slug: string;
  kind: Kind;
  semver: string;                     // assigned at publish (ADR-0005)
  digest: string;                     // "sha256:..." over canonical serialization
  boundary: "public";                 // type-narrowed: only public reaches here
  payload: ContentPayload;            // public projection ONLY (no origin_ref)
  published_at: string;
}

interface Result<T> { ok: boolean; value?: T; error?: CoreError; }
interface CoreError { code: string; message: string; findings?: Finding[]; }
```

## Import operations

See [./import-service.md](./import-service.md) for the pipeline; the contract surface is:

```ts
// Pull discovery across one or many active source adapters (fan-in, ADR-0004 §4).
function discoverCandidates(query: DiscoverQuery): Result<CandidateRef[]>;

// Fetch one candidate into the staging area (NOT the published corpus).
// Always immediately triggers runRecheck; the raw payload is never addressable.
function importCandidate(ref: CandidateRef): Result<StagedCandidate>;
```

- `importCandidate` is idempotent per `(source_ref.product, source_ref.id, origin_version)`; re-import of an unchanged
  upstream version returns the existing staged record, not a duplicate.
- Staging is a quarantine area, never served and never built. Failure modes: `SOURCE_UNAVAILABLE`,
  `SCHEMA_NONCONFORMANT`, `DUPLICATE_PRECEDENCE` (fan-in collision — TODO(open-question: dedup/precedence, ADR-0004)).

## ReCheckGate operation (core stage — load-bearing)

The re-check is a **core stage, never in an adapter** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §2). It
re-computes the boundary rather than trusting `upstream_boundary_claim`.

```ts
function runRecheck(staged: StagedCandidate): Result<RecheckVerdict>;

interface RecheckVerdict {
  decision: Decision;                 // publish | quarantine | reject
  boundary_eff: Boundary;            // RE-COMPUTED; fail-closed to confidential
  findings: Finding[];
  evidence_ref: string;              // pointer into the audit ledger
}
interface Finding { rule: string; severity: "block" | "warn"; detail: string; locus?: string; }
```

Checks (deny-by-default; any `block` finding ⇒ `decision != publish`):

| Rule | Failure ⇒ |
|---|---|
| `provenance.present` | reject (no validated internal source) |
| `boundary.recompute` | `boundary_eff` recomputed; unresolvable ancestor ⇒ `confidential` ⇒ quarantine |
| `visibility.not_private_derived` | quarantine |
| `redaction.leak_scan` | scan rendered **public view** for confidential patterns ⇒ quarantine |
| `claim_source.separation` | warn/quarantine (no internal-claim/public-research conflation) |
| `schema.conformance` | reject |

A `block` from re-check overrides any upstream public-safe claim. `quarantine` parks the item for curator inspection;
`reject` discards it from staging with an audit record. Pattern lists/thresholds live in `profiles.recheck` in the core,
never in an adapter ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §4).

## Curator gate operations

```ts
function listQueue(filter?: QueueFilter): Result<QueueEntry[]>;     // verdicts awaiting Jimmy
function approve(entryId: string, decision: ApproveDecision): Result<PublishableItem>;
function reject(entryId: string, reason: string): Result<void>;

interface ApproveDecision { semver: string; notes?: string; }     // curator assigns the bump
```

- `approve` is the **only** path that promotes a `decision=publish` verdict to a `PublishableItem`
  ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md) §3, [ADR-0003] gate). It requires the curator
  to assign a semver bump and re-runs `runRecheck` at promotion time (no stale verdict).
- A `quarantine` entry cannot be approved until findings are resolved (re-import or explicit override that is itself
  audited). Automatic generation is proposal-only; a human approves every publish (brief §11).

## Versioning operations

Identity = **semver + content-digest** ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

```ts
function assignVersion(item: PublishableItem, bump: ApproveDecision): Result<Version>;
function resolveLatest(slug: string): Result<Version>;             // newest non-redacted

interface Version {
  slug: string; semver: string; digest: string;
  published_at: string; status: "published" | "deprecated" | "unpublished" | "redacted";
  successor?: string;                 // semver pointer for deprecate/redact
}
```

Enforced rules (write-time, [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)):

- `(slug, semver)` once published is **frozen forever**; bytes + digest never change.
- `(slug, semver)` once used is **never reused** — even after unpublish/redact (prevents address re-fill).
- Every edit is a **new Version**; `assignVersion` rejects downgrade or reuse with `VERSION_CONFLICT`.
- `digest` is computed over the canonical serialization before the version becomes addressable.

## Build/Publish operations

Detailed in [./build-and-publish-service.md](./build-and-publish-service.md). Contract surface:

```ts
function build(scope: BuildScope): Result<BuildArtifact>;          // Astro SSG; asserts boundary==public
function publish(version: Version, ctx: PublishCtx): Result<PublishReceipt>;
function unpublish(slug: string, ctx: PublishCtx): Result<PublishReceipt>;     // whole item -> 410
function redact(slug: string, semver: string, ctx: PublishCtx): Result<PublishReceipt>;  // one version -> 410
function deprecate(slug: string, semver: string, successor?: string): Result<PublishReceipt>;
```

`build` carries a **fail-closed invariant**: if any emitted item has `boundary != public`, the build fails and nothing
deploys ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md) §Decision). `publish`/`unpublish` are
delegated to active `PublishSinkAdapter`s (v1: `SiteAndApiSinkAdapter`); the core supplies only `PublishableItem`s.

## Audit operations

```ts
function appendEvent(ev: PublishEvent): Result<void>;             // hash-chained append-only ledger
function getProvenance(slug: string, semver: string): Result<OriginRef>;   // SIDECAR — curator only
function listEvents(filter?: EventFilter): Result<PublishEvent[]>;

interface PublishEvent {
  seq: number; prev_hash: string; hash: string;   // hash chain (ADR-0003 ledger)
  op: "import" | "recheck" | "approve" | "reject" | "publish" | "unpublish" | "redact" | "deprecate";
  slug?: string; semver?: string; digest?: string; actor: string; at: string;
  verdict?: Decision; reason?: string;
}
```

- `getProvenance` returns the **audit-only** `origin_ref`/`origin_version` from the sidecar. This MUST NEVER be exposed
  on the public web/API surface (test-enforced, [ADR-0002]/[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- The ledger is the primary audit witness; git history is the redundant second witness
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). Every mutating op appends exactly one event.

## Error codes (stable contract)

| Code | Group | Meaning |
|---|---|---|
| `SOURCE_UNAVAILABLE` | Import | adapter `health()` failed / fetch error |
| `SCHEMA_NONCONFORMANT` | Import/ReCheck | payload fails content-model schema |
| `RECHECK_BLOCKED` | ReCheckGate | a `block` finding ⇒ not public-safe |
| `BOUNDARY_NOT_PUBLIC` | ReCheck/Build | recomputed boundary != public (fail-closed) |
| `CURATOR_REQUIRED` | Gate | publish attempted without an `approve` |
| `VERSION_CONFLICT` | Versioning | downgrade / `(slug,semver)` reuse |
| `SINK_REJECTED` | Publish | `PublishSinkAdapter.canAccept` returned false |
| `LEDGER_BROKEN` | Audit | hash-chain verification failed (halt) |

## Open Questions

- TODO(open-question: pull vs push import trigger — affects `discoverCandidates` cadence; see [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
- TODO(open-question: fan-in dedup/precedence + provenance merge across CAW-02 + CAW-03 sources; [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
- TODO(open-question: who assigns the semver bump — curator only vs diff-assisted proposal; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- TODO(open-question: liveness/revocation — how the core learns when an upstream source retracts an imported item; [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- A runbook defines the core operation interfaces above as the stable internal API both ports + the curator surface bind to.
- A runbook wires the **fail-closed `boundary == public` build assertion** into CI ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md)).
- A runbook implements a **negative-heavy test suite**: an item upstream-marked public-safe but carrying a confidential pattern MUST be blocked + quarantined with a logged finding.
- A runbook test asserts `origin_ref`/`origin_version` never serialize into any web/API projection.

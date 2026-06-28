# Component Boundaries — Module Ownership & Core Service Signatures

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./system-architecture.md](./system-architecture.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This document fixes **module ownership inside the Product Core** and the **signature-level contracts** of its five
core services (Import, Re-check/Gate, Versioning, Build/Publish, Audit), plus the rule — load-bearing — that the
**public-safe re-check and curator gate live in the core and adapters cannot bypass them**. It elaborates the
container split in [system-architecture.md](./system-architecture.md); it does not redefine entity fields
(ADR-0002), gate policy (ADR-0003), or storage identity (ADR-0005). Signatures are **contract sketches** for
runbooks (the builder writes real code); the language binding is fixed in ADR-0006/0007.

## Module map

| Module | Layer | Owns | Depends on (allowed) | Must NOT depend on |
|---|---|---|---|---|
| `core/model` | domain | Entity types, `CandidateItem`, `PublishableItem`, `RecheckVerdict`, value objects (`Boundary`, `Semver`, `ContentDigest`) | — | adapters, web stack, I/O |
| `core/ports` | domain | Port interfaces `ContentSourcePort`, `PublishSinkPort`; `AdapterCapabilities` | `core/model` | concrete adapters |
| `core/import` | application | Import service: discover/fetch via source port, assemble `CandidateItem` | `model`, `ports` | sink/source impls |
| `core/recheck` | application | **Re-check + gate** (deny-by-default); `profiles.recheck` | `model`, `audit` | any adapter |
| `core/versioning` | application | Assign immutable `(slug, semver)` + content-digest; freeze; tombstone | `model`, storage write | adapters |
| `core/publish` | application | Drive the chosen `PublishSinkPort`; emit `PublishReceipt` | `model`, `ports`, `audit` | source impls |
| `core/audit` | application | Append-only audit of every stage | `model` | adapters |
| `core/registry` | config | Resolve adapters from `caw04.config.yaml`; preflight wiring | `ports`, capabilities | adapter internals |
| `adapters/source/*` | adapter | `Caw02Knowledge`, `Caw03SkillsRegistry`, stubs | `core/ports`, `core/model` | `core/recheck`, `core/versioning` |
| `adapters/sink/*` | adapter | `SiteAndApiSink` (Astro build), stubs | `core/ports`, `core/model` | `core/recheck` |

Hard rule: dependencies point **inward** to `core/model` + `core/ports`. Adapters know the ports, never the core
services. The core never imports a concrete adapter — it resolves them via `core/registry` (ADR-0004 §4).

## The pipeline & where each stage lives

```
[adapters/source]      [core/import]   [core/recheck]    [core/versioning]   [core/publish]   [adapters/sink]
 fetch CandidateItem ─►  assemble    ─► RE-CHECK+GATE  ─►  freeze (slug,    ─►  drive sink  ─►  build/emit
 (+upstream claim =      provenance     deny-by-default     semver,digest)      PublishReceipt   static artifact
  EVIDENCE only)                        + curator gate
                                        ▲ CORE-ONLY ▲
```

The re-check/gate sits **between** the source adapter and any sink. There is **no raw import path** around it
(ADR-0004 §2). Humans and agents traverse the same stages.

## Core service signatures (contract sketches)

### Shared model

```ts
type Boundary = "public" | "internal" | "confidential";

interface CandidateItem {            // produced by a source adapter, pre-check
  payload: EntityPayload;            // Tip|Skill|Workflow|Playbook + Example/Source refs
  upstream_boundary_claim: Boundary; // EVIDENCE ONLY — never a verdict
  source_ref: SourceRef;            // id/URI/version into the upstream product
  upstream_metadata: Record<string, unknown>;
}

interface PublishableItem {          // ONLY thing a sink may consume
  payload: PublicProjection;         // audit-only fields already stripped (ADR-0002)
  boundary: "public";               // invariant: always public here
  semver: Semver;                    // immutable identity (ADR-0005)
  content_digest: ContentDigest;     // immutability proof
  provenance_public: ProvenancePublic; // public-safe subset only
}

interface RecheckVerdict {
  decision: "publish" | "quarantine" | "reject";
  boundary_eff: Boundary;           // RE-COMPUTED; fail-closed to "confidential"
  findings: Finding[];
  evidence_ref: AuditRef;
}
```

### 1. Import service — `core/import`

```ts
interface ImportService {
  // Pull candidates from one/many active source adapters (fan-in).
  discover(query: DiscoverQuery): Promise<CandidateRef[]>;
  fetch(ref: CandidateRef): Promise<CandidateItem>;
}
```
Owns assembling provenance; owns nothing about safety. Calls `ContentSourcePort` only.

### 2. Re-check / Gate service — `core/recheck` (load-bearing, core-only)

```ts
interface RecheckGateService {
  // The import-time enforcement of the ADR-0003 gate. Deny-by-default.
  recheck(item: CandidateItem): Promise<RecheckVerdict>;
  // Promote to live ONLY after a passing verdict AND explicit curator approval.
  approve(verdict: RecheckVerdict, curator: CuratorRef): Promise<ApprovedItem>;
}
```
Checks (ADR-0004 §2): provenance present; `boundary_eff === "public"` re-computed (fail-closed on unresolvable
ancestor); visibility not private-derived; redaction/leak scan over the **rendered public view**; claim/source
separation; schema conformance. A failed re-check blocks the item **even when upstream marked it public-safe**.
`profiles.recheck` (thresholds, pattern lists) lives here, never in an adapter.

### 3. Versioning service — `core/versioning`

```ts
interface VersioningService {
  freeze(item: ApprovedItem): Promise<PublishableItem>; // assign (slug,semver)+digest; write public projection to git; sidecar audit-only
  supersede(slug: Slug, next: ApprovedItem): Promise<PublishableItem>; // edits = NEW version
  tombstone(ref: VersionRef, reason: TombstoneReason): Promise<Tombstone>; // unpublish/redact → HTTP 410
}
```
Published `(slug, semver)` is frozen **forever** (ADR-0005); boundary changes route to `tombstone`, never mutate.

### 4. Build/Publish service — `core/publish`

```ts
interface PublishService {
  publish(item: PublishableItem, ctx: PublishCtx): Promise<PublishReceipt>;
  unpublish(ref: VersionRef, ctx: PublishCtx): Promise<PublishReceipt>;
}
```
Delegates to the active `PublishSinkPort`. For `SiteAndApiSink` this triggers the Astro SSG build, which runs the
build-time `boundary === "public"` assertion + public-projection test before emitting `dist/` (ADR-0006). The
service refuses any item whose `boundary !== "public"`.

### 5. Audit service — `core/audit`

```ts
interface AuditService {
  record(event: AuditEvent): Promise<AuditRef>; // import|recheck|approve|publish|unpublish, with provenance
}
```
Append-only; every other service writes through it so each published item traces to its validated source + safety
review (brief §3 uc5).

## Port contracts (the only adapter surface)

```ts
interface ContentSourcePort {
  capabilities(): AdapterCapabilities;            // requiresPublicSafe: true (cannot self-disable)
  discover(query: DiscoverQuery): Promise<CandidateRef[]>;
  fetch(ref: CandidateRef): Promise<CandidateItem>;
  health(): Promise<Health>;
}

interface PublishSinkPort {
  capabilities(): AdapterCapabilities;
  canAccept(item: PublishableItem): Acceptance;   // type guarantees boundary === "public"
  publish(item: PublishableItem, ctx: PublishCtx): Promise<PublishReceipt>;
  unpublish(ref: VersionRef, ctx: PublishCtx): Promise<PublishReceipt>;
}
```

## The non-bypass rule (load-bearing)

How "adapters cannot bypass the re-check + gate" is enforced structurally:

| Mechanism | Effect |
|---|---|
| **Type wall** | Sinks consume only `PublishableItem`, which is **only** producible by `core/versioning.freeze`, which only accepts an `ApprovedItem` from `core/recheck.approve`. There is no constructor path from `CandidateItem` to `PublishableItem` outside the core. |
| **No core import in adapters** | `adapters/*` may import `core/ports` + `core/model` only; importing `core/recheck`/`core/versioning` is a forbidden dependency (architecture fitness test). |
| **Capability flag** | Every adapter descriptor carries `requiresPublicSafe: true`, not self-disableable; preflight (`core/registry`) refuses to wire an adapter that lacks it (ADR-0004 §3). |
| **Preflight** | No `active` adapter may be a `stub`; sink `accepts` must match what the pipeline emits; missing config fails fast, not mid-publish. |
| **Build backstop** | Even a misbehaving sink hits the build-time `boundary === "public"` assertion + public-projection test (ADR-0006), which fail the build. |
| **Deny-by-default** | Anything not positively confirmed public-safe does not publish (ADR-0003/0004). |

Negative test (the §11 regression guard): an item **upstream-marked public-safe** but carrying a confidential
pattern must be **blocked + quarantined** with a logged finding — proving the upstream claim is evidence, not a
verdict.

## Open questions

- TODO(open-question: language-binding) — concrete language for the core (ports are tech-agnostic here; ADR-0006/0007).
- TODO(open-question: recheck-ruleset) — exact re-check rule set + where `profiles.recheck` thresholds live;
  doctrinal alignment with CAW-02's boundary without a shared substrate.
- TODO(open-question: fan-in-merge) — provenance-preserving dedup/precedence across source adapters.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- Build `core/model` + `core/ports` first; then `core/recheck` with its negative-heavy test suite before any sink.
- Add the architecture fitness test that forbids `adapters/* → core/recheck|core/versioning` imports.
- Realize `PublishableItem` so it is constructible **only** through `core/versioning.freeze` (private constructor /
  factory) — the type wall is the cheapest non-bypass guarantee.
- Container view and the public-safe-by-construction layers: see [system-architecture.md](./system-architecture.md).

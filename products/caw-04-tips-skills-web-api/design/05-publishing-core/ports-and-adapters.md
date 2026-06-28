# Ports & Adapters — the two seams of the publishing core

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§7 import boundaries, §8 open interfaces)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md) (the decision this doc elaborates)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (the gate this seam invokes)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (`CandidateItem`/`PublishableItem` shapes)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (where re-checked items land + freeze)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md) (the v1 sink: website + REST + MCP)
  - [../02-research/import-and-ports.md](../02-research/import-and-ports.md) (the research backing)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc specifies the **two driven ports** of CAW-04's publishing core — `ContentSourceAdapter` (where
candidate content enters) and `PublishSinkAdapter` (where the public surface is emitted) — plus the
**config-driven registry** and the **documented-stub** pattern for future connectors. It is the engineering
contract for [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md): the core depends **only** on ports, and
**no adapter can bypass the core's public-safe re-check or curator gate**.

It does NOT define the public-safe re-check rule set, the publish-gate policy, the content model, or the
storage/versioning layout — those are owned by sibling docs in this folder and the linked ADRs, and are
*consumed* here. This doc emphasises the **public-safe-by-construction** property: the seam is shaped so that the
only way content reaches a sink is *through* the core stages, never around them.

## 1. The hexagon at a glance

The core is a **publishing pipeline**, not a writing harness. It depends on two abstract ports; concrete I/O
lives in adapters the core never imports. The fixed pipeline (owned by the core) is:

```
discover/fetch          re-check (core)        curator gate (core)    version (core)     publish
 ┌───────────────┐      ┌───────────────┐      ┌──────────────┐      ┌──────────┐      ┌──────────────┐
 │ContentSource  │ ──▶  │ public-safe    │ ──▶ │ Jimmy        │ ──▶ │ semver + │ ──▶ │ PublishSink  │
 │Adapter (PORT) │      │ RE-CHECK       │      │ approval     │      │ digest   │      │ Adapter(PORT)│
 └───────────────┘      └───────────────┘      └──────────────┘      └──────────┘      └──────────────┘
   CandidateItem          RecheckVerdict          approval rec.         PublishableItem    PublishReceipt
```

| Property | How the hexagon guarantees it |
| --- | --- |
| Core depends only on ports | Core imports the two `interface`s + value objects; never a concrete adapter or its SDK. |
| Adapters cannot bypass the gate | There is **no method** on either port that emits to a sink directly from a source. The core is the only caller of `publish()`, and it calls it only after re-check + curator gate + versioning. |
| Public-safe by construction | A sink only ever receives a `PublishableItem`, a type the core mints **only** post-re-check; a source can only ever return a `CandidateItem`, which is not publishable. The type boundary *is* the safety boundary. |
| Independence (no shared substrate) | Adapters reference upstream by id/URI/version, keep CAW-04's OWN copy, and take secrets via env refs only. |

## 2. Value objects (the only things crossing the ports)

The ports speak only in CAW-04's own provenance-carrying value objects. Two are load-bearing for safety:
a source can mint a `CandidateItem` but **never** a `PublishableItem`; only the core mints the latter.

```ts
// Produced by a source; NOT publishable. Carries upstream's claim as EVIDENCE only.
type CandidateItem = {
  kind: ContentKind;                 // TIP | SKILL | WORKFLOW | PLAYBOOK
  payload: ContentPayload;           // markdown/MDX + structured frontmatter (ADR-0002)
  source_ref: SourceRef;             // { adapterId, id/URI, upstream_version } — referenced, not embedded
  upstream_boundary_claim: string;   // EVIDENCE ONLY — never trusted as a verdict (ADR-0004 §Decision.2)
  upstream_metadata?: Record<string, unknown>;
};

// Minted ONLY by the core after re-check + curator gate + versioning. The only input a sink accepts.
type PublishableItem = {
  kind: ContentKind;
  publicView: PublicProjection;      // audit-only provenance (origin_ref/origin_version) STRIPPED → sidecar (ADR-0002)
  boundary: "public";                // re-computed by the core; the ONLY allowed value
  semver: string;                    // public addressable identity (ADR-0005)
  content_digest: string;            // immutability proof (ADR-0005)
  provenance: PublicProvenance;      // public-safe provenance kept on the artifact
  verdict_ref: string;               // back-ref to the RecheckVerdict that cleared it
};
```

> Public-projection split (ADR-0002): audit-only `origin_ref`/`origin_version` live in a **sidecar** and MUST
> NEVER serialize into `PublicProjection`. The sink receives `publicView` only; the type makes leakage of
> audit-only fields structurally impossible (test-enforced).

`RecheckVerdict`, `AdapterCapabilities`, `Acceptance`, `PublishReceipt`, `PublishedRef`, and `HealthStatus` are
shared core types; see [../02-research/import-and-ports.md](../02-research/import-and-ports.md) §3–§5 for their
fields and [the public-safe re-check doc](./import-and-recheck.md) (TODO) for the verdict semantics.

## 3. Port 1 — `ContentSourceAdapter`

Read-only, driven (the core calls out). Interchangeable: CAW-02 knowledge, CAW-03 skills, and any future wiki
sit behind the same `fetch() -> CandidateItem`. The adapter **never knows the re-check exists**.

```ts
interface ContentSourceAdapter {
  capabilities: AdapterCapabilities;                        // port="source", provides=[...], requiresPublicSafe=true
  discover(query: SourceQuery): Promise<CandidateRef[]>;    // list importable items by id/URI (NO payload)
  fetch(ref: CandidateRef): Promise<CandidateItem>;         // pull ONE provenance-tagged candidate
  health(): Promise<HealthStatus>;                          // reachable? auth ok? (preflight)
}
```

| Method | Contract | Must NOT |
| --- | --- | --- |
| `discover` | Return lightweight refs (id/URI/version) matching the query; pull-only in v1. | Return payloads or apply any boundary verdict. |
| `fetch` | Return exactly one `CandidateItem`, tagging `source_ref` + `upstream_boundary_claim`. | Set `boundary:"public"`, strip audit fields, or claim publishability. |
| `health` | Cheap reachability/auth probe for preflight. | Perform writes or mutate upstream. |
| `capabilities` | Declare `provides`, `requiresConfig`, `maturity`; `requiresPublicSafe` is `true` and immutable. | Self-disable the public-safe requirement. |

**v1 concrete:** `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`.
**Stubs:** `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter` (see §6).

Cross-product rule: CAW-02 and CAW-03 are **separate products**; these adapters cross an explicit import
boundary by id/URI/version and never share a store/registry/runtime (Independence §1). CAW-04 copies only what
it actually publishes.

## 4. Port 2 — `PublishSinkAdapter`

Driven; emits a vetted artifact. It consumes **only** a `PublishableItem` — already re-checked, curator-approved,
versioned, `boundary=public`, audit fields stripped.

```ts
interface PublishSinkAdapter {
  capabilities: AdapterCapabilities;                                          // port="sink", accepts=[...]
  canAccept(item: PublishableItem): Promise<Acceptance>;                      // type/format/boundary preflight
  publish(item: PublishableItem, ctx: PublishContext): Promise<PublishReceipt>;   // emit a versioned artifact
  unpublish(ref: PublishedRef, ctx: PublishContext): Promise<PublishReceipt>;     // tombstone/redact (brief §3 uc4)
}
```

| Method | Contract | Must NOT |
| --- | --- | --- |
| `canAccept` | Cheap preflight: can this sink emit this `kind`/format at `boundary=public`? Returns `Acceptance.yes/no(reason)`. | Re-derive or override the boundary. |
| `publish` | Emit one immutable, addressable artifact; return a `PublishReceipt` (location + digest echo). | Mutate a frozen `(slug,semver)`; re-run or skip the gate. |
| `unpublish` | First-class withdraw/redact → HTTP 410 tombstone (ADR-0005); old versions stay addressable as tombstones. | Hard-delete history silently. |
| `capabilities` | Declare `accepts`, `features` (e.g. `supports-unpublish`, `markdown`, `json`), `requiresPublicSafe:true`. | Accept any item whose `boundary != public`. |

**v1 concrete:** `SiteAndApiSinkAdapter` — the Astro SSG build (HTML) + the prebuilt static REST JSON / raw
markdown / MCP resources view from one source (ADR-0006, ADR-0007). Web/API parity comes from a single build;
the sink writes a **frozen vetted static artifact with no live path to internal stores**.
**Stubs:** `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter` (see §6).

> The MCP resources view is realized as a facet of the same sink (ADR-0007), not a separate port.

## 5. Capability descriptors + preflight

Every adapter carries a machine-readable descriptor so the core validates wiring **before any I/O** — failures
surface at preflight with actionable messages, never mid-publish.

```ts
type AdapterCapabilities = {
  port: "source" | "sink";
  id: string;
  version: string;
  provides?: ContentKind[];     // source: TIP/SKILL/WORKFLOW/PLAYBOOK
  accepts?: ArtifactKind[];     // sink: WEBSITE_BUILD/REST_INDEX/MD_DOC/PKG
  features?: string[];          // {"incremental","supports-unpublish","markdown","json"}
  requiresConfig?: string[];    // keys that MUST be present (preflight checks)
  requiresPublicSafe: true;     // INVARIANT — cannot be self-disabled by the adapter
  maturity: "v1" | "stub" | "experimental";
};
```

Preflight rules (all must pass before a run):

| Rule | Failure message intent |
| --- | --- |
| Each `active` id resolves in the registry | "unknown adapter `X` in ports.<port>.active" |
| Active sink `accepts` what the pipeline emits | "sink `X` cannot accept REST_INDEX produced by the build" |
| Active source `provides` what the content model needs | "source `X` provides no SKILL kind" |
| Required `requiresConfig`/auth present (env refs resolve) | "missing env CAW02_TOKEN for `caw02-knowledge`" |
| **No `active` adapter has `maturity:"stub"`** | "stub `package-registry` is active — implement <file> or disable" |
| `health()` ok for active adapters | "source `X` unreachable / auth failed" |

The descriptor's `requiresPublicSafe:true` is an invariant the core asserts; an adapter that tried to declare it
`false` fails preflight. This is a second structural guard behind the type boundary of §2.

## 6. Config-driven registry — the only place wiring changes

Adapters are **registered** (never hard-coded into the core) and **selected by config**. One block per port.
Sources allow **fan-in** (multiple active). Secrets are **env refs only** (no shared substrate). The re-check
profile lives in the **core**, never in an adapter.

```yaml
# caw04.config.yaml — the ONLY place wiring changes
ports:
  source:
    active: [caw02-knowledge, caw03-skills]      # fan-in: multiple sources import in
    caw02-knowledge: { endpoint: "...", auth: "env:CAW02_TOKEN" }
    caw03-skills:    { endpoint: "...", auth: "env:CAW03_TOKEN" }
    internal-wiki:   { enabled: false }          # stub present, off until connector lands
    curated-bundle:  { enabled: false }          # stub
  sink:
    active: [site-and-api]
    site-and-api:       { out_dir: "...", formats: [markdown, json] }
    external-docs-host: { enabled: false }       # stub
    package-registry:   { enabled: false }       # stub
    syndication:        { enabled: false }       # stub
profiles:
  recheck: { ... }   # public-safe re-check thresholds / pattern lists — CORE, not any adapter
```

The registry **never** lets an adapter override the core's re-check, curator gate, or boundary policy. It only
maps a logical id → adapter factory and selects which are `active`. Adapter discovery mechanism (built-in
registry vs entry-point/manifest) and adapter↔port SemVer/compat policy are
`TODO(open-question: see ADR-0004)`.

## 7. The documented-stub pattern (future connectors)

A future connector ships in v1 as a **documented stub**: the real interface, a `NotImplemented` body, a
descriptor with `maturity="stub"`, and a config example. Wiring it later = filling in *that one file's* method
bodies. A stub is **registered and discoverable** (appears in `registry.list()` and the preview/admin UI) but
**config-disabled by default**; preflight refuses to run a `stub` that is `active`, pointing at the file to
implement.

```ts
@registerAdapter({ port: "sink", id: "package-registry" })
class PackageRegistrySinkAdapter implements PublishSinkAdapter {
  /** STUB — publish skills as installable packages. Implement when approved (brief §8 stub, §10 non-goal v1).
   *  Contract: PublishSinkAdapter (§4). Must respect core public-safe gate; only accept boundary=public.
   *  Config: ports.sink.package-registry: { registry_url, auth: "env:PKG_TOKEN", namespace } */
  capabilities = { port: "sink", id: "package-registry", version: "0.0.0",
    accepts: ["PKG"], features: ["supports-unpublish"],
    requiresConfig: ["registry_url", "auth"], requiresPublicSafe: true, maturity: "stub" } as const;
  canAccept() { return Acceptance.no("stub not wired"); }
  publish()   { throw new NotImplemented("package-registry sink not yet wired"); }
  unpublish() { throw new NotImplemented("stub"); }
}
```

| Required stub | Port | Notes |
| --- | --- | --- |
| `InternalWikiSourceAdapter` | source | import from an internal wiki (still crosses the re-check) |
| `CuratedBundleSourceAdapter` | source | import an arbitrary curated bundle |
| `ExternalDocsHostSinkAdapter` | sink | publish to an external docs host |
| `PackageRegistrySinkAdapter` | sink | publish skills as installable packages |
| `SyndicationSinkAdapter` | sink | syndicate to a feed |

Note the safety property survives the stub pattern: even a fully-wired future sink still receives only a
`PublishableItem` and still sits behind the core's gate — a new connector cannot widen the leak surface.

## 8. The seam test (why this generalizes)

A change is "open by design" if a new integration touches **only one adapter file + one config block**. If any
of these would force a core edit, the contract is leaking — reopen [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md).

| New integration | Adds | Does NOT touch |
| --- | --- | --- |
| Internal wiki as a source | implement `InternalWikiSourceAdapter`, enable config | core, re-check, gate, other adapters |
| Curated bundle import | implement `CuratedBundleSourceAdapter` | content model / re-check (consume `CandidateItem`) |
| Publish to external docs host | implement `ExternalDocsHostSinkAdapter`, flip `active` | human gate + public-safe re-check (stay in core) |
| Publish skills as packages | implement `PackageRegistrySinkAdapter` | versioning/immutability rules (core) |
| Syndicate to a feed | implement `SyndicationSinkAdapter` | provenance/boundary on `PublishableItem` |

## Open Questions

Track in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):

- TODO(open-question: adapter **discovery mechanism** — built-in registry vs entry-point/manifest — and
  adapter↔port SemVer/compat policy.)
- TODO(open-question: import is **pull** (`discover()` polling) vs **push** (upstream notifies); v1 draft is
  pull-only — affects the source port.)
- TODO(open-question: **fan-in dedup/precedence** + provenance-preserving merge when CAW-02 and CAW-03 surface
  the same logical item.)
- TODO(open-question: `unpublish` semantics for immutable addressable versions — tombstone (HTTP 410) vs
  hard-removal; owned jointly with [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md).)
- TODO(open-question: when upstream **retracts/re-validates** a source item, how CAW-04 learns and re-runs the
  gate — does `source_ref` carry a liveness/revocation check.)

## Implications for runbooks

- **RB (core/ports):** define `ContentSourceAdapter` + `PublishSinkAdapter` interfaces and the value objects
  (`CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`). Leave the tree green with fakes
  only — no concrete I/O. Acceptance: a source cannot construct a `PublishableItem` (type-enforced).
- **RB (registry/config):** implement register + select-by-config, the `caw04.config.yaml` loader, env-ref
  secrets, and **preflight**. Acceptance: preflight rejects a stub/incapable/misconfigured wiring with an
  actionable message, and rejects any descriptor declaring `requiresPublicSafe:false`.
- **RB (v1 adapters):** `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`,
  `SiteAndApiSinkAdapter` (the latter realized by [ADR-0006](../01-decisions/ADR-0006-web-stack.md) +
  [ADR-0007](../01-decisions/ADR-0007-api-design.md)).
- **RB (stubs):** ship every brief-§8 stub via §7 — registered, `maturity="stub"`, config-disabled. Acceptance:
  each appears in `registry.list()` and is refused by preflight when forced `active`.
- Cross-product links (CAW-02, CAW-03) stay behind the `ContentSourceAdapter` contract only, by id/URI/version —
  never a shared store (Independence §1).

# ADR-0004: Import via ports & adapters with a public-safe re-check at the trust boundary

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§7 import boundaries, §8 open interfaces)
  - [../02-research/import-and-ports.md](../02-research/import-and-ports.md) (research this ADR ratifies)
  - [./ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate.md) (the gate policy these ports invoke)
  - [./ADR-0002-content-model.md](./ADR-0002-content-model.md) (the `CandidateItem`/`PublishableItem` shapes)
  - [./ADR-0005-storage-and-versioning.md](./ADR-0005-storage-and-versioning.md) (where re-checked items land + freeze)
  - [./ADR-0007-api-design.md](./ADR-0007-api-design.md) (the v1 sink: website + REST + MCP)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

CAW-04 is the public read/API publishing layer. It authors nothing; it **imports** already-validated content from
sibling products that **do not share its runtime** — CAW-02 (knowledge, a separate product) and CAW-03 / a skills
registry (a separate product) — and **publishes** it to the world (brief §1, §7). Forces:

- **No shared substrate** (brief §1). Every cross-product link must be an adapter over an explicit import boundary
  — reference by id/URI/version, never a shared store or registry. CAW-04 keeps its OWN copy of what it publishes.
- **Heterogeneous, growing sources and sinks** (brief §8): v1 = CAW-02 + CAW-03 in, website + REST out; future =
  internal wiki / curated bundle in, external docs host / package registry / syndication out. Adding one must be
  "fill one adapter file + one config block," not a core edit.
- **Upstream `public-safe` is a claim, not a verdict** (brief §7, §11). The single most dangerous failure is
  leaking confidential know-how onto the public surface; the seam must make that structurally hard.
- **Jimmy approves every publish** (brief §11). The human gate and the safety re-check must live in the core, where
  no adapter can self-bypass them.

## Options considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Hexagonal core + 2 driven ports (`ContentSourceAdapter`, `PublishSinkAdapter`) + config registry; public-safe re-check in core** | Swap source/sink freely; gate cannot be bypassed; testable with fakes; matches CAW-03 backbone (independent copy) | Upfront contract design; indirection; some upstream logic re-implemented locally | **Chosen** — brief §8 mandates ports & adapters |
| Direct point-to-point importers (one bespoke CAW-02 importer, one CAW-03 importer) | Less abstraction now | Re-check + gate logic duplicated per importer; new source = new core path; bypass risk | Rejected — leaks the seam, brittle |
| Shared client library imported from CAW-02/CAW-03 | Reuse upstream boundary code | Creates a shared runtime substrate (violates brief §1); couples release cycles | Rejected — independence contract |
| Trust upstream `public_safe` flag, thin pass-through | Cheap | A single upstream mis-classification ships a leak to the public; no defense in depth | Rejected — brief §7/§11 |

## Decision

Adopt a **hexagonal (ports & adapters)** core with **two driven ports**, a **config-driven registry**, and a
**core-resident public-safe re-check** that every import crosses.

1. **Two ports (typed, tech-agnostic interfaces; language fixed in [ADR-0006](./ADR-0006-web-stack.md)/[ADR-0007](./ADR-0007-api-design.md)):**
   - `ContentSourceAdapter` — `capabilities`, `discover(query) -> CandidateRef[]`, `fetch(ref) -> CandidateItem`,
     `health()`. Read-only; references upstream by id/URI/version; returns a provenance-tagged `CandidateItem`
     (payload + `upstream_boundary_claim` + `source_ref` + `upstream_metadata`). It never knows the re-check exists.
   - `PublishSinkAdapter` — `capabilities`, `canAccept(item) -> Acceptance`, `publish(item, ctx) -> PublishReceipt`,
     `unpublish(ref, ctx) -> PublishReceipt`. `unpublish` is first-class (brief §3 uc4). Consumes only a
     `PublishableItem` (re-checked, curator-approved, versioned, `boundary=public`, provenance attached).
2. **The public-safe re-check is a core stage, never in an adapter** (load-bearing; the CAW-04 analogue of CAW-02's
   `kr.boundary`, an independent copy). The pipeline is `import → re-check → curator gate → version → publish`. The
   re-check is the import-time enforcement of the [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate.md) gate:
   provenance present, **re-computed** `boundary_eff == public` (fail-closed: unresolvable ancestor ⇒ confidential),
   visibility not private-derived, redaction/leak scan over the rendered public view, claim/source separation, schema
   conformance. Outcome is a typed `RecheckVerdict { decision: publish|quarantine|reject, findings[], boundary,
   evidence_ref }`. **Deny-by-default:** anything not positively confirmed public-safe does not publish. A failed
   re-check blocks the item even when upstream marked it public-safe. There is **no raw import path** around it —
   agents and humans use the same checks.
3. **Capability descriptors + preflight.** Each adapter carries `AdapterCapabilities` (`port`, `id`, `version`,
   `provides`/`accepts`, `features`, `requiresConfig`, `requiresPublicSafe: true` — cannot be self-disabled,
   `maturity`). Before any I/O the core resolves active adapters, reads descriptors, and validates wiring (sink
   `accepts` what the pipeline emits; source `provides` what the content model needs; required config/auth present;
   **no `active` adapter is a `stub`**). Failures are reported here with actionable messages, not mid-publish.
4. **Config-driven registry — the only place wiring changes.** `caw04.config.yaml` has one block per port; adapters
   are registered (never hard-coded), selected by `active` lists; source allows **fan-in** (multiple sources). Secrets
   are **env refs only** (no shared substrate). `profiles.recheck` (thresholds / pattern lists) lives in the core,
   not in any adapter; the registry can never let an adapter override the re-check, human gate, or boundary policy.
5. **Documented stubs in v1** (brief §8). A future adapter ships as: the real interface, a `NotImplemented` body, a
   descriptor with `maturity="stub"`, and a config example — registered and discoverable but **config-disabled by
   default**; preflight refuses to run a `stub` that is `active`, pointing at the file to implement. Required stubs:
   sources `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`; sinks `ExternalDocsHostSinkAdapter`,
   `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`. v1 concrete adapters: `Caw02KnowledgeSourceAdapter`,
   `Caw03SkillsRegistrySourceAdapter`, `SiteAndApiSinkAdapter` (+ the MCP view as a sink, [ADR-0007](./ADR-0007-api-design.md)).

## Consequences

- **Easy:** add a source/sink by writing one adapter + one config block; the seam test (a new integration touches
  only one adapter file + one config block) is the regression check. Core is testable with fakes only.
- **Easy:** the leak surface is one core stage. A negative-heavy test suite (an item upstream-marked public-safe but
  carrying a confidential pattern must be **blocked + quarantined**, finding logged) protects the brief's §11 guardrail.
- **Hard / cost:** CAW-04 re-implements some boundary logic locally (intentional — independence over reuse). Pattern
  lists must be maintained and kept doctrinally aligned with CAW-02 **without** a shared dependency.
- **Hard:** fan-in of CAW-02 + CAW-03 needs dedup/precedence + provenance-preserving merge rules (open question).
- **Follow-on:** [ADR-0005](./ADR-0005-storage-and-versioning.md) defines where re-checked items land and freeze;
  [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate.md) owns the gate rules this re-check enforces; the
  `SiteAndApiSinkAdapter` is realized by [ADR-0006](./ADR-0006-web-stack.md) + [ADR-0007](./ADR-0007-api-design.md).

## Open questions / revisit triggers

- TODO(open-question: exact public-safe re-check rule set + where thresholds live in `profiles.recheck`; how aligned
  with CAW-02's boundary without becoming a shared substrate). Ratified jointly with [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate.md).
- TODO(open-question: dedup/precedence + provenance merge when both source adapters surface the same logical item).
- TODO(open-question: import is **pull** (CAW-04 polls `discover()`) vs **push** (upstream notifies) — current draft
  is pull-only; affects the source port).
- TODO(open-question: adapter discovery mechanism — built-in registry only vs entry-point/manifest — and adapter↔port
  SemVer/compat policy).
- TODO(open-question: when upstream re-validates or **retracts** a source item, how does CAW-04 learn and re-run the
  gate — does the provenance ref include a liveness/revocation check). Ties to unpublish in [ADR-0005](./ADR-0005-storage-and-versioning.md).
- **Revisit trigger:** if any new source/sink would force a core edit, the contract is leaking — reopen this ADR.

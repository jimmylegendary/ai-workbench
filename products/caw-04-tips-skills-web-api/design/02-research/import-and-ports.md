# Import & Ports (cross-boundary import + public-safe re-check + ports & adapters)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), `../01-decisions/ADR-0004-import-ports-and-public-safe-recheck.md` (TODO), `../01-decisions/ADR-0003-publish-gate.md` (TODO), `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **how CAW-04 imports validated content across independent-product boundaries** (CAW-02 knowledge, CAW-03 / a skills registry) and **publishes** it, while staying source- and sink-agnostic. It specifies: (1) the two ports — `ContentSourceAdapter` (driven, pulls candidates) and `PublishSinkAdapter` (driven, emits the public surface); (2) the **public-safe re-check** that re-validates every imported item at the boundary — *never trust the upstream boundary blindly*; (3) the config-driven registry + the **documented stub** pattern (internal wiki, external docs host, package registry). It does NOT decide the content model (`Tip/Skill/Workflow/Playbook/...`), the storage/versioning layout, or the publish-gate *policy* rules — those are separate ADRs that *consume* these ports (brief §9). It builds only v1 adapters + stubs (Non-goal §10).

## 1. Problem & forces
CAW-04 is the **public read/API publishing layer**. It authors nothing; it imports already-validated content from sibling products that **do not share its runtime** and republishes it to the world. The single most dangerous failure is leaking confidential know-how into a public output (brief §11). The seam design must make that failure structurally hard, and make a future source/sink "fill one adapter, not edit the core."

| Force | Implication for the design |
| --- | --- |
| No shared substrate with CAW-02/CAW-03 (Independence §1) | Every cross-product link is an **adapter over an explicit import boundary**, not a shared store/registry. References by id/URI; CAW-04 keeps its OWN copy of published content (§6). |
| Upstream may *claim* an item is public-safe — but its boundary is computed under a different policy | CAW-04 **re-checks** public-safety itself at import; upstream attestation is an input, not a verdict (§3). |
| Sources are heterogeneous (CAW-02 cited tips, CAW-03 skills, future wiki/bundle) | One `ContentSourceAdapter` contract; all are interchangeable behind `fetch() -> CandidateItem`. |
| Sinks vary now→later (website + REST now; docs host / package registry later) | One `PublishSinkAdapter` contract; the publish **gate stays in the core**, not in the adapter. |
| Builder writes the code, not us | We deliver typed contracts + registry/config design + a stub template; concrete code is the runbook's job. |
| Jimmy approves every publish (§11) | The human gate + the public-safe re-check run in the **core**, before any `publish()` call. An adapter can never self-bypass them. |

## 2. Pattern choice
Hexagonal (ports & adapters): the core depends only on **ports** (intent-level interfaces); concrete I/O lives in **adapters** the core is unaware of ([Cockburn](https://alistair.cockburn.us/hexagonal-architecture), [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))). Adding a source/sink should be "one new file in `adapters/` + one line in the registry" ([Hasan, two-codebase study](https://saadh393.github.io/blog/adapter-port-architecture-two-cases), [AWS hexagonal guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html)). Same backbone as CAW-03 (a separate product) — but CAW-04's core is a **publishing pipeline**, not a writing harness.

| Sub-pattern | Role here | Reference |
| --- | --- | --- |
| Ports & adapters | Core ↔ outside isolation; ports = capabilities, not tech ops | Cockburn |
| Plugin **registry** | logical id → adapter factory; resolved per run from config | [Hasan](https://saadh393.github.io/blog/adapter-port-architecture-two-cases) |
| **Capability descriptor** + preflight | adapter declares what it provides/accepts/requires; core validates wiring before any I/O | (our addition; §5) |
| **Re-check at trust boundary** | sanitize/validate data crossing into the trusted zone even if upstream sanitized it | [CERT IDS00](https://wiki.sei.cmu.edu/confluence/display/java/Input+Validation+and+Data+Sanitization), [trust-boundary guidance](https://securecodingpractices.com/defining-and-managing-trust-boundaries/) |

Both ports here are **driven** (the core calls out). The website + REST API as a *read surface* for the world is a **driving** edge served from CAW-04's own store; this doc covers the driven import/publish side.

## 3. The public-safe re-check (load-bearing; never trust upstream)
Crossing into CAW-04 is crossing a **trust boundary**: validated-upstream ≠ public-safe-here. CAW-04 re-validates every `CandidateItem` against its OWN public-safe policy before the item can become a `PublishableItem`. Upstream's `boundary` label is recorded as **provenance/evidence**, never accepted as the verdict ([CERT: sanitize untrusted data passed across a trust boundary](https://www.informit.com/articles/article.aspx?p=1751371&seqNum=3)). This mirrors output sanitization in publishing pipelines — sanitize before data leaves a trusted zone, and re-validate on entry ([Access Guardrails / DLP](https://hoop.dev/blog/how-to-keep-data-sanitization-and-data-loss-prevention-for-ai-secure-and-compliant-with-access-guardrails/)).

The re-check is a core stage (not in any adapter), run on every import regardless of source:

| Check | What it asserts | On fail |
| --- | --- | --- |
| **Provenance present** | item carries a resolvable validated-source ref (CAW-02/CAW-03 id/URI) + version | reject (brief §5: no source → no publish) |
| **Boundary = public** | item's *re-computed* safety boundary is `public`, not internal/confidential | quarantine for curator review |
| **Confidential-pattern scan** | no internal markers, secrets, hostnames, customer/Samsung/SAIT-internal identifiers, credentials | redact-or-reject; log finding |
| **Claim/source separation** | public-source research not conflated with internal claims (§11) | flag for curator |
| **Schema/format conformance** | maps onto CAW-04's content model; required reusable/audit metadata present | reject with actionable message |
| **Curator approval** | Jimmy approves the publish (proposal generation only, §11) | hold in preview/admin |

Outcome is a typed `RecheckVerdict { decision: publish|quarantine|reject, findings[], boundary, evidence_ref }`. **Even if** upstream marked the item public-safe, a failed re-check blocks it. The re-check is *deny-by-default*: anything it cannot positively confirm as public-safe does not publish.

## 4. The ports (the seams)
Two ports, matching brief §8. Each is a small typed interface (TypeScript-style `interface` shown; contract is language-agnostic — stack decided in a separate ADR). Every port consumes/returns CAW-04's own **provenance-carrying** value objects so the pipeline (`import → re-check → curator gate → version → publish`) is adapter-independent.

### 4.1 ContentSourceAdapter — where candidate content comes from
```ts
interface ContentSourceAdapter {
  capabilities: AdapterCapabilities;        // provides=[TIP, SKILL, WORKFLOW, PLAYBOOK], read_only, auth needs
  discover(query: SourceQuery): Promise<CandidateRef[]>;   // list importable items by id/URI (no payload)
  fetch(ref: CandidateRef): Promise<CandidateItem>;        // pull ONE provenance-tagged candidate
  health(): Promise<HealthStatus>;                          // reachable? auth ok? for preflight
}
// CandidateItem = payload (md/structured) + upstream_boundary_claim + source_ref(id/URI/version) + upstream_metadata
// v1 adapters:  Caw02KnowledgeSourceAdapter, Caw03SkillsRegistrySourceAdapter
// stub adapters: InternalWikiSourceAdapter, CuratedBundleSourceAdapter
```
Key generalization: CAW-02, CAW-03, and a future wiki are interchangeable behind `fetch() -> CandidateItem`. The **public-safe re-check (§3)** runs on the returned candidate and never knows the source. The adapter is **read-only** and references by id/URI/version — it does not duplicate the upstream store (brief §7); CAW-04 copies only what it actually publishes.

### 4.2 PublishSinkAdapter — where the public surface is emitted
```ts
interface PublishSinkAdapter {
  capabilities: AdapterCapabilities;        // accepts=[WEBSITE_BUILD, REST_INDEX, MD_DOC, PKG], requires_public_safe
  canAccept(item: PublishableItem): Promise<Acceptance>;   // type/format/boundary preflight
  publish(item: PublishableItem, ctx: PublishContext): Promise<PublishReceipt>;  // emit a versioned artifact
  unpublish(ref: PublishedRef, ctx: PublishContext): Promise<PublishReceipt>;    // redact/withdraw (brief §3 uc4)
}
// PublishableItem = re-checked, curator-approved, versioned item with boundary=public + provenance
// v1 adapter:   SiteAndApiSinkAdapter (static site build + REST read index; md and/or JSON — ADR)
// stub adapters: ExternalDocsHostSinkAdapter, PackageRegistrySinkAdapter, SyndicationSinkAdapter
```
`unpublish` is first-class because the brief requires redaction when a boundary changes (§3 uc4). Published versions are **immutable + addressable**; updates create a new `Version`, old versions stay reachable (brief §5). The **human gate + the §3 re-check live in the core before `publish()`** — a sink declaring `requires_public_safe=true` is verified by the core; an adapter cannot opt itself out.

## 5. Capability descriptors + preflight
Each adapter carries a machine-readable descriptor so the core can validate wiring **without doing I/O**:
```ts
type AdapterCapabilities = {
  port: "source" | "sink";
  id: string;
  version: string;
  provides?: ContentKind[];        // source: TIP/SKILL/WORKFLOW/PLAYBOOK
  accepts?: ArtifactKind[];        // sink: WEBSITE_BUILD/REST_INDEX/MD_DOC/PKG
  features?: string[];             // e.g. {"incremental","supports-unpublish","markdown","json"}
  requiresConfig?: string[];       // keys that MUST be set (preflight checks these)
  requiresPublicSafe: boolean;     // true; cannot be self-disabled by the adapter
  maturity: "v1" | "stub" | "experimental";
};
```
**Preflight** (before any run): the core resolves each `active` adapter id in the registry, reads its descriptor, and validates — e.g. the active sink `accepts` what the pipeline will produce, the source `provides` what the content model needs, required auth/config present, no `active` adapter is a `stub`. Failure is reported **here** with an actionable message, not mid-publish.

## 6. Registry + config selection
Adapters are **registered** (never hard-coded into the core) and **selected by config** — one block per port, no code change to switch ([config-driven adapter registry](https://saadh393.github.io/blog/adapter-port-architecture-two-cases)). Same pattern as CAW-03 (a separate product), kept independent.

```yaml
# caw04.config.yaml — the ONLY place wiring changes
ports:
  source:
    active: [caw02-knowledge, caw03-skills]      # fan-in: multiple sources import in
    caw02-knowledge: { endpoint: "...", auth: "env:CAW02_TOKEN" }
    caw03-skills:    { endpoint: "...", auth: "env:CAW03_TOKEN" }
    internal-wiki:   { enabled: false }          # stub present, off until connector lands
  sink:
    active: [site-and-api]
    site-and-api:    { out_dir: "...", formats: [markdown, json] }
    external-docs-host: { enabled: false }       # stub
    package-registry:   { enabled: false }       # stub
profiles:
  recheck: { ... }   # public-safe re-check thresholds / pattern lists (§3) — core, not adapter
```
Per-adapter **secrets via env refs only** (no shared substrate). Discovery mechanism (entry-point vs manifest) is `TODO(open-question)`. The registry **never** lets an adapter override the core's re-check, human gate, or boundary policy — adapters only supply candidates / emit approved artifacts.

## 7. The "documented stub" pattern (future sources/sinks)
A future adapter ships in v1 as a **documented stub**: the real interface, a not-implemented marker, a capability descriptor with `maturity="stub"`, and a config example. Wiring the real connector later = filling in the method bodies of *that one file*.
```ts
@registerAdapter({ port: "sink", id: "package-registry" })
class PackageRegistrySinkAdapter implements PublishSinkAdapter {
  /** STUB — publish skills as installable packages to a registry. Implement when approved.
   *  Contract: PublishSinkAdapter (§4.2). Must respect core public-safe gate; only accept boundary=public.
   *  Config: ports.sink.package-registry: { registry_url, auth: "env:PKG_TOKEN", namespace } */
  capabilities = { port: "sink", id: "package-registry", version: "0.0.0",
    accepts: ["PKG"], features: ["supports-unpublish"],
    requiresConfig: ["registry_url", "auth"], requiresPublicSafe: true, maturity: "stub" };
  canAccept() { return Acceptance.no("stub not wired"); }
  publish()  { throw new NotImplemented("package-registry sink not yet wired (brief §8 stub, §10 non-goal v1)"); }
  unpublish(){ throw new NotImplemented("stub"); }
}
```
Rules: a stub is **registered and discoverable** (appears in `registry.list()` and the preview/admin UI) but **config-disabled by default**; preflight refuses to run a stub that is `active`, pointing at the file to implement. Brief-§8 stubs required: source — `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`; sink — `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`.

## 8. Why this generalizes (the seam test)
A change is "open by design" if a new integration touches **only one adapter file + one config block**:

| New integration | What gets added | What is NOT touched |
| --- | --- | --- |
| Internal wiki as a source | implement `InternalWikiSourceAdapter`, enable config | core, re-check (§3), publish gate, other adapters |
| Curated bundle import | implement `CuratedBundleSourceAdapter` | content model / re-check (consume `CandidateItem`) |
| Publish to external docs host | implement `ExternalDocsHostSinkAdapter`, flip `active` | human gate + public-safe re-check (stay in core) |
| Publish skills as packages | implement `PackageRegistrySinkAdapter` | versioning/immutability rules (core) |
| Syndicate to a feed | implement `SyndicationSinkAdapter` | provenance/boundary on `PublishableItem` |

If any of these would force a core edit, the contract is leaking and must be revisited (revisit trigger).

## 9. Tradeoffs

| Decision | Pros | Cons / cost | Stance |
| --- | --- | --- | --- |
| Hexagonal core + 2 ports | swap source/sink freely; testable with fakes | upfront contract design; indirection | adopt (brief §8 mandates) |
| **Public-safe re-check on every import** (deny-by-default) | structural leak prevention; upstream policy drift can't slip through | duplicate validation cost; pattern lists must be maintained | adopt — non-negotiable (brief §11) |
| Treat upstream `boundary` as evidence, not verdict | independence-safe; one policy owner (CAW-04) | re-implements some upstream logic | adopt |
| Capability descriptors + preflight | fail fast, self-describing, safe wiring | descriptors must be kept honest | adopt |
| Documented stubs in v1 | seams provably exist; "fill one file" path | dead code until wired | adopt (brief §8) |
| Multiple active source adapters (fan-in) | combine CAW-02 + CAW-03 in one import | merge/precedence + dedup rules needed | adopt; precedence is an open question |

## Open Questions
Track in `../08-research-plan/open-questions.md`:
- TODO(open-question: exact **public-safe re-check rule set** — what confidential-pattern lists / classifiers does CAW-04 run, and is any of it shared design with the CAW-02 boundary or fully independent? Where do the thresholds live in `profiles.recheck`?)
- TODO(open-question: when both source adapters surface the **same logical item**, what is the dedup/precedence rule, and how is provenance preserved across the merge?)
- TODO(open-question: is import **pull** (CAW-04 polls upstream `discover()`) or **push** (upstream notifies)? Affects the source port — current draft is pull-only.)
- TODO(open-question: adapter **discovery mechanism** — built-in registry only, or entry-point/manifest plugin discovery — and adapter↔port SemVer/compat policy?)
- TODO(open-question: `unpublish` semantics for **immutable addressable versions** — tombstone vs hard-removal, and how the REST API answers a request for a withdrawn version.)
- TODO(open-question: when upstream **re-validates or retracts** a source item, how does CAW-04 learn and re-run the gate — provenance ref includes a liveness check?)

## Implications for runbooks
- **RB (core/ports):** define `ContentSourceAdapter` + `PublishSinkAdapter` interfaces and value objects (`CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`, descriptors). Leave the tree green with fakes only — no concrete I/O yet.
- **RB (public-safe re-check):** implement the §3 core stage (deny-by-default), `RecheckVerdict`, finding log, and the curator preview/admin hold. Acceptance: an item marked public-safe upstream but containing a confidential pattern is **blocked** and quarantined, with the finding logged.
- **RB (registry/config):** implement the registry (register + select-by-config), the `caw04.config.yaml` loader, env-ref secrets, and **preflight** capability validation. Acceptance: preflight rejects a stub/incapable/misconfigured wiring with an actionable message.
- **RB (v1 adapters):** `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`, `SiteAndApiSinkAdapter`.
- **RB (stubs):** ship every brief-§8 stub via the §7 template — registered, `maturity="stub"`, config-disabled. Acceptance: each appears in `registry.list()` and is refused by preflight when forced active.
- Cross-product links (CAW-02, CAW-03) are **import boundary adapters**, not shared stores (Independence §1) — runbooks must keep them behind the `ContentSourceAdapter` contract only, by id/URI/version.

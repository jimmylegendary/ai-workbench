# Ports & Adapters Architecture (open integration seams)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), `../01-decisions/ADR-0005-ports-and-adapters.md` (TODO), `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the load-bearing architecture research for CAW-03. It decides **how the harness stays engine/source/sink-agnostic**: the set of ports, their typed contracts, the registry + config that selects an adapter at runtime, and the "documented stub" pattern that lets a future connector (internal wiki, internal experiment-server, venue submission, patent filing) be wired by **filling in one adapter, not editing the core**. It does NOT decide the evidence-gate rules, the claim-ledger schema, patent-vs-paper drafting logic, or storage layout — those are separate ADRs that *consume* these ports. It does NOT build any future connector (Non-goal §9): v1 ships the v1 adapters + stubs only.

## 1. Problem & forces
CAW-03 wraps an existing writing engine (PaperOrchestra) and must accept inputs from, and emit outputs to, systems that **do not exist yet** at v1. The brief (§5) makes "open integration interfaces" a *required design property*. The failure mode to avoid: a future integration (e.g. an internal wiki source) forcing changes to the harness core, the lifecycle state machine, or other adapters.

| Force | Implication for the design |
| --- | --- |
| Engine is swappable but PaperOrchestra is the default | WritingEngine must be a port; the core never imports PaperOrchestra directly |
| Sources are heterogeneous (CAW-02 bundles, CAW-01 results, future wiki/exp-server, scattered logs) | One `SourceAdapter` contract; CAW-01/02/wiki are *all* just adapters behind it |
| Outputs go to files now, to wiki/venues/patent-filing later | One `Sink/PublishAdapter` contract; human-gate stays in the core, not the adapter (Non-goal §9) |
| No shared runtime substrate with sibling products (Independence §1) | Every cross-product link is an adapter over an explicit import/export boundary, not a shared store |
| Builder, not us, writes code | We deliver typed contracts + registry/config design + a stub template; concrete code is the runbook's job |

## 2. Pattern choice
Hexagonal (ports & adapters) is the right backbone: the application core depends only on **ports** (interfaces expressing intent), and concrete I/O lives in **adapters** that implement them — the core is unaware of which adapter is wired ([Cockburn](https://alistair.cockburn.us/hexagonal-architecture), [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))). Adding an adapter should be "one new file in `adapters/` plus one line in the registry" ([Hasan, two-codebase study](https://saadh393.github.io/blog/adapter-port-architecture-two-cases)). We combine three sub-patterns:

| Sub-pattern | Role here | Reference |
| --- | --- | --- |
| Ports & adapters (hexagonal) | Core ↔ outside isolation; ports = capabilities, not tech ops | Cockburn |
| Plugin **registry** | Maps a logical id → adapter factory; resolves per-run | plugin/registry examples above |
| Entry-point **discovery** + **config selection** | Adapters self-register; config picks which is active | [PyPA entry points](https://packaging.python.org/specifications/entry-points/) |
| **Capability descriptor** | Each adapter declares what it can do/needs, so the core can validate the wiring before running | (our addition; see §5) |

Direction matters: **driven ports** (the harness calls out) cover Source, WritingEngine, PatentEngine, Sink, Novelty. The harness's own surfaces (API/MCP/CLI/UI, a separate ADR §8) are **driving** adapters that call *into* the core. This doc covers the driven side.

## 3. The ports (the seams)
Five ports, matching the brief's §5 table. Each is a small typed interface (Python `Protocol`-style here, since the default engine is a Python skill suite; the contract is language-agnostic). Every port returns/consumes the harness's own **provenance-carrying** value objects so the lifecycle (`claim → gate → draft → review → output`) stays adapter-independent.

### 3.1 SourceAdapter — where claims/evidence/results come from
```python
class SourceAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: provides=[CLAIM, EVIDENCE, RESULT, FIGURE], read_only, auth needs
    def discover(self, query: SourceQuery) -> list[BundleRef]: ...        # list available bundles (by id/URI)
    def fetch(self, ref: BundleRef) -> EvidenceBundle: ...                # pull a typed, provenance-tagged bundle
    def health(self) -> HealthStatus: ...                                 # reachable? auth ok? for preflight
# EvidenceBundle = claims[] (typed P1/P2/P3) + evidence refs + result-registry refs + figure/table manifest refs
# v1 adapters: Caw02BundleSourceAdapter, Caw01ResultSourceAdapter
# stub adapters: InternalWikiSourceAdapter, ExperimentServerSourceAdapter, ScatteredLogsSourceAdapter, UserBundleSourceAdapter
```
Key generalization: CAW-01/02 and a future wiki are interchangeable behind `fetch() -> EvidenceBundle`. The **evidence gate** (separate ADR) runs on the returned bundle and never knows the source. References are by id/URI/path (brief §7); the adapter does not duplicate the upstream store.

### 3.2 WritingEngineAdapter — drafting (wraps PaperOrchestra)
```python
class WritingEngineAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: stages supported, multimodal?, citation-verify?, output formats
    def assemble_inputs(self, gated: GatedClaimSet, template: TemplateSpec) -> EngineInputs: ...
        # builds idea.md, experimental_log.md, template.tex, conference_guidelines.md, figures from the bundle
    def draft(self, inputs: EngineInputs, opts: DraftOptions) -> DraftArtifact: ...   # run the pipeline
    def score(self, draft: DraftArtifact) -> ScoreReport | None: ...                  # optional autoraters
# v1 adapter: PaperOrchestraEngineAdapter (delegates to outline→plotting→lit-review→section-writing→refinement + autoraters)
# stub adapters: other LLM writing engines
```
`assemble_inputs` is the brief's "adapter that builds engine inputs" (§4) — it generalizes PaperOrchestra's `agent-research-aggregator` ("scattered logs → inputs") into "gated workbench bundle → inputs". The core hands the engine a `GatedClaimSet` (already past the evidence gate); the engine never sees ungated claims, so engine swap cannot weaken governance.

### 3.3 PatentEngineAdapter — patent drafting (separate path)
```python
class PatentEngineAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: claim-drafting, prior-art search, patentability scoring
    def draft_claims(self, gated: GatedClaimSet, prior_art: PriorArtSet) -> PatentDraft: ...
    def patentability(self, draft: PatentDraft) -> PatentabilityReport: ...
# v1 adapter: BaselinePatentDrafterAdapter (in-house baseline drafter)
# stub adapters: ExternalPatentToolingAdapter
```
Distinct from WritingEngine on purpose (brief §6): patents have their own gates and **patent-first** handling. Shares the same `GatedClaimSet` front, so claim/evidence selection and novelty are reused.

### 3.4 Sink/PublishAdapter — where outputs go
```python
class SinkAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: accepts=[PAPER_PDF, PATENT_DRAFT, REPORT], requires_human_gate
    def can_accept(self, artifact: OutputArtifact) -> Acceptance: ...     # type/format/confidentiality preflight
    def publish(self, artifact: OutputArtifact, ctx: PublishContext) -> PublishReceipt: ...
# v1 adapter: LocalFileSinkAdapter (LaTeX + compiled PDF, patent draft docs, score reports)
# stub adapters: InternalWikiSinkAdapter, VenueSubmissionSinkAdapter, PatentFilingSinkAdapter
```
The **human gate** and the **confidentiality filter** live in the core *before* `publish()` is called — submission/filing autonomy is a Non-goal (§9). A sink declaring `requires_human_gate=True` is verified by the core; an adapter cannot opt itself out of the gate.

### 3.5 Novelty/RadarAdapter — related-work + threat signals
```python
class NoveltyAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: related-work search, threat/radar signals, prior-art live?
    def assess(self, claims: ClaimSet) -> NoveltyReport: ...   # novel vs threatened, patent-first flags
# v1 adapters: RelatedWorkTrackerAdapter, Caw05RadarImportAdapter
# stub adapters: LivePriorArtSearchAdapter (e.g. patent/prior-art search services)
```

## 4. Registry + config selection
Adapters are **registered** (never hard-coded into the core) and **selected by config**. Two-layer discovery, both feeding one registry:

1. **Built-in registration** — v1 adapters register at import via a decorator (`@register(port="source", id="caw02-bundle")`).
2. **Entry-point discovery** — external/3rd-party adapters advertise themselves via package metadata (PyPA entry-point groups, e.g. `caw03.source_adapters`), discovered with `importlib.metadata` ([PyPA spec](https://packaging.python.org/specifications/entry-points/)). This is how a future connector ships as its *own* package without touching CAW-03's tree.

```python
class AdapterRegistry:
    def register(self, port: PortName, id: str, factory: Callable[[AdapterConfig], Adapter]) -> None: ...
    def get(self, port: PortName, id: str, cfg: AdapterConfig) -> Adapter: ...
    def list(self, port: PortName) -> list[AdapterDescriptor]: ...   # ids + capability descriptors, for preflight/UI
```

Selection is config-driven — one block per port, no code change to switch:
```toml
# caw03.config.toml  — the ONLY place wiring changes
[adapters.source]   active = ["caw02-bundle", "caw01-result"]   # multiple sources fan in
[adapters.engine]   active = "paper-orchestra"                   # swap default engine here
[adapters.patent]   active = "baseline-drafter"
[adapters.sink]     active = ["local-file"]
[adapters.novelty]  active = ["related-work", "caw05-radar"]

[adapters.source.caw02-bundle]   endpoint = "..."   auth = "env:CAW02_TOKEN"
[adapters.sink.internal-wiki]    enabled  = false    # stub present, off until the connector lands
```
**Preflight** (before any run): the core resolves each `active` id in the registry, reads its **capability descriptor**, and validates the wiring — e.g. the chosen sink `accepts` the artifact type the run will produce, the source `provides` what the engine needs, required auth/config is present. A missing/disabled/incapable adapter fails *here* with a clear message, not mid-pipeline.

## 5. Capability descriptors
Each adapter carries a machine-readable descriptor so the core can reason about wiring **without instantiating I/O**:
```python
@dataclass(frozen=True)
class AdapterCapabilities:
    port: PortName
    id: str
    version: str
    provides: list[DataKind] = []      # SourceAdapter: CLAIM/EVIDENCE/RESULT/FIGURE
    accepts: list[ArtifactKind] = []   # SinkAdapter: PAPER_PDF/PATENT_DRAFT/REPORT
    features: set[str] = {}            # e.g. {"citation-verify","multimodal","prior-art-live"}
    requires_config: list[str] = []    # keys that MUST be set (preflight checks these)
    requires_human_gate: bool = True   # cannot be self-disabled by the adapter
    maturity: Literal["v1","stub","experimental"] = "stub"
```
Descriptors make the system **self-describing**: the review/status UI lists available adapters; preflight does capability negotiation; a `stub` maturity surfaces clearly so no run silently depends on an unimplemented connector.

## 6. The "documented stub" pattern (future adapters)
A future adapter ships in v1 as a **documented stub**: the real interface, a not-implemented marker, a capability descriptor with `maturity="stub"`, and a config example. Wiring the real connector later = filling in the method bodies of *that one file*.

```python
@register(port="source", id="internal-wiki")
class InternalWikiSourceAdapter(SourceAdapter):
    """STUB — internal company wiki source. Implement when the wiki connector is approved.
    Contract: SourceAdapter (§3.1). Must return provenance-tagged EvidenceBundle; respect confidentiality
    (internal-review-required by default). See PRODUCT-BRIEF §5/§10.
    Config example:
        [adapters.source.internal-wiki]
        base_url = "https://wiki.internal/..."   auth = "env:WIKI_TOKEN"   space = "RESEARCH"
    """
    capabilities = AdapterCapabilities(
        port="source", id="internal-wiki", version="0.0.0",
        provides=[CLAIM, EVIDENCE], features={"internal-confidential"},
        requires_config=["base_url", "auth"], maturity="stub")

    def discover(self, query): raise NotImplementedError("internal-wiki source not yet wired (PRODUCT-BRIEF §9 non-goal in v1)")
    def fetch(self, ref):      raise NotImplementedError(...)
    def health(self):          return HealthStatus.not_implemented("stub")
```
Rules: a stub is **registered and discoverable** (so it appears in `registry.list()` and the UI) but **config-disabled by default**; preflight refuses to run a stub that is `active`, with a message pointing at the file to implement. Documented stubs required by the brief §5: `InternalWikiSourceAdapter`, `ExperimentServerSourceAdapter`, `InternalWikiSinkAdapter`, `VenueSubmissionSinkAdapter`, `PatentFilingSinkAdapter`, `LivePriorArtSearchAdapter`, plus generic `UserBundleSourceAdapter`/`ScatteredLogsSourceAdapter`.

## 7. Why this generalizes (the seam test)
A change is "open by design" if a new integration touches **only one adapter file + one config block**. Worked examples:

| New integration | What gets added | What is NOT touched |
| --- | --- | --- |
| Internal wiki as a source | implement `InternalWikiSourceAdapter`, enable config | core, lifecycle, evidence gate, other adapters |
| Internal experiment-server | implement `ExperimentServerSourceAdapter` | the figure/table manifest logic (consumes `EvidenceBundle`) |
| Submit to a venue | implement `VenueSubmissionSinkAdapter` | human-gate + confidentiality filter (stay in core) |
| Swap PaperOrchestra for engine X | new `WritingEngineAdapter`, flip `active` | evidence gate (operates on `GatedClaimSet`) |
| Live prior-art search | implement `LivePriorArtSearchAdapter` | novelty governance / patent-first logic |

If any of these would force a core edit, the contract is leaking and must be revisited (revisit trigger).

## 8. Tradeoffs

| Decision | Pros | Cons / cost | Stance |
| --- | --- | --- | --- |
| Hexagonal core + 5 ports | swap engine/source/sink freely; testable with fakes | upfront contract design; indirection | adopt (brief §5 mandates) |
| Entry-point discovery + built-in registry | 3rd-party adapters as own packages; no core edits | metadata complexity; version skew | adopt; keep built-in path as default |
| Capability descriptors + preflight | fail fast, self-describing, safe wiring | descriptors must be kept honest | adopt |
| Documented stubs in v1 | seams provably exist; clear "fill one file" path | dead code until wired | adopt (brief §5 requires) |
| Multiple active source adapters (fan-in) | combine CAW-01 + CAW-02 in one run | merge/provenance precedence rules needed | adopt; precedence is an open question |

## Open Questions
Track in `../08-research-plan/open-questions.md`:
- TODO(open-question: when multiple `SourceAdapter`s are active, what is the **merge/precedence** rule for overlapping claims/evidence, and how is provenance preserved on merge?)
- TODO(open-question: are async/long-running engine runs (PaperOrchestra is multi-stage) modeled as sync `draft()` or a job-handle/poll contract? Affects the WritingEngine port signature.)
- TODO(open-question: exact entry-point group names + adapter SemVer/compat policy — how does the core reject an adapter built against an old port version?)
- TODO(open-question: does the confidentiality filter need a capability hook on `SourceAdapter` (e.g. `provides_confidential`) so the core can route internal-review-required bundles, or is it purely a core concern?)
- TODO(open-question: where do adapter **secrets/auth** live given "no shared runtime substrate" — per-adapter config + env refs only?)
- TODO(open-question: is the Novelty port one port or split into related-work vs threat/radar sub-ports?)

## Implications for runbooks
- **RB (core/ports):** define the five `Protocol` interfaces + value objects (`EvidenceBundle`, `GatedClaimSet`, `OutputArtifact`, `AdapterCapabilities`, descriptors). Leave the tree green with fakes only — no concrete I/O yet.
- **RB (registry/config):** implement `AdapterRegistry` (decorator + entry-point discovery), the `caw03.config.toml` loader, and **preflight** capability validation. Acceptance: preflight rejects a stub/incapable/misconfigured wiring with an actionable message.
- **RB (v1 adapters):** `Caw02BundleSourceAdapter`, `Caw01ResultSourceAdapter`, `PaperOrchestraEngineAdapter`, `BaselinePatentDrafterAdapter`, `LocalFileSinkAdapter`, `RelatedWorkTrackerAdapter` + `Caw05RadarImportAdapter`.
- **RB (stubs):** ship every brief-§5 stub via the §6 template — registered, `maturity="stub"`, config-disabled. Acceptance: each appears in `registry.list()` and is refused by preflight when forced active.
- Cross-product links (CAW-01/02/05) are **import/export boundary adapters**, not shared stores (Independence §1) — runbooks must keep them behind the `SourceAdapter`/`NoveltyAdapter` contracts only.

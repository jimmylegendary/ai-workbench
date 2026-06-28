# ADR-0005: Ports & adapters — the open integration architecture (load-bearing)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth; §5 open integration interfaces — REQUIRED design property)
  - [../02-research/ports-and-adapters-architecture.md](../02-research/ports-and-adapters-architecture.md) (the load-bearing research)
  - [ADR-0001-product-surface.md](ADR-0001-product-surface.md) (driving side: API/MCP/CLI/UI)
  - [ADR-0002-writing-engine-integration.md](ADR-0002-writing-engine-integration.md) (WritingEngine port)
  - [ADR-0003-evidence-gate-and-claim-ledger.md](ADR-0003-evidence-gate-and-claim-ledger.md) (gate reads only the SourceAdapter shape)
  - [../02-research/patent-drafting.md](../02-research/patent-drafting.md) (PatentEngine port)
  - [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue.md) (Novelty/Radar port)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle.md) (human gate + confidentiality stay in the core)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is **the load-bearing decision** for CAW-03. It fixes how the harness stays engine/source/sink-agnostic: the
set of **driven ports** (Source / WritingEngine / PatentEngine / Sink / Novelty), their typed contracts, the
**config-driven registry** that selects an adapter per run, the **capability descriptor + preflight** that validate
wiring before a run, and the **documented-stub pattern** that lets a future connector (internal wiki, experiment-
server, venue submission, patent filing, live prior-art) be wired by **filling in one adapter file, not editing the
core**. It does NOT decide the evidence-gate rules (ADR-0003), the engine wrap (ADR-0002), patent-vs-paper logic,
the surfaces (ADR-0001, the *driving* side), or storage — those ADRs *consume* these ports. v1 ships the v1 adapters
+ stubs only; it builds **no** future connector (brief §9).

## Context
- The brief (§5) makes "open integration interfaces" a **REQUIRED design property**: define the ports now, implement
  only the v1 adapters, ship futures as documented stubs. CAW-03 must wrap PaperOrchestra and accept inputs from /
  emit outputs to systems that **do not exist yet** (internal wiki, experiment-server, venue/filing systems).
- The failure mode to avoid: a future integration forcing changes to the harness core, the lifecycle state machine,
  the evidence gate, or other adapters.
- Independence (§1): **no shared runtime substrate.** Every cross-product link (CAW-01/02/05) is an adapter over an
  explicit import/export boundary, referencing by id/URI — never a shared store.
- The builder writes the code (brief §0): we deliver typed contracts + registry/config design + a stub template;
  concrete bodies are the runbook's job.
- Direction matters (research §2): **driven ports** (the harness calls out) = Source/WritingEngine/PatentEngine/
  Sink/Novelty — this ADR. The harness's own surfaces are **driving** adapters into the core — ADR-0001.

## Options considered

### A. Architectural backbone
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Hexagonal (ports & adapters): core depends only on ports; I/O lives in adapters** | Swap engine/source/sink freely; testable with fakes; brief §5 mandates it | Upfront contract design; indirection | **Chosen** |
| Direct integration (core imports PaperOrchestra/CAW-02 directly) | Less code now | Every future connector forces core edits; violates brief §5/§1 | Rejected |
| Per-integration bespoke modules | Ships each fast | No shared contract; gate/lifecycle re-implemented per integration | Rejected |

### B. Adapter selection
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Registry + config selection** (decorator built-in registration **and** entry-point discovery; one config block per port) | 3rd-party adapters ship as own packages; switch wiring with no code change | Registry + metadata + version-skew handling | **Chosen** |
| Hard-coded factory switch in the core | Trivial | Every new adapter edits the core; defeats the seam | Rejected |
| Pure entry-point discovery only | Maximal decoupling | Harder to guarantee v1 defaults are present | Built-in path kept as the default; discovery added on top |

### C. Wiring safety
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Capability descriptor + preflight** (each adapter declares provides/accepts/features/requires_config/maturity; core validates before any run) | Fail fast with an actionable message; self-describing; safe wiring; stubs surface clearly | Descriptors must be kept honest | **Chosen** |
| No preflight; fail mid-pipeline | Less ceremony | A misconfigured/stub/incapable adapter fails deep in a multi-stage engine run | Rejected |

### D. Future connectors in v1
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Documented stub** (real interface + not-implemented marker + `maturity="stub"` descriptor + config example; registered but config-disabled) | Proves the seam exists; "fill one file" path; appears in registry/UI | Dead code until wired | **Chosen** (brief §5 requires) |
| Nothing until needed | No dead code | The seam is unproven; a real connector may force a redesign later | Rejected |
| Build the connectors now | Done sooner | Brief §9 non-goal; cost; confidentiality/legal review unfinished | Rejected |

## Decision
**Hexagonal core with five driven ports, a config-driven registry with capability-descriptor preflight, and
documented stubs for every future connector. The harness core depends only on ports; an adapter cannot weaken
governance.**

1. **Five driven ports** (matching brief §5), each a small typed interface consuming/returning the harness's own
   **provenance-carrying** value objects so the lifecycle (`claim → gate → draft → review → output`) stays
   adapter-independent (research §3):
   - **SourceAdapter** — `discover()/fetch()->EvidenceBundle/health()`. CAW-01/02 *and* a future wiki are
     interchangeable behind `fetch()`. The **evidence gate (ADR-0003) runs on the returned bundle and never knows
     the source**; refs are by id/URI/path (no upstream duplication). v1: `Caw02BundleSourceAdapter`,
     `Caw01ResultSourceAdapter`. Stubs: `InternalWikiSourceAdapter`, `ExperimentServerSourceAdapter`,
     `ScatteredLogsSourceAdapter`, `UserBundleSourceAdapter`.
   - **WritingEngineAdapter** — `assemble_inputs()/draft()/score()` (ADR-0002). The core hands it a **GatedClaimSet**
     (already past the gate), so an engine swap cannot weaken governance. v1: `PaperOrchestraEngineAdapter`. Stub:
     `NullWritingEngineAdapter`.
   - **PatentEngineAdapter** — `draft_claims()/patentability()` over the *same* `GatedClaimSet` front but a distinct
     path with patent-first handling (patent doc). v1: `BaselinePatentDrafterAdapter` (`needs_human=True` fixed).
     Stub: `ExternalPatentToolingAdapter`.
   - **Sink/PublishAdapter** — `can_accept()/publish()`. The **human gate and confidentiality filter live in the
     core *before* `publish()`** (brief §9 — no autonomous submission/filing). A sink declaring
     `requires_human_gate=True` is verified by the core; **an adapter cannot opt itself out of the gate**. v1:
     `LocalFileSinkAdapter`. Stubs: `InternalWikiSinkAdapter`, `VenueSubmissionSinkAdapter`,
     `PatentFilingSinkAdapter`.
   - **Novelty/RadarAdapter** — `assess()->NoveltyReport` (novel/threatened/anticipated/superseded/patent-sensitive
     + patent-first flags). v1: `RelatedWorkTrackerAdapter`, `Caw05RadarImportAdapter`, plus engine-pool reuse +
     PatentsView. Stub: `LivePriorArtSearchAdapter`.
2. **Registry + config selection.** Two-layer discovery into one `AdapterRegistry`: (a) **built-in registration** via
   a decorator (`@register(port="source", id="caw02-bundle")`); (b) **entry-point discovery** for external packages
   (`importlib.metadata` over groups like `caw03.source_adapters`) so a future connector ships as its own package
   without touching CAW-03's tree. Selection is **config-driven** — one block per port in `caw03.config.toml`, the
   **only** place wiring changes (e.g. `[adapters.engine] active = "paper-orchestra"`; multiple sources may fan in).
   The core never hard-codes an adapter.
3. **Capability descriptor + preflight.** Each adapter carries a frozen `AdapterCapabilities` (`port, id, version,
   provides, accepts, features, requires_config, requires_human_gate, maturity`). **Before any run**, preflight
   resolves each `active` id, reads its descriptor, and validates the wiring (chosen sink `accepts` the artifact
   type the run produces; source `provides` what the engine needs; required auth/config present). A
   missing/disabled/incapable/stub-but-active adapter **fails here with a clear message**, not mid-pipeline. The
   review/status UI (ADR-0001) lists adapters from `registry.list()` so wiring is visible and `maturity="stub"`
   surfaces clearly.
4. **Documented-stub pattern.** A future adapter ships as: the real interface, a `NotImplementedError` marker with a
   message pointing at the file to implement, a descriptor with `maturity="stub"`, and a config example. It is
   **registered and discoverable** but **config-disabled by default**; preflight refuses to run a stub that is forced
   `active`. Wiring the real connector later = filling in the method bodies of *that one file* + flipping one config
   line. Required stubs (brief §5): `InternalWikiSourceAdapter`, `ExperimentServerSourceAdapter`,
   `InternalWikiSinkAdapter`, `VenueSubmissionSinkAdapter`, `PatentFilingSinkAdapter`, `LivePriorArtSearchAdapter`,
   plus `UserBundleSourceAdapter`/`ScatteredLogsSourceAdapter` and `NullWritingEngineAdapter`/
   `ExternalPatentToolingAdapter`.
5. **The seam test (the open-by-design invariant).** A new integration must touch **only one adapter file + one
   config block**. If it would force a core edit, the contract is leaking and must be revisited (a hard revisit
   trigger). Worked examples (research §7): internal wiki source, experiment-server source, venue submission, engine
   swap, live prior-art — none touch the core, lifecycle, evidence gate, confidentiality filter, or other adapters.
6. **Governance stays in the core, never an adapter.** The evidence gate, confidentiality egress `decide()` +
   redaction re-sweep, novelty/patent-first interlock, and the human publish/file gate are core logic between the
   ports. Adapters move data; they never make a governance decision. This is the structural guarantee that "swap any
   adapter" can never become "bypass governance".

## Consequences
- **Easy:** swap the engine, add a source/sink, or wire a future connector as one file + one config block; test the
  core with fakes; the UI is self-describing from descriptors; preflight catches misconfiguration before an
  expensive engine run.
- **Easy:** independence holds by construction — every cross-product link is a SourceAdapter/NoveltyAdapter over an
  import/export boundary, never a shared store (brief §1).
- **Hard / cost:** upfront contract + value-object design; descriptors must be kept honest; entry-point discovery
  adds metadata + version-skew handling; documented stubs are dead code until wired; multiple active sources need a
  merge/precedence rule (open question).
- **Follow-on runbooks** (research §Implications): (1) core/ports — five `Protocol` interfaces + value objects
  (`EvidenceBundle`, `GatedClaimSet`, `OutputArtifact`, `AdapterCapabilities`), green with fakes only; (2) registry/
  config — `AdapterRegistry` (decorator + entry-point discovery), `caw03.config.toml` loader, preflight; (3) v1
  adapters; (4) stubs via the §6 template (registered, `maturity="stub"`, config-disabled; appear in
  `registry.list()`, refused by preflight when forced active).

## Open questions / revisit triggers
- TODO(open-question: when multiple SourceAdapters are active, what is the **merge/precedence** rule for overlapping
  claims/evidence, and how is provenance preserved on merge?) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: are long-running engine runs modeled as sync `draft()` or a job-handle/poll contract? affects
  the WritingEngine port signature; cross-ref ADR-0001/0002.)
- TODO(open-question: exact entry-point group names + adapter SemVer/compat policy — how does the core reject an
  adapter built against an old port version?)
- TODO(open-question: does the confidentiality filter need a capability hook on SourceAdapter (e.g.
  `provides_confidential`) so the core routes internal-review-required bundles, or is it purely a core concern?)
- TODO(open-question: where do adapter secrets/auth live given "no shared runtime substrate" — per-adapter config +
  env refs only?)
- TODO(open-question: is the Novelty port one port or split into related-work vs threat/radar sub-ports?)
- **Revisit trigger (hard):** any proposed integration that would force a core/lifecycle/gate edit means the contract
  is leaking — fix the contract, do not special-case the integration.

Sources (grounding): [Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture), [Wikipedia — Hexagonal architecture](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)), [PyPA — Entry points](https://packaging.python.org/specifications/entry-points/).

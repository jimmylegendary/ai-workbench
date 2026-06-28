# Component Boundaries — module ownership, core services & ports

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./system-architecture.md](./system-architecture.md) (container map + one-way dependency rule)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (op-set, surfaces, governance-in-core)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (status/uncertainty model)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (verdict + reproducibility gate)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (`wbtraffic.v0`)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (SourceAdapter)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (ExportAdapter)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes **module ownership** inside CAW-06: which package owns which entity, the **seven core services** at
signature level (Ingest, Hypothesis, Experiment, Writeback, Implication, Export, Schedule), and the **three port
Protocols** (Source / ExperimentRunner / Export). It fixes the load-bearing rule that **status/uncertainty +
reproducibility gates live in core**, never in a surface or adapter. It does NOT redefine entity schemas (owning
ADRs) or container wiring ([system-architecture.md](./system-architecture.md)). Signatures below are **build
guidance** — the builder writes the real code (DOC-CONVENTIONS §6).

## Module ownership

One package owns each entity end-to-end; no entity is co-owned. Surfaces and adapters own no entity.

| Module / package | Owns (entities) | May read | Must NOT touch |
|---|---|---|---|
| `core/ingest` | `Source`, `CandidateClaim`, `FetchCursor` | — | `Hypothesis` status, ledger |
| `core/hypothesis` | `Hypothesis`, `Evidence`, `status`, `confidence` | `CandidateClaim`, ledger results | source raw text writes |
| `core/experiment` | `LedgerEntry (EXP-XXXX)`, `Verdict`, `DecisionRule` | `Hypothesis` | promotion of status (proposes only) |
| `core/writeback` | `WbTrafficSchema (wbtraffic.v0)` | `Hypothesis`, ledger | CAW-01 IR object names (re-verify at boundary) |
| `core/implication` | `ImplicationMap`, `Implication` | finding (hypothesis+evidence) | export transport |
| `core/export` | `ExportBundle`, `ExportReceipt` | all above | another product's store |
| `core/schedule` | `Run`, `RunReceipt`, lock/cursor/heartbeat | all stages | domain truth (orchestrates only) |
| `core/store` | persistence of all entities (markdown/JSON) | — | network/transport |
| `surfaces/{cli,mcp,pipeline}` | nothing | op-set | any entity directly |
| `adapters/{source,runner,export}` | nothing | their port DTOs | core internals |

**Governance is core-only.** The status floor (`hypothesis`), the `confidence ≤ evidence_strength` cap, the
`generated`-evidence-cannot-promote rule, provenance stamping, the reproducibility gate, the failures-first
discipline, and the per-target export gates live in `core/*` services — **never** in a surface or adapter
(ADR-0001 "Governance lives in the core"). A surface calls a vetted op; only the core mutates truth.

## Core services (signature level)

Signatures are illustrative Python-style Protocols. Status/uncertainty are **never optional** parameters — they are
intrinsic to the entity and stamped by core.

### Ingest (S1–S4)
```python
class IngestService:
    def discover(self, family: str, cursor: FetchCursor) -> list[Source]: ...      # via SourceAdapter
    def import_caw05(self, bundle_ref: BundleRef) -> list[Source]: ...             # read-only, evidence:false
    def canonicalize(self, sources: list[Source]) -> list[Source]: ...            # DOI ▸ arXiv ▸ norm(title)
    def extract_claims(self, source: Source) -> list[CandidateClaim]: ...         # extractive; status=unverified
    # invariant: never emits status='supported'; never a claim without evidence_span + source_locator
```

### Hypothesis (S5)
```python
class HypothesisService:
    def form(self, claims: list[CandidateClaim]) -> Hypothesis: ...               # status floor = 'hypothesis'
    def attach_evidence(self, h: Hypothesis, ev: Evidence) -> Hypothesis: ...
    def reassess(self, h: Hypothesis) -> Hypothesis: ...                          # 4-state reversible lifecycle
    # invariants (HARD): confidence <= evidence_strength; generated Evidence(evidence=False) CANNOT promote;
    #   status in {hypothesis, supported, refuted, inconclusive}; default = hypothesis
```

### Experiment (S6–S7)
```python
class ExperimentService:
    def plan(self, h: Hypothesis, rule: DecisionRule) -> LedgerEntry: ...         # rule PRE-REGISTERED
    def run(self, entry: LedgerEntry, runner: ExperimentRunnerAdapter) -> LedgerEntry: ...
    def verdict(self, entry: LedgerEntry) -> Verdict: ...                         # {supported,refuted,inconclusive,invalid}
    # invariants: ONE run = ONE append-only entry; reproducibility gate (config+seed+env) or entry is 'invalid';
    #   verdict gated by the pre-registered rule; negative results retained + classified, never discarded
```

### Writeback (feeds S9 → CAW-01)
```python
class WritebackService:
    def derive(self, h: Hypothesis, ledger: list[LedgerEntry]) -> WbTrafficSchema: ...  # wbtraffic.v0, per-variant
    # fields: write_bandwidth, write_endurance, near_memory_update, updated_state_residency,
    #         capacity_bw_ratio_over(context, update_freq); each numeric defaults null + basis=TODO(open-question)
    # invariant: v1 = ANALYTIC L0 estimate; MODELED flagged distinctly from MEASURED; no invented numbers
```

### Implication (S8)
```python
class ImplicationService:
    def map(self, finding: Finding) -> ImplicationMap: ...                        # one map per finding
    # domains: {ai-services, education, dev-platforms, models, hardware, memory-centric}
    # invariant: summary explicitly marked generated (evidence=False) — routing layer, not a verdict
```

### Export (S9)
```python
class ExportService:
    def build(self, target: str, item: Implication | WbTrafficSchema | Hypothesis) -> ExportBundle: ...
    def propose(self, bundle: ExportBundle) -> PendingGateEvent: ...              # surfaces stop here
    def emit(self, bundle: ExportBundle, adapter: ExportAdapter) -> ExportReceipt: ...  # core-only, post review gate
    # invariant: per-target gate runs inside validate() BEFORE any write; status:hypothesis rejected for CAW-02;
    #   one-way push; receipt stored on thread; self-describing bundle (schema_version+producer+content_hash)
```

### Schedule (the Run)
```python
class ScheduleService:
    def run(self, scope: RunScope) -> RunReceipt: ...                            # resumable pass over the 9 stages
    def resume(self, run_id: str) -> RunReceipt: ...                             # restart at last checkpoint
    # owns: single-flight lock, FetchCursor catch-up, per-stage checkpoints, heartbeat; scheduler only FIRES
    # invariant: re-running a completed thread-stage is a no-op (idempotent); orchestrates, owns no truth
```

## Ports (the only seams to the outside)

The core depends on these Protocols, never on a concrete adapter. A config-driven registry binds families;
documented stubs implement the Protocol and report `HealthStatus="deferred: <reason>"` (brief §9).

```python
class SourceAdapter(Protocol):                                  # discovery + import (ADR-0005)
    def capabilities(self) -> SourceCapabilities: ...
    def fetch(self, query: Query, cursor: FetchCursor) -> FetchPage: ...   # provenance complete; rate-limit inside
    def health(self) -> HealthStatus: ...
    # contract: idempotent+incremental; legal-mode (public, ToS-safe); typed failures; NO extraction/ranking here

class ExperimentRunnerAdapter(Protocol):                        # toy reproduction (ADR-0003)
    def run(self, spec: ExperimentSpec) -> RunArtifacts: ...    # returns config+seed+env for the repro gate
    def health(self) -> HealthStatus: ...

class ExportAdapter(Protocol):                                  # the ONLY export seam (ADR-0008)
    def validate(self, bundle: ExportBundle) -> ValidationReport: ...   # per-target gate + schema BEFORE write
    def emit(self, bundle: ExportBundle) -> ExportReceipt: ...          # file drop v1; idempotent by id+hash
    def health(self) -> AdapterStatus: ...
```

| Port | v1 adapters (build) | Documented stubs |
|---|---|---|
| `SourceAdapter` | `ArxivAdapter`, `SemanticScholarAdapter`, `CAW05ImportAdapter` | `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` |
| `ExperimentRunnerAdapter` | `LocalToyRunner` | external-compute / HW runners |
| `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, `HttpExportAdapter` |

## Where the load-bearing rules live (boundary table)

| Rule | Must live in | Must NOT live in | Boundary check |
|---|---|---|---|
| status floor = `hypothesis` | `core/hypothesis` | surface, adapter | export gate re-asserts on CAW-02 |
| `confidence ≤ evidence_strength` cap | `core/hypothesis` | surface, adapter | nothing crosses boundary stripped of uncertainty |
| generated ≠ evidence (cannot promote) | `core/hypothesis` | surface, adapter | CAW-02 bundle carries `not_evidence[]` |
| reproducibility gate (config+seed+env) | `core/experiment` | runner adapter | entry without it = `invalid` |
| pre-registered decision rule | `core/experiment` | surface | verdict references the rule id |
| failures retained + surfaced | `core/experiment` + store | — | `negative-results` view |
| per-target export gate | `core/export` | export adapter | `validate()` runs before any write |
| no invented numbers (null+basis) | `core/writeback` | adapter | CAW-01 bundle modeled≠measured flag |
| one-way push, no shared store | `core/export` + ports | — | local receipt only; no read-back |

The recurring trap: an adapter or surface "helpfully" deciding truth (a runner marking a result `supported`, an MCP
tool auto-promoting, an export adapter relaxing a gate). All such routes are **proposals** that the core adjudicates
behind the human review gate (ADR-0001 §4). Adapters move bytes; surfaces request ops; **core owns truth**.

## Open Questions
- TODO(open-question: split `core/store` per-entity or one store facade? affects how services share persistence — ADR-0007.)
- TODO(open-question: is `Evidence` a sub-record of `Hypothesis` or its own owned entity referenced by id? affects `core/hypothesis` boundary — ADR-0002.)
- TODO(open-question: does `WritebackService` read ledger directly or only via a `Finding` projection? affects coupling to `core/experiment`.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: scaffold `core/*` packages with the seven service Protocols above; assert governance-in-core with a boundary test (a surface/adapter importing a status mutator fails the build).
- RB: the three port Protocols + config-driven registry + stubs reporting `deferred`.
- RB: a boundary lint — adapters import only port DTOs, surfaces import only the op-set, nothing imports `core` internals.

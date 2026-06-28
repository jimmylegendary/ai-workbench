# Ports & Adapters — Source / ExperimentRunner / Export

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./export-boundaries.md](./export-boundaries.md) (the Export port in full)
  - [./implication-mapping.md](./implication-mapping.md) (what feeds the Export port)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (SourceAdapter)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (ExperimentRunner + reproducibility gate)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (status/uncertainty gate)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (Export gate)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (the pipeline core)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies CAW-06's **ports & adapters**: the three integration seams (`SourceAdapter`,
`ExperimentRunnerAdapter`, `ExportAdapter`), the **config-driven registry** that wires them, the **documented
stubs**, and the invariant that **no adapter can bypass** the status/uncertainty/reproducibility gates. It
does **NOT** redefine the bundle shapes or export gates (see [./export-boundaries.md](./export-boundaries.md)),
the ingestion stages (ADR-0005), or the ledger semantics (ADR-0003) — it cross-links them. Every adapter that
touches another product is a **file/API boundary between independent products** — no shared store/runtime.

## 1. Why ports & adapters
Sources, experiment runners, and export targets must plug in **without redesign** (brief §9). Each seam is a
narrow **port** (an interface the pipeline core depends on); concrete **adapters** implement it; a
**config-driven registry** selects which adapters are active. v1 builds the minimal real adapters and
**documents stubs** for the rest, so promoting a stub is config + build, never a redesign.

| Seam | Port | v1 adapters | Documented stubs |
|---|---|---|---|
| Ingest | `SourceAdapter` | arXiv/Semantic Scholar; CAW-05 signal import | other catalogs, web, RSS |
| Experiment | `ExperimentRunnerAdapter` | local toy-experiment runner | external compute, HW runners |
| Export | `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, `HttpExportAdapter` |

The pipeline core (ADR-0001: ONE ExperimentScout Run) depends only on the **ports**, never on a concrete
adapter — surfaces (scheduled pipeline / CLI / MCP) and external systems swap behind the seam.

## 2. `SourceAdapter` port
Ingestion is ONE pipeline, FIVE stages, behind this port (ADR-0005). CAW-05 is a **separate product**; its
signals are **imported** across a boundary, never read from a shared store.

```python
class SourceAdapter(Protocol):
    name: str
    def discover(self, query: ScoutQuery) -> list[SourceRef]: ...      # S1 Discover
    def fetch(self, ref: SourceRef) -> RawSource: ...                  # S2 Import
    def health(self) -> AdapterStatus: ...
```

- Idempotent + resumable; canonicalization/dedup/claim-extraction happen in the pipeline (S3–S5), not the
  adapter (ADR-0005).
- **Imported CAW-05 judgments are never conflated with CAW-06's own** — they enter as *claims to verify*
  with provenance (brief §12).

## 3. `ExperimentRunnerAdapter` port
One run = one append-only ledger entry, gated by a pre-registered decision rule and a hard reproducibility
gate (ADR-0003). v1 = a local toy-experiment runner; external compute / HW runners are **stubs**.

```python
class ExperimentRunnerAdapter(Protocol):
    name: str
    def plan(self, hypothesis_ref: str) -> ExperimentPlan: ...   # pre-registers the decision rule
    def run(self, plan: ExperimentPlan) -> RunResult: ...        # captures config+seed+env
    def health(self) -> AdapterStatus: ...
```

- The **reproducibility gate** (config + seed + env captured) is enforced by the ledger writer, **not** by
  the adapter — a runner that omits seed/env produces a non-reproducible result that the ledger **refuses to
  mark as evidence** (ADR-0003). The gate cannot be bypassed by choosing a different runner.
- **Negative results are retained, classified, and surfaced by default** — a runner cannot silently drop a
  failure (brief §5).
- v1 keeps to **minimal reproductions / toy experiments only** (brief §11); a HW/external runner stub does
  not change the gate it must satisfy.

## 4. `ExportAdapter` port + registry
Full contract, bundle shapes, and per-target gates live in [./export-boundaries.md](./export-boundaries.md).
Here is the **registry** that wires it (and all three seams) — config-driven; stubs documented, not built.

```python
# config-driven registry; one entry per active adapter, stubs listed but inert
ADAPTERS = {
  "source": {
    "arxiv":   ArxivSemanticScholarAdapter,   # v1
    "caw-05":  Caw05SignalImportAdapter,      # v1 (import from a separate product)
    "rss":     StubSourceAdapter,             # stub
  },
  "runner": {
    "local-toy": LocalToyRunner,              # v1
    "external":  StubRunnerAdapter,           # stub (external compute / HW)
  },
  "export": {
    "caw-01":  Caw01WritebackAdapter,         # v1
    "caw-02":  Caw02ClaimAdapter,             # v1
    "caw-03":  StubExportAdapter,             # stub (novelty cues)
    "http":    StubExportAdapter,             # stub (transport swap)
  },
}
```

- **Documented stub contract:** a stub implements its port and is registered, but `health()` reports
  `not-built` and any call raises `NotImplementedError` with a pointer to the ADR — so promotion is config +
  build, never a seam redesign.
- The registry is the **only** place adapters are named; the pipeline core resolves by port + key.

## 5. The invariant: adapters cannot bypass the gates
Adapters are **transport + shape**, never **policy**. The three gates are owned by the pipeline core /
domain model and run **regardless of which adapter is active**.

| Gate | Owned by | What it enforces | An adapter CANNOT |
|---|---|---|---|
| **status/uncertainty** | hypothesis model (ADR-0002) + Export gate (ADR-0008) | nothing crosses a boundary stripped of status/uncertainty; generated evidence cannot promote status | strip uncertainty or smuggle a bare `hypothesis` out as a claim |
| **reproducibility** | ledger writer (ADR-0003) | config+seed+env captured; non-reproducible runs are not evidence | mark an unreproducible run as evidence by choosing a different runner |
| **export eligibility** | `validate()` per-target gate (ADR-0008 §3) | CAW-01 = writeback/open-question; CAW-02 = evidence + status≠hypothesis | emit a bundle that failed `validate()` |

Concretely:
- An `ExportAdapter.emit()` is unreachable unless `validate()` (gate + schema) passed first — gated-out
  bundles are logged and never written ([./export-boundaries.md](./export-boundaries.md) §2).
- A `SourceAdapter` cannot inject a claim as evidence; extraction (S4) tags provenance + uncertainty, and
  CAW-05 imports stay *claims-to-verify*.
- An `ExperimentRunnerAdapter` cannot self-certify a result; the ledger applies the reproducibility gate and
  the pre-registered decision rule.
- A generated `summary` is never evidence at any seam (brief §12).

```
core pipeline ──depends-on──► [ports]  ──registry selects──► [adapters: real | stub]
gates (status/uncertainty, reproducibility, export-eligibility) sit INSIDE the core,
so swapping an adapter cannot move or weaken a gate.
```

## 6. Adding / promoting an adapter
1. Implement the relevant port (`SourceAdapter` / `ExperimentRunnerAdapter` / `ExportAdapter`).
2. Register it under its seam key in `ADAPTERS` (config-driven).
3. Adapter handles **transport + shape only**; the existing gates apply unchanged.
4. For an export target, add/confirm its per-target gate in [./export-boundaries.md](./export-boundaries.md)
   §3 — a new target does **not** get to skip the no-overclaim gate.

## Open Questions
Track in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- `TODO(open-question: does the external/HW ExperimentRunner stub need a different reproducibility-capture contract than the local runner?)`
- `TODO(open-question: should the CAW-05 import adapter verify a signature on imported signals — mirror outbound signing?)`
- `TODO(open-question: registry config format — static module map vs entry-points discovery — and where it lives in CAW-06's OWN store?)`
- `TODO(open-question: do stubs need a uniform "not-built" health contract surfaced in the CLI/MCP surfaces?)`

## Implications for runbooks
- Define the three ports and the config-driven `ADAPTERS` registry; resolve by port + key in the pipeline
  core.
- v1 adapters: arXiv/Semantic-Scholar + CAW-05 import (Source); local toy runner (Runner); CAW-01 + CAW-02
  (Export). All others are documented stubs with a `not-built` health contract.
- Enforce the three gates **inside the core**, not in adapters; add a test that a stub/alternate adapter
  cannot bypass status/uncertainty/reproducibility/export-eligibility.
- Cross-link runbook tasks to ADR-0005 (ingest), ADR-0003 (ledger), ADR-0008 (export).

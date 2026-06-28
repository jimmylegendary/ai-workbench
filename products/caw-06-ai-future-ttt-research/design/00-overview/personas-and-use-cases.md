# Personas & Use Cases — CAW-06

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](vision.md)
  - [scope-and-non-goals.md](scope-and-non-goals.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Name who CAW-06 serves and the concrete use cases the surfaces must support. It maps each use case to the pipeline
stage, the ADR that governs it, and the no-overclaim / failures-useful invariants. It does not specify surface APIs
(see [ADR-0001](../01-decisions/ADR-0001-product-surface-and-scout.md)) or schemas (see the per-topic ADRs).

## Personas
| Persona | Who | Goals | Authority / constraint |
|---|---|---|---|
| **Jimmy** | researcher / reviewer | turn loud TTT claims into checkable threads; decide what reaches CAW-01/02 | **the human adjudicator**: only Jimmy confirms a `→ supported` promotion and approves any `supported` export (brief §12, ADR-0002) |
| **The team** | collaborators | inspect threads, reproduce experiments, read implication maps | consume the store + CLI/MCP; can run the scout; cannot bypass the gates |
| **ExperimentScout agent** | the automated pipeline | discover → extract → generate → plan → log → map | **proposes, never decides**: generates hypotheses at `status=hypothesis`, `confidence=very-low`; cannot promote on `generated` evidence; cannot export across a gate it fails |

**Division of authority:** the agent *proposes* (hypotheses, experiment plans, modeled estimates, draft
implications); Jimmy *adjudicates* (promotions, strategic exports). The representation makes the un-adjudicated state
the structural default (ADR-0002).

## Surfaces (one core, three thin)
One ExperimentScout pipeline core; **scheduled/triggered pipeline + CLI + MCP** drive it; five output artifact kinds
derive from one thread store (ADR-0001). Use cases below are surface-agnostic unless noted.

## Use cases
### UC-1 — Scout: sources → claims → hypotheses
- **Actor:** ExperimentScout (scheduled/triggered) · **Jimmy** reviews.
- **Flow:** discover TTT sources → extract `Claim`s (with `asserted_by` provenance) → generate `Hypothesis` records,
  each `status=hypothesis`, `confidence=very-low`, **`falsifiability` required** to be promotable later.
- **Stages / ADRs:** S1–S5 ingestion ([ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md));
  hypothesis shape ([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md)).
- **No-overclaim check:** a `Claim` renders as "<source> claims …", never "it is true that …"; a generated
  hypothesis is never serialized without a status.
- **Done:** new threads exist in `store/{claims,hypotheses}` with provenance and falsifiability (or a `TODO`).

### UC-2 — Toy experiment + log (including failure)
- **Actor:** ExperimentScout / team via local runner · **Jimmy** reviews verdict.
- **Flow:** plan a minimal reproduction for one checkable claim with a **pre-registered decision rule** → run →
  write **one append-only ledger entry** (`EXP-XXXX`) with config+seed+env (**reproducibility gate**) → the verdict
  becomes an `Evidence` record and proposes a `StatusEvent`.
- **Stages / ADRs:** [ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md); status transition
  [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md).
- **Failures-useful check:** a negative/failed run is **retained, classified, and surfaced by default**; it maps to
  `refuted` or `inconclusive` (never dropped, never silently retried into a positive).

```
verdict ∈ {supports, refutes, inconclusive, invalid}   # four-value, gated by the pre-registered rule
  supports     → Evidence(experiment) → StatusEvent(hypothesis → supported*)   *human-confirmed
  refutes      → Evidence(experiment) → StatusEvent(hypothesis → refuted)      first-class negative
  inconclusive → Evidence(experiment) → StatusEvent(→ inconclusive)            kept, exportable
  invalid      → reproducibility gate failed → no status change; logged
```

### UC-3 — Implication map for a finding
- **Actor:** ExperimentScout drafts · **Jimmy** reviews.
- **Flow:** build one `ImplicationMap` per finding across domains — AI services, education, dev platforms, models,
  hardware, memory-centric systems — with the summary **explicitly marked generated (not evidence)**.
- **ADR:** [ADR-0006](../01-decisions/ADR-0006-implication-mapping.md).
- **No-overclaim check:** generated prose carries a `generated` marker and can inform only `inconclusive` — it can
  never promote a status.

### UC-4 — Writeback-traffic schema → CAW-01 (the bridge)
- **Actor:** ExperimentScout produces · **Jimmy** approves export.
- **Flow:** for a TTT variant, emit one `wbtraffic.v0` **analytic L0 estimate** (numerics `null` unless modeled with
  listed assumptions or measured from a toy run) → `ExportAdapter` → `Caw01WritebackAdapter` ships a self-describing
  bundle (schema fields **and** open questions) lowered onto CAW-01's existing L0 objects.
- **ADRs:** [ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema.md),
  [ADR-0008](../01-decisions/ADR-0008-export-boundaries.md).
- **Boundary check:** export across a **file boundary, never a shared store**; modeled ≠ measured (flagged
  distinctly); a `hypothesis`-status item exports only as an **open question**, never as a settled workload
  requirement; CAW-01 owns its IR names (re-verify at the boundary).

### UC-5 — Import a CAW-05 radar signal → open a thread
- **Actor:** ExperimentScout via `SourceAdapter`.
- **Flow:** import a TTT signal from **CAW-05 (a separate product)** → open a `Hypothesis` at `status=hypothesis`,
  `confidence=very-low`; the signal is stored as `external` evidence — **never auto-promoted**, never conflated with
  our own judgment.
- **ADRs:** [ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md),
  [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md).

### UC-6 — Export a claim+evidence → CAW-02
- **Actor:** ExperimentScout proposes · **Jimmy** approves.
- **Flow:** when a thread reaches `status ∈ {supported, refuted, inconclusive}` with ≥1 resolving evidence and
  provenance → `ExportAdapter` → `Caw02ClaimAdapter` ships claim + evidence + `confidence` + an explicit
  `not_evidence[]` list + uncertainty notes.
- **ADR:** [ADR-0008](../01-decisions/ADR-0008-export-boundaries.md).
- **Gate check:** a **bare `hypothesis` is rejected** at the boundary; `refuted`/`inconclusive` **are** exportable
  (negative results are knowledge); a failed export is logged and the finding stays exportable.

## Use-case → stage → invariant matrix
| UC | Pipeline stage | Primary ADR | Key invariant |
|---|---|---|---|
| UC-1 | discover → extract → generate | ADR-0005 / 0002 | hypothesis defaults to `very-low`, needs `falsifiability` |
| UC-2 | plan → run → log | ADR-0003 | one run = one append-only entry; reproducibility gate; failures retained |
| UC-3 | implication mapping | ADR-0006 | generated summary is not evidence |
| UC-4 | writeback estimate → export | ADR-0004 / 0008 | export not shared store; modeled ≠ measured |
| UC-5 | import (CAW-05) | ADR-0005 / 0002 | imported signal = `external` evidence, never auto-promoted |
| UC-6 | export (CAW-02) | ADR-0008 | bare hypothesis rejected; negatives exportable |

## Open questions
- Surface ergonomics for the human-gated promotion step (CLI prompt vs MCP review queue) — see
  [ADR-0001](../01-decisions/ADR-0001-product-surface-and-scout.md) and
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- Every surface must **display `status` + `confidence` + evidence** on every hypothesis card (no shortcut renderings).
- The promotion-to-`supported` and the strategic export steps must be **human-gated** in all three surfaces.

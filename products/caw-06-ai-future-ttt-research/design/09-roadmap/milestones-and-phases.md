# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./dependency-graph.md](./dependency-graph.md), [./risks-and-mitigations.md](./risks-and-mitigations.md), [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md), [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md), [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md), [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Sequences CAW-06's build into phases that map 1:1 onto runbook folders (`10-runbooks/RB-0XX..RB-4XX`), and defines **Milestone 1** as one end-to-end vertical slice: a single checkable TTT claim driven through scout → hypothesis → toy experiment (logged, failure-tolerant) → implication map → a `wbtraffic.v0` analytic estimate **exported** to CAW-01 (a separate product). It does NOT redefine ADR decisions, design the schemas (see ADRs), or set dates. Each phase has explicit **entry** and **exit** gates so an interrupted build resumes cleanly.

## Phasing principle
We build the smallest scaffolding that lets one research thread flow end-to-end, then widen. Per the brief: prefer a small vertical slice over broad scaffolding; failures are first-class; nothing exported is overclaimed; the CAW-01 bridge is an **export across a boundary**, never a shared store.

## Phases ↔ runbook folders

| Phase | Runbook prefix | Theme | What exists at exit |
|-------|----------------|-------|---------------------|
| P0 Foundations | `RB-0XX` | Store layout, domain records, ports (no adapters) | File store per ADR-0007; Source/Claim/Hypothesis/Ledger/Implication schemas; `SourceAdapter`/`ExperimentRunnerAdapter`/`ExportAdapter` port interfaces with documented stubs |
| P1 Ingestion + Hypothesis | `RB-1XX` | S1–S5 pipeline; claim→hypothesis | One thread persisted from a real source with status/uncertainty (ADR-0002, ADR-0005) |
| P2 Experiment ledger | `RB-2XX` | Pre-registered toy experiments | One append-only ledger entry with verdict + reproducibility gate (ADR-0003) |
| P3 Implication + Writeback | `RB-3XX` | Implication maps; `wbtraffic.v0` L0 estimate | One ImplicationMap + one self-describing writeback bundle (ADR-0006, ADR-0004) |
| P4 Export | `RB-4XX` | ExportAdapter v1 | `Caw01WritebackAdapter` + `Caw02ClaimAdapter` emit boundary bundles (ADR-0008) |

> The three thin surfaces (scheduled/triggered pipeline, CLI, MCP — ADR-0001) are introduced as soon as P1 has a runnable core and hardened through P4; they wrap the same pipeline core, not separate logic.

## Milestone 1 — the proving slice (LOAD-BEARING)
**Goal:** one checkable TTT claim travels the whole thread and produces an exported `wbtraffic.v0` analytic estimate for CAW-01.

Definition of done (every box checkable):

```
[ ] 1 Source record imported (arXiv/Sem.Scholar or a CAW-05 signal) with provenance
[ ] 1 Claim extracted, citing the Source, status-stripped of nothing
[ ] 1 Hypothesis (status=hypothesis, calibrated qualitative uncertainty)
[ ] 1 pre-registered decision rule recorded BEFORE the toy run
[ ] 1 toy-experiment ledger entry (append-only) with config+seed+env (reproducibility gate)
       -> verdict in {supported, refuted, inconclusive, error}; a FAILURE is a valid M1 outcome
[ ] generated evidence did NOT promote hypothesis status (evidence cap honored)
[ ] 1 ImplicationMap for the finding, summary explicitly marked generated (not evidence)
[ ] 1 wbtraffic.v0 bundle: analytic L0 estimate, basis marked, open questions attached
[ ] Caw01WritebackAdapter writes the bundle to a boundary path (NO shared store)
```

M1 explicitly succeeds even if the toy experiment **refutes** the claim or errors — the thread, the logged negative result, and the estimate-with-open-questions are the deliverable, not a positive finding.

## Entry / exit gates per phase

### P0 Foundations
- **Entry:** ADRs 0001–0008 accepted; `_meta` brief read.
- **Exit:** store dirs `store/{sources,claims,hypotheses,ledger,implications}` create/round-trip; every record kind has a schema + validator; three ports compile with stub implementations that raise `NotImplemented`-style guards; tree green.

### P1 Ingestion + Hypothesis
- **Entry:** P0 exit met; at least one `SourceAdapter` v1 wired.
- **Exit:** pipeline S1→S5 runs idempotently and resumably on one source; produces ≥1 Source, ≥1 Claim, ≥1 Hypothesis; Hypothesis carries the four-state status (default `hypothesis`) + qualitative uncertainty; re-running does not duplicate (dedup at S3). No record crosses a function boundary stripped of status/uncertainty.

### P2 Experiment ledger
- **Entry:** P1 exit met; an `ExperimentRunnerAdapter` v1 (minimal local runner) wired.
- **Exit:** one `ledger/EXP-XXXX` append-only entry exists with a **pre-registered** decision rule, a four-value verdict, and a passing reproducibility gate (config+seed+env captured); a deliberately-failing run is also recorded and classified as a negative result, surfaced by default.

### P3 Implication + Writeback
- **Entry:** P2 exit met (a finding, supported or not, exists).
- **Exit:** one ImplicationMap across the ADR-0006 domains with generated-summary flag set; one `wbtraffic.v0` bundle produced as an analytic **L0 estimate** with all ADR-0004 fields present (values may be `TODO(open-question)`), basis marked (analytic vs toy-grounded), and open questions enumerated. CAW-01 IR object names are re-verified against CAW-01, not assumed.

### P4 Export
- **Entry:** P3 exit met; ExportAdapter registry config present.
- **Exit:** `Caw01WritebackAdapter` emits the writeback bundle + open questions to a configured boundary path; `Caw02ClaimAdapter` emits claims+evidence; documented stubs (`Caw03Novelty`, …) registered but inert; no adapter reads or writes another product's internal store. M1 checklist fully green.

## wbtraffic.v0 field coverage gate (P3)
The exported bundle must carry these fields (per ADR-0004); unknown numerics are `TODO(open-question)`, never invented:

```yaml
wbtraffic.v0:
  variant: <ttt-variant-id>
  basis: analytic-L0 | toy-grounded-L0
  write_bandwidth: TODO(open-question)
  write_endurance: TODO(open-question)
  near_memory_update: TODO(open-question)
  updated_state_residency: TODO(open-question)
  capacity_bw_ratio_over_context_freq: TODO(open-question)
  open_questions: [ ... ]
  caw01_ir_targets: <re-verified names, owned by CAW-01>
```

## Beyond M1 (later milestones, not scoped here)
- M2: breadth — 5–10 tracked TTT themes; multiple SourceAdapters.
- M3: optional toy-reproduction grounding to lift an estimate from `analytic-L0` to `toy-grounded-L0`.
- M4: additional export stubs activated as sibling products request them.

## Open Questions
- Can write traffic be modeled at L0/L1 before syntorch/vLLM integration? See `../08-research-plan/open-questions.md` (and ADR-0004).
- Which TTT variants actually write back? Verify in the first research run.

## Implications for runbooks
- Number runbooks by phase (`RB-0XX`..`RB-4XX`); M1 is the acceptance spine threaded through RB-1XX..RB-4XX.
- Each runbook's Acceptance criteria should reference the matching phase exit gate above and leave the tree green.

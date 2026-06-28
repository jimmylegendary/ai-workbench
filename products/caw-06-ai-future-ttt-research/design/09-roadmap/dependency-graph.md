# Dependency Graph

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./milestones-and-phases.md](./milestones-and-phases.md), [./risks-and-mitigations.md](./risks-and-mitigations.md), [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md), [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md), [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Defines the build-order DAG between CAW-06's components so runbooks can be sequenced and parallelized safely. It encodes the hard ordering constraints: **ports + store before adapters; ingestion + hypothesis before experiment; experiment + writeback before export; writeback schema before any CAW-01 export.** It does NOT assign dates or redefine component scope (see the ADRs).

## Ordering constraints (the rules)

| # | Rule | Why |
|---|------|-----|
| R1 | Store layout + record schemas before everything | Every component reads/writes the CAW-06-owned store (ADR-0007) |
| R2 | Ports before adapters | Adapters implement port contracts; stubs documented first (ADR-0001, ADR-0008) |
| R3 | Ingestion (S1–S5) + hypothesis before experiment | An experiment tests a hypothesis derived from a claim from a source (ADR-0002, ADR-0005) |
| R4 | Experiment ledger + writeback schema before export | You can only export results/estimates that exist (ADR-0003, ADR-0004) |
| R5 | `wbtraffic.v0` schema before `Caw01WritebackAdapter` | The CAW-01 bridge exports the schema bundle; no schema, nothing to lower (ADR-0004, ADR-0008) |
| R6 | Implication map after a finding exists | Maps elaborate a finding's domains (ADR-0006) |

## DAG (ASCII)

```
                         +------------------------+
                         |  Store layout + record |   (R1, ADR-0007)
                         |  schemas (Source/Claim/|
                         |  Hypothesis/Ledger/Impl)|
                         +-----------+------------+
                                     |
                 +-------------------+-------------------+
                 v                   v                   v
        +----------------+  +-----------------+  +------------------+
        | SourceAdapter  |  | ExperimentRunner|  | ExportAdapter    |  (R2: ports
        | PORT (+stubs)  |  | Adapter PORT    |  | PORT (+stubs)    |   before
        +-------+--------+  +--------+--------+  +---------+--------+   adapters)
                |                    |                     |
                v                    |                     |
   +-------------------------+       |                     |
   | Ingestion pipeline      |       |                     |
   | S1 Discover -> S2 Import |       |                     |
   | (CAW-05) -> S3 Canon/   |       |                     |
   | Dedup -> S4 Extract     |       |                     |
   | claims -> S5 Persist    |       |                     |
   +-----------+-------------+       |                     |
               |                     |                     |
               v                     |                     |
   +-------------------------+       |                     |
   | Hypothesis records      |       |                     |
   | (4-state status,        |       |                     |
   |  uncertainty, ev. cap)  |       |                     |
   +-----------+-------------+       |                     |
               |   (R3)             |                     |
               +---------+----------+                     |
                         v                                |
              +-----------------------+                   |
              | Experiment ledger     |                   |
              | EXP-XXXX append-only, |                   |
              | pre-reg rule, verdict,|                   |
              | reproducibility gate  |                   |
              +-----+-----------+-----+                   |
                    |           |                         |
          (R6)      v           v  (R4)                   |
        +-------------------+  +------------------------+  |
        | ImplicationMap    |  | wbtraffic.v0 schema    |  |
        | (gen-summary flag)|  | analytic L0 estimate   |  |
        +---------+---------+  | (+ open questions)     |  |
                  |           +-----------+------------+  |
                  |                       | (R5)          |
                  |                       v               v
                  |            +-------------------------------+
                  +----------> | ExportAdapter v1 (registry)   |
                               |  - Caw01WritebackAdapter ===>  ]==> CAW-01
                               |  - Caw02ClaimAdapter      ===>  ]==> CAW-02
                               |  - Caw03Novelty (stub)        |  (separate
                               +-------------------------------+   products,
                                                                   boundary only)
```

## Boundary note (no shared store)
The `===>` arrows into CAW-01 and CAW-02 are **export boundaries**: self-describing bundles written to a configured path, then consumed by those independent products. CAW-06 never reads/writes a sibling's internal store, and CAW-01 IR object names are **owned by CAW-01** — re-verify, do not assume (ADR-0004, ADR-0008).

## Parallelizable vs serial

| Can build in parallel | Strictly serial |
|-----------------------|-----------------|
| The three port interfaces (after R1) | Hypothesis → Experiment (R3) |
| `SourceAdapter` v1 ⟂ `ExperimentRunnerAdapter` v1 | Experiment → ImplicationMap (R6) |
| ImplicationMap ⟂ wbtraffic.v0 (both need a finding) | wbtraffic.v0 → Caw01WritebackAdapter (R5) |

## Critical path to Milestone 1
```
store/schemas -> SourceAdapter port+v1 -> ingestion S1..S5 -> hypothesis
   -> ExperimentRunner port+v1 -> ledger entry (verdict) -> wbtraffic.v0 (L0)
   -> ExportAdapter port -> Caw01WritebackAdapter -> [boundary] CAW-01
```
The ImplicationMap hangs off the finding and joins before the M1 checklist closes but is not on the schema→CAW-01 critical path.

## Open Questions
- Does S2 import from CAW-05 require a stable signal schema first? Track in `../08-research-plan/open-questions.md`.

## Implications for runbooks
- Topologically sort runbooks by this DAG; a runbook may only `Depends on:` upstream nodes.
- The two export adapters are the last runbooks in P4; their preconditions are R4+R5 satisfied.

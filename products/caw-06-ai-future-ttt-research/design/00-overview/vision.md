# Vision — CAW-06, AI Future / TTT Research Automation

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [scope-and-non-goals.md](scope-and-non-goals.md)
  - [personas-and-use-cases.md](personas-and-use-cases.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
State the north star for CAW-06: turn uncertain TTT / future-AI **claims into checkable experiments**, and turn the
"inference that writes back" idea into a **writeback-traffic schema** that bridges into CAW-01 as an export. It
defines the unit of value, the no-overclaim stance, and the first vertical slice. It does NOT redefine any decision
(see the ADRs), enumerate scope boundaries (see [scope-and-non-goals.md](scope-and-non-goals.md)), or list
personas/use-cases (see [personas-and-use-cases.md](personas-and-use-cases.md)).

## North star
Future-AI and TTT (test-time training / test-time compute) claims are loud, fast-moving, and easy to over- or
under-claim. They rarely get connected to a concrete experiment, and almost never to a *memory-system* implication —
and when an experiment fails, the result is lost. CAW-06 exists to make each such claim **checkable and tracked**:

> From a public claim, generate a falsifiable **hypothesis**, run a **minimal reproduction**, log the result
> (including failure), map its **implications**, and — for the lead theme — emit a **writeback-traffic schema** that
> CAW-01 can treat as a candidate future workload axis.

The strategic bet (a *hypothesis*, not a premise): inference that **writes back** — weight updates, gradients,
optimizer state, updated-weight reuse — may create a **memory traffic axis not captured by read-dominant LLM serving
profiles**. CAW-06's job is to make that bet *checkable* and to hand CAW-01 a schema + open questions, not a verdict.

## Unit of value — the tracked research thread
The atomic deliverable is **one tracked research thread**, carrying provenance and explicit uncertainty end-to-end:

```
source ──▶ claim ──▶ hypothesis ──▶ small experiment ──▶ result (incl. failure) ──▶ implication
 (S1–S2)   (S4)     (status=         (ledger:            (verdict →                 (ImplicationMap)
            who      hypothesis,      one run =           Evidence →                       │
            asserts) very-low conf)   one entry,          StatusEvent)             ┌───────┴───────┐
                                      pre-registered                               ▼               ▼
                                      decision rule)                          CAW-01 export    CAW-02 export
                                                                            (wbtraffic.v0 +   (claim+evidence,
                                                                             open questions)   not bare hypo)
```

Every node is a separately-addressable record; nothing advances stripped of its `status` / `confidence`
(ADR-0002). A thread is valuable even when the experiment *fails* — a `refuted` or `inconclusive` thread is
exportable knowledge, not waste.

## Three principles (load-bearing)
| Principle | What it means here | Enforced by |
|---|---|---|
| **No overclaim** | A hypothesis is never rendered or exported as a settled claim; `Claim` / `Hypothesis` / `Evidence` are separate record kinds; `generated` text is never evidence and can never promote a status | [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md) |
| **Failures are useful** | One run = one append-only ledger entry; negative results retained, classified, surfaced by default; a failed export stays exportable | [ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md), [ADR-0008](../01-decisions/ADR-0008-export-boundaries.md) |
| **Bridge, don't merge** | The CAW-01 connection is an **export across a file boundary**, never a shared store/registry/substrate; CAW-06 hands over a self-describing bundle and open questions | [ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema.md), [ADR-0008](../01-decisions/ADR-0008-export-boundaries.md) |

## The writeback → CAW-01 bridge (the strategic output)
The lead artifact is a per-variant `wbtraffic.v0` schema, produced v1 as an **analytic L0 estimate** (optionally
grounded by one toy reproduction), exported as a self-describing bundle **lowered onto CAW-01's existing L0 objects**
(`mem_store` ops + writeback `movements` + mutable `tensors`) plus a typed open-question list.

```yaml
# wbtraffic.v0 (sketch — full schema in ADR-0004). Numerics default null; never invent.
kind: writeback-traffic-schema
ttt_variant: TODO(open-question: which variant; do its writes touch optimizer state? wbq-001)
uncertainty: { status: hypothesis, confidence: very-low }   # modeled ≠ measured; generated ≠ evidence
provenance: { claim_id: ..., source_url: ... }
fields:
  write_bandwidth_bytes_per_s: { value: null, basis: "TODO(open-question)" }
  write_endurance_writes_per_run: { value: null, basis: "TODO(open-question)" }
  updated_state_residency: device | near_mem | host        # TODO(open-question)
  optimizer_state_bytes_per_param: { value: null }
  updated_weight_reuse_distance_tokens: { value: null }
  capacity_bw_ratio_curve: []   # read/write bytes vs context length × update frequency
open_questions: [ wbq-002 directional read/write split, wbq-006 is write ever the bottleneck ]
boundary: export:caw-01
```

CAW-01 owns its IR object names (separate product) — CAW-06 re-verifies them at the boundary and never assumes a
shared registry. CAW-01 receives **questions and a schema, not assertions about its IR**.

## First vertical slice (v1)
Prove the whole thread on **one** checkable TTT claim before broadening (brief §12 — small vertical slices over
scaffolding):

1. **Scout** one TTT source → extract a `Claim` → generate one falsifiable `Hypothesis` (`status=hypothesis`,
   `confidence=very-low`, `falsifiability` required).
2. **Toy-experiment** it via the minimal local runner → one append-only ledger entry with a pre-registered decision
   rule and a reproducibility record (config+seed+env). **Log the failure path too.**
3. **Implication map** the finding across domains; mark the generated summary as *generated, not evidence*.
4. **Writeback estimate:** emit one `wbtraffic.v0` analytic L0 estimate for the variant.
5. **Export** both seams through the single `ExportAdapter`: `wbtraffic.v0` + open questions → CAW-01;
   claim+evidence → CAW-02 (only if `status ∈ {supported, refuted, inconclusive}`).

**Done looks like:** one thread that a reviewer can audit from source to two exports, where every numeric is either
measured-from-the-ledger or an explicit `TODO(open-question)`, and no hypothesis crossed any boundary as a fact.

## What success is NOT
Not large-scale training, not "TTT proven to need new memory", not becoming CAW-01/02/05, not full syntorch/vLLM
integration. See [scope-and-non-goals.md](scope-and-non-goals.md).

## Open questions
- The headline hypothesis itself — *is writeback ever the bottleneck?* — is `wbq-006`, unresolved by design.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) for the full register
  (`wbq-001…006`, ingestion, and export-contract questions).

## Implications for runbooks
- Build the thread store + the three record schemas first; the slice is unbuildable without ADR-0002's separation.
- The v1 milestone is the **single vertical slice above**, not breadth — one claim, one toy experiment (with its
  failure path), one writeback estimate, two exports.

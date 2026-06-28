# GLOSSARY — Ubiquitous Language (CAW-06)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [PRODUCT-BRIEF.md](./PRODUCT-BRIEF.md)
  - [DOC-CONVENTIONS.md](./DOC-CONVENTIONS.md)
  - [ADR-0001 Surface](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [ADR-0002 Hypothesis representation](../01-decisions/ADR-0002-hypothesis-representation.md)
  - [ADR-0003 Experiment ledger](../01-decisions/ADR-0003-experiment-ledger.md)
  - [ADR-0004 Writeback-traffic schema](../01-decisions/ADR-0004-writeback-traffic-schema.md)
  - [ADR-0005 Ingestion](../01-decisions/ADR-0005-source-and-claim-ingestion.md)
  - [ADR-0006 Implication mapping](../01-decisions/ADR-0006-implication-mapping.md)
  - [ADR-0007 Storage & scheduling](../01-decisions/ADR-0007-storage-and-scheduling.md)
  - [ADR-0008 Export boundaries](../01-decisions/ADR-0008-export-boundaries.md)
  - [ttt-landscape.md](../02-research/ttt-landscape.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc fixes the **ubiquitous language** of CAW-06: the exact terms every design doc, ADR, and runbook must
use, with one authoritative definition each. It is a reference, not a decision: where a term encodes a choice the
binding rationale lives in the linked ADR. It does **not** redefine anything fixed by the PRODUCT-BRIEF; it
elaborates and disambiguates. When a term here and an ADR disagree, the ADR wins; when an ADR and the brief
disagree, the brief wins.

Two cross-cutting rules color almost every definition below, so read them first:

- **no-overclaim** — a hypothesis is never presented as a settled claim; everything that crosses a boundary
  carries explicit status + uncertainty (ADR-0002).
- **failures-useful** — negative results are first-class, retained, classified, and surfaced by default
  (ADR-0003).

---

## 1. Core workflow & surface

| Term | Definition |
| --- | --- |
| **ExperimentScout** | The single pipeline core of CAW-06: one **Run** that executes the six stages source discovery → claim extraction → hypothesis generation → small-experiment planning → result logging → implication mapping. Also the persona name for the AI agent that runs it. |
| **ExperimentScout Run** | One invocation of the pipeline core. Idempotent and resumable. Reached through exactly three thin surfaces — scheduled/triggered pipeline, CLI, MCP — that share the one core (ADR-0001). |
| **Research thread** | The unit of value: one tracked chain `source → claim → hypothesis → small experiment → result (incl. failure) → implication`, carrying provenance and explicit uncertainty end-to-end. Persisted in the thread store; the five output artifact kinds are derived from it. |
| **Thread store** | CAW-06's OWN file-based store from which all five artifact kinds are derived. Not shared with any other product. Layout in §7. |
| **Five artifact kinds** | The derived outputs: (1) research-thread records, (2) small-experiment ledger, (3) hypothesis cards, (4) implication maps, (5) writeback-traffic schema bundles (ADR-0001). |

## 2. Source / Claim / Hypothesis (the three record kinds)

These are **three separated record kinds**, never merged. Provenance flows one way: a Source grounds Claims; a
Claim grounds Hypotheses. Crossing a boundary stripped of status/uncertainty is forbidden (ADR-0002).

| Term | Definition |
| --- | --- |
| **Source** | A provenance record for an ingested public artifact (paper, preprint, repo, or an imported CAW-05 radar signal). Holds origin, identifiers, retrieval metadata, and `boundary`. A Source is evidence material — not a claim and not a conclusion. |
| **Claim** | A discrete assertion extracted from one or more Sources, with links back to its Source(s). A Claim is attributed to its source, not authored by CAW-06. Distinct from a hypothesis: a Claim is what a source says; a Hypothesis is what we propose to test. |
| **Hypothesis** | A checkable proposition generated from Claims, carrying a `status`, calibrated `uncertainty`, and evidence links. Defaults to status `hypothesis`. **Never** a settled claim (no-overclaim). Surfaced as a **hypothesis card**. |
| **Hypothesis card** | The rendered artifact form of a Hypothesis: proposition + status + uncertainty + evidence links + the experiment(s) that bear on it. |

### 2.1 Status lifecycle

A **four-state reversible** lifecycle. Default and entry state is `hypothesis`. Transitions are reversible —
new evidence can move a hypothesis back (ADR-0002).

| Status | Meaning |
| --- | --- |
| `hypothesis` | Proposed, not yet adjudicated. Default state. |
| `supported` | Evidence is consistent with the proposition (NOT "proven"). |
| `refuted` | Evidence contradicts the proposition. |
| `inconclusive` | Evidence was sought but does not discriminate. A real, retained outcome — not a gap. |

### 2.2 Uncertainty, confidence & the evidence cap

| Term | Definition |
| --- | --- |
| **Uncertainty / confidence** | A **calibrated qualitative** label on a Hypothesis expressing how strongly evidence bears on it. Qualitative by design; no fabricated numeric scores (mark numeric needs `TODO(open-question)`). |
| **Evidence cap** | A HARD rule: **generated** evidence (a generated summary, an L0 analytic estimate, an LLM rationale) cannot promote `status` or raise confidence past a ceiling. Only external/reproduced evidence can move status. Enforces no-overclaim. |
| **generated-not-evidence** | The principle that any CAW-06-produced summary, rationale, or analytic estimate is explicitly marked **generated** and does NOT count as evidence for promoting a hypothesis or settling a claim. |

## 3. Small-experiment ledger

| Term | Definition |
| --- | --- |
| **Small-experiment ledger** | The append-only record of minimal reproductions / toy experiments. One run = one entry. Stored under `store/ledger/EXP-XXXX` (ADR-0003, ADR-0007). |
| **Small experiment / minimal reproduction** | A toy-scale experiment that checks one claim. v1 scope only — no large-scale or real-at-scale TTT training (brief §11). |
| **Verdict** | A **four-value** outcome of an experiment, gated by a **pre-registered decision rule**: the rule that decides the verdict is fixed before the run. Values: `TODO(open-question: confirm the four verdict labels)` — drawn from supports / refutes / inconclusive / invalid. A verdict bears on a hypothesis's status but is itself subject to the evidence cap. |
| **Pre-registered decision rule** | The success/failure criterion declared in the ledger entry BEFORE execution, so the verdict cannot be retrofitted to the result. |
| **Reproducibility gate** | A HARD gate: an entry is incomplete unless it records **config + seed + env**. No repro metadata → no admissible verdict (ADR-0003). |
| **Negative result** | An experiment that fails or refutes. First-class: retained, classified, and surfaced by default (failures-useful). Never silently discarded. |

## 4. TTT domain terms

| Term | Definition |
| --- | --- |
| **TTT (test-time training)** | Techniques that update model **weights or state during inference** rather than only reading fixed weights. CAW-06's lead theme. Which TTT variants actually write back is itself a research question (ttt-landscape.md). |
| **Test-time compute** | Compute spent at inference time (search, sampling, adaptation). Related to but broader than TTT; relevant where it implies memory write traffic. |
| **Writeback traffic** | Memory traffic generated when inference **writes back** — weight updates, gradients, optimizer state, updated-state reuse. The candidate future **workload axis** for CAW-01 not captured by read-dominant LLM-serving profiles. |
| **Memory-centric hypothesis** | The to-investigate (not settled) proposition that TTT-class workloads need memory-device properties differing from read-dominant inference-serving assumptions. |

## 5. Writeback-traffic schema (the CAW-01 bridge)

LOAD-BEARING. A per-variant **`wbtraffic.v0`** schema, produced as an **analytic L0 estimate** (optionally
grounded by one toy reproduction), exported as a **self-describing bundle lowered onto CAW-01's existing L0
objects + open questions**. It bridges via **export**, not a shared store (ADR-0004).

| Field / term | Definition |
| --- | --- |
| **`wbtraffic.v0`** | The versioned, per-variant schema instance describing a TTT variant's writeback memory characteristics. |
| **Write bandwidth** | Rate of writeback bytes the variant generates (per token / per update). |
| **Write endurance** | Implied write-volume / wear demand on the memory device over a workload. |
| **Near-memory update** | Whether/how state updates occur near or in memory (near-memory / in-memory optimization). |
| **Updated-state residency** | How long and where updated weights/optimizer state must reside and be reused. |
| **Capacity/bandwidth ratio** | How the capacity-to-bandwidth balance shifts over context length and update frequency. |
| **L0 estimate** | A coarse analytic value derived without full integration; **generated-not-evidence** and subject to the evidence cap. |
| **L0/L1 bridge** | The lowering of the wbtraffic bundle onto CAW-01's L0 objects and open questions. Modeled at L0/L1 BEFORE full syntorch/vLLM integration. CAW-01 IR object names are **owned by CAW-01** (separate product) — re-verify; no shared store. |

```yaml
# wbtraffic.v0 — illustrative shape (field semantics fixed by ADR-0004; values are TODO)
schema: wbtraffic.v0
variant: <ttt-variant-id>
grounding: analytic-L0            # or: toy-reproduction
generated: true                   # generated-not-evidence; subject to evidence cap
fields:
  write_bandwidth:        TODO(open-question)
  write_endurance:        TODO(open-question)
  near_memory_update:     TODO(open-question)
  updated_state_residency: TODO(open-question)
  capacity_bandwidth_ratio:
    over_context_length:   TODO(open-question)
    over_update_frequency: TODO(open-question)
boundary: export:caw-01           # lowered onto CAW-01 L0 objects + open questions
```

## 6. Implication mapping

| Term | Definition |
| --- | --- |
| **ImplicationMap** | The model produced one-per-finding mapping a finding's consequences across domains: AI services, education, dev platforms, models, hardware, memory-centric systems (ADR-0006). |
| **Implication-map summary** | The narrative roll-up of an ImplicationMap. Explicitly marked **generated** — not evidence (generated-not-evidence). |

## 7. Storage & scheduling

| Term | Definition |
| --- | --- |
| **File-based store** | CAW-06's OWN store; markdown/JSON per entity; large artifacts by path (ADR-0007). |
| **Store layout** | `store/{sources,claims,hypotheses,ledger/EXP-XXXX,implications}`. |
| **Scheduled / triggered scout** | The automation surface that launches ExperimentScout Runs on a schedule or trigger. Automatic scouting is proposal/hypothesis generation only; Jimmy reviews strategic decisions. |
| **`boundary`** | A required field on every entity recording whether it is internal, imported, or destined for a named export — the no-shared-store contract made data-level. |

## 8. Ports & adapters

Ports & adapters with **documented stubs**: design every seam, build only v1 (brief §9, ADR-0005, ADR-0008).

| Term | Definition |
| --- | --- |
| **SourceAdapter** | Port for ingestion sources. v1 = arXiv/Semantic Scholar + CAW-05 signal import; others are documented stubs. Sits behind the five-stage ingestion pipeline (ADR-0005). |
| **ExperimentRunnerAdapter** | Port for experiment execution. v1 = a minimal local toy-experiment runner; external compute / HW are stubs. |
| **ExportAdapter** | The ONLY export seam; a config-driven registry. No export happens outside an ExportAdapter (ADR-0008). |
| **Caw01WritebackAdapter** | v1 ExportAdapter that lowers the `wbtraffic.v0` bundle + future-workload open questions onto CAW-01. Export, not shared store. |
| **Caw02ClaimAdapter** | v1 ExportAdapter that exports claims + evidence to CAW-02. |
| **Documented stub** | A named-but-unbuilt adapter (e.g. `Caw03Novelty`) with its contract documented so it can be added without redesign. |

### 8.1 Ingestion stages (ADR-0005)

`S1 Discover → S2 Import from CAW-05 → S3 Canonicalize + Dedup → S4 Extract claims → S5 Persist`. One pipeline,
idempotent + resumable, behind the SourceAdapter port.

## 9. The CAW-0X family (cross-product boundaries)

CAW-06 is **independent**. References to siblings are **import/export boundaries** — never a shared store,
registry, or runtime substrate. IR/object names owned by another product are re-verified, not imported.

| Product | Role relative to CAW-06 |
| --- | --- |
| **CAW-01** | Simulation control plane. CAW-06 **exports** the writeback-traffic schema + future-workload open questions to it (L0/L1 bridge). TTT = candidate future workload axis for CAW-01. |
| **CAW-02** | Knowledge repo. CAW-06 **exports** verified claims + evidence to it. |
| **CAW-03** | Novelty (documented-stub export target, e.g. novelty cues). |
| **CAW-05** | Radar. CAW-06 **imports** TTT radar signals from it (S2). |
| **CAW-0X** | Generic placeholder for any sibling product in the six-product `ai-workbench` family. |

## Open Questions

- The four `verdict` labels (§3) — confirm against ADR-0003 wording. `TODO(open-question)`
- Numeric semantics/units for each `wbtraffic.v0` field. `TODO(open-question)`
- Exact CAW-01 L0 object names the bundle lowers onto (owned by CAW-01; re-verify). `TODO(open-question)`
- See [08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- Runbooks MUST use these exact term names (DOC-CONVENTIONS §7). New domain terms get added here first.
- Any artifact that crosses a boundary MUST carry `status` + `uncertainty` and respect the **evidence cap**.
- Generated content MUST be tagged generated (generated-not-evidence) wherever persisted or exported.

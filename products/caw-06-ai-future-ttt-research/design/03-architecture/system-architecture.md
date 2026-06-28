# System Architecture — CAW-06 containers & the ExperimentScout Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./component-boundaries.md](./component-boundaries.md) (module ownership + service signatures)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (one core + three surfaces + five artifacts)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (SourceAdapter, 5 ingest stages)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (file store + scheduler)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (ExportAdapter is the only export seam)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **runtime containers** of CAW-06 and how they connect: the pipeline core (the `ExperimentScout`
Run), the three driving surfaces (scheduler/trigger, CLI, MCP), the three port families (Source / ExperimentRunner /
Export) with their adapters, and the file-based store. It states the **one-way dependency rule** and the
**no-overclaim / no-shared-store invariants** the whole system must hold. It does NOT define module signatures
(see [component-boundaries.md](./component-boundaries.md)), per-artifact schemas (owning ADRs), or runbook steps.

## Container map

CAW-06 is one process family: a **core** library wrapped by **three thin surfaces** and reaching the outside
world only through **three port families** plus its **own file store**. Nothing outside the core decides truth.

```
                          DRIVING SURFACES (thin; no domain logic)
        ┌───────────────┬───────────────────────────┬────────────────────┐
        │ Scheduler /   │            CLI             │     MCP server     │
        │ Trigger       │  (Jimmy + CI, headless)    │ (ExperimentScout   │
        │ (cron v1)     │                            │  agent; proposal-  │
        │               │                            │  only terminals)   │
        └──────┬────────┴─────────────┬──────────────┴─────────┬──────────┘
               │                      │                        │
               ▼                      ▼                        ▼
        ╔═══════════════════════════════════════════════════════════════════╗
        ║                       PIPELINE CORE  (the Run)                     ║
        ║   one resumable pass over six stages; advances research threads    ║
        ║                                                                    ║
        ║  S1 discover → S2 import → S3 dedup → S4 extract → ── (ingest) ──┐ ║
        ║                                                                  │ ║
        ║   ┌──────────────┴──────────────────────────────────────────────┘ ║
        ║   ▼                                                                ║
        ║  S5 hypothesize → S6 plan-experiment → S7 run+log → S8 implication ║
        ║                                              → S9 export(propose)  ║
        ║                                                                    ║
        ║  GOVERNANCE LIVES HERE: status floor=hypothesis, confidence ≤      ║
        ║  evidence cap, generated≠evidence, reproducibility gate, review    ║
        ║  gate, provenance stamping, per-target export gates                ║
        ╚══╦═══════════════╦══════════════════╦══════════════════╦══════════╝
           │ SourceAdapter │ ExperimentRunner │  ExportAdapter   │ (ports;
           │  (port)       │  Adapter (port)  │   (port)         │  Protocols)
           ▼               ▼                  ▼                  ▼
   ┌───────────────┐ ┌──────────────┐ ┌───────────────────┐ ┌──────────────┐
   │ Arxiv /       │ │ LocalToy     │ │ Caw01Writeback /  │ │  FILE STORE  │
   │ SemanticS. /  │ │ Runner v1;   │ │ Caw02Claim v1;    │ │  store/...   │
   │ CAW05Import   │ │ ext-compute/ │ │ Caw03Novelty /    │ │  (CAW-06's   │
   │ v1; stubs     │ │ HW stubs     │ │ HttpExport stubs  │ │   OWN)       │
   └──────┬────────┘ └──────────────┘ └─────────┬─────────┘ └──────────────┘
          │ import (read-only, across boundary)  │ one-way push (file drop v1)
          ▼                                      ▼
   ┌──────────────┐                       ┌──────────────────────────────┐
   │ CAW-05       │                       │ CAW-01 (writeback schema +    │
   │ (separate    │                       │ open questions) / CAW-02      │
   │  product)    │                       │ (claims+evidence) — separate  │
   │ action-brief │                       │ products, their OWN stores    │
   └──────────────┘                       └──────────────────────────────┘
```

## Containers

| # | Container | Kind | Responsibility | Owns / boundary |
|---|---|---|---|---|
| 1 | **Pipeline core (the Run)** | library | the 9-stage `ExperimentScout` Run; advances threads; holds ALL governance | core domain |
| 2 | **Scheduler / Trigger** | surface | fires periodic Run (cron v1) or an on-demand single-thread Run | fires only; no catch-up logic |
| 3 | **CLI** | surface | thin wrapper over the core op-set; default headless surface | no domain logic |
| 4 | **MCP server** | surface | same op-set as MCP tools for the agent; **mutating terminals are proposal-only** | no domain logic |
| 5 | **Source adapters** | port impl | fetch + provenance + rate-limit; no extraction/ranking | `SourceAdapter` Protocol |
| 6 | **ExperimentRunner** | port impl | run a minimal reproduction under a pre-registered rule | `ExperimentRunnerAdapter` Protocol |
| 7 | **Export adapters** | port impl | validate (gate) + emit bundles one-way; receipts | `ExportAdapter` Protocol |
| 8 | **File store** | data | CAW-06's OWN markdown/JSON store; threads, ledger, exports | `store/...` (ADR-0007) |

The **Run wrapper** owns single-flight lock, cursor catch-up, per-stage checkpoints, and the run-receipt
heartbeat — because cron (the v1 scheduler) supplies none of these (ADR-0001 §B). The scheduler only **fires**.

## The Run: stage → service → port → store

| Stage | Service (core) | Port used | Writes to store | Anti-overclaim hook |
|---|---|---|---|---|
| S1 discover | Ingest | SourceAdapter | `sources/` | provenance complete; legal-mode |
| S2 import (CAW-05) | Ingest | SourceAdapter (`CAW05Import`) | `sources/` | CAW-05 prose `evidence:false` |
| S3 canonicalize+dedup | Ingest | — | `sources/` | one Source, many provenance |
| S4 extract claims | Ingest | — | `claims/` | extractive only; `status=unverified` |
| S5 hypothesize | Hypothesis | — | `hypotheses/` | status floor=`hypothesis`; confidence ≤ evidence cap |
| S6 plan-experiment | Experiment | — | `ledger/EXP-XXXX` | pre-registered decision rule |
| S7 run + log result | Experiment | ExperimentRunnerAdapter | `ledger/EXP-XXXX` | reproducibility gate (config+seed+env); negatives retained |
| S8 map implications | Implication | — | `implications/` | summary marked `generated` (not evidence) |
| S9 export (propose) | Export + Writeback | ExportAdapter | `exports/` (receipts) | per-target gate; review gate; null+basis numbers |

Ingestion (S1–S4) **stops at persist and never enters S5** (ADR-0005 §1). S9 from a surface is a **proposal**; only
the core, after the human review gate, performs the actual emit (ADR-0001 §4, ADR-0008 §3).

## One-way dependency rule

Dependencies point **inward and downward only**. The arrow is the allowed `import`/`call` direction:

```
surfaces ──▶ core op-set ──▶ ports (Protocols) ──▶ adapters ──▶ outside / store
```

- **Surfaces depend on the core; the core never depends on a surface.** A surface may only call vetted typed ops.
- **The core depends on port Protocols, never on a concrete adapter.** Adapters are bound by a config-driven
  registry (`sources.yaml`, runner config, export registry). Swapping arXiv→Github or file-drop→HTTP touches no
  core code.
- **Adapters depend on the outside world; the outside world never reaches into the core.** Imports arrive only as
  `SourceAdapter.fetch()` results; exports leave only as `ExportAdapter.emit()` pushes.
- **No surface-local domain rule.** If a surface needs logic the op-set lacks, extend the op-set, not the surface
  (ADR-0001 revisit trigger). A surface-local rule is a contract leak — especially any that could weaken an
  anti-overclaim invariant.

Forbidden edges: surface→adapter (bypassing core governance); adapter→core internals; any product→CAW-06 store.

## System invariants (machine-checkable where possible)

| Invariant | Where enforced | How it holds |
|---|---|---|
| **No overclaim** — a hypothesis is never a settled claim | core (Hypothesis svc + export gates) | status floor=`hypothesis`; `confidence ≤ evidence_strength`; CAW-02 gate rejects `status:hypothesis` |
| **Generated ≠ evidence** | core | generated paraphrase/summary marked `evidence:false`; CAW-02 bundle carries explicit `not_evidence[]` |
| **Evidence cap** — generated evidence cannot promote status | core (Hypothesis svc) | hard cap; only ledger results / external sources promote |
| **Reproducibility gate** | core (Experiment svc) | a ledger entry without config+seed+env is invalid; verdict gated by a pre-registered rule |
| **Failures useful** | core + store | negative results retained, classified, surfaced by default (`negative-results` view) |
| **No shared store** | ports + store | imports read CAW-05 across a file/API boundary; exports are one-way pushes; CAW-06 never writes another product's store, never reads back |
| **Self-describing bundles** | Export adapters | `schema_version`+`producer`+`content_hash` travel in-band; no shared registry between products |
| **Human gate on terminals** | core | promote-to-`supported`, export-to-CAW-02, commit-writeback-to-CAW-01 create a pending gate event; agent never executes the terminal route |
| **No invented numbers** | Writeback svc + CAW-01 adapter | numeric fields default `null` with `basis: TODO(open-question)`; modeled flagged distinctly from measured |

## No-shared-store boundary detail

CAW-06 touches exactly two other products, both across explicit boundaries — **never a shared substrate**:

- **Inbound (CAW-05, a separate product):** read-only import of the `action-brief` bundle via file drop / pull.
  Treated public, provenance-bearing, **non-evidential**. An `open_question` becomes a seed `CandidateClaim`
  (`status=unverified`), never `supported` (ADR-0005 §6). CAW-06 reuses CAW-05's adapter *shape* for family
  consistency; the adapter code is CAW-06's OWN.
- **Outbound (CAW-01 / CAW-02, separate products):** **one-way push** of a self-describing `ExportBundle`. CAW-06
  records a local receipt against the thread and gets no read-back. CAW-01 receives the `wbtraffic.v0` schema +
  open questions (questions, not assertions about its IR); CAW-02 receives claim+evidence+uncertainty. CAW-01 IR
  object names are **owned by CAW-01** — re-verify at the boundary; do not assume a shared schema (ADR-0004).

## Open Questions
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects surface `status` contract — ADR-0001.)
- TODO(open-question: heartbeat / dead-man's-switch sink given no shared substrate — local "no receipt in N days" vs external service?)
- TODO(open-question: file-drop vs HTTP v1 transport + agreed drop location/auth per receiving product — ADR-0008.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: Run wrapper + thread lifecycle (lock, cursor, checkpoints, heartbeat) — the container that holds governance.
- RB: the three surfaces over one op-set (scheduler fires only; CLI; MCP proposal-only terminals).
- RB: adapter registries (`sources.yaml`, runner config, export registry) + documented stubs reporting `deferred`.
- RB: store layout + receipt storage (ADR-0007) — CAW-06's OWN store, no external reach-in.

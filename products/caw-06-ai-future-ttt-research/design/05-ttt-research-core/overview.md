# TTT Research Core — Overview

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./experiment-scout-pipeline.md](./experiment-scout-pipeline.md) (the Run + ingestion stages)
  - [./hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty.md) (the anti-overclaim contract)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc describes **what the TTT Research Core is**: the single pipeline core — the `ExperimentScout` Run —
behind CAW-06's three thin surfaces, plus the **folder map** of the core's stages and the **thread store** it
reads and writes. It is the orientation doc for the `05-ttt-research-core/` group; the mechanics of the Run live
in [experiment-scout-pipeline.md](./experiment-scout-pipeline.md) and the hypothesis/uncertainty contract lives in
[hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty.md). It does NOT define the experiment ledger schema
(ADR-0003), the writeback-traffic schema (ADR-0004), implication mapping (ADR-0006), storage serialization or
scheduling internals (ADR-0007), or the export adapters (ADR-0008) — it cross-links them as a stable boundary.

## 1. What the core is

The core is **one resumable pipeline** that advances **research threads**. A thread is the durable unit of value
(brief §2):

```
source → claim → hypothesis → small experiment → result (incl. failure) → implication
```

Everything else — the scheduled/triggered pipeline, the CLI, the MCP server, and the five output artifact kinds —
is a thin surface or a rendering over this one core (ADR-0001). The core, not any surface, owns the
**anti-overclaim invariants**: the three-layer `Source`/`Claim`/`Hypothesis` separation, the `status`
default-to-`hypothesis` floor, the `confidence ≤ evidence_strength` cap, the rule that **generated evidence can
never promote a status**, provenance stamping, the failures-first ledger discipline, and the per-target export
gate. A surface may *request* a route; only the core, after the human review gate, performs a promotion or export.

### Core responsibilities (and explicit non-responsibilities)

| The core DOES | The core does NOT |
|---|---|
| Advance threads through the six scout stages | Run real TTT at scale (v1 = minimal reproductions only) |
| Enforce status/uncertainty on every hypothesis | Assert settled claims about future AI |
| Keep sources, claims, evidence, generated text separate | Treat generated summaries as evidence |
| Retain negative results and surface them by default | Discard or hide failures |
| Stamp provenance + `boundary` on every record | Share a runtime/store with CAW-01/02/05 |
| Emit export bundles across explicit seams | Auto-promote or auto-export (Jimmy reviews) |

## 2. The Run and the three surfaces

A `Run` is one resumable pass over the six stages, with per-stage checkpoints, a single-flight lock, cursor-based
catch-up, and a run-receipt heartbeat. A crash resumes at the last completed stage; re-running a completed
thread-stage is a no-op (ADR-0001). The three surfaces drive the **same vetted typed op-set**:

| Surface | Driver | Role | Notes |
|---|---|---|---|
| Scheduled/triggered pipeline | `SchedulerAdapter` (cron v1) | periodic + on-demand Runs | scheduler only *fires*; catch-up/overlap/heartbeat in the Run wrapper |
| CLI | Jimmy + CI | headless run/inspect | `run`, `status`, `show-thread`, `negative-results`, `confirm`, `export` |
| MCP server | the ExperimentScout agent | discover/extract/propose/draft | **mutating-terminal ops are proposal-only** — agent never adjudicates |

## 3. The six scout stages (the Run)

Detailed in [experiment-scout-pipeline.md](./experiment-scout-pipeline.md). Summary:

| # | Stage | Owns | Output record(s) |
|---|---|---|---|
| 1 | Discover | source discovery + CAW-05 import (5-stage ingestion) | `Source`, `CandidateClaim` |
| 2 | Extract claims | extractive, attributable claims | `Claim` |
| 3 | Hypothesize | propose checkable hypotheses (default `status=hypothesis`) | `Hypothesis` |
| 4 | Plan reproduction | design a minimal toy experiment + pre-registered decision rule | experiment plan |
| 5 | Log result | append-only ledger entry; verdict → `Evidence` (failures first-class) | ledger entry, `Evidence` |
| 6 | Map implications | typed, uncertainty-tagged implications by domain; route to exports | `ImplicationMap` |

Stage 1 internally is the **5-stage ingestion sub-pipeline** (S1 Discover → S2 Import from CAW-05 →
S3 Canonicalize+Dedup → S4 Extract claims → S5 Persist), idempotent + resumable (ADR-0005). Stage 2 above is the
scout-level claim consolidation that feeds the hypothesis stage.

## 4. Five output artifacts (renderings over one thread store)

All five are **views/derivations of one provenance-stamped thread** (ADR-0001 §5), markdown/JSON-first:

| Artifact | What it renders | Owning decision |
|---|---|---|
| Research-thread record | the spine: source→…→implication chain + provenance + `boundary` | ADR-0001 |
| Small-experiment ledger entry | one toy reproduction run + verdict; failures retained | ADR-0003 |
| Hypothesis card | a `Hypothesis` that MUST show `status` + `confidence` + run history | ADR-0002 |
| Implication map | stage-6 fan-out of typed implications by domain | ADR-0006 |
| Writeback-traffic schema artifact | the `wbtraffic.v0` bundle, the CAW-01 L0/L1 bridge | ADR-0004 |

## 5. Folder map

The core's design folder and the runtime store it operates on (store layout fixed by ADR-0007):

```
design/05-ttt-research-core/
├── overview.md                      ← this doc
├── experiment-scout-pipeline.md     ← the 6-stage Run + 5-stage ingestion
└── hypothesis-and-uncertainty.md    ← 3 record kinds + 4-state lifecycle + caps

store/                               (CAW-06's OWN file-based store — ADR-0007; no shared substrate)
├── sources/        SRC-XXXX.{md,json}    ← deduped sources + provenance (multi-origin)
├── claims/         CLM-XXXX.{md,json}    ← extractive, attributable CandidateClaim / Claim
├── hypotheses/     HYP-XXXX.{md,json}    ← Hypothesis records (status/confidence/status_log)
├── ledger/
│   └── EXP-XXXX/    entry.json + config + seed + env + artifacts/   ← append-only experiment runs
├── implications/   IMP-XXXX.{md,json}    ← ImplicationMap (one per finding)
└── export/         outbound bundles (wbtraffic.v0 → CAW-01; claims+evidence → CAW-02)
```

`Evidence` records cross-reference a `Hypothesis` and (when `evidence_kind=experiment`) a `ledger/EXP-XXXX` entry;
serialization specifics are owned by ADR-0007.

## 6. Ports & adapters seams

Built v1, the rest documented stubs (brief §9; ADR-0001 §6, ADR-0008):

| Port | v1 adapters | Stubs (Protocol + `HealthStatus="deferred"`) |
|---|---|---|
| `SourceAdapter` | `ArxivAdapter`, `SemanticScholarAdapter`, `CAW05ImportAdapter` | `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` |
| `ExperimentRunnerAdapter` | minimal local toy-experiment runner | external compute / HW runners |
| `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, … |

## 7. The writeback → CAW-01 bridge (export, not shared store)

The product's strategic payload is the **writeback-traffic schema** (ADR-0004): a per-variant `wbtraffic.v0`
estimate — write bandwidth, write endurance, near-memory update, updated-state residency, capacity/bandwidth-ratio
over context/update frequency — produced as an **analytic L0 estimate** (optionally grounded by one toy
reproduction) and **exported as a self-describing bundle lowered onto CAW-01's existing L0 objects + open
questions**. This is an **export across an explicit boundary**, not a shared substrate: CAW-01 is a separate
product, owns its own IR object names, and re-verifies on its side. The writeback claim itself is a tracked
`Hypothesis`, never a premise (brief §6; ADR-0002). `TODO(open-question: which TTT variants actually write back —
needs the first research run.)`

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

- `TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects status contract.)`
- `TODO(open-question: heartbeat/dead-man's-switch sink given "no shared substrate" — local vs external?)`
- `TODO(open-question: can writeback traffic be modeled at L0/L1 before full syntorch/vLLM integration? — lean: yes, ADR-0004.)`

## Implications for runbooks

- Scaffold `store/` with the layout in §5 before any stage logic; leave it green at each checkpoint.
- The Run wrapper (lock/cursor/heartbeat/checkpoint) is one runbook; the five artifact renderers another.
- Every renderer reads the thread store; none holds invariants — the core does (ADR-0001 governance rule).

# Data Flow — the ExperimentScout Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./tech-stack.md](./tech-stack.md), [./repo-structure.md](./repo-structure.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (one pipeline core, three surfaces, five artifacts)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (S1–S5 ingestion)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (status/uncertainty)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (one run = one append-only entry)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping.md) (ImplicationMap)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (wbtraffic.v0 + CAW-01 bridge)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (file store + scheduling)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (ExportAdapter seam)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describes the **end-to-end data flow of one ExperimentScout Run** — how a research thread moves from source
discovery, through claim extraction, hypothesis generation, a toy experiment, result logging (including failure),
implication mapping, and `wbtraffic.v0` production, to an export across a product boundary. It describes *the
path data takes and where it is persisted*; it does NOT redefine the record schemas (those are owned by the ADRs
linked above) and does NOT decide tooling (see [tech-stack.md](./tech-stack.md)) or layout
([repo-structure.md](./repo-structure.md)).

This is **elaboration of fixed decisions**, never redefinition. Two invariants govern every arrow below:
**no overclaim** (a hypothesis is never emitted as a settled claim; a *modeled* number is never emitted as a
*measured* one) and **failures are first-class** (every run produces a durable, discoverable record, success or
not).

## The Run at a glance

A Run is one pass of the pipeline core (ADR-0001) over zero-or-more threads. It is invoked by any of the three
thin surfaces — **scheduled/triggered pipeline**, **CLI**, **MCP** — which all enter the same core. Each stage
reads from and writes to CAW-06's OWN file store (ADR-0007); nothing is shared with another product.

```
                       SURFACES (thin; one core)
        ┌────────────────┬─────────────────┬──────────────────┐
        │ scheduled /    │      CLI         │      MCP         │
        │ triggered      │  (run/inspect)   │ (run/inspect)    │
        └───────┬────────┴────────┬─────────┴────────┬─────────┘
                └─────────────────┼──────────────────┘
                                  v
   ============================ PIPELINE CORE (the Run) ============================

   [S1 DISCOVER]        SourceAdapter(arXiv / Semantic Scholar)
        │               FetchCursor watermark  ──► store/cursors/
        v
   [S2 IMPORT]          SourceAdapter(CAW-05 signal) — file drop / pull
        │               (CAW-05 is a SEPARATE product; signal != our claim)
        v
   [S3 CANONICALIZE     dedup by DOI/arXiv-id/content-hash
       + DEDUP]         ──► store/sources/SRC-XXXX.{md,json}   (provenance)
        │
        v
   [S4 EXTRACT CLAIMS]  CandidateClaim per source span
        │               ──► store/claims/CLM-XXXX.{md,json}    (status-bearing)
        v
   [S5 PERSIST]         thread opened/extended: source→claim
        │               ──► store/threads/THR-XXXX (index of refs)
        v
   [H GENERATE          Hypothesis @ status=hypothesis, confidence=very-low
      HYPOTHESES]       ──► store/hypotheses/HYP-XXXX.{md,json}  (status_log)
        │               (generated; never auto-promoted — ADR-0002/0007 gate)
        v
   [E PLAN + RUN        pre-register decision rule  ──► ledger entry (open)
      TOY EXPERIMENT]   ExperimentRunnerAdapter(PyTorch toy)
        │               repro gate: config + seed + env captured
        v               artifacts (metrics/logs/plots) by path ──► artifacts/EXP-XXXX/
   [R LOG RESULT]       ONE run = ONE append-only entry; four-value verdict
        │  ┌──────────────────────────────┐
        │  │ verdict ∈ {supports, refutes, │  negative + invalid results RETAINED
        │  │  inconclusive, invalid}       │  and surfaced by default (failures useful)
        │  └──────────────────────────────┘
        │               ──► store/ledger/EXP-XXXX/entry.{md,json}
        │               proposes StatusEvent on the hypothesis (review-gated)
        v
   [M MAP IMPLICATIONS] ImplicationMap (one per finding) across domains
        │               summary marked GENERATED (not evidence)
        │               ──► store/implications/IMP-XXXX.{md,json}
        v
   [W PRODUCE           wbtraffic.v0: analytic L0 estimate from variant params
      WRITEBACK SCHEMA] + assumptions; numerics default null (modeled != measured)
        │               optionally grounded by one toy reproduction (E/R above)
        │               ──► store/writeback/WBT-XXXX.{md,json}
        v
   [X EXPORT]           ExportAdapter (ONLY export seam) — validate() gate BEFORE write
        │   ├─ Caw01WritebackAdapter ─► wbtraffic.v0 + open-questions  ──► file drop ─► CAW-01
        │   └─ Caw02ClaimAdapter     ─► claim + evidence (status != bare hypothesis) ─► CAW-02
        │               receipts ──► store/exports/  (failed export logged; finding stays exportable)
        v
   ============================ end of Run ============================
```

## Stage-by-stage

| # | Stage | Input | Output (store path) | Governing ADR | Idempotency key |
|---|---|---|---|---|---|
| S1 | Discover | query + `FetchCursor` | `store/sources/` (raw refs) | ADR-0005 | `FetchCursor` watermark |
| S2 | Import (CAW-05) | signal bundle (file drop) | `store/sources/` (tagged import) | ADR-0005 | last `bundle_id` |
| S3 | Canonicalize + dedup | raw refs | `store/sources/SRC-XXXX` | ADR-0005/0007 | DOI / arXiv-id / `content_hash` |
| S4 | Extract claims | canonical source | `store/claims/CLM-XXXX` | ADR-0005 | (source_id, span_hash) |
| S5 | Persist thread | source+claim refs | `store/threads/THR-XXXX` | ADR-0007 | thread_id |
| H | Generate hypotheses | claim(s) | `store/hypotheses/HYP-XXXX` | ADR-0002 | (claim_id, hypothesis_hash) |
| E | Plan + run experiment | hypothesis + decision rule | `artifacts/EXP-XXXX/` | ADR-0003 | EXP id (one run = one entry) |
| R | Log result | run artifacts + verdict | `store/ledger/EXP-XXXX/` | ADR-0003 | EXP id (append-only) |
| M | Map implications | finding (verdict) | `store/implications/IMP-XXXX` | ADR-0006 | (finding_id) |
| W | Produce wbtraffic.v0 | variant params + ledger | `store/writeback/WBT-XXXX` | ADR-0004 | (variant, content_hash) |
| X | Export | bundle | `store/exports/` (receipts) | ADR-0008 | `bundle_id` + `content_hash` |

### S1–S5 Ingestion (idempotent, resumable)
The five ingestion stages run behind the **SourceAdapter** port (ADR-0005). They are **idempotent and
resumable**: each adapter persists a `FetchCursor` (S1: arXiv resumptionToken / Semantic Scholar page; S2: last
CAW-05 `bundle_id`) so a re-run never re-imports or duplicates. Dedup (S3) collapses the same paper arriving via
two adapters into one `Source` by DOI / arXiv-id / content-hash. **A CAW-05 signal is an import, not our
judgment** — it is tagged at the boundary and never conflated with a CAW-06 claim or verdict.

### H Generate hypotheses (no overclaim, no auto-promote)
Extraction yields `CandidateClaim`s; hypothesis generation produces `Hypothesis` records that **default to
`status=hypothesis`, `confidence=very-low`** (ADR-0002). The four-state lifecycle (hypothesis / supported /
refuted / inconclusive) is reversible. The scout is **proposal-only** (ADR-0007 §6): it may *propose* a
`StatusEvent`, but promotion to `supported` requires Jimmy's review via the review queue. **Generated evidence
cannot promote status** (hard evidence cap, ADR-0002).

### E + R Plan, run, and log (failures first-class)
Before launch a **decision rule is pre-registered** (ADR-0003), so the verdict cannot be rationalized after the
fact. The run passes through the **ExperimentRunnerAdapter** (v1 = a local PyTorch toy runner; see
[tech-stack.md](./tech-stack.md)). A **hard reproducibility gate** captures config + seed + env; an entry that
cannot satisfy it is recorded `invalid`, not silently dropped. **One run = one append-only ledger entry**, even
on crash (→ `invalid`/`aborted`). The four-value verdict is `{supports, refutes, inconclusive, invalid}`.
**Negative and invalid results are retained, classified, and surfaced by default** — the negative-results view is
built from them. Large artifacts live under `artifacts/EXP-XXXX/` by path; the ledger entry references them.

### M Map implications (summary != evidence)
One `ImplicationMap` per finding (ADR-0006) projects the result across domains: AI services, education, dev
platforms, models, hardware, memory-centric systems. The map's narrative summary is **explicitly marked
generated** and is **not evidence**; it never crosses a boundary as a claim.

### W Produce wbtraffic.v0 (the CAW-01 bridge payload)
For a TTT variant, the **analytic L0 estimator** (ADR-0004 Option A) computes `bytes_per_update`, `write_bw`, and
the `ratio_curve` from the variant's fast-weight params + listed `assumptions`. **Every numeric defaults to
`null`**; a `null` that matters becomes `TODO(open-question: …)`, never an invented number. If a toy reproduction
(E/R) measured a value, it fills the field and is flagged **measured** (distinct from **modeled**). The artifact
carries mandatory `provenance` + `uncertainty` (ADR-0002). A modeled estimate can **never** be `supported` on its
own (modeled ≠ measured; generated ≠ evidence).

### X Export (the only seam; gate before write; no shared store)
All output leaves through the single **ExportAdapter** port (ADR-0008). `validate()` runs the **per-target gate
BEFORE any write**:

| Target | Adapter | Admits | Rejects |
|---|---|---|---|
| CAW-01 | `Caw01WritebackAdapter` | implication in `{memory-centric-systems, hardware}` with a `writeback_payload` OR a typed open question | items with no writeback/workload relevance |
| CAW-02 | `Caw02ClaimAdapter` | `status ∈ {supported, refuted, inconclusive}` + ≥1 `evidence_ref` + provenance | bare `hypothesis`; summary-only items |

The CAW-01 bundle is a **self-describing** `wbtraffic.v0` payload **plus a first-class `open_questions[]`** —
CAW-01 receives *questions, not assertions about its IR*. **This is an export across a file boundary, not a
shared store**: CAW-06 never writes into CAW-01's (or CAW-02's) store, assumes no shared registry, and gets no
read-back (one-way push). Receipts land in `store/exports/`; a **failed/rejected export is logged first-class and
the finding stays exportable** for a later retry.

## Data persistence & resumption
Every stage writes to CAW-06's OWN file store (ADR-0007), **append-only with supersede** — corrections add a new
record/`StatusEvent`, never edit in place. An optional derived index (rebuildable, disposable) powers thread and
negative-results queries; the files remain canonical. Because each stage has an idempotency key (table above) and
persists a cursor, an **interrupted Run resumes cleanly** from the last durable record.

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md). Flow-relevant:
- `TODO(open-question: concurrency — can two scheduled Runs touch the same thread; per-thread file locks? — ADR-0007)`
- `TODO(open-question: does every ExperimentRunnerAdapter launch — even out-of-band manual runs — force a ledger entry, to de-bias silent drops? — ADR-0003)`
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals? — ADR-0006/0008)`
- `TODO(open-question: retention/GC for large failure artifacts under artifacts/EXP-XXXX — ADR-0007)`

## Implications for runbooks
- One runbook per stage boundary; each leaves the tree green and persists its idempotency key/cursor.
- The E→R boundary MUST create a ledger entry on launch (before the verdict) so a crash cannot drop the run.
- The W and X runbooks MUST keep `modeled` vs `measured` flags and `null`+`basis` intact end-to-end.
- The export runbook MUST run `validate()` (gate) before any write and store a receipt regardless of outcome.

# ExperimentScout Pipeline — scheduled/triggered Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§4 surfaces, §5 stages, §12 reviewer guardrail)
  - [./cli-and-mcp.md](./cli-and-mcp.md) (the surfaces that drive this Run)
  - [./outputs.md](./outputs.md) (what each stage emits)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (Run granularity)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (S1–S5 ingestion + FetchCursor)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (reproducibility gate, verdicts)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (scheduling + store)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describe the **one pipeline core** — the `ExperimentScout` `Run` — as a **scheduled and triggered, resumable**
pass that advances research threads through the six stages, and how it **handles failure** without losing work or
overclaiming. It does NOT define the CLI/MCP op-set ([cli-and-mcp.md](./cli-and-mcp.md)), the artifact schemas
([outputs.md](./outputs.md)), or the ingestion adapter contracts (ADR-0005) — it orchestrates them.

## What a Run is
A **Run** is one resumable pass over the six stages, advancing one or many **threads** (the durable unit; the Run
is transient). A thread is `source → claim → hypothesis → small experiment → result (incl. failure) →
implication`, with provenance, `status`/`uncertainty`, and `boundary` (brief §2, §7).

```text
S1 discover ─► S2 import(CAW-05) ─► S3 canonicalize+dedup ─► S4 extract-claims ─► S5 persist
   (the FIVE ingestion stages, ADR-0005)
        │
        ▼  per-thread, on demand or scheduled (the SIX scout stages, ADR-0001 §5):
  discover ─► extract ─► hypothesize ─► plan-repro ─► log-result ─► map-implications
```

The ingestion sub-pipeline (S1–S5, ADR-0005) feeds the discover/extract stages; the experiment + implication
stages run per-thread when a claim becomes checkable.

## Triggering

| Trigger | Source | Scope | Notes |
|---|---|---|---|
| **Scheduled** | `SchedulerAdapter` (cron v1) reads `sources.yaml` per-adapter schedule | full ingestion + advance ready threads | the periodic scout (brief §4) |
| **CAW-05 import** | a writeback/radar **bundle arrival** (file drop / pull) from CAW-05, a separate product | open/advance one thread | enqueue + optional `--now` (ADR-0001 OQ) |
| **CLI/MCP invoke** | `caw06 run [--thread ID] [--now]` / `scout.run` | one thread or full pass | on-demand |

The scheduler only **fires**. Catch-up, overlap-prevention, cursor advance and the heartbeat all live in the **Run
wrapper**, so the pipeline is correct even on plain OS cron (ADR-0001 §2; ADR-0007 §5).

## Resumability
Per ADR-0001 §1 and ADR-0007 §2/§4:

- **Per-stage checkpoints.** Each thread records its last completed stage. A crash resumes at the next stage; a
  re-run of an already-`done` thread-stage is a **no-op** (idempotent).
- **FetchCursor watermarks.** Each ingestion adapter persists an opaque `FetchCursor` (arXiv resumptionToken,
  Semantic Scholar page, last CAW-05 `bundle_id`) so scheduled re-runs are incremental and never re-import dupes
  (ADR-0005; ADR-0007 §4).
- **Single-flight lock.** A Run takes a lock; an overlapping scheduled fire is skipped (or catches up), not run
  concurrently. TODO(open-question: per-thread file locks vs one global lock — ADR-0007 OQ on concurrency.)
- **Run receipt / heartbeat.** Each Run writes a receipt (start, stages completed, threads touched, end/verdict).
  A "no receipt in N days" check is the dead-man's-switch. TODO(open-question: heartbeat sink given no shared
  substrate — local check vs external — ADR-0001 OQ.)
- **Append-only + supersede.** Nothing is edited in place; corrections supersede via `lineage`/`status_log`. An
  interrupted Run leaves the store consistent because every stage only appends (ADR-0007 §2).

## Stage responsibilities & emitted records

| Stage | Reads | Emits (→ [outputs.md](./outputs.md)) | Failures-useful / no-overclaim rule |
|---|---|---|---|
| discover (S1–S3) | sources, CAW-05 bundles | `Source` records, dedup lineage | canonicalize+dedup before persist; dropped dupes logged |
| extract (S4) | sources | `CandidateClaim`s | claims kept separate from hypotheses (ADR-0002) |
| hypothesize | claims | `Hypothesis` at `status=hypothesis`, `confidence=very-low` | floor state; never auto-promoted (brief §12) |
| plan-repro | hypothesis | pre-registered decision rule + repro config | reproducibility gate: config+seed+env required (ADR-0003) |
| log-result | experiment run | **one append-only ledger entry per run** | crash/abort still writes an entry (`invalid`/`aborted`); negatives retained |
| map-implications | finding | `ImplicationMap` (summary marked `generated`) | generated summary is NOT evidence (ADR-0006, brief §12) |

## Failure handling

| Failure class | Detection | Pipeline response |
|---|---|---|
| **Transient** (network, rate-limit, 5xx) | typed adapter error | retry with backoff; respect adapter `rate_limit`; cursor not advanced past the gap |
| **Terminal** (auth, schema, parse) | typed adapter error | halt that adapter, write to run receipt, surface in `caw06 status`; other adapters/threads continue |
| **Experiment crash/abort** | runner exit / timeout | **always write a ledger entry** with verdict `invalid`/`aborted` (ADR-0003) — never a silent drop |
| **Non-reproducible run** | missing config/seed/env | blocked by the reproducibility gate; entry recorded as `invalid` with reason |
| **Mid-Run crash** | no end receipt | next Run resumes at last checkpoint; partial appends are valid; no duplicate via cursor + no-op |
| **Ambiguous result** | decision rule not decisive | verdict `inconclusive`; status stays/returns toward `hypothesis`; surfaced for review |

Core discipline: **failures are first-class** (brief §5). A failed experiment, a refuted hypothesis, and a halted
adapter are all durable, classified, and surfaced — `caw06 negative-results` shows them by default
([cli-and-mcp.md](./cli-and-mcp.md)).

## The review gate inside the Run
The Run **proposes**; it never adjudicates (brief §12; ADR-0007 §6). Concretely, a Run may:
create hypotheses at the floor state, propose `StatusEvent`s from ledger verdicts, build implication maps, and
**stage** export bundles. It may **never** apply a promotion to `supported` or emit a `supported` export — those
land in the review queue for Jimmy ([cli-and-mcp.md](./cli-and-mcp.md) §human gate). Generated evidence can never
promote status (the hard evidence cap, ADR-0002).

## Sequence (scheduled pass, abbreviated)

```text
cron fire ─► Run.acquire_lock()
  ├─ for adapter in sources.yaml: S1–S5 with FetchCursor (skip on rate-limit)
  ├─ for thread in ready(threads):
  │     advance(last_stage+1 … map-implications)   # each stage append-only, checkpointed
  │     on experiment: ALWAYS write ledger entry (incl. failure)
  │     on verdict: propose StatusEvent → review queue (no auto-promote)
  ├─ write Run receipt (heartbeat)
  └─ release_lock()
```

## Open Questions
- TODO(open-question: Run = one synchronous process vs resumable stage-jobs with a handle — affects `status`
  contract; ADR-0001.)
- TODO(open-question: CAW-05 import → immediate single-thread Run vs enqueue for next pass; lean enqueue + `--now`.)
- TODO(open-question: scheduler host — long-running daemon vs OS cron invoking a CLI entrypoint; ADR-0007.)
- TODO(open-question: per-thread locking for concurrent scheduled runs; ADR-0007.)
  See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: Run wrapper owning lock + checkpoint + cursor advance + receipt/heartbeat (cron only fires).
- RB: every experiment launch writes a ledger entry before doing work, so a crash cannot drop a result.
- RB: typed adapter error taxonomy (transient/terminal) driving retry-vs-halt.
- RB: stage outputs append-only; resolver computes "current" views; index rebuildable (ADR-0007).

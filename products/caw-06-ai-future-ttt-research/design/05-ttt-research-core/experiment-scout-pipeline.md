# ExperimentScout Pipeline — the Run + ingestion stages

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./overview.md](./overview.md) (what the core is + folder map)
  - [./hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty.md) (status/uncertainty contract)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (the Run)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (the 5-stage ingestion)
  - [../02-research/source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion.md) (narrative)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (stage-5 verdict)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping.md) (stage-6)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc describes **how the `ExperimentScout` Run advances a thread**: the **six scout stages**
(`discover → extract → hypothesize → plan-repro → log-result → map-implications`) and the **five-stage ingestion
sub-pipeline** that sits inside the discover stage (`S1 Discover → S2 Import from CAW-05 → S3 Canonicalize+Dedup →
S4 Extract claims → S5 Persist`). It fixes the **idempotent + resumable** execution model. It does NOT redefine the
hypothesis representation (see [hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty.md)), the ledger schema
(ADR-0003), the writeback schema (ADR-0004), implication mapping internals (ADR-0006), or storage/scheduling
mechanics (ADR-0007) — it consumes them as stable boundaries.

## 1. Execution model: idempotent + resumable

A `Run` is one pass that advances each in-scope thread by as many stages as it can, with these properties
(ADR-0001 §1, ADR-0005):

| Property | Mechanism |
|---|---|
| Single-flight | a Run lock; overlapping fires are skipped, not queued twice |
| Resumable | per-stage checkpoint per thread; crash resumes at the last completed stage |
| Idempotent | re-running a completed thread-stage is a **no-op**; dedup keys prevent duplicate sources/claims |
| Incremental | each `SourceAdapter` advances a `FetchCursor`; only new items enter |
| Catch-up | the Run wrapper (not cron) computes missed windows; correct on plain cron |
| Observable | a run-receipt heartbeat per Run; `status` op reports per-thread stage |

**Trigger modes.** Scheduled (cron v1) fires a periodic Run over all active threads. Triggered
(`caw06 run --thread <id>`, or a CAW-05 import event) opens/advances a single thread immediately
(`TODO(open-question: import triggers an immediate single-thread Run, or enqueue for the next pass? lean: enqueue
+ optional --now.)`).

## 2. The six scout stages

```
 ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌───────────┐   ┌────────────┐   ┌──────────────────┐
 │ 1 Discover│─►│ 2 Extract │─►│ 3 Hypoth.  │─►│ 4 Plan    │─►│ 5 Log      │─►│ 6 Map            │
 │ (ingest) │   │  claims  │   │   esize    │   │  repro    │   │  result    │   │  implications    │
 └──────────┘   └──────────┘   └────────────┘   └───────────┘   └────────────┘   └──────────────────┘
   Source         Claim          Hypothesis       experiment      ledger entry      ImplicationMap
   Candidate-                    (status=          plan +          + Evidence        + export routing
   Claim                         hypothesis)       decision rule   (failures kept)
```

| # | Stage | Input | Action | Output | Anti-overclaim guard |
|---|---|---|---|---|---|
| 1 | Discover | adapters + cursors | run the 5-stage ingestion (§3) | `Source`, `CandidateClaim` | ingestion asserts nothing true; extractive only |
| 2 | Extract claims | `CandidateClaim`s | consolidate/normalize to `Claim` with `asserted_by` | `Claim` | rendered "<source> claims …", never "it is true that …" |
| 3 | Hypothesize | `Claim`s | propose checkable hypotheses; cross-claim reasoning allowed here | `Hypothesis` | created at `status=hypothesis`, `confidence=very-low`; require `falsifiability` or `TODO` |
| 4 | Plan reproduction | a `Hypothesis` | design a minimal toy experiment; **pre-register the decision rule** + config+seed+env | experiment plan | rule fixed before running (ADR-0003); no scope-fishing |
| 5 | Log result | plan + runner output | one **append-only** ledger entry; verdict → `Evidence`; failures retained + classified | ledger entry, `Evidence`, proposed `StatusEvent` | `generated` verdict text is never `experiment` evidence; reproducibility gate (config+seed+env) |
| 6 | Map implications | a finding | typed implications across domains; mark summary **generated, not evidence** | `ImplicationMap`, export proposals | summary tagged `generated`; export gated by status |

**Human gate.** Stages 1–4 and the *logging* of 5 run unattended. The **terminal routes** — promoting a
hypothesis to `supported`, exporting claims+evidence to CAW-02, committing a `wbtraffic` bundle to CAW-01 — are
**proposal-only**: the Run/agent creates a pending human-gate event; Jimmy confirms (brief §12; ADR-0001 §4).

## 3. The five-stage ingestion sub-pipeline (inside Discover)

Fixed by ADR-0005. One pipeline, five stages, each one responsibility and a typed output; ingestion **stops at S5**
and never enters the hypothesis stage.

```
 S1 Discover ─► S2 Import(CAW-05) ─► S3 Canonicalize+Dedup ─► S4 Extract claims ─► S5 Persist
  arXiv/S2        action-brief        DOI▸arXiv▸norm(title)     extractive span     store/{sources,claims}
  via adapters    bundle (read-only)  merge multi-origin        + source_locator    provenance-stamped
```

| Stage | Responsibility | Key rules | Output |
|---|---|---|---|
| S1 Discover | fetch public TTT research behind `SourceAdapter` | idempotent+incremental (`FetchCursor`); rate-limit/backoff in adapter; legal-mode (public, ToS-safe); no extraction in adapter | raw source records |
| S2 Import from CAW-05 | read the `action-brief` bundle from CAW-05 (a separate product) | **read-only, public, non-evidential** (CAW-05 prose is `evidence:false`); `bundle_id` = import watermark; unknown schema major ⇒ typed `SourceUnavailable`, never guess | imported items |
| S3 Canonicalize+Dedup | one identity across origins | `DOI ▸ arXiv id ▸ normalized(title+first-author+year)`; merge into one `Source` with many `provenance`; keep arXiv versions distinct-but-linked; a CAW-05 import of a known paper adds `provenance{origin:"caw05"}`, not a new source | deduped `Source` |
| S4 Extract claims | atomic, attributable claims | each `CandidateClaim` carries verbatim `evidence_span` + `source_locator` + `claim_type` + `writes_back` flag (default `unknown`); `status=unverified`; any paraphrase `evidence:false`; never emits `supported` | `CandidateClaim` |
| S5 Persist | write to CAW-06's own store | provenance-stamped markdown/JSON (ADR-0007); idempotent upsert keyed on canonical id | `store/sources`, `store/claims` |

### CandidateClaim shape (illustrative — builder writes the schema)

```jsonc
{
  "id": "CLM-2026-0031",
  "kind": "CandidateClaim",
  "source_ref": "SRC-2026-0012",
  "claim_type": "memory-traffic",        // mechanism|quantitative-result|capability|efficiency|memory-traffic|reproducibility
  "statement": "TTT-E2E updates fast weights per segment during inference.",
  "evidence_span": "… we update the inner weights W via a self-supervised loss at test time …",  // verbatim
  "source_locator": {"section": "3.2", "page": 5},
  "writes_back": "unknown",              // true|false|unknown  (default unknown — brief §6)
  "status": "unverified",                // ingestion NEVER emits supported
  "evidence": false,                     // this is an attributed assertion, not our verdict
  "asserted_by": "SRC-2026-0012",
  "provenance": {"retrieved_at": "TODO", "boundary": {"imports_from": []}}
}
```

The `memory-traffic` claim_type + `writes_back` flag are the seeds the writeback-traffic schema (ADR-0004) and the
CAW-01 export (ADR-0008) consume downstream.

## 4. CAW-05 import boundary (explicit, not shared)

CAW-05 is a **separate product with its own store**. We import its `action-brief` export only, across a file-drop
or pull endpoint — never a shared store/registry/runtime. The bundle is treated read-only, public,
provenance-bearing, and **non-evidential**: an `open_question` becomes a **seed `CandidateClaim`** of type
`mechanism`/`memory-traffic`, `status=unverified`, `writes_back=unknown` — never `supported`. CAW-05's
`classification`/`relevance` ride along as **priority hints only**, never truth verdicts.
`TODO(open-question: confirm CAW-05's action-brief wire schema + delivery against CAW-05's own ADR-0007 at the
boundary.)`

## 5. Resumability checkpoints (what "done" means per stage)

| Stage | Checkpoint = done when | Resume behavior |
|---|---|---|
| Ingestion S1–S5 | cursor advanced + sources/claims upserted | re-run skips already-persisted canonical ids |
| Hypothesize | `Hypothesis` written with `status=hypothesis` + `falsifiability` or `TODO` | existing hypothesis for a claim set is not re-created |
| Plan repro | plan + pre-registered decision rule + config+seed+env recorded | re-plan only if no committed plan exists |
| Log result | ledger entry appended (immutable) + `Evidence` written | a logged run is never overwritten; a re-run is a **new** entry |
| Map implications | `ImplicationMap` written; export proposals pending gate | re-map updates the map; export stays proposal-only |

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

- `TODO(open-question: claim-extraction method — single extract+attribute pass vs a verify pass re-checking each claim against its span?)`
- `TODO(open-question: is abstract+metadata enough for memory-traffic claim extraction, or is arXiv full text/PDF required for v1?)`
- `TODO(open-question: dedup tie-break when CAW-05 canonical_id disagrees with our directly-discovered id?)`
- `TODO(open-question: does a CAW-05 import trigger an immediate single-thread Run, or enqueue for the next pass?)`

## Implications for runbooks

- **Run wrapper runbook:** lock + per-stage checkpoint + cursor catch-up + heartbeat; correct on plain cron.
- **Ingestion runbook:** the 5 stages behind `SourceAdapter`; v1 adapters (arXiv, Semantic Scholar, CAW-05 import)
  + documented stubs; idempotent upsert on canonical id.
- **Stage runbooks:** hypothesize (defaults from ADR-0002), plan-repro (pre-registered rule, reproducibility gate),
  log-result (append-only, failures retained), map-implications (summary tagged generated).
- **Gate runbook:** terminal routes (promote/export) emit pending human-gate events; never auto-executed.

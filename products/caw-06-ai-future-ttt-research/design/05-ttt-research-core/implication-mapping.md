# Implication Mapping — the `ImplicationMap` model across domains

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./export-boundaries.md](./export-boundaries.md) (the seam this routes into)
  - [./ports-and-adapters.md](./ports-and-adapters.md) (the ExportAdapter port)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping.md) (the decision)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (status/uncertainty carried)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (results that become `evidence_refs`)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (per-target gates)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md) (narrative + grounding)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies the **`ImplicationMap` model** — stage 6 of a research thread (`source → claim →
hypothesis → small experiment → result → implication`). It defines the model shape, the fixed domain
vocabulary, the hard rules a validator enforces, and how a map produces **routing hints** (never the export
itself). It does **NOT** define hypothesis status semantics (see ADR-0002), the experiment ledger
(ADR-0003), the bundle shapes or the gates (see [./export-boundaries.md](./export-boundaries.md)), or the
internal physics of writeback fields (ADR-0004). It does **NOT** duplicate the grounding survey — that lives
in [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md) §3.

## 1. What an implication map is (and is not)
A **finding** (a logged result, a status-changed hypothesis, or an extracted claim) rarely matters in
isolation. The implication map fans **one finding** out into typed, uncertainty-tagged
**claims-about-consequences** across **domains**, each carrying provenance back to its thread.

| Is | Is NOT |
|---|---|
| a fan-out of typed implications from one finding | a prediction engine |
| the routing layer that *decides* which export a finding is eligible for | the export itself (that is ADR-0008) |
| an artifact whose `summary` is explicitly marked **generated** | evidence — a summary is **never** an `evidence_ref` |
| uncertainty-bearing (each implication has its own `status`+`confidence`) | a place where a hypothesis becomes a settled claim |

**No-overclaim rule (brief §12):** every implication carries its own `status` and `confidence`. Nothing in
this model can present a hypothesis as settled, and a generated `summary` can never be cited as evidence.

## 2. Fixed domain vocabulary
Six closed domains (brief §3 use case 3). A new domain requires an ADR bump — free text is rejected because
it is unroutable and uncheckable.

| Domain id | Scope | Typical export target |
|---|---|---|
| `ai-services` | serving / product economics of TTT inference | CAW-02 (claim) |
| `education` | tutoring / personalization via per-user adaptation | CAW-02 (claim) |
| `dev-platforms` | tooling / agent platforms adapting at test time | CAW-02 (claim) |
| `models` | architecture consequences (fast-weights, LoRA-per-task) | CAW-02 (claim) |
| `hardware` | accelerator / HW consequences of write traffic | CAW-01 (open question) + CAW-02 |
| `memory-centric-systems` | **lead axis:** writeback bandwidth / endurance / residency | **CAW-01 (writeback schema)** |

CAW-01 and CAW-02 are **separate independent products** — the "target" column is a routing hint only; the
real gate runs in the ExportAdapter ([./export-boundaries.md](./export-boundaries.md) §4). No shared store.

## 3. Model shape
One `ImplicationMap` per finding; many `implications` per map. JSON/markdown in CAW-06's OWN store
(ADR-0007); large artifacts by path.

```json
{
  "map_id": "im-2026-0007",
  "finding_ref": { "thread_id": "th-0007", "kind": "result", "ref_id": "EXP-0007#res-02" },
  "provenance": { "source_ids": ["arxiv:2411.07279"], "boundary": "internal" },
  "summary": "Per-task LoRA TTT writes back small adapter deltas per ARC task.",
  "summary_generated": true,
  "implications": [
    {
      "impl_id": "im-2026-0007-a",
      "domain": "memory-centric-systems",
      "statement": "Per-instance TTT creates a write-then-reuse pattern absent from read-dominant serving.",
      "status": "hypothesis",
      "confidence": "low",
      "evidence_refs": ["EXP-0007#res-02"],
      "writeback_payload_ref": "wb-0007-a",
      "export_targets": ["caw-01"]
    }
  ]
}
```

### Field reference
| Field | Type | Notes |
|---|---|---|
| `map_id` | id | one per finding |
| `finding_ref.kind` | `result \| hypothesis \| claim` | the three finding types stage 6 accepts |
| `finding_ref.ref_id` | id | resolves into ledger (ADR-0003) / hypothesis (ADR-0002) / claim (ADR-0005) |
| `provenance.boundary` | enum | `internal` here; `export:caw-0x` only after a bundle is built |
| `summary` | string | human gist |
| `summary_generated` | bool | **MUST be `true`** when the summary was model-written; flags non-evidence |
| `implications[]` | array | the fan-out |

### Per-implication fields
| Field | Type | Rule |
|---|---|---|
| `impl_id` | id | unique within the map |
| `domain` | enum | one of the fixed six (§2) |
| `statement` | string | a claim-about-consequences |
| `status` | `hypothesis \| supported \| refuted \| inconclusive` | same vocabulary as ADR-0002 |
| `confidence` | `low \| medium \| high` | **independent** of status |
| `evidence_refs[]` | id[] | MUST resolve to a ledger result (ADR-0003) or extracted claim (ADR-0005) |
| `writeback_payload_ref` | id? | present **only** for CAW-01-bound implications; links the `wbtraffic.v0` artifact (ADR-0004) |
| `export_targets[]` | enum[] | routing **hint only** — ADR-0008 enforces the real gate |

## 4. Hard rules (enforced by the model + a validator)
1. **`status` and `confidence` are independent.** A `supported` implication may still be `low` confidence
   (e.g. one toy reproduction); neither field implies the other.
2. **`evidence_refs` MUST resolve** to a ledger result or an extracted claim. A dangling ref fails
   validation. A `summary` string is **never** evidence (`summary_generated: true` makes this explicit).
3. **`status: hypothesis` is the default** and cannot be lifted by a generated summary — only by resolving
   evidence (ledger verdict per ADR-0003 / corroborating claim).
4. **A `memory-centric-systems` / `hardware` implication intended for CAW-01** SHOULD carry a
   `writeback_payload_ref` OR be expressed as a typed open question (the CAW-01 gate accepts questions, not
   assertions — see [./export-boundaries.md](./export-boundaries.md) §4).
5. **Only gate-clearing implications are eligible to bundle.** The map never emits; it only marks
   eligibility via `export_targets`. ADR-0008 is the single emit seam.
6. **Failures are first-class.** A `refuted` or `inconclusive` implication is still produced and still
   mappable — a refuted write-back axis is a high-value "axis not observed" signal, not a discard.

## 5. Routing (map → eligibility, not emit)
The map computes `export_targets` as hints; the ExportAdapter re-checks the real gate before any write.

```
implication.domain ∈ {memory-centric-systems, hardware}
   AND (writeback_payload_ref present OR statement is a typed open question)   → hint caw-01
implication has ≥1 resolving evidence_ref AND status ≠ hypothesis             → hint caw-02
```

| Finding outcome | Example implication | Hinted target |
|---|---|---|
| reproduction `supported` | per-task LoRA improves ARC few-shot | caw-02 (claim) + caw-01 (writeback schema) |
| reproduction `refuted` | variant does NOT write weights, only KV | caw-02 (negative knowledge); caw-01 "axis not observed" `TODO(open-question)` |
| `inconclusive` | traffic unmeasured at toy scale | caw-02 (inconclusive) + caw-01 open question |
| bare `hypothesis`, no evidence | speculative residency cost | **none** — fails both gates by design |

## 6. Grounding stays checkable
The domain vocabulary is seeded from **real TTT work kept as sources-to-reproduce**, not settled facts —
e.g. per-task LoRA-TTT on ARC (arXiv:2411.07279) as the canonical `memory-centric-systems`
write-back-per-task example; fast-weight / LaCT (arXiv:2505.23884) for residency/bandwidth. Vendor and
secondary claims enter as *claims to verify*, never as evidence. Full survey:
[../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md) §3.
`TODO(open-question: which TTT variants actually write back weights vs. only update KV/state?)`

## Open Questions
Track in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- `TODO(open-question: should refuted implications export to CAW-01 as explicit "axis not observed" signals, or stay only as CAW-02 negative knowledge?)`
- `TODO(open-question: do we need an implication-level priority score (e.g. blocks-a-future-workload-assumption) to rank export order?)`
- `TODO(open-question: can one implication legitimately target both CAW-01 and CAW-02 (hardware), and if so does it emit two bundles or one?)`
- `TODO(open-question: confidence is 3-value here vs ADR-0002's calibrated scale — reconcile or map at the boundary?)`

## Implications for runbooks
- Build the `ImplicationMap` model + the fixed 6-domain enum; reject free-text domains.
- Validator: `evidence_refs` resolve; `summary_generated` forced true for model-written summaries; `status`
  and `confidence` independent; `status: hypothesis` not liftable by a summary.
- Compute `export_targets` hints; do **not** emit here — routing into [./export-boundaries.md](./export-boundaries.md).
- Persist maps in CAW-06's OWN store per ADR-0007 (`store/implications/`).

# ADR-0006: Implication-map model across domains

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§3 use case 3 domains, §5 stage 6, §12 no overclaim)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md) (authoritative design narrative)
  - [./ADR-0002-hypothesis-representation.md](./ADR-0002-hypothesis-representation.md) (status/confidence the map carries)
  - [./ADR-0003-experiment-ledger.md](./ADR-0003-experiment-ledger.md) (results that are `evidence_refs`)
  - [./ADR-0008-export-boundaries.md](./ADR-0008-export-boundaries.md) (the export seam the map routes into)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

Stage 6 of the thread (brief §5) asks: *if a finding holds, who downstream cares, and how confident are we?* A
logged result, a status-changed hypothesis (ADR-0002), or an extracted claim (ADR-0005) rarely matters in
isolation. The **implication map** is the artifact that fans one finding out into typed, uncertainty-tagged
implications across **domains**, each carrying provenance back to its thread. It is also the **routing layer**
that decides which export bundle (ADR-0008) an implication becomes.

Forces:
- **Not a prediction engine, not evidence (brief §12):** each implication is a *claim-about-consequences* with its
  own `status` and `confidence`, never asserted as settled. A summary string is never an `evidence_ref`.
- **Two distinct export shapes downstream (brief §8):** a `memory-centric-systems` implication with a
  writeback payload becomes a **CAW-01** bundle (writeback schema / open question); an evidence-backed implication
  becomes a **CAW-02** bundle (claim). The map must carry enough to gate both without itself doing the export.
- **Independence:** the map lives in CAW-06's OWN store (brief §7); it never reaches into CAW-01/CAW-02.
- **Failures are first-class (brief §5):** refuted/inconclusive findings still produce implications (a refuted
  write-back axis is a high-value "axis not observed" signal).

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Domain vocabulary | **Fixed 6-domain enum** (`ai-services`, `education`, `dev-platforms`, `models`, `hardware`, `memory-centric-systems`) | matches brief §3; routes deterministically to export targets; checkable | new domains need an ADR bump | **chosen** |
| | Free-text domains | flexible | unroutable; uncheckable; drifts | rejected |
| Cardinality | **One `ImplicationMap` per finding, many `implications`** | natural fan-out; one provenance root | a finding touching N domains = N implication nodes | **chosen** |
| status vs confidence | **Independent fields** (status = which way; confidence = how strongly) | a `supported` implication can still be low-confidence for export; mirrors ADR-0002 | two fields to maintain | **chosen** |
| Evidence binding | **`evidence_refs` MUST resolve to ledger results or extracted claims** | enforces §12; gateable; machine-checkable | summary-only implications can't be exported (intended) | **chosen** |
| Export coupling | **Map carries routing hints (`export_targets`, `writeback_payload_ref`); ADR-0008 owns emit** | separation of mapping vs export; map stays a pure artifact | indirection | **chosen** |

## Decision

1. **`ImplicationMap` model — one per finding.** Fields: `map_id`; `finding_ref{thread_id, kind:
   result|hypothesis|claim, ref_id}`; `provenance{source_ids, boundary}`; a `summary` explicitly marked
   non-evidence; and an `implications[]` array. Stored as JSON/markdown in CAW-06's OWN store (brief §7), large
   artifacts by path.
2. **Each implication** carries: `impl_id`; `domain` (from the fixed enum below); a `statement`
   (claim-about-consequences); `status ∈ {hypothesis, supported, refuted, inconclusive}` (same vocabulary as
   ADR-0002); `confidence ∈ {low, medium, high}`; `evidence_refs[]`; an optional `writeback_payload_ref` (present
   only for CAW-01-bound implications, links the `wbtraffic.v0` artifact of ADR-0004); and `export_targets[]`
   (routing hint only — ADR-0008 enforces the real gate).
3. **Fixed domain vocabulary** (brief §3 use case 3), each with a typical export target:

   | Domain id | Scope | Typical target |
   |---|---|---|
   | `ai-services` | serving/product economics of TTT inference | CAW-02 |
   | `education` | tutoring/personalization via per-user adaptation | CAW-02 |
   | `dev-platforms` | tooling/agent platforms adapting at test time | CAW-02 |
   | `models` | architecture consequences (fast-weights, LoRA-per-task) | CAW-02 |
   | `hardware` | accelerator/HW consequences of write traffic | CAW-01 (open question) + CAW-02 |
   | `memory-centric-systems` | **lead axis:** writeback bandwidth/endurance/residency | **CAW-01 (writeback schema)** |

4. **Hard rules (enforced by the model + a validator):**
   - `status` and `confidence` are **independent**; neither implies the other.
   - `evidence_refs` MUST resolve to a ledger result (ADR-0003) or an extracted claim (ADR-0005); a `summary`
     string is **never** evidence.
   - Only implications whose evidence clears the **per-target gate (ADR-0008 §4)** are eligible to be bundled.
   - A `memory-centric-systems`/`hardware` implication intended for CAW-01 SHOULD carry a `writeback_payload_ref`
     OR be a typed open question (ADR-0008 CAW-01 gate).
5. **Grounding stays checkable:** the map's vocabulary is seeded from real TTT work kept as *sources to reproduce*,
   not settled facts — e.g. per-task LoRA-TTT on ARC (arXiv:2411.07279) as the canonical `memory-centric-systems`
   write-back-per-task example, fast-weight/LaCT (arXiv:2505.23884) for residency/bandwidth. Vendor/secondary
   claims enter as *claims to verify*, never evidence.

## Consequences

- **Easy:** route a finding to the right export by domain; export refuted/inconclusive findings (negative results
  are knowledge); add an implication without touching export code; trace every implication to its thread + evidence.
- **Hard / accepted cost:** the 6-domain enum is deliberately closed — a genuinely new domain needs an ADR update,
  not a free-text field; summary-only implications cannot be exported (by design); a finding spanning many domains
  produces many nodes to maintain.
- **Follow-on:** ADR-0008 consumes `export_targets` + `writeback_payload_ref` and applies the real gates; ADR-0007
  persists the `ImplicationMap` records; the CAW-01-bound payload is the ADR-0004 `wbtraffic.v0` artifact.

## Open questions / revisit triggers

- `TODO(open-question: should refuted implications export to CAW-01 as explicit "axis not observed" signals, or only stay as CAW-02 negative knowledge?)`.
- `TODO(open-question: do we need an implication-level priority/score (e.g. blocks-a-future-workload-assumption) to rank what gets exported first?)`.
- `TODO(open-question: can one implication legitimately target both CAW-01 and CAW-02 (hardware domain), and if so does it emit two bundles or one?)`.
- `TODO(open-question: confidence is a 3-value enum here vs ADR-0002's 5-value scale — reconcile or map at the boundary?)`.
- **Revisit when:** a 7th domain is genuinely needed, or a finding type beyond result/hypothesis/claim appears.

# Research Plan — Open Tracks

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./open-questions.md](./open-questions.md), [./validation-and-tests.md](./validation-and-tests.md)
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - ADRs: [0001](../01-decisions/ADR-0001-product-surface-and-scout.md) · [0002](../01-decisions/ADR-0002-hypothesis-representation.md) · [0003](../01-decisions/ADR-0003-experiment-ledger.md) · [0004](../01-decisions/ADR-0004-writeback-traffic-schema.md) · [0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md) · [0006](../01-decisions/ADR-0006-implication-mapping.md) · [0008](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc enumerates the **open research tracks** CAW-06 must run — the unknowns that the design deliberately left
as `TODO(open-question)` rather than guess. Each track names the question, the **ADR it elaborates**, the
**build phase** it resolves in, the artifact that closes it, and the **decision rule / definition of done**. It
does NOT re-decide anything fixed by an ADR (those are authoritative) and it does NOT invent results — every
numeric finding must come from a logged, reproducible run in the small-experiment ledger ([ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md)).
The full deduped unknowns register lives in [open-questions.md](./open-questions.md); this doc groups the
load-bearing ones into runnable tracks.

Two non-negotiables frame every track (PRODUCT-BRIEF §12): **no overclaim** — a result at toy scale is a
hypothesis status update, never a settled claim — and **failures are useful** — a negative or null result is a
first-class, retained, exportable finding, not a discard.

## 1. Phases (the timeline tracks resolve against)

Phases are build-order, not calendar dates (DOC-CONVENTIONS §3: do not invent dates).

| Phase | Theme | Gives us |
|---|---|---|
| **P1** | Foundations | the thread store ([ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling.md)), ingestion S1–S5 ([ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md)), `Source`/`Claim`/`Hypothesis` records ([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md)), ledger schema ([ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md)) |
| **P2** | Writeback bridge | `wbtraffic.v0` schema + the **analytic L0 estimator** ([ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema.md)) and the export adapters ([ADR-0008](../01-decisions/ADR-0008-export-boundaries.md)) |
| **P3** | Grounding | first **toy reproductions** (ledger), implication maps ([ADR-0006](../01-decisions/ADR-0006-implication-mapping.md)), CAW-05 import live |
| **P4** | Hardening | scale-out of sources, index/query, scheduler, retention policy |

## 2. Open tracks

Each track is `TRK-n`. "DoD" = definition of done / decision rule. IDs in the Q-refs column index
[open-questions.md](./open-questions.md).

### TRK-1 — Which TTT variants actually write back, and what? (the premise)

- **ADR:** [0004](../01-decisions/ADR-0004-writeback-traffic-schema.md), [0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md) · **Phase:** P1→P3 · **Q-refs:** wbq-001, wbq-009, hq/iq writeback flag
- **Why:** the entire CAW-01 bridge rests on "TTT inference issues writes read-dominant profiles miss." The
  [TTT landscape taxonomy](../02-research/ttt-landscape.md) classifies 8 variants by *writes back? what?* but each
  cell is a **hypothesis with provenance**, not a settled fact. Variant #1 (test-time scaling) is the
  read-dominant **baseline** and must stay classified as *no weight writeback*.
- **Method:** for each candidate variant, extract a `CandidateClaim` (S4) with `writes_back ∈ {true|false|unknown}`
  + `written_object ∈ {fast_weight_state, memory_module, lora_adapter, full_weights, norm_stats, policy, none}`;
  default `unknown`. Promote off `unknown` only on `external` or `experiment` evidence (never `generated`).
- **DoD:** every tracked variant has a `writes_back` value backed by a cited `evidence_span`; the
  KV-binding⇄linear-attention equivalence (wbq-009) is marked verified/unverified, not assumed.

### TRK-2 — Per-variant written-byte volume from toy runs

- **ADR:** [0003](../01-decisions/ADR-0003-experiment-ledger.md), [0004](../01-decisions/ADR-0004-writeback-traffic-schema.md) · **Phase:** P3 · **Q-refs:** wbq-007, lq-003, lq-001
- **Why:** the schema's `bytes_per_update`, `write_bw`, optimizer-state size are `null` until measured. No
  benchmark numbers are invented (PRODUCT-BRIEF §11). First two targets (per [TTT landscape §6](../02-research/ttt-landscape.md)):
  one **inner-loop** variant (TTT-Linear, #2) and one **per-task** variant (ARC LoRA TTT, #4) — opposite ends of
  the write-frequency / optimizer-state tradeoff.
- **Method:** one ledger entry per run; pre-registered `decision_rule`; ≥3 seeds (lq-001); instrument
  **written-byte counts, update frequency, optimizer-state size** — not just accuracy. `writeback_observed`
  fields feed the schema export. Whether a toy run *can* meaningfully measure write-side behavior at v1 scope is
  itself **lq-003** — if it cannot, that null is recorded as a finding, not faked.
- **DoD:** ≥1 variant has a measured (not modeled) `bytes_per_update` with a clean repro block, OR a documented
  negative result ("write volume unmeasurable in toy setup") with `failure_mode`.

### TRK-3 — Can writeback be modeled at L0/L1 BEFORE syntorch/vLLM integration?

- **ADR:** [0004](../01-decisions/ADR-0004-writeback-traffic-schema.md) · **Phase:** P2 · **Q-refs:** wbq-008, wbq-005, wbq-010
- **Why / stance:** ADR-0004 **decides yes — as an analytic L0 estimate**, clearly marked, before integration
  (Option A). This track is the *validation* of that decision, not a re-open. Full syntorch/vLLM trace (Option C)
  is an explicit non-goal for v1.
- **Method:** build the analytic estimator — given fast-weight param count, dtype, optimizer, chunk size →
  compute `bytes_per_update`, `write_bw`, `ratio_curve`, emitting every `assumption`. Confirm each schema field
  **lowers** onto a CAW-01 L0 object (`mem_store` op + writeback `movement` + mutable `tensor`) per the mapping
  table in [writeback-traffic-modeling.md §"Mapping onto CAW-01 L0/L1"](../02-research/writeback-traffic-modeling.md).
  Open sub-questions: can `reuse_distance_tokens` come from a DAG walk (wbq-005); do fast weights spill on-chip→
  main memory at long context (wbq-010).
- **DoD:** estimator is deterministic for fixed inputs, lists assumptions, and produces a bundle that
  round-trips against a CAW-01 L0 fixture (see [validation-and-tests.md](./validation-and-tests.md)). A modeled
  number is tagged `inconclusive`/`hypothesis` — **never** `supported` (ADR-0004 revisit trigger).

### TRK-4 — CAW-01 IR name + capability sync (export ask)

- **ADR:** [0004](../01-decisions/ADR-0004-writeback-traffic-schema.md), [0008](../01-decisions/ADR-0008-export-boundaries.md) · **Phase:** P2 · **Q-refs:** wbq-002, wbq-003, wbq-012, eq-005, eq-006
- **Why:** CAW-01 is a **separate product**; it OWNS its IR object names. CAW-06 must **re-verify** them at the
  boundary, never assume a shared store/registry. The headline export ask — split CAW-01's undirected "rough
  traffic" into **directional read/write rollups + an endurance rollup** (wbq-002) — is *their* decision; we ship
  it as an open question inside the bundle, not a change we make.
- **Method:** maintain a boundary checklist: re-verify CAW-01 L0 object names (`op`, `tensor`/`TensorNode`,
  `movement`/`DataMovementEdge`) and the `mem_store` op_class against CAW-01's current `l0-ir-schema.md` before
  each export cut; resolve whether `near_mem` is a residency tier or an op attribute (wbq-003); confirm CAW-01's
  IR accepts `null`+`basis` fields (wbq-012). Transport (file-drop vs HTTP, drop location/auth) is eq-005;
  bundle signing is eq-006.
- **DoD:** the `Caw01WritebackAdapter` bundle validates against a pinned CAW-01 fixture; any name drift surfaces
  as a failed validation, not a silent mismatch. No shared store assumed at any step.

### TRK-5 — CAW-05 action-brief schema reconcile (import boundary)

- **ADR:** [0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md) · **Phase:** P1→P3 · **Q-refs:** iq-001, iq-005
- **Why:** CAW-05 is a **separate product**; we import its `caw05.action-brief/v1` bundle read-only over a file/
  pull boundary — its synthesis prose is `evidence:false` and its `classification`/`relevance` are **priority
  hints, never verdicts**. The wire shape in [source-and-claim-ingestion.md §5](../02-research/source-and-claim-ingestion.md)
  is *our expected* shape, to be reconciled against CAW-05's own ADR-0007.
- **Method:** pin the schema major in `CAW05ImportAdapter`; raise typed `SourceUnavailable` on unknown major
  rather than guess; map `open_question` → seed `CandidateClaim(status=unverified, writes_back=unknown)`. Resolve
  the dedup tie-break when CAW-05's `canonical_id` disagrees with our directly-discovered id (iq-005).
- **DoD:** a real CAW-05 bundle imports idempotently (by `bundle_id` watermark), merges into an existing `Source`
  as an added provenance entry (not a duplicate), and never auto-promotes a hypothesis.

### TRK-6 — Claim-extraction method (extractive vs verify-pass)

- **ADR:** [0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md) · **Phase:** P1 · **Q-refs:** iq-002, iq-003, iq-004
- **Why:** S4 extraction is LLM-assisted but **constrained extractive + attributable** — a generated paraphrase
  is `evidence:false`; only the verbatim `evidence_span` is source text. The open question is whether a single
  extract+attribute pass is enough or a **verify pass** (re-check each claim against its span) is needed, and
  what false-claim rate is acceptable before human review (iq-002).
- **Method:** prototype both; measure false-claim rate on a held-out hand-labeled set of TTT abstracts. Decide
  whether abstract+metadata suffices for `memory-traffic` claims or full-text/PDF fetch is required (iq-003);
  decide Semantic Scholar auth tier for v1 volume (iq-004).
- **DoD:** no `CandidateClaim` is emitted without a verbatim `evidence_span` + `source_locator` (enforced by
  test, see [validation-and-tests.md](./validation-and-tests.md)); a chosen extraction method with a measured,
  documented false-claim rate below the review threshold.

## 3. Track → ADR → phase summary

| Track | Question (short) | Owning ADR(s) | Phase | Closes Q-refs |
|---|---|---|---|---|
| TRK-1 | which variants write back, what? | 0004, 0005 | P1→P3 | wbq-001, wbq-009 |
| TRK-2 | written-byte volume from toy runs | 0003, 0004 | P3 | wbq-007, lq-001/003 |
| TRK-3 | model writeback at L0/L1 pre-syntorch | 0004 | P2 | wbq-005/008/010 |
| TRK-4 | CAW-01 IR name + capability sync | 0004, 0008 | P2 | wbq-002/003/012, eq-005/006 |
| TRK-5 | CAW-05 action-brief reconcile | 0005 | P1→P3 | iq-001, iq-005 |
| TRK-6 | claim-extraction method | 0005 | P1 | iq-002/003/004 |

## 4. Sequencing & dependencies

```
P1  TRK-6 (extraction) ─┐         TRK-5 (CAW-05 import) ─┐
    store + records ─────┼──► P2  TRK-3 (L0 estimator) ──┼──► P3  TRK-2 (toy runs) ──► implication maps
    ledger schema ───────┘         TRK-4 (CAW-01 sync) ──┘         TRK-1 closes as evidence lands
```

- TRK-3 (analytic estimator) and TRK-4 (CAW-01 sync) must precede TRK-2 so a toy run's measured numbers have a
  schema + bridge to flow into. But the **export does not block on TRK-2** — ADR-0004 ships modeled estimates +
  open questions first; toy results upgrade fields later.
- TRK-1 is not a discrete deliverable; it **closes incrementally** as `external`/`experiment` evidence replaces
  `unknown` writeback flags across the taxonomy.

## Implications for runbooks

- Each track maps to phase-numbered runbooks: TRK-3/4 → P2 (`wbtraffic.v0` schema, analytic estimator, export
  adapters); TRK-2 → P3 (toy-reproduction ledger entries); TRK-5/6 → P1 (ingestion adapters + extractor).
- Every runbook that produces a number cites a ledger entry; every runbook that exports carries
  `status`+`confidence`+`provenance` inline and asserts **no shared store** with CAW-01/CAW-02/CAW-05.
- Tests for each DoD live in [validation-and-tests.md](./validation-and-tests.md); unresolved unknowns stay in
  [open-questions.md](./open-questions.md) until a track closes them.

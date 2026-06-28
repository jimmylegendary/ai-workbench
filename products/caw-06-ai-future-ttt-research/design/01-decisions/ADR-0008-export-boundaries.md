# ADR-0008: Export boundaries — ExportAdapter as the only export seam (CAW-01 + CAW-02)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§8 export boundaries, §9 ExportAdapter, §11 not a store for others, §12 no overclaim)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md) (authoritative design narrative)
  - [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling.md) (the CAW-01 payload's L0/L1 lowering)
  - [./ADR-0004-writeback-traffic-schema.md](./ADR-0004-writeback-traffic-schema.md) (the `wbtraffic.v0` artifact this exports)
  - [./ADR-0002-hypothesis-representation.md](./ADR-0002-hypothesis-representation.md) (status/uncertainty carried inline), [./ADR-0003-experiment-ledger.md](./ADR-0003-experiment-ledger.md), [./ADR-0006-implication-mapping.md](./ADR-0006-implication-mapping.md) (routes into this seam)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

CAW-06 exports to other **independent products** (brief §8): a **writeback-traffic schema + future-workload open
questions → CAW-01** (the L0/L1 memory-annotated IR bridge, brief §5 load-bearing) and **claims + evidence →
CAW-02** (the knowledge repo); novelty cues → CAW-03 are optional/stub. This ADR fixes the **one export seam** and
the per-target bundle shapes + gates. ADR-0006 routes implications here; this ADR decides how they leave.

Forces:
- **Independence (brief §1, §8, §11):** each target is a separate product with its OWN store/deploy. CAW-06 writes
  a **bundle** across a file/API boundary and records the handoff; it **never writes into another product's store,
  never assumes a shared schema registry or runtime, and is not a store for others** (one-way push).
- **Decoupling:** versioning + validation travel **inside** the bundle (`schema_version`, `producer`,
  `content_hash`), so neither side depends on a shared registry.
- **No overclaim (brief §12):** a hypothesis is never exported as a settled claim; generated summaries are not
  evidence; modeled numbers are flagged distinctly from measured ones (ADR-0004); CAW-05's judgments are never
  conflated with ours (ADR-0005).
- **Failures first-class (brief §5):** a failed/rejected export is logged and the finding **stays exportable**.

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Seam | **Single `ExportAdapter` port; target-specific adapters via config registry** | one validated seam; stubs documented (brief §9); swappable transport | indirection | **chosen** |
| | Ad-hoc per-target export code | direct | duplicated gate/validation logic; drifts | rejected |
| Transport | **File drop (v1) + HTTP POST as a stub-swap adapter** | file = simplest decoupled boundary; products deploy independently | file drop needs an agreed location/contract | **chosen** |
| Bundle coupling | **Self-describing bundle (`schema_version`+`producer`+`content_hash`)** | no shared registry between products | each side validates independently | **chosen** |
| Direction | **One-way push from CAW-06** | CAW-06 is not a store for others (brief §11) | no read-back; receipts are local | **chosen** |
| Gating | **Per-target eligibility gate run inside `validate()` BEFORE any write** | CAW-01 tolerates open questions; CAW-02 demands evidence; enforces §12 at the boundary | a gated-out bundle never emits (intended) | **chosen** |
| Idempotency | **`bundle_id` + `content_hash`; re-emit = upsert by id** | safe re-runs of the scout (ADR-0007) | content-hash must be stable | **chosen** |

## Decision

1. **`ExportAdapter` is the only export seam (brief §9).** One port; target-specific adapters; config-driven
   registry. v1 build = `Caw01WritebackAdapter` + `Caw02ClaimAdapter`. **Documented stubs:** `Caw03NoveltyAdapter`
   (novelty cues, brief §8) and `HttpExportAdapter` (transport swap for file drop) — registered, implement the
   port, never built. The port:
   - `validate(bundle) -> ValidationReport` — runs the **per-target gate (§gate below) + schema check BEFORE any
     write**; a bundle failing the gate is logged and **never emitted**.
   - `emit(bundle) -> ExportReceipt` — file drop (v1) / POST; **idempotent** by `bundle_id`+`content_hash`
     (re-emit = upsert). Receipt stored against the thread (ADR-0007 `store/exports/`) for audit.
   - `health() -> AdapterStatus` — reachable? path writable?
2. **Self-describing `ExportBundle`** carries `bundle_id`, `target`, `schema_version` (semver, inside the bundle),
   `producer="caw-06"`, `content_hash` (over payload), `payload` (target-specific), and `provenance`
   (`thread_id`, `source_ids`, `boundary`). **No shared store, no shared registry** — versioning travels in-band.
3. **Per-target gates** (enforce brief §12 at the boundary):

   | Target | Eligibility gate | Rejects |
   |---|---|---|
   | **CAW-01** | implication `domain ∈ {memory-centric-systems, hardware}` AND has a `writeback_payload` OR is a typed open question | claims with no writeback/workload relevance |
   | **CAW-02** | implication has ≥1 resolving `evidence_ref` AND `status ∈ {supported, refuted, inconclusive}` AND provenance present | bare hypotheses; summary-only items |

   The CAW-02 gate makes brief §12 machine-checkable: **a `status: hypothesis` item is rejected — it cannot become
   a CAW-02 claim**; refuted/inconclusive **are** exportable (negative results are knowledge).
4. **CAW-01 bundle = writeback-traffic schema + open questions** (the brief §5 bridge). Payload is the ADR-0004
   `wbtraffic.v0`-shaped artifact: `kind: "writeback-traffic-schema"`, `ttt_variant`, the `fields` block
   (write_bandwidth, write_endurance, updated_state_residency, optimizer_state_bytes, updated_weight_reuse,
   capacity/bw-ratio-vs-context), and a first-class `open_questions[]`. **Numeric fields default to `null` with a
   `basis` of `TODO(open-question: …)`** until a reproduction fills them — we export the schema and the unknowns,
   never invented numbers (DOC-CONVENTIONS §3). A **modeled** estimate is flagged distinctly from a **measured**
   one (ADR-0004). CAW-01 receives *questions*, not assertions about its IR.
5. **CAW-02 bundle = claim + evidence + uncertainty.** Payload: `kind: "claim-with-evidence"`, the `claim`,
   `status` (supported|refuted|inconclusive — never bare `hypothesis`), `confidence`, `evidence[]` (resolving to
   ledger results ADR-0003 / external sources), an explicit `not_evidence[]` list (e.g. generated summaries —
   makes the source/summary separation machine-checkable at the boundary), and `uncertainty_notes`. Status +
   confidence travel **inline** — nothing crosses the boundary stripped of uncertainty (ADR-0002 §7).
6. **Audit + failure handling (brief §5).** Every `emit` returns a receipt stored on the thread. A
   failed/rejected export is logged as a first-class record; the **finding stays exportable** for a later retry.

## Consequences

- **Easy:** add an export target (write an adapter, register it); re-run the scout safely (idempotent upsert);
  swap file→HTTP transport without touching gate logic; prove at the boundary that no hypothesis left as a claim
  and no invented number left for CAW-01.
- **Hard / accepted cost:** the file-drop contract (location/auth) must be agreed with each receiving product
  (open question); `content_hash` stability constrains payload serialization; one-way push means CAW-06 gets no
  delivery confirmation beyond a local receipt; CAW-01's IR may not yet accept `null`+`basis` fields (open question).
- **Follow-on:** runbooks implement the port + registry, the two v1 adapters (with gates), the CAW-03/HTTP stubs,
  and receipt storage (ADR-0007). The CAW-01 adapter lowers the payload to L0-shaped objects (`mem_store` ops +
  writeback `movements` + mutable `tensors`) per ADR-0004 — **across a file boundary, never into CAW-01's store**.

## Open questions / revisit triggers

- `TODO(open-question: is file-drop or HTTP the right v1 transport given CAW-01/CAW-02 deploy independently — and what is the agreed drop location/auth per target?)`.
- `TODO(open-question: minimal field set CAW-01's L0/L1 IR can ingest — does it accept null+basis fields and a separate read/write traffic split? — export ask wbq-002)`.
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals? — shared with ADR-0006)`.
- `TODO(open-question: how does CAW-02 want uncertainty encoded — status/confidence enums vs a calibrated score? map at the adapter boundary?)`.
- `TODO(open-question: do we need signing/verification on outbound bundles (mirroring CAW-05's signed import) for downstream trust?)`.
- **Revisit when:** a third export target goes live (promote CAW-03 stub), or a receiving product requires a pull
  (read-back) interface — which would challenge the one-way-push stance (brief §11).

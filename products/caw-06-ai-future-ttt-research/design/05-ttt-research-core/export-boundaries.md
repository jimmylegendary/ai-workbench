# Export Boundaries — the `ExportAdapter` seam (CAW-01 + CAW-02)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./implication-mapping.md](./implication-mapping.md) (what routes into this seam)
  - [./ports-and-adapters.md](./ports-and-adapters.md) (the port + registry pattern)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (the decision)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (the `wbtraffic.v0` payload)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (status/uncertainty carried inline)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (receipt storage)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md), [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies the **only export seam** out of CAW-06: the `ExportAdapter` port, the self-describing
`ExportBundle`, the per-target gates, and the two v1 bundle shapes — **writeback-traffic schema + open
questions → CAW-01** and **claims + evidence → CAW-02**. It does **NOT** define the port registry mechanics
in depth (see [./ports-and-adapters.md](./ports-and-adapters.md)), the implication model
([./implication-mapping.md](./implication-mapping.md)), or the internal writeback-field physics (ADR-0004).
Every export is a **file/API boundary between independent products** — no shared store, no shared registry,
no shared runtime. CAW-01 and CAW-02 are separate products; their IR/schema names are **theirs** (re-verify;
CAW-06 owns nothing in them).

## 1. Stance: one-way push across a product boundary
| Concern | Decision | Why |
|---|---|---|
| Seam | single `ExportAdapter` port; target adapters via config registry | one validated seam; stubs documented (brief §9) |
| Transport | file drop (v1) + HTTP POST as a stub-swap adapter | file = simplest decoupled boundary |
| Coupling | self-describing bundle (`schema_version`+`producer`+`content_hash`) | no shared registry between products |
| Direction | **one-way push** from CAW-06 | CAW-06 is not a store for others (brief §11) |
| Gating | per-target gate inside `validate()` **before** any write | enforces no-overclaim at the boundary |
| Idempotency | `bundle_id` + `content_hash`; re-emit = upsert by id | safe re-runs of the ExperimentScout |
| Failure | failed/rejected export logged; finding **stays exportable** | failures are first-class (brief §5) |

**Independence contract:** CAW-06 writes a bundle across the boundary and records the handoff locally. It
**never** writes into another product's store, **never** assumes a shared schema registry/runtime, and gets
**no** read-back — receipts are local only.

## 2. The `ExportAdapter` contract
One port; target-specific adapters; config-driven registry. v1 build = `Caw01WritebackAdapter` +
`Caw02ClaimAdapter`. Everything else is a **documented stub** (registered, implements the port, not built).

```python
class ExportBundle(Protocol):
    bundle_id: str        # stable, idempotent key
    target: str           # "caw-01" | "caw-02"
    schema_version: str   # semver, INSIDE the bundle
    producer: str         # "caw-06"
    content_hash: str     # over payload, for upsert/dedup
    payload: dict         # target-specific (see §4, §5)
    provenance: dict      # thread_id, source_ids, boundary

class ExportAdapter(Protocol):
    target: str
    def validate(self, bundle: ExportBundle) -> ValidationReport: ...  # gate (§3) + schema check, BEFORE write
    def emit(self, bundle: ExportBundle) -> ExportReceipt: ...         # file drop / POST; idempotent
    def health(self) -> AdapterStatus: ...                             # reachable? path writable?
```

- `validate()` MUST run the per-target gate **before** any write; a bundle failing the gate is logged and
  **never emitted**.
- `emit()` is **idempotent** by `bundle_id`+`content_hash` (re-emit = upsert). Returns an `ExportReceipt`
  stored against the thread (ADR-0007 `store/exports/`) for audit.
- An adapter **cannot bypass** the status/uncertainty gate — see
  [./ports-and-adapters.md](./ports-and-adapters.md) §5.

## 3. Per-target gates (no-overclaim made machine-checkable)
| Target | Eligibility gate | Rejects |
|---|---|---|
| **CAW-01** | implication `domain ∈ {memory-centric-systems, hardware}` AND has a `writeback_payload` OR is a typed open question | claims with no writeback / workload relevance |
| **CAW-02** | implication has ≥1 resolving `evidence_ref` AND `status ∈ {supported, refuted, inconclusive}` AND provenance present | **bare `hypothesis`**; summary-only items |

The CAW-02 gate makes brief §12 enforceable: **a `status: hypothesis` item is rejected — it cannot become a
CAW-02 claim.** Refuted/inconclusive **are** exportable (negative results are knowledge). The CAW-01 gate
deliberately accepts *questions* with `null` fields — we export the schema and the unknowns, never invented
numbers.

## 4. CAW-01 bundle — writeback-traffic schema + open questions (LOAD-BEARING)
Target: CAW-01's L0/L1 memory-annotated IR (a **separate product**). CAW-06 exports **schema fields + open
questions**, not a simulation. Payload is the ADR-0004 `wbtraffic.v0`-shaped artifact.

```json
{
  "bundle_id": "wb-2026-0007-a", "target": "caw-01", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "writeback-traffic-schema",
    "workload_axis": "writeback",
    "ttt_variant": "per-task-LoRA",
    "estimate_level": "L0-analytic",
    "fields": {
      "write_bandwidth":            { "unit": "GB/s",          "value": null, "basis": "TODO(open-question)" },
      "write_endurance":            { "unit": "writes/cell",   "value": null, "basis": "TODO(open-question)" },
      "near_memory_update":         { "unit": "ops/update",    "value": null, "basis": "TODO(open-question)" },
      "updated_state_residency":    { "unit": "tokens|s",      "value": null, "basis": "TODO(open-question)" },
      "optimizer_state_bytes":      { "unit": "bytes/param",   "value": null, "basis": "TODO(open-question)" },
      "updated_weight_reuse":       { "unit": "reuses/update", "value": null, "basis": "TODO(open-question)" },
      "capacity_bw_ratio_vs_context": { "curve": [], "basis": "TODO(open-question)" }
    },
    "modeled_not_measured": true,
    "open_questions": [
      "Can writeback traffic be modeled at L0/L1 before syntorch/vLLM integration? (brief §5)",
      "Which TTT variants write weights vs. only KV/state? (arXiv:2411.07279 vs 2602.21204)"
    ]
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-01" }
}
```

- **Numeric fields default to `null` + a `basis` of `TODO(open-question)`** until a toy reproduction fills
  them (DOC-CONVENTIONS §3). A **modeled** estimate (`modeled_not_measured: true`) is flagged distinctly
  from a measured one (ADR-0004).
- `open_questions[]` is a first-class export — CAW-01 receives **questions**, not assertions about its IR.
  The adapter **lowers** the payload onto CAW-01's existing L0 objects across a file boundary; CAW-01 owns
  those IR object names (re-verify, no shared store).
- Field physics + L0/L1 lowering: [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling.md).

## 5. CAW-02 bundle — claim + evidence + uncertainty
Target: CAW-02 knowledge repo (a **separate product**). Carries the claim, evidence links, and explicit
uncertainty so the receiver keeps sources/claims/conclusions separate (brief §12).

```json
{
  "bundle_id": "cl-2026-0007-a", "target": "caw-02", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "claim-with-evidence",
    "claim": "Per-instance TTT (LoRA-per-task) improves ARC few-shot accuracy vs frozen finetune.",
    "status": "supported",
    "confidence": "medium",
    "evidence": [
      { "ref_id": "EXP-0007#res-02", "kind": "reproduction-result", "verdict": "supported" },
      { "ref_id": "arxiv:2411.07279", "kind": "external-source" }
    ],
    "not_evidence": ["generated_summary:summ-0007"],
    "uncertainty_notes": "Single toy reproduction; cost/traffic not measured."
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-02" }
}
```

- `status` ∈ `supported|refuted|inconclusive` — **never a bare `hypothesis`** (gate-rejected).
- `not_evidence[]` makes the source/summary separation machine-checkable at the boundary — a generated
  summary is explicitly excluded.
- `status` + `confidence` travel **inline**; nothing crosses the boundary stripped of uncertainty (ADR-0002).

## 6. Documented stubs (registered, not built in v1)
| Adapter | Bundle | Status |
|---|---|---|
| `Caw01WritebackAdapter` | writeback-traffic schema + open questions | **v1** |
| `Caw02ClaimAdapter` | claim + evidence + uncertainty | **v1** |
| `Caw03NoveltyAdapter` | novelty cues (brief §8) | stub — implements port, not built |
| `HttpExportAdapter` | any (transport swap for file drop) | stub |

A stub implements the `ExportAdapter` port and is in the registry, so promoting it is config + build — never
a redesign of the seam.

## 7. End-to-end
```
finding (result / hypothesis / claim)
  └─ ImplicationMap (fan-out by domain, uncertainty-tagged)   [./implication-mapping.md]
       ├─ memory-centric/hardware + writeback_payload ──validate(caw-01)──► CAW-01 bundle (schema + open Qs)
       └─ evidence-backed + status≠hypothesis ─────────validate(caw-02)──► CAW-02 bundle (claim + evidence)
  receipts stored on thread (ADR-0007); failed/rejected exports logged, finding stays exportable
```

## Open Questions
Track in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- `TODO(open-question: is file-drop or HTTP the right v1 transport, and what is the agreed drop location/auth per target?)`
- `TODO(open-question: minimal field set CAW-01's L0/L1 IR can ingest — does it accept null+basis fields and a read/write split? — ask wbq-002)`
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals?)`
- `TODO(open-question: how does CAW-02 want uncertainty encoded — status/confidence enums vs a calibrated score?)`
- `TODO(open-question: do we need signing/verification on outbound bundles for downstream trust?)`

## Implications for runbooks
- Implement the `ExportAdapter` port + config-driven registry; v1 = `Caw01WritebackAdapter` +
  `Caw02ClaimAdapter`; `Caw03NoveltyAdapter` + `HttpExportAdapter` as documented stubs.
- `validate()` runs the per-target gate **before** any write; gated-out bundles are logged, never emitted.
- CAW-01 adapter emits `wbtraffic.v0` with `null`+`basis` fields and `open_questions`; lowers onto CAW-01's
  L0 objects **across a file boundary** — never into CAW-01's store.
- CAW-02 adapter rejects bare hypotheses + summary-only items; allows refuted/inconclusive; carries
  `not_evidence`.
- Store `ExportReceipt` per thread (ADR-0007 `store/exports/`); log rejected/failed exports as first-class
  records.

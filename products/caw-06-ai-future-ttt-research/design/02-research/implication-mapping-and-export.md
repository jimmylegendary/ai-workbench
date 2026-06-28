# Implication Mapping & Export

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - `01-decisions/ADR-XXXX-implication-mapping.md` (TODO)
  - `01-decisions/ADR-XXXX-export-boundaries.md` (TODO)
  - `08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **how CAW-06 maps a research finding's implications across domains** and **how it exports
across product boundaries**. It defines (a) the `ImplicationMap` model, (b) the `ExportAdapter` contract, and
(c) the **bundle shapes** for the two v1 export targets: a **writeback-traffic schema + future-workload open
questions → CAW-01** (the simulation control plane, a separate product) and **claims+evidence → CAW-02** (the
knowledge repo, a separate product). It does **NOT** define hypothesis representation, the experiment ledger, or
the internal physics of the writeback-traffic schema fields — those live in their own docs/ADRs. It treats every
export as a **file/API boundary between independent products** — no shared store, no shared registry, no shared
runtime. Generated summaries are not evidence; a hypothesis is never exported as a settled claim.

## 1. What "implication mapping" is (and is not)
A finding (a logged result, supported/refuted hypothesis, or extracted claim) rarely matters in isolation. The
**implication map** is the stage-6 artifact that asks: *if this holds, who downstream cares, and how confident
are we?* It is a **fan-out of typed, uncertainty-tagged implications** from one finding to one or more **domains**,
each carrying provenance back to the originating thread.

- It is **not** a prediction engine and **not** evidence. Each implication is a *claim-about-consequences* with its
  own `confidence` and `status`, never asserted as settled (brief §12).
- It is the **routing layer** before export: an implication tagged `domain: memory-centric-systems` with a
  `writeback-traffic` payload is what becomes a CAW-01 bundle; an implication backed by verified evidence is what
  becomes a CAW-02 bundle.

### Domains (fixed vocabulary, brief §3 use case 3)
| Domain id | Scope | Typical export target |
|---|---|---|
| `ai-services` | serving/product economics of TTT inference | CAW-02 (claim) |
| `education` | tutoring/personalization via per-user adaptation | CAW-02 (claim) |
| `dev-platforms` | tooling/agent platforms that adapt at test time | CAW-02 (claim) |
| `models` | model-architecture consequences (fast-weights, LoRA-per-task) | CAW-02 (claim) |
| `hardware` | accelerator/HW consequences of write traffic | CAW-01 (open question) + CAW-02 |
| `memory-centric-systems` | the lead axis: writeback bandwidth/endurance/residency | **CAW-01 (writeback schema)** |

## 2. The `ImplicationMap` model
One map per finding; many `implications` per map. JSON/markdown in CAW-06's OWN store (brief §7); large artifacts by
path. Shape (illustrative, not final wire format):

```json
{
  "map_id": "im-2026-0007",
  "finding_ref": { "thread_id": "th-0007", "kind": "result|hypothesis|claim", "ref_id": "res-0007-02" },
  "provenance": { "source_ids": ["arxiv:2411.07279"], "boundary": "internal" },
  "summary": "Per-task LoRA TTT writes back small adapter deltas per ARC task (NOT generated evidence).",
  "implications": [
    {
      "impl_id": "im-2026-0007-a",
      "domain": "memory-centric-systems",
      "statement": "Per-instance TTT creates a write-then-reuse pattern absent from read-dominant serving.",
      "status": "hypothesis|supported|refuted|inconclusive",
      "confidence": "low|medium|high",
      "evidence_refs": ["res-0007-02"],
      "writeback_payload_ref": "wb-0007-a",      // present only for CAW-01-bound implications
      "export_targets": ["caw-01"]
    }
  ]
}
```

Rules:
- `status` and `confidence` are **independent** — a supported implication can still be low-confidence for export.
- `evidence_refs` MUST resolve to ledger results or extracted claims; a summary string is never evidence.
- Only implications whose `evidence` clears the per-target gate (§4) are eligible to be bundled.

## 3. Grounding (real TTT work, so the map is checkable)
The map's vocabulary is seeded from published TTT/test-time-compute work, kept as *sources to reproduce*, not as
settled facts:
- **Per-task TTT on ARC** (Akyürek et al., 2024, arXiv:2411.07279): separate **LoRA params per task**, trained on a
  handful of augmented in-context examples — a concrete **write-back-per-task** pattern feeding the
  `memory-centric-systems` domain. Reported large accuracy gains, but cost/traffic is the open part.
- **Fast-weights / sequence-as-training TTT** (e.g. "Test-Time Training Done Right", arXiv:2505.23884; TTT-as-linear-
  attention, arXiv:2602.21204): context compressed into **dynamic-layer weights** at inference — updated-state
  residency + write bandwidth implications. Reported low FLOPs-utilization (small online minibatches) is itself a
  signal that the bottleneck may be **memory/write**, not compute. `TODO(open-question: which TTT variants actually
  write back weights vs. only KV/state?)`
- Vendor/secondary claims (TTT-E2E speedups, etc.) are imported as **claims to verify**, never as evidence.

## 4. Export boundaries — design stance
Each target is a **separate independent product**. CAW-06 writes a **bundle** (a file or an API payload) across the
boundary and records the handoff; it never writes into another product's store and never assumes a shared schema
registry. Versioning + validation travel **inside** the bundle so the boundary stays decoupled.

| Concern | Decision | Why |
|---|---|---|
| Transport | File drop (v1) + optional HTTP POST adapter | File = simplest decoupled boundary; HTTP is a stub-swap |
| Coupling | Bundle is self-describing (`schema_version`, `producer`) | No shared registry between products |
| Direction | One-way push from CAW-06 | CAW-06 exports; it is not a store for others (brief §11) |
| Gate | Per-target eligibility gate before emit | CAW-01 tolerates open questions; CAW-02 demands evidence |
| Idempotency | `bundle_id` + content hash; re-emit = upsert by id | Safe re-runs of the ExperimentScout pipeline |
| Failure | Failed export logged, finding stays exportable | Failures are first-class (brief §5) |

### Per-target gates
| Target | Eligibility gate | Rejects |
|---|---|---|
| **CAW-01** | implication `domain ∈ {memory-centric-systems, hardware}` AND has `writeback_payload` OR is a typed open question | claims with no writeback/workload relevance |
| **CAW-02** | implication has ≥1 resolving `evidence_ref` AND `status ∈ {supported, refuted, inconclusive}` AND provenance present | bare hypotheses, summary-only items |

CAW-02 gate enforces brief §12: no hypothesis is exported as a settled claim; refuted/inconclusive **are**
exportable (negative results are knowledge).

## 5. The `ExportAdapter` contract
Ports & adapters (brief §9). One port, target-specific adapters, config-driven registry. Build v1 = CAW-01 + CAW-02;
everything else is a documented stub.

```python
class ExportBundle(Protocol):
    bundle_id: str          # stable, idempotent
    target: str             # "caw-01" | "caw-02"
    schema_version: str     # semver, inside the bundle
    producer: str           # "caw-06"
    content_hash: str       # over payload, for upsert/dedup
    payload: dict           # target-specific (see §6, §7)
    provenance: dict        # source_ids, thread_id, boundary

class ExportAdapter(Protocol):
    target: str
    def validate(self, bundle: ExportBundle) -> ValidationReport: ...  # gate (§4) + schema check
    def emit(self, bundle: ExportBundle) -> ExportReceipt: ...         # file drop / POST; idempotent
    def health(self) -> AdapterStatus: ...                             # reachable? path writable?

# Registry (config-driven; stubs documented, not built)
EXPORT_ADAPTERS = {
  "caw-01": Caw01WritebackAdapter,   # v1
  "caw-02": Caw02ClaimAdapter,       # v1
  "caw-03": StubAdapter,             # novelty cues (brief §8) — stub
}
```

`validate()` MUST run the per-target gate **before** any write; a bundle that fails the gate is logged and never
emitted. `emit()` returns a receipt that CAW-06 stores against the thread for audit.

| Adapter | v1? | Bundle | Notes |
|---|---|---|---|
| `Caw01WritebackAdapter` | yes | writeback-traffic schema + open questions | L0/L1 bridge target |
| `Caw02ClaimAdapter` | yes | claim + evidence + uncertainty | knowledge repo |
| `Caw03NoveltyAdapter` | stub | novelty cues | brief §8 optional |
| `HttpExportAdapter` | stub | any | transport swap for file drop |

## 6. CAW-01 bundle — writeback-traffic schema + open questions
Target: CAW-01's **L0/L1 memory-annotated IR** (a separate product). CAW-06 exports **schema fields + open
questions**, not a simulation. This is the brief's load-bearing bridge (§5).

```json
{
  "bundle_id": "wb-2026-0007-a", "target": "caw-01", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "writeback-traffic-schema",
    "workload_axis": "writeback",
    "ttt_variant": "per-task-LoRA",
    "fields": {
      "write_bandwidth": { "unit": "GB/s", "value": null, "basis": "TODO(open-question)" },
      "write_endurance": { "unit": "writes/cell", "value": null, "basis": "TODO" },
      "updated_state_residency": { "unit": "tokens|s", "value": null, "basis": "TODO" },
      "optimizer_state_bytes": { "unit": "bytes/param", "value": null },
      "updated_weight_reuse": { "unit": "reuses/update", "value": null },
      "capacity_bw_ratio_vs_context": { "curve": [], "basis": "TODO" }
    },
    "open_questions": [
      "Can writeback traffic be modeled at L0/L1 before syntorch/vLLM integration? (brief §5)",
      "Which TTT variants write weights vs. only KV/state? (arXiv:2411.07279 vs 2602.21204)"
    ]
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-01" }
}
```

- Numeric fields default to `null` with a `basis` of `TODO(open-question: …)` until a reproduction fills them — we
  **export the schema and the unknowns**, never invented numbers (DOC-CONVENTIONS §3).
- `open_questions` is a first-class export: CAW-01 receives the *questions*, not assertions about its IR.

## 7. CAW-02 bundle — claim + evidence + uncertainty
Target: CAW-02 knowledge repo (a separate product). Carries the **claim, its evidence links, and explicit
uncertainty** so the receiving product can keep sources/claims/conclusions separate (brief §12).

```json
{
  "bundle_id": "cl-2026-0007-a", "target": "caw-02", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "claim-with-evidence",
    "claim": "Per-instance TTT (LoRA-per-task) improves ARC few-shot accuracy vs frozen finetune.",
    "status": "supported",                 // supported|refuted|inconclusive (never bare 'hypothesis')
    "confidence": "medium",
    "evidence": [
      { "ref_id": "res-0007-02", "kind": "reproduction-result", "verdict": "supported" },
      { "ref_id": "arxiv:2411.07279", "kind": "external-source" }
    ],
    "not_evidence": ["generated_summary:summ-0007"],   // explicitly excluded
    "uncertainty_notes": "Single toy reproduction; cost/traffic not measured."
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-02" }
}
```

- `not_evidence` makes the source/summary separation explicit and machine-checkable at the boundary.
- A `status: hypothesis` item is **rejected by the gate** — it cannot become a CAW-02 claim.

## 8. End-to-end (one thread → exports)
```
finding (result/hypothesis/claim)
   └─ ImplicationMap (fan-out by domain, uncertainty-tagged)
        ├─ memory-centric/hardware + writeback_payload ──validate(caw-01)──► CAW-01 bundle (schema + open Qs)
        └─ evidence-backed + status≠hypothesis ─────────validate(caw-02)──► CAW-02 bundle (claim + evidence)
   receipts stored on thread; failed/rejected exports logged, finding stays exportable
```

## Open Questions
Track in [`08-research-plan/open-questions.md`](../08-research-plan/open-questions.md) (TODO):
- `TODO(open-question: can writeback traffic be modeled at L0/L1 before full syntorch/vLLM integration?)` (brief §5).
- `TODO(open-question: which TTT variants actually write back weights vs. only update KV/state?)` (2411.07279 vs 2602.21204).
- `TODO(open-question: what is the minimal field set CAW-01's IR can ingest at L0/L1 — does it accept null+basis fields?)`
- `TODO(open-question: is file-drop or HTTP the right v1 transport given CAW-01/CAW-02 deploy independently?)`
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals?)`
- `TODO(open-question: how does CAW-02 want uncertainty encoded — enum vs. calibrated score?)`

## Implications for runbooks
- **RB (implication mapping):** build `ImplicationMap` model + the fixed `domain` vocabulary; enforce
  `evidence_refs` resolve and `summary`≠evidence; status/confidence independent.
- **RB (export port):** implement the `ExportAdapter` port + config-driven registry; v1 adapters for CAW-01 and
  CAW-02; CAW-03 + HTTP as documented stubs (brief §9).
- **RB (CAW-01 bundle):** emit the writeback-traffic schema bundle with `null`+`basis` fields and `open_questions`;
  validate against the per-target gate; never write into CAW-01's store (file drop / POST only).
- **RB (CAW-02 bundle):** emit claim+evidence bundles; gate rejects bare hypotheses and summary-only items; allow
  refuted/inconclusive.
- **RB (audit):** store `ExportReceipt` per thread; log rejected/failed exports as first-class records.
- All bundles carry `schema_version` + `provenance` + `content_hash`; boundaries stay decoupled (no shared store).

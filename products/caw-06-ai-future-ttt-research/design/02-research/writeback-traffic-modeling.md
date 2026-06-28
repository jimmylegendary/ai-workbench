# Writeback-Traffic Modeling (CAW-01 bridge)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc proposes a **writeback-traffic schema** for TTT-class workloads and specifies how CAW-06 can **export**
it so it maps onto **CAW-01's L0/L1 memory-annotated IR** (CAW-01 is a separate product; this is an
import/export boundary, **not a shared store**). It answers one core design question: *can TTT write traffic be
modeled at L0/L1 abstractly, before any full syntorch/vLLM integration?* It does **not** decide CAW-01's IR
(owned by CAW-01), does **not** run real TTT at scale, and does **not** settle whether TTT actually demands new
memory devices — that remains a tagged hypothesis.

## Background: why a writeback axis (grounded, not settled)

Read-dominant LLM serving profiles treat inference as read-heavy: weights are loaded once and reused; the
hot mutable structure is the KV cache. **TTT (test-time training / test-time compute) breaks this assumption**:
a subset of parameters — **"fast weights"** — are *updated by gradient descent during inference*, so inference
itself emits **write traffic** (updated weights, gradients, and optimizer state) that read-dominant profiles do
not capture.

Public work used to seed (and bound) the hypothesis — generated summaries below are **leads, not evidence**;
each must enter the ledger as a claim with provenance before use:

| Source (lead) | What it suggests for writeback | Caveat |
| --- | --- | --- |
| Titans, *Learning to Memorize at Test Time* (arXiv:2501.00663) | A neural long-term memory module updated at test time → recurring weight writes | Variant-specific; verify what is written and how often |
| *Test-Time Training Done Right* / LaCT (arXiv:2505.23884) | Fast weights are MLP layers; **large-chunk** updates raise GPU util (orig TTT often <5% FLOPs) → update **frequency** is a tunable axis | Chunk size trades latency vs write burst size |
| TTT-E2E (test-time-training.github.io e2e) | Updates only **final ~25% of MLP**; static/dynamic split → bounds **updated-state residency** size | Numbers are public claims, reproduce before trusting |
| TNT, chunkwise TTT (arXiv:2511.07343) | Chunkwise memorization → write granularity ≠ token granularity | — |
| Adam optimizer state (general) | First+second moment ≈ 8 bytes/param (fp32) → **optimizer-state residency** can dominate writeback volume | Optimizer choice changes the multiplier |

> Uncertainty tag: **HYPOTHESIS**. "TTT-class workloads need memory-device properties different from
> read-dominant serving" is *to investigate*, not a settled claim. See Open Questions.

## What "writeback traffic" means here

For a TTT variant, per update event we care about **what is written, how much, how often, where it lives, and how
often it is re-read**. Concretely:

- **Write bandwidth** — bytes/s written back during inference (fast-weight deltas + gradients + optimizer state).
- **Write volume per update** — bytes per update event (a function of fast-weight param count × dtype).
- **Update frequency** — updates per token / per chunk / per sequence (chunk size is the knob).
- **Updated-state residency** — where updated weights + optimizer state live (device / near-memory / host tier).
- **Updated-weight reuse** — read-after-write distance: how soon/often an updated weight is re-read.
- **Write endurance pressure** — cumulative writes to a region over a run (a *device-property* concern, e.g. if
  updated state ever lands on endurance-limited media; abstract/optional at L0).
- **Capacity/bandwidth-ratio shift** — how the read:write byte ratio and live-capacity peak change **as a
  function of context length and update frequency** (the headline metric distinguishing TTT from read-dominant).

## Proposed writeback-traffic schema (CAW-06 export artifact)

CAW-06's OWN artifact (markdown/JSON + ledger, per brief §7). Designed so each field **lowers cleanly** into a
CAW-01 L0 object. `uncertainty` and `provenance` are mandatory (no overclaim).

```jsonc
{
  "schema_version": "wbtraffic.v0",
  "thread_id": "…",                  // CAW-06 research thread (source→claim→hypothesis→experiment)
  "ttt_variant": "lact|titans|ttt-e2e|…",
  "provenance": { "claim_id": "…", "source_url": "…" },
  "uncertainty": "hypothesis|supported|refuted|inconclusive",

  "fast_weights": {
    "param_count": 0,                // # of updated (fast) params
    "dtype": "bf16",
    "fraction_of_model": null        // e.g. ~0.25 for TTT-E2E-style; null if unknown -> open question
  },
  "update": {
    "granularity": "token|chunk|sequence",
    "chunk_tokens": null,            // null until measured/known
    "updates_per_1k_tokens": null,   // derived update frequency
    "writes_optimizer_state": true,  // does the variant persist optimizer moments?
    "optimizer_state_bytes_per_param": 8   // e.g. Adam fp32 m+v; 0 if stateless update
  },
  "writeback": {
    "bytes_per_update": null,        // = fast_weights.param_count * dtype_bytes (+ optimizer if persisted)
    "write_bw_bytes_per_s": null,    // bytes_per_update * update_rate  (modeled, not measured at v1)
    "updated_state_residency": "device|near_mem|host",
    "reuse_distance_tokens": null,   // read-after-write distance for updated weights
    "endurance_writes_per_run": null // optional device-property rollup; abstract at L0
  },
  "ratio_curve": [                   // the headline: how the picture shifts with context/frequency
    { "context_tokens": 8192,  "update_freq": "chunk@2048",
      "read_bytes": null, "write_bytes": null, "capacity_peak_bytes": null }
  ],
  "assumptions": ["dtype, model size, optimizer — list every modeling assumption"],
  "open_questions": ["wbq-001", "…"]
}
```

Every numeric field defaults to `null` and is filled from either a **modeled estimate** (v1, with assumptions
listed) or a **reproduction result** in the small-experiment ledger. A `null` that matters becomes an
`TODO(open-question: …)`, never an invented number.

## Mapping onto CAW-01 L0/L1 (export, not shared store)

CAW-01's L0 IR has three object types: **op**, **tensor** (`TensorNode`), **movement** (`DataMovementEdge`),
with the promotion rule "first-class only if it changes the causal chain for memory traffic / capacity / lifetime"
(see CAW-01's `l0-ir-schema.md`, a separate product's doc). TTT writeback maps as follows:

| Writeback field | CAW-01 L0/L1 target | How it lowers | Level |
| --- | --- | --- | --- |
| update event | `op` with `op_class: "mem_store"` | one update → one (or chunked) store op | L0 |
| `bytes_per_update` | `movement.bytes`, `from_tier: "device" → to_tier: residency` | a writeback `DataMovementEdge` | L0 |
| `fast_weights.param_count × dtype` | `tensor.size_bytes` (updated-weight TensorNode) | a mutable tensor re-written each update | L0 |
| optimizer state | extra `tensor` (residency = updated_state_residency) | persisted moments as live tensors → capacity peak | L0 |
| `updated_state_residency` | `tensor.residency` / `movement.to_tier` | "device" at L0; **near_mem/host tier at L1** | L0→L1 |
| `reuse_distance_tokens` | `tensor.allocated_at`/`freed_at` lifetime + re-read movements | read-after-write lifetime; deepens with L1 tiers | L0→L1 |
| `update_freq` over context | repeated store ops along the time axis | drives the **write-traffic rollup** | L0 |
| `ratio_curve` | derived rollup (Σ write `movement.bytes` vs Σ read) | new "writeback" companion to CAW-01's "rough traffic" | L0 rollup |
| `endurance_writes_per_run` | per-tier cumulative write rollup | a *new* device-property rollup CAW-01 may add | L1 (proposed) |

**Key fit:** TTT writeback needs **no new L0 object type** — it is expressible as `mem_store` ops +
writeback `movements` + mutable `tensors`. What it *adds* is **direction/asymmetry**: CAW-01's "rough traffic =
Σ movement bytes" should be split into **read vs write** rollups so the read:write ratio and its drift over
context/frequency become first-class. That split is the concrete **export ask to CAW-01** (an open question for
them, not a change we make).

### What is genuinely new vs already covered

| Aspect | Already in CAW-01 L0 | New for TTT writeback |
| --- | --- | --- |
| store ops, movement bytes, tensor lifetime | yes | reuse as-is |
| capacity peak (live tensors) | yes | optimizer-state tensors enlarge it |
| traffic volume | yes (undirected) | **direction (write share) + endurance rollup** |
| residency tiers | L1 reserves them | near-memory **update** site (compute-at-write) as a tier hint |

## Can write traffic be modeled at L0/L1 BEFORE full syntorch/vLLM integration?

**Proposed answer: yes, abstractly — as an L0 *estimate*, clearly marked, before integration.** The brief
(§5, §11) explicitly allows modeling writeback at L0/L1 abstractly first.

| Option | Pros | Cons | Fit for v1 |
| --- | --- | --- | --- |
| **A. Analytic L0 estimate** (this doc): compute `bytes_per_update`, `write_bw`, `ratio_curve` from variant params + assumptions | no infra; fast; forces explicit assumptions; produces the export artifact now | numbers are modeled, not measured → must be tagged `inconclusive`/`hypothesis` | **v1 (chosen)** |
| B. Toy reproduction → real counters (small-experiment ledger) | grounds a few numbers with a minimal run | limited to tiny models; still not syntorch/vLLM | v1 follow-on for 1 checkable claim |
| C. Full syntorch/vLLM trace → Chakra → L0 | real op/tensor/movement trace | heavy; explicit **non-goal** for CAW-06 v1 | deferred / CAW-01's domain |

**Decision:** v1 = Option A produces the schema artifact with modeled estimates + assumptions, optionally
backed by one Option-B toy reproduction. We do **not** require CAW-01's syntorch/vLLM pipeline (Option C) to
emit a useful writeback-traffic export. The artifact is a **proposal/hypothesis** carrying uncertainty, lowered
onto L0 objects so CAW-01 *could* validate it later via Option C — but the bridge does not block on it.

Caveat: analytic estimates are only as good as `assumptions`. A modeled `write_bw` is **not evidence** of a real
memory bottleneck; it is a checkable hypothesis. This must be stated on every exported artifact.

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md). Load-bearing ones:

- **wbq-001:** Which TTT variants *actually* write back optimizer state during inference vs only fast-weight
  deltas? (Titans / LaCT / TTT-E2E differ.) TODO(open-question).
- **wbq-002:** Should CAW-01 split "rough traffic" into directional read/write rollups + an endurance rollup?
  This is an **export ask to CAW-01** (their decision). TODO(open-question).
- **wbq-003:** Is `near_mem` a residency *tier* or an *op attribute* (compute-at-write) in CAW-01's model?
  Affects whether near-memory update maps to `movement.to_tier` or an `op.attr`. TODO(open-question).
- **wbq-004:** Do real TTT workloads create write endurance pressure on any plausible tier, or is endurance a
  non-issue for DRAM/HBM residency? (Endurance matters only for specific media.) TODO(open-question).
- **wbq-005:** Can `reuse_distance_tokens` be derived from a DAG walk like CAW-01 tensor lifetime, or does it
  need update-frequency metadata not present in a static graph? TODO(open-question).
- **wbq-006:** Does modeled `write_bw` ever exceed read bandwidth at long context — i.e. is the writeback axis
  ever the bottleneck, or always second-order? (The hypothesis that justifies the whole bridge.) TODO(open-question).

## Implications for runbooks

- A phase-2 runbook implements the **`wbtraffic.v0` schema** as a CAW-06 artifact (JSON + markdown card) with
  mandatory `provenance` + `uncertainty`, all numerics defaulting to `null`.
- A runbook implements the **analytic L0 estimator** (Option A): given a variant's fast-weight param count,
  dtype, optimizer, chunk size → compute `bytes_per_update`, `write_bw`, and the `ratio_curve`, emitting every
  `assumption`. Acceptance: re-running with the same inputs is deterministic and lists assumptions.
- A runbook implements the **ExportAdapter → CAW-01**: serialize the artifact as L0-shaped objects
  (`mem_store` ops + writeback `movements` + mutable `tensors`) **plus** the open-question list, across an
  explicit file boundary. It must NOT assume any shared store/registry with CAW-01.
- A small-experiment-ledger runbook (Option B) plans **one** toy reproduction that measures `bytes_per_update`
  for a single variant; failures recorded as first-class negative results.
- All exports must carry the uncertainty tag; the export of a *modeled* number is flagged distinctly from a
  *measured* one.

# Writeback-Traffic Schema (`wbtraffic.v0`) — core spec

- **Status:** draft (load-bearing)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (the decision this spec implements)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (uncertainty travels inline)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (`Caw01WritebackAdapter` is the only seam)
  - [./experiment-ledger.md](./experiment-ledger.md) (`writeback_observed` grounds a modeled estimate)
  - [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling.md) (research backing)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape.md) (per-variant write profiles)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the **build-facing spec** for CAW-06's `wbtraffic.v0` schema: the per-variant fields, the v1 analytic L0
estimator, and the L0/L1 bridge that **exports** the artifact onto CAW-01's existing IR objects plus a list of
open questions. It turns [ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema.md) into concrete fields and
a lowering table a builder can implement. It does **not** decide CAW-01's IR (owned by CAW-01, a separate
product — names below are re-verify-before-use, never authoritative here), does not run real TTT at scale (brief
§11), and does not settle whether TTT demands new memory devices — that stays a tagged `Hypothesis`
([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md)). The taxonomy of which variants write back
lives in [ttt-landscape.md](../02-research/ttt-landscape.md); cross-link, don't duplicate.

## The hypothesis this schema serves (not a premise)
TTT is a *candidate future workload axis* for CAW-01: inference that **writes back** (weight deltas, gradients,
optimizer state, updated-weight reuse) could create a **memory axis not captured by read-dominant LLM serving
profiles** (brief §1, §5). That headline is a **hypothesis**, not a settled claim. So:
- The schema carries **per-variant** fields — a single "TTT = writes" boolean would corrupt the CAW-01 axis,
  because at least four distinct memory profiles hide under "TTT" (ttt-landscape §3).
- Every artifact carries a mandatory ADR-0002 `uncertainty` status; a **modeled** number is never evidence and can
  never be `supported` on its own (modeled ≠ measured; generated ≠ evidence).
- The bridge is an **export across a file boundary**, never a shared store with CAW-01 (brief §8).

## `wbtraffic.v0` — the schema
CAW-06's OWN artifact (markdown card + JSON twin), one per TTT variant under a research thread. `provenance` and
`uncertainty` are mandatory. **Every numeric defaults to `null`**; a `null` that matters becomes a
`TODO(open-question: …)`, never an invented number (conventions §3).

```jsonc
{
  "schema_version": "wbtraffic.v0",
  "thread_id": "...",                  // CAW-06 research thread (source→claim→hypothesis→experiment)
  "ttt_variant": "ttt-linear|titans|lact|ttt-e2e|arc-lora|ttrl|tta|kv-binding|...",
  "provenance": { "claim_id": "...", "source_url": "..." },   // MANDATORY
  "uncertainty": "hypothesis|supported|refuted|inconclusive", // MANDATORY (ADR-0002); default hypothesis
  "basis": "modeled|measured|mixed",   // modeled = analytic L0 estimate; measured = from ledger run

  "fast_weights": {
    "param_count": null,               // # of updated (fast) params
    "dtype": "bf16",
    "fraction_of_model": null          // e.g. ~0.25 for TTT-E2E-style; null -> open question
  },
  "update": {
    "granularity": "token|chunk|sequence",
    "chunk_tokens": null,
    "updates_per_1k_tokens": null,     // derived update frequency
    "writes_optimizer_state": null,    // does the variant persist optimizer moments?
    "optimizer_state_bytes_per_param": null  // e.g. Adam fp32 m+v ~= 8; 0 if stateless update
  },
  "writeback": {
    "bytes_per_update": null,          // = fast_weights.param_count * dtype_bytes (+ optimizer if persisted)
    "write_bw_bytes_per_s": null,      // = bytes_per_update * update_rate (MODELED at v1)
    "updated_state_residency": "device|near_mem|host",
    "reuse_distance_tokens": null,     // read-after-write distance for updated weights
    "endurance_writes_per_run": null   // optional device-property rollup; abstract at L0
  },
  "ratio_curve": [                      // the HEADLINE: how read:write shifts with context/frequency
    { "context_tokens": null, "update_freq": null,
      "read_bytes": null, "write_bytes": null, "capacity_peak_bytes": null }
  ],
  "assumptions": ["dtype, model size, optimizer, update rate — list EVERY modeling assumption"],
  "open_questions": ["wbq-001", "..."]
}
```

### Field groups (what each captures)
| Group | Captures | Why it matters |
|---|---|---|
| `fast_weights` | size/dtype/fraction of the updated weights | sets the write payload per update |
| `update` | granularity, frequency, optimizer-state persistence | optimizer state can dominate volume (Adam ~8 B/param fp32) |
| `writeback` | bytes/update, modeled write BW, residency, reuse distance, endurance | the per-event write profile + where state lives |
| `ratio_curve` | read vs write bytes + capacity peak over context × update freq | distinguishes TTT from read-dominant serving |
| `assumptions` | every modeling input | a modeled number is only as good as these |
| `provenance`/`uncertainty`/`basis` | claim, source, status, modeled-vs-measured | enforces no-overclaim across the boundary |

## v1 production = analytic L0 estimate (Option A)
Produce the artifact **now**, with zero CAW-01 infra, from a variant's public-paper params + listed assumptions
(ADR-0004 §2):

```
bytes_per_update     = fast_weights.param_count * dtype_bytes
                       (+ param_count * optimizer_state_bytes_per_param  if writes_optimizer_state)
update_rate          = updates_per_1k_tokens / 1000        # updates per token
write_bw_bytes_per_s = bytes_per_update * update_rate * tokens_per_s   # tokens_per_s an explicit assumption
ratio_curve[i]       = for each (context_tokens, update_freq):
                         write_bytes = bytes_per_update * (updates over that context)
                         read_bytes  = TODO(open-question: read-side model — KV + weight reads)
                         capacity_peak_bytes = live(fast_weights + optimizer_state + ...)
```
- **Acceptance:** re-running with the same inputs is deterministic and emits every `assumption`.
- **Grounding (Option B, follow-on):** one toy reproduction via the [ledger](./experiment-ledger.md) supplies a
  *measured* `bytes_per_update` for a single variant; it overwrites the corresponding `null`, flips that field's
  `basis` to `measured`, and is flagged distinctly from modeled fields. A measured number grounds an estimate; it
  does not turn the whole artifact into evidence.
- **Not Option C.** Full syntorch/vLLM → trace → L0 is an explicit non-goal for v1 (brief §11) and CAW-01's
  domain; the export must be useful without it.

> A modeled `write_bw` is **not evidence** of a real bottleneck — it is a checkable hypothesis, stated on every
> artifact. `basis: modeled` + `uncertainty: hypothesis` is the default.

## The CAW-01 L0/L1 bridge (export onto existing objects + open questions)
TTT writeback needs **no new L0 object type** — it is expressible with CAW-01's existing **op / tensor /
movement** objects. The object names below are **owned by CAW-01 (a separate product); re-verify against their
current IR before serializing — they are not authoritative here**, and we share no store.

| `wbtraffic.v0` field | CAW-01 L0/L1 target (re-verify) | Level |
|---|---|---|
| update event | `op` with `op_class: "mem_store"` | L0 |
| `writeback.bytes_per_update` | writeback `movement.bytes` (device → residency tier) | L0 |
| `fast_weights.param_count × dtype` | mutable `tensor.size_bytes` (re-written each update) | L0 |
| optimizer state | extra live `tensor` (enlarges capacity peak) | L0 |
| `updated_state_residency` | `tensor.residency` / `movement.to_tier` (near_mem/host at L1) | L0→L1 |
| `reuse_distance_tokens` | tensor lifetime + re-read movements | L0→L1 |
| `update` freq over context | repeated store ops along the time axis | L0 |
| `ratio_curve` | derived rollup (Σ write `movement.bytes` vs Σ read) | L0 rollup |
| `endurance_writes_per_run` | per-tier cumulative write rollup | L1 (proposed) |

**What the bridge adds is direction/asymmetry.** CAW-01's undirected "rough traffic = Σ movement bytes" should be
split into **read vs write** rollups so the read:write ratio and its drift over context/frequency become
first-class. That split — plus whether `near_mem` is a residency *tier* or an *op attribute*, and whether to add an
endurance rollup — are **export *asks* (open questions) to CAW-01, not changes we make** to their IR.

### The export bundle + gate
- Ships through the `ExportAdapter` → `Caw01WritebackAdapter` ([ADR-0008](../01-decisions/ADR-0008-export-boundaries.md))
  as a **self-describing bundle**: `{ schema_version, producer, content_hash, provenance, boundary:"export:caw-01",
  payload(L0-shaped objects), open_questions }`. Transport is **file drop** in v1; HTTP is a stub-swap.
- The bundle carries the **schema fields AND the unknowns** — CAW-01 receives *questions*, not assertions about its
  IR. `validate()` runs the per-target gate before any write: admit only implications with `domain ∈
  {memory-centric-systems, hardware}` carrying a writeback payload or a typed open question.
- A failed export is **logged and the finding stays exportable** (failures first-class). CAW-06 never writes into
  CAW-01's store.

### Uncertainty + human gate
Per ADR-0002, the `uncertainty` status is mandatory and travels inline:
| Status | What exports | How |
|---|---|---|
| `hypothesis` | the variant's profile | as an **open question** to CAW-01 |
| `supported` (human-confirmed) | the variant's profile | as a **candidate workload-axis input**, still flagged `provisional` |
| `refuted` / `inconclusive` | the negative result | as an open question / closed lead (failures useful) |

A **modeled-only** artifact cannot be `supported` — it needs a measured grounding from the ledger, and even then a
human confirms any `supported` export (ADR-0001 review gate).

## Tradeoffs (accepted)
| Decision | Pro | Con / cost |
|---|---|---|
| Per-variant schema, numerics default `null` | captures ≥4 distinct memory profiles; forbids invented numbers | many fields start `null`; more to fill |
| Analytic L0 estimate v1 | export today, zero CAW-01 infra | numbers are modeled → must be tagged `hypothesis` |
| Lower onto existing L0 objects | no new object type; forward-compatible with CAW-01's own validation | needs a faithful lowering table kept in sync |
| Export bundle, not shared store | independence preserved; decoupled release cycles | the directional split depends on CAW-01 *accepting* an open-question ask |

## Open Questions
Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- **wbq-001:** Which TTT variants *actually* write back optimizer state vs only fast-weight deltas (Titans / LaCT /
  TTT-E2E differ)? `TODO(open-question)`
- **wbq-002:** Should CAW-01 split "rough traffic" into directional read/write rollups + an endurance rollup? (An
  export ask to CAW-01 — their decision.) `TODO(open-question)`
- **wbq-003:** Is `near_mem` a residency *tier* or an *op attribute* (compute-at-write) in CAW-01's model? `TODO(open-question)`
- **wbq-004:** Do real TTT workloads create write-endurance pressure on any plausible tier, or is endurance a
  non-issue for DRAM/HBM residency? `TODO(open-question)`
- **wbq-005:** Can `reuse_distance_tokens` be derived from a DAG walk like CAW-01 tensor lifetime, or does it need
  update-frequency metadata absent from a static graph? `TODO(open-question)`
- **wbq-006:** Does modeled `write_bw` ever exceed read bandwidth at long context — i.e. is the writeback axis ever
  the bottleneck, or always second-order? (The hypothesis that justifies the whole bridge.) `TODO(open-question)`

## Implications for runbooks
- **RB (schema):** implement `wbtraffic.v0` (JSON + markdown card) with mandatory `provenance` + `uncertainty` +
  `basis`, all numerics defaulting to `null`.
- **RB (analytic estimator):** given a variant's fast-weight param count, dtype, optimizer, chunk size → compute
  `bytes_per_update`, `write_bw`, and the `ratio_curve`, emitting every `assumption`. Acceptance: deterministic +
  assumptions listed.
- **RB (`Caw01WritebackAdapter`):** serialize the artifact as L0-shaped objects + the open-question list across an
  explicit file boundary; re-verify CAW-01 object names at serialization time; never assume a shared store/registry.
- **RB (one toy reproduction, Option B):** measure `bytes_per_update` for a single variant via the
  [ledger](./experiment-ledger.md); failures recorded as first-class negative results; flag measured vs modeled.

> **Revisit trigger:** if any artifact exports a modeled number as `supported`, or asserts a schema cell as a
> settled CAW-01 workload requirement, stop — the load-bearing "hypothesis, with provenance, not a premise"
> invariant is breaking.
> Independence reminder: CAW-01 is a **separate product**; this is an export boundary, not a shared substrate.

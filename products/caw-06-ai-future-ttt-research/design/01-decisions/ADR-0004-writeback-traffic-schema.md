# ADR-0004: Writeback-traffic schema + the CAW-01 L0/L1 bridge (export, not shared store)

- **Status:** proposed (load-bearing)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0001-product-surface-and-scout.md](ADR-0001-product-surface-and-scout.md) (the artifact is a Run output)
  - [ADR-0002-hypothesis-representation.md](ADR-0002-hypothesis-representation.md) (every artifact carries status/uncertainty)
  - [ADR-0003-experiment-ledger.md](ADR-0003-experiment-ledger.md) (`writeback_observed` grounds modeled numbers)
  - [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling.md) (the research backing this ADR)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape.md) (per-variant write profiles)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md) (the export bundle/gate)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide CAW-06's **writeback-traffic schema** — the fields modeling TTT write traffic (write bandwidth/volume,
update frequency, optimizer-state residency, updated-state residency, updated-weight reuse, endurance pressure,
and the capacity/bandwidth-ratio shift over context/update-frequency) — and **how it bridges into CAW-01's L0/L1
memory-annotated IR as an export, not a shared store** (brief §5, §8). It answers the brief's core design
question: *can TTT write traffic be modeled at L0/L1 abstractly, before any full syntorch/vLLM integration?* It
does NOT decide CAW-01's IR (owned by CAW-01, a separate product), does not run real TTT at scale (§11), and does
not settle whether TTT actually demands new memory devices — that stays a tagged `Hypothesis` (ADR-0002).

## Context
- **This is the strategic, load-bearing bridge.** The brief's framing: TTT is a *candidate future workload axis*
  for CAW-01; inference that **writes back** (weight updates, gradients, optimizer state, updated-weight reuse)
  could create a **memory axis not captured by read-dominant LLM serving profiles**. CAW-06's job is to turn that
  hypothesis into a **writeback-traffic schema that bridges into CAW-01's IR** (§1, §5).
- **The headline claim is a hypothesis, not a premise.** Which variants write back, and *what* (full weights,
  adapter, fast-weight state, norm stats, policy, optimizer moments), is unverified
  ([ttt-landscape.md](../02-research/ttt-landscape.md) marks most cells *uncertain*). So a single "TTT = writes"
  flag is wrong — the schema must carry **per-variant fields**, and every artifact carries an ADR-0002 uncertainty
  tag.
- **No shared substrate.** CAW-01 is a separate product with its own IR and store; CAW-06 *exports* an artifact
  across an explicit file/API boundary and never writes into CAW-01's store or assumes a shared registry (§8;
  conventions §4, §8).
- **v1 is abstract-first.** Full syntorch/vLLM integration is an explicit non-goal for v1 (§11); the brief
  explicitly permits modeling writeback at L0/L1 abstractly first (§5).

## Options considered

### A. Schema shape
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Per-variant `wbtraffic.v0` artifact** (fast-weights, update, writeback, `ratio_curve`, assumptions) with mandatory `provenance` + `uncertainty`, all numerics defaulting to `null` | Captures the ≥4 distinct TTT memory profiles; `null`+`basis` forbids invented numbers; each field lowers cleanly into a CAW-01 L0 object | More fields to fill; many start `null` | **Chosen** |
| One global "TTT writes back" boolean + a bandwidth number | Trivial | Hides four different memory profiles; would corrupt the CAW-01 axis (§3 of ttt-landscape) | Rejected |
| Defer schema until syntorch/vLLM traces exist | Real numbers | Contradicts §11 (non-goal) and §5 (model abstractly first); produces nothing now | Rejected |

### B. How write traffic is produced in v1
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **A. Analytic L0 estimate** from variant params + listed assumptions (`bytes_per_update`, `write_bw`, `ratio_curve`) | No infra; deterministic; forces explicit assumptions; produces the export artifact now | numbers are *modeled*, must be tagged `hypothesis`/`inconclusive` | **v1 (chosen)** |
| B. Toy reproduction → measured counters (ADR-0003) | grounds a few numbers with a minimal run | tiny models only; still not syntorch/vLLM | **v1 follow-on for one variant** |
| C. Full syntorch/vLLM trace → Chakra → L0 | real op/tensor/movement trace | heavy; explicit non-goal; CAW-01's domain | Deferred |

### C. The CAW-01 bridge mechanism
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Export a self-describing bundle (file drop v1; HTTP stub) lowered onto existing L0 objects (`mem_store` ops + writeback `movements` + mutable `tensors`) + an open-question list** | No new L0 object type needed; decoupled boundary; CAW-01 *could* validate later via Option C without us blocking | Need a faithful lowering table; CAW-01 must opt-in to a directional read/write split | **Chosen** |
| Write into CAW-01's IR / shared schema registry | "Tighter" integration | Violates independence + no-shared-store (§8); couples release cycles | Rejected |
| Hand CAW-01 raw CAW-06 records | Less mapping work | Leaks our internal model across the boundary; not their IR | Rejected |

## Decision
**A per-variant `wbtraffic.v0` schema, produced v1 as an analytic L0 estimate (optionally grounded by one toy
reproduction), exported as a self-describing bundle lowered onto CAW-01's existing L0 objects + open questions —
across an explicit file boundary, never a shared store.**

1. **Schema = `wbtraffic.v0`** (CAW-06's OWN artifact; markdown card + JSON). Mandatory `provenance` (`claim_id`,
   `source_url`) and `uncertainty` (the ADR-0002 status). Per-variant groups: `fast_weights` (param_count, dtype,
   `fraction_of_model`), `update` (granularity token|chunk|sequence, `chunk_tokens`, `updates_per_1k_tokens`,
   `writes_optimizer_state`, `optimizer_state_bytes_per_param`), `writeback` (`bytes_per_update`,
   `write_bw_bytes_per_s`, `updated_state_residency` device|near_mem|host, `reuse_distance_tokens`,
   `endurance_writes_per_run`), the headline `ratio_curve` (read/write bytes + capacity peak as a function of
   context length × update frequency), `assumptions`, and `open_questions`. **Every numeric defaults to `null`**
   and is filled from a modeled estimate (with assumptions listed) or an ADR-0003 reproduction; a `null` that
   matters becomes a `TODO(open-question: …)`, never an invented number (conventions §3).

2. **v1 production = Option A (analytic L0 estimate), optionally grounded by one Option-B toy reproduction.** The
   estimator computes `bytes_per_update = param_count × dtype_bytes (+ optimizer state if persisted)`,
   `write_bw = bytes_per_update × update_rate`, and the `ratio_curve` from a variant's params + assumptions,
   emitting every assumption. Acceptance: re-running with the same inputs is deterministic and lists assumptions.
   We do **not** require CAW-01's syntorch/vLLM pipeline (Option C) to emit a useful export. A modeled number is
   **not evidence** of a real bottleneck — it is a checkable hypothesis, stated on every artifact, and flagged
   distinctly from a *measured* number sourced from the ledger.

3. **L0/L1 lowering (export, not shared store).** TTT writeback needs **no new L0 object type** — it is
   expressible with CAW-01's existing **op / tensor / movement** objects:

   | Writeback field | CAW-01 L0/L1 target | Level |
   |---|---|---|
   | update event | `op` with `op_class: "mem_store"` | L0 |
   | `bytes_per_update` | writeback `movement.bytes` (device → residency tier) | L0 |
   | `fast_weights.param_count × dtype` | mutable `tensor.size_bytes` (re-written each update) | L0 |
   | optimizer state | extra live `tensor` (enlarges capacity peak) | L0 |
   | `updated_state_residency` | `tensor.residency` / `movement.to_tier` (near_mem/host at L1) | L0→L1 |
   | `reuse_distance_tokens` | tensor lifetime + re-read movements | L0→L1 |
   | `update_freq` over context | repeated store ops along the time axis | L0 |
   | `ratio_curve` | derived rollup (Σ write `movement.bytes` vs Σ read) | L0 rollup |
   | `endurance_writes_per_run` | per-tier cumulative write rollup | L1 (proposed) |

   What it **adds** is **direction/asymmetry**: CAW-01's undirected "rough traffic = Σ movement bytes" should be
   split into **read vs write** rollups so the read:write ratio and its drift over context/frequency become
   first-class. That split — and whether `near_mem` is a residency tier or an op attribute, and whether to add an
   endurance rollup — are **export asks (open questions) to CAW-01, not changes we make** to their IR.

4. **The bundle + gate.** The artifact ships through the `ExportAdapter` → `Caw01WritebackAdapter` as a
   self-describing bundle (`schema_version`, `producer`, `content_hash`, `provenance`, `boundary:export:caw-01`);
   transport is file drop v1 (HTTP a stub-swap). The per-target gate (implication-mapping doc §4) admits only
   implications with `domain ∈ {memory-centric-systems, hardware}` that carry a writeback payload or a typed open
   question. The bundle carries the **schema fields AND the unknowns** — CAW-01 receives questions, not assertions
   about its IR. `validate()` runs the gate before any write; a failed export is logged and the finding stays
   exportable (failures first-class). CAW-06 never writes into CAW-01's store.

5. **Uncertainty travels inline.** Per ADR-0002, the `uncertainty` status is mandatory on the artifact;
   `hypothesis`-status exports as an open question, only `supported` (human-confirmed) exports as a candidate
   workload-axis input and still flagged `provisional`. A modeled estimate cannot be `supported` on its own
   (modeled ≠ measured; generated ≠ evidence).

## Consequences
- **Easy:** emit a useful CAW-01 export today from public-paper params + assumptions, with zero CAW-01 infra and no
  invented numbers; later swap a `null` for a measured value from one ADR-0003 reproduction without reshaping the
  artifact.
- **Easy:** because the schema lowers onto existing L0 objects, CAW-01 can validate it via its own Option-C trace
  later — the bridge is forward-compatible without coupling release cycles.
- **Hard / cost:** the value rests on `assumptions` (a modeled `write_bw` is only a hypothesis); the headline
  directional read/write split depends on CAW-01 *accepting* an open-question ask we cannot make for them; keeping
  the lowering table faithful as CAW-01's IR evolves needs periodic reconciliation at the boundary.
- **Follow-on:** ADR-0003 supplies measured `writeback_observed` numbers; ADR-0002 supplies the uncertainty tag
  every artifact carries; ADR-0001 emits the artifact as a Run output and gates the export behind human review.
  Runbooks: (1) the `wbtraffic.v0` schema (JSON + card, mandatory provenance/uncertainty, numerics default
  `null`); (2) the analytic L0 estimator (deterministic, assumptions listed); (3) the `Caw01WritebackAdapter`
  serializing L0-shaped objects + the open-question list over a file boundary (no shared store); (4) one toy
  reproduction (Option B) measuring `bytes_per_update` for a single variant, failures logged first-class.

## Open questions / revisit triggers
- **wbq-001:** Which TTT variants *actually* write back optimizer state vs only fast-weight deltas (Titans / LaCT /
  TTT-E2E differ)? See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- **wbq-002:** Should CAW-01 split "rough traffic" into directional read/write rollups + an endurance rollup? (An
  export ask to CAW-01 — their decision.)
- **wbq-003:** Is `near_mem` a residency *tier* or an *op attribute* (compute-at-write) in CAW-01's model?
- **wbq-004:** Do real TTT workloads create write-endurance pressure on any plausible tier, or is endurance a
  non-issue for DRAM/HBM residency?
- **wbq-005:** Can `reuse_distance_tokens` be derived from a DAG walk like CAW-01 tensor lifetime, or does it need
  update-frequency metadata absent from a static graph?
- **wbq-006:** Does modeled `write_bw` ever exceed read bandwidth at long context — i.e. is the writeback axis ever
  the bottleneck, or always second-order? (The hypothesis that justifies the whole bridge.)
- **Revisit trigger:** if any artifact exports a modeled number as `supported`, or asserts a schema cell as a
  settled CAW-01 workload requirement, stop — the load-bearing "hypothesis, with provenance, not a premise"
  invariant is breaking.

# RB-030: Implement `wbtraffic.v0` schema + analytic L0 estimator + CAW-01 L0 lowering

- Status: ready
- Phase: phase-3-writeback-and-implication
- Depends on: [RB-001 (store layout + record schemas), RB-002 (ports incl. ExportAdapter stub), RB-02X (experiment ledger entry — a finding exists)]
- Implements design:
  - [../../05-ttt-research-core/writeback-traffic-schema.md](../../05-ttt-research-core/writeback-traffic-schema.md)
  - [../../01-decisions/ADR-0004-writeback-traffic-schema.md](../../01-decisions/ADR-0004-writeback-traffic-schema.md)
  - [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation.md) (uncertainty travels inline)
  - [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries.md) (`Caw01WritebackAdapter` is the only seam)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P3 exit gate; M1 wbtraffic line)
- Produces:
  - `wbtraffic.v0` record schema + validator (JSON twin + markdown card writer)
  - `AnalyticL0Estimator` (deterministic; assumptions-emitting)
  - `Caw01Lowering` (lowering table → L0-shaped objects; re-verify CAW-01 names) + a self-describing export bundle builder

## Objective
A builder can take one TTT variant's public-paper parameters plus an explicit assumption set and produce a
persisted `wbtraffic.v0` artifact (JSON + markdown card) in CAW-06's OWN store, with **mandatory** `provenance`,
`uncertainty`, and `basis`, **every numeric defaulting to `null`**, every modeling input listed under
`assumptions`, and unknown-but-needed numerics rendered as `TODO(open-question: …)` — never invented. The
`AnalyticL0Estimator` fills the modeled numerics deterministically (same inputs → byte-identical output). A
`Caw01Lowering` step then serializes the artifact as a **self-describing export bundle** of L0-shaped objects
(CAW-01's `op`/`tensor`/`movement`) **plus the open-question list**, re-verifying CAW-01 object names at
serialization time. "Done" = a bundle exists on disk for one variant, `basis: modeled` + `uncertainty:
hypothesis` by default, with the read-side and other unknowns carried as typed open questions and a
content hash — and no value was written into any CAW-01 store. This runbook builds the schema, estimator, and
lowering; the actual boundary file-drop is RB-4XX (`Caw01WritebackAdapter`).

## Preconditions
- [ ] P2 exit met: at least one finding exists (a `ledger/EXP-XXXX` entry with a four-value verdict, OR a
      status-tagged hypothesis) to anchor `provenance.claim_id` / `thread_id`. A **refuted/inconclusive/error**
      finding is a valid anchor (failures useful).
- [ ] Store layout `store/{sources,claims,hypotheses,ledger,implications}` exists (ADR-0007); this runbook adds
      no new top-level dir — artifacts live under the producing thread / a `store/writeback/` per ADR-0007.
- [ ] The `ExportAdapter` PORT exists with documented stubs (RB-002); the concrete `Caw01WritebackAdapter` is NOT
      required yet (it is RB-4XX).
- [ ] You have read the schema spec and ADR-0004; the per-variant taxonomy in
      [../../02-research/ttt-landscape.md](../../02-research/ttt-landscape.md) is the source for which variant
      writes back what — cross-link, do not re-decide here.
- [ ] CAW-01 is treated as a **separate product**: its IR object names are re-verify-before-use, never
      authoritative in this repo, and there is no shared store.

## Steps

### 1. Define the `wbtraffic.v0` record schema
- **Do:** Create a schema (JSON Schema or equivalent typed model) matching the spec exactly: top-level
  `schema_version` (`"wbtraffic.v0"`), `thread_id`, `ttt_variant`, **mandatory** `provenance{claim_id,
  source_url}`, **mandatory** `uncertainty` (enum `hypothesis|supported|refuted|inconclusive`, default
  `hypothesis`), `basis` (`modeled|measured|mixed`, default `modeled`), and the groups `fast_weights`, `update`,
  `writeback`, `ratio_curve[]`, `assumptions[]`, `open_questions[]`. Make **every numeric field nullable and
  default to `null`** (writeback-traffic-schema.md §"the schema").
- **Verify:** Schema validation rejects a record missing `provenance` or `uncertainty`; accepts a record whose
  numerics are all `null`; rejects a numeric set to a string literal `"TODO(open-question: …)"` inside the JSON
  twin (the `TODO` marker lives in the markdown card / `open_questions`, the JSON numeric stays `null`).

### 2. Implement the validator (no-overclaim invariants)
- **Do:** Add a `validate(record)` enforcing: (a) `provenance.claim_id` and `provenance.source_url` non-empty;
  (b) `uncertainty` present; (c) **a `modeled`/`mixed`-only artifact can NEVER carry `uncertainty: supported`**
  (generated/modeled ≠ evidence — hard evidence cap, ADR-0002 + schema spec §"v1 production"); (d) if any
  numeric is filled, the inputs it derives from MUST appear in `assumptions[]`.
- **Verify:** Unit checks: `{basis: modeled, uncertainty: supported}` fails validation with a clear "modeled
  cannot be supported" error; `{basis: measured}` is required before `supported` is permitted; a filled
  `write_bw_bytes_per_s` with empty `assumptions` fails.

### 3. Implement the markdown card writer (JSON ↔ card twin)
- **Do:** Write a serializer that emits both the JSON twin and a human markdown card from one record. The card
  must render unknown-but-needed numerics as `TODO(open-question: <id>)` (conventions §3) and print `basis` +
  `uncertainty` in the header so a reader cannot miss "modeled, hypothesis".
- **Verify:** Round-trip: card+JSON regenerated from a parsed record are byte-identical to the originals; a
  `null` numeric flagged in `open_questions` renders as a `TODO(open-question: …)` line in the card.

### 4. Implement the `AnalyticL0Estimator` (Option A, deterministic)
- **Do:** Given a variant's `fast_weights.param_count`, `dtype`, optimizer flags
  (`writes_optimizer_state`, `optimizer_state_bytes_per_param`), `update.updates_per_1k_tokens`, and an explicit
  `tokens_per_s` assumption, compute (writeback-traffic-schema.md §"v1 production"):
  ```
  bytes_per_update     = param_count * dtype_bytes
                         (+ param_count * optimizer_state_bytes_per_param  if writes_optimizer_state)
  update_rate          = updates_per_1k_tokens / 1000
  write_bw_bytes_per_s = bytes_per_update * update_rate * tokens_per_s
  ratio_curve[i]       = per (context_tokens, update_freq):
                           write_bytes = bytes_per_update * (updates over that context)
                           read_bytes  = null  -> open_question (read-side model: KV + weight reads)
                           capacity_peak_bytes = live(fast_weights + optimizer_state)
  ```
  Append **every** input (dtype, optimizer choice, update rate, tokens_per_s, model size) to `assumptions[]`.
  Set `basis: modeled`, `uncertainty: hypothesis`. Leave any input the variant doesn't supply as `null` and add
  the matching `wbq-***` id to `open_questions` (e.g. `wbq-001` optimizer-state, `wbq-006` write_bw-vs-read).
- **Verify:** Re-running the estimator on identical inputs yields byte-identical JSON (determinism — ADR-0004
  acceptance). With `tokens_per_s` omitted, `write_bw_bytes_per_s` stays `null` and `open_questions` gains an
  entry; the estimator never invents a number. `read_bytes` in every `ratio_curve` row is `null` with a
  recorded open question (read-side model is out of v1 scope).

### 5. Build the CAW-01 L0 lowering (export onto existing objects + open questions)
- **Do:** Implement `Caw01Lowering(record) -> {payload, open_questions}` using the lowering table
  (writeback-traffic-schema.md §"The CAW-01 L0/L1 bridge"): update event → `op{op_class: "mem_store"}`;
  `bytes_per_update` → writeback `movement.bytes`; `param_count×dtype` → mutable `tensor.size_bytes`; optimizer
  state → extra live `tensor`; `updated_state_residency` → `tensor.residency`/`movement.to_tier`;
  `reuse_distance_tokens` → tensor lifetime + re-read movements; update-freq → repeated store ops;
  `ratio_curve` → directional Σwrite-vs-Σread rollup; `endurance_writes_per_run` → per-tier rollup (L1,
  proposed). Carry the directional-split / `near_mem`-tier / endurance asks as **typed open questions to CAW-01**
  (`wbq-002`, `wbq-003`, `wbq-004`), NOT as edits to their IR. Pull the target object names from a single
  `CAW01_IR_NAMES` constant annotated "owned by CAW-01; re-verify before serializing; not authoritative here".
- **Verify:** Lowering output contains only the three object kinds (`op`/`tensor`/`movement`) — no new L0 object
  type invented. The `open_questions` list is non-empty and includes the directional read/write-split ask. A
  golden-file test pins the lowered shape; a code comment marks the names as re-verify-before-use.

### 6. Build the self-describing export bundle
- **Do:** Implement `build_bundle(record)` producing
  `{ schema_version, producer: "caw-06", content_hash, provenance, boundary: "export:caw-01",
  payload: <lowered L0 objects>, open_questions }` (ADR-0004 §4). `content_hash` is over the canonical payload.
  Do NOT write it to any CAW-01 location — write only into CAW-06's own store / a staging path; the boundary
  file-drop is RB-4XX.
- **Verify:** The bundle carries **both** schema fields AND unknowns (open questions present). `content_hash`
  is stable for identical input. No filesystem path outside CAW-06's own tree is touched (assert in test).

### 7. Wire the field-coverage gate (P3 exit)
- **Do:** Add a `coverage_check(bundle)` asserting the P3 fields from milestones-and-phases.md §"wbtraffic.v0
  field coverage gate" are all present (`variant`, `basis`, `write_bandwidth`, `write_endurance`,
  `near_memory_update`, `updated_state_residency`, `capacity_bw_ratio_over_context_freq`, `open_questions`,
  `caw01_ir_targets`), with unknown numerics as `TODO(open-question)` rather than absent or invented.
- **Verify:** A bundle missing any required field fails the check; a bundle with all fields present (numerics may
  be `TODO(open-question)`) passes; `basis` reads `analytic-L0` (or `toy-grounded-L0` only if a measured value
  was merged).

## Acceptance criteria
- [ ] `wbtraffic.v0` schema + validator exist; a record missing `provenance` or `uncertainty` is rejected; an
      all-`null`-numeric record is accepted.
- [ ] **Hard evidence cap honored:** a `modeled`/`mixed` artifact can never be `uncertainty: supported`
      (test proves it). Default is `basis: modeled` + `uncertainty: hypothesis`.
- [ ] `AnalyticL0Estimator` is deterministic (identical inputs → byte-identical output) and emits **every**
      assumption; omitted inputs stay `null` and become open questions; no number is invented.
- [ ] `ratio_curve` read-side is `null` + open question (read model out of v1 scope); modeled `write_bw` is
      labelled a hypothesis, not a measured bottleneck (`wbq-006`).
- [ ] `Caw01Lowering` emits only `op`/`tensor`/`movement` objects (no new L0 type), pulls names from a
      re-verify-before-use constant, and carries the directional-split / `near_mem` / endurance items as typed
      **open questions to CAW-01** — not IR edits.
- [ ] `build_bundle` produces a self-describing bundle (`schema_version`, `producer`, `content_hash`,
      `provenance`, `boundary`, `payload`, `open_questions`) written only inside CAW-06's own store; **no path
      outside CAW-06 is touched** (no shared store).
- [ ] P3 field-coverage gate passes for one variant; tree is green (compiles, lints).

## Rollback / safety
- The artifact and bundle are pure outputs in CAW-06's OWN store; to undo, delete the staged
  `wbtraffic.v0` JSON/card and bundle file — nothing in any sibling product is mutated (one-way, no shared
  store). The ledger/hypothesis it references is append-only and untouched.
- If CAW-01 object names cannot be re-verified at build time, **do not guess**: keep names in the
  re-verify constant, mark them provisional, and leave the directional-split ask as an open question. Never
  serialize a name as if authoritative.
- Revisit trigger (ADR-0004): if any code path lets a modeled number export as `supported`, or asserts a schema
  cell as a settled CAW-01 requirement, stop — the "hypothesis, with provenance, not a premise" invariant is
  breaking.

## Hand-off
- RB-4XX (`Caw01WritebackAdapter`) can assume a validated self-describing bundle (L0-shaped payload + open
  questions + content hash) exists and only needs to drop it at a configured boundary path — one-way, no shared
  store, human-gated.
- RB-031 (ImplicationMap) can assume a `wbtraffic.v0` artifact id exists to set as a
  `writeback_payload_ref` on any `memory-centric-systems`/`hardware` implication bound for CAW-01.
- A later Option-B toy reproduction can overwrite a single `null` with a measured `bytes_per_update`, flip that
  field's `basis` to `measured` (artifact becomes `mixed`), and flag it distinctly — without reshaping the
  artifact. A measured value grounds an estimate; it does not turn the artifact into evidence.

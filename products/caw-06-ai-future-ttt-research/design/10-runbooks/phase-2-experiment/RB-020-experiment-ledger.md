# RB-020: Build the append-only small-experiment ledger with reproducibility gate and four-value verdict

- Status: ready
- Phase: phase-2-experiment
- Depends on: [RB-0XX (store layout + record schemas, P0 exit), RB-1XX (hypothesis records, P1 exit)]
- Implements design:
  - [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger.md)
  - [../../05-ttt-research-core/experiment-ledger.md](../../05-ttt-research-core/experiment-ledger.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P2 exit gate; M1 boxes 4–7)
- Produces:
  - `store/ledger/EXP-XXXX/` append-only entry writer + schema validator
  - the pre-run reproducibility gate (R1–R7, R11, R12) emitting `artifacts/EXP-XXXX/REPRO.md`
  - the pre-registered decision-rule evaluator → four-value verdict
  - the `supersedes` lineage resolver + "current verdict" view
  - the negative-results retention/classification/surfacing view (CLI/MCP-facing function)

## Objective
A builder can create exactly one append-only ledger entry per experiment run under `store/ledger/EXP-XXXX/`, freeze a **pre-registered decision rule** before any results exist, run a **reproducibility gate** that refuses every verdict except `invalid` until its MUST items pass, and mechanically evaluate the frozen rule against per-seed metrics to produce a four-value verdict (`supported|refuted|inconclusive|invalid`). Negative and aborted runs are retained with a controlled `failure_mode`, are queryable, and are surfaced by default. "Done" = the ledger module enforces the five invariants of [experiment-ledger.md](../../05-ttt-research-core/experiment-ledger.md) §Invariants and the tree is green. This runbook builds the **ledger + gate + verdict + surfacing**; the runner that launches compute is [RB-021](./RB-021-experiment-runner.md).

## Preconditions
- [ ] P1 exit met: at least one `Hypothesis` record (status `hypothesis`, qualitative uncertainty) and its `claim_ref`/`source` exist in the CAW-06-owned store.
- [ ] Store root and record-schema validators from P0 exist; `store/ledger/` is creatable and round-trips.
- [ ] The verdict→Evidence/StatusEvent mapping from ADR-0002 is available as a type to reference (this runbook only *emits* a verdict; it does not promote status).
- [ ] Repo is a git working tree (code revision is pinnable).
- [ ] Tree is green (compiles, lint passes) at start.

## Steps

### 1. Define the ledger entry schema as the build contract
- **Do:** Implement an `EntryRecord` type matching the YAML in [experiment-ledger.md](../../05-ttt-research-core/experiment-ledger.md) §Entry record exactly: `id`, `hypothesis_id`, `claim_ref`, `title`, `status ∈ {planned,running,done,aborted}`, `verdict ∈ {supported,refuted,inconclusive,invalid}`, `created` (leave `TODO` — do not invent dates), `boundary`, and the blocks `prediction`, `repro`, `results`, optional `writeback_observed`, `lineage`, `evidence_link`. Persist as markdown front-matter + a JSON twin; large artifacts referenced by path only. Provide a validator.
- **Verify:** Validator round-trips a hand-written sample entry; rejects an entry missing any of `prediction.decision_rule`, `repro.seeds`, `status`. Unknown numeric fields are accepted as `null`/`TODO(open-question:...)`, never auto-filled.

### 2. Append-only entry store under `store/ledger/EXP-XXXX/`
- **Do:** Implement `create_entry(...)` that allocates a stable monotonic `EXP-XXXX` id and writes the entry directory once. Implement `append_event(...)` for status/result transitions as appended records. Make in-place edit and delete **impossible** through the public API (corrections go through `supersede` in step 7). Artifacts live under `artifacts/EXP-XXXX/`.
- **Verify:** Calling any update path on an existing entry either appends or raises; a unit test asserts no public function rewrites or removes a prior entry file. Two `create_entry` calls yield distinct monotonic ids.

### 3. Pre-registration ordering (R6, anti-cherry-pick guard)
- **Do:** Enforce that `prediction` (`metric`, `baseline`, `expected_direction`, `decision_rule`) and `repro.seeds` are written **before** the `results` block is populated — the entry must first exist with an empty `results`. Record the ordering via append-only lineage / timestamps so `decision_rule` provably precedes `results`.
- **Verify:** A test that tries to populate `results` on an entry whose `prediction.decision_rule` is empty fails the gate (step 5, R6). A test that populates results then attempts to change `decision_rule` in place is rejected — the only legal change is a superseding entry (step 7).

### 4. Mechanically-evaluable decision rule → four-value verdict
- **Do:** Implement `decide(results, decision_rule) -> verdict`. The rule must be machine-evaluable from `metrics.json` over the seed distribution (e.g. `mean_delta > 2*pooled_stderr` across `>=3` seeds → `supported`; opposite direction beyond the same band → `refuted`; ran clean but band not met → `inconclusive`). Prose-only rules are rejected at registration. `invalid` is never produced by `decide` — it comes only from the gate (step 5) or a broken setup.
- **Verify:** Unit tests cover all four outcomes from synthetic per-seed metrics: a clear positive effect → `supported`; clear negative → `refuted`; within-noise → `inconclusive`; and a rule string with no parseable threshold → rejected at registration (not silently passed).

### 5. Reproducibility gate (refuses any verdict but `invalid` until green)
- **Do:** Implement `repro_gate(entry) -> GateResult` checking the MUST items from [experiment-ledger.md](../../05-ttt-research-core/experiment-ledger.md) §Reproducibility gate and ADR-0003 §Decision: R1 config frozen as a hashed file (no hidden CLI args), R2 `>=3` seeds with per-seed metrics, R3 code revision pinned (runner + product), R4 environment locked (lib versions + container digest), R5 data fully specified, R6 decision rule pre-registered before results, R7 hardware/wallclock/budget recorded, R11 baseline run logged beside treatment, R12 non-success carries a `failure_mode`. Emit `artifacts/EXP-XXXX/REPRO.md` recording each item pass/fail. A run that fails any MUST item can ONLY be assigned `verdict=invalid`.
- **Verify:** An entry missing the env lock or with `<3` seeds yields `GateResult.ok == False` and any attempt to set `verdict` other than `invalid` raises; `REPRO.md` is written and lists the failing item. A fully-specified entry yields `ok == True` and unlocks `decide()`.

### 6. Verdict semantics, no overclaim, evidence cap
- **Do:** When `verdict ∈ {supported, refuted}` with a clean gate, emit an `Evidence(evidence_kind=experiment)` plus a **proposed** `StatusEvent` per ADR-0002 — proposed only; do not auto-promote hypothesis status. Encode that a `supported` toy verdict is a hypothesis status update, never a settled claim, and that a *modeled/generated* number can never promote status (the ADR-0002 hard evidence cap). `inconclusive`/`invalid` produce no status change.
- **Verify:** A test asserts `decide` → `supported` emits a *proposed* StatusEvent that is NOT applied without an external human-confirm flag; a generated/modeled value passed as evidence is rejected by the evidence-cap check. `invalid` never produces an Evidence record.

### 7. Supersede lineage + current-verdict resolver
- **Do:** Implement `supersede(old_id, new_entry)` that creates a new `EXP-XXXX` with `lineage.supersedes = old_id`; the original (and its now-"wrong" rule/result) is preserved. Implement `current_verdict(hypothesis_id)` that resolves the latest non-superseded entry per hypothesis.
- **Verify:** After superseding, both entries exist on disk; `current_verdict` returns the new one; the original is still readable and still appears in history. No bytes of the original were modified.

### 8. Negative-result retention, classification, surfacing
- **Do:** Ensure `aborted`/`invalid`/`inconclusive`/`refuted` use the **identical** schema as successes. Enforce a controlled `failure_mode ∈ {oom, budget-exceeded, nonconvergence, no-effect, flaky, setup-error}` on every non-success (R12). Implement a `negative_results_view()` that lists all `refuted`/`inconclusive`/non-null-`failure_mode` entries grouped by `hypothesis_id` and `failure_mode`, with default ordering that surfaces failures rather than hiding them; and a per-hypothesis win/loss history.
- **Verify:** A non-success entry with `failure_mode=null` is rejected. `negative_results_view()` returns a seeded refuted + an inconclusive entry by default (not hidden); a hypothesis with only failures shows as visibly unsupported in its history.

### 9. Optional CAW-01 hook field (no shared store)
- **Do:** Accept an optional `writeback_observed` block (`weights_updated`, `state_lifecycle`, `bytes_per_update_measured`, `optimizer_state_bytes`) where unmeasured numerics stay `null`. Mark measured-vs-modeled distinctly. The ledger only *stores* this hook; lowering it onto CAW-01 IR is a later export runbook (P3/P4) across a boundary — never a shared store.
- **Verify:** An entry with `writeback_observed.bytes_per_update_measured: null` validates; a test asserts the ledger module performs no write to any CAW-01 path.

## Acceptance criteria
- [ ] One run = one append-only `store/ledger/EXP-XXXX/` entry; no public API edits or deletes a prior entry (invariant 1).
- [ ] `prediction.decision_rule` + `seeds` are provably frozen before `results` is populated (R6); changing them post-hoc is only possible as a superseding entry.
- [ ] `repro_gate` enforces R1–R7, R11, R12, emits `REPRO.md`, and blocks every verdict but `invalid` until green (invariant 4).
- [ ] `decide()` yields all four verdicts from per-seed metrics by a mechanically-evaluable rule; prose-only rules rejected.
- [ ] `supported`/`refuted` emit Evidence + a *proposed* (not applied) StatusEvent; no overclaim; modeled values cannot promote status (invariant 2; evidence cap).
- [ ] Every non-success carries a controlled `failure_mode`; `negative_results_view()` surfaces failures by default (invariant 3).
- [ ] `current_verdict(hypothesis_id)` resolves the latest non-superseded entry; original preserved byte-for-byte.
- [ ] No code path writes to a CAW-01/CAW-02/CAW-05 store (invariant 5).
- [ ] Tree green (compiles, lint passes); matches P2 exit gate in [milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md).

## Rollback / safety
- The ledger is append-only: a mid-way failure leaves a partial `EXP-XXXX/` directory. Safe recovery = mark that entry `aborted`/`invalid` with `failure_mode=setup-error`; never delete it (deleting would violate invariant 1 and the failures-first guarantee). Re-attempt as a NEW entry, optionally `supersedes` the aborted one.
- If the gate or schema validator is mid-refactor and red, revert to the last green commit; do not relax a MUST item to make a verdict pass — that would let a non-reproducible finding export.
- Never hand-edit an entry file to fix a verdict; use `supersede`.

## Hand-off
The next runbook ([RB-021](./RB-021-experiment-runner.md)) can assume: a validated append-only ledger writer, a pre-run `repro_gate` it must call before assigning a verdict, a `decide()` evaluator for the pre-registered rule, the `failure_mode` vocabulary, and the entry-creation API it must invoke on **every** launch (including crashes → `aborted`/`invalid`). P3 export runbooks can assume `current_verdict`, the Evidence/StatusEvent emission, and the stored optional `writeback_observed` hook to lower across the CAW-01 boundary.

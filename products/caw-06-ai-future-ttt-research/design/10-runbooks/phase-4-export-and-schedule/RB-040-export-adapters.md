# RB-040: Build the ExportAdapter seam + v1 Caw01WritebackAdapter and Caw02ClaimAdapter

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-3XX (wbtraffic.v0 bundle), RB-3XX (ImplicationMap), RB-0XX (ExportAdapter port + registry stubs), RB-2XX (experiment ledger)]
- Implements design: [../../05-ttt-research-core/export-boundaries.md](../../05-ttt-research-core/export-boundaries.md), [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries.md), [../../01-decisions/ADR-0004-writeback-traffic-schema.md](../../01-decisions/ADR-0004-writeback-traffic-schema.md), [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation.md)
- Produces: `ExportAdapter` registry wiring, `Caw01WritebackAdapter`, `Caw02ClaimAdapter`, `Caw03NoveltyAdapter`/`HttpExportAdapter` documented stubs, `ExportBundle` + `ValidationReport` + `ExportReceipt` types, per-target gates, `store/exports/` receipt + rejection records.

## Objective
Implement the **only export seam** out of CAW-06 so a finding can leave as a **self-describing bundle pushed one-way across a product boundary** — `wbtraffic.v0` schema + open questions → CAW-01, and claim + evidence + uncertainty → CAW-02 — with the per-target **no-overclaim gate enforced inside `validate()` before any write**. "Done" means: both v1 adapters build, the two stubs are registered but inert, every emit is idempotent and produces a stored receipt, a bare `hypothesis` is gate-rejected for CAW-02, CAW-01 numeric fields stay `null`+`basis` (no invented numbers), no adapter reads or writes any sibling product's store, and export is reachable only through the human gate (RB-042).

## Preconditions
- [ ] P3 exit met: at least one `wbtraffic.v0` bundle (analytic-L0, fields may be `TODO(open-question)`) and one `ImplicationMap` (generated-summary flag set) exist for a finding.
- [ ] The `ExportAdapter` port + config-driven registry from P0 compile with `NotImplemented`-style stubs.
- [ ] `store/exports/` directory exists per ADR-0007 layout.
- [ ] A configured **boundary drop path** per target is available (config-driven; not a sibling's internal store). Treat exact location/auth as `TODO(open-question)` from ADR-0008 and read it from config.
- [ ] CAW-01 IR target object names are recorded in config as **re-verified, owned by CAW-01** (never assumed inline).

## Steps

1. **Define the `ExportBundle` / `ValidationReport` / `ExportReceipt` types.**
   - Do: Implement `ExportBundle` with `bundle_id`, `target`, `schema_version` (semver, in-band), `producer="caw-06"`, `content_hash` (stable hash over `payload`), `payload`, `provenance` (`thread_id`, `source_ids`, `boundary`). Add `ValidationReport{ok: bool, gate: str, reasons: [str]}` and `ExportReceipt{bundle_id, target, content_hash, status, ts, path_or_endpoint}`.
   - Verify: A round-trip serialize/deserialize preserves all fields; `content_hash` is deterministic across two serializations of the same payload (unit test).

2. **Implement the `ExportAdapter` port contract and registry resolution.**
   - Do: Implement `ExportAdapter` with `target`, `validate(bundle)->ValidationReport`, `emit(bundle)->ExportReceipt`, `health()->AdapterStatus`. Resolve adapters from the config registry by `target`; never hard-code target selection in callers.
   - Verify: `registry.get("caw-01")` and `get("caw-02")` return the v1 adapters; unknown target raises a typed error; stubs resolve but `emit()` raises a documented `NotImplemented`-style guard.

3. **Enforce the gate inside `validate()`, before any write.**
   - Do: In a shared base, make `emit()` call `validate()` first and refuse to write if `ok=false`. Implement the per-target gates: **CAW-01** accepts when implication `domain ∈ {memory-centric-systems, hardware}` AND has a `writeback_payload` OR is a typed open question; **CAW-02** accepts only when there is ≥1 resolving `evidence_ref` AND `status ∈ {supported, refuted, inconclusive}` AND provenance present.
   - Verify: A CAW-02 bundle with `status="hypothesis"` returns `ok=false` and is **never written** (no file appears); a CAW-01 open-question bundle with all-`null` fields passes the gate.

4. **Implement `Caw01WritebackAdapter` (writeback schema + open questions).**
   - Do: Build the payload as the ADR-0004 `wbtraffic.v0`-shaped artifact: `kind:"writeback-traffic-schema"`, `ttt_variant`, `estimate_level`, the `fields` block (write_bandwidth, write_endurance, near_memory_update, updated_state_residency, optimizer_state_bytes, updated_weight_reuse, capacity_bw_ratio_vs_context), `modeled_not_measured`, and a first-class `open_questions[]`. Lower the payload onto CAW-01's L0 object names **read from config** (re-verified, owned by CAW-01). Numeric fields with no toy-grounded measurement stay `value: null` + `basis: "TODO(open-question)"`.
   - Verify: Emitting produces a bundle where every unmeasured numeric is `null` with a non-empty `basis`; `modeled_not_measured` is `true` for an analytic-L0 estimate; `open_questions[]` is non-empty; no invented numbers (assert no numeric field was auto-filled).

5. **Implement `Caw02ClaimAdapter` (claim + evidence + uncertainty).**
   - Do: Build payload `kind:"claim-with-evidence"` carrying `claim`, `status` (supported|refuted|inconclusive), `confidence`, `evidence[]` (resolving to ledger results / external sources), `not_evidence[]` (e.g. `generated_summary:*`), and `uncertainty_notes`. Status + confidence travel **inline**.
   - Verify: A refuted finding with one resolving `evidence_ref` exports successfully; a generated summary appears in `not_evidence[]`, never in `evidence[]`; a bundle missing `status`/`confidence` is rejected (nothing crosses stripped of uncertainty).

6. **Make `emit()` idempotent and store receipts + rejections.**
   - Do: Key emit by `bundle_id`+`content_hash` (re-emit = upsert). Write `ExportReceipt` to `store/exports/<thread_id>/`. Log a gate-rejected or transport-failed export as a first-class record; leave the finding **exportable** for retry.
   - Verify: Emitting the same bundle twice yields one logical boundary artifact and an upsert receipt (no duplicate); a forced transport failure writes a `failed` record and the finding remains selectable for re-export.

7. **Register the documented stubs.**
   - Do: Register `Caw03NoveltyAdapter` (novelty cues) and `HttpExportAdapter` (transport swap) in the registry implementing the port but raising a documented guard on `emit()`.
   - Verify: Stubs appear in `registry.list()` with `status="stub"`; calling `emit()` raises the documented guard, not a silent no-op.

8. **Assert the independence contract in code.**
   - Do: Confirm the only write target is the configured boundary path/endpoint; add a test/assert that no adapter opens a path under any sibling product's internal store, and that there is no read-back.
   - Verify: A static/path check passes; receipts are local-only; no code path imports or reads CAW-01/CAW-02 stores.

## Acceptance criteria
- [ ] `Caw01WritebackAdapter` + `Caw02ClaimAdapter` build and emit boundary bundles; `Caw03NoveltyAdapter` + `HttpExportAdapter` registered but inert (ADR-0008 P4 exit).
- [ ] `validate()` runs the per-target gate **before** any write; gated-out bundles are logged and never emitted.
- [ ] CAW-02 gate rejects a bare `hypothesis`; allows refuted/inconclusive; `not_evidence[]` excludes generated summaries.
- [ ] CAW-01 bundle carries `null`+`basis` for unmeasured numerics, `modeled_not_measured` set, and non-empty `open_questions[]` — no invented numbers.
- [ ] `emit()` is idempotent by `bundle_id`+`content_hash`; an `ExportReceipt` is stored per thread under `store/exports/`.
- [ ] No adapter reads/writes a sibling product's internal store; CAW-01 IR names come from re-verified config.
- [ ] Tree is green (compiles, lint-passing).

## Rollback / safety
- All emits are append/upsert against a CAW-06-owned boundary path; to roll back a mid-way failure, delete the partial bundle + its receipt in `store/exports/<thread>/` and re-run — idempotency makes re-emit safe.
- Never bypass `validate()`; if a gate change is needed, change the gate, not the call order.
- Export remains **human-gated** (RB-042): this runbook builds the adapters but does not auto-emit `supported` exports.

## Hand-off
- RB-042 (CLI/MCP) can wire `export <target>` as a **stage-only** op for MCP and a `--commit` path behind the human gate, calling this seam.
- RB-041 (scout Run) can **stage** export bundles during a Run but must never auto-emit a `supported`/promoting export.
- Adding a new target is now config + a port implementation, never a seam redesign.

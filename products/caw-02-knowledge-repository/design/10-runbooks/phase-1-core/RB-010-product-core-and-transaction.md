# RB-010: Build the one transactional product core + op dispatch

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-001 (repo + knowledge tree), RB-002 (frontmatter schemas), RB-003 (node/edge/event SQLite schema + deterministic reindex)]
- Implements design:
  - [../../07-backend-api/api-surface.md](../../07-backend-api/api-surface.md)
  - [../../04-data-layer/versioning-and-events.md](../../04-data-layer/versioning-and-events.md)
  - [../../05-knowledge-core/entity-and-edge-model.md](../../05-knowledge-core/entity-and-edge-model.md)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../../01-decisions/ADR-0002-storage.md](../../01-decisions/ADR-0002-storage.md)
- Produces: `core/` package — the single transactional core (`Txn`, op dispatch from one op manifest, append-only + supersedes writer, confirmation-by-default), and the in-process op registry that every surface (P4) will be codegen'd against.

## Objective
A single transactional core owns every write to CAW-02. All ops are declared once in an **op manifest**; a dispatcher routes a typed request to the op handler, which executes inside ONE atomic transaction in the fixed write order `file → index mirror → _events append → validate → commit`. No update/delete exists: corrections are new content-addressed nodes linked by `supersedes`. Agent writes are **confirmation-by-default** (`CONFIRM_REQUIRED` until `confirm:true`). "Done" = the manifest, dispatcher, transaction skeleton, append-only writer, and confirmation gate exist and are exercised by tests; RB-011/012/013 plug their validators into this core's validate phase. The core contains ALL logic; future adapters add none.

## Preconditions
- [ ] `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals,_refs,_events}/` exists and is version-controlled (RB-001).
- [ ] Per-kind YAML frontmatter schemas exist and lint fixtures (RB-002).
- [ ] SQLite `node`, `edge`, `event`, `provenance_event` tables exist; deterministic idempotent `reindex` rebuilds them from `knowledge/**` (RB-003).
- [ ] Tree is green (build + lint + schema-validate).

## Steps

1. **Define the op manifest as the single source of op truth.**
   - Do: create `core/manifest.*` listing one row per operation: `{ name, json_schema, idempotency, kind: read|write, mcp_annotations }`. Seed write ops `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, record_decision, review_accept, review_reject, link, supersede, reclassify, recompute_trust` and read ops `search, get, answer, effective_boundary, get_chain, history, verify_audit` (signatures per [api-surface.md](../../07-backend-api/api-surface.md)). Read ops set `readOnlyHint:true`.
   - Verify: a `manifest_lint` test asserts every row has a JSON schema, a unique `name`, and a `kind`; count of write ops ≥ 12; loading the manifest twice yields identical bytes.

2. **Implement the typed envelope and error codes.**
   - Do: implement `Envelope<R> = { ok, result?, error?{code,message,offending_ids?}, txn_id, audit_id }` and `ErrCode = VALIDATION|EVIDENCE_GATE|INVARIANT|BOUNDARY|CONFLICT|NOT_FOUND|QUARANTINED|CONFIRM_REQUIRED` exactly as in [api-surface.md](../../07-backend-api/api-surface.md) cross-cutting contract.
   - Verify: a unit test constructs both an `ok:true` and each `ok:false` envelope; a success envelope with empty `audit_id` fails the test (missing `audit_id` is a build failure per api-surface Implications).

3. **Implement the dispatcher.**
   - Do: `dispatch(op_name, input, WriteOpts)` looks up the manifest row, validates `input` against the row's JSON schema (schema layer-1 hook), then calls the registered handler. Unknown op → `VALIDATION`. `WriteOpts = { idempotency_key, actor:{kind:human|agent,id}, confirm? }`.
   - Verify: dispatching an unregistered op returns `ok:false code:VALIDATION`; dispatching with an input that fails the row schema returns `VALIDATION` and writes nothing.

4. **Implement the single atomic transaction in the fixed write order.**
   - Do: `Txn.run(handler)` performs, per [api-surface.md](../../07-backend-api/api-surface.md) §cross-cutting and [ADR-0002]: (a) stage the `.md` file(s), (b) stage the index `node`/`edge` mirror rows, (c) stage the `_events/<ts>-<op>.jsonl` line + `provenance_event`, (d) run the validate phase (registered validators — RB-011/012/013), (e) commit (write files, flush index, append event) only if all pass; otherwise roll back ALL staged effects. Generate node ids by the content-addressed scheme (`<prefix>_<yyyy>_<base32(blake3(payload))[:10]>`, [data-model §2](../../04-data-layer/data-model.md)).
   - Verify: a deliberately failing validator leaves zero new files under `knowledge/`, zero new `_events` lines, and zero new index rows (no orphans); a passing op writes exactly one `.md`, exactly one `_events` line, and one `provenance_event`.

5. **Implement append-only + supersedes (no update, no delete).**
   - Do: provide `supersede(old_id, new_id, reason)` that writes a NEW node version (new content-addressed id) with `supersedes:<old_id>` and emits a status-only supersede event flipping the old node to `status=superseded` (per [versioning-and-events.md §1](../../04-data-layer/versioning-and-events.md)); reject any handler attempting in-place content mutation or file deletion.
   - Verify: a test "edit" produces two files (old retained, `status=superseded`; new with `supersedes` set) and one `supersede` event; attempting an in-place overwrite or `rm` through the core API is rejected.

6. **Implement idempotency.**
   - Do: key each write by `WriteOpts.idempotency_key`; a replay with the same key returns the original `Envelope` (same `txn_id`) without a second write. A `supersedes` target mismatch returns `CONFLICT`.
   - Verify: running the same `add_source` twice with one key yields one node and identical `txn_id`; a `supersede` against a stale/non-latest target returns `CONFLICT`.

7. **Implement confirmation-by-default for agent writes.**
   - Do: in `dispatch`, if the op `kind=write` and `actor.kind=agent` and `confirm!==true`, short-circuit to `ok:false code:CONFIRM_REQUIRED` BEFORE any staging; human actors and `confirm:true` proceed (per [ADR-0001 §5](../../01-decisions/ADR-0001-product-surface-and-skill-interface.md), api-surface Parity). Read ops are exempt.
   - Verify: an agent `add_source` without `confirm` returns `CONFIRM_REQUIRED` and writes nothing; the same with `confirm:true` writes; a human `add_source` without `confirm` writes.

8. **Wire AuditService.append into every write txn.**
   - Do: every committing write calls `AuditService.append({op,node_id?,payload,actor})` to populate `_events` + `provenance_event` and stamp `audit_id` on the envelope (hash chain itself is RB-013).
   - Verify: every successful write envelope carries a non-empty `audit_id`; a write that never reaches commit produces no audit entry.

## Acceptance criteria
- [ ] One op manifest declares all ops; `manifest_lint` passes and load is byte-stable.
- [ ] Dispatcher routes by manifest, schema-validates input, and rejects unknown ops with `VALIDATION`.
- [ ] A failing validate phase leaves NO orphan file / event / index row (atomic rollback verified).
- [ ] A successful write produces exactly one `.md`, one `_events` line, one `provenance_event`, and a non-empty `audit_id`.
- [ ] No in-place update or delete is reachable through the core; corrections go via `supersede`.
- [ ] Idempotency: same key ⇒ one write, same `txn_id`; stale supersede target ⇒ `CONFLICT`.
- [ ] Agent write without `confirm` ⇒ `CONFIRM_REQUIRED` and nothing written; human or `confirm:true` proceeds.
- [ ] Tree is green (build + lint + schema-validate + the tests above).

## Rollback / safety
- The transaction is the safety unit: any mid-way failure rolls back staged file/index/event effects, so an interrupted build never leaves a half-written knowledge node. If a commit partially applies (e.g. file written, event not), `reindex` (RB-003) detects drift and fails loud rather than indexing a broken state. To undo this runbook, delete the `core/` package; `knowledge/` and the index are untouched.

## Hand-off
- RB-011 registers the data-model + Claim→Evidence invariant validator into the core's validate phase (step 4d).
- RB-012 registers the structural evidence-gate and trust derivation.
- RB-013 makes `AuditService.append` hash-chained and adds boundary propagation.
- P4 surfaces are codegen'd from the op manifest produced here; they add no logic.

# RB-040: Codegen the API + MCP adapters from the op manifest

- Status: ready
- Phase: phase-4-interfaces
- Depends on: [RB-021 (core txn + op manifest + evidence gate, phase-2), RB-031 (provenance/trust labels, phase-3)]
- Implements design:
  - [../../06-interfaces/api-and-mcp.md](../../06-interfaces/api-and-mcp.md)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P4 / M3)
  - [../../09-roadmap/dependency-graph.md](../../09-roadmap/dependency-graph.md) (edge F→J)
- Produces: a single op-manifest schema + loader; a codegen step that emits the typed HTTP API routes and the MCP tool catalog (one per core op); the read/write split with MCP annotations; confirmation-by-default gate for agent writes; a cross-surface parity contract test.

## Objective
"Done" = both the typed HTTP API and the MCP server are **generated** from the one op manifest (RB-021), add no business logic, and route every operation straight into the existing core transaction. Each op appears exactly once with one shared closed JSON Schema used by both surfaces. Read ops (`search`, `get`, `export_bundle`, `verify_audit`) are `readOnlyHint:true` and may auto-run; every write op defaults to confirmation-required for agent callers, and the canonical `{ok,result,error,txn_id,audit_id}` envelope plus error→status mapping is identical on both surfaces. A parity contract test fails the build if the API and MCP catalogs diverge in op set or schema. Neither surface can reach the store except through the core (the evidence gate, trust cap, boundary propagation, and hash-chained audit run once, inside the core).

## Preconditions
- [ ] RB-021 has landed: the op manifest exists and the core exposes a single typed `invoke(op, args, actor) -> envelope` entrypoint that already enforces the guardrails (G1–G8).
- [ ] The shared closed JSON Schemas referenced by the manifest (`./schemas/*.json`, including `attach_evidence.json` with **no** prose/`text`/`summary` field) exist and validate fixtures.
- [ ] RB-031 has landed: the core returns boundary/visibility/trust labels on read ops, and AI-authored content is capped at T2.
- [ ] Tree is green (build + lint + existing tests pass).

## Steps

1. **Pin the canonical op-manifest schema.**
   - Do: Define a meta-schema for one manifest entry with fields exactly per [api-and-mcp.md §1](../../06-interfaces/api-and-mcp.md): `op`, `kind` (`read|write`), `mcp_tool` (`kr.*`), `api: {method, path}`, `idempotency` (natural-key tuple or `caller`), `annotations: {readOnlyHint, destructiveHint, idempotentHint}`, `input_schema` (path), `scopes` (`kr:read|write|import|export`). Add a loader that rejects an entry missing any field or referencing a nonexistent `input_schema`.
   - Verify: Loading the manifest succeeds; a deliberately corrupted entry (missing `input_schema`) fails the loader with a clear error. The 12 ops of [api-and-mcp.md §2](../../06-interfaces/api-and-mcp.md) are all present: `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, record_decision, link, import_projection` (write) and `search, get, export_bundle, verify_audit` (read).

2. **Generate the MCP tool catalog from the manifest.**
   - Do: Emit one MCP tool per op, named by `mcp_tool`. Advertise name, description, the closed `input_schema`, and the annotation triple. Set `readOnlyHint:true` for the four read ops; `false` for writes. Assert at generation time that **no** entry has `destructiveHint:true` (append-only v0). Each tool body only translates the MCP tool-call into `core.invoke(op, args, actor)` and returns the envelope as the tool result `content`. Carry idempotency via the `idempotency_key` tool argument.
   - Verify: An MCP `tools/list` returns all 12 tools with correct annotations; `kr.attach_evidence` advertises a schema with no prose field; calling `kr.add_source` round-trips to the core and returns a well-formed envelope.

3. **Generate the typed HTTP API from the same manifest.**
   - Do: Emit one route per op using `api.{method,path}` (e.g. `POST /v1/sources`, `POST /v1/claims/{id}/evidence`, `GET /v1/search`). Each handler only: parses transport, derives the actor from auth (§6), reads the `Idempotency-Key` header (or server-derived natural key for content ingest), calls `core.invoke`, and serializes the envelope as the JSON body. Apply the envelope-outcome → HTTP-status mapping from [api-and-mcp.md §3](../../06-interfaces/api-and-mcp.md) (201 created, 200 noop, 422 validation, 409 guardrail reject, 401/403 auth, 404 missing). The handler adds **no** validation beyond schema parse — the core is canonical.
   - Verify: `POST /v1/sources` with a valid body returns 201 and an envelope with `audit_id`; a repeat with the same `Idempotency-Key` returns 200 with `result.status:"noop"` and the original id; an unknown route maps to `ERR_NO_SUCH_OPERATION`.

4. **Wire scopes + actor stamping (no logic, just pass-through).**
   - Do: Map each op's `scopes` to surface middleware: API authenticates a per-product credential, MCP binds the session to an actor identity; both resolve to `actor:{kind, id}` and `surface:` and hand them to the core. `import_projection` requires `kr:import`; `export_bundle` requires `kr:export`. The surface never grants a boundary downgrade or raises trust.
   - Verify: A caller with only `kr:read` is rejected (403 / scope error) on `add_source`; the audit record for a successful write stamps `actor` and `surface`. A read returns only boundary/visibility-cleared items (same filtered read path the viewer uses).

5. **Implement confirmation-by-default for agent writes (G6).**
   - Do: In the MCP surface, gate every `kind:write` tool behind confirmation-required when the actor is an agent and no explicit allow-policy is set; reads auto-run. A write submitted without confirmation is **blocked** and the rejected candidate is retained for audit (no silent auto-accept — ADR-0005/M3). Make the policy a config seam (TODO(open-question: confirmation granularity — per-tool/per-boundary/per-actor; ADR-0001/ADR-0004)).
   - Verify: An agent `kr.attach_evidence` call without confirmation returns a "confirmation required" envelope and writes nothing to `knowledge/`; the same call with confirmation succeeds and appends one `_events` line + audit record.

6. **Negative tests for the evidence gate across both surfaces.**
   - Do: Add tests that `attach_evidence` with a prose payload is rejected by closed-schema (`ERR_VALIDATION`, 422) and that an `artifact_ref` pointing at a `Note` is rejected by the core gate (`ERR_NOTE_AS_EVIDENCE`, 409) — on **both** API and MCP. Add a boundary-downgrade attempt → `ERR_BOUNDARY_DOWNGRADE` (409).
   - Verify: All four negative cases fail closed with the documented error codes on both surfaces; nothing is written.

7. **Parity contract test (the structural guarantee).**
   - Do: Write a test that loads the manifest and asserts the API route table and the MCP tool catalog expose the **same op set** with **byte-identical** shared `input_schema` per op and identical read/write classification. (Extend to include the CLI from RB-041 once it lands.) Make this test part of CI so adding a surface-only handler without a manifest entry fails the build.
   - Verify: The parity test passes; temporarily adding an MCP tool not in the manifest makes it fail; removing the extra tool makes it pass again.

## Acceptance criteria
- [ ] All 12 ops are generated onto both API and MCP from one manifest; surfaces contain transport translation only.
- [ ] Read ops are `readOnlyHint:true` and may auto-run; write ops default to confirmation-required for agents and block on missing confirmation, retaining the rejected candidate.
- [ ] The same closed `attach_evidence` schema (no prose field) is used by both surfaces; prose and note-as-evidence are rejected with `ERR_VALIDATION` / `ERR_NOTE_AS_EVIDENCE` on both.
- [ ] Envelope `{ok,result,error,txn_id,audit_id}` and the error→HTTP-status mapping are identical across surfaces; idempotent repeats return `status:"noop"` with the original id.
- [ ] No `destructiveHint:true` tool exists; `kr.verify_audit` recomputes the hash chain.
- [ ] Scope middleware enforces `kr:read/write/import/export`; no surface can bypass the core validator, evidence gate, trust cap, or boundary propagation.
- [ ] The parity contract test is green and is wired into CI.
- [ ] Tree is green at this checkpoint.

## Rollback / safety
- All generated code is produced from the manifest; deleting the generated API/MCP modules and re-running codegen restores a known state. No migration touches `knowledge/` or the SQLite index, so rollback is purely surface-layer.
- If a generated surface is found to add logic, revert the generator change — never hand-patch the generated output.
- Because writes are append-only and gated, a mid-way failure leaves no partial entity: a failed `core.invoke` appends nothing to `knowledge/_events/` and produces no commit.

## Hand-off
- The next runbook (RB-041, CLI) can assume the op manifest, shared schemas, the `core.invoke` entrypoint, the envelope, and the parity test harness exist, and must register the CLI into the same parity test.
- The viewer runbook (RB-042) can assume the read-only API (`GET /v1/search`, `GET /v1/entities/{id}`, `GET /v1/audit/verify`) applies boundary/visibility filtering before ranking and returns the hydrated provenance chain.

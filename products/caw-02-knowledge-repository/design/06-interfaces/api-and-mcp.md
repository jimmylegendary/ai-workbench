# API & MCP — Tool Catalog (Codegen'd from the Op Manifest)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../02-research/agent-skill-interface-and-mcp.md](../02-research/agent-skill-interface-and-mcp.md)
  - [./cli.md](./cli.md)
  - [./knowledge-viewer.md](./knowledge-viewer.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies the **typed HTTP API** and the **MCP server** as two of the three thin write adapters over the
single product core (ADR-0001). It fixes the **operation catalog**, the **read vs mutating** split, the request/
response **envelope**, **idempotency** wiring, and **auth/scoping**. It does NOT redefine the core guardrails,
schemas, or audit (those live in [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) and
the [skill-interface research](../02-research/agent-skill-interface-and-mcp.md)) — it maps them onto two surfaces.
CLI is in [cli.md](./cli.md); the read-only viewer in [knowledge-viewer.md](./knowledge-viewer.md). Storage
(ADR-0002), data model (ADR-0003), provenance/trust (ADR-0004), and import/export wire formats (ADR-0006) are
consumed as a stable core boundary.

## 1. One manifest, two generated surfaces
Per ADR-0001 §3, every operation is declared **once** in the op manifest. API routes and MCP tools are **generated**
from it — they add nothing. A parity contract test asserts both surfaces (plus CLI) expose the same operation set
with identical JSON Schemas. Adding an operation = editing the manifest, never hand-editing a surface.

```yaml
# op-manifest entry (illustrative; canonical schema TODO in runbooks)
- op: attach_evidence
  kind: write                 # read | write
  mcp_tool: kr.attach_evidence
  api: { method: POST, path: /v1/claims/{claim_id}/evidence }
  idempotency: ["claim_id", "artifact_ref"]   # natural key tuple
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  input_schema: ./schemas/attach_evidence.json   # the SAME file the CLI & MCP validate against
  scopes: ["kr:write"]
```

Each generated surface only does transport translation: HTTP ↔ core op, or MCP tool-call ↔ core op. Validation, the
evidence gate, trust recompute, boundary propagation, and the append-only hash-chained audit all run **inside the
core**, once.

## 2. The catalog — core op ↔ MCP tool ↔ API route
Tool/route names mirror the brief's unit of value plus retrieval and signal intake. `kr.` is the MCP namespace.

| Core op | MCP tool | API route | Kind | Idempotency key |
|---|---|---|---|---|
| add_source | `kr.add_source` | `POST /v1/sources` | write | `sha256(content)` |
| extract_claims | `kr.extract_claims` | `POST /v1/sources/{id}/claims` | write | `(source_id, claim_key)` |
| attach_evidence | `kr.attach_evidence` | `POST /v1/claims/{id}/evidence` | write | `(claim_id, artifact_ref)` |
| synthesize_note | `kr.synthesize_note` | `POST /v1/notes` | write | caller `idempotency_key` |
| classify_signal | `kr.classify_signal` | `POST /v1/signals/{id}/classify` | write | `(signal_id, label)` |
| record_decision | `kr.record_decision` | `POST /v1/decisions` | write | caller `idempotency_key` |
| link | `kr.link` | `POST /v1/edges` | write | `(from, rel, to)` |
| import_projection | `kr.import_projection` | `POST /v1/imports` | write | `(source_product, export_id)` |
| search | `kr.search` | `GET /v1/search` | read | n/a |
| get | `kr.get` | `GET /v1/entities/{id}` | read | n/a |
| export_bundle | `kr.export_bundle` | `POST /v1/exports` | read* | n/a |
| verify_audit | `kr.verify_audit` | `GET /v1/audit/verify` | read | n/a |

\* `export_bundle` mutates nothing in the knowledge store; it produces a signed, re-redacted artifact (ADR-0007).
It is `readOnlyHint:true` but logs an audit record (export is a boundary crossing).

### Read vs mutating
- **Mutating (write):** `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal,
  record_decision, link, import_projection`. There is **no `update`/`delete`**; corrections are new versions linked
  by a `supersedes` edge (ADR-0001 §C, G7).
- **Read:** `search, get, export_bundle, verify_audit`. MCP marks these `readOnlyHint:true`; they may auto-run.
  Write tools default to **confirmation-required** for agents (G6).

## 3. Envelope (identical across API/MCP/CLI)
Every op returns the canonical typed envelope (ADR-0001 §6). MCP returns it as the tool result `content`; the API
returns it as the JSON body.

```jsonc
{
  "ok": true,
  "result": { "id": "ev_01J...", "status": "created" },   // op-specific payload, or null
  "error": null,                                            // or { code, message, details }
  "txn_id": "txn_…",       // echoes caller idempotency_key for retry-safety
  "audit_id": "aud_01J…"   // the hash-chained audit record this op appended
}
```

Error codes are the core guardrail codes, surfaced unchanged: `ERR_EVIDENCE_NOT_ARTIFACT`, `ERR_NOTE_AS_EVIDENCE`,
`ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_BOUNDARY_DOWNGRADE`, `ERR_ORIGIN_CONFLATION`, `ERR_NO_SUCH_OPERATION`,
`ERR_VALIDATION` (see [skill-interface research §5](../02-research/agent-skill-interface-and-mcp.md)). HTTP status
mapping:

| Envelope outcome | HTTP status |
|---|---|
| `ok:true`, created | 201 |
| `ok:true`, no-op (idempotent repeat) | 200 |
| `ERR_VALIDATION` / closed-schema reject | 422 |
| guardrail reject (`ERR_EVIDENCE_NOT_ARTIFACT`, `…_BOUNDARY_DOWNGRADE`, …) | 409 |
| auth/scope failure | 401 / 403 |
| referenced entity missing | 404 |

The HTTP status is a convenience; the **envelope `error.code` is canonical**. A client must read `ok`/`error`, not
infer from status alone.

## 4. Idempotency wiring
Same key semantics on both surfaces; only the carrier differs (ADR-0001, research §4/§7).

| Surface | Idempotency carrier |
|---|---|
| API | `Idempotency-Key` header (or natural key derived server-side for content ingest) |
| MCP | `idempotency_key` tool argument |

The core collapses duplicates inside one transaction: a repeat with identical args returns `result.status:"noop"`
with the original id, never a duplicate row. `idempotentHint:true` is set only where this holds.

## 5. The load-bearing schema (evidence gate)
`attach_evidence` is the structural enforcement of "generated text is never Evidence" (G1). The **same** closed
JSON Schema validates the API body and the MCP tool input — there is **no `text`/`summary` field**, and
`artifact_ref.ref` must resolve to a real `Source/Trace/SimulationRun/Experiment` or `file_uri`. Full schema is in
[research §3](../02-research/agent-skill-interface-and-mcp.md); abbreviated:

```jsonc
{ "type": "object", "additionalProperties": false,
  "required": ["claim_id", "artifact_ref", "boundary", "idempotency_key"],
  "properties": {
    "claim_id":     { "type": "string", "pattern": "^clm_[0-9a-z]+$" },
    "artifact_ref": { "type": "object", "additionalProperties": false,
      "required": ["kind","ref"],
      "properties": {
        "kind": { "enum": ["source","trace","simulation_run","experiment","file_uri"] },
        "ref":  { "type": "string" } } },     // id or URI — NEVER prose
    "boundary":        { "enum": ["public","internal","confidential"] },
    "idempotency_key": { "type": "string", "minLength": 8 } } }
```

## 6. Auth & scoping
The two surfaces have **different trust profiles**, so they authenticate differently but resolve to the same
**actor** and **scopes** that the core enforces.

| Surface | Primary caller | AuthN | AuthZ scopes |
|---|---|---|---|
| API | other independent products (CAW-01/05/03), scripts | per-product credential (TODO(open-question: static token vs mTLS vs signed-URL drop — ADR-0001/ADR-0006)) | `kr:read`, `kr:write`, `kr:import`, `kr:export` |
| MCP | AI agents, Jimmy via an MCP client | MCP session bound to an actor identity | same scope set; write tools gated by G6 confirmation |

Rules:
- **Actor stamping.** Every op records `actor:{kind: agent|human|product, id}` and `surface: api|mcp` in the audit
  (research §6). Boundary/visibility are enforced per-actor by the core, not by the surface.
- **Scope ≠ boundary bypass.** `kr:read` returns only items the actor's `visibility` (team/private) and `boundary`
  clearance permit; the read path is the same boundary-filtered path the viewer uses. No scope grants a boundary
  downgrade (G4).
- **Import/export are separate scopes** because they are boundary crossings with mandatory re-redaction (ADR-0007).
  `import_projection` requires `kr:import`; `export_bundle` requires `kr:export`.
- **AI-authored cap.** Per ADR-0004, agent-authored content is capped at trust T2; the surface cannot raise it.
- **Confirmation (G6).** For MCP, write tools default to confirmation-required unless an explicit allow-policy is
  set. TODO(open-question: confirmation granularity — per-tool / per-boundary / per-actor; ADR-0001/ADR-0004).
- The API is for **trusted independent products**; it still passes through the identical core guardrails (a trusted
  caller cannot conflate origins or downgrade a boundary).

## 7. Discoverability (MCP-specific)
The MCP server advertises each tool with: name, description, the closed input JSON Schema, and the annotation
triple `readOnlyHint`/`destructiveHint`/`idempotentHint` (research §2). Clients use the annotations to decide
auto-run vs prompt. No `destructiveHint:true` tool exists in v0 (append-only). `kr.verify_audit` lets a client
recompute the hash chain to detect tampering.

## Open Questions
- TODO(open-question: API auth model for independent products — static token vs mTLS vs signed-URL drop).
- TODO(open-question: confirmation-policy granularity for agent writes via MCP).
- TODO(open-question: whether the API exposes a streaming/paged variant of `search` for large result sets).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (op manifest + codegen):** generate API routes + MCP tools + shared schemas from one manifest; parity test.
- **RB (API surface):** route-per-op, `Idempotency-Key` header, scope middleware, envelope + status mapping.
- **RB (MCP server):** tool-per-op with annotations; G6 confirmation gate; `kr.verify_audit`.
- **RB (negative tests):** assert `attach_evidence` rejects prose and a note-as-evidence across API and MCP.

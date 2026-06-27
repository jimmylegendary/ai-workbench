# Component Boundaries — module ownership, the op manifest, and core services

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./system-architecture.md](./system-architecture.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Fix the **module ownership map** inside CAW-02: which module owns which responsibility, the **one op manifest**
from which all three write surfaces are codegen'd, and the **signature-level** contracts of the six core services
(Ingest, Retrieve, Provenance/Trust, Boundary, Audit, ImportExport) plus the reindex component. This is the
internal counterpart to [system-architecture.md](./system-architecture.md) (the container view). It does NOT
redefine the data model (ADR-0003), trust ladder rules (ADR-0004), or storage layout (ADR-0002); it names the
modules that enforce them and the seams between them. Signatures are language-neutral pseudo-types (build
guidance, not final code).

## Module ownership map
| Module | Layer | Owns | MUST NOT |
|---|---|---|---|
| `adapters/api` `adapters/mcp` `adapters/cli` | C1 | transport ↔ typed op mapping; envelope rendering | contain any validation, gate, or store access |
| `manifest` | build-time | the single op declaration; codegen of adapters + schemas | hold runtime state |
| `core/ingest` | C2 | the 6-stage write pipeline; orchestrates the txn | bypass Provenance/Boundary/Audit |
| `core/retrieve` | C2 | filtered + ranked reads; provenance hydration | return opaque blobs; skip boundary filter |
| `core/provenance` | C2 | evidence gate; trust ladder; lineage edges | accept prose as evidence |
| `core/boundary` | C2 | boundary/visibility propagation (monotone) | downgrade on synthesis |
| `core/audit` | C2 | append-only `_events` + hash-chained audit | mutate/delete prior entries |
| `core/importexport` | C6→C2 | re-redaction; allow-list; envelope (de)serialize | write nodes except via `core/ingest` |
| `store/files` | C3 | read/write md (frontmatter+body); `_events`; git | enforce invariants (passive) |
| `store/index` | C4 | SQLite node/edge/event + FTS; query exec | be a source of truth |
| `reindex` | C5 | deterministic rebuild of C4 from C3 + invariant re-check | author content; differ from validator layer 2 |

**Dependency direction (enforced):** `adapters → core/* → store/*`. `core/ingest` is the only module that
**writes** through `store/files` then `store/index`; every other write path is a bug. `reindex` is the only
non-core writer of `store/index`, and it only re-derives.

## The one op manifest → codegen'd adapters
A single declarative manifest is the source of truth for every operation. The three write surfaces, their input
JSON Schemas, and the API routes are **generated** from it; a parity contract test asserts they expose an
identical operation set (ADR-0001 §3).

```yaml
# manifest/ops.yaml  (one entry per operation — illustrative shape)
- op: attach_evidence            # canonical name; MCP=kr.attach_evidence, CLI=kr attach-evidence
  kind: write                    # write | read
  idempotent: true               # requires idempotency_key
  read_only_hint: false          # MCP annotation; reads => true (may auto-run)
  confirm: agent_default         # agent writes confirm by default (ADR-0001 §5)
  input_schema:                  # the ONLY place a field is declared
    claim_ref:   {type: node_ref, kind: claim, required: true}
    artifact_ref:{type: artifact_ref, required: true}   # NOTE: no prose/summary field exists
    stance:      {enum: [supports, challenges], required: true}
    locator:     {type: string, required: false}        # span/page; not the evidence itself
  errors: [ERR_EVIDENCE_NOT_ARTIFACT, ERR_NOTE_AS_EVIDENCE]
```

Codegen targets (no hand-written drift):
| Generated artifact | From manifest field |
|---|---|
| MCP tool def + annotations | `op`, `read_only_hint`, `confirm`, `input_schema` |
| CLI subcommand + flags (`--json`, `--idempotency-key`, `--yes`) | `op`, `kind`, `idempotent`, `input_schema` |
| API route (`POST /v1/<resource>`) | `op`, `kind`, `input_schema` |
| Shared validation schema (used by core) | `input_schema`, `errors` |
| Parity contract test fixtures | whole entry |

Op catalog (ADR-0001 §4): **writes** `add_source`, `extract_claims`, `attach_evidence`, `synthesize_note`,
`classify_signal`, `record_decision`, `link`, `import_projection`; **reads** `search`, `get`, `export_bundle`,
`verify_audit`. Adding an operation = editing the manifest, never hand-patching three surfaces.

## Common contracts
```
TxnEnvelope   = { ok: bool, result?: any, error?: ErrCode, txn_id: str, audit_id: str }
NodeRef       = { kind: NodeKind, id: str }                 # resolves to a real node or fails
ArtifactRef   = { kind: source|trace|simulation_run|experiment|file_uri, ref: str }
WriteResult   = { node_id: str, version: int, status: NodeStatus, trust: Trust, boundary: Boundary }
RetrievalHit  = { node: Node, chain: ProvChain, trust: Trust, boundary: Boundary, score: float }
ProvChain     = Note? -cites-> Claim -evidence_for- Evidence -extracted_from-> Source|Trace|Sim|Exp
```
Every op returns `TxnEnvelope`. `txn_id` echoes the caller's `idempotency_key` for retry-safety
(ADR-0001 §6).

## Core service signatures

### Ingest (`core/ingest`) — owns the write txn, ADR-0005
Orchestrates the 6-stage pipeline; each stage attaches provenance and never violates Claim→Evidence.
```
add_source(payload, ctx)        -> TxnEnvelope<WriteResult>   # stage 1
extract_claims(source_ref, ctx) -> TxnEnvelope<[WriteResult]> # stage 3, candidates (reviewed by default)
attach_evidence(claim_ref, artifact_ref, stance, ctx) -> TxnEnvelope<WriteResult>  # stage 4 (the gate)
synthesize_note(claim_refs, ctx)-> TxnEnvelope<WriteResult>   # stage 5; generated=true, cited; NEVER evidence
classify_signal(signal_ref, ctx)-> TxnEnvelope<WriteResult>   # stage 6; supports/refutes → may raise OpenQuestion
record_decision(payload, ctx)   -> TxnEnvelope<WriteResult>
link(src_ref, dst_ref, rel, ctx)-> TxnEnvelope                # rejects illegal rels (e.g. note as evidence_for)
```
Internally each call does: schema-validate → `provenance.gate` → `boundary.propagate` →
`provenance.recompute_trust` → `store.files.write` → `store.index.mirror` → `audit.append` →
invariant re-check → commit-or-abort (system-architecture write flow).

### Retrieve (`core/retrieve`) — ADR-0006
```
search(query, filters, ctx)     -> TxnEnvelope<[RetrievalHit]>
   # filters {boundary, visibility, type, trust, concept} applied BEFORE BM25 ranking
get(node_ref, ctx)              -> TxnEnvelope<RetrievalHit>     # hydrates full ProvChain
```
No embeddings in v0; the vector sidecar is reserved (ADR-0006). Reads are `read_only_hint:true`.

### Provenance / Trust (`core/provenance`) — owns the gate, ADR-0004 §2–§4
```
gate(claim_ref, artifact_ref)   -> Ok | ERR_EVIDENCE_NOT_ARTIFACT | ERR_NOTE_AS_EVIDENCE
   # STRUCTURAL: artifact_ref MUST resolve to a real artifact; a note/summary can NEVER be evidence
recompute_trust(node_ref)       -> Trust   # derived ladder T0..T3 | contested; AI-authored capped at T2
lineage(node_ref)               -> ProvChain
```
Trust is **derived, never caller-set** (ADR-0003 common fields). The gate is the heart of the product.

### Boundary (`core/boundary`) — ADR-0004 §3
```
propagate(node_ref, parents)    -> {boundary, visibility}   # MONOTONE: synthesis never downgrades
check_export(node_set, target)  -> Ok | ERR_BOUNDARY_DOWNGRADE   # fail-closed allow-list
```
Two orthogonal axes: `boundary {public,internal,confidential}` and `visibility {team,private}`,
default-deny / default-private (ADR-0003).

### Audit (`core/audit`) — ADR-0001 §1, ADR-0002 §1
```
append(op, node_id, payload)    -> audit_id   # append-only _events JSONL + hash-chained entry
verify_audit(range?)            -> {ok, broken_at?}   # backs kr.verify_audit; recomputes hash chain
```
Never updates or deletes; corrections are new versions linked by `supersedes` (append-only, ADR-0001 §C).

### ImportExport (`core/importexport`) — C6, ADR-0007
```
import_projection(envelope, ctx)-> TxnEnvelope<[WriteResult]>
   # quarantine → confidentiality check → re-redact → map to nodes via core/ingest (NOT direct writes)
export_bundle(node_refs, target,ctx) -> TxnEnvelope<SignedBundle>
   # boundary.check_export (fail-closed) → re-redact → attach provenance manifest → sign
```
The only module that references CAW-01/03/05, and only as files/typed-API boundaries between independent
products — no shared store (ADR-0007, brief §7).

## The reindex component (`reindex`, C5) — ADR-0002 §2, ADR-0003 layer 3
```
reindex(knowledge_dir) -> {nodes, edges, events, violations[]}
   1. drop & recreate SQLite index (node, edge, event, FTS)
   2. parse every knowledge/<kind>/*.md  (frontmatter = machine contract)
   3. mirror nodes + edges + replay _events
   4. RE-RUN Claim→Evidence invariant (validator layer 3) — fail loud on any violation
   5. recompute content_hash; mismatch ⇒ source file wins, index is rebuilt
```
**Determinism contract:** dropping the index and rerunning `reindex` yields **byte-identical query results**.
The invariant logic is the *same code* as core validator layer 2 (no second implementation), so files and index
can never disagree on validity (ADR-0003 enforcement table).

## Module interaction matrix (who may call whom)
| caller ↓ \ callee → | adapters | core/* | store/files | store/index | reindex |
|---|---|---|---|---|---|
| adapters | — | ✅ ops | ✗ | ✗ | ✗ |
| core/ingest | ✗ | ✅ | ✅ write | ✅ mirror | ✗ |
| core/retrieve | ✗ | ✅ | ✗ | ✅ read | ✗ |
| core/importexport | ✗ | ✅ ingest | ✗ | ✗ | ✗ |
| reindex | ✗ | ✅ validator | ✅ read | ✅ rebuild | — |
| viewer | ✗ | ✅ reads | ✗ | ✗ | ✗ |

Any ✗-crossed call is an architecture violation and a failing acceptance check.

## Open Questions
- `TODO(open-question: confirmation policy granularity — per-tool vs per-boundary vs per-actor allow-lists; owned with ADR-0004.)`
- `TODO(open-question: do importers persist rejected/quarantined candidates as nodes, and under what boundary? ADR-0005.)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (op manifest + codegen):** one `manifest/ops.yaml` → MCP tools, CLI subcommands, API routes, shared
  schemas; parity contract test as acceptance.
- **RB (core services):** implement Ingest/Retrieve/Provenance/Boundary/Audit/ImportExport behind the
  signatures above; the gate and trust recompute live only in `core/provenance`.
- **RB (reindex):** share invariant code with core validator; assert byte-identical rebuild.
- **RB (negative tests):** assert the interaction matrix — no adapter/importer/viewer writes the store directly.

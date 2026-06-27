# Backend API — Product-Core Operation Contract

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./ingestion-service.md](./ingestion-service.md)
  - [./retrieval-service.md](./retrieval-service.md)
  - [./persistence-and-index.md](./persistence-and-index.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc defines the **typed operation contract of the product core** — the single transactional service that
ADR-0001 puts behind every surface. It lists the core services (`IngestService`, `RetrieveService`,
`ProvenanceTrustService`, `BoundaryService`, `AuditService`, `ImportExportService`), their operations, and their
inputs/outputs at signature level. It does NOT define the ingestion pipeline internals (see
[ingestion-service.md](./ingestion-service.md)), retrieval ranking (see [retrieval-service.md](./retrieval-service.md)),
or the file/index/event mechanics (see [persistence-and-index.md](./persistence-and-index.md)). It is the boundary the
codegen'd MCP/CLI/API adapters call; adapters add nothing (ADR-0001 §1).

## Cross-cutting contract (every operation)

All write operations are **vetted transactions**, append-only, and return one **typed envelope** (ADR-0001 §6):

```ts
type Envelope<R> = {
  ok: boolean
  result?: R
  error?: { code: ErrCode; message: string; offending_ids?: Id[] }
  txn_id: string        // echoes caller idempotency_key; retry-safe
  audit_id: string      // hash-chained audit entry (AuditService)
}

type ErrCode =
  | "VALIDATION"          // schema / data-model violation
  | "EVIDENCE_GATE"       // prose-as-evidence or unresolvable artifact_ref (ADR-0004)
  | "INVARIANT"           // Claim has no supporting Evidence (ADR-0003)
  | "BOUNDARY"            // would downgrade boundary / leak across crossing (ADR-0004/0007)
  | "CONFLICT"            // idempotency / supersedes target mismatch
  | "NOT_FOUND"
  | "QUARANTINED"         // import held for curator (ADR-0007)
  | "CONFIRM_REQUIRED"    // agent write awaiting confirmation (ADR-0001 §5)
```

Shared scalar/value types used below:

```ts
type Id        = string                                   // entity id (ADR-0002 ID scheme TODO)
type Kind      = "source"|"claim"|"evidence"|"note"|"concept"|"interest"
               | "open-question"|"decision"|"assumption"
               | "trace"|"simulation-run"|"experiment"|"related-work"|"radar-signal"
type Boundary  = "public"|"internal"|"confidential"       // sensitivity axis (ADR-0004)
type Scope     = "team"|"private"                          // visibility axis (ADR-0004)
type Trust     = "T0"|"T1"|"T2"|"T3"|"contested"          // derived ladder (ADR-0004)
type Rel       = "supports"|"refutes"|"about"|"derived-from"|"supersedes"|"related-work"|"answers"
type Actor     = { kind: "human"|"agent"; id: string }
type WriteOpts = { idempotency_key: string; actor: Actor; confirm?: boolean }
type ArtifactRef = { uri: string; sha256?: string; location?: string } // path/URI; NEVER prose
```

**Write order is fixed** (ADR-0002 §6): file → index mirror → `_events` append → validate → commit; any failure
aborts the whole transaction (no orphan files). Every service method below executes inside that single core txn.

## Service map

| Service | Responsibility | Read/Write | Backing doc |
|---|---|---|---|
| `IngestService` | append entities through the 6-stage pipeline + review queue | write | [ingestion-service.md](./ingestion-service.md) |
| `RetrieveService` | FTS + structured filters + provenance hydration + citation assembly | read | [retrieval-service.md](./retrieval-service.md) |
| `ProvenanceTrustService` | edge linking, trust recompute, supersedes, invariant re-check | write/read | ADR-0003/0004 |
| `BoundaryService` | boundary+visibility computation & monotone propagation | read (pure) | ADR-0004 |
| `AuditService` | append-only `_events` + hash-chained audit; verify | write/read | [persistence-and-index.md](./persistence-and-index.md) |
| `ImportExportService` | quarantine import + fail-closed export across product boundaries | write/read | ADR-0007 |

## IngestService

The skill-wrap write tools (ADR-0001 §4). Each enforces exactly one invariant. Full stage behavior in
[ingestion-service.md](./ingestion-service.md).

```ts
interface IngestService {
  add_source(in: {
    title: string; body?: string; artifact?: ArtifactRef
    boundary: Boundary; scope: Scope; external_ids?: string[]
  }, o: WriteOpts): Envelope<{ id: Id }>

  extract_claims(in: {
    source_id: Id; candidates: { text: string }[]
  }, o: WriteOpts): Envelope<{ claim_candidate_ids: Id[]; review_ticket: Id }>

  // EVIDENCE GATE: no prose field; artifact_ref MUST resolve to a real artifact node/uri.
  attach_evidence(in: {
    claim_id: Id; artifact_ref: ArtifactRef | { node_id: Id }; rel?: "supports"|"refutes"
  }, o: WriteOpts): Envelope<{ evidence_id: Id; edge_id: Id }>

  // synthesis is a cited Note, generated=true — NEVER evidence
  synthesize_note(in: {
    body: string; cites: Id[]; about?: Id[]; generated: boolean
    boundary?: Boundary; scope?: Scope
  }, o: WriteOpts): Envelope<{ note_id: Id }>

  classify_signal(in: {
    signal_id: Id; classification: "threat"|"support"|"unknown"; target_id?: Id
  }, o: WriteOpts): Envelope<{ related_work_id?: Id; open_question_id?: Id }>

  record_decision(in: {
    title: string; body: string; cites?: Id[]; boundary: Boundary; scope: Scope
  }, o: WriteOpts): Envelope<{ id: Id }>

  // review queue (ADR-0005: agent submissions reviewed by default)
  review_accept(in: { review_ticket: Id; ids?: Id[] }, o: WriteOpts): Envelope<{ accepted: Id[] }>
  review_reject(in: { review_ticket: Id; ids?: Id[]; reason: string },
                o: WriteOpts): Envelope<{ rejected: Id[]; retained_for_audit: boolean }>
}
```

Invariants enforced here (and re-checked at reindex, ADR-0002 §5 / ADR-0003): a `claim` is not durable until it has
≥1 `supports` edge to an `evidence`; `attach_evidence` rejects a `note`/`generated-summary` target (`EVIDENCE_GATE`);
`synthesize_note` with `generated:true` can never be cited as evidence.

## ProvenanceTrustService

```ts
interface ProvenanceTrustService {
  link(in: { src_id: Id; dst_id: Id; rel: Rel }, o: WriteOpts): Envelope<{ edge_id: Id }>

  supersede(in: { old_id: Id; new_id: Id; reason: string },
            o: WriteOpts): Envelope<{ edge_id: Id }>     // append-only correction (ADR-0001 §C)

  recompute_trust(in: { id: Id }, o: WriteOpts): Envelope<{ trust: Trust }>
  // derived ladder T0–T3 + contested; AI-authored capped at T2 (ADR-0004)

  get_chain(in: { id: Id; max_depth?: number }):
    Envelope<{ chain: { id: Id; kind: Kind; rel?: Rel }[] }>   // read; hydrated provenance
}
```

`recompute_trust` is **derived, never set by callers**: it reads evidence count/kind, contestation edges
(`refutes`), and authorship; an AI `actor` caps the result at `T2`. `link` of a `supports` edge into a `claim`
triggers a trust recompute on that claim within the same txn.

## BoundaryService (pure, read-only)

Boundary logic is computation, not storage; surfaces and other services call it before anything is returned or
written (ADR-0004 two orthogonal axes + monotone propagation).

```ts
interface BoundaryService {
  effective_boundary(in: { id: Id }): Envelope<{ boundary: Boundary; scope: Scope; derived_from: Id[] }>
  // monotone: synthesis is >= max(boundary of cited inputs); never downgrades

  can_release(in: { ids: Id[]; target_audience: Boundary; target_scope: Scope }):
    Envelope<{ allowed: Id[]; excluded: { id: Id; reason: string }[] }>
  // fail-closed: indeterminate => excluded (ADR-0007 §4)

  check_write_boundary(in: { id: Id; proposed: Boundary }):
    Envelope<{ ok: boolean }>   // rejects downgrades (BOUNDARY error)
}
```

## AuditService

```ts
interface AuditService {
  // called inside every write txn; mirrors the skill-wrap write to _events JSONL + hash chain
  append(in: { op: string; node_id?: Id; payload: object; actor: Actor }):
    Envelope<{ audit_id: string; seq: number; prev_hash: string; hash: string }>

  verify_audit(in: { from_seq?: number; to_seq?: number }):
    Envelope<{ ok: boolean; broken_at?: number }>     // hash-chain integrity (kr.verify_audit)

  history(in: { id: Id }): Envelope<{ events: { seq: number; ts: string; op: string }[] }>
}
```

The audit is two append-only ledgers in lockstep: `knowledge/_events/<ts>-<op>.jsonl` and signed git commits
(ADR-0002 §1). `verify_audit` validates the hash chain; git blame is the second witness. Mechanics in
[persistence-and-index.md](./persistence-and-index.md).

## RetrieveService (read-only)

```ts
interface RetrieveService {
  search(in: {
    q: string
    filters?: { boundary?: Boundary[]; scope?: Scope[]; kind?: Kind[]; trust?: Trust[]; concept?: Id[] }
    limit?: number
    viewer: Actor & { max_boundary: Boundary; scope: Scope }   // pre-ranking boundary gate
  }): Envelope<{ hits: RetrievalHit[] }>

  get(in: { id: Id; viewer: Actor }): Envelope<{ hit: RetrievalHit }>

  // citation-constrained synthesis; uncited claims rejected/flagged (ADR-0006 §5)
  answer(in: { q: string; viewer: Actor; persist_as_note?: boolean }):
    Envelope<{ answer_claims: { text: string; cites: Id[] }[]
               evidence: { id: Id; source: string; boundary: Boundary; trust: Trust; locator: string }[]
               unsupported: { text: string }[]; note_id?: Id }>
}
```

`RetrievalHit` is the envelope from ADR-0006 §4 (item + hydrated `Source→Claim→Evidence→Note` chain + trust +
boundary + locator + score). Boundary/scope filter runs **before** ranking and assembly. Detail in
[retrieval-service.md](./retrieval-service.md).

## ImportExportService

```ts
interface ImportExportService {
  import_projection(in: { envelope: Caw01Envelope }, o: WriteOpts):
    Envelope<{ evidence_id?: Id; simulation_run_id?: Id; quarantined?: boolean }>

  import_signals(in: { jsonl_path: string }, o: WriteOpts):
    Envelope<{ source_ids: Id[]; claim_candidate_ids: Id[]; open_question_ids: Id[] }>

  export_bundle(in: {
    claim_ids: Id[]; target_audience: Boundary; target_scope: Scope
  }, o: WriteOpts):
    Envelope<{ bundle_path: string; provenance_digest: string; excluded: { id: Id; reason: string }[] }>
}
```

All three are **vetted skill actions** (ADR-0007 §6): the same envelope validator, semver gate, re-redaction, and
boundary checks apply to agents and humans. `export_bundle` is **fail-closed** — an empty bundle, or an explicitly
requested confidential/`private` item in a `public` bundle, returns `ok:false` with `BOUNDARY` and `offending_ids`,
never a partial silent leak. `import_projection` returns `quarantined:true` (not an error) when the curator must
adjudicate confidentiality.

## Parity & manifest

Every operation above is one row of the **op manifest** (ADR-0001 §3): `{ name, json_schema, idempotency, kind:
read|write, mcp_annotations }`. MCP tools, CLI subcommands, and API routes are codegen'd from it; a contract test
asserts the three surfaces expose identical schemas. Read ops set `readOnlyHint:true` and may auto-run; agent writes
default to `CONFIRM_REQUIRED` until the caller passes `confirm:true` (ADR-0001 §5).

## Open Questions
- `TODO(open-question: confirmation granularity per-tool vs per-boundary vs per-actor — ADR-0001)`
- `TODO(open-question: API auth model between independent products — ADR-0001 / ADR-0007)`
- `TODO(open-question: ID scheme content-hash vs slug affects Id type — ADR-0002)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- Generate adapters from the manifest; the core implements these interfaces once.
- Negative tests: `attach_evidence` of a Note fails with `EVIDENCE_GATE` across MCP/CLI/API.
- Every write returns `{txn_id, audit_id}`; a missing `audit_id` is a build failure.

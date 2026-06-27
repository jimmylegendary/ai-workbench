# Agent Skill Interface & MCP

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - `../_meta/PRODUCT-BRIEF.md`
  - `../01-decisions/ADR-0001-product-surface-and-skill-interface.md` (planned)
  - `../01-decisions/ADR-0004-provenance-and-trust.md` (planned)
  - `../01-decisions/ADR-0005-ingestion-pipeline.md` (planned)
  - `../08-research-plan/open-questions.md` (planned)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc decides **how AI agents safely add/update knowledge in CAW-02** — the "skill-wrap". It specifies the
**MCP tool catalog**, the **typed/validated transaction** shape, **idempotency**, the **guardrails that prevent
provenance corruption** (most importantly: a generated summary can never be attached as `Evidence`), and the
**append-only audit** log. It also fixes **API + CLI + MCP parity** so all three surfaces enforce the *same*
core rules. It does NOT decide storage layout (ADR-0002), the full data model (ADR-0003), or import/export wire
formats (ADR-0006) — it consumes those as a stable core boundary. CAW-01/05/03 appear only as import/export
counterparties (separate products); there is no shared substrate.

## 1. Design stance

The three surfaces (typed **API**, **MCP server**, **CLI**) are **thin adapters over one core service**. No
surface may hold business logic the others lack. Every mutation flows through a single transactional core that
enforces invariants, writes the audit record, and returns a typed result. This is the only way to guarantee that
an agent (via MCP), a script (via CLI), and another product (via API) cannot diverge in what they are allowed to do.

```
agent ──MCP──┐
human ──CLI──┼──▶ skill-wrap (validation + guardrails) ──▶ core txn ──▶ store + append-only audit
CAW-0x ─API──┘                     (single chokepoint)
```

Grounding: MCP guidance converges on "thin, clearly-typed, discoverable tools with accurate write schemas,
idempotency, and documented failure modes", and the spec expects a human able to deny write invocations
([MCP best practices](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/),
[Stainless MCP tools](https://www.stainless.com/mcp/tools/)).

## 2. Recommended MCP tool catalog

Tools mirror the brief's value unit (`add source → extract claim → attach evidence → synthesize note (cited)`)
plus retrieval and signal intake. Each is a **vetted transaction**, not a generic "write row". Annotate every
tool with the standard MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can gate
auto-run ([tool annotations](https://chatforest.com/guides/mcp-tool-annotations-explained/)).

| Tool | Kind | Idempotent | Core invariant it carries |
|------|------|-----------|---------------------------|
| `kr.add_source` | write | yes (by `content_hash`) | Source is raw; records origin URI/boundary; no claims invented |
| `kr.extract_claims` | write | yes (by `(source_id, claim_key)`) | Each `Claim` links to the originating `Source` |
| `kr.attach_evidence` | write | yes (by `(claim_id, artifact_ref)`) | **Evidence must reference a concrete artifact/source, never free text or a generated note** |
| `kr.synthesize_note` | write | yes (by `idempotency_key`) | `Note` must cite ≥1 `Claim`; note is marked `generated=true` and is **not** evidence-eligible |
| `kr.classify_signal` | write | yes (by `(signal_id, label)`) | `RadarSignal/RelatedWork` classified threat/support, linked to a `Claim`/`OpenQuestion` |
| `kr.record_decision` | write | yes (by `idempotency_key`) | `Decision/OpenQuestion/Assumption` stays linked to evidence |
| `kr.link` | write | yes (by `(from,rel,to)`) | Typed edges only; rejects edges that would make a generated note an evidence source |
| `kr.import_projection` | write | yes (by `(source_product, export_id)`) | Imports CAW-01 projection as `Evidence`; boundary downgrade forbidden |
| `kr.search` | read | n/a | Returns items with trust level + boundary; no mutation |
| `kr.get` | read | n/a | Fetch entity + provenance chain (source→claim→evidence→note) |
| `kr.export_bundle` | read | n/a | Cited `Claim`+`Evidence` bundle for CAW-03; **public-safe filter applied** |

Notes:
- **No `update`/`delete` of provenance entities.** Corrections are new appended versions
  (`supersedes` edge) — the store is append-only at the knowledge level, not just the audit level.
- `kr.search`/`kr.get`/`kr.export_bundle` are `readOnlyHint:true` and safe to auto-run. All `write` tools default
  to **confirmation required** for agents (see §5).
- Every tool returns a typed envelope `{ ok, result?, error?, txn_id, audit_id }`; `txn_id` echoes the caller's
  `idempotency_key` for safe retry.

## 3. Typed & validated transactions

Every write tool input is validated against a **strict JSON Schema** (closed objects, enums for boundary/trust/
relation, max sizes) **before** the core runs. Schema rejection is the first guardrail and the primary defense
against tool-poisoning / injection-shaped payloads
([Truefoundry MCP security](https://www.truefoundry.com/blog/mcp-security-risks-best-practices)).

Example — the load-bearing one, `attach_evidence`:

```jsonc
{
  "type": "object", "additionalProperties": false,
  "required": ["claim_id", "artifact_ref", "boundary", "idempotency_key"],
  "properties": {
    "claim_id":     { "type": "string", "pattern": "^clm_[0-9a-z]+$" },
    "artifact_ref": {                       // MUST resolve to a Source/Trace/SimulationRun/Experiment
      "type": "object", "additionalProperties": false,
      "required": ["kind", "ref"],
      "properties": {
        "kind": { "enum": ["source", "trace", "simulation_run", "experiment", "file_uri"] },
        "ref":  { "type": "string" }        // id or URI; NEVER free text
      }
    },
    "boundary":        { "enum": ["public", "internal", "confidential"] },
    "trust":           { "enum": ["unverified", "reported", "corroborated", "established"] },
    "idempotency_key": { "type": "string", "minLength": 8 }
  }
}
```

There is **no `text`/`summary` field on `attach_evidence`** — it is structurally impossible to attach prose as
evidence. That is the schema-level enforcement of the brief's core invariant.

## 4. Idempotency

| Tool family | Idempotency key | Repeat-call behavior |
|-------------|-----------------|----------------------|
| content ingest (`add_source`) | `sha256(content)` | returns existing `source_id`, no duplicate row |
| derived facts (`extract_claims`, `attach_evidence`, `link`, `classify_signal`) | natural key tuple | second call is a no-op returning the same id |
| free creations (`synthesize_note`, `record_decision`) | caller-supplied `idempotency_key` | same key ⇒ same result; stored 30d |
| imports (`import_projection`) | `(source_product, export_id)` | re-import is a no-op |

Rule: a tool is `idempotentHint:true` **only if a repeat with identical args has no additional effect** —
idempotency is about retry-safety, not danger
([New Stack](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/)). Clients may
retry any write on timeout because the key collapses duplicates inside one core transaction.

## 5. Guardrails (provenance-integrity rules)

These are enforced in the core, so they hold for MCP, CLI, and API equally.

| # | Rule | Enforcement point | Failure mode |
|---|------|-------------------|--------------|
| G1 | **Generated text is never Evidence.** `attach_evidence` has no prose field; `artifact_ref.ref` must resolve to an existing `Source/Trace/SimulationRun/Experiment` row | schema + referential check | `ERR_EVIDENCE_NOT_ARTIFACT` |
| G2 | **Notes are marked generated and evidence-ineligible.** `synthesize_note` sets `generated=true`; `kr.link` rejects `(note)-[evidence_for]->(claim)` | core link validator | `ERR_NOTE_AS_EVIDENCE` |
| G3 | **Claim must cite evidence to leave `unverified`.** trust upgrade requires ≥1 attached evidence | core invariant on trust transition | `ERR_TRUST_WITHOUT_EVIDENCE` |
| G4 | **No boundary downgrade.** an item's `boundary` may only move to stricter; exports are public-safe only | core + `export_bundle` filter | `ERR_BOUNDARY_DOWNGRADE` |
| G5 | **No conflation.** public-source claims and internal claims cannot be merged/linked as same-origin | `kr.link` origin check | `ERR_ORIGIN_CONFLATION` |
| G6 | **Confirmation for writes by agents.** write tools require human approval unless an explicit allow-policy is set; reads auto-run | MCP server policy gate | n/a (deferred, not error) |
| G7 | **Append-only.** no destructive edit of provenance entities; corrections use `supersedes` | core (no update/delete tool exists) | `ERR_NO_SUCH_OPERATION` |
| G8 | **Size/rate limits + closed schemas** to blunt injection-shaped payloads | schema + middleware | `ERR_VALIDATION` |

G6 follows the spec's human-in-the-loop guidance and the 2026 consensus to disable blind auto-run for write
tools ([Practical DevSecOps](https://www.practical-devsecops.com/mcp-security-vulnerabilities/),
[Aptible](https://www.aptible.com/mcp-security/mcp-prompt-injection)).

## 6. Append-only audit

Every mutation appends one immutable record **in the same transaction** as the data change (no record ⇒ no
commit). Records are **hash-chained**: `hash = sha256(serialized_event || prev_hash)`, giving tamper-evidence
without adopting a blockchain
([HMAC hash chain](https://tracehold.ai/blog/immutable-audit-log-hmac-hash-chain/),
[immutable audit architecture](https://www.emergentmind.com/topics/immutable-audit-log)).

```jsonc
{
  "audit_id":   "aud_01J...",          // monotonic
  "ts":         "2026-06-28T...Z",      // RFC3339
  "actor":      { "kind": "agent|human|product", "id": "..." },
  "surface":    "mcp|cli|api",
  "tool":       "kr.attach_evidence",
  "idempotency_key": "...",
  "inputs_hash": "sha256:...",          // hash, not raw payload (boundary-safe)
  "result":     "created|noop|denied|error",
  "entity_refs": ["clm_...","src_..."],
  "prev_hash":  "sha256:...",
  "hash":       "sha256:..."
}
```

- **Confidential-safe:** store `inputs_hash`, not raw inputs; sensitive fields can be key-encrypted so the chain
  verifies over ciphertext and erasure = key-destruction without breaking the chain
  ([operating immutable trails](https://medium.com/@veritaschain/append-only-is-the-easy-part-e25820208213)).
- **Reconstructability:** the audit chain plus `supersedes` edges lets anyone replay how a synthesis was reached
  (brief §5 reconstructability requirement).
- A `kr.verify_audit` read tool recomputes the chain to detect tampering.

## 7. API + CLI + MCP parity

| Concern | MCP | CLI | API | Parity rule |
|---------|-----|-----|-----|-------------|
| Operation set | tool catalog §2 | one subcommand per tool (`kr add-source`, `kr attach-evidence`…) | one route per tool (`POST /v1/sources`…) | generated from **one shared op manifest** |
| Validation | JSON Schema | same schema | same schema | identical schemas, one source file |
| Idempotency | `idempotency_key` arg | `--idempotency-key` flag | `Idempotency-Key` header | same key semantics |
| Guardrails | core | core | core | enforced in core, never per-surface |
| Audit | yes | yes (`surface:cli`) | yes (`surface:api`) | same record, surface tagged |
| Output | typed envelope | `--json` returns same envelope; human table by default | same envelope | envelope is canonical |
| Confirmation | client gate (G6) | `--yes` to skip prompt | caller is trusted product; boundary still enforced | writes default to confirm |

Parity is structurally guaranteed by **codegen from one op manifest** (tool name, schema, idempotency key,
read/write kind, annotations). Adding a tool = editing the manifest; the three surfaces regenerate. A contract
test asserts the three surfaces expose the same operation set with the same schemas.

## 8. Tradeoffs

| Decision | Option A | Option B | Recommendation |
|----------|----------|----------|----------------|
| Tool granularity | many vetted transaction tools (§2) | few generic CRUD tools | **A** — semantics enforce provenance; CRUD leaks invariants to caller |
| Mutability | append-only + `supersedes` | in-place update/delete | **append-only** — required for reconstructability & audit |
| Audit integrity | hash-chain | plain log table | **hash-chain** — cheap tamper-evidence, no blockchain cost |
| Confirmation default | confirm all writes | auto-run, deny destructive only | **confirm writes** for agents; reads auto-run |
| Surface parity | codegen from one manifest | hand-write each surface | **codegen** — drift is the main parity risk |
| Embeddings in `search` | keyword now, vector later | vector v0 | keyword v0 (defer to retrieval ADR-0007) |

## Open Questions

- TODO(open-question: exact `trust` ladder values and the evidence-count thresholds for each transition — align
  with provenance/trust ADR-0004).
- TODO(open-question: should `synthesize_note` be allowed to *propose* new `Claim`s, or only cite existing ones?
  Proposal-only keeps Jimmy as reviewer (brief §10) but adds a review queue.)
- TODO(open-question: confirmation policy granularity — per-tool, per-boundary, or per-actor allow-lists for G6).
- TODO(open-question: audit retention + confidential-field encryption/erasure model — needs storage ADR-0002).
- TODO(open-question: how `import_projection` verifies a CAW-01 export is genuinely artifact-backed and not a
  pre-summarized blob, without a shared substrate — boundary format in ADR-0006).
- TODO(open-question: idempotency-key retention window — 30d placeholder above is unverified).

## Implications for runbooks

- **RB (core txn + audit):** build the single core service with the transactional `data-change + hash-chained
  audit append` and the guardrails G1–G8 as unit-tested invariants *before* any surface.
- **RB (op manifest + codegen):** define one op manifest; generate MCP tools, CLI subcommands, API routes, and
  shared JSON Schemas from it; add a parity contract test.
- **RB (MCP server):** expose the §2 catalog with annotations; implement the §5 G6 confirmation gate; add
  `kr.verify_audit`.
- **RB (CLI):** subcommand-per-tool with `--json`, `--idempotency-key`, `--yes`; identical envelope output.
- **RB (negative tests):** assert each guardrail rejects its attack — most importantly a test that **attaching a
  generated note as evidence fails** (G1/G2) across all three surfaces.

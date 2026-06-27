# ADR-0001: Product surface and agent skill interface

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../02-research/agent-skill-interface-and-mcp.md](../02-research/agent-skill-interface-and-mcp.md)
  - [../02-research/retrieval-and-rag.md](../02-research/retrieval-and-rag.md)
  - [ADR-0002-storage.md](ADR-0002-storage.md) (planned)
  - [ADR-0003-knowledge-data-model.md](ADR-0003-knowledge-data-model.md)
  - [ADR-0004-provenance-and-trust.md](ADR-0004-provenance-and-trust.md) (planned)
  - [ADR-0005-ingestion-pipeline.md](ADR-0005-ingestion-pipeline.md)
  - [ADR-0006-import-export-contracts.md](ADR-0006-import-export-contracts.md) (planned)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **surfaces** through which humans, AI agents, and other (independent) products interact with CAW-02, and
the shape of the **agent skill interface** (the "skill-wrap"). It fixes: which surfaces exist in v0, the rule that
all surfaces are thin adapters over **one product core**, and how agents perform vetted knowledge transactions
without corrupting provenance. It does NOT decide storage layout (ADR-0002), the data model (ADR-0003), provenance
& trust vocabulary (ADR-0004), ingestion mechanics (ADR-0005), or import/export wire formats (ADR-0006); it
consumes those as a stable core boundary.

## Context
- The brief (§4) names the primary surfaces: a typed **API**, an **MCP server**, and a **CLI**, plus an optional
  **read-only viewer** as a secondary surface. Rich editing UI is an explicit non-goal for v1 (§9).
- The product's whole reason to exist (§2, §5, §10) is **provenance integrity**: sources, claims, evidence, and
  generated synthesis stay distinct, and **generated summaries are never evidence**. If each surface re-implemented
  the rules, they would drift and a single weak surface would become the leak.
- Personas (§3) include **AI agents** that add/update knowledge. Agents are the highest-risk writers — they can
  produce fluent text at volume — so the interface they use must make corruption structurally hard, not merely
  discouraged.
- v0 scope (§2 "maturity caution") = **append + retrieve + skill-wrap**. No continual learning, no autonomous
  self-editing of knowledge.
- Independence (§1): CAW-02 has its own core, data, and deployment. CAW-01/05/03 are separate products reached only
  via import/export boundaries (ADR-0006). No shared runtime substrate.

## Options considered

### A. Surface architecture
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **One core, three thin adapters (API/MCP/CLI) + read-only viewer** | Single chokepoint enforces invariants; surfaces cannot diverge; agents/scripts/products provably equal | Requires an op-manifest + codegen discipline | **Chosen** |
| Independent implementations per surface | Each surface ships fast in isolation | Guaranteed rule drift; weakest surface = leak vector; violates §10 | Rejected |
| Single surface (API only), others later | Minimal v0 | Brief §4 explicitly wants MCP (agents) + CLI (humans/scripts) at v0; agents are a primary persona | Rejected |

### B. Agent interface style
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Vetted transaction tools** (add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, …) | Each tool carries one invariant; provenance enforced server-side; no prose-as-evidence path | More tools to define | **Chosen** |
| Generic CRUD tools (create/update/delete row) | Few tools | Leaks invariants to the caller; an agent can write a Claim with no Evidence or a Note as Evidence | Rejected |
| Free-form NL "remember this" tool | Easy for agents | Destroys the typed provenance chain that is the product | Rejected |

### C. Mutability
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Append-only knowledge + `supersedes` for corrections** | Reconstructable (§5); audit-friendly; safe for agents | Readers must resolve "latest" version | **Chosen** |
| In-place update/delete | Simpler reads | Destroys reconstructability; un-auditable; un-revertible agent damage | Rejected |

## Decision
1. **One product core behind all surfaces.** A single transactional core service owns all business logic:
   validation, the **evidence gate** (ADR-0004 §2.3), trust recomputation, boundary propagation, and the
   append-only audit. **API, MCP, and CLI are thin adapters** that translate transport ↔ the core's typed
   operations and add nothing else.

   ```
   agent ──MCP──┐
   human ──CLI──┼──▶ skill-wrap (schema + guardrails) ──▶ core txn ──▶ store + append-only audit
   CAW-0x ─API──┘                   (single chokepoint)
   ```

2. **Surfaces shipped in v0:**
   - **Typed API** — for other products (CAW-01/05/03) and programmatic callers. One route per operation
     (`POST /v1/sources`, …).
   - **MCP server** — the agent skill-wrap. One MCP tool per vetted transaction.
   - **CLI** — for Jimmy and scripts. One subcommand per operation (`kr add-source`, `kr attach-evidence`, …).
   - **Read-only viewer (optional, secondary)** — browse Source/Claim/Evidence/Note and their links; render trust
     and boundary badges; **no write path**. Rich editing UI is a non-goal (brief §9).

3. **Parity is structural, not manual.** All operations are declared in **one op manifest** (tool name, JSON
   Schema, idempotency key, read/write kind, MCP annotations). The three write surfaces and their shared
   validation schemas are **generated from that manifest**. A contract test asserts the three surfaces expose the
   same operation set with identical schemas. Adding an operation = editing the manifest.

4. **The MCP tool catalog (the skill interface)** mirrors the brief's unit of value plus retrieval and signal
   intake (detail and schemas in [the skill-interface research](../02-research/agent-skill-interface-and-mcp.md) §2):
   `kr.add_source`, `kr.extract_claims`, `kr.attach_evidence`, `kr.synthesize_note`, `kr.classify_signal`,
   `kr.record_decision`, `kr.link`, `kr.import_projection` (writes); `kr.search`, `kr.get`, `kr.export_bundle`,
   `kr.verify_audit` (reads). Each write tool is a **vetted transaction**, not a generic row write.

5. **Guardrails live in the core** so they hold identically across MCP/CLI/API. The load-bearing ones:
   - **Generated text is never Evidence.** `kr.attach_evidence` has **no prose/summary field**; its
     `artifact_ref` must resolve to an existing `Source/Trace/SimulationRun/Experiment` or `file_uri`. Attaching a
     `Note` as evidence is rejected. (Enforces brief §5/§10; see ADR-0003 invariant, ADR-0005 A3.)
   - **Append-only.** No `update`/`delete` tool exists; corrections are new versions linked by `supersedes`.
   - **Boundary never downgraded by a write**; exports are public-safe only (ADR-0004 §3, ADR-0006).
   - **Writes by agents default to confirmation-required**; reads (`kr.search/get/export_bundle/verify_audit`)
     are `readOnlyHint:true` and may auto-run.

6. **Typed envelope everywhere.** Every operation returns `{ ok, result?, error?, txn_id, audit_id }`. The CLI's
   `--json` and the API return the same envelope; the CLI also renders a human table by default. `txn_id` echoes
   the caller's `idempotency_key` for retry-safety.

7. **Retrieval surface returns provenance, not blobs.** `kr.search`/`kr.get` return the structured `RetrievalHit`
   envelope (item + hydrated `Source→Claim→Evidence→Note` chain + trust + boundary), per the
   [retrieval research](../02-research/retrieval-and-rag.md). Generation/RAG is an **opt-in** layer over an
   already-trustworthy result set; any synthesized answer is citation-constrained and, if kept, stored as a cited
   `Note` (never as `Evidence`).

## Consequences
**Easy:**
- Provenance integrity is enforced in exactly one place; a new surface inherits all guardrails for free.
- Agent contributions are auditable and reversible-by-record (append-only + hash-chained audit).
- Other products integrate via a stable typed API without touching CAW-02's internals (independence preserved).

**Hard / follow-on:**
- Must build the op-manifest + codegen + parity contract test **before** broad surface work (else drift returns).
- The read-only viewer needs the boundary/trust rendering to be correct, or it becomes a subtle leak surface;
  it must consume the same boundary-filtered read path as every other reader.
- v0 ships **keyword/FTS retrieval only**; semantic/vector search is deferred to ADR-0007 (additive behind the
  same `kr.search`).
- The confirmation-for-agent-writes policy needs a concrete granularity (per-tool / per-boundary / per-actor) —
  open question below.

**Build-order implication (for runbooks):** core txn + audit + guardrails first; then op-manifest + codegen of
MCP/CLI/API; then the MCP server with confirmation gate; the read-only viewer last and read-only.

## Open questions / revisit triggers
- `TODO(open-question: confirmation policy granularity for agent writes — per-tool vs per-boundary vs per-actor allow-lists; owned with ADR-0004.)`
- `TODO(open-question: API auth model for other independent products — static token vs mTLS vs signed-URL drop; aligns with ADR-0006.)`
- `TODO(open-question: should the viewer ever gain a thin "propose" path for humans, or stay strictly read-only in v1? Brief §9 says read-only for now.)`
- **Revisit** the FTS-only retrieval decision when ADR-0007's embedding triggers (A–D) fire.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (core txn + audit):** single transactional core with `data-change + hash-chained audit append`; guardrails
  G1–G8 (see skill-interface research §5) as unit-tested invariants, before any surface.
- **RB (op manifest + codegen):** one manifest → MCP tools, CLI subcommands, API routes, shared JSON Schemas;
  parity contract test.
- **RB (MCP server):** expose the §4 catalog with annotations; implement the confirmation gate; add `kr.verify_audit`.
- **RB (CLI):** subcommand-per-tool; `--json`, `--idempotency-key`, `--yes`; identical envelope output.
- **RB (viewer):** read-only browse over the boundary-filtered read path; render Claim/Evidence/Note distinctly
  with trust + boundary badges.
- **RB (negative tests):** assert attaching a generated note as evidence fails across MCP, CLI, and API.

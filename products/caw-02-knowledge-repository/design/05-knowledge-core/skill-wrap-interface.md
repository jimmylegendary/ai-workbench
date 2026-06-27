# Skill-Wrap Interface — the safe agent write surface

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../02-research/agent-skill-interface-and-mcp.md](../02-research/agent-skill-interface-and-mcp.md)
  - [./import-export-flows.md](./import-export-flows.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc elaborates the **skill-wrap**: the one safe interface through which AI agents (and humans, and other
products) perform vetted knowledge transactions without corrupting provenance. It pins down the **op manifest**,
the **transactional guardrails**, the **append-only + supersedes** mutation model, **confirmation-by-default** for
agent writes, and the **hash-chained audit** — and shows how these compose to make provenance corruption
structurally hard rather than merely discouraged. It does NOT re-decide the surface architecture (that is
[ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)), the data model
([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)), the trust/boundary vocabulary
([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)), or the import/export wire formats — those live in
the sibling [import-export-flows.md](./import-export-flows.md). It consumes all of these as a stable core boundary.

## 1. The one chokepoint
Per [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md), there is exactly **one
transactional core**. MCP (agents), CLI (Jimmy/scripts), and the typed API (other independent products) are thin
adapters that translate transport into one set of typed operations and **add nothing**. Every guardrail in §4 is
enforced in the core, so a weak or malicious surface cannot become a leak path.

```
agent ──MCP──┐
human ──CLI──┼──▶ skill-wrap ─▶ [1] schema gate ─▶ [2] referential + guardrail checks
CAW-0x ─API──┘                       │                        │
                                     ▼                        ▼
                              [3] core txn { data-change + event append + hash-chain }  (all-or-nothing)
                                     │
                                     ▼
                          markdown file(s) in git  +  _events/<ts>-<op>.jsonl
```
The store is markdown-in-git (single source of truth, [ADR-0002](../01-decisions/ADR-0002-storage.md)); the SQLite
index is derived and disposable. The audit therefore lives in **two mirrored, tamper-evident places**: the
append-only `_events/*.jsonl` chain and git's signed-commit history.

## 2. The op manifest
All operations are declared once in a single op manifest. The three write surfaces, their shared JSON Schemas, and
the parity contract test are **generated from it** — adding an operation means editing the manifest, never hand-
writing a surface. Each entry carries: tool name, JSON Schema, idempotency key recipe, read/write kind, MCP
annotations, and the guardrail ids it must satisfy.

```yaml
# op-manifest.yaml (excerpt — authoritative shape lives in the build, not here)
- op: kr.add_source
  kind: write
  idempotency: sha256(content)            # natural key
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  guards: [G4, G7, G8]
- op: kr.extract_claims
  kind: write
  idempotency: (source_id, claim_key)
  guards: [G7, G8]
- op: kr.attach_evidence                  # the load-bearing one
  kind: write
  idempotency: (claim_id, artifact_ref)
  guards: [G1, G3, G4, G5, G7, G8]
- op: kr.synthesize_note
  kind: write
  idempotency: idempotency_key
  guards: [G2, G7, G8]
- op: kr.classify_signal
  kind: write
  idempotency: (signal_id, label)
  guards: [G5, G7, G8]
- op: kr.record_decision                  # Decision | OpenQuestion | Assumption
  kind: write
  idempotency: idempotency_key
  guards: [G7, G8]
- op: kr.link
  kind: write
  idempotency: (from, rel, to)
  guards: [G2, G4, G5, G7, G8]
- op: kr.import_projection                 # see import-export-flows.md
  kind: write
  idempotency: (source_product, export_id)
  guards: [G1, G4, G5, G7, G8]
- op: kr.search        { kind: read, annotations: { readOnlyHint: true } }
- op: kr.get           { kind: read, annotations: { readOnlyHint: true } }
- op: kr.export_bundle { kind: read, annotations: { readOnlyHint: true } }   # see import-export-flows.md
- op: kr.verify_audit  { kind: read, annotations: { readOnlyHint: true } }
```

Tool catalog summary (full per-tool semantics in
[the skill-interface research](../02-research/agent-skill-interface-and-mcp.md) §2):

| Tool | Kind | Carries invariant |
|------|------|-------------------|
| `kr.add_source` | write | Source is raw; records origin URI + boundary; invents no claims |
| `kr.extract_claims` | write | each Claim links to its originating Source |
| `kr.attach_evidence` | write | **Evidence references a concrete artifact/source — never prose** |
| `kr.synthesize_note` | write | Note cites ≥1 Claim; `generated=true`; never evidence-eligible |
| `kr.classify_signal` | write | RadarSignal/RelatedWork classified threat/support, typed-linked |
| `kr.record_decision` | write | Decision/OpenQuestion/Assumption stays linked to evidence |
| `kr.link` | write | typed edges only; rejects note→evidence_for edges |
| `kr.import_projection` | write | CAW-01 projection → Evidence; no boundary downgrade |
| `kr.search` / `kr.get` | read | returns provenance chain + trust + boundary, never blobs |
| `kr.export_bundle` | read | cited Claim+Evidence bundle; fail-closed public-safe filter |
| `kr.verify_audit` | read | recomputes the hash chain to detect tampering |

## 3. Typed, validated transactions
Every write input is validated against a **strict, closed JSON Schema** (`additionalProperties:false`, enums for
boundary/trust/relation, max sizes) **before** the core executes. Schema rejection is the first guardrail and the
main defense against injection- / tool-poisoning-shaped payloads. The load-bearing schema — `attach_evidence` —
has **no `text`/`summary`/prose field at all**, so attaching generated prose as evidence is structurally
impossible, not merely validated against:

```jsonc
{
  "type": "object", "additionalProperties": false,
  "required": ["claim_id", "artifact_ref", "boundary", "idempotency_key"],
  "properties": {
    "claim_id":     { "type": "string", "pattern": "^clm_[0-9a-z]+$" },
    "artifact_ref": {                         // MUST resolve to a real artifact row
      "type": "object", "additionalProperties": false,
      "required": ["kind", "ref"],
      "properties": {
        "kind": { "enum": ["source","trace","simulation_run","experiment","file_uri"] },
        "ref":  { "type": "string" }          // id or URI; NEVER free text
      }
    },
    "boundary": { "enum": ["public","internal","confidential"] },
    "trust":    { "enum": ["unverified","reported","corroborated","established"] },
    "idempotency_key": { "type": "string", "minLength": 8 }
  }
}
```

Every op returns one typed envelope so retries and audits are uniform across surfaces:

```jsonc
{ "ok": true, "result": { "id": "evd_…" }, "error": null,
  "txn_id": "<echoes idempotency_key>", "audit_id": "aud_01J…" }
```

## 4. Guardrails (enforced in the core, identical on every surface)

| # | Rule | Enforcement | Failure code |
|---|------|-------------|--------------|
| G1 | **Generated text is never Evidence.** `attach_evidence` has no prose field; `artifact_ref.ref` must resolve to an existing Source/Trace/SimulationRun/Experiment/file_uri | schema + referential check | `ERR_EVIDENCE_NOT_ARTIFACT` |
| G2 | **Notes are generated + evidence-ineligible.** `synthesize_note` sets `generated=true`; `kr.link` rejects `(note)-[evidence_for]->(claim)` | core link validator | `ERR_NOTE_AS_EVIDENCE` |
| G3 | **No trust without evidence.** a Claim cannot leave `unverified` without ≥1 attached Evidence (AI-authored capped at T2) | trust-transition invariant | `ERR_TRUST_WITHOUT_EVIDENCE` |
| G4 | **No boundary downgrade.** `boundary`/`visibility` may only move stricter; propagation is monotone | core + export filter | `ERR_BOUNDARY_DOWNGRADE` |
| G5 | **No conflation.** a public Source and an internal/confidential artifact cannot be fused as one evidence/origin | `kr.link` + evidence origin check | `ERR_ORIGIN_CONFLATION` |
| G6 | **Confirmation for agent writes.** write tools require human approval unless an explicit allow-policy is set; reads auto-run | MCP confirmation gate (§6) | n/a (gate, not error) |
| G7 | **Append-only.** no update/delete op exists; corrections are new versions via `supersedes` | manifest has no such op | `ERR_NO_SUCH_OPERATION` |
| G8 | **Closed schemas + size/rate limits** to blunt injection-shaped payloads | schema + middleware | `ERR_VALIDATION` |

The three-layer enforcement of the Claim→Evidence invariant ([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md))
runs in lockstep: (1) frontmatter schema on the `.md`, (2) the core validator above, (3) the reindex re-check that
rejects any file violating the invariant. The skill-wrap is layer 2; it never relies on a single DB constraint.

## 5. Append-only + supersedes (how corrections work)
There is **no update and no delete** at the knowledge level — only at the disposable index, which is rebuilt. A
correction is a **new entity version** that points back with a `supersedes` edge; readers resolve "latest" by
walking the chain (or via the derived index's latest-flag).

```
clm_aaa (v1, trust=reported)
   ▲ supersedes
clm_aaa#2 (v2, trust=corroborated, +evidence evd_…)   ← current; v1 retained, never mutated
```

Why this matters for agents: an agent can never silently rewrite history or erase evidence. The worst it can do is
**append** a superseding version, which is itself a fully audited, reversible-by-record event. Reconstructability
(brief §5) is preserved because every prior version and every event remain on disk.

| Mutation intent | Mechanism | What is preserved |
|---|---|---|
| Fix a claim's wording | new version + `supersedes` | old wording, its evidence, the change event |
| Retract a claim | new version `status=retracted` + `supersedes` | the claim still exists for audit |
| Re-classify a signal | new `classify_signal` (idempotent on `(signal_id,label)`) | prior classification + actor |
| "Delete" | not available | — (use retract; G7) |

## 6. Confirmation-by-default for agent writes
Agents are the highest-risk writers, so **all write tools default to confirmation-required** when the actor is an
agent over MCP; reads (`kr.search/get/export_bundle/verify_audit`) are `readOnlyHint:true` and auto-run. Humans on
the CLI confirm interactively or pass `--yes`; another product over the API is a trusted caller but **boundary and
all G1–G8 guards still apply** — confirmation policy never relaxes the guardrails, it only gates *who can skip the
prompt*.

```
write request (actor=agent)
   ├─ schema gate (G8) ─ fail ─▶ ERR_VALIDATION
   ├─ referential + guard checks (G1–G5) ─ fail ─▶ ERR_*
   ├─ confirmation gate (G6): allow-policy match?
   │     yes ─▶ proceed     no ─▶ surface a human-approve prompt; deny ─▶ result:"denied" (audited)
   └─ core txn ─▶ commit + audit
```

`TODO(open-question: confirmation policy granularity — per-tool vs per-boundary vs per-actor allow-lists; owned with
ADR-0004 / ADR-0001.)` A `denied` outcome is still written to the audit chain so refused agent attempts are visible.

## 7. Hash-chained audit
Every mutation appends **one immutable event in the same transaction** as the data change — no event, no commit.
Events are **hash-chained** (`hash = sha256(serialized_event || prev_hash)`), giving tamper-evidence without a
blockchain. The chain is the append-only `_events/<ts>-<op>.jsonl`; git's signed commit history is the second,
independent audit ([ADR-0002](../01-decisions/ADR-0002-storage.md)).

```jsonc
{
  "audit_id":  "aud_01J…",                  // monotonic
  "ts":        "<RFC3339>",
  "actor":     { "kind": "agent|human|product", "id": "…" },
  "surface":   "mcp|cli|api",
  "tool":      "kr.attach_evidence",
  "idempotency_key": "…",
  "inputs_hash": "sha256:…",                // hash, not raw payload (boundary-safe)
  "result":    "created|noop|denied|error",
  "entity_refs": ["clm_…","evd_…","src_…"],
  "prev_hash": "sha256:…",
  "hash":      "sha256:…"
}
```

- **Confidential-safe:** the event stores `inputs_hash`, not raw inputs; sensitive fields can be key-encrypted so
  the chain verifies over ciphertext and erasure = key-destruction without breaking the chain.
- **Tamper-evident:** `kr.verify_audit` recomputes the chain end-to-end; any altered or removed event breaks it.
- **Reconstructable:** the chain plus `supersedes` edges replays exactly how any synthesis was reached.

## 8. How this prevents provenance corruption (threat → defense)

| Threat (agent or compromised surface) | Defense |
|---|---|
| Attach a generated summary as evidence | G1 — no prose field; `artifact_ref` must resolve (structural) |
| Promote a Note into the evidence chain | G2 — link validator rejects note→evidence_for |
| Mark a claim trusted with no evidence | G3 — trust transition requires ≥1 evidence; AI capped at T2 |
| Leak by downgrading a confidential item to public | G4 — monotone, downgrade rejected; export fail-closed |
| Fuse a public source with an internal projection | G5 — conflation guard forces separate origins |
| Rewrite / erase prior knowledge | G7 — append-only + supersedes; no destructive op exists |
| Inject via oversized / open payload | G8 — closed schema + size/rate limits |
| Flood writes unattended | G6 — confirmation-by-default for agents |
| Tamper with the audit log | hash chain + git history; `kr.verify_audit` detects it |
| A surface that "forgot" a rule | impossible — all guards live in the core, surfaces are codegen'd |

## Open Questions
- `TODO(open-question: confirmation policy granularity for agent writes — per-tool/per-boundary/per-actor.)`
- `TODO(open-question: should synthesize_note be allowed to PROPOSE new Claims, or only cite existing ones? Proposal-only keeps Jimmy as reviewer but needs a review queue.)`
- `TODO(open-question: idempotency-key retention window — 30d placeholder is unverified.)`
- `TODO(open-question: audit confidential-field encryption/erasure model — depends on ADR-0002.)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (core txn + audit):** single core with transactional `data-change + hash-chained event append`; G1–G8 as
  unit-tested invariants **before** any surface.
- **RB (op manifest + codegen):** one manifest → MCP tools, CLI subcommands, API routes, shared JSON Schemas;
  parity contract test asserting identical operation sets/schemas across surfaces.
- **RB (MCP server):** expose the §2 catalog with annotations; implement the G6 confirmation gate; add
  `kr.verify_audit`.
- **RB (CLI):** subcommand-per-tool with `--json`, `--idempotency-key`, `--yes`; identical envelope output.
- **RB (negative tests):** assert each guard rejects its attack across MCP/CLI/API — most importantly that
  attaching a generated note as evidence fails (G1/G2) on all three.

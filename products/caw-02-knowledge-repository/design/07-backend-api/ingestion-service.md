# Ingestion Service — 6-Stage Pipeline + Review Queue

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface.md](./api-surface.md)
  - [./persistence-and-index.md](./persistence-and-index.md)
  - [./retrieval-service.md](./retrieval-service.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describe the **service behind `IngestService`** ([api-surface.md](./api-surface.md)): the 6-stage ingestion
pipeline (ADR-0005), each stage's provenance side-effect, the evidence gate, and the **review queue** that holds
agent submissions until a curator accepts them. It does NOT define the typed operation signatures (see
[api-surface.md](./api-surface.md)), the file/event writer (see [persistence-and-index.md](./persistence-and-index.md)),
or import/export confidentiality rules (see ADR-0007). It elaborates ADR-0005; it never redefines it.

## The 6 stages

Each stage is an append-only step that attaches provenance and **never violates `Claim→Evidence`** (ADR-0005). A
generated summary is **never** evidence at any stage.

| # | Stage | Op (api-surface) | Produces | Provenance side-effect | Gate |
|---|---|---|---|---|---|
| 1 | add-source | `add_source` | `Source` (+ optional `ArtifactRef`) | node + `boundary`/`scope` stamp; artifact copied to vault | boundary floor |
| 2 | parse | internal | parsed text/anchors on the Source | `derived-from` to raw artifact; locators recorded | no node mutation of raw |
| 3 | extract Claim-candidates | `extract_claims` | candidate `Claim`s (held) | `about` link to Source; queued, NOT durable | review queue |
| 4 | attach Evidence | `attach_evidence` | `Evidence` + `supports` edge | edge to concrete artifact/source node | **evidence gate** |
| 5 | synthesize Note (cited) | `synthesize_note` | `Note` (`generated`) | `cites` edges to evidence/claims | note ≠ evidence |
| 6 | classify/link signal | `classify_signal` | `RelatedWork`/`OpenQuestion` link | `threat`/`support`/`unknown` typed edge | T0 if unknown |

```
add_source ─▶ parse ─▶ extract_claims ─▶ attach_evidence ─▶ synthesize_note ─▶ classify_signal
   (1)         (2)          (3)              (4)                (5)                 (6)
                            │ candidates                 every Claim is
                            ▼ enter review queue         non-durable until
                       [review_accept / review_reject]   it has ≥1 supports→Evidence
```

### Stage 1 — add-source
Creates a `Source` node from `{title, body?, artifact?, boundary, scope, external_ids?}`. Large artifacts are
**not inlined**; they are copied to the content-addressed vault and referenced by `artifact_uri` (ADR-0002 §7,
[persistence-and-index.md](./persistence-and-index.md)). The boundary is a **floor** — it may be raised later but a
write can never downgrade it (ADR-0004). `external_ids`/`doi` enable dedup on signal import (Stage 3 of CAW-05
intake, ADR-0007 §3).

### Stage 2 — parse
Deterministic extraction of text + **locators** (page/section/line anchors) from the source artifact for later
citation. Parse writes a `derived-from` edge from parsed content back to the raw artifact and stores locators; it
**never** mutates or replaces the raw artifact (reconstructability). Parse output is internal — no public op.

### Stage 3 — extract Claim-candidates
Turns parsed text into candidate `Claim`s. Candidates are written but flagged **non-durable** and attached to a
`review_ticket`. A candidate `Claim` with no evidence is expected at this stage — it cannot be retrieved as fact
and cannot be exported until it passes the gate and review. Each candidate gets an `about` edge to its `Source`.

### Stage 4 — attach Evidence (the gate)
**The structural evidence gate** (ADR-0004 §2.3, ADR-0001 §5). `attach_evidence`:
- has **no prose/summary field**;
- `artifact_ref` must resolve to an existing `Source/Trace/SimulationRun/Experiment` node or a real `file_uri`;
- attaching a `Note` or `kind=generated-summary` is **rejected** with `EVIDENCE_GATE`.

On success it creates an `Evidence` node + a `supports` (or `refutes`) edge to the `Claim`, then triggers a trust
recompute on the claim (`ProvenanceTrustService.recompute_trust`).

### Stage 5 — synthesize Note (cited)
Produces a `Note` from `{body, cites[], generated}`. Every synthesized Note is **citation-bearing** and, when
`generated:true`, is **structurally barred from being evidence** — it carries `evidence=false` and is excluded from
`attach_evidence` targets and from export-as-evidence (ADR-0006 §5, ADR-0007 §4). Boundary propagates **monotonically**:
the Note's effective boundary ≥ max(boundary of cited inputs) (`BoundaryService.effective_boundary`).

### Stage 6 — classify/link signal
For intake (CAW-05) signals: attaches `classification: threat|support|unknown`. `threat`/`support` become a typed
`RelatedWork` edge to the targeted `Claim`/`Concept`; `unknown` stores the signal unverified at `T0` and does
**not** auto-link. A credible **threat on an accepted claim auto-raises an `OpenQuestion`** and notifies the
reviewer (ADR-0007 §3).

## Review queue (agent submissions reviewed by default)

ADR-0005: in v0 there is **no silent auto-accept**. Agent-authored candidates land in a review queue; the curator
(or an allow-listed actor) accepts or rejects.

```ts
type ReviewTicket = {
  id: Id
  actor: Actor                 // who submitted (agent vs human)
  stage: 3 | 5 | 6             // which stage produced the held items
  items: { id: Id; kind: Kind; summary: string }[]
  state: "open" | "accepted" | "rejected" | "partial"
  created_at: string
}
```

| Path | Trigger | Effect |
|---|---|---|
| auto-hold | `actor.kind == "agent"` (default) | candidates non-durable; `CONFIRM_REQUIRED` returned with `review_ticket` |
| human direct | `actor.kind == "human"` + `confirm:true` | may bypass hold per confirmation policy `TODO(open-question)` |
| `review_accept` | curator | items become durable; durability re-checks the `Claim→Evidence` invariant |
| `review_reject` | curator + `reason` | items NOT deleted — **retained for audit** (append-only, ADR-0005); marked `rejected` |

Acceptance does not skip validation: at accept time the core re-runs the `Claim→Evidence` invariant and the
boundary checks, so a stale candidate cannot become durable without evidence.

## Provenance & trust on ingest

- Every stage emits an `_events` record and a hash-chained audit entry via `AuditService.append`
  ([persistence-and-index.md](./persistence-and-index.md)).
- Trust is **derived**, never asserted by the submitter; AI-authored entities cap at `T2` (ADR-0004). A claim with
  only `generated-summary` evidence cannot rise above the "not evidence-grade" floor and cannot be sole-cited.
- Boundary is **default-deny**, scope **default-private** (ADR-0004 §5) when a stage omits them.

## Transaction & failure behavior
Each op is one core txn with the fixed write order (file → index → `_events` → validate → commit, ADR-0002 §6). A
validation failure at any stage **aborts the whole transaction**: no orphan files, no half-written edges, no audit
entry for the aborted op. Idempotency: a repeated `idempotency_key` returns the original `txn_id`/result
(`CONFLICT` only on a key reused with a different payload).

## Error taxonomy (this service)

| Code | Stage | Cause |
|---|---|---|
| `EVIDENCE_GATE` | 4 | prose field present, unresolvable `artifact_ref`, or Note/summary target |
| `INVARIANT` | 3→accept | `Claim` durable-ized without ≥1 `supports`→`Evidence` |
| `BOUNDARY` | 1,5 | write would downgrade boundary, or Note boundary < cited input |
| `CONFIRM_REQUIRED` | 3,5,6 | agent submission held for review |
| `QUARANTINED` | (import) | see ADR-0007 / ImportExportService |

## Open Questions
- `TODO(open-question: confirmation/allow-list granularity for which agent actors may bypass review — ADR-0001/0004)`
- `TODO(open-question: parse anchor/chunk unit for long sources — ADR-0006)`
- `TODO(open-question: retention window/format for rejected candidates kept for audit — ADR-0005)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (ingest core):** implement stages 1–6 as one core txn each with abort-on-fail; evidence gate as a unit test.
- **RB (review queue):** ticket model, accept/reject with audit-retained rejects, re-validation on accept.
- **RB (negative tests):** Note-as-evidence, claim-without-evidence durability, boundary downgrade — all must fail.
- **RB (signal intake):** threat-on-accepted-claim → auto `OpenQuestion` + reviewer notify.

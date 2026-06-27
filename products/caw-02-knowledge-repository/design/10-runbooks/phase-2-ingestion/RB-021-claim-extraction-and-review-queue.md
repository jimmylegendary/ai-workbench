# RB-021: Schema-constrained claim extraction, dedup, and the review queue

- Status: ready
- Phase: phase-2-ingestion
- Depends on: [RB-020 (6-stage ingestion pipeline: stage-3 `extract_claims` hook, stage-4 gate)], [phase-1-core: core validator + evidence gate], [phase-0-foundations: Claim/Evidence frontmatter schemas]
- Implements design: [../../05-knowledge-core/ingestion-pipeline.md](../../05-knowledge-core/ingestion-pipeline.md) (A2, A4, A6, review state machine), [../../07-backend-api/ingestion-service.md](../../07-backend-api/ingestion-service.md) (review queue), [../../01-decisions/ADR-0005-ingestion-pipeline.md](../../01-decisions/ADR-0005-ingestion-pipeline.md)
- Produces: a schema-constrained LLM claim-candidate extractor (A2); exact-hash + semantic union-merge dedup (A4); and the review queue + state machine (`proposed → accepted/needs_evidence/rejected`) with no silent auto-accept and audit-retained rejects.

## Objective
Turn parsed blocks into `ClaimCandidate`s via a schema-constrained LLM that must cite `supporting_block_ids`, dedup them (exact source-hash + semantic cosine within a `Concept` neighborhood, merge-by-union with logging), and hold all generated candidates in a review queue where a curator promotes them. "Done" = an agent can submit candidates at volume without corrupting provenance: every candidate carries extractor identity and block pointers, no candidate is auto-accepted in v0, and rejected candidates are **retained for audit**, not deleted.

## Preconditions
- [ ] RB-020 is green: `extract_claims` is wired as a proposed/non-durable producer and the structural evidence gate exists at stage 4.
- [ ] `ParsedDoc` blocks carry stable `block_id`/`char_span` locators.
- [ ] Trust recompute (derived, AI-capped T2) is available from the core.
- [ ] (For semantic dedup) an embedding routine is available OR the step is feature-flagged off pending `TODO(open-question: semantic dedup cosine threshold + embedding model)`.

## Steps

### 1. Define the `ClaimCandidate` extraction schema
- **Do:** Specify the JSON schema the LLM must emit per candidate:
  ```jsonc
  {
    "text": "string",
    "claim_type": "empirical|methodological|definitional|comparative|normative",
    "polarity": "affirm|negate",
    "supporting_block_ids": ["block_id", "..."],   // REQUIRED, non-empty
    "confidence": 0.0
  }
  ```
  At persist time, attach `model_id`, `prompt_hash`, `tool_version`, `generated: true`, `status: proposed`. Enforce non-empty `supporting_block_ids` at the schema layer.
- **Verify:** A candidate emitted with empty/missing `supporting_block_ids` is rejected by schema validation before any write. A candidate with a `claim_type` outside the enum is rejected.

### 2. Build the schema-constrained extractor (A2)
- **Do:** Implement the extractor as a constrained-decoding / JSON-schema LLM call over `ParsedDoc`. Persist each accepted-shape candidate with its extractor identity and an `about` edge to the `Source`. Quarantine an entire batch by `prompt_hash` if the prompt is later found bad — sources are never lost.
- **Verify:** Every persisted candidate has resolvable `supporting_block_ids` pointing at real blocks of its source, plus `model_id` + `prompt_hash` + `tool_version`. A malformed batch can be located and quarantined by `prompt_hash` without touching sources.

### 3. Exact source dedup (A4.1)
- **Do:** Before extraction, dedup sources by `content_hash` (already the `add_source` idempotency key). Re-ingesting the same artifact reuses the existing `source_id` and skips re-extraction unless `parser_version` changed.
- **Verify:** Re-ingesting an identical artifact produces no duplicate `Source` and no duplicate candidate set.

### 4. Semantic claim dedup with union-merge (A4.2)
- **Do:** For new candidates, compute similarity (embedding cosine) within the relevant `Concept` neighborhood. Above the high threshold (~0.9, domain-tuned, `TODO(open-question)`), **merge by union**: the surviving canonical claim accumulates *all* evidence and source pointers — nothing dropped. Log `{similarity, merged_into, decided_by}` as a merge event. Apply **monotone boundary on merge** (`internal` + `confidential` → `confidential`). Near-threshold matches go to **review**, not auto-merge.
- **Verify:** Merging two claims preserves the union of their evidence + source pointers (none lost); a merge event is recorded; the merged claim's boundary is the max of inputs; a near-threshold pair is routed to review rather than silently merged.

### 5. Review queue model
- **Do:** Implement the review ticket:
  ```ts
  type ReviewTicket = {
    id: Id; actor: Actor; stage: 3 | 5 | 6;
    items: { id: Id; kind: Kind; summary: string }[];
    state: "open" | "accepted" | "rejected" | "partial";
    created_at: string;
  }
  ```
  Agent-authored candidates (`actor.kind == "agent"`) auto-hold: items stay non-durable and the call returns `CONFIRM_REQUIRED` with the `review_ticket`. Human + `confirm:true` may bypass per the confirmation policy (`TODO(open-question)`).
- **Verify:** An agent submission returns `CONFIRM_REQUIRED` with a ticket and leaves all items non-durable. No agent path makes a candidate durable without a curator action.

### 6. Review state machine (no silent auto-accept)
- **Do:** Implement transitions, each append-only and mirrored to `_events` with actor + reason + timestamp:
  - `→ proposed` (extractor): schema-valid candidate with block refs.
  - `proposed → accepted` (curator): **only if the evidence gate is satisfied** (≥1 resolvable `artifact_ref`); on accept the core **recomputes trust** (AI-capped T2), not the caller.
  - `proposed → needs_evidence` (curator or gate): no resolvable artifact.
  - `proposed → rejected` (curator + reason): **retained for audit**, marked `rejected`, never deleted.
  - `accepted → superseded` (new write): append-only supersede, no update/delete.
- **Verify:** Accepting a claim with no resolvable evidence is blocked (lands/stays `needs_evidence`, not `accepted`). A rejected candidate persists with its reason and is excluded from retrieval-as-fact but remains in the audit record. Acceptance re-runs the `Claim→Evidence` invariant so a stale candidate cannot become durable without evidence.

### 7. Accept-time re-validation
- **Do:** On `review_accept`, re-run the `Claim→Evidence` invariant and boundary checks inside the accept transaction before items become durable.
- **Verify:** A candidate whose evidence was removed/never-attached fails `INVARIANT` at accept and does not become durable.

### 8. Audit + reindex consistency
- **Do:** Ensure every transition and merge appends an `_events` record and a hash-chained audit entry; git history is the audit trail. Rejected/retained candidates survive `reindex`.
- **Verify:** Dropping the SQLite index and re-running `reindex` reconstructs candidates, merge logs, and rejected items with their states from md-git.

## Acceptance criteria
- [ ] The extractor emits only schema-valid `ClaimCandidate`s; no candidate exists without non-empty `supporting_block_ids`.
- [ ] Every candidate carries `model_id` + `prompt_hash` + `tool_version` and `generated: true`; a bad batch is quarantinable by `prompt_hash`.
- [ ] Exact source-hash dedup prevents duplicate sources/candidate sets; semantic dedup merges by union with `{similarity, merged_into, decided_by}` logged and monotone boundary.
- [ ] Agent submissions auto-hold with `CONFIRM_REQUIRED`; no silent auto-accept path exists in v0.
- [ ] State machine transitions are append-only, audited (actor/reason/ts), and accept re-validates the invariant + boundary.
- [ ] Rejected candidates are retained for audit, excluded from retrieval-as-fact, never deleted.
- [ ] Trust is recomputed by the core on accept (AI-capped T2), never caller-set.
- [ ] Tree is green (build + lint + schema-validate + extraction/dedup/queue tests).

## Rollback / safety
- All state changes are append-only + supersede; nothing is destructively edited, so any erroneous transition is corrected by a new superseding event, preserving the audit trail.
- A bad extractor prompt/model is contained by quarantining its `prompt_hash` batch; sources are untouched.
- If dedup mis-merges, the union-merge log (`merged_into`) lets a reviewer reconstruct the pre-merge claims; correct by superseding.
- Drop + `reindex` rebuilds the derived index from md-git at any point.

## Hand-off
- RB-022 reuses A0–A2 (this extractor + candidate model) for resolving CAW-05 signals into `Source`/`ClaimCandidate`, and reuses this review state machine for stance-link review.
- Phase-3 retrieval can assume only `accepted` claims surface as fact, while `proposed`/`needs_evidence`/`rejected` are queryable for audit but never returned as evidence-grade.

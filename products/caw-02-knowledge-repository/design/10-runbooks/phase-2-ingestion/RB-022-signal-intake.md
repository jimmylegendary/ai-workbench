# RB-022: Signal intake (add-related-work-signal → classify → link-to-claim)

- Status: ready
- Phase: phase-2-ingestion
- Depends on: [RB-020 (6-stage pipeline: stage-6 `classify_signal` hook, evidence gate)], [RB-021 (A0–A2 extractor + candidate model + review state machine)], [phase-1-core: core validator + evidence gate], [phase-0-foundations: RelatedWork/RadarSignal/OpenQuestion frontmatter schemas]
- Implements design: [../../05-knowledge-core/ingestion-pipeline.md](../../05-knowledge-core/ingestion-pipeline.md) (Pipeline B, B0–B5), [../../07-backend-api/ingestion-service.md](../../07-backend-api/ingestion-service.md) (Stage 6 classify/link), [../../01-decisions/ADR-0005-ingestion-pipeline.md](../../01-decisions/ADR-0005-ingestion-pipeline.md)
- Produces: Pipeline B — CAW-05 radar/related-work signal intake that quarantines on import, resolves the external work to `Source`/`ClaimCandidate`, finds target internal `Claim`s, classifies 3-way stance, writes a stanced `RelatedWork`→`Claim` link backed by evidence on the external artifact, and auto-raises an `OpenQuestion` when a `REFUTE` lands on an accepted claim.

## Objective
A signal arriving from CAW-05 (a separate, independent product) becomes a typed entity **linked to our claims**, never a loose summary. "Done" = a CAW-05 envelope is quarantined and boundary-re-checked on intake, resolved to a deduped external `Source` + `ClaimCandidate`s, matched to internal `Claim`s via retrieval, classified `SUPPORT|REFUTE|NEI`, and linked with `Evidence` pointing at the **external work's artifact** (never the CAW-05 summary text) — and a `REFUTE` on an accepted claim automatically raises an `OpenQuestion` and notifies the reviewer. This is a file/API import boundary: **no shared store** with CAW-05.

## Preconditions
- [ ] RB-020 + RB-021 green: stage-6 edge writer, A0–A2 extractor, and the review state machine exist.
- [ ] A retrieval `search()` (FTS5/BM25 + structured filters) is callable for B2. If phase-3 retrieval is not yet built, B2 uses the minimal FTS lookup exposed by the core; embeddings are explicitly out of v0.
- [ ] The import envelope contract (versioned, signed) from CAW-05 is defined (ADR-0007); intake here consumes it but does not redefine the wire format.
- [ ] `RadarSignal`, `RelatedWork`, and `OpenQuestion` frontmatter schemas exist.

## Steps

### 1. B0 — Ingest signal (quarantine + boundary re-check)
- **Do:** Accept a CAW-05 envelope and write `RadarSignal`/`RelatedWork{source_ref, boundary, received_at, origin:"CAW-05"}`. Land it **quarantined** first; record origin product, original signal id, declared boundary, and receipt time. **Re-check the declared boundary on intake — never upgrade/trust it blindly**; run the confidentiality check before mapping to durable nodes.
- **Verify:** A freshly imported signal is quarantined and not yet linked to any claim. The boundary is re-validated on intake (a signal claiming `public` is not auto-accepted as public). Intake reads only the envelope — no shared DB/registry handle to CAW-05 exists.

### 2. B1 — Resolve to Source + ClaimCandidate (reuse A0–A2)
- **Do:** Resolve the cited external work to a `Source`, deduped by DOI/arXiv/S2 id (falls back to `content_hash`). Reuse the RB-021 extractor to produce `ClaimCandidate[]` for what the external work asserts. Store the CAW-05 `raw_summary` as `generated: true` context only — **excluded from evidence**.
- **Verify:** Re-importing a signal citing an already-known external work dedups to the existing `Source`. The `raw_summary` is stored as context and is structurally barred as an `artifact_ref` (cannot become Evidence). Candidates carry extractor identity + block/locator refs.

### 3. B2 — Find target internal claim(s)
- **Do:** For each external `ClaimCandidate`, retrieve matching internal `Claim[]` via `search()` (FTS5/BM25 + structured filters; embeddings later). Record match scores and the retrieval method used.
- **Verify:** B2 returns ranked internal claim matches with recorded scores + method; with no match, the flow records "no target" and parks the signal for review rather than fabricating a link.

### 4. B3 — Classify stance (re-validated, not trusted)
- **Do:** For each (external claim, internal claim) pair, classify `stance ∈ {SUPPORT, REFUTE(threat), NEI(neutral)}` with a `rationale` span + `confidence`, persisting classifier `model_id` + `prompt_hash`, `generated: true`. **Re-classify rather than trust CAW-05's own label** (`TODO(open-question: how much of CAW-05's classification to re-classify at B3)`).
- **Verify:** Each stance carries classifier identity, rationale, confidence, and `generated: true`; CAW-05's incoming label does not override the locally computed stance.

### 5. B4 — Link to claim (stanced edge + evidence on the external artifact)
- **Do:** Write a typed `supports`/`refutes` edge `RelatedWork`→`Claim`. Back it with `Evidence` whose `extracted_from` points at the **external work's artifact** (locator), passing the structural evidence gate — **never** the CAW-05 summary text. The link lands `proposed` for review.
- **Verify:** The evidence `extracted_from` resolves to the external artifact, not the CAW-05 summary (a summary target fails `EVIDENCE_GATE`). The stanced edge exists and is `proposed`.

### 6. B5 — Review / escalate (REFUTE on accepted claim → OpenQuestion)
- **Do:** Route proposed links through the RB-021 review state machine. **When a `REFUTE` stance targets an *accepted* `Claim`, automatically raise an `OpenQuestion`** (with an `addresses` edge to the claim) and notify the reviewer; record the escalation lineage. Everything else lands `proposed` for normal review. An `unknown`/no-target signal stores at `T0` and does **not** auto-link.
- **Verify:** A `REFUTE` signal on an accepted claim auto-creates exactly one `OpenQuestion` linked via `addresses`, plus a reviewer notification, with escalation lineage recorded. A `SUPPORT`/`NEI` signal creates no OpenQuestion. An unknown signal stays `T0` and unlinked.

### 7. Provenance, audit, idempotency
- **Do:** Every B-stage appends one `_events` record + hash-chained audit entry; origin + original signal id travel with the node. Make intake idempotent by external id / `content_hash` (re-importing the same signal is a no-op or supersede, not a duplicate). Trust derived (AI-capped T2), boundary monotone.
- **Verify:** Re-importing an identical signal does not create duplicate nodes/links. `reindex` from md-git reconstructs signals, stance links, evidence, and auto-raised OpenQuestions.

### 8. Worked end-to-end test
- **Do:** Add a test: import a CAW-05 envelope whose external work refutes an existing **accepted** internal claim; run B0→B5.
- **Verify:** The signal is quarantined then resolved to a deduped `Source`; a `refutes` edge is written with evidence on the external artifact; an `OpenQuestion` is auto-raised and the reviewer notified; nowhere is the CAW-05 summary stored as evidence; no shared-store access to CAW-05 occurs.

## Acceptance criteria
- [ ] Signals land quarantined with boundary re-checked on intake (never blindly upgraded); confidentiality check runs before durable mapping.
- [ ] External work resolves to a DOI/arXiv/S2-deduped `Source`; `raw_summary` is context-only and barred from being evidence.
- [ ] B2 uses `search()` and records match scores + method; no-match signals are parked, not fabricated-linked.
- [ ] Stance is locally classified (`SUPPORT|REFUTE|NEI`) with classifier identity + rationale; CAW-05's label is not trusted blindly.
- [ ] Stanced links carry `Evidence` pointing at the external artifact (passing the gate), never the CAW-05 summary.
- [ ] A `REFUTE` on an accepted claim auto-raises exactly one linked `OpenQuestion` + reviewer notification; unknown signals stay `T0` and unlinked.
- [ ] Intake is idempotent; all stages audited; `reindex` reconstructs everything from md-git.
- [ ] Boundaries are monotone; no shared store with CAW-05 — file/API boundary only.
- [ ] Tree is green (build + lint + schema-validate + signal-intake tests).

## Rollback / safety
- All writes are append-only + supersede; an erroneous link/classification is corrected by a superseding event, never deletion — audit lineage preserved.
- Quarantine-first means a failed confidentiality/boundary check stops a signal before it maps to durable nodes; the quarantined record is retained for audit.
- A bad classifier batch is quarantinable by `prompt_hash` without losing the source signal.
- Drop + `reindex` rebuilds the derived index from md-git.

## Hand-off
- Phase-3 retrieval can assume stance links and auto-raised OpenQuestions are queryable with provenance, and that only accepted claims/links surface as fact.
- Phase-5 import/export can assume the CAW-05 intake boundary (quarantine + re-redaction + confidentiality check) is the template for other inbound crossings; export of cited bundles to CAW-03 builds on the same evidence-on-artifact discipline.

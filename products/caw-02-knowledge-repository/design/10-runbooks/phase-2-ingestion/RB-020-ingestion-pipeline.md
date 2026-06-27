# RB-020: Build the 6-stage ingestion pipeline (add-source → … → classify/link)

- Status: ready
- Phase: phase-2-ingestion
- Depends on: [phase-1-core: core validator + op manifest + structural evidence gate], [phase-1-core: file→index→_events transaction writer], [phase-0-foundations: frontmatter schemas for Source/Claim/Evidence/Note]
- Implements design: [../../05-knowledge-core/ingestion-pipeline.md](../../05-knowledge-core/ingestion-pipeline.md) (Pipeline A), [../../07-backend-api/ingestion-service.md](../../07-backend-api/ingestion-service.md) (6 stages), [../../01-decisions/ADR-0005-ingestion-pipeline.md](../../01-decisions/ADR-0005-ingestion-pipeline.md)
- Produces: `IngestService` driving the ordered stages `add_source → parse → extract_claims → attach_evidence → synthesize_note → classify_signal`, each as one core transaction; per-stage provenance side-effects; the structural `generated-summary ≠ evidence` gate wired end to end.

## Objective
A single ingestion service exposes the six pipeline stages of Pipeline A as ordered, append-only core transactions. Each stage attaches its mandated provenance (content hash, block locators, extractor identity, evidence `extracted_from`, note `cites`, signal classification), writes via the fixed `file → index → _events → validate → commit` order, and aborts the whole transaction on any validation failure (no orphan file/row/event). "Done" = a registered source can be carried through parse → claim-candidates → evidence → cited note, with every artifact carrying resolvable provenance and **no generated text ever stored as Evidence**. (Claim-extraction internals and the review queue are RB-021; signal intake B-pipeline is RB-022 — this runbook builds the A-pipeline spine and the stage-6 hook.)

## Preconditions
- [ ] phase-1-core is green: the transactional core, op manifest, and structural evidence gate (`attach_evidence` has no prose field; `artifact_ref` must resolve) exist and pass their unit tests.
- [ ] The `file → index → _events` writer is idempotent and validates the `Claim→Evidence` invariant before commit.
- [ ] Frontmatter JSON-schemas exist for `Source, Claim, Evidence, Note` under `knowledge/{sources,claims,evidence,notes}/`.
- [ ] A content-addressed artifact vault path is configured (large artifacts referenced by `artifact_uri`, not inlined).
- [ ] `reindex` re-checks the invariant (layer 3) and is deterministic/idempotent.

## Steps

### 1. Define the pipeline stage contract
- **Do:** Create `IngestService` with one method per stage, each taking a typed input and returning the produced node id(s) + a `txn_id`. Stages run inside core transactions only — no raw file writes. Skeleton:
  ```ts
  interface IngestService {
    add_source(in: AddSourceIn): SourceRef        // A0, stage 1
    parse(in: ParseIn): ParsedDocRef              // A1, stage 2 (internal, no public op)
    extract_claims(in: ExtractIn): CandidateRef[] // A2, stage 3 (detail in RB-021)
    attach_evidence(in: AttachEvidenceIn): EvidenceRef // A3, stage 4 (the gate)
    synthesize_note(in: SynthNoteIn): NoteRef     // A5, stage 5
    classify_signal(in: ClassifyIn): LinkRef      // A6/B, stage 6 hook (detail in RB-022)
  }
  ```
- **Verify:** Each method routes through the core op manifest; a unit test asserts no `IngestService` path writes a `.md` without going through the core transaction writer.

### 2. Stage 1 — `add_source` (register + hash + boundary floor)
- **Do:** Compute `sha256` of the raw artifact/body **first**; use it as the dedup + idempotency key (re-ingesting an identical artifact returns the existing `source_id`, a no-op). Write `Source{type, locator, content_hash, boundary, visibility, created_by, created_at}`. Capture `boundary` at intake with default-deny `internal`; `visibility` default-private. Copy large artifacts to the content-addressed vault; reference by `artifact_uri` (never inline).
- **Verify:** Re-running `add_source` on a byte-identical artifact yields the same `source_id` and appends **no** new `_events` line. A source with omitted boundary persists as `internal`. Vault file exists and is referenced by URI.

### 3. Stage 2 — `parse` (addressable blocks + anchors)
- **Do:** Route by `type`: papers → GROBID (PDF→TEI) primary with LLM fallback for garbled PDFs; articles → readability/markdown; notes → already structured. Emit `ParsedDoc{blocks[{block_id, kind, text, page, char_span}], refs[]}`. Store `parser_version`. Write a `derived-from` edge from parsed content to the raw artifact; never mutate or replace the raw artifact. Parse output is internal (no public op).
- **Verify:** Every emitted block has a resolvable locator `{source_id, block_id, char_span, page}`. Re-parsing the same source at the same `parser_version` is deterministic (identical `block_id`/`char_span` set). The raw artifact is byte-unchanged after parse.

### 4. Stage 3 hook — `extract_claims` produces proposed candidates
- **Do:** Wire the stage to emit `ClaimCandidate[]` with `generated: true`, `status: proposed`, `about`-edge to the `Source`, and mandatory `supporting_block_ids`. Candidates are written **non-durable** and enqueued for review (full extractor logic + queue in RB-021). A candidate with no `supporting_block_ids` is rejected at the schema layer.
- **Verify:** A candidate with empty `supporting_block_ids` fails schema validation and aborts the transaction. A produced candidate is `proposed`, `generated: true`, non-durable, and not retrievable as fact.

### 5. Stage 4 — `attach_evidence` (the structural gate)
- **Do:** Implement `attach_evidence(claim_id, artifact_ref, locator, stance, rationale)` with **no prose/summary field**. `artifact_ref` MUST resolve to an existing `Source/Trace/SimulationRun/Experiment` node or a real `file_uri`. Reject a `Note` or `kind=generated-summary` target with `EVIDENCE_GATE`. On success write `Evidence{evidence_for→claim, extracted_from→artifact, locator, stance ∈ {SUPPORT,REFUTE,NEI}, rationale}` and a `supports`/`refutes` edge, then trigger trust recompute on the claim. A claim with no resolvable evidence stays `needs_evidence` and never auto-promotes.
- **Verify:** Calling `attach_evidence` with a `Note` id or an unresolvable `artifact_ref` returns `EVIDENCE_GATE` and writes nothing. A claim whose only "evidence" would be generated text cannot be promoted. Successful attach records `extracted_from` as a locator, never prose.

### 6. Stage 5 — `synthesize_note` (cited, never evidence)
- **Do:** Compose `Note{generated: true, cites:[claim_id…], evidence_rollup}` over **accepted claims only**. Inline `cites` + evidence rollup so a reader walks note→claim→evidence→source without re-running the LLM. Set `evidence=false`; structurally exclude the Note from `attach_evidence` targets and from export-as-evidence. Boundary propagates monotonically: Note boundary ≥ max(boundary of cited inputs).
- **Verify:** Attempting to use a synthesized Note as an `artifact_ref` in `attach_evidence` fails with `EVIDENCE_GATE`. A Note synthesized from a `confidential` cited claim is itself ≥ `confidential`. Every `cites` id resolves to an accepted claim that resolves to source spans.

### 7. Stage 6 — `classify_signal` hook
- **Do:** Expose `classify_signal` returning `classification: threat|support|unknown`. `threat`/`support` become a typed `RelatedWork` stanced edge to the targeted `Claim`/`Concept`; `unknown` stores the signal unverified at `T0` and does **not** auto-link. Leave the full B-pipeline (envelope intake, retrieval match, OpenQuestion escalation) to RB-022; here only wire the stage boundary + edge writer.
- **Verify:** An `unknown` classification creates no auto-link and lands `T0`. A `threat`/`support` writes a typed stanced edge. (Escalation behavior tested in RB-022.)

### 8. Per-stage provenance + audit
- **Do:** Each stage appends one `_events/<ts>-<op>.jsonl` record and a hash-chained audit entry via the core audit service. Extractor/classifier identity (`model_id`, `prompt_hash`, `tool_version`) travels with every generated artifact. Trust is **derived** by the core, never set by the caller; AI-authored entities cap at T2.
- **Verify:** Each stage call produces exactly one `_events` line. A caller-supplied trust value is ignored/rejected. Deleting and rebuilding the SQLite index via `reindex` reproduces every node + edge from md-git.

### 9. Transaction + abort semantics
- **Do:** Run each stage as one core txn with order `file → index → _events → validate → commit`. A validation failure at any stage aborts the whole transaction: no orphan files, no half-written edges, no audit entry. Honor `idempotency_key` (repeat returns original `txn_id`; `CONFLICT` only on key reuse with different payload).
- **Verify:** Force a validation failure mid-stage (e.g. inject a claim with zero evidence at promotion) and confirm no `.md`, no SQLite row, and no `_events` line survive. Repeating a stage with the same `idempotency_key` returns the original result.

### 10. End-to-end happy-path test
- **Do:** Add a test that runs `add_source → parse → extract_claims → attach_evidence → synthesize_note` over a fixture paper, then `reindex`, then retrieve the Note.
- **Verify:** The synthesized Note is retrievable **with its hydrated provenance chain** source→claim→evidence; the generated summary is nowhere stored as Evidence; the run goes entirely through the skill/op interface (no ad-hoc file edits).

## Acceptance criteria
- [ ] All six stages exist as core transactions through the op manifest; no raw write path bypasses the invariant or gate.
- [ ] `add_source` is idempotent by `content_hash`; `parse` is deterministic and emits resolvable block locators; the raw artifact is never mutated.
- [ ] `attach_evidence` has no prose field, requires a resolvable `artifact_ref`, and rejects Note/generated-summary targets with `EVIDENCE_GATE`.
- [ ] A synthesized `Note` (`generated: true`, `evidence=false`) can never be the source of an evidence edge; boundary propagation is monotone.
- [ ] Each stage appends exactly one `_events` record; trust is derived (AI-capped T2), never caller-set.
- [ ] A validation failure aborts the entire transaction with no orphan file/row/event.
- [ ] End-to-end happy path round-trips and the Note is retrievable with full provenance after `reindex`.
- [ ] Tree is green (build + lint + schema-validate + pipeline tests).

## Rollback / safety
- All writes are append-only + supersedes; there is no destructive update/delete to undo.
- A mid-pipeline failure leaves no partial state (transaction abort); re-running from the last accepted stage is safe (idempotent by `content_hash`/`idempotency_key`).
- If a stage is found buggy after the fact, drop the derived SQLite index and `reindex` from md-git; quarantine bad generated artifacts by their stored `model_id`/`prompt_hash` without losing sources.

## Hand-off
- RB-021 assumes stage 3 (`extract_claims`) is wired as a proposed/non-durable producer and builds the schema-constrained extractor, dedup, and review queue on top.
- RB-022 assumes stage 6 (`classify_signal`) edge-writer + `T0`-on-unknown behavior exist and builds the full CAW-05 signal B-pipeline (intake → retrieval match → stance → link → OpenQuestion escalation).
- Retrieval (phase-3) can assume ingested transactions round-trip through `reindex` with hydratable provenance.

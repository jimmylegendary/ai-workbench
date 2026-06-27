# RB-011: Implement typed nodes + one generic edge table + the three-layer Claim→Evidence invariant

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-010 (product core + op dispatch), RB-002 (frontmatter schemas), RB-003 (node/edge SQLite schema + reindex)]
- Implements design:
  - [../../04-data-layer/data-model.md](../../04-data-layer/data-model.md)
  - [../../05-knowledge-core/entity-and-edge-model.md](../../05-knowledge-core/entity-and-edge-model.md)
  - [../../05-knowledge-core/claim-evidence-and-evidence-gate.md](../../05-knowledge-core/claim-evidence-and-evidence-gate.md)
  - [../../01-decisions/ADR-0003-knowledge-data-model.md](../../01-decisions/ADR-0003-knowledge-data-model.md)
- Produces: the typed-node model (closed `kind` vocabulary + common + per-kind fields), the one generic `edge(src_id,dst_id,rel)` table with the endpoint-legality matrix, and the **Claim→Evidence(≥1) invariant enforced in 3 lockstep layers** (frontmatter schema, core validator, reindex re-check).

## Objective
CAW-02 models everything as a typed node and every relationship as one generic typed edge, exactly as fixed by the design. The product's spine — *a Claim is valid only with ≥1 `evidence_for` edge from an Evidence whose `extracted_from` resolves to a concrete artifact, and no Note may back an evidence chain* — is enforced identically in three places running the SAME core logic: (1) the YAML frontmatter schema, (2) the core transaction validator (RB-010 validate phase), (3) the reindex re-check over `knowledge/**`. "Done" = the node/edge contract is encoded, the legality matrix rejects illegal triples, and the negative tests N1, N4, N5 plus the bare-Claim case fail loud while the happy path passes. (The structural evidence gate proper — no prose field, artifact resolution, trust — is RB-012.)

## Preconditions
- [ ] RB-010 core, dispatcher, and validate-phase hook exist and are green.
- [ ] `node`, `edge`, `provenance_event` tables exist (portable SQLite∩Postgres subset, [data-model §5](../../04-data-layer/data-model.md)).
- [ ] Per-kind frontmatter schema files exist for every `kind`.

## Steps

1. **Encode the closed `kind` vocabulary and common node fields.**
   - Do: define the enum `source claim evidence note concept interest open_question decision assumption trace simulation_run experiment related_work radar_signal`. Encode common frontmatter ([data-model §3](../../04-data-layer/data-model.md)): `id, kind, schema_version, boundary, visibility, status, generated, trust, artifact_uri, created_by, attributed_to, created_via, supersedes, content_hash, created_at`. Mark `trust` (and effective `boundary`/`visibility`) **derived**: rejected if a caller sets them divergently.
   - Verify: a fixture node of every `kind` validates; an unknown `kind` is rejected; a node supplying `trust:T3` from a caller is rejected with `VALIDATION`.

2. **Encode per-kind type-specific fields.**
   - Do: add per-kind fields from [data-model §4](../../04-data-layer/data-model.md): `source{source_type,title,origin_uri,imported_from}`, `claim{statement,claim_type}`, `evidence{stance,artifact_uri,locator}` (NO prose field), `note{generated,title}`, `concept/interest`, `open_question/decision/assumption`, `_refs{artifact_uri,origin,checksum}`, signals `{external_ref,classification,imported_from}`.
   - Verify: an `evidence` fixture with a `summary`/`text`/`prose` key fails schema validation; `filename == id` is enforced (mismatch rejected).

3. **Create the generic typed edge contract.**
   - Do: confirm `edge(src_id, dst_id, rel, created_via, PRIMARY KEY(src_id,dst_id,rel))`. Edges live in the source node's frontmatter `links: [{rel,to}]` block and are projected 1:1 into the `edge` table by reindex. No edge is a free frontmatter field.
   - Verify: an `evd_*` fixture with a `links` block projects exactly one `edge` row per link after reindex; a duplicate `(src,dst,rel)` is idempotent (one row).

4. **Generate the endpoint-legality matrix into the core link validator.**
   - Do: encode the `(kind, rel, kind)` triples from [entity-and-edge-model.md §4.1](../../05-knowledge-core/entity-and-edge-model.md): `evidence_for: evidence→claim`, `challenges: evidence→claim`, `extracted_from: evidence→{source,trace,simulation_run,experiment}`, `cites: note→{claim,evidence}`, `derived_from: {note,claim}→{source,claim}`, `about_concept: {claim,source,note}→concept`, `addresses: {claim,evidence}→{open_question,decision,assumption}`, `supports/refutes: {related_work,radar_signal}→claim`, `supersedes: X→X`, `attributed_to: *→agent`. Reject any triple not in the matrix with `ERR_EDGE_ENDPOINT_ILLEGAL` (envelope `INVARIANT`/`VALIDATION`).
   - Verify: a legal `evidence_for: evidence→claim` is accepted; an illegal `cites: claim→source` is rejected with `ERR_EDGE_ENDPOINT_ILLEGAL`.

5. **Encode the hard structural bar: a Note is never the src of an evidence edge.**
   - Do: in the link validator, reject any edge where `src.kind=note AND rel ∈ {evidence_for, extracted_from}` → `ERR_NOTE_AS_EVIDENCE`.
   - Verify: negative test **N4** — creating `evidence_for` with a `note` src is rejected with `ERR_NOTE_AS_EVIDENCE`; nothing written.

6. **Layer 2 — core validator: the Claim→Evidence(≥1) invariant pre-commit.**
   - Do: in the RB-010 validate phase, before commit check ([claim-evidence-and-evidence-gate.md §2/§4](../../05-knowledge-core/claim-evidence-and-evidence-gate.md)): a `claim` promoted past `status=needs_evidence` (to `accepted`/`trust>T0`) has ≥1 `evidence_for` from an `evidence` node, and each such Evidence's `extracted_from` target resolves. A bare Claim is the first-class `needs_evidence`/`T0` state, NOT an error to hide. Failure → `ERR_TRUST_WITHOUT_EVIDENCE` (envelope `INVARIANT`), abort whole txn.
   - Verify: negative test **N1** — promoting a 0-evidence Claim to `accepted` returns `ERR_TRUST_WITHOUT_EVIDENCE`, nothing written; positive — a Claim left at `needs_evidence`/`T0` with 0 evidence is accepted and visible.

7. **Layer 1 — frontmatter schema re-states the structural facts.**
   - Do: ensure the schema (RB-002) is the first gate: `evidence` has no prose field (step 2); a `claim` may be born `needs_evidence` with no links. This is layer 1 of the invariant per [claim-evidence-and-evidence-gate.md §4](../../05-knowledge-core/claim-evidence-and-evidence-gate.md).
   - Verify: schema-validate of the corpus passes; the `evidence`-with-prose fixture fails at the schema layer (independently of the core).

8. **Layer 3 — reindex re-check over `knowledge/**`.**
   - Do: extend `reindex` (RB-003) to re-run the FULL invariant (steps 4–6) against the source-of-truth md files; any violation aborts reindex loud, naming offending ids (`reindex: INVARIANT_VIOLATION`); the index is not updated.
   - Verify: negative test **N5** — hand-edit a `.md` so Evidence points at a Note, run reindex → fails loud naming the id, index unchanged.

9. **Reconstructability traversal.**
   - Do: implement the traversal `note --cites--> claim --evidence_for(in)--> evidence --extracted_from--> source|trace|simulation_run|experiment` as a recursive CTE over `edge` ([data-model §7](../../04-data-layer/data-model.md)).
   - Verify: on the happy-path corpus the traversal from a Note returns the full chain down to a concrete artifact node.

## Acceptance criteria
- [ ] Closed `kind` vocabulary + common + per-kind fields encoded; derived fields rejected if caller-set.
- [ ] One generic `edge` table; frontmatter `links` project 1:1; duplicates idempotent.
- [ ] Endpoint-legality matrix enforced; illegal triple ⇒ `ERR_EDGE_ENDPOINT_ILLEGAL`.
- [ ] N1 (bare Claim promoted) ⇒ `ERR_TRUST_WITHOUT_EVIDENCE`; N4 (note-as-evidence) ⇒ `ERR_NOTE_AS_EVIDENCE`; N5 (hand-edit) ⇒ reindex `INVARIANT_VIOLATION` naming the id.
- [ ] A bare Claim is accepted as first-class `needs_evidence`/`T0` (not an error).
- [ ] The invariant runs identically in all three layers (schema, validator, reindex).
- [ ] Reconstructability traversal returns the full chain on the happy path.
- [ ] Tree is green (build + lint + schema-validate + tests N1/N4/N5 + happy path).

## Rollback / safety
- All enforcement runs inside the RB-010 transaction, so a rejected write leaves no orphan node/file/event. Layer 3 is the backstop: even an out-of-band hand-edit that bypasses layers 1–2 is caught at reindex, which fails loud and refuses to index a broken state. To roll back, remove the validator registration and the reindex re-check hook; the node/edge schema and corpus are unaffected.

## Hand-off
- RB-012 adds the structural evidence gate (no prose field already in place here; artifact_ref resolution + trust derivation) on top of this invariant.
- RB-013 adds boundary/visibility propagation over the same `edge` graph and the hash-chained audit.
- The reconstructability traversal is reused by P5 retrieval hydration and P6 export bundles.

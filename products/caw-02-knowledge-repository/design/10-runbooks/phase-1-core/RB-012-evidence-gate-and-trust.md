# RB-012: Implement the structural evidence gate + the derived trust ladder

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-010 (product core + op dispatch), RB-011 (data model + Claim→Evidence invariant)]
- Implements design:
  - [../../05-knowledge-core/claim-evidence-and-evidence-gate.md](../../05-knowledge-core/claim-evidence-and-evidence-gate.md)
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries.md)
  - [../../07-backend-api/api-surface.md](../../07-backend-api/api-surface.md)
  - [../../01-decisions/ADR-0004-provenance-and-trust.md](../../01-decisions/ADR-0004-provenance-and-trust.md)
- Produces: the structural evidence gate (`attach_evidence` with NO prose field; `artifact_ref` must resolve pre-commit; `synthesize_note` cannot emit evidence edges) and the derived, explainable trust ladder `T0–T3 + contested` recomputed on every edge change, with AI-authored content capped at `T2`.

## Objective
The gate makes the three dangerous mistakes — a Claim with no evidence, prose passed off as evidence, a Note used as evidence — **structurally impossible** rather than discouraged. The `attach_evidence` op has no `text`/`summary`/`prose` field by construction; its `artifact_ref` is a typed `{kind, ref}` that must resolve to an already-cataloged artifact (or resolvable URI) before the edge is written; `synthesize_note` can only emit `cites`/`derived_from`. After the gate passes, the core derives trust as a pure function of the graph (evidence count/kind, contestation, authorship), never accepting a caller value, and caps AI-authored nodes at `T2`. "Done" = negative tests N2, N3 fail loud, the AI-cap and contested cases hold, and the happy path P1 yields an `accepted`/`T1` Claim with a `generated=true` Note carrying only `cites`.

## Preconditions
- [ ] RB-011 invariant (≥1 `evidence_for`, endpoint legality, note-not-evidence bar) is enforced in all three layers and green.
- [ ] `evidence` frontmatter schema already has NO prose field (RB-011 step 2).
- [ ] `_refs/` catalog of artifact nodes (`source`/`trace`/`simulation_run`/`experiment`) is writable through the core.

## Steps

1. **Define the `attach_evidence` op surface with no prose field.**
   - Do: in the op manifest (RB-010), declare `attach_evidence(claim_ref: ref<claim>, artifact_ref: {kind: source|trace|simulation_run|experiment, ref: <id|uri>}, locator:{page?,line?,span?,selector?}, stance: supports|challenges)` — exactly [claim-evidence-and-evidence-gate.md §3](../../05-knowledge-core/claim-evidence-and-evidence-gate.md). There is structurally no `text`/`summary`/`prose` input.
   - Verify: negative test **N2** — `attach_evidence` called with a prose summary / no `artifact_ref` is rejected (the field does not exist in the schema) with `ERR_EVIDENCE_NOT_ARTIFACT` (envelope `EVIDENCE_GATE`); nothing written.

2. **Enforce artifact_ref resolution pre-commit (layers 1 + 2).**
   - Do: before writing the `evidence_for`/`extracted_from` edges, resolve `artifact_ref` to an existing cataloged node of a legal kind OR a reachable URI. An unresolvable ref is rejected, never stored as a dangling pointer → `ERR_ARTIFACT_UNRESOLVED`.
   - Verify: negative test **N3** — `attach_evidence` with `artifact_ref` to a non-existent id returns `ERR_ARTIFACT_UNRESOLVED`; no Evidence node, edge, file, or event is created.

3. **Translate stance into the correct edge.**
   - Do: `stance=supports` → `evidence_for` edge (Evidence→Claim); `stance=challenges` → `challenges` edge; always also write `extracted_from` (Evidence→artifact). All go through the RB-011 legality + note-bar validator.
   - Verify: a `supports` attach yields one `evidence_for` + one `extracted_from`; a `challenges` attach yields `challenges` + `extracted_from`; both resolve to a concrete artifact.

4. **Constrain `synthesize_note` so it can never create evidence.**
   - Do: declare `synthesize_note(body, cites:Id[], about?:Id[], generated:true)` whose op surface can ONLY emit `cites` (Note→Claim|Evidence) and `derived_from` (Note→Source|Claim) edges; it has no path to `evidence_for`/`extracted_from`, and the node is `generated=true` by construction.
   - Verify: a synthesized Note carries only `cites`/`derived_from` edges; any attempt to route it to an evidence edge is rejected with `ERR_NOTE_AS_EVIDENCE` (re-using RB-011 step 5).

5. **Implement the derived trust ladder (post-gate).**
   - Do: implement `recompute_trust(claim)` as a pure function over the graph per [provenance-and-boundaries.md §4](../../04-data-layer/provenance-and-boundaries.md):
     `T0` no resolvable evidence; `T1` ≥1 resolving `evidence_for`; `T2` ≥2 independent sources OR an artifact-backed Evidence (trace/experiment/simulation_run); `T3` T2 AND a human-review provenance event by an authorized agent; `contested` if both `evidence_for`(supports) and `challenges` are above threshold θ. Reject any caller-supplied divergent `trust`.
   - Verify: a Claim with one resolving source computes `T1`; adding a second independent source (or an artifact-backed Evidence) computes `T2`; a caller passing `trust:T3` is rejected.

6. **Apply the AI-authored cap.**
   - Do: after deriving trust, if the node's author/`attributed_to` is AI (`actor.kind=agent` / `skill:*`), set `trust = min(trust, T2)`; `T3` requires a human-review event ([provenance-and-boundaries.md §4](../../04-data-layer/provenance-and-boundaries.md), brief §10).
   - Verify: an AI-authored Claim with a human-review event still computes ≤ `T2`; the same evidence on a human-authored Claim with a human-review event can reach `T3`.

7. **Represent and surface `contested`.**
   - Do: when supports≥θ and challenges≥θ, set `trust=contested` (surfaced, never hidden). Record θ as a configurable constant. `TODO(open-question: exact contested threshold θ — owned by ADR-0004).`
   - Verify: a Claim with sufficient `evidence_for` and `challenges` edges computes `contested`; the value is returned by `recompute_trust` and stored as derived.

8. **Recompute on every edge change and at reindex.**
   - Do: any `attach_evidence`/`link`/`supersede` touching a Claim triggers `recompute_trust` on that Claim within the same txn; `reindex` recomputes trust globally and deterministically from edges + provenance events.
   - Verify: deleting the SQLite index and re-running reindex reproduces identical trust values for every Claim (deterministic); adding an edge flips the affected Claim's trust within one txn.

9. **Run the full happy path P1.**
   - Do: execute `add_source → extract_claim → attach_evidence → synthesize_note` end to end through the core.
   - Verify: positive test **P1** — the Claim is `accepted`/`T1`, its Evidence resolves to the Source, and the Note is `generated=true` with `cites` edges only and no evidence edge.

## Acceptance criteria
- [ ] `attach_evidence` has no prose field; N2 ⇒ `ERR_EVIDENCE_NOT_ARTIFACT`, N3 ⇒ `ERR_ARTIFACT_UNRESOLVED`, both write nothing.
- [ ] `synthesize_note` can emit only `cites`/`derived_from`; node is `generated=true`; routing it to an evidence edge ⇒ `ERR_NOTE_AS_EVIDENCE`.
- [ ] Trust is derived (never caller-set) and explainable: T0/T1/T2/T3/contested computed per the ladder.
- [ ] AI-authored nodes never exceed `T2`; T3 requires a human-review event.
- [ ] `contested` is representable and returned by `recompute_trust`.
- [ ] Trust recomputes on edge change and is deterministic under reindex (drop-and-rebuild reproduces values).
- [ ] P1 happy path passes (Claim `accepted`/`T1`; Note `generated=true`, `cites` only).
- [ ] Tree is green (build + lint + N2/N3 + AI-cap + contested + P1 tests).

## Rollback / safety
- The gate runs inside the RB-010 transaction; a rejected `attach_evidence` leaves no Evidence node, edge, file, or event (no dangling pointers). Trust is derived and disposable — it is always recomputed from the md source of truth at reindex, so a bad trust value can never persist past a rebuild. To roll back, unregister the gate ops and trust function; the data model and invariant (RB-011) remain intact.

## Hand-off
- RB-013 adds boundary/visibility monotone propagation over the same post-gate graph and the hash-chained audit; trust and boundary are independent axes and recompute together at reindex.
- P3 (M2) assumes the structural gate and trust ladder exist on every write.
- P5 retrieval may filter and rank by the derived `trust` produced here.

# RB-013: Implement two-axis boundary+visibility propagation + the hash-chained append-only audit

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-010 (product core + op dispatch), RB-011 (data model + invariant), RB-012 (evidence gate + trust)]
- Implements design:
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries.md)
  - [../../04-data-layer/versioning-and-events.md](../../04-data-layer/versioning-and-events.md)
  - [../../07-backend-api/api-surface.md](../../07-backend-api/api-surface.md)
  - [../../01-decisions/ADR-0004-provenance-and-trust.md](../../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../../01-decisions/ADR-0002-storage.md](../../01-decisions/ADR-0002-storage.md)
- Produces: the two orthogonal axes `boundary{public⊂internal⊂confidential} × visibility{team,private}` with computed **monotone propagation** (synthesis never downgrades), the `reclassify` activity as the only downgrade path, and the **hash-chained append-only audit** over `knowledge/_events/*.jsonl` with git history as the second witness.

## Objective
Sensitivity ("can it leave the building") and scope ("whose space") are two independent, both-`NOT NULL`, default-deny columns that never collapse into one. The core computes an entity's **effective** `boundary` as the lattice-max over itself and all provenance ancestors, and **effective** `visibility` as `team` only if it and every ancestor are `team` — so a Note citing a confidential Claim is itself ≥ confidential and synthesis can never launder sensitivity downward. The only downgrade is an attributed `reclassify` event by a human. Every write appends one hash-chained `_events` line linked to a `provenance_event`, and `verify_audit` proves chain integrity; signed git commits are the redundant audit of record. "Done" = monotonicity tests pass, AI agents cannot downgrade boundary, and the audit chain verifies and detects tampering.

## Preconditions
- [ ] RB-012 post-gate graph + derived trust exist and are green.
- [ ] `boundary`/`visibility` columns are `NOT NULL` default-deny (`internal`/`private`) in the node schema (RB-011/RB-002).
- [ ] `AuditService.append` is wired into every write txn (RB-010 step 8) and `_events`/`provenance_event` are written per transaction.

## Steps

1. **Enforce the two independent axes at the schema + write layer.**
   - Do: confirm `boundary ∈ {public,internal,confidential}` (ordered lattice) and `visibility ∈ {team,private}` (unordered), both `NOT NULL`, defaulting to `internal`/`private` for new unclassified items ([provenance-and-boundaries.md §1](../../04-data-layer/provenance-and-boundaries.md)). The axes never merge into one field.
   - Verify: a node may be `public`/`private` and another `confidential`/`team`; omitting either axis defaults to `internal`/`private`; an out-of-vocabulary value is rejected.

2. **Implement monotone boundary propagation over provenance edges.**
   - Do: implement `boundary_eff(n) = max_lattice(boundary(n), {boundary_eff(a) : a ∈ prov_ancestors(n)})` where the propagating edges are `evidence_for | challenges | extracted_from | cites | derived_from` ([provenance-and-boundaries.md §2](../../04-data-layer/provenance-and-boundaries.md)). The file holds the **declared** value; the index and every read compute the **effective** value. Expose as `BoundaryService.effective_boundary` ([api-surface.md](../../07-backend-api/api-surface.md)).
   - Verify: a Note declared `internal` that `cites` a `confidential` Claim returns `boundary_eff = confidential`; a declared value below the computed floor is surfaced (not silently accepted).

3. **Implement monotone visibility propagation.**
   - Do: `visibility_eff(n) = team` iff `visibility(n)=team` AND every provenance ancestor is `team`; else `private`.
   - Verify: a `team` Note citing a `private` Claim returns `visibility_eff = private`; an all-`team` chain stays `team`.

4. **Forbid downgrade by generation; provide the only downgrade path.**
   - Do: reject any write whose declared `boundary` is below the computed floor (`check_write_boundary` → `BOUNDARY` error). The sole legitimate downgrade is a `reclassify` provenance_event with `activity=reclassify`, `agent=human:*`, `from`, `to`, and a `reason` ([provenance-and-boundaries.md §3](../../04-data-layer/provenance-and-boundaries.md)). AI agents may NOT downgrade boundary.
   - Verify: monotonicity test — synthesizing from a `confidential` input never yields a less-restrictive boundary; an AI-actor `reclassify` (downgrade) is rejected; a `human:jimmy` `reclassify` with a reason is accepted and appended as an event (not a silent field edit).

5. **Recompute effective labels at reindex.**
   - Do: `reindex` recomputes `boundary_eff`/`visibility_eff` globally over the full graph deterministically; a declared value lower than the computed floor is surfaced in the reindex report.
   - Verify: drop the index and rebuild — effective labels are identical across runs; a planted declared-below-floor node is surfaced.

6. **Make the `_events` ledger hash-chained.**
   - Do: extend `AuditService.append` so each `_events` line carries `seq`, `prev_hash`, and `hash = H(prev_hash ‖ canonical(line_payload))` ([api-surface.md AuditService](../../07-backend-api/api-surface.md); [versioning-and-events.md §2](../../04-data-layer/versioning-and-events.md)). One line per knowledge transaction, append-only, committed as part of the source of truth. `TODO(open-question: hash-chain over _events in v0 vs signed-git-commits-only — owned by ADR-0004).`
   - Verify: each appended line's `prev_hash` equals the prior line's `hash`; the genesis line has a fixed sentinel `prev_hash`.

7. **Implement `verify_audit` and tamper detection.**
   - Do: implement `verify_audit(from_seq?, to_seq?) → {ok, broken_at?}` that walks the chain and reports the first break ([api-surface.md](../../07-backend-api/api-surface.md)).
   - Verify: `verify_audit` returns `ok:true` on a clean ledger; mutating any historical line makes it return `ok:false` with `broken_at` = that line's seq.

8. **Bind git history as the second, redundant witness.**
   - Do: ensure every committing write produces a (signed, where configured) git commit so blame answers "who changed this file and when" at the byte level, redundant with the semantic `_events` ledger ([versioning-and-events.md §3](../../04-data-layer/versioning-and-events.md)). Every `_events` line corresponds to a committed file change.
   - Verify: for the happy-path corpus, each `_events` line maps to a commit touching the named node file; `history(id)` returns the node's event sequence.

9. **Reconstruct labels from the audit.**
   - Do: ensure boundary/visibility/trust changes are all replayable from `_events` + `provenance_event` + git blame (no in-place edits; `reclassify`/`review` are the only label-changing activities).
   - Verify: audit reconstruction shows how a given node arrived at its current `boundary`, `visibility`, and `trust` (which event/activity set each).

## Acceptance criteria
- [ ] `boundary` and `visibility` are two independent `NOT NULL` default-deny axes; never collapsed.
- [ ] Monotonicity: synthesis from a `confidential` input never yields a less-restrictive effective boundary; `team`+ancestor-`private` ⇒ effective `private`.
- [ ] Boundary downgrade is rejected except via a human-attributed `reclassify` event; AI agents cannot downgrade.
- [ ] Effective labels recompute deterministically at reindex (drop-and-rebuild reproduces them); declared-below-floor is surfaced.
- [ ] `_events` lines are hash-chained; `verify_audit` returns `ok:true` clean and pinpoints `broken_at` after tampering.
- [ ] Every `_events` line maps to a committed file change; `history(id)` returns the event sequence.
- [ ] Node labels (boundary/visibility/trust) are reconstructable from the audit + git blame.
- [ ] Tree is green (build + lint + monotonicity + reclassify-authority + audit-verify/tamper tests).

## Rollback / safety
- Propagation is computed (the index/effective values are disposable and rebuilt by reindex), so a propagation bug can never persist past a rebuild and the declared md values are never corrupted. The audit is append-only: nothing is mutated, so rollback of this runbook means unregistering the propagation + hash-chain logic, leaving `knowledge/`, `_events`, and git history intact. A failed mid-write leaves no `_events` line (RB-010 atomicity), so the chain never has a gap.

## Hand-off
- M2 (P3 exit) is satisfied: boundary/visibility propagation + trust + structural gate + hash-chained audit are enforced on every write.
- P4 surfaces call `BoundaryService` before returning/writing and inherit confirmation-by-default (RB-010).
- P5 retrieval applies `boundary`/`visibility` filters pre-ranking using effective labels computed here; P6 import/export re-redacts and runs the fail-closed allow-list on these labels.

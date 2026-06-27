# RB-052: Build the shared boundary/redaction validation library

- Status: ready
- Phase: phase-5-import-export
- Depends on: [RB-030 (provenance/trust + monotone propagation), RB-031 (effective-boundary computation), RB-002 (envelope-agnostic core txn + audit/_events)]
- Implements design:
  - [../../01-decisions/ADR-0007-import-export-contracts.md](../../01-decisions/ADR-0007-import-export-contracts.md) (§1 envelope, §5 defaults, §6 skill-wrap parity)
  - [../../05-knowledge-core/import-export-flows.md](../../05-knowledge-core/import-export-flows.md) (§1 boundary principles, §2 shared envelope, "RB (boundary-validation lib)")
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries.md) (§1 two axes, §2 monotone propagation)
- Produces: an in-product library `kr.boundary` exposing: the envelope validator + semver gate, the canonical redaction ruleset + `redact()`/`scan()`, the effective-boundary/visibility evaluators, the fail-closed allow-list decision function, and the per-crossing audit-entry writer. Plus a fail-closed test suite proving no confidential data crosses any boundary.

## Objective
Build the **one shared library** every import/export runbook calls so confidentiality enforcement is identical in both directions and there is no raw path that bypasses it. "Done" = a single module (`kr.boundary`) that (a) validates and semver-gates the common envelope, (b) computes **effective** `boundary`/`visibility` via monotone propagation (never trusting a declared/row-local flag), (c) runs the canonical re-redaction ruleset returning a hit list, (d) decides allow/exclude with a **fail-closed default** (indeterminate → exclude), and (e) writes a structured per-crossing audit entry. A negative-heavy test suite proves a `confidential`/`jimmy-private` item can never pass any boundary, and that ambiguity always resolves to exclusion.

## Preconditions
- [ ] RB-030/RB-031 merged: `boundary_eff(n)` and `visibility_eff(n)` are computable over provenance ancestors (`evidence_for | challenges | extracted_from | cites | derived_from`).
- [ ] Core txn + append-only `_events` audit (RB-002) available for the audit writer to chain into.
- [ ] The `boundary` lattice `public ⊂ internal ⊂ confidential` and `visibility {team, private}` are defined in the data layer with `NOT NULL` defaults `internal`/`private`.
- [ ] Tree is green (build + lint pass) at HEAD.

## Steps

1. **Define the envelope schema + semver gate.**
   - Do: Encode the shared envelope (ADR-0007 §1 / flows §2) as a JSON-schema and a typed loader `parse_envelope(bytes) -> Envelope`. Implement `semver_gate(contract_version, supported_major)`: parse semver; if `MAJOR` is unknown/unsupported → raise `ERR_CONTRACT_MAJOR_UNKNOWN` (reject, never guess). Verify `payload_sha256` against the canonicalized payload; mismatch → `ERR_PAYLOAD_DIGEST_MISMATCH`.
   - Verify: Unit tests — a `2.0.0` envelope against `supported_major=1` is rejected; a tampered payload (one byte flipped) fails the digest check; a well-formed `1.x.y` envelope parses.

2. **Implement the canonical redaction ruleset.**
   - Do: Create `ruleset.py` holding the codename/fab/customer/PII patterns as a versioned, self-contained list (`ruleset_version`), owned by CAW-02 — NOT imported from any other product (no shared dependency; see open question on regex home). Expose `scan(strings) -> [Hit{rule_id, span, sample}]` and `redact(strings) -> (redacted, [Hit])`.
   - Verify: Test fixtures containing seeded codename/fab/customer/internal-host markers each produce a hit with the correct `rule_id`; clean public text produces zero hits. `ruleset_version` is surfaced in output.

3. **Wrap effective-boundary / effective-visibility evaluation.**
   - Do: Expose `effective_boundary(node_id) -> boundary` and `effective_visibility(node_id) -> visibility` that call the RB-031 propagation: `boundary_eff = max_lattice(self, ancestors)`, `visibility_eff = team iff self and all ancestors team`. Never read a cached/declared flag as the answer; if propagation can't resolve an ancestor → treat as `confidential`/`private` (fail-closed unknown).
   - Verify: Test — a Note declared `internal` that cites a `confidential` Claim resolves to `confidential`; a node with an unresolvable ancestor resolves to `confidential`/`private`, not the declared value.

4. **Implement the fail-closed allow-list decision function.**
   - Do: `decide(item, target_audience) -> ALLOW | EXCLUDE{reason}`. Rules: `target_audience=public` ⇒ ALLOW only if `effective_boundary == public`; `visibility_eff == private` (jimmy-private) ⇒ never ALLOW for any audience; `target_audience=internal` ⇒ ALLOW up to `internal` only. **Default branch = EXCLUDE** (any unrecognized/indeterminate state excludes). The function is total and side-effect free.
   - Verify: Property test over the cross-product of `{public,internal,confidential} × {team,private} × {public,internal}` audiences — every `confidential` item and every `private` item is EXCLUDE for a `public` audience; no input path returns ALLOW for a confidential/private→public crossing; an unknown enum value returns EXCLUDE.

5. **Implement the per-crossing audit-entry writer.**
   - Do: `write_crossing_audit(direction, boundary_kind, selected_ids, dropped_ids, redaction_hits, ruleset_version, envelope_digest)` appends exactly one hash-chained line to `knowledge/_events/` via the core audit API (RB-002). Direction ∈ `{import, export}`.
   - Verify: A simulated crossing appends exactly one `_events` line containing dropped ids and redaction deltas; the hash chain still verifies after the append.

6. **Expose the single library surface + make it the only path.**
   - Do: Re-export `parse_envelope`, `semver_gate`, `scan`, `redact`, `effective_boundary`, `effective_visibility`, `decide`, `write_crossing_audit` from `kr.boundary.__init__`. Document that import/export runbooks MUST route through this module (skill-wrap parity, ADR-0007 §6).
   - Verify: A grep/lint check (or architecture test) asserts no import/export module re-implements redaction or boundary comparison locally.

7. **Author the fail-closed cross-boundary test suite.**
   - Do: Add `test_no_confidential_crosses.py`: golden cases asserting (a) `confidential` never crosses to `public`, (b) `jimmy-private` never crosses any audience, (c) indeterminate → EXCLUDE, (d) a redaction hit is always returned for seeded markers, (e) semver MAJOR mismatch rejects. Mark these as the boundary-safety regression gate.
   - Verify: `test_no_confidential_crosses` passes; deliberately weakening `decide`'s default to ALLOW makes the suite fail (mutation check documented in the test docstring).

## Acceptance criteria
- [ ] `kr.boundary` exposes the full surface in Step 6; no duplicate redaction/boundary logic exists elsewhere.
- [ ] Unknown envelope MAJOR and payload-digest mismatch are rejected with named errors.
- [ ] `decide()` is total, side-effect free, and EXCLUDEs on every indeterminate/unknown input (default-deny).
- [ ] Effective boundary/visibility come from propagation over provenance ancestors, never a declared/row-local flag; unresolved ancestor ⇒ `confidential`/`private`.
- [ ] The fail-closed suite proves no `confidential` item crosses to `public` and no `jimmy-private` item crosses any audience.
- [ ] Each simulated crossing writes exactly one hash-chained `_events` audit line.
- [ ] Tree is green (build + lint + tests).

## Rollback / safety
- Library is additive and pure; no schema migration. To roll back, revert the `kr.boundary` package and its tests — no data is mutated by this runbook (the audit writer is only invoked from real crossings in RB-050/051).
- Fail-closed by construction: if the module fails to load, dependent importers/exporters cannot run, so a broken build blocks crossings rather than leaking.

## Hand-off
RB-050 (import CAW-01/05) and RB-051 (export CAW-03) may assume: a validated/semver-gated envelope loader, a canonical `scan`/`redact` ruleset, propagation-based `effective_boundary`/`effective_visibility`, a fail-closed `decide()`, and the per-crossing audit writer — all from `kr.boundary`. They must not re-implement any of these.

# RB-012: Build the deny-by-default publish gate and the curator approval queue

- Status: ready
- Phase: phase-1-import-and-gate
- Depends on: [RB-010 (import + staging), RB-011 (core public-safe re-check + verdict)]
- Implements design:
  - [../../05-publishing-core/publish-gate-and-public-safe.md](../../05-publishing-core/publish-gate-and-public-safe.md)
  - [../../07-backend-api/import-service.md](../../07-backend-api/import-service.md)
  - [../../04-data-layer/public-safe-and-provenance.md](../../04-data-layer/public-safe-and-provenance.md)
  - [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
- Produces: the total, side-effect-free `publish_decision()` (G1–G8, default-REJECT), the curator approval queue (internal preview/admin), the hash-chained `_events` audit writer + `verify_audit()`, and a mutation-tested gate suite.

## Objective

The single load-bearing control that decides **what may be published** is implemented as a **total, side-effect-free, default-REJECT** decision function. Publication requires **both** a validated source **and** a locally re-derived public-safe boundary — neither sufficient alone — and **generated/unverified content is never published** (G5). G1–G7 gate eligibility; **G8 (explicit human approval) is the only path to live** — the gate can only ever auto-**reject**, never auto-**approve**. A G1–G7 pass with no G8 stays on the internal preview/admin surface, never on the public web/API. Every decision and publish/unpublish/redact is an append-only, hash-chained audit event, and **audit-only provenance never serializes** to any public output. "Done" = a validated, public-safe Skill candidate sits in the curator queue with its findings + provenance, and only an explicit approve flips it to published; everything else is rejected or held.

## Preconditions

- [ ] RB-011 has landed `runRecheck` producing a typed `RecheckVerdict` (locally re-derived `boundary_eff`, findings, `evidence_ref`).
- [ ] RB-010 has landed staged candidates + sidecar provenance (`origin_ref`, `origin_version` are sidecar-only).
- [ ] The content-model `isPublishable(record)` predicate exists (reuse/audit metadata: inputs/outputs, preconditions, provenance, safety boundary, version).
- [ ] The internal preview/admin surface (ADR-0001) exists or is scaffolded as the curator path.
- [ ] Pipeline order is fixed: `import → re-check → curator gate → version → publish`. This runbook does not write the git store or build (that is phase-2); it stops at "approved, ready to version".

## Steps

1. **Implement `publish_decision(item)` as total + side-effect-free.**
   - Do: `publish_decision(item) → PUBLISH_OK | REJECT{reasons[]} | HOLD`. It computes only — it never writes the store (only the audit writer writes, separately). The chain runs G1–G7; the **first hard failure rejects**; soft findings are collected; the **default branch is REJECT**. Same function for agents and humans — no second, looser path.
   - Verify: Property test — the function is defined for every input (including malformed) and performs no writes; an empty/unknown input returns REJECT.

2. **Implement gate checks G1–G7 (eligibility).**
   - Do:
     - G1 Validated source: resolvable provenance ref to a **validated** CAW-02/CAW-03 source ⇒ else REJECT.
     - G2 Effective boundary: `boundary_eff == public` (lattice-max over item + all ancestors, from RB-011) ⇒ else REJECT. This is the spine; never read a cached upstream flag.
     - G3 Visibility: no `private` ancestor (`visibility_eff == team`) ⇒ else REJECT.
     - G4 Redaction-clean: redaction scan returns **zero** hits on the rendered public view ⇒ else REJECT.
     - G5 Evidence-grade: not a bare `generated-summary`; `isPublishable(record)` holds ⇒ else REJECT.
     - G6 Contract version: envelope `contract_version` MAJOR supported ⇒ else REJECT.
     - G7 Integrity: `payload_sha256` matches; signature (if present) verifies ⇒ else REJECT.
   - Verify: One negative test per check — a validated-but-confidential item fails G2; a public-but-unverified item fails G1/G5; a generated-summary with no validated backing fails G5; an unknown contract fails G6; a tampered payload fails G7.

3. **Enforce "validated source AND public-safe" as an AND.**
   - Do: Confirm the two independent conditions both required: validated source (G1, G7) and public-safe boundary (G2, G3, G4). Neither alone yields eligibility.
   - Verify: Tests confirm an item passing only one condition is never eligible.

4. **Implement G8 — curator approval as the only path to live.**
   - Do: After G1–G7 pass with no soft findings, return `HOLD` (eligible, awaiting curator). The only transition to `PUBLISH_OK` is an **explicit human approve event** recorded as `approved_by` against a specific `(artifact_id, version)`. Approval is **version-scoped**: a new version re-enters the gate; prior approval does not carry forward. The gate can never auto-approve.
   - Verify: Test — an eligible item with no approve event stays `HOLD` (on preview/admin, never public); only an explicit approve yields `PUBLISH_OK`; approval on v1.0.0 does not satisfy v1.1.0.

5. **Build the curator approval queue (internal preview/admin only).**
   - Do: Implement `listQueue(filter?)`, `approve(entryId, {semver, notes?})`, `reject(entryId, reason)`. Each `QueueEntry` shows the `RecheckVerdict` (findings + recomputed boundary) and `source_ref` **in admin only**. Queue states: `publish` ⇒ ready; `quarantine` ⇒ blocked (cannot approve until findings resolved); `reject` ⇒ not queued (discarded + audited).
   - Do: `approve` **re-runs `runRecheck` at promotion time** (no stale verdict), then assigns the semver bump and hands off to versioning (phase-2). `reject`/`quarantine` never auto-promote.
   - Verify: Test — a quarantined entry cannot be approved; approving a ready entry re-runs the re-check, records `approved_by`, and produces a `PublishableItem` ready to version; `source_ref` is shown in admin and is absent from any public-projection object.

6. **Implement the append-only, hash-chained `_events` audit writer + `verify_audit()`.**
   - Do: Write one event per gate decision and per publish/unpublish/redact: `{ seq, prev_hash, event, artifact_id, version, source_ref, boundary_eff, visibility_eff, gate_result{G1..G8}, redaction{ruleset_version, hits}, approved_by, envelope_digest, hash }` where `hash = H(prev_hash ‖ canonical(line))`. Implement `verify_audit()` walking the chain → `broken_at`; git history is the redundant second witness. Unpublish/redact are **events, not deletes**.
   - Verify: Test — a publish appends a chained event; tampering with any line makes `verify_audit()` report `broken_at`; "why publishable + who approved" is reconstructable from `gate_result` + `approved_by`.

7. **Enforce the serialization firewall (audit-only fields never serialize).**
   - Do: Confirm `source_ref`, `producer_run_id`, `origin_ref`, `origin_version`, `validated_by`, `reviewer`, redaction internals live in the sidecar / audit ledger only. The queue surface may display them (admin-only); the `publicProjection(record)` allow-list must exclude them.
   - Verify: Test — the deny-listed keys appear in **zero** objects shaped for public output; weakening the test must fail CI. (Full build-artifact enforcement lands in phase-2; this asserts the projection boundary.)

8. **Mutation-test the default-REJECT property.**
   - Do: Add a mutation test: editing the chain so it falls through to `PUBLISH_OK` (weakening the default) MUST break the suite. The gate's auto-path is reject-only.
   - Verify: The mutation (default → `PUBLISH_OK`, or removing the G8 human-approval requirement) fails the suite.

## Acceptance criteria

- [ ] `publish_decision()` is total, side-effect-free, and default-REJECT.
- [ ] G1–G7 enforce eligibility; each has a passing negative test; "validated source AND public-safe" is a strict AND.
- [ ] G5 blocks generated/unverified content (bare generated-summary or `isPublishable` false).
- [ ] G8 is the only path to live; the gate auto-rejects but never auto-approves; approval is version-scoped.
- [ ] `approve` re-runs the re-check at promotion, records `approved_by`, and produces a `PublishableItem` ready to version; `quarantine`/`reject` never promote.
- [ ] Curator queue is internal-only; `source_ref`/findings shown in admin, absent from any public projection.
- [ ] Hash-chained `_events` writer + `verify_audit()` work; unpublish/redact are events, not deletes.
- [ ] Audit-only fields never appear in any public-projection object (serialization firewall test passes).
- [ ] Mutation test: weakening default to `PUBLISH_OK` (or dropping G8) breaks the suite.
- [ ] Tree is green (builds, lints, tests pass).

## Rollback / safety

- The gate is side-effect-free and stops at "approved, ready to version" — no git-store write or build happens here, so a mid-way failure cannot publish. Safe rollback = discard the queue entry / `PublishableItem`; audit events are append-only and must remain (never rewrite the chain).
- An accidental approval before phase-2 versioning has no public effect (nothing is built/served yet). The deny-by-default + human-only-approve properties are release blockers if ever weakened.

## Hand-off

Phase-2 (storage/versioning + build/publish) can assume: an approved `PublishableItem` exists with a re-run-at-promotion `RecheckVerdict`, an assigned semver, a recorded `approved_by`, and a full `gate_result` in the hash-chained audit ledger. The item is `boundary_eff == public`, `visibility_eff == team`, redaction-clean, and evidence-grade. Versioning writes it to `src/content/{...}/<slug>/<semver>.md(x)` (frozen forever) with the sidecar beside it; the build emits web + API with the serialization firewall enforced over every artifact. Audit-only provenance must continue to never serialize.

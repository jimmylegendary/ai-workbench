# RB-011: Build the CORE public-safe re-check (deny-by-default, locally re-derived boundary)

- Status: ready
- Phase: phase-1-import-and-gate
- Depends on: [RB-010 (staged candidates + envelope + sidecar provenance)]
- Implements design:
  - [../../05-publishing-core/import-and-recheck.md](../../05-publishing-core/import-and-recheck.md)
  - [../../04-data-layer/public-safe-and-provenance.md](../../04-data-layer/public-safe-and-provenance.md)
  - [../../07-backend-api/import-service.md](../../07-backend-api/import-service.md)
  - [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
- Produces: the `pub.safe` core re-check library (`runRecheck(staged) → RecheckVerdict`), `boundary_eff`/`visibility_eff` re-derivation, redaction + free-text leak scan over the rendered public view, conflation guard, the `profiles.recheck` config in core, and a negative-heavy, mutation-tested suite.

## Objective

Every imported candidate crosses a **single non-bypassable core stage** that re-derives the public-safe verdict **locally** — never trusting the upstream boundary claim. The re-check is **deny-by-default and fail-closed**: anything not positively confirmed public-safe becomes `quarantine` or `reject`, never `publish`-eligible. It re-derives `boundary_eff` as the lattice-max over the item and **all** provenance ancestors (unresolvable ancestor ⇒ `confidential`/`private`), re-runs the redaction ruleset over the **rendered public view** a reader would see, scans free text for leak markers, and guards against conflation. It emits a typed `RecheckVerdict` (and an append-only audit event) and writes **nothing** to the served corpus. "Done" = a confidential-tagged fixture marked `public` upstream is quarantined with a finding; a clean validated Skill becomes `publish`-eligible.

## Preconditions

- [ ] RB-010 has landed staged candidates carrying the parsed envelope (incl. `provenance.graph`), evidence-only `upstream_boundary_claim`, and a sidecar provenance record.
- [ ] The boundary model is available locally in the core (two axes: `boundary {public ⊂ internal ⊂ confidential}`, `visibility {team, private}`) — a CAW-04-OWN copy, not a shared dependency on CAW-02.
- [ ] The pipeline order fixes the re-check **before** any git write; the re-check lives in the **core**, never in an adapter (ADR-0004 §2).
- [ ] The public-projection / sidecar split exists (RB-001) so the re-check can render the exact public view.

## Steps

1. **Place the re-check as a non-bypassable core stage.**
   - Do: Implement `runRecheck(staged: StagedCandidate): RecheckVerdict` in the core, on the fixed pipeline path between staging and the curator gate. There is **no raw import path** around it (ADR-0004 §2); agents and humans use the same checks.
   - Verify: A structural test confirms the only route from staging to the curator queue passes through `runRecheck`; no adapter, registry config, or alternate entrypoint reaches the queue directly.

2. **Stage 1 — envelope parse + semver/integrity gate.**
   - Do: Re-assert the contract MAJOR is supported and `payload_sha256` matches the canonicalized payload. On failure ⇒ `reject` (never guess).
   - Verify: Unknown MAJOR ⇒ `reject`; digest mismatch ⇒ `reject`.

3. **Stage 2 — re-derive `boundary_eff` / `visibility_eff` locally from provenance.**
   - Do: Compute `boundary_eff` = **lattice-max** over the item + **all** ancestors in `provenance.graph`. Compute `visibility_eff`; any `private` ancestor ⇒ private-derived. An **unresolvable ancestor resolves to `confidential`/`private`** (fail-closed unknown). Set `boundary.recheck_status` from CAW-04's OWN computation — never copy the upstream flag into `classification`.
   - Verify: A candidate citing one `confidential` ancestor yields `boundary_eff = confidential`; an unresolvable ancestor yields fail-closed `confidential`; the upstream `declared_boundary` value never determines the result.

4. **Stage 2b — boundary verdict.**
   - Do: Only `boundary_eff == public` AND `visibility_eff == team` may proceed; otherwise ⇒ `quarantine` (`BOUNDARY_NOT_PUBLIC`).
   - Verify: An `internal`/`confidential` or private-derived candidate is quarantined regardless of upstream claim.

5. **Stage 3 — redaction scan over the RENDERED PUBLIC VIEW.**
   - Do: Build the exact public projection (post-template md/JSON/HTML) and run the redaction ruleset (`scan(rendered_public_view) → Hit[]`) over it — not just raw fields. **Any hit on a candidate-public item ⇒ quarantine + escalate; never auto-strip** (a hit means the source mis-classified). Ruleset version is CAW-04-owned (`ruleset_version`), not imported from CAW-02.
   - Verify: A candidate with a leak marker only visible after template rendering is quarantined with the hit recorded; the candidate is never silently transformed.

6. **Stage 4 — free-text leak scan.**
   - Do: Scan free text for codenames, fab/customer regexes, internal hosts/URLs, employee ids. Any hit ⇒ finding ⇒ quarantine.
   - Verify: A fixture containing an internal host string is quarantined with a finding.

7. **Stage 5 — conflation guard.**
   - Do: Reject/quarantine any candidate that fuses a public source with a confidential one (no laundering by synthesis); keep public-source research separate from internal claims (brief §11).
   - Verify: A merged candidate mixing a public and a confidential ancestor is blocked.

8. **Emit the typed verdict + audit event (no store write).**
   - Do: Return `RecheckVerdict { decision: publish | quarantine | reject, boundary_eff, findings[], evidence_ref }`. Append one `recheck` event to the hash-chained `_events` ledger and set `evidence_ref`. Populate the sidecar `recheck` block (`status`, `rechecked_at`, `boundary_eff`, `visibility_eff`). Write **nothing** to the served corpus; a `publish` verdict only makes the candidate **eligible** (curator G8 still required in RB-012).
   - Verify: A passing candidate yields `decision = publish` + a sidecar `recheck.status = pass`; an audit event is appended and `verify_audit()` still validates the chain; no served output is produced.

9. **Put thresholds + pattern lists in `profiles.recheck` (core only).**
   - Do: House thresholds and pattern lists in `profiles.recheck` inside the core — never in an adapter; the registry can never let an adapter override the re-check (ADR-0004 §4).
   - Verify: A test confirms no adapter can read/write/override `profiles.recheck`.

10. **Negative-heavy + mutation-tested suite.**
    - Do: Write tests dominated by denial cases. Key case: an upstream-`public` candidate carrying a confidential pattern MUST quarantine + log a finding. Add a mutation test: weakening the default decision to `publish` MUST break the suite.
    - Verify: Suite passes; the mutation (default → `publish`) makes it fail.

## Acceptance criteria

- [ ] `runRecheck` is the single, non-bypassable core stage between staging and the curator queue.
- [ ] `boundary_eff` is re-derived locally as lattice-max over item + all ancestors; unresolvable ⇒ fail-closed `confidential`/`private`.
- [ ] The upstream `declared_boundary`/`public_safe` claim is evidence only and never sets `classification`/`recheck_status`.
- [ ] Redaction scans the **rendered public view**; any hit ⇒ quarantine + escalate, never auto-strip.
- [ ] Free-text leak scan and conflation guard are enforced.
- [ ] Deny-by-default: a candidate not positively confirmed public-safe is `quarantine`/`reject`, never `publish`.
- [ ] Each verdict appends a `recheck` audit event; sidecar `recheck` block populated; no served output written.
- [ ] `profiles.recheck` lives in core; no adapter can override it.
- [ ] Negative-heavy + mutation test: weakening the default to `publish` breaks the suite.
- [ ] Tree is green (builds, lints, tests pass).

## Rollback / safety

- The re-check writes nothing to the served corpus and only marks candidates eligible — a mid-way failure cannot publish. Safe rollback = discard the verdict + staged candidate (quarantine is disposable); the appended audit event is append-only and remains as a record (do not rewrite the chain).
- If the re-check is ever found to be skippable, treat it as a release blocker: the deny-by-default + non-bypass property is the load-bearing public-safe guarantee.

## Hand-off

RB-012 (publish gate + curator approval) can assume: every candidate carries a typed `RecheckVerdict` with a locally re-derived `boundary_eff`, a findings list, and an `evidence_ref` into the audit ledger; the sidecar `recheck` block is populated. RB-012 consumes `publish`-eligible candidates into the curator queue, re-runs the re-check at promotion time, and only an explicit human approve (G8) flips a candidate to live. The boundary verdict produced here is authoritative; the upstream claim is never.

# RB-051: Build the fail-closed CAW-03 cited-bundle exporter

- Status: ready
- Phase: phase-5-import-export
- Depends on: [RB-052 (boundary/redaction validation lib), RB-040 (retrieval + provenance hydration), RB-031 (effective-boundary propagation), RB-002 (core txn + audit)]
- Implements design:
  - [../../05-knowledge-core/import-export-flows.md](../../05-knowledge-core/import-export-flows.md) (§5 Export, fail-closed allow-list, bundle payload)
  - [../../01-decisions/ADR-0007-import-export-contracts.md](../../01-decisions/ADR-0007-import-export-contracts.md) (§4 export to CAW-03, §5 fail-closed defaults)
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries.md) (§2 monotone propagation, §4 trust ladder)
- Produces: skill-wrap op `kr.export_bundle` — read-only, boundary-filtered, signed. Emits a signed `*.caw03-bundle.json` (versioned envelope, `boundary_kind=caw03-bundle`) of cited `Claim`+`Evidence`, with a self-contained `bibliography` and `provenance_digest`. Fail-closed: empty/over-share aborts.

## Objective
Build the exporter that hands cited Claim+Evidence bundles to CAW-03 **without ever leaking confidential or jimmy-private data**. "Done" = on explicit curator selection, each Claim's evidence chain is resolved and gated (≥1 concrete Evidence; only-`generated-summary` is refused), each entity's **effective** boundary/visibility is computed via monotone propagation, a fail-closed audience allow-list excludes anything indeterminate, a re-redaction sweep over every string aborts on any hit, citations resolve into a self-contained `bibliography`, Notes are tagged `kind=synthesis, evidence=false`, and the bundle is digested + signed inside the versioned envelope. CAW-02 **emits** the file; it never writes into CAW-03. If the resulting bundle is empty, or a `jimmy-private`/`confidential` item was explicitly requested for a public bundle, the **whole export aborts** with a report of offending ids — never a partial silent leak.

## Preconditions
- [ ] RB-052 merged: `decide()` (fail-closed allow-list), `effective_boundary`/`effective_visibility`, `scan`/`redact`, `parse_envelope`, `write_crossing_audit` available from `kr.boundary`.
- [ ] Retrieval (RB-040) can hydrate a Claim's full provenance chain (source→claim→evidence) so the bundle is the hydrated retrieval result.
- [ ] A signing key + scheme is configured. `TODO(open-question: signature scheme — minisign/cosign/DSSE vs detached sig?)`
- [ ] Tree is green at HEAD.

## Steps

1. **Implement selection + evidence-chain resolution.**
   - Do: `kr.export_bundle(claim_ids, target_audience, purpose)` — selection is an **explicit curator action**. For each Claim, hydrate its `Evidence` chain via retrieval (RB-040).
   - Verify: Given a claim id set, the op returns each Claim with its resolved Evidence list; a non-existent id errors clearly without emitting anything.

2. **Enforce the invariant gate.**
   - Do: Refuse any Claim shipping with zero concrete Evidence, or only `generated-summary` evidence. A refused claim is reported, not silently dropped from a requested set.
   - Verify: A claim with no evidence and a claim with only `generated-summary` evidence are both refused with named reasons.

3. **Compute effective boundary/visibility per entity.**
   - Do: For every Claim, Evidence, and cited Note, compute `effective_boundary`/`effective_visibility` via `kr.boundary` (monotone propagation over provenance ancestors) — **not** the row's own declared flag.
   - Verify: A Claim declared `public` but citing a `confidential` Evidence resolves to effective `confidential`; a Claim with a `private` ancestor resolves to effective `private`.

4. **Apply the fail-closed audience allow-list.**
   - Do: For each entity call `decide(item, target_audience)`. `target_audience=public` drops every entity whose **effective** `boundary != public`; `jimmy-private` (effective visibility `private`) items are **never** exported for any audience; indeterminate → EXCLUDE. Collect dropped ids with reasons.
   - Verify: For a `public` audience, every `internal`/`confidential` effective entity is excluded; a `jimmy-private` entity is excluded for both `public` and `internal` audiences.

5. **Run the re-redaction sweep (abort on hit).**
   - Do: Run `scan()`/`redact()` over all text/locator/citation strings of surviving entities (codename/fab/customer). **Any hit aborts the whole export** with the offending ids (defense in depth even after exclusion).
   - Verify: A surviving entity containing a seeded codename aborts the export; clean strings pass.

6. **Apply the conflation + artifact-disclosure rules.**
   - Do: Enforce conflation guard (no exported claim may fuse a public-source and confidential evidence — abort). Include the raw `artifact_ref` blob only when `target_audience=internal`; otherwise strip the ref and keep only the `value` (CI/unit retained so a projection cannot be presented as a measurement).
   - Verify: A conflated claim aborts; for a `public` audience, `artifact_ref` is null while `value`/CI/unit remain; `model-projection` evidence keeps its CI/unit.

7. **Assemble the self-contained bundle payload.**
   - Do: Resolve all citations into a deduped `bibliography` (so CAW-03 needs nothing else from CAW-02); tag exported Notes `kind=synthesis, evidence=false`. Build the bundle payload (claims[] with trust/boundary + evidence[] {kind, locator, citation, artifact_ref|null, value}) per flows §5.
   - Verify: Every citation in `claims[*].evidence` resolves to a `bibliography` entry; Notes carry `evidence=false`; no dangling citation.

8. **Refuse empty / explicit-over-share, then digest + sign + wrap.**
   - Do: If all entities were dropped → **refuse** (emit nothing, return report). If a `jimmy-private`/`confidential` item was **explicitly requested** for a public bundle → **abort the whole export** with offending ids. Otherwise compute `provenance_digest` (sha256 over claims+evidence), sign, and wrap in the versioned envelope (`boundary_kind=caw03-bundle`).
   - Verify: An all-dropped selection emits no file and returns an error report; an explicit confidential-in-public request aborts; a valid selection produces a signed envelope whose digest re-verifies and whose signature validates.

9. **Emit file + per-crossing audit entry.**
   - Do: Write the `*.caw03-bundle.json`; call `write_crossing_audit(direction="export", boundary_kind="caw03-bundle", selected_ids, dropped_ids, redaction_hits, ...)`. CAW-02 emits only; it never writes into CAW-03.
   - Verify: Exactly one hash-chained `_events` line records selected ids, dropped ids, and redaction deltas; the emitted file is the only external artifact.

## Acceptance criteria
- [ ] Export omits anything not on the allow-list (fail-closed); a `confidential`/`jimmy-private` item can **never** appear in a public-facing bundle (by effective boundary/visibility, not declared flags).
- [ ] Every exported Claim ships ≥1 concrete Evidence; claims with no evidence or only `generated-summary` are refused.
- [ ] Any redaction hit, conflation, empty result, or explicit over-share request **aborts the whole export** with an offending-id report — never a partial silent leak.
- [ ] Bundles are signed, carry a `provenance_digest`, and a self-contained `bibliography`; Notes are `evidence=false`; `artifact_ref` is included only for `internal` audience.
- [ ] This is a file/API boundary only — CAW-02 emits, never writes into CAW-03; no shared store.
- [ ] Each export writes exactly one hash-chained audit entry; the op runs only via skill-wrap through `kr.boundary`.
- [ ] Tree is green (build + lint + tests).

## Rollback / safety
- Export is read-only over the knowledge store: it creates no knowledge nodes, only an emitted file + one audit line. Rolling back = deleting the emitted file; the audit line stays (append-only history).
- Fail-closed by construction: indeterminate → exclude; empty/over-share → abort emitting nothing. A broken signer aborts before emission rather than shipping an unsigned bundle.

## Hand-off
CAW-03 (a separate product) can pull a signed, self-contained `*.caw03-bundle.json` and verify its `provenance_digest` + signature, emit BibTeX from the `bibliography`, and trust that nothing `confidential`/`jimmy-private` is present and that synthesis is flagged non-evidence. No further CAW-02 call is needed; the boundary is auditable and replayable.

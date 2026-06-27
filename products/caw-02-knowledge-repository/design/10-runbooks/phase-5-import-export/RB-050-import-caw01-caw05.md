# RB-050: Build the CAW-01 projection + CAW-05 signal importers

- Status: ready
- Phase: phase-5-import-export
- Depends on: [RB-052 (boundary/redaction validation lib), RB-002 (core txn + evidence gate + op manifest), RB-030 (provenance/trust), RB-012 (deterministic reindex)]
- Implements design:
  - [../../05-knowledge-core/import-export-flows.md](../../05-knowledge-core/import-export-flows.md) (§3 Import A CAW-01, §4 Import B CAW-05, §6 mapping table)
  - [../../01-decisions/ADR-0007-import-export-contracts.md](../../01-decisions/ADR-0007-import-export-contracts.md) (§2 CAW-01→Evidence, §3 CAW-05→typed nodes, §5 defaults)
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries.md) (§5 evidence gate, §6 quarantine-on-import)
- Produces: skill-wrap ops `kr.import_projection` (CAW-01) and signal intake (`kr.classify_signal` / `kr.extract_claims`) (CAW-05); a quarantine partition; the content-addressed vault copy path; node-mapping that makes a projection `Evidence` (never a `Claim`) and excludes a signal's `raw_summary` from evidence.

## Objective
Build the two importers that bring foreign knowledge across the boundary **safely**. "Done" = a CAW-01 projection file lands **quarantined**, passes confidentiality checks (boundary floor, scrub, re-redaction, leak scan, audience), is copied into CAW-02's content-addressed vault, and is mapped to `Evidence` (+ `SimulationRun`/`Experiment` refs) — **never a `Claim`**; and a CAW-05 signal is quarantined, deduped, confidentiality-checked, and mapped to `Source`/`RelatedWork`/`Claim`/`OpenQuestion` with the candidate Claim's evidence = `Source` + `evidence_locator` while `raw_summary` is stored as `kind=generated-summary` and **excluded from evidence**. Both run only as vetted skill-wrap actions through `kr.boundary`; nothing is queryable until checks pass; each crossing writes one audit entry. Imports may downgrade trust but never silently upgrade boundary; imported items land at `T0`/`internal` until the local evidence gate passes.

## Preconditions
- [ ] RB-052 merged: `parse_envelope`, `semver_gate`, `scan`/`redact`, `effective_boundary`, `write_crossing_audit` available from `kr.boundary`.
- [ ] Core txn (RB-002) enforces the structural evidence gate (`evidence` has no prose field; `artifact_uri`+`locator` required) and append-only writes.
- [ ] A content-addressed vault location (`caw02-vault://<sha>`) is configured per ADR-0002 (RB-010 storage).
- [ ] Reindex (RB-012) is idempotent so newly mapped nodes become queryable only after commit.
- [ ] Tree is green at HEAD.

## Steps

1. **Create the quarantine partition.**
   - Do: Add an isolated staging area (e.g. `knowledge/_quarantine/<crossing_id>/`) that the reindexer **excludes** — staged items are never queryable. Define a quarantine record holding the raw envelope, parse status, and check results.
   - Verify: A staged item does not appear in any retrieval/FTS query after reindex; only committed (post-check) nodes do.

2. **Implement `kr.import_projection` envelope intake (CAW-01).**
   - Do: Read the `*.caw01.json` envelope; call `parse_envelope` + `semver_gate` (reject unknown MAJOR), verify `payload_sha256`. Make the op **idempotent on `(source_product, export_id)`** — a re-import dedups by `payload_sha256` and does not create a second Evidence node.
   - Verify: Unknown MAJOR and digest mismatch are rejected before any staging side-effect; re-running the same file twice yields exactly one Evidence node.

3. **Stage + copy the projection artifact into the vault.**
   - Do: Quarantine the envelope; copy any large artifact (by value or path/URI) into `caw02-vault://<sha>`, storing the hash for later integrity checks. Reconstruction must never depend on CAW-01 being up (copy, not live reference).
   - Verify: After import, the artifact resolves from the vault with the recorded sha while the CAW-01 source path is unreachable in a test.

4. **Run the CAW-01 confidentiality checks (flows §3 table).**
   - Do: Apply, via `kr.boundary` where shared: **boundary floor** (`imported >= declared_boundary`; clamp to stricter, never downgrade); **confidential-field scrub** (if `confidential_fields` set and no `public_safe_view`, store **only** at `confidential`, else keep quarantined → curator); **re-redaction** (run `redact()` regardless of `redaction_applied`, log the delta); **free-text leak scan** (`scan()` over `title`/`metric` for codename/fab/customer → flag for review); **audience** (`jimmy-private` → private partition, never auto-shared to team). Any hard failure keeps the item quarantined and raises to the curator.
   - Verify: A projection declared `internal` carrying a confidential marker is clamped/kept at `confidential`; a producer claiming full `redaction_applied` still gets re-redacted (delta logged); a `jimmy-private` projection never lands in a team-visible view.

5. **Map the projection to `Evidence` (never a `Claim`).**
   - Do: On pass, create `Evidence(kind, value, locator, boundary)` plus catalog `SimulationRun`/`Experiment` refs; the curator/skill authors the `Claim` text separately and the projection is what it POINTS AT. `kind=model-projection` keeps its CI/unit; `kind=generated-summary` is cataloged at low trust, flagged "not evidence-grade", and **cannot be the sole evidence** for a claim. Commit via the core txn (markdown + hash-chained event).
   - Verify: The import never creates a `Claim` node; a claim whose only evidence is `generated-summary` is rejected by the evidence gate; `model-projection` evidence retains `ci_low/ci_high/unit`.

6. **Implement CAW-05 signal intake (JSONL).**
   - Do: Read `*.caw05.jsonl` one signal per line; for each line run the envelope semver gate, then **quarantine** the signal (unverified, unlinked). **Dedup** against existing `Source` by `external_ids`/`doi` (Levenshtein-title fallback).
   - Verify: A duplicate DOI maps onto the existing Source (no duplicate); a malformed line is quarantined, not committed, and does not abort the whole file.

7. **Run the CAW-05 confidentiality checks (flows §4 table).**
   - Do: Apply **provenance separation** (public sources tagged `boundary=public`, never merged into internal Samsung/SAIT claims — block cross-tag link); **conflation guard** (a Claim may not fuse a public `Source` and a `confidential` projection as one evidence item — force separate evidence rows); **URL/PII sanity** (reject internal-host URLs, strip tracking params); **classification trust** (`unknown` → T0, not auto-linked).
   - Verify: An attempt to attach a public Source and a confidential projection to one evidence item is split into separate rows; an internal-host URL signal is rejected; an `unknown`-classified signal stays unlinked at T0.

8. **Map the signal to typed nodes; exclude `raw_summary` from evidence.**
   - Do: Create `Source` (boundary=public for external work); `classification threat|support` → typed `RelatedWork` link to the targeted `Claim`/`Concept`; each `extracted_claims[*]` → candidate `Claim` whose `Evidence` is the `Source` + a concrete `evidence_locator` (e.g. `p.4 §3.2 / fig 2`) — **never** the `raw_summary`; store `raw_summary` on the `Source` as `kind=generated-summary` (excluded from evidence); a tension / credible threat on an accepted claim → auto-raise an `OpenQuestion` and notify the reviewer. Candidates are reviewed by default (no silent auto-accept). Commit via core txn.
   - Verify: The candidate Claim's evidence edge points at the Source+locator, not the summary; `raw_summary` is never the `from` of an `evidence_for` edge; a threat-on-accepted-claim produces an `OpenQuestion`.

9. **Write the per-crossing audit entry for each import.**
   - Do: Call `write_crossing_audit(direction="import", boundary_kind, selected_ids, dropped_ids, redaction_hits, ...)` once per crossing.
   - Verify: Exactly one hash-chained `_events` line per import records mapped ids, quarantined/dropped ids, and redaction deltas.

## Acceptance criteria
- [ ] Importing a CAW-01 projection lands it **quarantined** and runs the confidentiality check table **before** any node is created; failures keep it quarantined and raise to the curator.
- [ ] A projection maps to `Evidence` (+ optional `SimulationRun`/`Experiment`), **never** a `Claim`; `generated-summary` cannot be sole evidence.
- [ ] Re-import of the same envelope dedups by `payload_sha256` (idempotent); the artifact is reconstructable from the vault without CAW-01.
- [ ] A CAW-05 signal maps to `Source`/`RelatedWork`/`Claim`/`OpenQuestion`; the candidate Claim's evidence is `Source`+`evidence_locator`; `raw_summary` is `kind=generated-summary` and **excluded from evidence**.
- [ ] Boundary is never silently upgraded downward (floor/clamp holds); re-redaction runs regardless of producer claims; `jimmy-private` never auto-shared to team.
- [ ] Each import writes exactly one hash-chained audit entry; both ops run only via skill-wrap through `kr.boundary`.
- [ ] Tree is green (build + lint + tests).

## Rollback / safety
- All staging is in the quarantine partition (reindex-excluded); a mid-way failure leaves no queryable node and no orphan file (core txn is atomic — abort leaves nothing committed).
- To roll back a committed import, supersede the created nodes via append-only events (no destructive delete); the vault copy is content-addressed and harmless to retain.
- Fail-closed: any indeterminate confidentiality check keeps the item quarantined rather than mapping it.

## Hand-off
RB-051 (export) may assume imported foreign artifacts are first-class `Evidence`/`Source` nodes carrying correct `boundary`/`visibility` and trust (≤ the AI/import caps), reconstructable from the vault, and that `generated-summary` is flagged non-evidence — so export's evidence-invariant and effective-boundary gates operate on clean, labeled nodes.

# RB-040: Build the ExportAdapter seam and the v1 CAW-02/03/01/06 bundle adapters

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-031 (append-only ledger + LedgerLink), RB-032 (synthesis/digest + paper-card/action-brief), RB-003 (ports registry + ExportAdapter port stub), RB-021 (two-axis classification + review gate)]
- Implements design: [../../05-radar-core/export-boundaries.md](../../05-radar-core/export-boundaries.md), [../../01-decisions/ADR-0007-export-boundaries.md](../../01-decisions/ADR-0007-export-boundaries.md), [../../05-radar-core/synthesis-and-formats.md](../../05-radar-core/synthesis-and-formats.md)
- Produces: `ExportAdapter` concrete v1 adapters (`Caw02SourceClaimExportAdapter`, `Caw03NoveltySignalExportAdapter`, `Caw01OpenQuestionExportAdapter`, `Caw06OpenQuestionExportAdapter`); the `caw05-signal` envelope builder + signer; documented stub adapters; negative-test suite N1–N6.

## Objective
The radar can project **confirmed `LedgerLink`s** into a single, signed, content-addressed `caw05-signal`
boundary bundle (`*.caw05.jsonl`) and drop it where a named consumer (CAW-02/03/01/06) pulls it — through the
`ExportAdapter` port as the **only** export seam. "Done" means: a routed novelty-threat finding produces a
public-only, idempotent bundle for CAW-03 (and the relation-projected targets) in which `raw_summary` never
appears in any evidence field; every fail-closed rule (N1–N6) is enforced by an executable test; and a new
downstream consumer is one adapter file + one config flag with no core edit.

## Preconditions
- [ ] RB-003 exposed the `ExportAdapter` `Protocol` + the config-driven adapter registry; core depends only on the port.
- [ ] RB-031 produces append-only `ledger/*.jsonl` with provenance-complete `LedgerLink`s carrying `relation`, `WatchedTarget.foreign_ref`, and an S2 `verification` record (or `pending-ledger-verification` flag).
- [ ] RB-021 produces a `RoutedSignal` that has cleared the classification review gate (abstain→human already resolved; `noise` already excluded).
- [ ] RB-032 produces the synthesis manifest with `evidence:false` for paper-card (→CAW-02/03) and action-brief (→CAW-01/06).
- [ ] `boundary` (public/internal) is stamped on every finding/link by ingestion provenance.
- [ ] Tree is green (compiles, lint-passes).

## Steps

### 1. Define the `caw05-signal` envelope + per-signal payload type
- **Do:** Add a typed `Caw05SignalBundle` envelope and `Signal` payload matching export-boundaries.md §3 / ADR-0007 §2 exactly: envelope = `contract_version` (semver "1.0.0"), `source_product=caw-05`, `produced_at` (RFC3339), `producer_run_id` (ULID), `declared_boundary=public`, `declared_audience`, `payload_sha256`, `redaction_applied[]`, `signature`, `payload.signals[]`. Per-signal = `source{title,authors,venue,year,doi,url,external_ids}`, `classification`, `relevance{score,rationale}`, `related_to[]`, `extracted_claims[{text,evidence_locator}]`, `verification{status,match_ratio,canonical_key}`, `raw_summary{kind:"generated-summary",text}`, `idempotency_key`. Do NOT add per-consumer fields — one envelope for all.
- **Verify:** A unit test round-trips a sample bundle through serialize→parse with no field loss; a schema assertion fails if `raw_summary.kind != "generated-summary"`.

### 2. Implement the relation→classification projection (deterministic)
- **Do:** Implement a pure function `project(relation) -> {target: classification}` from the table in export-boundaries.md §2 / ADR-0007 §3: `novelty-threat`→{caw03:`threat`, caw02:`threat`, caw01/06:open-question}; `support`→{caw03:`support`, caw02:`support`}; `adjacent`→{caw02:`neutral`}; unverified link→`unknown` (**never to CAW-03's gate**); `noise`→**nothing, never exported**. Put `WatchedTarget.foreign_ref` (`caw03-claim:…`/`caw02-concept:…`) into `related_to[]` so each consumer sees its own namespace — CAW-05 does the projection; consumers never re-map our ids.
- **Verify:** A table-driven test asserts each relation maps to exactly the routed targets and classifications in the table; `noise` and unverified→CAW-03-gate both yield empty/refused.

### 3. Implement the evidence-separation + redaction sweep (fail-closed)
- **Do:** Before building any signal, run a sweep that (a) asserts `raw_summary` is excluded from every evidence field — the only backing is `source` + `evidence_locator`; (b) asserts `declared_boundary=public` and aborts the **whole bundle** if any link is non-public; (c) records applied rules in `redaction_applied[]`. Generated rationale/summary is recorded but NEVER emitted as evidence (brief §5, §12).
- **Verify:** N1 test — a generated summary placed in an evidence field is refused. N2 test — a non-public link in a public bundle aborts the bundle (no partial file written).

### 4. Implement content-addressing + idempotency
- **Do:** Compute `payload_sha256` over the canonical-serialized `payload`; set per-signal `idempotency_key = hash(finding_id + target + classification_version)` (ADR-0006 §4.4); carry `canonical_key` from S2 verification for consumer-side Source dedup. Make `export()` idempotent: re-emitting the same `payload_sha256`/idempotency_key is a no-op.
- **Verify:** N4 test — calling `export()` twice on the same `RoutedSignal` writes one bundle and the second is a no-op (no double-route). Changing one field changes `payload_sha256`.

### 5. Implement the signer
- **Do:** Sign the envelope and populate `signature`. Use a pluggable scheme behind a `Signer` interface; default to a single family-aligned scheme. Mark the concrete scheme `TODO(open-question: family-wide scheme — minisign/cosign/DSSE; align with CAW-02's verifier)`.
- **Verify:** A produced bundle's signature verifies with the matching verifier; a tampered payload fails verification.

### 6. Implement the four v1 ExportAdapters over the port
- **Do:** Implement `Caw03NoveltySignalExportAdapter` (accepts `NOVELTY_SIGNAL`), `Caw02SourceClaimExportAdapter` (accepts `SOURCE_CLAIM`), `Caw01OpenQuestionExportAdapter` + `Caw06OpenQuestionExportAdapter` (accept `OPEN_QUESTION`). Each sets `capabilities` (target, accepts[], bundle_format); `can_accept()` does a no-I/O type/boundary/format preflight; `export()` builds via steps 1–5 and writes `*.caw05.jsonl` (one signal per line) to the consumer's boundary drop location. paper-card → CAW-02+CAW-03; action-brief → CAW-01/CAW-06 (synthesis-and-formats §; both carry `evidence:false`). Adapters consume only a gate-cleared `RoutedSignal` — there is NO path from a raw finding to a bundle.
- **Verify:** For each adapter, `can_accept()` rejects a mismatched signal type; `export()` of a matching confirmed signal writes a valid signed `*.caw05.jsonl` at the configured boundary URI. N3 test — an unreviewed (`proposed`) link to CAW-03's gate is refused.

### 7. Enforce confirmed-only + empty-bundle rules
- **Do:** Default profile = **confirmed-only**; only Jimmy-confirmed links route. A `propose-only` profile may emit `proposed` links flagged `auto` to a low-stakes digest target — **never to CAW-03's gate**. Refuse an empty bundle: nothing to export → error + report, never a silent empty file.
- **Verify:** N5 test — a `noise`-classified finding never appears in any bundle. N6 test — an empty export raises an error and writes no file.

### 8. Register adapters + the documented stub pattern
- **Do:** Register the four v1 adapters in the config-driven registry (`maturity="v1"`). Add documented stub adapters for other downstream targets (`maturity="stub"`, registered, refuse on `export()` with a clear "stub" message). Confirm the seam test: a new consumer = one adapter file + one config flag, no core edit, no new contract.
- **Verify:** Registry lists 4 v1 + the stubs; calling a stub `export()` returns a documented refusal; core imports the port only, never a concrete adapter (grep the core package for concrete adapter imports → none).

## Acceptance criteria
- [ ] All exports go through the `ExportAdapter` port; core has zero concrete-consumer imports.
- [ ] A confirmed novelty-threat produces a signed, public-only, content-addressed `*.caw05.jsonl` for CAW-03 and the relation-projected targets.
- [ ] `relation → classification` projection matches export-boundaries.md §2 exactly; `related_to[]` carries `foreign_ref` (consumer namespace).
- [ ] `raw_summary` is `kind=generated-summary` and absent from every evidence field; backing is always `source` + `evidence_locator`.
- [ ] Negative tests N1–N6 all pass.
- [ ] Stub adapters registered + documented; seam test holds (new consumer = 1 file + 1 flag).
- [ ] Tree is green.

## Rollback / safety
- The port + adapters are additive; to roll back, deregister the v1 adapters (config flag) — the core Run still completes through `synthesize` and skips `export` cleanly.
- All writes are content-addressed file drops to boundary locations; no sibling store is ever written, so a bad bundle is deleted without side effects. A failed/aborted bundle leaves NO partial file (steps 3, 7).
- Never weaken N1–N6 to make a build pass; a failing negative test means stop and fix, not bypass.

## Hand-off
- RB-041 (scheduler/Run) can call `export` as the final pipeline stage with idempotency guaranteed (retries never double-route).
- RB-042 (CLI/MCP) can expose `export` as a gated terminal op: CLI executes (operator is the gate), MCP is proposal-only.
- M2 (RB-05x) hardens CAW-03 export to require a provenance-complete, S2-verified `LedgerLink`; this runbook already wires the `verification` field and the unverified→`unknown` path.

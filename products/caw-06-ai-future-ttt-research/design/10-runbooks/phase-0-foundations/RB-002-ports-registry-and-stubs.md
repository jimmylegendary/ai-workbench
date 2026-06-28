# RB-002: Define the three ports, the config-driven registry, preflight, and documented stubs

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [../../05-ttt-research-core/ports-and-adapters.md](../../05-ttt-research-core/ports-and-adapters.md), [../../01-decisions/ADR-0001-product-surface-and-scout.md](../../01-decisions/ADR-0001-product-surface-and-scout.md), [../../01-decisions/ADR-0005-source-and-claim-ingestion.md](../../01-decisions/ADR-0005-source-and-claim-ingestion.md), [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger.md), [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries.md)
- Produces: the three port interfaces (`SourceAdapter`, `ExperimentRunnerAdapter`, `ExportAdapter`), a config-driven `ADAPTERS` registry resolving by port+key, a preflight that reports each adapter's health, the documented-stub pattern (`health()=not-built`, calls raise `NotImplementedError` pointing at the ADR), and in-memory fakes for tests.

## Objective
Lay the three integration seams the whole pipeline depends on, with NO real external adapters yet. "Done" = each port is a typed interface (Protocol) matching ports-and-adapters.md §2–§4; a config-driven registry maps `(seam, key) → adapter class` with every v1 slot occupied by a documented stub; a preflight surfaces each registered adapter's `health()` (real/stub/not-built) without making network calls; the documented-stub pattern is uniform (registered + importable, `health()` returns `not-built`, any operational call raises `NotImplementedError` citing the owning ADR); and deterministic in-memory **fakes** exist for tests so later phases can exercise the core without real I/O. The core depends only on the ports (RB-001 boundary rule). This runbook implements interfaces + wiring + stubs + fakes only — real adapters (arXiv/S2, CAW-05 import, local toy runner, CAW-01/02 export) are later phases.

## Preconditions
- [ ] RB-001 complete: `check` is green; the `core→ports` boundary rule and op-manifest exist.
- [ ] Schema record types may not exist yet (RB-003); ports reference record kinds by lightweight typing/forward refs or the op-manifest names, and are tightened once RB-003 lands.

## Steps

1. **Do:** Define `ports/source_adapter.py` per ports-and-adapters.md §2: a `SourceAdapter` Protocol with `name: str`, `discover(query) -> list[SourceRef]` (S1), `fetch(ref) -> RawSource` (S2), and `health() -> AdapterStatus`. Document that canonicalization/dedup/extraction are the pipeline's job (S3–S5), not the adapter's, and that CAW-05 signals enter as claims-to-verify across a boundary (never a shared store).
   **Verify:** the module imports; `typecheck` accepts the Protocol; a docstring cites ADR-0005.

2. **Do:** Define `ports/runner_adapter.py` per §3: an `ExperimentRunnerAdapter` Protocol with `name`, `plan(hypothesis_ref) -> ExperimentPlan` (pre-registers the decision rule), `run(plan) -> RunResult` (captures config+seed+env), `health()`. Document that the **reproducibility gate is enforced by the ledger writer, not the adapter**, and a runner cannot self-certify a result or silently drop a failure (ADR-0003; brief §5).
   **Verify:** module imports; `typecheck` passes; docstring states the gate is owned by the core/ledger, not the adapter.

3. **Do:** Define `ports/export_adapter.py` per §4: an `ExportAdapter` Protocol with `name`, `validate(bundle) -> ValidationResult` (per-target eligibility + schema gate), `emit(bundle) -> Receipt` (one-way push), `health()`. Document that `emit()` is unreachable unless `validate()` passed, that generated evidence can never promote status, and that no adapter reads/writes another product's store (ADR-0008).
   **Verify:** module imports; `typecheck` passes; docstring states `emit` is gated behind `validate`.

4. **Do:** Add a shared `AdapterStatus` type (e.g. `ok | degraded | not-built`) and a `health()` contract used by all three ports, so the CLI/MCP surfaces can later report stubs uniformly (ports-and-adapters.md open question on a uniform not-built health contract).
   **Verify:** all three ports import `AdapterStatus`; a test asserts the enum includes `not-built`.

5. **Do:** Implement the documented-stub base in each `adapters/{sources,runners,exports}/_stubs.py`: a stub class implementing its port where `health()` returns `not-built` and every operational method raises `NotImplementedError` with a message pointing at the owning ADR (e.g. "StubSourceAdapter not built — see ADR-0005"). These satisfy ports-and-adapters.md §4 "documented stub contract".
   **Verify:** each stub imports, `health()` returns `not-built`, and calling an operational method raises `NotImplementedError` whose message names an ADR.

6. **Do:** Create the config-driven registry `core/registry.py` plus `config/adapters.yaml` (or fold into the existing `config/*.yaml`) holding the `ADAPTERS` map from ports-and-adapters.md §4: seams `source`/`runner`/`export`, each key bound to a class — at P0 every v1 key (`arxiv`, `caw-05`, `local-toy`, `caw-01`, `caw-02`) points to its documented stub, and the listed stub keys (`rss`, `external`, `caw-03`, `http`) too. The registry resolves by `(seam, key)`; the pipeline core resolves only through it (the registry is the only place adapters are named).
   **Verify:** `registry.resolve("source","arxiv")` returns an instance; resolving an unknown key raises a clear error; a test asserts the core never imports an adapter module directly (covered by RB-001 boundary check).

7. **Do:** Implement a `preflight()` (in `core/registry.py` or `surfaces`) that iterates all registered adapters and collects `health()` without any network/disk side effects, returning a report (`seam, key, status`). This is the "registry config present / health surfaced" basis the surfaces and P4 entry gate rely on.
   **Verify:** `preflight()` runs offline and reports `not-built` for every adapter at P0; a test asserts it returns one row per registered key and makes no I/O (e.g. via a no-network fake clock/monkeypatch).

8. **Do:** Add deterministic in-memory **fakes** under `tests/fixtures/` (or `tests/adapters/`): `FakeSourceAdapter` (returns fixed `SourceRef`/`RawSource`), `FakeRunner` (returns a fixed `RunResult` incl. a forced-failure variant so negative results are testable), and `FakeExportAdapter` (records emitted bundles, lets `validate()` pass/fail on demand). These let later phases test the core+gates with no real I/O.
   **Verify:** a test wires each fake through the registry and round-trips a call; the `FakeRunner` failure variant produces a result the ledger would classify as a negative result (asserted fully in P2).

## Acceptance criteria
- [ ] `SourceAdapter`, `ExperimentRunnerAdapter`, `ExportAdapter` Protocols exist and match the signatures in ports-and-adapters.md §2–§4; `typecheck` passes.
- [ ] The `ADAPTERS` registry resolves by `(seam, key)`; it is the only place adapters are named; the core resolves only through it (RB-001 boundary check still green).
- [ ] Every v1 and stub slot is occupied by a documented stub whose `health()` returns `not-built` and whose operational calls raise `NotImplementedError` citing an ADR.
- [ ] `preflight()` reports each adapter's health offline (no network/disk side effects) — one row per registered key.
- [ ] Gate ownership is documented at each port: reproducibility on the ledger writer (not the runner), export-eligibility on `validate()` (emit unreachable otherwise), status/uncertainty + evidence cap on the core — adapters are transport+shape, never policy.
- [ ] In-memory fakes (incl. a forced-failure runner) exist for tests; the tree stays green (P0 exit: "three ports compile with stub implementations that raise NotImplemented-style guards").

## Rollback / safety
- All changes are additive (port modules, registry, stubs, fakes, one config file). Rollback = revert the three `ports/*.py` to RB-000 placeholders, delete `core/registry.py`, `config/adapters.yaml`, the `_stubs.py` bodies, and the fakes.
- Safety: a stub MUST raise on operational calls (never return fabricated data) so an accidentally-active stub fails loudly rather than emitting fake sources/results/exports. Never register a real network adapter in this runbook.

## Hand-off
The next runbooks can assume: three stable port interfaces, a config-driven registry resolving by port+key, a uniform documented-stub contract with offline preflight health, and deterministic fakes for testing. RB-003 fills the record + `wbtraffic.v0` schemas the ports reference and the store reader/writer. Phase-1+ runbooks each add exactly one real adapter behind its port and flip its registry key from stub to real, with the three gates already owned by the core and enforced by RB-001's boundary check.

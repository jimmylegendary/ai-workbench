# RB-002: The five ports, config-driven registry, preflight, documented stubs, and fakes

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [../../05-radar-core/ports-and-adapters.md](../../05-radar-core/ports-and-adapters.md), [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../../01-decisions/ADR-0003-source-adapters-and-ingestion.md), [../../01-decisions/ADR-0004-classification-and-triage.md](../../01-decisions/ADR-0004-classification-and-triage.md), [../../01-decisions/ADR-0007-export-boundaries.md](../../01-decisions/ADR-0007-export-boundaries.md)
- Produces: the five `Protocol` ports (`SourceAdapter`, `Classifier`, `FormatRenderer`, `ExportAdapter`, `SchedulerAdapter`); the shared value objects (`RawFinding`, `Verdict`, `FindingGroup`, `Artifact`, `RoutedSignal`, `Cursor`, `AdapterCapabilities`, descriptors); the `AdapterRegistry` (decorator + entry-point discovery); the `caw05.config.toml` loader; **preflight** (capability + ToS + no-active-stub validation); every brief-§9 documented stub; fakes for every port; the no-adapter-bypass guard test.

## Objective
Make the ports-and-adapters seams real so that — per the seam test ([ports-and-adapters.md §6](../../05-radar-core/ports-and-adapters.md)) — a new source/export/scheduler is "one adapter file + one config block" touching nothing in `core/`. "Done" means: the five typed ports compile and match the op-manifest value types; the registry discovers built-in (decorator) and external (entry-point) adapters; preflight rejects a stub/incapable/ToS-unsafe/misconfigured wiring with an actionable message BEFORE any I/O; every brief-§9 stub is registered, discoverable, and refused when made active; fakes let the no-op Run pass through every port; and a guard test proves no adapter path reaches synth/export without passing classify→route→review-gate. No real network adapters are built here (Phase 1).

## Preconditions
- [ ] RB-001 complete: green CI, strict typing, op-manifest typed specs, enforced core→ports boundary.
- [ ] You have read the choke-point invariant ([ports-and-adapters.md §1](../../05-radar-core/ports-and-adapters.md)): an adapter only ever produces a `RawFinding` or consumes a `RoutedSignal`; it cannot short-circuit classify/route/review-gate — that is what keeps generated summaries from being exported as evidence and unreviewed novelty-threats from reaching CAW-03.
- [ ] `pydantic` v2 available; entry-point groups declared in RB-000's `pyproject.toml`.

## Steps

1. **Define the shared value objects.**
   - Do: In `core/model/` add pydantic value objects carrying provenance and boundary on every record: `RawFinding` (source-tagged, `boundary=public`, large artifacts referenced BY PATH not inlined), `Cursor`, `Verdict` (two axes: novelty-threat/support/adjacent/noise × signal/hype, plus `confidence` and an `abstain` state, plus a `generated_rationale` field explicitly typed `kind=generated` / non-evidence), `FindingGroup`, `Artifact` (markdown, `kind=generated`, non-evidence banner), `RoutedSignal` (destination + idempotency key), and `AdapterCapabilities` + `AdapterDescriptor` exactly as in [ports-and-adapters.md §4](../../05-radar-core/ports-and-adapters.md).
   - Verify: models import; a test asserts `Verdict` supports `abstain` and that `generated_rationale`/`Artifact` are flagged non-evidence.

2. **Define the five ports as typed Protocols (no I/O).**
   - Do: In `ports/` write the five `Protocol`s with the signatures from [ports-and-adapters.md §2](../../05-radar-core/ports-and-adapters.md): `SourceAdapter` (`discover/fetch/health`), `Classifier` (`classify` → `Verdict`, abstain→human on low confidence per ADR-0004), `FormatRenderer` (`applies_to/render`), `ExportAdapter` (`can_accept/export` → idempotent file-drop), `SchedulerAdapter` (`install/status/uninstall`). Add `ports/classifier.py` (the Classifier port not created in RB-000). Each exposes a `capabilities: AdapterCapabilities`. Ports import stdlib + `core.model` only.
   - Verify: `mypy` strict passes; the boundary test still holds (ports import no core/adapters).

3. **Implement the AdapterRegistry (two-layer discovery).**
   - Do: In `core/registry.py` implement `AdapterRegistry.register/get/list` with (1) built-in registration via a `@register(port=..., id=...)` decorator and (2) entry-point discovery over the `caw05.*_adapters` / `caw05.format_renderers` / `caw05.classifiers` groups via `importlib.metadata`. `list(port)` returns ids + capability descriptors for preflight/CLI/MCP. The registry lives in core but holds only `Protocol` references — no concrete import.
   - Verify: a fake adapter decorated with `@register` appears in `registry.list("source")` with its descriptor.

4. **Implement the config loader.**
   - Do: Parse `caw05.config.toml` (stdlib `tomllib`) into typed `AdapterConfig` per port: `active` lists/ids per port, per-adapter blocks (e.g. `[adapters.source.arxiv-s2]`), and `enabled=false` for stubs. One block per port is the ONLY wiring surface ([ports-and-adapters.md §3](../../05-radar-core/ports-and-adapters.md)).
   - Verify: loading the RB-000 `caw05.config.toml` yields the per-port `active` sets; an unknown port key is a clear error.

5. **Implement preflight (capability + ToS + no-active-stub — no I/O).**
   - Do: Add a `preflight()` in core that, before any Run, resolves each `active` id, reads its descriptor, and validates WITHOUT I/O ([ports-and-adapters.md §4](../../05-radar-core/ports-and-adapters.md)): every export `accepts` the signal kinds the Run will route; every source declares a legal `tos_class` and a cursor kind; required auth/config present; and **no `active` adapter has `maturity="stub"`**. A `tos-restricted` source is refused unless explicitly cleared (PRODUCT-BRIEF §12). Each failure returns an actionable message naming the file to fix. Wire `caw05 run` to call preflight first.
   - Verify: forcing a stub `active` makes preflight fail pointing at the stub file; a ToS-restricted source `active` without clearance fails; a clean v1-only wiring passes.

6. **Ship the documented stubs (brief §9).**
   - Do: For every brief-§9 future adapter, create a registered, config-disabled stub file following the [ports-and-adapters.md §5](../../05-radar-core/ports-and-adapters.md) pattern (real interface, docstring contract + config example, `maturity="stub"`, methods raise `NotImplementedError`, `health()` returns not-implemented): Source — `hn-reddit`, `securities` (SEC/EDGAR ≤10 req/s, no key), `newsletter`, `internal-feed`; Scheduler — `systemd-timer`, `github-actions`, `cloud-scheduler`, `airflow`; Export — `_stub_target`; FormatRenderer — a future format (e.g. `tweet-thread`); Classifier — embedding-lane classifier (alpha, gated). Each docstring states legal/ToS must be confirmed before enabling.
   - Verify: each stub appears in `registry.list(<port>)`; `caw05 adapters` (CLI) lists them as `stub`; preflight refuses each when made `active`.

7. **Build fakes for every port.**
   - Do: In `tests/fakes/` implement `FakeSourceAdapter` (returns canned `RawFinding`s with provenance), `FakeClassifier` (deterministic `Verdict`, including a low-confidence `abstain` case), `FakeFormatRenderer`, `FakeExportAdapter` (records idempotency keys, no-op on repeat), `FakeScheduler`. These let the Run exercise every port with no network.
   - Verify: `caw05 run --dry-run` (or a test harness wiring fakes) flows collect→dedup→classify→route→synth→export over fake findings, with the abstain case routed to `data/review/`, green.

8. **Add the no-bypass guard test.**
   - Do: Add `tests/test_no_bypass.py` proving every adapter path reaches synth/export ONLY after classify→route→review-gate ([ports-and-adapters.md §8](../../05-radar-core/ports-and-adapters.md) bypass guard): assert the pipeline rejects a finding that lacks a `Verdict`, and that an `abstain` verdict goes to review (not auto-routed/exported). Also assert generated rationale / `Artifact` are never placed into an export evidence field.
   - Verify: `pytest tests/test_no_bypass.py` passes; deleting the gate makes it fail (then revert).

## Acceptance criteria
- [ ] The five ports compile under `mypy` strict and use only `core.model` value objects.
- [ ] `AdapterRegistry` discovers both decorator-registered and entry-point adapters; `list()` returns descriptors.
- [ ] Preflight runs with NO I/O and rejects: an `active` stub, a ToS-restricted/unsafe source, a missing-config or incapable export — each with an actionable message naming the file.
- [ ] Every brief-§9 stub is registered, shows in `registry.list()`/`caw05 adapters`, and is refused when forced `active`.
- [ ] Fakes for all five ports exist; the Run passes through every port over fakes, with `abstain→human` routed to `data/review/` and not exported.
- [ ] The no-bypass guard test passes: no path reaches synth/export without classify→route→review-gate; generated rationale is never an evidence field.
- [ ] CI green; core→ports boundary still enforced.

## Rollback / safety
- All additions are interfaces, registry, fakes, and disabled stubs — no real fetching, so still legal/ToS-safe by construction (stubs raise before any I/O).
- If preflight ever lets a stub or ToS-restricted source run, STOP — that breaks PRODUCT-BRIEF §12; fix preflight before acceptance.
- The no-bypass guard is the structural guarantee for "generated summaries are never evidence" — never weaken it to make a later runbook pass.
- Revert by discarding the branch; no data-tree mutations beyond test fixtures under `data/review/` (clean up in teardown).

## Hand-off
RB-003 can assume: typed ports + value objects with provenance/boundary, a working registry + config loader + preflight, fakes, and the no-bypass guarantee. RB-003 builds the files-as-truth store + rebuildable SQLite index/ledger-cache and fills the interest artifact schema + watch-list seed. Phase 1 then implements the v1 source/classifier/format/export/scheduler adapters into these exact ports + registry.

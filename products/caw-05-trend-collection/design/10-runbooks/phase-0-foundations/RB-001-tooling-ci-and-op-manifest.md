# RB-001: Tooling, CI, the core→ports boundary rule, and the typed op-manifest

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/tech-stack.md](../../03-architecture/tech-stack.md), [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../01-decisions/ADR-0001-product-surface-and-outputs.md](../../01-decisions/ADR-0001-product-surface-and-outputs.md)
- Produces: `ruff` + `mypy` (strict) + `pytest` configuration; a CI workflow running lint/typecheck/test; an automated **boundary rule** asserting `core/` imports only `ports`/`model`/`registry` (never a concrete adapter); the **op-manifest** — typed input/output specs for the eight pipeline operations (`run, ingest, rank, classify, route, ledger, synthesize, export`) shared by CLI + MCP surfaces.

## Objective
Lock the quality gate so every later runbook "leaves the tree green" as DOC-CONVENTIONS §6 requires, and make the architecture's load-bearing invariant — the core depends on interfaces only ([repo-structure.md §2](../../03-architecture/repo-structure.md)) — machine-enforced rather than convention. Also fix the **op-manifest**: a single typed declaration of the eight operations the Run exposes, so the CLI and MCP surfaces (ADR-0001) are thin views over ONE contract and cannot drift. "Done" means CI fails on a lint/type/test error, fails on a core→adapter import, and the op-manifest typed specs import and validate. No operation BODIES are implemented here (those are Phase 1+); only their typed signatures/specs.

## Preconditions
- [ ] RB-000 complete: importable `caw05`, no-op `caw05 run --dry-run`, green tree.
- [ ] Linter/typechecker/test runner chosen per [tech-stack.md §2.1](../../03-architecture/tech-stack.md) (`ruff`, `mypy` strict, `pytest`); pins left as TODO.
- [ ] `pydantic` v2 available (op-manifest specs are pydantic models).

## Steps

1. **Configure lint + format + strict typing.**
   - Do: Add `ruff` config (lint + format) and `mypy` config in strict mode covering `src/caw05` and `tests`. Enable import-sorting and an unused-import rule. Record version pins as `TODO(open-question: pin)` consistent with [tech-stack.md](../../03-architecture/tech-stack.md).
   - Verify: `ruff check .` and `mypy src/caw05` both pass on the RB-000 skeleton.

2. **Configure the test runner with a fakes-first convention.**
   - Do: Add `pytest` config; create `tests/` with `tests/fakes/` (placeholder for `FakeSourceAdapter`/`FakeExportAdapter`/`FakeScheduler` built in RB-002) and a smoke test asserting `caw05 run --dry-run` exits 0 over zero findings.
   - Verify: `pytest` collects and passes the smoke test.

3. **Implement the boundary rule as an executable test.**
   - Do: Add `tests/test_boundaries.py` that statically scans `src/caw05/core/**` import statements and FAILS if any module imports from `caw05.adapters`, `caw05.renderers`, `caw05.scheduler`, or a concrete adapter module — enforcing the [repo-structure.md §2](../../03-architecture/repo-structure.md) layering table (core may import only `ports`, `core.model`, `core.registry`). Also assert `ports/**` imports no `core`/`adapters`. Use `ast` to parse imports (do not execute modules).
   - Verify: the test passes now; temporarily adding `from caw05.adapters.sources import arxiv_s2` into a `core/` module makes it FAIL (then revert).

4. **Wire CI.**
   - Do: Add a CI workflow (e.g. GitHub Actions — TODO(open-question: confirm CI host) ) with one job that installs from the lockfile and runs, in order: `ruff check`, `ruff format --check`, `mypy`, `pytest`. CI is CAW-05's own — no shared substrate. Fail the build on any non-zero exit.
   - Verify: a pushed branch shows CI green; an intentional lint error turns it red (then revert).

5. **Define the op-manifest value types.**
   - Do: In `core/model/` add pydantic models for the op-manifest: an `Op` enum/literal of the eight ops `run, ingest, rank, classify, route, ledger, synthesize, export`, and for each a typed `OpSpec` declaring `inputs`, `outputs`, `side_effects` (files-as-truth paths it reads/writes), and `idempotent: bool`. Map ops to pipeline stages from [ports-and-adapters.md §1](../../05-radar-core/ports-and-adapters.md) and [storage-and-scheduling.md §3](../../04-data-layer/storage-and-scheduling.md): `ingest`=collect, `rank`=relevance, `classify`+`route` = the triage spine, `ledger`, `synthesize`, `export`; `run` = the whole checkpointed Run. Encode in the specs that `classify` may emit an **abstain** verdict routing the finding to human review (ADR-0004) and that `synthesize`/`export` carry a `generated_rationale` field flagged **non-evidence** and never exported as evidence (PRODUCT-BRIEF §12).
   - Verify: `python -c "from caw05.core.model import OP_MANIFEST; assert {o for o in OP_MANIFEST} >= {'run','ingest','rank','classify','route','ledger','synthesize','export'}"`.

6. **Expose the op-manifest to both surfaces (no logic).**
   - Do: Have `surfaces/cli.py` derive its subcommands and `surfaces/mcp.py` derive its tool list FROM the op-manifest, so CLI and MCP are provably the same contract over the one core (ADR-0001). Bodies still delegate to not-yet-implemented core functions (raise `NotImplementedError` for non-`run` ops in P0); only `run --dry-run` works end-to-end.
   - Verify: `caw05 --help` lists the eight ops; a test asserts the MCP tool names equal the op-manifest op set.

7. **Add a manifest consistency test.**
   - Do: Add `tests/test_op_manifest.py` asserting every op has inputs/outputs/side_effects declared, that `run` is marked idempotent/resumable (per [storage-and-scheduling.md §3](../../04-data-layer/storage-and-scheduling.md)), and that `export` declares an idempotency key field (per [storage-and-scheduling.md §6](../../04-data-layer/storage-and-scheduling.md) layer 4) so retries never double-route.
   - Verify: `pytest tests/test_op_manifest.py` passes.

## Acceptance criteria
- [ ] `ruff check`, `ruff format --check`, `mypy` (strict), and `pytest` all pass locally and in CI.
- [ ] The boundary test passes and demonstrably fails if `core/` imports any concrete adapter (then reverted green).
- [ ] The op-manifest defines all eight ops with typed inputs/outputs/side_effects; CLI and MCP both derive from it.
- [ ] `run` is marked idempotent/resumable; `export` carries an idempotency key; `classify` can emit `abstain→human`.
- [ ] The non-evidence flag on generated rationale is present in the synthesize/export specs.
- [ ] CI is green on the branch.

## Rollback / safety
- All changes are config + tests + typed specs; revert by discarding the branch. No runtime/data changes.
- The boundary rule is a guardrail, not a behavior change — if it blocks a later runbook, the runbook is violating the layering contract; fix the runbook, do not weaken the rule.
- No sources are contacted; nothing here performs network I/O.

## Hand-off
RB-002 can assume: a green CI gate, a strict typecheck, the enforced core→ports boundary, a `tests/fakes/` slot, and the op-manifest typed specs that the ports + registry must satisfy. RB-002 implements the five ports, the registry, preflight, the documented-stub pattern, and the fakes that the smoke/boundary tests reference.

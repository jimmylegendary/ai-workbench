# RB-001: Wire tooling, CI, the core→ports boundary rule, and the op-manifest

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/tech-stack.md](../../03-architecture/tech-stack.md), [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../01-decisions/ADR-0001-product-surface-and-scout.md](../../01-decisions/ADR-0001-product-surface-and-scout.md), [../../05-ttt-research-core/ports-and-adapters.md](../../05-ttt-research-core/ports-and-adapters.md)
- Produces: pinned tool config (lint + format + type-check + test), a CI workflow running them, an enforced **boundary rule** (`core/` depends only on `ports/`, never on `adapters/`), and a typed **op-manifest** declaring the seven pipeline operations (scout, ingest, hypothesize, experiment, writeback, implication, export) with their input/output record kinds and the gate each must honor.

## Objective
Make the green-tree promise of P0 mechanically checkable and lock in the load-bearing structural invariants before any stage is built. "Done" = `lint`, `typecheck`, and `test` all run from one command and in CI; an automated check fails the build if anything under `core/` imports from `adapters/` (the core depends only on ports — ADR-0001 / ports-and-adapters.md §1); and an op-manifest exists naming the seven operations with their typed signatures (input kind → output kind) and the no-overclaim / reproducibility / export-eligibility gate each one is bound by. This runbook resolves the `TODO(open-question: pin ...)` tooling cells from tech-stack.md; it does NOT implement any operation (that is RB-1XX..RB-4XX) — the manifest is a typed spec only.

## Preconditions
- [ ] RB-000 complete: `import caw06` works; all module placeholders exist.
- [ ] Decisions taken (resolving tech-stack `TODO`s, scoped to tooling): a lint+format tool (e.g. ruff), a type checker (e.g. mypy), a test runner (e.g. pytest), and packaging/lock tool (uv or poetry). Record the chosen pins; do not invent versions you cannot install.

## Steps

1. **Do:** Add and pin the dev toolchain in `pyproject.toml` (lint/format, type-check, test) and produce a lockfile. Configure each tool: lint rules, formatter, type-checker in strict-enough mode to catch missing types on public signatures, and the test runner pointed at `tests/`.
   **Verify:** `lint`, `format --check`, `typecheck`, and `test` each run and report success on the RB-000 skeleton (an empty/smoke suite passes). Record exact pins in the lockfile.

2. **Do:** Add task shortcuts (a `Makefile` or `pyproject` script entries) for `lint`, `typecheck`, `test`, and an aggregate `check` that runs all three. This is the single command an interrupted build uses to confirm the tree is green.
   **Verify:** `make check` (or equivalent) runs all three gates and exits 0 on the current tree.

3. **Do:** Create a CI workflow (e.g. `.github/workflows/ci.yml`) that installs from the lockfile and runs `lint`, `typecheck`, `test`, and the boundary check (step 4) on push/PR.
   **Verify:** the workflow file parses and, when run locally (e.g. `act` or by manually executing its steps), reproduces the same green result as step 2.

4. **Do:** Implement the **boundary rule** as an automated check: a test (or lint plugin / import-linter contract) asserting that no module under `src/caw06/core/` imports from `src/caw06/adapters/` (directly or transitively). The core may import `ports/`, `schemas/`, `lib/`; adapters may import `ports/`/`schemas/`/`lib/`; surfaces may import `core/`. This encodes ADR-0001's "ONE core, gates inside the core" and ports-and-adapters.md §5 "adapters cannot bypass the gates".
   **Verify:** the check passes on the current tree; add a temporary `core/` → `adapters/` import, confirm the check FAILS, then remove it.

5. **Do:** Author the **op-manifest** as a typed spec (a Python module `core/op_manifest.py` plus a human-readable `config/op-manifest.yaml`, or a single typed dataclass/enum module) declaring the seven operations and, for each: its id, the pipeline stage(s) it covers, its input record kind(s), its output record kind(s), and the gate(s) it MUST honor. Use the entity names from data-model.md exactly. The seven entries:
   | op | stage | input kind(s) | output kind(s) | gate it must honor |
   |---|---|---|---|---|
   | `scout` | S1 discover | `ScoutQuery` | `SourceRef[]` | only ToS-safe sources; idempotent cursor |
   | `ingest` | S2–S5 import→dedup→extract→persist | `SourceRef` | `Source`, `Claim` | Claim `status=unverified`, `asserted_by` set; CAW-05 imports stay claims-to-verify |
   | `hypothesize` | hypothesis | `Claim[]` | `Hypothesis` | default+floor `status=hypothesis`, `confidence` present; never serialized without status/uncertainty |
   | `experiment` | run | `Hypothesis` | `ExperimentEntry`+`Result` | pre-registered decision rule; one launch = one append-only entry; reproducibility gate (config+seed+env) |
   | `writeback` | W | finding (`Result`/`Hypothesis`) | `WritebackTrafficSchema` (`wbtraffic.v0`) | numerics default `null`; `basis` modeled-vs-measured flagged; open_questions attached |
   | `implication` | M | finding ref | `ImplicationMap` | `summary` marked generated (`evidence:false`); evidence_refs resolve to Result/Claim, never the summary |
   | `export` | X | `ImplicationMap`/`Claim`/`WritebackTrafficSchema` | `ExportBundle` | per-target `validate()` gate; generated evidence can NEVER promote status; one-way push, no shared store |
   **Verify:** the manifest imports/parses; a test asserts exactly these seven op ids exist and each declares non-empty input kind, output kind, and at least one gate; record kind names match the `schemas/` module names from RB-003 (cross-checked once RB-003 lands).

6. **Do:** Add a manifest-consistency test asserting that every op's declared gate references a real gate concept (status/uncertainty, reproducibility, export-eligibility, or an ingest-provenance gate) and that the `evidence cap` ("generated evidence can never promote status") is recorded against `writeback`, `implication`, and `export`. This makes the no-overclaim invariants part of CI from P0.
   **Verify:** the test passes; flipping any op's gate to empty makes it fail.

## Acceptance criteria
- [ ] `lint`, `typecheck`, `test` are pinned, run from one `check` command, and pass on the tree (green-tree promise enforced).
- [ ] CI runs `lint` + `typecheck` + `test` + the boundary check on push/PR.
- [ ] The boundary check FAILS if any `core/` module imports `adapters/` and PASSES otherwise (ADR-0001 / ports-and-adapters.md §5).
- [ ] The op-manifest declares exactly the seven ops (scout, ingest, hypothesize, experiment, writeback, implication, export), each with typed input/output record kinds and at least one gate; entity names match data-model.md.
- [ ] The evidence cap (generated evidence never promotes status) and the reproducibility gate are recorded in the manifest and asserted by a test — no-overclaim and failures-useful are enforced from P0.
- [ ] No operation is implemented (manifest is a spec only); the tree remains green.

## Rollback / safety
- All changes are additive config/spec files plus tests. Rollback = revert `pyproject.toml` tool sections, delete the CI workflow, the boundary-check test, and the op-manifest module/yaml.
- If a chosen tool pin cannot install, do not invent a fallback version silently — record a `TODO(open-question: pin <tool>)` and leave that gate as a stub that the boundary/manifest checks still run under, keeping the tree importable.

## Hand-off
The next runbooks can assume: a one-command green gate (`check`) and CI; an enforced `core→ports` boundary so adapters added later cannot leak policy into the core; and a typed op-manifest naming the seven operations and the gate each must honor, so RB-002 (ports + registry) and RB-003 (store + schemas) can bind to stable op/record names. Later phase runbooks implement each op behind its port, and CI keeps the boundary + no-overclaim invariants enforced at every checkpoint.

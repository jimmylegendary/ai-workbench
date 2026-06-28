# RB-000: Scaffold the CAW-06 pipeline project and repo tree

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../03-architecture/tech-stack.md](../../03-architecture/tech-stack.md), [../../01-decisions/ADR-0001-product-surface-and-scout.md](../../01-decisions/ADR-0001-product-surface-and-scout.md), [../../01-decisions/ADR-0007-storage-and-scheduling.md](../../01-decisions/ADR-0007-storage-and-scheduling.md)
- Produces: a compiling Python project skeleton (`src/caw06/{core,ports,adapters/{sources,runners,exports},schemas,surfaces,lib}`), the `store/{sources,claims,hypotheses,ledger,implications,writeback,threads,exports,cursors,index}` tree, `artifacts/`, `exports_outbox/{caw-01,caw-02}`, `imports_inbox/caw-05`, `config/*.yaml` placeholders, and an empty-but-importable package.

## Objective
Stand up the CAW-06 repository skeleton exactly as fixed by [repo-structure.md](../../03-architecture/repo-structure.md): one pipeline package (`src/caw06`) with the three structural areas (`core/` holds logic, `ports/` ⟂ `adapters/`, `schemas/`), the CAW-06-OWNED `store/` file tree, and the file-boundary directories (`exports_outbox/`, `imports_inbox/`). "Done" = the package imports, every module named in the design exists as an empty-but-typed stub, the store directory tree round-trips a write/read, and the tree is green (importable; no syntax errors). No business logic, no adapters, no schemas implemented yet — those come in RB-001..RB-003 and later phases. This runbook only lays the tree so an interrupted build resumes cleanly.

## Preconditions
- [ ] ADRs 0001–0008 are accepted and `_meta/PRODUCT-BRIEF.md` has been read (per milestone P0 entry gate).
- [ ] A Python interpreter is available (minor version pin deferred — see RB-001 / tech-stack `TODO(open-question: pin Python minor)`).
- [ ] The repo root for the implementation is decided (`TODO(open-question: impl co-located with design/ or sibling repo?)` from repo-structure.md). Default: co-located alongside `design/`.
- [ ] No existing `src/caw06/` package (this runbook creates it).

## Steps

1. **Do:** Create the package root and the Python source tree under `src/caw06/` with empty subpackages `core/`, `ports/`, `adapters/`, `adapters/sources/`, `adapters/runners/`, `adapters/exports/`, `schemas/`, `surfaces/`, `lib/`. Add an `__init__.py` to each so they import as packages.
   **Verify:** `python -c "import caw06"` succeeds (with `src/` on the path or an editable install); every subpackage directory contains `__init__.py`.

2. **Do:** Create empty module stubs (module docstring + the symbols the design names, as `...`/`pass` placeholders only) for the `core/` modules listed in repo-structure.md §Directory tree: `pipeline.py`, `ingestion.py`, `hypotheses.py`, `experiments.py`, `ledger.py`, `implications.py`, `writeback.py`, `export.py`, `store.py`, `index.py`, `resolver.py`, `review_queue.py`. Each module's docstring cites the ADR it implements (e.g. `store.py` → ADR-0007). Do NOT implement behavior.
   **Verify:** `python -c "import caw06.core.pipeline, caw06.core.store, caw06.core.resolver"` (and the rest) succeeds; no module contains logic beyond placeholders.

3. **Do:** Create empty port-module stubs under `ports/`: `source_adapter.py`, `runner_adapter.py`, `export_adapter.py` (interfaces filled in RB-002). Create adapter package placeholders under `adapters/{sources,runners,exports}/` with a `_stubs.py` in each (implementations land in later phases). Create `surfaces/{cli.py,mcp_server.py,scheduler.py}` and `lib/` placeholders.
   **Verify:** `python -c "import caw06.ports.source_adapter, caw06.ports.runner_adapter, caw06.ports.export_adapter"` succeeds; `adapters/{sources,runners,exports}/_stubs.py` all import.

4. **Do:** Create empty schema-module stubs under `schemas/`: `source.py`, `claim.py`, `hypothesis.py`, `ledger_entry.py`, `implication_map.py`, `wbtraffic_v0.py`, `export_bundle.py` (definitions land in RB-003).
   **Verify:** `python -c "import caw06.schemas.source, caw06.schemas.wbtraffic_v0, caw06.schemas.export_bundle"` succeeds.

5. **Do:** Create the CAW-06-OWNED store tree as empty directories with a `.gitkeep` in each: `store/{sources,claims,hypotheses,ledger,implications,writeback,threads,exports,cursors,index}`, plus `artifacts/`, `exports_outbox/{caw-01,caw-02}`, and `imports_inbox/caw-05`. These match [storage-and-scheduling.md](../../04-data-layer/storage-and-scheduling.md) §2 and repo-structure.md §Directory tree.
   **Verify:** `ls store/` lists all ten typed dirs; `exports_outbox/caw-01`, `exports_outbox/caw-02`, and `imports_inbox/caw-05` exist; each has a `.gitkeep`.

6. **Do:** Create `config/sources.yaml`, `config/exports.yaml`, `config/runner.yaml` as placeholder files with a header comment pointing at the owning ADR (sources→ADR-0005/0007, exports→ADR-0008, runner→ADR-0003) and a `TODO(open-question: ...)` for each deferred value. Do NOT add real registry entries (that is RB-001/RB-002).
   **Verify:** all three YAML files parse as valid YAML (e.g. `python -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('config/*.yaml')]"`).

7. **Do:** Create `pyproject.toml` declaring the package (name, `src/` layout, build backend) with dependency lists left as `TODO(open-question: pin ...)` comments per tech-stack.md (do not invent version pins here; RB-001 resolves tool pins). Add a minimal `README.md` and a `.gitignore` that excludes `store/index/` contents and `artifacts/` large blobs but keeps `.gitkeep`.
   **Verify:** `pyproject.toml` parses; an editable install (`pip install -e .` or `uv pip install -e .`) makes `import caw06` work without a manual path hack.

8. **Do:** Create the `tests/` tree (`tests/unit/`, `tests/adapters/`, `tests/fixtures/`) with a single smoke test asserting that `import caw06` and the store directories exist.
   **Verify:** the smoke test is collected and passes once a runner is wired (the runner itself is pinned in RB-001; until then, running the test file directly with `python` passes).

## Acceptance criteria
- [ ] `import caw06` and import of every `core/`, `ports/`, `schemas/`, `surfaces/` module succeeds (tree green, no syntax errors) — matches P0 exit "tree green".
- [ ] The store tree `store/{sources,claims,hypotheses,ledger,implications,writeback,threads,exports,cursors,index}` exists, plus `artifacts/`, `exports_outbox/{caw-01,caw-02}`, `imports_inbox/caw-05` — matches storage-and-scheduling.md §2 and the P0 exit gate "store dirs create/round-trip".
- [ ] A trivial write to `store/sources/` and read-back round-trips (proves the OWNED store is writable; full reader/writer is RB-003).
- [ ] `config/{sources,exports,runner}.yaml` exist, parse, and carry only placeholders + `TODO(open-question)` markers — no invented registry entries, no invented version pins.
- [ ] No business logic, adapter implementation, or schema definition exists yet (those are RB-001..RB-003 and later phases).
- [ ] `exports_outbox/` is the ONLY outbound directory and `imports_inbox/caw-05/` the only inbound one — no path writes into a sibling product's store (independence / no shared store).

## Rollback / safety
- The whole runbook is additive and creates a fresh tree; rollback = delete the newly created `src/caw06/`, `store/`, `artifacts/`, `exports_outbox/`, `imports_inbox/`, `config/`, `tests/`, `pyproject.toml`, `README.md`, `.gitignore`.
- If interrupted mid-way, re-running is idempotent: creating an existing dir/file is a no-op; never overwrite a non-placeholder file. Do not delete anything under `store/` once real records exist (append-only / failures-first-class, ADR-0007).

## Hand-off
The next runbooks can assume: an importable `caw06` package with every module named in repo-structure.md present as a placeholder; the CAW-06-OWNED `store/` tree and the `exports_outbox/`/`imports_inbox/` file boundaries exist; `config/*.yaml` placeholders are ready to be filled. RB-001 adds tooling/CI, the core→ports boundary rule, and the op-manifest. RB-002 fills the three ports + registry + stub pattern. RB-003 fills the store reader/writer and all entity + `wbtraffic.v0` schemas.

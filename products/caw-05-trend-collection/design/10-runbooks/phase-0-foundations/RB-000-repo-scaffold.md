# RB-000: Scaffold the CAW-05 pipeline repo + files-as-truth tree (compiling skeleton)

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../03-architecture/tech-stack.md](../../03-architecture/tech-stack.md), [../../01-decisions/ADR-0001-product-surface-and-outputs.md](../../01-decisions/ADR-0001-product-surface-and-outputs.md), [../../01-decisions/ADR-0006-storage-and-scheduling.md](../../01-decisions/ADR-0006-storage-and-scheduling.md)
- Produces: the `caw05/` Python project; full package tree (`core`, `ports`, `adapters/{sources,exports}`, `renderers`, `scheduler`, `surfaces`); `config/` (interests.yaml, sources.yaml, feeds.yaml, routing.yaml, watchlist.yaml); `data/` files-as-truth layout (findings/, ledger/, state/, runs/, review/, out/, exports/, artifacts/); `caw05.config.toml`; `pyproject.toml`; `.gitignore`; a no-op `caw05 run --dry-run` entrypoint that compiles.

## Objective
Stand up CAW-05 as its OWN independent repo (no shared runtime substrate — PRODUCT-BRIEF §1) with the exact directory layout fixed by [repo-structure.md](../../03-architecture/repo-structure.md). "Done" means: the package imports cleanly, `caw05 run --dry-run` exits 0 while doing nothing (the no-op Run shape from milestone M0), the files-as-truth tree exists with `.gitkeep` placeholders, and the tree is green (compiles, lint-passes). No port logic, no adapters, no I/O against real sources yet — those are RB-002/RB-003 and Phase 1. This runbook only fixes the skeleton so every later runbook drops files into known places.

## Preconditions
- [ ] ADR-0001, ADR-0006 are accepted (per [milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) P0 entry gate).
- [ ] An empty git repo dedicated to CAW-05 exists (independent product; not nested in a sibling product tree).
- [ ] Python toolchain available; dependency/lock manager chosen (`uv` or Poetry — TODO(open-question: pin) per [tech-stack.md §2.1](../../03-architecture/tech-stack.md)).
- [ ] You have read the layering rule in [repo-structure.md §2](../../03-architecture/repo-structure.md): `surfaces → core → ports ← adapters`. Do not violate it while scaffolding.

## Steps

1. **Initialize the project + packaging metadata.**
   - Do: Create `pyproject.toml` (PEP 621) with package name `caw05`, src-layout `src/caw05/`, a console-script entry point `caw05 = "caw05.surfaces.cli:main"`, and the entry-point GROUPS declared (empty for now): `caw05.source_adapters`, `caw05.export_adapters`, `caw05.scheduler_adapters`, `caw05.format_renderers`, `caw05.classifiers` (names per [tech-stack.md §2.1](../../03-architecture/tech-stack.md); TODO(open-question: confirm group names)). Add `pydantic` v2, a CLI lib (`typer` or `click`), `jinja2`, `httpx`, `feedparser`, `rank-bm25`, an `anthropic` SDK, and the MCP SDK as dependencies with version pins left as `TODO(open-question: pin ...)`. Generate the lockfile.
   - Verify: `python -c "import tomllib,sys; tomllib.load(open('caw05/pyproject.toml','rb'))"` parses; the lockfile exists.

2. **Create the source package tree (empty but importable).**
   - Do: Create every package dir from [repo-structure.md §1](../../03-architecture/repo-structure.md) with an `__init__.py`: `src/caw05/{core,core/model,ports,adapters,adapters/sources,adapters/exports,renderers,renderers/templates,scheduler,surfaces}`. Add module stub files (empty or with a module docstring + `pass`) named exactly as in the layout: `core/{run,pipeline,dedup,cursors,relevance,classify,route,ledger,synthesize,registry}.py`, `ports/{source,export,scheduler,renderer}.py` (Classifier port added in RB-002), `surfaces/{cli,mcp}.py`. Do NOT implement bodies here.
   - Verify: `python -c "import caw05, caw05.core.pipeline, caw05.ports.source, caw05.surfaces.cli"` imports with no error.

3. **Create the config tree with seed placeholders.**
   - Do: Create `config/{interests.yaml,sources.yaml,feeds.yaml,routing.yaml,watchlist.yaml}` as minimal valid-YAML placeholders (real interest schema + watch-list seed is RB-003; routing rules are Phase 3). Each carries a leading comment naming the ADR it will be filled from. Create `caw05.config.toml` with one `[adapters.<port>] active = []` block per port (source/classifier/format/export/scheduler) — the ONLY wiring file ([ports-and-adapters.md §3](../../05-radar-core/ports-and-adapters.md)).
   - Verify: every `config/*.yaml` parses; `caw05.config.toml` parses with `tomllib`.

4. **Create the files-as-truth data tree.**
   - Do: Create `data/{findings,ledger,state,runs,review,out,exports,exports/caw02,exports/caw03,exports/caw01,exports/caw06,artifacts}` with a `.gitkeep` in each. These dirs are CAW-05's OWN store (PRODUCT-BRIEF §7). Do not create `index.sqlite` or `run.lock` (runtime/cache; built in RB-003).
   - Verify: `find caw05/data -type d` lists every directory above.

5. **Write `.gitignore` for cache/lock/large-blob payloads.**
   - Do: Add `.gitignore` excluding `data/index.sqlite`, `data/run.lock`, and `data/artifacts/*` payloads (keep `.gitkeep`), per the truth-vs-cache contract in [repo-structure.md §3](../../03-architecture/repo-structure.md) and [storage-and-scheduling.md §1](../../04-data-layer/storage-and-scheduling.md). Findings/ledger/state/runs/exports text stays git-trackable for audit.
   - Verify: `git check-ignore data/index.sqlite data/run.lock` reports both ignored; `git check-ignore data/findings/.gitkeep` reports NOT ignored.

6. **Implement the no-op Run + thin CLI surface (M0 shape only).**
   - Do: In `surfaces/cli.py` define `main()` exposing `caw05 run` with a `--dry-run` flag and `--window` option, delegating to `core.run.Run`. In `core/run.py` implement a `Run` that, on `--dry-run`, walks the pipeline STAGE NAMES (collect → dedup → classify → synth → export) over ZERO findings and returns cleanly — no adapter imports, no I/O. The core imports ports/registry/model only, never a concrete adapter ([repo-structure.md §2](../../03-architecture/repo-structure.md)). `mcp.py` may be an importable stub that raises `NotImplementedError` until RB-001/Phase later wires it.
   - Verify: `caw05 run --dry-run` exits 0 and logs each stage name once with a zero-findings count; running it twice is a clean no-op.

7. **Add a README pinning the independence + files-as-truth contract.**
   - Do: Write `README.md` stating CAW-05 is an independent early-warning radar (own core/data/surfaces, no shared substrate), pointing at `design/` and the M0 dry-run command. Note the recall-first bias and that generated summaries are never evidence (PRODUCT-BRIEF §12) so later runbooks inherit the framing.
   - Verify: README references the dry-run command and links the design tree.

## Acceptance criteria
- [ ] `python -c "import caw05"` and importing `core.pipeline`, `ports.source`, `surfaces.cli` all succeed.
- [ ] `caw05 run --dry-run` exits 0, traverses the full pipeline shape over zero findings, performs no network I/O.
- [ ] The directory tree matches [repo-structure.md §1](../../03-architecture/repo-structure.md) exactly (packages, `config/`, `data/`).
- [ ] `.gitignore` excludes `index.sqlite`, `run.lock`, `artifacts/` payloads; findings/ledger/state are trackable.
- [ ] The layering rule holds: `core/` imports no concrete adapter (grep finds no `from caw05.adapters` in `core/`).
- [ ] Lint/format pass on the whole tree (full gate wired in RB-001; here at least the chosen linter runs clean).

## Rollback / safety
- The whole runbook is additive file creation in a fresh repo; to undo, `git clean -fdx` / discard the branch.
- No external sources are contacted (legal/ToS-safe by construction — there is no fetch code yet).
- If `caw05 run --dry-run` performs ANY I/O or imports an adapter, that is a layering violation — fix before acceptance; do not proceed to RB-001.

## Hand-off
RB-001 can assume: an importable `caw05` package with the exact package/data layout, a parsable `caw05.config.toml` with per-port `active` blocks, a no-op `caw05 run --dry-run`, and a green tree. RB-001 adds tooling/CI, the boundary lint rule (core→ports only), and the op-manifest. RB-002 fills the ports + registry + preflight + stubs. RB-003 fills the SQLite index and the interest/watch-list schema.

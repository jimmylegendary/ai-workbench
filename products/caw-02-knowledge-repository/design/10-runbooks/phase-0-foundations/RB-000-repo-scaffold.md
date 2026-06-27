# RB-000: Scaffold the CAW-02 monorepo (content tree + code skeleton)

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [repo-structure.md](../../03-architecture/repo-structure.md), [tech-stack.md](../../03-architecture/tech-stack.md), [storage-strategy.md §2](../../04-data-layer/storage-strategy.md), [component-boundaries.md](../../03-architecture/component-boundaries.md)
- Produces: the on-disk product layout — `knowledge/` content tree + `_events/`, `src/` core + adapters + index skeleton, `manifest/`, `schemas/`, `migrations/`, `var/`, `.index/`, a compiling TypeScript workspace, `.gitignore`, `README.md`

## Objective
A new, version-controlled product repository whose directory shape matches `repo-structure.md` exactly: the canonical `knowledge/**` content tree (with every entity-kind directory and `_events/`), the `src/` skeleton split into `core/`, `index/`, `adapters/`, `boundary-io/`, `codegen/`, and the supporting `manifest/`, `schemas/`, `migrations/`, `scripts/`, `tests/`, `var/`, `.index/` directories. The TypeScript workspace compiles green (empty/stub modules), and the canonical-vs-derived split is encoded in `.gitignore`. "Done" = `tsc` passes on an empty tree and the directory layout audit (Step 8) is clean. This RB creates structure only; behavior is added by later RBs.

## Preconditions
- [ ] Node + a package manager are available (`node -v`, exact LTS pin chosen here — see Step 1).
- [ ] `git` CLI available (`git --version`); commit signing key TBD (handled in RB-002).
- [ ] The product folder `caw-02-knowledge-repository/` exists and contains `design/` already (this corpus).
- [ ] You have read `repo-structure.md` (top-level layout + module ownership) and `component-boundaries.md` (dependency direction `adapters → core/* → store/*`).

## Steps

1. **Pin the toolchain.**
   - Do: At the product root, create `package.json` for a TypeScript workspace; pin Node LTS, the package manager, and `typescript`/`tsx` (resolve the `TODO(open-question)` pins from `tech-stack.md` §"Version-pin checklist" now and record the chosen values in `README.md`). Add `strict: true` `tsconfig.json` with `rootDir: src`, `outDir: .index/build` (build output is derived → gitignored).
   - Verify: `node -v` matches the pin; `npx tsc --version` prints the pinned version.

2. **Create the `knowledge/` content tree (single source of truth).**
   - Do: Create one directory per entity kind exactly as in `repo-structure.md` §`knowledge/`: `sources/ claims/ evidence/ notes/ concepts/ interests/ decisions/ open-questions/ assumptions/ signals/` plus `_events/`. Add a `.gitkeep` in each so empty dirs are committed.
   - Verify: `ls knowledge/` lists all 10 entity dirs + `_events/`; `git status` shows the `.gitkeep` files staged.

3. **Create the `src/` code skeleton (one core, thin adapters).**
   - Do: Create the module tree from `repo-structure.md` §`src/`: `core/{ops,validate,invariant,evidence-gate,boundary,trust,audit,store,retrieval}`, `index/{schema,reindex,query}`, `adapters/{api,mcp,cli,viewer}`, `boundary-io/{envelope,redact,import-caw01,import-caw05,export-caw03}`, `codegen/`. In each leaf module add an `index.ts` exporting a typed stub (e.g. `export const TODO = 'unimplemented' as const;`) so the package compiles.
   - Verify: every directory above exists and contains at least one `.ts` file; `npx tsc --noEmit` succeeds.

4. **Create `manifest/`, `schemas/`, `migrations/` placeholders.**
   - Do: Create `manifest/` (ops manifest lands here in RB-001), `schemas/frontmatter/` and `schemas/boundary/` (zod schemas land in RB-002 / later), and `migrations/` with empty placeholder filenames matching `repo-structure.md` §`migrations/` (`0001_core.sql`, `0002_fts.sql`, `0003_vec.sql.reserved`) — empty/comment-only for now; real DDL is RB-003.
   - Verify: `ls migrations/` shows the three numbered files; `ls schemas/` shows `frontmatter/` and `boundary/`.

5. **Create runtime + derived directories with correct git policy.**
   - Do: Create `var/{quarantine,vault,exports}/` (runtime, non-canonical), `.index/` (derived index home), `scripts/`, `tests/`. Add `.gitkeep` only where a committed empty dir is wanted; for `var/` subdirs and `.index/`, prefer gitignore over committing contents.
   - Verify: directories exist; Step 6 confirms ignore policy.

6. **Encode the canonical-vs-derived split in `.gitignore`.**
   - Do: Per `repo-structure.md` §"What is canonical vs derived" and `storage-strategy.md` §2, ignore `.index/index.sqlite`, `.index/build/`, FTS/vector sidecar files, `var/quarantine/`, `var/exports/`, and `node_modules/`. Do NOT ignore `knowledge/**` (including `_events/`) — those are the source of truth and ledger.
   - Verify: `git check-ignore .index/index.sqlite var/exports/x` returns those paths; `git check-ignore knowledge/_events/x.jsonl` returns nothing (not ignored).

7. **Write `README.md` (orientation + pins).**
   - Do: One short README naming the product, the canonical/derived distinction (link `storage-strategy.md`), the dependency direction `adapters → core/* → store/*` (link `component-boundaries.md`), and the resolved version pins from Step 1.
   - Verify: README links resolve to existing design docs.

8. **Layout + compile audit.**
   - Do: Add `scripts/check-layout` (a tiny script or test) that asserts the required directory set from `repo-structure.md` is present, and wire `tsc --noEmit` as the compile check.
   - Verify: `scripts/check-layout` exits 0; `npx tsc --noEmit` exits 0.

9. **Initial commit.**
   - Do: `git add -A` and make the first commit of the scaffold.
   - Verify: `git log --oneline` shows the scaffold commit; `git status` is clean.

## Acceptance criteria
- [ ] `knowledge/` contains all 10 entity-kind dirs + `_events/`, all version-controlled.
- [ ] `src/` matches the `repo-structure.md` module tree (core/index/adapters/boundary-io/codegen) and every leaf has a compiling stub.
- [ ] `manifest/`, `schemas/{frontmatter,boundary}/`, `migrations/{0001_core.sql,0002_fts.sql,0003_vec.sql.reserved}`, `var/{quarantine,vault,exports}/`, `.index/`, `scripts/`, `tests/` all exist.
- [ ] `.gitignore` ignores `.index/` + `var/quarantine,exports/` but NOT `knowledge/**` or `knowledge/_events/**`.
- [ ] `npx tsc --noEmit` and `scripts/check-layout` both exit 0.
- [ ] Version pins are resolved and recorded in `README.md`.
- [ ] A clean initial commit exists; tree is green.

## Rollback / safety
- Pure scaffold, no data. To undo before commit: `git clean -fdx` removes untracked files; after commit, `git reset --hard <pre-scaffold>` (or delete the repo). No `knowledge/` data exists yet, so nothing canonical is at risk.

## Hand-off
- The next runbook (RB-001) can assume: a compiling TS workspace, the `manifest/` dir awaiting `ops.yaml`, the `src/codegen/` dir awaiting the generator, and `tests/` ready for CI wiring.
- RB-002 can assume the `knowledge/**` content dirs + `schemas/frontmatter/` exist and `_events/` is committed (not ignored).
- RB-003 can assume `migrations/` placeholders and `.index/` (gitignored) exist.

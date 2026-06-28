# RB-000: Scaffold the harness repo

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../03-architecture/component-boundaries.md](../../03-architecture/component-boundaries.md)
- Produces: compiling skeleton matching repo-structure.md (core, ports, adapters, surfaces, config, workspace, artifacts)

## Objective

A compiling TypeScript project whose tree matches [repo-structure.md](../../03-architecture/repo-structure.md):
`src/core` (depends only on `ports`), `src/ports`, `src/adapters/*` (v1 + stub folders), `src/surfaces/*`,
`config/`, `workspace/` + `artifacts/` (gitignored), `migrations/`.

## Preconditions
- [ ] Node + pnpm; empty product folder.

## Steps
1. **Do:** Init the package + tsconfig (strict). Create the directory tree from repo-structure.md with empty `index.ts` per module.
   **Verify:** `cmd: pnpm i && pnpm tsc --noEmit` exits 0.
2. **Do:** Create `src/ports/` with empty interface files for the five ports; `src/core/` importing only `ports`.
   **Verify:** `cmd: tsc --noEmit`; no `core` → `adapters` import.
3. **Do:** Create `src/adapters/{source,writing-engine,patent-engine,sink,novelty}/` each with a `v1/` and a `stubs/` subfolder placeholder.
   **Verify:** `view:` tree matches repo-structure.md.
4. **Do:** Add `workspace/` + `artifacts/` to `.gitignore`.
   **Verify:** `cmd: git status` shows them ignored.

## Acceptance criteria
- [ ] Tree matches repo-structure.md; `pnpm tsc --noEmit` passes.
- [ ] `core` imports only `ports`; `workspace/`+`artifacts/` gitignored.

## Rollback / safety
New files only; delete to roll back. Commit after Acceptance.

## Hand-off
A compiling skeleton with stable module boundaries for RB-001+.

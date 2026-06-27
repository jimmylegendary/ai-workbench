# RB-000: Scaffold the monorepo

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [repo-structure.md](../../03-architecture/repo-structure.md), [component-boundaries.md](../../03-architecture/component-boundaries.md), [tech-stack.md](../../03-architecture/tech-stack.md)
- Produces: pnpm/turbo monorepo skeleton with empty `@caw/*` packages + `apps/*` + `engine/` dirs

## Objective

A compiling monorepo whose directory tree exactly matches [repo-structure.md](../../03-architecture/repo-structure.md),
with empty packages and interface stubs, so every later runbook fills implementations behind stable boundaries.

## Preconditions

- [ ] Node + pnpm installed; Python available for `engine/`.
- [ ] Empty target repo (or the `caw01-workbench/` root created).

## Steps

1. **Do:** Init pnpm workspace + Turborepo at the root (`package.json`, `pnpm-workspace.yaml`, `turbo.json`).
   **Verify:** `cmd: pnpm -v && pnpm install` exits 0.
2. **Do:** Create packages: `packages/core` (`@caw/core`), `packages/db` (`@caw/db`), `packages/engine-adapters`, `packages/design-tokens`. Each with `package.json`, `tsconfig`, `src/index.ts`.
   **Verify:** `cmd: pnpm -r exec tsc --noEmit` compiles (empty exports ok).
3. **Do:** In `@caw/core` create `src/services/`, `src/schemas/`, `src/ports/` with **interface stubs only** (signatures from [api-surface.md](../../07-backend-api/api-surface.md) and [component-boundaries.md](../../03-architecture/component-boundaries.md)). No implementations.
   **Verify:** `cmd: tsc --noEmit` in core passes; no `next`/React import present.
4. **Do:** Create apps: `apps/web` (empty Next.js App Router app), `apps/mcp`, `apps/cli` (empty entrypoints).
   **Verify:** `cmd: pnpm --filter web build` (or `next build`) compiles the empty app.
5. **Do:** Create `engine/` with subdirs `syntorch_capture/ chakra_export/ servingsim/ astrasim/ l0_lowering/` + a `pyproject.toml`. Add `artifacts/` (gitignored).
   **Verify:** `cmd: python -c "import sys; print(sys.version)"`; `view:` tree matches repo-structure.md.

## Acceptance criteria

- [ ] Directory tree matches [repo-structure.md](../../03-architecture/repo-structure.md).
- [ ] `pnpm install` + `pnpm -r exec tsc --noEmit` succeed.
- [ ] `@caw/core` contains only interfaces/stubs and imports no `next`/React.
- [ ] `artifacts/` is gitignored.

## Rollback / safety

All changes are new files; to roll back, delete the created dirs. Commit only after Acceptance passes.

## Hand-off

The next runbooks can assume a compiling monorepo with stable package boundaries and empty `@caw/core` interfaces.

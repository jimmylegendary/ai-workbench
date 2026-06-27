# RB-001: Tooling, lint boundaries, and CI

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [component-boundaries.md](../../03-architecture/component-boundaries.md) (enforcement), [tech-stack.md](../../03-architecture/tech-stack.md)
- Produces: ESLint/TS config, package-boundary rule, test runners, CI pipeline

## Objective

Make the one-way dependency rule and the "zero `next` in `@caw/core`" rule machine-enforced, and wire test
runners (Vitest/pytest/Playwright) + CI so every later runbook has an objective green/red signal.

## Preconditions

- [ ] RB-000 complete (compiling monorepo).

## Steps

1. **Do:** Add ESLint + strict TS config across packages; add a **package-boundary** rule (dependency-cruiser or eslint-plugin-boundaries) encoding: surfaces→core→ports→data, and `@caw/core` may not import `next`, React, `@caw/db`, `@caw/engine-adapters`.
   **Verify:** `cmd: pnpm lint` fails when a deliberate bad import is added, passes when removed.
2. **Do:** Add Vitest (TS), pytest (engine), Playwright (e2e) with one trivial passing test each.
   **Verify:** `cmd: pnpm test` and `cmd: pytest` exit 0.
3. **Do:** Add CI (e.g. GitHub Actions) running install → typecheck → lint (incl. boundary rule) → tests on push.
   **Verify:** `cmd:` CI config validates; a local `act`/dry-run or first push shows green.
4. **Do:** Add formatting (Prettier) + pre-commit/CI format check.
   **Verify:** `cmd: pnpm format:check` passes.

## Acceptance criteria

- [ ] Boundary rule blocks a forbidden import (proven by a temporary violation test).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all green.
- [ ] CI runs the full gate on push.

## Rollback / safety

Config-only; revert config files to roll back. Keep the deliberate-violation test as a commented reference.

## Hand-off

Every later runbook can rely on `pnpm typecheck && pnpm lint && pnpm test` as its objective Verify; the dependency
rule is enforced automatically.

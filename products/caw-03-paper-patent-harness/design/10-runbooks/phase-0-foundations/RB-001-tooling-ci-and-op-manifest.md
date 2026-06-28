# RB-001: Tooling, CI, and the op-manifest

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/component-boundaries.md](../../03-architecture/component-boundaries.md), [../../07-backend-api/api-surface.md](../../07-backend-api/api-surface.md)
- Produces: lint/boundary rules, tests, CI, and the op-manifest → typed op contracts

## Objective

Make the boundaries machine-enforced, wire test runners + CI, and define the **op-manifest** (the finite governed
operation set) with Zod-typed IO that every surface will map to.

## Preconditions
- [ ] RB-000 complete.

## Steps
1. **Do:** ESLint + strict TS + a boundary rule: `core` may import only `ports`; `adapters/*` may import only `ports`; surfaces import the core op API.
   **Verify:** `cmd: pnpm lint` fails on a deliberate `core→adapters` import, passes when removed.
2. **Do:** Define the op-manifest (`import_bundle, build_ledger, gate_claims, assemble_inputs, draft_paper, draft_patent, run_novelty, review, publish`) as Zod-typed op specs in `core` (no impl yet).
   **Verify:** `test:` each op spec validates a sample input/rejects a bad one.
3. **Do:** Add Vitest (unit) + a contract-test harness (ports) + an e2e placeholder; one trivial passing test each.
   **Verify:** `cmd: pnpm test` exits 0.
4. **Do:** CI: install → typecheck → lint(+boundary) → test on push.
   **Verify:** `cmd:` CI config validates; first run green.

## Acceptance criteria
- [ ] Boundary rule blocks forbidden imports (proven).
- [ ] op-manifest exists as typed specs; `pnpm typecheck && lint && test` green; CI runs the gate.

## Rollback / safety
Config + specs only; revert to roll back.

## Hand-off
Later runbooks implement each op behind the typed manifest with the boundary rule enforced.

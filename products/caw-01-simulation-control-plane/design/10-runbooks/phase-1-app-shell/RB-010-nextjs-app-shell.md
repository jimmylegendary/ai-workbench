# RB-010: Next.js app shell (App Router + seams)

- Status: ready
- Phase: phase-1-app-shell
- Depends on: [RB-002, RB-003]
- Implements design: [ui-architecture-nextjs.md](../../06-frontend/ui-architecture-nextjs.md), [../../01-decisions/ADR-0003-frontend-stack.md](../../01-decisions/ADR-0003-frontend-stack.md)
- Produces: App Router structure, Server Action + Route Handler seams to `@caw/core`

## Objective

A running Next.js app shell with the server-shell/client-island split, a Server Action path for mutations, and a
Route Handler (SSE) for run status — all wired to `@caw/core` (not the DB or engine directly).

## Preconditions

- [ ] RB-002 (data layer), RB-003 (design system) complete.

## Steps

1. **Do:** Create the App Router tree: `app/layout.tsx` (server shell), route segments `(simulation)`, `(module-design)`, `user`, `setting`.
   **Verify:** `cmd:` `next build` compiles; each route renders a placeholder.
2. **Do:** Add a Server Action module that calls `@caw/core` services (DI-wire `@caw/db` repos at the app entry). Implement one real action: `ExperimentService.create`.
   **Verify:** `test:` calling the action creates an Experiment row.
3. **Do:** Add a Route Handler `app/api/runs/[id]/stream/route.ts` that streams `RunService.status` (SSE).
   **Verify:** `cmd:` curl the SSE endpoint for a stub run yields events.
4. **Do:** Establish the rule in code: web imports `@caw/core` only; engine/DB reached via DI. Add a boundary test.
   **Verify:** `cmd: pnpm lint` boundary rule passes; web has no direct `@caw/db`/engine import.

## Acceptance criteria

- [ ] App builds and serves all four nav routes (placeholders ok).
- [ ] A Server Action creates an Experiment via core.
- [ ] The SSE run-status route streams.
- [ ] Web depends only on `@caw/core` (boundary test green).

## Rollback / safety

New app code; revert the `app/` additions to roll back. Keep DB/engine wiring behind DI so it can be stubbed.

## Hand-off

The layout/nav runbook (RB-011) can build inside this shell; mutations and streams have working seams.

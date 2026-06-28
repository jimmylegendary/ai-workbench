# caw01-workbench — CAW-01 Simulation Control Plane (app skeleton)

> **Skeleton, not an implementation.** This is the buildable scaffold the company dev fills in. Structure,
> layering (MVVM), Supabase wiring, tokens, and route/screen stubs are here; **business logic and the Python
> engine connection are stubbed** (`TODO`). It realizes the design set in
> [`../design/`](../design/) — start with [`design/06-frontend/app-architecture-mvvm.md`](../design/06-frontend/app-architecture-mvvm.md).

## Layout (see `../design/03-architecture/repo-structure.md`)

```
caw01-workbench/
├─ packages/
│  ├─ core/   @caw/core  — domain services, Zod schemas, ports (zero next, zero supabase-sdk)
│  └─ db/     @caw/db    — Supabase migrations + RLS, repository impls
└─ apps/
   └─ web/    Next.js App Router (MVVM) — the primary surface
```

(`packages/engine-adapters`, `packages/design-tokens`, `apps/mcp`, `apps/cli`, and `engine/` are defined in the
design but not scaffolded here — this skeleton targets the **frontend-buildable slice**: web + Supabase + core
ports.)

## Architecture in one line

**MVVM:** View (React components / `app/**`) → ViewModel (Zustand interaction-state + TanStack Query server-state
+ Server Actions) → Model (repositories → Supabase for metadata; `@caw/core` → engine port for runs). Reads are
RLS-guarded Supabase; engine/work-tree mutations go through `@caw/core`. See ADR-0003 / ADR-0008.

## Quick start

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local      # fill Supabase + engine values
# provision Supabase, then:
supabase db push                                   # applies packages/db/migrations + RLS
pnpm --filter @caw/web dev                          # http://localhost:3000
```

## Data boundary (ADR-0008)

Supabase holds **control-plane metadata only** (users, projects, experiments, runs index, branches, evidence).
The heavy memory-annotated IR (L0/L1/L2) and trace blobs stay in the engine/artifact store and are referenced by
`simulation_run.ir_uri` / `artifact_uri`. The UI dereferences them lazily through the core storage API — never
from a Supabase table.

## Status of each piece

| Piece | State |
|---|---|
| App Router shell, nav, 1:9 split, routes | scaffolded (View stubs) |
| Supabase auth (`@supabase/ssr`) + middleware gate | wired |
| MVVM layers (store, query, repositories, actions) | wired with stubs |
| Supabase schema + RLS migration | written (`packages/db/migrations/0001_init.sql`) |
| Canvases (React Flow / r3f) | placeholders — build in phase-2 (see runbooks) |
| `@caw/core` services + engine ports | interface stubs |

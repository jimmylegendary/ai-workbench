# Repo Structure — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries.md](./component-boundaries.md), [tech-stack.md](./tech-stack.md), [../10-runbooks/phase-0-foundations/RB-000-repo-scaffold.md](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The monorepo layout the runbooks build into. Boundaries/ownership rationale is in
[component-boundaries.md](./component-boundaries.md); this doc is the physical directory map.

## Directory tree

```
caw01-workbench/
├─ package.json                 # pnpm workspace root + turbo
├─ pnpm-workspace.yaml
├─ turbo.json
├─ packages/
│  ├─ core/                     # @caw/core — domain services, Zod schemas, PORT + repo interfaces (zero next)
│  │  ├─ src/services/          # ExperimentService, RunService, RegistryService, WorkTreeService, EvidenceService
│  │  ├─ src/schemas/           # Zod schemas = the one contract
│  │  └─ src/ports/             # engine-adapter + repository interfaces
│  ├─ db/                       # @caw/db — Supabase repo impls + SQL migrations + RLS, artifact-store client (ADR-0008)
│  │  └─ migrations/            # Supabase Postgres schema + row-level-security policies
│  ├─ engine-adapters/          # @caw/engine-adapters — TS side of the Python seam
│  └─ design-tokens/            # DTCG *.tokens.json + build to Tailwind theme (open-design)
├─ apps/
│  ├─ web/                      # Next.js App Router (primary surface) — MVVM (app-architecture-mvvm.md)
│  │  ├─ app/(auth)/login/      # Supabase magic-link sign-in (public)
│  │  ├─ app/(app)/             # session-gated group: simulation / module-design / runs / user / settings
│  │  ├─ app/api/runs/[id]/stream/   # SSE run status (Route Handler)
│  │  ├─ features/<f>/{view,viewmodel,model}/   # MVVM feature slices (e.g. simulation)
│  │  ├─ components/shell/ · components/ui/      # NavBar/AppShell/SplitPane + shadcn primitives (View)
│  │  ├─ lib/supabase/          # @supabase/ssr client/server/middleware
│  │  ├─ lib/query/             # TanStack Query client (ViewModel server-state)
│  │  ├─ store/                 # single Zustand store (ViewModel interaction-state)
│  │  └─ middleware.ts          # session refresh + (app) gate
│  ├─ mcp/                      # MCP server over @caw/core
│  └─ cli/                      # CLI over @caw/core
├─ engine/                      # Python engine service (out-of-process)
│  ├─ syntorch_capture/
│  ├─ chakra_export/
│  ├─ servingsim/
│  ├─ astrasim/
│  └─ l0_lowering/
├─ artifacts/                   # local artifact store (gitignored) — trace blobs by path
└─ design/                      # THIS design set (docs + runbooks)
```

## Conventions

- TS packages are `@caw/*`; surfaces live under `apps/`.
- The Python engine is a sibling service, not an npm package; the TS side talks to it only via
  `@caw/engine-adapters` ([system-architecture.md](./system-architecture.md) seam).
- `artifacts/` holds large blobs referenced by path/URI from DB rows; it is gitignored.
- Generated/scaffolded UI from a one-off spike lives in a clearly marked throwaway dir, never overwriting
  the source-of-truth components ([ADR-0006](../01-decisions/ADR-0006-design-system-open-design.md)).

## Open questions

Whether `engine/` ships in the same repo (monorepo) or a sibling repo with a pinned interface — leaning
monorepo for v1; TODO(open-question).

## Implications for runbooks

[RB-000-repo-scaffold](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold.md) creates exactly this tree
with empty interface files + lint/CI guards before any feature runbook runs.

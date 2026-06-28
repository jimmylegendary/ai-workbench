# App Architecture (MVVM) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [ui-architecture-nextjs.md](./ui-architecture-nextjs.md), [state-management.md](./state-management.md), [auth-and-supabase.md](./auth-and-supabase.md), [routes-and-screens.md](./routes-and-screens.md), [../01-decisions/ADR-0003-frontend-stack.md](../01-decisions/ADR-0003-frontend-stack.md), [../01-decisions/ADR-0008-auth-and-data-supabase.md](../01-decisions/ADR-0008-auth-and-data-supabase.md), [../03-architecture/repo-structure.md](../03-architecture/repo-structure.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

How the CAW-01 web app is layered so a developer can pick up the repo and "fill in logic, not invent structure."
It maps **MVVM** onto Next.js App Router + Supabase + `@caw/core`, names the folders, and states the one rule per
layer. It refines (does not replace) [ADR-0003](../01-decisions/ADR-0003-frontend-stack.md) (server shell /
client islands / Server Actions) and [state-management.md](./state-management.md) (the Zustand store).

## Why MVVM here

The Simulation screen is the hard case: three coordinated canvases + a control panel + a work-tree, all reading
one composed experiment, with heavy server data and live run status. MVVM keeps the **View dumb**, the
**ViewModel** the single place interaction-state + server-state meet, and the **Model** the only thing that knows
Supabase / the engine exist. React's idioms (components, hooks, stores) line up 1:1 with View / ViewModel / Model,
so this is "MVVM expressed in idiomatic React," not a foreign pattern bolted on.

## The three layers

| Layer | What it is | May import | May NOT import | Lives in |
|---|---|---|---|---|
| **View** | Presentational React components + route `page.tsx`/`layout.tsx`. Render props + tokens; raise events. | ViewModel hooks, `components/ui/*` | Supabase SDK, `@caw/core`, repositories, `fetch` | `apps/web/app/**`, `apps/web/components/**`, `features/*/view/**` |
| **ViewModel** | Hooks + the Zustand store. Owns interaction state (selection/dirty/layout) **and** orchestrates server state (TanStack Query/mutations + Server Actions). Exposes a typed, View-shaped API. | repositories (Model), store, schemas (Zod types) | React DOM/JSX, raw Supabase SDK | `apps/web/store/**`, `features/*/viewmodel/**` |
| **Model** | Repositories + domain services + types. The only code that knows Supabase rows / engine ports. | `@caw/core`, `@caw/db` (Supabase impl), Supabase clients (in repo impls only) | React, Next, anything View | `features/*/model/**` (thin web adapters) + `packages/core`, `packages/db` |

**One-sentence rules:**
- **View** renders state and emits intents — no data access, no business rules.
- **ViewModel** is the only layer both interaction-state and server-state touch; it never renders and never
  embeds SQL/SDK calls.
- **Model** is the only layer that knows a backend exists; it returns domain types (Zod-validated), never React.

## Data + control flow

```
        reads (RLS)                         mutations (engine / work-tree)
View ───────────────▶ ViewModel ──TanStack Query──▶ Repository ──▶ Supabase (RLS)   [metadata reads]
  ▲   intents (onRun)     │  Zustand (selection/dirty/layout)            │
  │                       └──────── Server Action ───▶ @caw/core ───▶ ports ─▶ Python engine  [run/save/branch]
  └──────────── derived view state ◀────────────────────────────────────┘        │
                                                                          writes Supabase rows + ir_uri
```

- **Reads** (experiment, runs list, branches, evidence index): ViewModel → repository → **RLS-guarded Supabase**
  (server client in RSC, browser client in islands), cached by **TanStack Query** (ADR-0008 §4).
- **Mutations** that touch the engine or the work-tree invariant (`run`, `stop`, `save item/full`, `branch`,
  `compose`): ViewModel → **Server Action** → `@caw/core` service → engine **port** + Supabase row write. The
  store updates **optimistically** and reconciles on the action result ([state-management.md](./state-management.md)).
- **Live run status:** ViewModel subscribes to the **SSE Route Handler** (`/api/runs/:id/stream`), not polling
  (ADR-0003 §2). IR/trace bytes are never streamed through Next — only status + pointers.

## Folder layout (extends [repo-structure.md](../03-architecture/repo-structure.md))

```
apps/web/
├─ app/
│  ├─ (auth)/login/page.tsx              # View — Supabase magic-link login
│  ├─ (app)/layout.tsx                   # View — NavBar shell (server), session-gated
│  ├─ (app)/simulation/page.tsx          # View — server shell → <SimulationScreen/> island
│  ├─ (app)/module-design/page.tsx
│  ├─ (app)/runs/page.tsx                # View — runs/experiments data-management browser
│  ├─ (app)/user/page.tsx · settings/page.tsx
│  └─ api/runs/[id]/stream/route.ts      # SSE run status (Route Handler)
├─ features/
│  └─ simulation/
│     ├─ view/        SimulationScreen.tsx, ControlPanel.tsx, canvases/*, work-tree/*
│     ├─ viewmodel/   useSimulationVM.ts, useRunStatus.ts, useWorkTreeVM.ts
│     └─ model/       runRepository.ts, experimentRepository.ts, actions.ts ('use server')
├─ components/
│  ├─ shell/          NavBar.tsx, AppShell.tsx, SplitPane.tsx
│  └─ ui/             button.tsx, badge.tsx, … (shadcn/Radix, token-themed)
├─ store/             workbenchStore.ts          # single Zustand store (slices)
├─ lib/
│  ├─ supabase/       client.ts, server.ts, middleware.ts   # @supabase/ssr
│  └─ query/          queryClient.ts             # TanStack Query
├─ middleware.ts                                 # session refresh + (app) gate
└─ app/globals.css                               # design tokens → CSS vars (Tailwind v4)
```

The **deep Model** stays in `packages/core` (`@caw/core` services + Zod schemas + ports, zero `next`) and
`packages/db` (`@caw/db` Supabase repository implementations + migrations) per ADR-0001/0002/0003. `features/*/
model/` are **thin web adapters**: read repos call `@caw/db`/Supabase directly (RLS); mutation `actions.ts`
delegate to `@caw/core`.

## Mapping the existing pieces

- The single **Zustand store** ([state-management.md](./state-management.md)) is the **interaction-state half of
  the ViewModel** — selection, per-canvas draft, dirty, layout. Unchanged.
- **TanStack Query** is the **server-state half of the ViewModel** — fetching/caching Supabase reads and tracking
  Server-Action mutations. New, additive.
- The **component inventory** ([component-inventory.md](./component-inventory.md)) is the **View** catalog.
- `@caw/core` services (ExperimentService, RunService, WorkTreeService, EvidenceService) are the **domain Model**;
  Server Actions are the thin call-through, never the home of a verb (ADR-0001).

## Testing seams

- **View**: render with mocked ViewModel hooks (no network).
- **ViewModel**: unit-test hooks/store with mocked repositories; assert optimistic-then-reconcile.
- **Model**: integration-test repositories against a local Supabase + a faked engine port.

## Open questions

- `TODO(open-question: vm-granularity)` Whether each canvas gets its own ViewModel hook or one
  `useSimulationVM` composes them — leaning one composed VM that exposes per-canvas slices.
- `TODO(open-question: server-action-vs-rls-writes)` A few low-risk writes (e.g. rename experiment) could be
  direct RLS writes instead of Server Actions; default is Server Action unless proven hot.

## Implications for runbooks

RB-010 builds the View shell + layers' empty seams; RB-012 wires the ViewModel (store + TanStack Query +
repositories + Server Actions) end-to-end on save/run before canvases (phase-2) attach their slices.

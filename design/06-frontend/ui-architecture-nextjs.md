# UI Architecture (Next.js) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [layout-and-navigation.md](./layout-and-navigation.md), [state-management.md](./state-management.md), [../01-decisions/ADR-0003-frontend-stack.md](../01-decisions/ADR-0003-frontend-stack.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The Next.js App Router structure for the web surface: server shell vs client islands, mutation/stream paths,
and how the canvases sit as client components on top of `@caw/core`.

## Server shell + client islands

| Layer | Type | Examples |
| --- | --- | --- |
| Shell, nav bar, page scaffolds, data loading | **Server Components** | layout, route pages, initial experiment fetch |
| Interactive canvases, control panel, work-tree | **Client islands** (`'use client'`) | React Flow canvases, r3f canvas, Zustand-bound widgets |

Only the interactive parts are client components; everything else renders on the server
([ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)).

## Mutation vs stream

| Need | Mechanism |
| --- | --- |
| Human mutation (create/update experiment, save, branch) | **Server Actions** → `@caw/core` |
| Machine/stream (run status, live progress) | **Route Handlers** (SSE/stream) → `RunService.status` |
| Bulk/automation | the MCP/CLI surfaces, not the web app |

## Canvases as client components

- React Flow (C1/C2) and react-three-fiber (C3) are dynamically imported with `ssr: false` to avoid hydration
  of WebGL/canvas on the server ([canvas-rendering-implementation.md](./canvas-rendering-implementation.md)).
- They read/write the single Zustand store ([state-management.md](./state-management.md)); persistence flows
  through Server Actions, not direct DB access.

## The TS ⇆ Python seam (UI view)

The web app never talks to the Python engine directly. It calls `@caw/core` (via Server Actions/Route
Handlers); the core invokes the engine through ports ([../03-architecture/system-architecture.md](../03-architecture/system-architecture.md)).

## Route structure

```
app/
├─ layout.tsx                 # nav bar shell (server)
├─ (simulation)/page.tsx      # 1:9 Simulation screen
├─ (module-design)/page.tsx
├─ user/ · setting/
└─ api/runs/[id]/stream/route.ts   # SSE run status
```

## Open questions

Auth/session model for User/Setting menus in v1 (single-user) — TODO(open-question).

## Implications for runbooks

Phase-1 app-shell runbook builds the App Router skeleton, Server Actions wiring to core, and the SSE route
before any canvas is added.

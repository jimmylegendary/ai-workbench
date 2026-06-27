# ADR-0003: Frontend stack — Next.js App Router, server shell + client canvas islands

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF.md) (§3, §4, §5, §6, §8)
  - [Product Surface & Stack (research)](../02-research/product-surface-and-stack.md)
  - [Canvas & Visualization Tech (research)](../02-research/canvas-and-visualization-tech.md)
  - [Design System & open design (research)](../02-research/design-system-open-design.md)
  - [ADR-0001 Product surface](./ADR-0001-product-surface.md)
  - [ADR-0006 Design system / open design](./ADR-0006-design-system-open-design.md)
  - [ADR-0004 Canvas rendering tech](./ADR-0004-canvas-rendering.md)
  - [ADR-0002 Data layer](./ADR-0002-data-layer.md)
  - [ADR-0005 Trace pipeline boundaries](./ADR-0005-trace-pipeline.md)
  - [ADR-0007 Work-tree change-management model](./ADR-0007-change-management-worktree.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This ADR fixes the **Next.js specifics** for the CAW-01 web app: App Router, the server/client component
split, where the three canvases live, how data is fetched and mutated, the cross-canvas state model, and
**where the TS↔Python boundary sits relative to Next.js**. It does **not** decide the canvas *rendering
engines* (ADR-0004), the design-system/token layer (ADR-0006), the data store (ADR-0002), or the trace
pipeline (ADR-0005). It realizes the web surface defined in [ADR-0001](./ADR-0001-product-surface.md) and
elaborates SOURCE-BRIEF §§3–6 without redefining the 1:9 layout, nav bar, three canvases, or work-tree.

## Context

Forces and constraints we must satisfy:

- **Brief §3–§5:** a system-wide top nav bar (Simulation / Module Design / User / Setting); the Simulation
  screen is a **1:9 left:right split** — left Control Panel, right Workspace of **three coordinated
  canvases** (C1 workload flow, C2 serving/representation, C3 hardware design).
- **Brief §5 cross-canvas behavior:** a selection/change in one panel is reflected where relevant; the
  workspace composes one runnable experiment.
- **Brief §6 work tree:** every selection/change in any panel is tracked; per-item and full save.
- **Brief §1 control-plane feel:** dense, status-first, IDE/observability-console UX — not a marketing site
  and not a chatbot.
- **Brief §8 engine reality:** a `SimulationRun` is a heavy Python-native job; Node must **orchestrate and
  observe, not compute**.
- **ADR-0001 invariant:** the web app carries presentation concerns only; **every durable mutation goes
  back through the shared core** so MCP/CLI get identical semantics.
- The canvases are browser-only (DOM measurement, Canvas2D, WebGL) — they cannot live in the server
  component tree as-is.

## Options considered

### Router / rendering model

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **App Router (RSC default) + client islands** | Server Components fetch via core directly (zero client JS for shells); Server Actions + Route Handlers are first-class; matches ADR-0001 layering | Canvas/WebGL needs careful `'use client'` + `ssr:false` boundaries | **Chosen** |
| Pages Router | Familiar, simpler mental model | Legacy default; no RSC; loses direct-core server data access ergonomics | Rejected |
| SPA (Vite) + separate API | Simplest client-only canvas story | Re-introduces a separate backend/API the core was meant to avoid (breaks ADR-0001); loses server rendering of dense shells | Rejected |

### Mutation mechanism

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Server Actions for human mutations + Route Handlers for machine/stream URLs** | Actions remove fetch/JSON boilerplate and progressively enhance; handlers give stable URLs for SSE/webhooks/artifacts | Two mechanisms to learn; actions not reusable by MCP/CLI (intended) | **Chosen** |
| Route Handlers only (REST everywhere) | One mechanism; reusable | More boilerplate; mutations stop feeling "local" to a control plane | Rejected as default |
| Server Actions only | Least boilerplate | No stable URL for streaming run status, Python callbacks, large artifact download | Rejected |

### Client state for cross-canvas coordination

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Single Zustand `ExperimentStore`, narrow selectors** | React Flow already uses Zustand internally → idiomatic; one store holds selection/composition/work-tree/runStatus; selectors avoid re-render storms | One more lib; discipline to keep renderers out of state | **Chosen** |
| Per-canvas local state | Simple per panel | Breaks brief §5 coordination + §6 single work-tree; ad-hoc syncing | Rejected |
| React Context only | No dep | Coarse re-renders across heavy canvases | Rejected |

## Decision

**Adopt the App Router with a "server shell, client islands" architecture, Server Actions for human
mutations, Route Handlers for machine/stream URLs, and a single Zustand store for cross-canvas
coordination.** The Python engine never runs in the Next.js process.

### 1. App Router + server/client split

Default to React Server Components; drop to client only where interactivity demands it.

| Piece | Component kind | Rationale |
|---|---|---|
| Nav bar, page shell, run-history lists, evidence/projection readouts | **Server Components** | Server-side data fetch via the core; minimal client JS |
| Left **Control Panel** (start/stop/save buttons, status, skill launchers) | **Client islands** inside a server shell | Interactivity + live status; call server actions |
| **Canvas 1** AI Workload Flow (→ L0 IR) | **Client** | Highly interactive node graph (engine in ADR-0004) |
| **Canvas 2** Serving & Representation selection | **Client** | Selection + cross-canvas coordination |
| **Canvas 3** Hardware Design (chip→cluster) | **Client** | Heavy interactive HW editing (likely WebGL, ADR-0004) |
| Cross-canvas coordination state | **Client** Zustand store, persisted via server actions | Brief §5 coordination + §6 work tree |

**Pattern:** each Simulation page is a **Server Component** that fetches the experiment + work-tree snapshot
through the core and passes it as props into client canvas islands. Canvases own ephemeral UI state; **every
durable mutation returns through a server action → core service**, so the same `WorkTreeService`
(ADR-0007) rule applies whether the change came from the UI, MCP, or CLI.

### 2. Mutations: Server Actions vs Route Handlers

| Mechanism | Use for | CAW-01 examples |
|---|---|---|
| **Server Actions** (`'use server'`) | Human-initiated, form-shaped mutations | save work-tree item / full save, start/stop run, edit a HW component, compose an experiment |
| **Route Handlers** (`app/api/**/route.ts`) | Anything needing a stable HTTP contract | `GET /api/runs/:id/stream` (SSE run status), `POST /api/internal/run-callback` (long Python job callback), `GET /api/artifacts/:id` (large trace download), health checks |

Rule: **Server Actions for "the human clicked a button"; Route Handlers for "a machine/stream needs a
URL."** Both are thin — validate with the shared Zod schema, then delegate to a core service. **MCP and CLI
never call actions or route handlers** (ADR-0001); they import the core directly.

### 3. Data fetching

- **Reads:** Server Components call core read services / repositories directly (no client fetch for shells,
  lists, readouts). Initial canvas data is server-fetched and passed as props to hydrate the client island.
- **Live run status:** streamed via the SSE Route Handler (`/api/runs/:id/stream`), driven by `RunService`
  while the Python job reports progress.
- **Mutations:** Server Actions returning typed results; the client store updates optimistically and
  reconciles on the action result.
- **No client-side ORM/DB access.** The data store (ADR-0002) is reached only through the core on the
  server.

### 4. Cross-canvas state model

A single client **`ExperimentStore` (Zustand)** holds: `selection {panel, entityKind, entityId, partPath}`,
`composition` (workload C1 × serving C2 × hardware C3 draft), `workTree` (ordered change events +
dirty/saved markers), and `runStatus` (control-plane readouts). Rules:

- **Selection is a domain identity, not a renderer handle.** A pick in any canvas writes a `partId` /
  entity identity; renderer objects (React Flow nodes, three.js meshes) never cross panels.
- **Edits are intents, not direct mutations.** Canvases dispatch intents (`addComponent`, `editPart`,
  `wireStage`, `setNodeParam`); a reducer updates `composition` **and** appends to `workTree` — this is what
  makes per-item/full save and undo possible.
- **Coordination is derived** via selectors over `composition`, not duplicated state.
- **Durable persistence** of the work-tree happens via server actions → `WorkTreeService`; the Zustand store
  is the *client* shape only (persisted object model = ADR-0007).

### 5. Canvas hosting + SSR rules (boundary with ADR-0004)

- Every canvas file starts with `'use client'`.
- **WebGL (C3) is dynamically imported with `ssr: false`** via a client wrapper (an `ssr:false` dynamic
  import cannot be placed directly in a server component). Render a stable skeleton on the server to avoid
  hydration layout shift.
- React Flow (C1/C2) runs client-side; mark panels `'use client'`.
- **Code-split heavy renderers** (three.js/drei) so the Simulation screen's first paint isn't blocked by
  WebGL. *The renderer choices themselves are ADR-0004; this ADR fixes only the Next.js hosting contract.*

### 6. The TS↔Python boundary relative to Next.js (the load-bearing line)

**Next.js (Node runtime) does not run the simulation in-process.** A `SimulationRun` is a long Python job
(`LLMServingSim → syntorch → ASTRA-sim (+ SST)`). Node **orchestrates and observes**:

- The web app starts a run via the core's `RunService`, which calls an **engine-adapter port**
  (`SimEnginePort` / `TraceCapturePort` / `HwDesignPort`). The actual TS⇆Python transport is decided in
  ADR-0005; from Next.js's perspective the engine is always behind a port.
- The Python job reports progress back through the **`/api/internal/run-callback` Route Handler**; the
  browser consumes status via the **SSE stream Route Handler**.
- **Interchange is explicit JSON + artifact references**, never bytes through Next.js: experiment spec + HW
  config go out as JSON; Chakra ET / metrics / the memory-annotated IR (L0/L1/L2 — same schema, varying
  fill level) come back as typed-but-opaque artifacts addressed by path/URI. The TS side never parses
  sub-torch internals.

### 7. Versioning / tooling baselines

- **TypeScript, strict mode.** Shared **Zod** schemas from `@caw/core`/`@caw/schemas` are the one validation
  contract (ADR-0001).
- **App Router** on a pinned Next.js line; **React 19**-compatible renderer versions (e.g. R3F v9 line if 3D
  is chosen — final pins in ADR-0004). Exact versions are pinned at build time and re-verified.
- **`@caw/core` has zero `next` imports** (ADR-0001); the web app is the only package that depends on Next.

## Consequences

**Becomes easy:**
- Dense shells render on the server with minimal client JS; only the interactive canvases ship heavy
  bundles.
- One mutation path (server action → core) keeps UI/MCP/CLI behavior identical (ADR-0001).
- Live, control-plane-style status via SSE without polling churn.
- Cross-canvas coordination and the work-tree are a single, testable client store backed by one core
  service.

**Becomes harder / costs:**
- `ssr:false` + `'use client'` boundaries for canvases need care (hydration, code-splitting); mitigated by
  client wrappers + server skeletons.
- Server Actions aren't reusable by MCP/CLI (intended) — the verb must live in the core.
- Two mutation mechanisms (actions + route handlers) to keep straight; the rule of thumb in §2 governs.
- React 19 / Next / R3F version coupling must be pinned and re-verified (open question, coordinated with
  ADR-0004).

**Follow-on work (runbooks):**
- Next.js app-router skeleton: server shell + client canvas islands; server actions for mutations; Route
  Handlers for run-status SSE, artifact download, Python callback.
- Canvas shell + cross-panel Zustand `ExperimentStore` (selection/intent dispatch, `'use client'`
  boundaries) — shared with the ADR-0004 canvas runbooks.
- Next.js integration: dynamic `ssr:false` wrappers, version pinning, WebGL bundle code-splitting,
  hydration-safe placeholders.

## Open questions / revisit triggers

- `TODO(open-question: next-version-pins)` Exact Next.js / React / renderer version pins and current
  app-router rules for `dynamic(ssr:false)` placement; re-verify the server-component wrapper requirement at
  build (coordinate with ADR-0004).
- `TODO(open-question: worktree-store-mapping)` Final cross-panel store choice (Zustand assumed) and how the
  client work-tree maps onto the persisted model in ADR-0007.
- `TODO(open-question: coordination-semantics)` Exact cross-canvas highlight rules (what a C2 serving
  selection highlights in C1/C3) — needs product definition before build.
- `TODO(open-question: run-callback-transport)` Whether run progress arrives via the SSE+callback pattern
  here or via a richer streaming transport once the Python sidecar lands (coordinate with ADR-0005).
- **Revisit trigger:** if a canvas ever needs server-side compute beyond data fetch, re-examine the
  "Node orchestrates, Python computes" line — do not move engine logic into Next.js.

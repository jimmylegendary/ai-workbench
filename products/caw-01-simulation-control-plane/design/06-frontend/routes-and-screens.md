# Routes & Screens — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [layout-and-navigation.md](./layout-and-navigation.md), [component-inventory.md](./component-inventory.md), [app-architecture-mvvm.md](./app-architecture-mvvm.md), [auth-and-supabase.md](./auth-and-supabase.md), [ui-architecture-nextjs.md](./ui-architecture-nextjs.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The route map and, per screen, its **purpose · components (View) · ViewModel contract · data sources**. This is
the screen-completeness checklist and the spec the prototype briefs and the scaffold implement.

## Route map

```
(auth)
  /login                      magic-link / OTP sign-in            [public]
(app)  ── session-gated by middleware; NavBar shell
  /simulation                 the 1:9 instrument screen (default) [Simulation]
  /module-design              reusable module library/editor      [Module Design]
  /runs                       runs & experiments data browser     [data management]
  /runs/[runId]               one run: status, metrics, IR open, evidence
  /user                       account (profile, sessions)         [User]
  /settings                   workspace + engine + token settings [Setting]
api
  /api/runs/[id]/stream       SSE run status (Route Handler)
  /api/internal/run-callback  Python engine progress callback (service-role)
  /api/artifacts/[id]         large trace/IR download (deref pointer)
```

Nav (top bar, every screen): **Simulation · Module Design · User · Setting** (brief §3). `/runs` is reached from
the control panel / Module-area; it is the explicit "manage all simulation data" surface the team needs.

## Screen specs

### `/login` — Sign in
- **Purpose:** get a session; nothing else. Calm, single-card, brand-quiet.
- **View:** `LoginCard` (email input, "send link" button, sent/again states), `AuthError`.
- **ViewModel:** `useAuthVM` → `signInWithOtp(email)`, `status: idle|sending|sent|error`.
- **Data:** Supabase Auth only. On callback, middleware establishes session → redirect to `/simulation`.

### `/simulation` — the instrument (primary)
- **Purpose:** compose workload × serving/representation × hardware, run, compare evidence. 1:9 split (brief §5).
- **View:** `AppShell` → `SplitPane(1:9)`; **left** `ControlPanel` (`RunControls`, `RunStatus`,
  `ProjectionReadout`, `SaveControls`, `EvidenceList`, `NextActionHint`); **right** workspace = `FlowCanvas`(C1
  OpNode/TensorPort), `FlowCanvas`(C2 ServingNode), `HardwareScene`(C3) + `PartInspector`, and the work-tree
  strip (`WorkTreeView`, `BranchBar`, `DiffView`, `HistoryList`).
- **ViewModel:** `useSimulationVM` composing: Zustand slices (`selection`, `c1/c2/c3`, `worktree`, `run`,
  `layout`); TanStack Query reads (experiment, branches); Server-Action mutations (`run`, `stop`, `saveItem`,
  `saveAll`, `branch`, `compose`); `useRunStatus(runId)` SSE subscription. Cross-canvas highlight derives from
  `selection` (partId/nodeId).
- **Data:** reads experiment/hw_node/branches from Supabase (RLS); mutations via core; run status via SSE; IR
  opened lazily via core storage (pointer).

### `/module-design` — module library
- **Purpose:** author/reuse parameterized modules (workload fragments, serving configs, HW subtrees) that drop
  into the canvases.
- **View:** `ModuleList`, `ModuleEditor`, `ModulePreview`.
- **ViewModel:** `useModuleVM` → CRUD over module rows; "insert into experiment" emits a compose intent.
- **Data:** module rows in Supabase (RLS).

### `/runs` (+ `/runs/[runId]`) — simulation-data management
- **Purpose:** the team's window on **all** simulation data: filter/sort runs across experiments, inspect one
  run, open its IR, see metrics + evidence, compare projections, branch/restore.
- **View:** `RunsTable` (status chip, axis, projection, time), `RunFilters`, `RunDetail` (`MetricsPanel`,
  `IrOpenButton`, `EvidenceList`, `ProjectionReadout`, `DiffView`).
- **ViewModel:** `useRunsVM` (paged/filtered query), `useRunDetailVM(runId)`.
- **Data:** run index/metrics/evidence from Supabase (RLS); IR/trace lazy via pointer.

### `/user` — account
- **Purpose:** profile, active sessions, sign-out.
- **View:** `ProfileCard`, `SessionList`, `SignOutButton`.
- **ViewModel:** `useAccountVM` → Supabase Auth user + sign-out.

### `/settings` — workspace settings
- **Purpose:** engine endpoint, default backends, design-system/token toggles (light/dark/density), data
  boundary defaults.
- **View:** `SettingsForm` sections (Engine, Defaults, Appearance).
- **ViewModel:** `useSettingsVM` → settings rows (Supabase) + appearance to token CSS vars.

## Loading / empty / error (every screen)

- **Loading:** skeletons that match final density (no layout shift); canvases render a server skeleton then
  hydrate (ADR-0003 §5).
- **Empty:** an explicit `NextActionHint`-style "honest next step" (brief §1), never a blank panel.
- **Error:** inline, recoverable; engine-down degrades to read-only metadata (reads still work via Supabase).

## Open questions

- `TODO(open-question: worktree-placement)` work-tree as strip vs drawer vs tab on `/simulation`
  ([component-inventory.md](./component-inventory.md)).
- `TODO(open-question: module-scope)` whether modules are per-project or per-user-global.

## Implications for runbooks

RB-011 builds the nav + `(app)` gate + `/login`; RB-012 wires `/simulation` ViewModel save/run; `/runs` is a
phase-5 (persistence/API) surface once the run index is populated.

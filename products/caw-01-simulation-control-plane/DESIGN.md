# CAW-01 Simulation Control Plane

> Category: Developer Tools
> Dense, instrument-grade control plane for composing and running memory-centric AI-hardware simulations — a control plane, not a chatbot.

<!--
Open Design seed. This file follows the Open Design 9-section DESIGN.md schema
(## 1..## 9) AND carries a machine-readable token block in the frontmatter below.
Stack: DESIGN.md → DTCG *.tokens.json → Tailwind v4 (CSS vars) → shadcn/ui + Radix.
App architecture (what consumes these tokens): design/06-frontend/ (MVVM, Next.js, Supabase).
-->

---
name: CAW-01 Simulation Control Plane
mode: light-and-dark
density: compact
colors:
  background: "#FAFAFA"
  surface: "#FFFFFF"
  surfaceMuted: "#F4F4F5"
  border: "#E4E4E7"
  text: "#18181B"
  textMuted: "#52525B"
  primary: "#2563EB"
  primaryHover: "#1D4ED8"
  accent: "#06B6D4"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  canvasBg: "#0E1116"
  canvasGrid: "#1C232B"
  dark:
    background: "#0B0D10"
    surface: "#15181D"
    border: "#2A2F37"
    text: "#E6E8EB"
    textMuted: "#9AA1AC"
typography:
  fontFamily: "Inter"
  mono: "JetBrains Mono"
radius: { sm: "4px", md: "6px", lg: "10px" }
spacing: { unit: "4px" }
---

## 1. Visual Theme & Atmosphere

An **instrument**, not a website. The reference points are an oscilloscope UI, an observability console
(Grafana/Datadog), and an IDE — dense, status-forward, every pixel carrying signal. The operator is composing and
running heavy hardware simulations and comparing evidence; the UI's job is to make **run status, evidence
completeness, blockers, and the next honest action** legible at a glance. No marketing tone, no hero sections, no
decorative gradients. Calm by default; color appears only to carry meaning (state, validity, selection). The
three canvases are dark "signal" surfaces embedded in light control chrome (dark-on-light contrast frames the
work). The feeling on open should be "a console came online," not "a landing page loaded."

## 2. Color

Shared workbench neutral = **zinc**; CAW-01's identity accent = **instrument blue** `#2563EB` with a **cyan
signal** `#06B6D4`.

- **Neutrals (light):** background `#FAFAFA`, surface `#FFFFFF`, surfaceMuted `#F4F4F5`, border `#E4E4E7`, text
  `#18181B`, textMuted `#52525B`.
- **Neutrals (dark):** background `#0B0D10`, surface `#15181D`, border `#2A2F37`, text `#E6E8EB`, textMuted
  `#9AA1AC`.
- **Accent:** primary `#2563EB` (hover `#1D4ED8`) — actions, selection, valid edges; accent/cyan `#06B6D4` —
  live signal, active stream, highlighted cross-canvas links.
- **Status (semantic, must stay unambiguous):** success `#16A34A`, warning `#D97706`, danger `#DC2626`. Run
  states map to these: queued = textMuted, running = cyan (pulsing), succeeded = success, failed = danger,
  cancelled = textMuted.
- **Canvas surfaces:** canvasBg `#0E1116`, grid `#1C232B`. Nodes sit on `surface` tiles inside the dark canvas;
  valid wiring uses primary, invalid uses danger, the selected/coordinated path uses cyan.
- **Trust & boundary** (evidence): keep distinct and **color-blind-safe** (pair color with an icon/label) —
  public/internal/confidential and trust low→high must never rely on hue alone.

Refine all values for **WCAG AA**; dark mode is first-class (it matters most on the canvases).

## 3. Typography

- **UI / body:** `Inter`. **Mono:** `JetBrains Mono` — **load-bearing**: all IR / op / tensor / metric readouts,
  part IDs, branch refs, and numeric tables are mono so columns align and values are scannable.
- Scale (compact): h1 30/36 600, h2 22/28 600, h3 16/24 600, body 14/20 400, label 12/16 500, code 12/18 400.
- Tabular numerals on every metric/table. Labels are terse, often uppercase-tracked for panel headers. Long
  identifiers (part IDs, URIs) truncate middle with a copy affordance, never wrap chaotically.

## 4. Spacing

- Base unit **4px**; compact rhythm (4/8/12/16). Control-plane panels are tight — small paddings, 1px borders
  doing the separation work, not whitespace.
- Tables/lists use 28–32px row height; dense but not cramped. The 1:9 split has firm min-widths so the control
  panel never collapses and the workspace stays dominant.
- Radius: sm 4 (inputs/badges), md 6 (cards/buttons), lg 10 (dialogs/major panels).

## 5. Layout & Composition

- **Global:** a thin **top nav bar** — `Simulation · Module Design · User · Setting` — over a session-gated app
  shell. No sidebars competing with the workspace.
- **Simulation screen (the core):** a **1:9 left:right split**. **Left (1)** = Control Panel: run/stop,
  per-axis run status, projection readout, per-item & full save, evidence list, next-action hint. **Right (9)** =
  Workspace of **three coordinated canvases** (C1 AI-workload flow → C2 serving/representation → C3 hardware
  chip→die→package→tray→rack→cluster) plus a **work-tree** strip (branches, diff, history). A selection in one
  canvas highlights related elements in the others.
- **Runs / data-management:** a dense table + detail (status, axis, projection, time → metrics, IR-open,
  evidence). **Login:** a single quiet centered card. **Settings:** sectioned form (engine, defaults,
  appearance).
- Information hierarchy: status and the next action are always visible without scrolling; depth (IR internals,
  HW spec) is progressive disclosure via inspectors.

## 6. Components

Built from **shadcn/ui + Radix**, themed by the tokens above. Source of truth:
`design/06-frontend/component-inventory.md`; screen mapping: `design/06-frontend/routes-and-screens.md`.

- **Shell:** `NavBar`, `AppShell`, `SplitPane` (resizable 1:9, min widths).
- **Control panel:** `RunControls`, `RunStatus` (per-axis chips + progress), `ProjectionReadout`, `SaveControls`
  (per-item / full, dirty-aware), `EvidenceList` (trust/boundary badged), `NextActionHint`.
- **Canvas 1 & 2** (React Flow / `@xyflow/react`): `FlowCanvas`, `OpNode`, `TensorPort`, `ServingNode` + typed
  handles; `canvasBg`/`canvasGrid`; primary/cyan for selection + valid/invalid edges.
- **Canvas 3** (react-three-fiber): `HardwareScene` (chip→…→cluster), `PartInspector` (picking returns a domain
  `partId`).
- **Work-tree:** `WorkTreeView`, `DiffView`, `BranchBar`, `HistoryList`.
- **Data management:** `RunsTable`, `RunFilters`, `RunDetail`, `MetricsPanel`.
- **Auth/account:** `LoginCard`, `ProfileCard`, `SignOutButton`.
- **Primitives:** Button, Tabs, Dialog, Tooltip, Select, Resizable, ScrollArea, Badge, Toast.
- **States are part of the component:** every interactive component specifies default / hover / focus-visible /
  active / disabled / loading (skeleton) / empty / error. Empty states use the honest-next-step pattern, never a
  blank box.

## 7. Motion & Interaction

- Motion is **functional and fast** (120–180ms ease-out): state transitions, panel resize, inspector open,
  optimistic save settling. The **only ambient motion** is a subtle cyan pulse on a *running* status — signal,
  not decoration.
- Optimistic edits apply instantly and reconcile on the server result; a failed save reverts visibly with a
  toast. Run status streams (SSE), never spinner-polls.
- Keyboard-first: run/stop, save, branch, and canvas selection have shortcuts; focus-visible rings everywhere
  (this is an operator tool). Cross-canvas highlight is immediate on selection.
- Respect `prefers-reduced-motion` (drop the pulse to a static dot).

## 8. Voice & Brand

Precise, technical, trustworthy, accountable. Copy states facts and the next action — "3 axes captured · IR at
L1 · next: run ASTRA-sim" — never marketing adjectives. Errors are specific and recoverable. The brand promise is
**evidence you can trust**: the UI separates measured/simulated/synthetic axes and never implies more certainty
than the data carries. Quiet confidence over flourish.

## 9. Anti-patterns

- ❌ Chatbot / assistant framing, hero sections, marketing gradients, oversized illustrations.
- ❌ Whitespace-heavy "comfortable" SaaS spacing — this is a compact control plane.
- ❌ Color as decoration; status conveyed by hue alone (must pair with icon/label, color-blind-safe).
- ❌ Proportional fonts for numbers/IDs/metrics (always mono + tabular).
- ❌ Spinner-polling for run status (must stream); blank empty states (must show the next honest action).
- ❌ Light-only design — the canvases require a real dark mode.
- ❌ Implying certainty the evidence doesn't support, or blending real vs simulated vs synthetic axes.

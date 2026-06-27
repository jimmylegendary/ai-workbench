# Canvas & Visualization Tech

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [ADR-0004 Canvas rendering tech](../01-decisions/ADR-0004-canvas-rendering.md)
  - [ADR-0003 Frontend stack](../01-decisions/ADR-0003-frontend-stack.md)
  - [ADR-0007 Work-tree change-management model](../01-decisions/ADR-0007-change-management-worktree.md)
  - [Work tree & versioning](../04-data-layer/work-tree-and-versioning.md)
  - [Change management / work tree](../05-caw01-simulation-control-plane/change-management-worktree.md)
  - [Open questions](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This document decides **which rendering technology powers each of the three coordinated canvases** in
the CAW-01 Simulation screen (SOURCE-BRIEF §5), and specifies a **shared interaction/state model** that
keeps the panels coordinated, plus **Next.js integration rules** for canvas/WebGL components. It feeds
[ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md).

It does **NOT** decide the data layer (see [data-layer-options](data-layer-options.md) / ADR-0002), the
overall frontend stack details (ADR-0003), the design-system tool (ADR-0006), or the persisted work-tree
object model (ADR-0007 / data layer) — it only specifies the **client-side rendering + selection surface**
those decisions plug into. Library facts below reflect public state as of mid-2026; version-specific
claims are flagged as open questions where they may drift.

---

## 1. The shape of the problem

The three canvases are *not* the same kind of picture, and forcing one renderer onto all three is the
main trap to avoid:

| Canvas | Domain object | Visual idiom | Interaction load |
|---|---|---|---|
| **C1 — AI Workload Flow** | one agent turn = op/data-movement graph → L0 IR | directed node/edge graph | pan/zoom, node inspect, custom node bodies |
| **C2 — Serving & Representation** | composition of vLLM / LLMServingSim / ASTRA-sim / syntorch | directed/port graph (pipeline) | pick component, wire composition, validate |
| **C3 — Hardware Design** | chip→die→package→tray→rack→cluster | "looks like real hardware", deep spatial hierarchy | drill-down, part picking, micro-edit |

C1 and C2 are **graph/flow** problems with strong shared requirements (custom nodes, ports, pan/zoom,
selection, layouting). C3 is a **deep physical-hierarchy** problem: the value proposition in the brief is
that hardware is *visualized like real hardware* with drill-down and fine-grained part selection — that is
a spatial/scene problem, not a node-graph problem.

So the right answer is **two renderers, not one or three**: a graph library shared by C1+C2, and a
scene/picking library for C3, unified by a single cross-panel state store (§5).

---

## 2. Canvas 1 & 2 — node/edge graph

### 2.1 Candidates

| Option | Pros | Cons | Fit for C1/C2 |
|---|---|---|---|
| **React Flow / `@xyflow/react`** (MIT) | Purpose-built for node/edge UIs in React; custom nodes are plain React components; built-in pan/zoom, multi-select, keyboard, handles/ports, minimap, controls; v12 adds SSR/SSG support and computed node measurement; internal Zustand store exposes hooks. Large ecosystem, active maintenance. | DOM/SVG-per-node means thousands of visible nodes degrade; some conveniences (e.g. some Pro examples) are commercial; opinionated data model. | **Strong** — agent-turn graphs and pipeline composition are exactly its use case. |
| **Cytoscape.js** (+ react wrapper) | Mature graph theory layer (layouts, graph algorithms, very large graphs on canvas). | React integration is a wrapper, not idiomatic; custom node rendering is styling-driven, not React components; harder to embed rich inspectable node bodies. | Medium — better for analysis than for editable rich nodes. |
| **Sigma.js / Graphology** | WebGL renderer, scales to very large graphs. | Geared to network exploration/visualization, weak for editable port-based pipelines + rich node UIs. | Weak for C1/C2 editing needs. |
| **D3-force / hand-rolled SVG** | Total control. | We rebuild selection, pan/zoom, ports, accessibility, layouting from scratch. | Avoid. |
| **`reactflow` on a canvas/WebGL custom node renderer** | Escape hatch if node counts explode. | Loses "node = React component" ergonomics. | Fallback only (see scale note). |

### 2.2 Scale reality

A single agent turn (C1) and a serving composition (C2) are **tens to low-hundreds of nodes**, not
graph-database scale. React Flow comfortably handles this. For the larger end (e.g. an expanded op-level
L0 graph), React Flow's documented levers are:

- `onlyRenderVisibleElements` (viewport culling),
- memoized `nodeTypes`/`edgeTypes` and `React.memo` custom nodes,
- avoiding per-frame re-render of the whole graph by selecting narrow slices from the store,
- collapsing sub-graphs into group nodes (progressive disclosure) so the L0 op graph expands on demand.

If a single workload graph ever needs **>~1–2k simultaneously visible nodes**, that is the trigger to move
that specific view to a canvas-rendered graph; it is recorded as an open question, not pre-optimized now.

### 2.3 Recommendation (C1 & C2)

**Use `@xyflow/react` (React Flow v12) for both Canvas 1 and Canvas 2.** Custom nodes are React
components (ideal for inspectable op nodes that map to L0 IR `TensorNode`/`DataMovementEdge`, and for
serving-stage cards). Share node/edge primitives, theming, and selection plumbing between the two panels.
For C2's port-to-port composition, use typed source/target handles and validate connections against the
pipeline grammar (`input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+ SST)`).

---

## 3. Canvas 3 — hardware design (2D vs 3D)

This is the consequential decision. The brief requires: a deep hierarchy
(chip/die/package/tray/rack/cluster), **drill-down**, **part selection at fine granularity**, and
**micro-edits** on a selected part, all *visualized like real hardware*.

### 3.1 The 2D vs 3D axis

| Dimension | 2D (Konva / PixiJS) | 3D (three.js / react-three-fiber + drei) |
|---|---|---|
| "Looks like real hardware" | Schematic/exploded 2D layouts, floor-plan-style rack elevations | Photoreal-ish chips, dies, racks; rotate/orbit; reads as physical |
| Deep hierarchy drill-down | Easy as nested layers/groups + breadcrumb zoom | Natural as scene-graph nesting + camera focus |
| Part picking | Hit-testing on shapes (Konva: scene-graph events; Pixi: interaction) | Raycasting / GPU picking on meshes/instances |
| Authoring micro-edits | Simple 2D forms over selected shape | Same forms; 3D gizmos optional |
| Asset cost | Low (vector primitives) | Higher (geometry, instancing discipline, GLTF assets) |
| LOD for deep hierarchy | Manual: swap detail by zoom level | First-class: `<Detailed/>` (LOD), `<Instances/>`, frustum culling |
| Next.js/SSR friction | Lower (2D canvas, but still client-only) | Higher (WebGL is strictly client-side) |
| Team ramp | Lower | Higher (3D scene/camera/material mental model) |

### 3.2 2D library tradeoff (if 2D is chosen)

| Option | Pros | Cons |
|---|---|---|
| **Konva / `react-konva`** | Best React integration for 2D canvas; scene-graph with per-shape events ideal for selection/drill-down; layer separation (static hardware vs interactive selection overlay) for cheap repaint; declarative React components. | CPU canvas — very large dynamic scenes slower than WebGL. |
| **PixiJS** | WebGL/GPU-batched, fastest for very large/animated 2D scenes. | Geared to games; React binding less idiomatic; richer than we need if scenes are mostly static. |
| **Fabric.js** | Strong for design-editor selection/transform UX. | Editor-centric; weaker for nested hardware hierarchy semantics. |

### 3.3 3D library tradeoff (if 3D is chosen)

| Option | Pros | Cons |
|---|---|---|
| **react-three-fiber (R3F) + drei** | Declarative three.js in React; scene graph maps cleanly to chip→…→cluster nesting; drei gives `<Detailed/>` (LOD), `<Instances/>` (thousands of identical dies/chips in one draw call), `<Bvh>`/raycast helpers, `<Select>`/selection helpers, controls. Active ecosystem. | WebGL is client-only (SSR constraints, §6); steeper learning curve; needs instancing discipline to stay fast. R3F v9 required for React 19 / Next 15+. |
| **Raw three.js** | Max control. | Lose React reconciliation; we re-bind state to the scene by hand. |
| **babylon.js** | Batteries-included engine, strong picking/LOD. | Heavier; weaker React-idiomatic story than R3F. |

### 3.4 Picking / selection of sub-components

The defining C3 requirement (select a specific part, then micro-edit) drives picking strategy:

- **3D (R3F):** default raycasting is fine for modest object counts; for **instanced** geometry (many
  identical chips/dies) use `instanceId` from the raycast hit or **GPU/color picking** for O(many)
  pickability. Keep a stable `partId → mesh/instance` map so a pick resolves to a domain entity, not a
  mesh.
- **2D (Konva):** per-shape click events resolve directly to the shape; attach `partId` to shape attrs.

Either way, **picking returns a domain `partId`** (chip/die/package/tray/rack/cluster + component path),
never a raw renderer object — that is what keeps C3 coordinated with the work tree and the other canvases.

### 3.5 Level-of-detail for deep physical hierarchies

The hierarchy is the LOD plan. Treat each tier as a detail band:

| Zoom / focus tier | What renders | Technique |
|---|---|---|
| cluster / rack | racks as boxes, trays as slabs; counts/labels | instancing + impostors; hide sub-geometry |
| tray / package | package outlines, die placement | swap to mid-detail meshes via LOD |
| die / chip / component | full component geometry, editable parts | full detail only for focused subtree |

In R3F this is `<Detailed/>` (distance-based LOD) + `<Instances/>` + frustum culling + **subtree
load-on-drill-down** (don't mount chip-level geometry until the user enters a package). In 2D it is the
same idea via zoom-thresholded layer swaps. Either way: **never mount the whole cluster at full detail.**

### 3.6 Recommendation (C3)

**Recommend react-three-fiber + drei (3D), with a 2D Konva fallback gated on a spike.**

Rationale: the brief's explicit ask is hardware *visualized like real hardware* with drill-down and part
selection — 3D delivers that proposition directly, and the scene-graph + LOD + instancing primitives in
drei map almost 1:1 onto the chip→…→cluster hierarchy and its picking/LOD needs. The cost is WebGL/SSR
discipline (§6) and team ramp.

**Decision guard:** run a time-boxed spike that renders a representative cluster (e.g. realistic rack ×
tray × package × die counts) with instancing + LOD and measures interaction latency and pick accuracy. If
the 3D spike cannot hold an interactive frame budget *or* the team-ramp cost is judged too high for CAW-01
v1, **fall back to Konva 2D** (schematic/exploded hardware view) — it satisfies drill-down + selection +
micro-edit with far less SSR/asset cost, trading away the "physical realism" feel. This guard is an open
question until the spike runs.

---

## 4. Per-canvas recommendation summary

| Canvas | Recommended lib | Why (one line) | Fallback |
|---|---|---|---|
| **C1 Workload flow** | `@xyflow/react` (React Flow v12) | Node/edge UI with React custom nodes = exact fit; maps to L0 IR nodes/edges | Canvas-rendered graph only if >~1–2k visible nodes |
| **C2 Serving composition** | `@xyflow/react` (shared with C1) | Same primitives; typed ports validate pipeline grammar | same as C1 |
| **C3 Hardware design** | react-three-fiber + drei (3D) | "Looks like real hardware" + drill-down + part pick + LOD via scene graph/instancing | Konva 2D (react-konva) if 3D spike fails frame/ramp budget |

---

## 5. Shared interaction & cross-panel state model

The brief requires all three panels to be **coordinated** and every change tracked in a **work tree**
(§5–§6). Two different renderers (React Flow + R3F/Konva) must therefore **not** own selection or
experiment state. They are *views*; state lives outside them.

### 5.1 Layered state model

```
┌──────────────────────────────────────────────────────────────────┐
│ ExperimentStore  (single client store; recommend Zustand)         │
│   selection:    { panel, entityKind, entityId, partPath? }        │   ← cross-panel selection
│   composition:  workload(C1) × serving(C2) × hardware(C3) draft    │   ← the runnable experiment
│   workTree:     ordered change events + dirty/saved markers        │   ← per-item & full save (§6)
│   runStatus:    control-plane readouts (status, evidence, blockers)│
└──────────────────────────────────────────────────────────────────┘
        ▲ subscribe (narrow selectors)        │ dispatch intents
        │                                      ▼
   React Flow (C1)   React Flow (C2)   R3F/Konva (C3)   Left Control Panel
```

- **One store, narrow selectors.** Zustand fits well: React Flow already uses Zustand internally and
  exposes hooks, so an app-level Zustand store is idiomatic alongside it. Each canvas subscribes only to
  the slices it renders to avoid cross-panel re-render storms.
- **Selection is a domain identity, not a renderer handle.** A pick in any panel writes
  `{panel, entityKind, entityId, partPath}` to `selection`. Other panels react: e.g. selecting a serving
  stage in C2 highlights the workload ops in C1 it affects, and selecting hardware in C3 can scope which
  mapping is shown. Renderer objects never leak across panels.
- **Edits are intents, not mutations.** Canvases dispatch intents (`addComponent`, `editPart`,
  `wireStage`, `setNodeParam`); a reducer applies them to `composition` *and* appends a node to
  `workTree`. This is what makes per-item vs full save (§6) and undo possible.
- **Coordination is derived.** Cross-highlighting and "what does this selection touch" are computed
  selectors over `composition`, not stored duplicated state.

### 5.2 Why not per-canvas local state

Local selection in each renderer would force ad-hoc syncing and break the work-tree invariant that *every*
change in *any* panel is one tracked tree. Centralizing is the cheaper correctness guarantee. (The
persisted/branching object model is ADR-0007 / [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning.md);
this doc only fixes the **client** shape.)

---

## 6. Work-tree UI patterns (tree of changes, save, diff/branch)

The Left Control Panel (the "1" of the 1:9 split) hosts the work-tree UI. This is a UI-pattern
recommendation; the storage/branch model is ADR-0007.

| Concern | Pattern | Notes |
|---|---|---|
| Tree of changes | Virtualized tree component (e.g. `react-arborist` or headless tree + virtualization) | Deep trees over many edits need windowing |
| Per-item save | Each tree node carries `dirty/saved` state + a save affordance on the node/subtree | Maps to "save an individual change/subtree" (§6) |
| Full save | Root-level save commits the whole dirty set | "save the whole tree" (§6) |
| Diff view | Side-by-side / inline diff of a change's before→after on the affected entity | For node params, hardware part edits, composition wiring |
| Branch view | Git-like branch/commit graph of experiment configs | Render with React Flow (DAG of commits) — reuse C1/C2 graph stack |
| Provenance | Each change links to the canvas + entity it came from | Lets the user trace evidence chain (brief §1) |

Pattern stance: **treat the work tree as a git-like object model surfaced as (a) a change tree, (b) a
diff pane, (c) a branch DAG.** The branch DAG can reuse the React Flow stack chosen for C1/C2, so the
work-tree branch visualization adds no new renderer.

---

## 7. Next.js integration notes (SSR / 'use client' / hydration)

All three canvases touch browser-only APIs (DOM measurement, Canvas2D, WebGL). Rules for the app-router
build:

1. **Every canvas is a Client Component.** Files for C1/C2/C3 start with `'use client'`. They cannot run
   in the server-component tree as-is.
2. **WebGL (C3) must be dynamically imported with `ssr: false`.** three.js/R3F require `window`/WebGL and
   will fail or mismatch under SSR. Pattern:
   - A client wrapper does `const Scene = dynamic(() => import('./HardwareScene'), { ssr: false })`.
   - **Note (app router):** `dynamic(..., { ssr: false })` cannot be called directly inside a *server*
     component — wrap it in a client component, then import that wrapper. (Public guidance current as of
     2026; verify against the pinned Next version — open question.)
3. **React Flow (C1/C2):** v12 supports SSR/SSG, but the interactive editor still runs client-side. Mark
   the panels `'use client'`; if any server pre-render of node geometry is wanted, use React Flow's
   server measurement support, otherwise keep it client-only for simplicity.
4. **Konva (2D fallback):** also client-only; `react-konva` should be dynamically imported with
   `ssr: false` to avoid `canvas`/`window` issues during SSR.
5. **Version pinning:** R3F v9 is the line compatible with React 19 / Next 15+; do not pin R3F v8 on a
   React 19 app. Lock exact versions in ADR-0003 and re-verify at build time.
6. **Hydration hygiene:** keep canvas DOM out of server-rendered markup (the `ssr:false` boundary handles
   this); render a stable placeholder/skeleton on the server to avoid layout-shift hydration mismatches.
7. **Lazy/code-split heavy renderers:** three.js + drei are large; load C3's bundle only when the hardware
   canvas is actually shown, so the Simulation screen's initial paint isn't blocked by WebGL.

---

## 8. Tradeoff: one renderer vs two

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| One renderer for all 3 | Single mental model, smaller bundle | C3's physical-hardware feel + LOD picking is poor in a node-graph lib; or C1/C2 lose React-component nodes if forced into a scene | Reject |
| Three renderers | Each optimal | Triple the integration/state surface; C1≈C2 duplication wasted | Reject |
| **Two renderers (graph for C1+C2, scene for C3)** | Each idiom served; shared store unifies coordination; branch DAG reuses graph stack | Two rendering stacks to maintain | **Adopt** |

---

## 9. Open Questions

Record/track in [open-questions.md](../08-research-plan/open-questions.md):

- `TODO(open-question: C3-2d-vs-3d)` — Does the 3D (R3F) hardware spike hold an interactive frame budget
  at realistic cluster×rack×tray×package×die counts with instancing+LOD, and is the team-ramp cost
  acceptable for CAW-01 v1? If not, fall back to Konva 2D.
- `TODO(open-question: c1-graph-scale)` — Max node count of a fully expanded L0 op graph in C1; threshold
  at which React Flow must yield to a canvas/WebGL graph renderer.
- `TODO(open-question: hw-assets)` — Source of hardware geometry/GLTF assets (authored vs procedurally
  generated from syntorch's HW design layer output). syntorch HW-layer output schema is not specified in
  the brief — do not assume.
- `TODO(open-question: next-version)` — Exact pinned Next.js/React/R3F versions and current app-router
  rules for `dynamic(ssr:false)` placement; re-verify the server-component wrapper requirement at build.
- `TODO(open-question: worktree-store)` — Final cross-panel store choice (Zustand vs alternative) and how
  the client work-tree maps onto the persisted model in ADR-0007 / work-tree-and-versioning.
- `TODO(open-question: webgpu)` — Whether to target the three.js WebGPU renderer (now broadly available)
  vs WebGL for C3; affects performance ceiling and browser matrix.
- `TODO(open-question: coordination-semantics)` — Exact cross-canvas highlight rules (what a C2 serving
  selection highlights in C1/C3) — needs product definition before build.

## 10. Implications for runbooks

This doc drives the following runbooks (to be authored in `10-runbooks/`):

- **RB-1xx — Canvas shell & cross-panel store**: scaffold the 1:9 Simulation screen, the Zustand
  `ExperimentStore`, selection/intent dispatch, and the `'use client'` boundaries.
- **RB-1xx — C1/C2 graph canvases**: integrate `@xyflow/react`, shared custom nodes/handles, typed
  port-grammar validation for the serving pipeline, viewport-culling perf config.
- **RB-1xx — C3 hardware spike**: build the R3F+drei spike (instancing + `<Detailed/>` LOD + GPU/raycast
  picking returning `partId`), measure against the C3 decision guard; produce the 2d-vs-3d decision.
- **RB-1xx — C3 hardware canvas (chosen path)**: full chip→…→cluster scene, drill-down, part selection,
  micro-edit forms.
- **RB-1xx — Work-tree UI**: virtualized change tree, per-item/full save, diff pane, branch DAG (reusing
  the C1/C2 graph stack).
- **RB-1xx — Next.js integration**: dynamic `ssr:false` wrappers, version pinning, code-splitting of the
  WebGL bundle, hydration-safe placeholders.

---

### Sources (public library facts grounded for this doc)

- React Flow / `@xyflow/react` performance & features — reactflow.dev/learn/advanced-use/performance, npmjs.com/package/@xyflow/react
- react-three-fiber scaling, drei `<Detailed/>`/`<Instances/>`, WebGPU availability — r3f.docs.pmnd.rs/advanced/scaling-performance, threejsresources.com
- Konva vs PixiJS (2D canvas tradeoffs, React integration, layer optimization) — konvajs.org, pkgpulse.com
- Next.js app-router `dynamic(ssr:false)` + R3F v9/React 19 notes — nextjs.org/docs, threejsresources.com/frameworks/three-js-nextjs

# ADR-0004: Canvas rendering — two renderers (graph for C1+C2, scene for C3) over one shared store

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [canvas-and-visualization-tech](../02-research/canvas-and-visualization-tech.md)
  - [ADR-0003 Frontend stack](./ADR-0003-frontend-stack.md) (Next.js server/client split, store choice)
  - [ADR-0006 Design system / open design](./ADR-0006-design-system-open-design.md) (canvas chrome consumes the same tokens)
  - [ADR-0007 Work-tree change management](./ADR-0007-change-management-worktree.md) (client work-tree maps onto persisted model)
  - [ADR-0005 Trace pipeline](./ADR-0005-trace-pipeline.md) (C1 nodes map to L0 IR `TensorNode`/`DataMovementEdge`)
  - [open-questions](../08-research-plan/open-questions.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF.md)

## Purpose

Decide **which rendering technology powers each of the three coordinated canvases** (SOURCE-BRIEF §5)
and the **shared cross-panel state model** that keeps them coordinated and feeds the work tree
(SOURCE-BRIEF §6). This ADR does **not** decide the data layer ([ADR-0002](./ADR-0002-data-layer.md)),
the persisted work-tree object model ([ADR-0007](./ADR-0007-change-management-worktree.md)), or the
design-system tool ([ADR-0006](./ADR-0006-design-system-open-design.md)); it fixes the **client-side
rendering + selection surface** those plug into.

## Context

- The three canvases are **not the same kind of picture** (SOURCE-BRIEF §5): C1 (AI Workload Flow →
  L0 IR) and C2 (Serving & Representation composition) are **directed node/edge graphs**; C3 (Hardware
  Design, chip→die→package→tray→rack→cluster) must be **"visualized like real hardware"** with
  drill-down, fine-grained part selection, and micro-edits — a deep spatial/scene problem.
- Forcing one renderer onto all three is the main trap; so is three independent renderers.
- All three panels must be **coordinated** and every change tracked in a **work tree** (SOURCE-BRIEF
  §5–§6), so selection/experiment state cannot live inside any renderer.
- Scale is modest: a single agent turn (C1) and a serving composition (C2) are **tens to low-hundreds of
  nodes**; C3 is deep but visualized tier-by-tier.
- Canvases are interactive client islands inside a Next.js server shell ([ADR-0003](./ADR-0003-frontend-stack.md));
  WebGL is strictly client-side; durable mutations go back through the core
  ([ADR-0001](./ADR-0001-product-surface.md)).

## Options considered

### C1 / C2 — node/edge graph

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **React Flow / `@xyflow/react` v12** | Purpose-built node/edge UI; **custom nodes = plain React components** (ideal for inspectable op nodes & serving-stage cards); built-in pan/zoom, multi-select, typed handles/ports, minimap; internal Zustand store with hooks; SSR support in v12 | DOM/SVG-per-node degrades past ~1–2k visible nodes | **Adopt (C1+C2)** |
| Cytoscape.js | Mature graph-theory layouts/algorithms | Wrapper not idiomatic React; styling-driven nodes, weak for rich editable bodies | Reject |
| Sigma.js / Graphology | WebGL, very large graphs | Exploration-oriented, weak for editable port pipelines | Reject |
| D3-force / hand-rolled SVG | Total control | Rebuild selection/pan/zoom/ports/a11y from scratch | Reject |

### C3 — hardware design (2D vs 3D)

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **react-three-fiber (R3F) + drei (3D)** | "Looks like real hardware"; scene-graph maps 1:1 to chip→…→cluster nesting; `<Detailed/>` LOD, `<Instances/>` (thousands of identical dies in one draw call), raycast/GPU picking | WebGL client-only (SSR discipline); steeper ramp; needs instancing discipline | **Adopt, gated on spike** |
| Konva / `react-konva` (2D) | Best React 2D-canvas integration; per-shape events for picking; layer separation | CPU canvas; schematic feel, not physical realism | **Fallback if spike fails** |
| PixiJS (2D) | GPU-batched, fast large 2D | Game-oriented, less idiomatic React | Reject |
| Raw three.js / babylon.js | Max control / batteries-included | Lose React reconciliation / heavier, weaker R3F-idiomatic story | Reject |

### Shared state

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **One Zustand `ExperimentStore`, narrow selectors** | Idiomatic alongside React Flow's internal Zustand; renderer-agnostic; supports intent dispatch + work-tree append | One store to design carefully (selector discipline) | **Adopt** |
| Per-canvas local state | Simple per panel | Breaks coordination + work-tree-tracks-every-change invariant; ad-hoc syncing | Reject |

## Decision

**Two renderers, not one or three, unified by a single client store.**

1. **Canvas 1 and Canvas 2 → `@xyflow/react` (React Flow v12).** Shared custom nodes/handles, theming,
   and selection plumbing. C1 op nodes map to L0 IR `TensorNode`/`DataMovementEdge`
   ([ADR-0005](./ADR-0005-trace-pipeline.md)). C2 uses **typed source/target handles** and validates
   connections against the pipeline grammar `input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+ SST)`.
2. **Canvas 3 → react-three-fiber + drei (3D), with a Konva 2D fallback gated on a spike.** Use
   `<Detailed/>` LOD + `<Instances/>` + frustum culling + **subtree load-on-drill-down** (never mount
   the whole cluster at full detail). **Picking always returns a domain `partId`** (chip/die/package/
   tray/rack/cluster + component path), never a raw renderer object.
   **Decision guard:** a time-boxed spike renders a representative cluster (realistic
   rack×tray×package×die counts) with instancing + LOD and measures interaction latency + pick accuracy.
   If it cannot hold an interactive frame budget *or* team-ramp is too high for CAW-01 v1, **fall back to
   Konva 2D** (schematic/exploded view), trading physical realism for lower SSR/asset cost.
3. **One client store: a Zustand `ExperimentStore`** holding `selection {panel, entityKind, entityId,
   partPath?}`, `composition` (workload × serving × hardware draft), `workTree` (ordered change events +
   dirty/saved markers), and `runStatus`. Renderers are **views** that subscribe to narrow slices.
   - **Selection is domain identity, not a renderer handle** — a pick in any panel writes
     `{panel,entityKind,entityId,partPath}`; other panels react via derived selectors.
   - **Edits are intents, not mutations** — canvases dispatch `addComponent`/`editPart`/`wireStage`/
     `setNodeParam`; a reducer applies them to `composition` **and appends a change event to `workTree`**.
     This is the client face of the persisted model in [ADR-0007](./ADR-0007-change-management-worktree.md).
   - **Coordination is derived**, not duplicated state.
4. **Work-tree visualization reuses the graph stack.** The Left Control Panel hosts a virtualized change
   tree + diff pane + a **branch DAG rendered with React Flow** — no new renderer.
5. **Next.js integration rules:** every canvas is a Client Component (`'use client'`); C3 WebGL is
   `dynamic(() => import(...), { ssr: false })` wrapped in a client component (cannot be called directly
   in a server component); Konva (if chosen) is also `ssr:false`; pin R3F v9 for React 19 / Next 15+;
   render stable placeholders to avoid hydration shift; code-split the heavy WebGL bundle so it loads
   only when C3 is shown.

## Consequences

- **Easy:** each idiom is served by its best tool; C1≈C2 share primitives; the branch DAG adds no
  renderer; durable mutations stay funneled through intents → work tree → core; selection is portable
  across panels because it is domain identity.
- **Hard / accepted:** two rendering stacks to maintain; WebGL/SSR discipline and 3D team-ramp for C3
  (mitigated by the Konva fallback and the spike guard); React Flow node-count ceiling (~1–2k visible)
  requires progressive disclosure (group nodes, viewport culling) and is a future trigger to a
  canvas/WebGL graph renderer for any single oversized view.
- **Revisit triggers:** C3 spike result (3D vs 2D); a fully-expanded L0 op graph exceeding the React
  Flow visible-node budget; targeting the three.js **WebGPU** renderer over WebGL.

## Open questions / revisit triggers

- `TODO(open-question: C3-2d-vs-3d)` — does the R3F spike hold frame budget at realistic counts with
  instancing+LOD, and is ramp acceptable for v1? If not, Konva 2D.
- `TODO(open-question: c1-graph-scale)` — max node count of a fully-expanded L0 op graph; React Flow →
  canvas/WebGL threshold.
- `TODO(open-question: hw-assets)` — source of HW geometry/GLTF (authored vs procedurally generated from
  syntorch's HW-design layer output; schema not specified — do not assume).
- `TODO(open-question: next-version)` — pinned Next.js/React/R3F versions and current `dynamic(ssr:false)`
  placement rules; re-verify at build.
- `TODO(open-question: worktree-store)` — final cross-panel store choice and how the client work-tree
  maps onto the persisted model in [ADR-0007](./ADR-0007-change-management-worktree.md).
- `TODO(open-question: webgpu)` — three.js WebGPU vs WebGL for C3.
- `TODO(open-question: coordination-semantics)` — exact cross-canvas highlight rules (what a C2 serving
  selection highlights in C1/C3) — needs product definition before build.

## Implications for runbooks

- **RB-1xx — Canvas shell & cross-panel store**: scaffold the 1:9 Simulation screen, the Zustand
  `ExperimentStore`, selection/intent dispatch, `'use client'` boundaries.
- **RB-1xx — C1/C2 graph canvases**: `@xyflow/react`, shared custom nodes/handles, typed port-grammar
  validation, viewport-culling perf config.
- **RB-1xx — C3 hardware spike**: R3F+drei spike (instancing + `<Detailed/>` LOD + picking → `partId`);
  measure against the decision guard; produce the 2d-vs-3d decision.
- **RB-1xx — C3 hardware canvas (chosen path)**: full chip→…→cluster scene, drill-down, part selection,
  micro-edit forms.
- **RB-1xx — Work-tree UI**: virtualized change tree, per-item/full save, diff pane, branch DAG (reuse
  the C1/C2 graph stack), wired to [ADR-0007](./ADR-0007-change-management-worktree.md).
- **RB-1xx — Next.js integration**: `dynamic ssr:false` wrappers, version pinning, WebGL code-splitting,
  hydration-safe placeholders.

# Canvas Rendering Implementation — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [state-management.md](./state-management.md), [../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow.md](../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow.md), [../05-caw01-simulation-control-plane/canvas-3-hw-design.md](../05-caw01-simulation-control-plane/canvas-3-hw-design.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The concrete rendering tech per canvas and the Next.js integration constraints. UX/data per canvas lives in
`05-*`; this doc is the implementation contract.

## Renderer choice (ADR-0004)

| Canvas | Renderer | Why |
| --- | --- | --- |
| **C1 AI workload flow** | `@xyflow/react` (React Flow v12) | node/edge graph, custom nodes, pan/zoom |
| **C2 serving/representation** | `@xyflow/react` | typed source/target handles + grammar validation |
| **C3 hardware design** | `react-three-fiber` + `drei` (3D) | physical hierarchy; **Konva 2D fallback** gated on a spike |

Two renderers, not three; C1 and C2 share React Flow infrastructure (custom nodes, theming, selection).

## React Flow (C1/C2)

- Shared custom node types + handle components; C2 handles are **typed** and validate connections against the
  pipeline grammar ([../05-caw01-simulation-control-plane/serving-and-representation-layer.md](../05-caw01-simulation-control-plane/serving-and-representation-layer.md)).
- C1 op nodes carry L0 field refs so the inspector can show size/lifetime.
- Selection plumbs into the shared store (`selection.nodeId`).

## react-three-fiber (C3)

- **LOD** via `<Detailed/>`, **instancing** via `<Instances/>`, frustum culling.
- **Load-on-drill-down**: mount a subtree's detail only when entered; never mount the whole cluster at full detail.
- **Picking → `partId`**: raycaster hits resolve to a domain `partId`, never a raw mesh
  ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)).
- **Spike gate**: a time-boxed spike renders a realistic cluster (rack×tray×package×die counts) and measures
  interaction latency + pick accuracy. Fail → fall back to Konva 2D.

## Next.js integration

- Canvases are client components, **dynamically imported with `ssr: false`** to avoid server hydration of
  WebGL/canvas ([ui-architecture-nextjs.md](./ui-architecture-nextjs.md)).
- WebGL context lifecycle managed on mount/unmount; one r3f `<Canvas>` for C3.
- Heavy assets/geometry lazy-loaded per drill-down.

## Performance budget (targets, validate in spike)

- Interactive frame budget on a representative cluster — TODO(open-question: exact fps/latency targets).
- Graph sizes for C1/C2 expected small-to-medium (an agent-turn), so React Flow default perf is sufficient.

## Open questions

- 3D vs 2D for C3 ships per the spike outcome — TODO(open-question).
- Whether to virtualize very large agent-turn graphs in C1 — defer until needed.

## Implications for runbooks

Phase-2 canvas runbooks: build C1/C2 on React Flow first (lower risk), run the C3 3D spike as a gated runbook,
then build C3 on the chosen renderer.

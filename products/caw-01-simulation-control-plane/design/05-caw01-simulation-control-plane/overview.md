# CAW-01 Overview (Folder Map)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** every doc in this folder; [../00-overview/vision.md](../00-overview/vision.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The index and mental model for the CAW-01 Simulation Control Plane folder. It states the screen anatomy and
points to each detailed spec. It does not duplicate those specs.

## Screen anatomy

```
┌───────────────────────────────────────────────────────────────────────┐
│ NAV BAR:  Simulation │ Module Design │ User │ Setting                   │
├──────────┬────────────────────────────────────────────────────────────┤
│ CONTROL  │  WORKSPACE  (right "9")                                      │
│ PANEL    │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────────┐   │
│ (left    │  │ Canvas 1    │ │ Canvas 2    │ │ Canvas 3             │   │
│  "1")    │  │ AI Workload │ │ Serving &   │ │ Hardware Design      │   │
│          │  │ Flow        │ │ Representation│ (chip→…→cluster)     │   │
│ run/stop │  │ (agent-turn)│ │ (compose)   │ │ (3D, drill, edit)    │   │
│ save     │  └─────────────┘ └─────────────┘ └──────────────────────┘   │
│ status   │                  ── coordinated by one work-tree ──          │
└──────────┴────────────────────────────────────────────────────────────┘
        1   :                          9
```

## The unit

One reproducible experiment: `(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection`.
The three canvases author the left side of that arrow; the engine produces the right side.

## Document map

| Concern | Doc |
| --- | --- |
| The memory-annotated IR (the critical surface) | [l0-ir-schema.md](./l0-ir-schema.md) |
| Choosing serving framework × representation × simulator | [serving-and-representation-layer.md](./serving-and-representation-layer.md) |
| syntorch capture → Chakra → ASTRA-sim, normalized to L0 | [trace-pipeline-syntorch-chakra.md](./trace-pipeline-syntorch-chakra.md) |
| Run lifecycle, fidelity tiers, comparable projection | [simulation-engine-and-projection.md](./simulation-engine-and-projection.md) |
| Canvas 1 — agent-turn flow | [canvas-1-ai-workload-flow.md](./canvas-1-ai-workload-flow.md) |
| Canvas 2 — serving/representation composition | [canvas-2-serving-representation.md](./canvas-2-serving-representation.md) |
| Canvas 3 — HW hierarchy design | [canvas-3-hw-design.md](./canvas-3-hw-design.md) |
| Control panel + run lifecycle UX | [control-panel-and-run-lifecycle.md](./control-panel-and-run-lifecycle.md) |
| Work-tree UX across canvases | [change-management-worktree.md](./change-management-worktree.md) |

Rendering implementation for the canvases is in [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md);
storage of IR/work-tree is in [../04-data-layer/](../04-data-layer/).

## Open questions

The ServingSim/ASTRA-sim ordering and syntorch capture altitude (see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).

## Implications for runbooks

This folder maps 1:1 onto the phase-2 (canvases), phase-3 (engine), and phase-4 (trace) runbooks.

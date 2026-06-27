# Canvas 3 — Hardware Design — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [serving-and-representation-layer.md](./serving-and-representation-layer.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md), [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Spec the UX + data mapping for Canvas 3: designing and visualizing the full physical hardware hierarchy like
real hardware, with drill-down, part selection, and micro-level editing. 3D rendering specifics are in
[../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md).

## The hierarchy

```
cluster ─► rack ─► tray ─► package ─► die ─► chip ─► component
```

Each level is a `hw_node` (self-referential adjacency, `spec JSONB`, `part_id`)
([../04-data-layer/data-model.md](../04-data-layer/data-model.md)).

## What it shows

A hardware-like 3D scene (react-three-fiber + drei): the user sees the cluster and drills down into a rack →
tray → package → die → chip, then selects a specific component/part.

## Interaction model

| Action | Result |
| --- | --- |
| Drill-down | load the selected subtree's detail on demand (never mount the whole cluster at full detail) |
| **Pick a part** | returns a domain **`partId`** (level + path + component), never a raw renderer object ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)) |
| Edit a part | change `spec` fields; micro-level changes at fine granularity |
| Add a component | insert a child `hw_node` under the selected node |

Every edit/add produces a **change_blob** of kind `c3_part` ([change-management-worktree.md](./change-management-worktree.md)).

## Performance approach (from ADR-0004)

- LOD (`<Detailed/>`), instancing (`<Instances/>`), frustum culling.
- **Load-on-drill-down**: subtree detail mounts only when entered.
- A time-boxed **spike** validates an interactive frame budget + pick accuracy on a realistic cluster; if it
  fails, fall back to a **Konva 2D** representation (decision guard in [ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)).

## Feeds downstream

The designed hierarchy feeds:
- the **syntorch HW design layer** (custom chip/structure assumptions),
- the **ASTRA-sim / SST** compute/network/memory config (via `hw_config_ref` in `SimulationConfig`),
- the L0 movement tiers (host/device/tier names derive from the hardware model).

## Coordination

Selecting a part can highlight where it executes the workload (Canvas 1) and which serving/sim path uses it
(Canvas 2) via the shared store.

## Open questions

- The exact `spec` field set per level (which are first-class vs opaque) — promote by the L0 principle; TODO(open-question).
- Whether v1 ships 3D or the 2D fallback depends on the spike outcome — TODO(open-question).

## Implications for runbooks

Phase-2 Canvas-3 runbook runs the 3D spike first (gate), then builds drill-down + pick→partId + edit→change_blob;
the hardware `spec` flows into the phase-3/4 engine config.

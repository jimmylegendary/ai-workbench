# RB-023: Canvas 3 — 3D feasibility spike (GATE)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-012]
- Implements design: [canvas-3-hw-design.md](../../05-caw01-simulation-control-plane/canvas-3-hw-design.md), [canvas-rendering-implementation.md](../../06-frontend/canvas-rendering-implementation.md), [../../01-decisions/ADR-0004-canvas-rendering.md](../../01-decisions/ADR-0004-canvas-rendering.md)
- Produces: a time-boxed spike result resolving OQ-08 (3D r3f vs Konva 2D fallback)

## Objective

Decide, with evidence, whether Canvas 3 ships as 3D (react-three-fiber) or the Konva 2D fallback, by rendering a
realistic hardware cluster and measuring interaction latency + pick accuracy. **This is a gate for RB-024.**

## Preconditions

- [ ] RB-012 complete. This spike is intentionally throwaway code in a scratch route.

## Steps

1. **Do:** In a scratch route, render a representative cluster (realistic rack×tray×package×die×chip counts) with r3f + drei using `<Instances/>` + `<Detailed/>` LOD + frustum culling + load-on-drill-down.
   **Verify:** `view:` the cluster renders and can be navigated.
2. **Do:** Implement raycaster picking that resolves a hit to a domain `partId` (level + path + component).
   **Verify:** `test:` picking a known part returns the correct `partId` (pick accuracy).
3. **Do:** Measure interaction latency / frame budget during drill-down + selection on the representative scene.
   **Verify:** `cmd:`/`view:` record fps + interaction latency against the target (TODO(open-question: exact target)).
4. **Do:** Record the decision: PASS → 3D for RB-024; FAIL → Konva 2D fallback for RB-024. Update OQ-08 status.
   **Verify:** `view:` decision recorded in [../../08-research-plan/open-questions.md](../../08-research-plan/open-questions.md) (OQ-08).

## Acceptance criteria

- [ ] Representative cluster renders with LOD/instancing + load-on-drill-down.
- [ ] Picking returns correct `partId`.
- [ ] A PASS/FAIL decision is recorded with measured numbers; OQ-08 updated.

## Rollback / safety

Throwaway scratch route — delete after deciding. Do not let spike code become source of truth (RK-3, ADR-0006).

## Hand-off

RB-024 builds Canvas 3 on the **decided** renderer (3D or 2D fallback).

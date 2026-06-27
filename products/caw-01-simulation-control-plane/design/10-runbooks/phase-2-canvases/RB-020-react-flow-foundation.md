# RB-020: React Flow foundation (shared for Canvas 1 & 2)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-012]
- Implements design: [canvas-rendering-implementation.md](../../06-frontend/canvas-rendering-implementation.md), [../../01-decisions/ADR-0004-canvas-rendering.md](../../01-decisions/ADR-0004-canvas-rendering.md)
- Produces: `FlowCanvas` wrapper + shared custom node/handle infra + store binding

## Objective

A reusable React Flow (`@xyflow/react` v12) foundation that Canvas 1 and Canvas 2 build on: custom nodes,
typed handles, theming from tokens, selection plumbed to the shared store, and Next.js client-only mounting.

## Preconditions

- [ ] RB-012 (store + panel wiring) complete.

## Steps

1. **Do:** Add `@xyflow/react`; create `FlowCanvas` as a client component dynamically imported with `ssr: false`.
   **Verify:** `view:` an empty pannable/zoomable canvas renders inside a workspace slot.
2. **Do:** Build shared custom node + handle components themed via DTCG tokens; expose a `validate?(connection)` hook for typed handles.
   **Verify:** `view:` a sample custom node renders themed; an invalid connection is rejected by the hook.
3. **Do:** Bind selection to `store.selection` (selecting a node sets `selection.nodeId`).
   **Verify:** `test:` selecting a node updates the store; other panels can read it.
4. **Do:** Add basic interactions (multi-select, fit-view, minimap optional) and an inspector slot driven by selection.
   **Verify:** `view:` selecting a node opens the inspector slot.

## Acceptance criteria

- [ ] `FlowCanvas` mounts client-only and renders without SSR/hydration errors.
- [ ] Custom nodes/handles are themed and support a connection-validation hook.
- [ ] Selection is plumbed to the shared store.

## Rollback / safety

UI-only; revert the component to roll back. No persistence here.

## Hand-off

Canvas 1 (RB-021) and Canvas 2 (RB-022) extend `FlowCanvas` with domain nodes/handles and edit→change_blob.

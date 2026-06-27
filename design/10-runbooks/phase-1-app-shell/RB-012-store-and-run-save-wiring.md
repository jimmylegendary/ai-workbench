# RB-012: Zustand store + run/save wiring

- Status: ready
- Phase: phase-1-app-shell
- Depends on: [RB-011]
- Implements design: [state-management.md](../../06-frontend/state-management.md), [control-panel-and-run-lifecycle.md](../../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md), [api-surface.md](../../07-backend-api/api-surface.md)
- Produces: the single Zustand store + working Run/Stop and Per-item/Full save controls

## Objective

The single Zustand store with slices (selection, c1, c2, c3, worktree, run, layout) and a working control panel:
Run/Stop wired to `RunService` (against a stub engine) and Per-item/Full save wired to `WorkTreeService`.

## Preconditions

- [ ] RB-011 (layout) complete. A stub engine adapter returning canned status is acceptable here.

## Steps

1. **Do:** Create `useWorkbenchStore` with the slices in [state-management.md](../../06-frontend/state-management.md). Cross-canvas `selection` is shared.
   **Verify:** `test:` store updates propagate; selection slice round-trips.
2. **Do:** Wire **Run/Stop** in `RunControls` to a Server Action → `RunService.start/stop`; subscribe `RunStatus` to the SSE route (RB-010).
   **Verify:** `view:` Run shows streaming status (queued→running→done) from the stub engine; Stop transitions to stopped.
3. **Do:** Wire **Per-item save** and **Full save** in `SaveControls` to `WorkTreeService.saveItem/saveAll`; show dirty state.
   **Verify:** `test:` a stubbed edit marks dirty; Full save creates a commit; Per-item save commits only a subtree.
4. **Do:** Render `ProjectionReadout`/`EvidenceList`/`NextActionHint` bound to store (empty until engine produces data).
   **Verify:** `view:` sections bind to store and update on state change.

## Acceptance criteria

- [ ] One store coordinates the panel; cross-canvas selection works.
- [ ] Run/Stop drive `RunService` with streaming status.
- [ ] Per-item and Full save create the right commits via `WorkTreeService`.

## Rollback / safety

Uses a stub engine; no real runs yet. Revert store/controls to roll back. Optimistic edits revert on save failure.

## Hand-off

Canvases (phase-2) attach their slices to this store; the engine (phase-3/4) replaces the stub so Run produces
real projections/evidence into the already-bound readouts.

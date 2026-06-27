# RB-011: Nav bar + Simulation 1:9 layout

- Status: ready
- Phase: phase-1-app-shell
- Depends on: [RB-010]
- Implements design: [layout-and-navigation.md](../../06-frontend/layout-and-navigation.md), [component-inventory.md](../../06-frontend/component-inventory.md), [../../05-caw01-simulation-control-plane/overview.md](../../05-caw01-simulation-control-plane/overview.md)
- Produces: `NavBar`, `AppShell`, `SplitPane`, Simulation screen skeleton

## Objective

The system nav bar and the Simulation screen's resizable 1:9 split (control panel : workspace) with a workspace
container for the three canvases + a work-tree strip placeholder.

## Preconditions

- [ ] RB-010 (app shell) complete.

## Steps

1. **Do:** Build `NavBar` (Simulation / Module Design / User / Setting) in the server layout; highlight active route.
   **Verify:** `view:` nav renders on every route; active state correct.
2. **Do:** Build `SplitPane` (Resizable) and place it on the Simulation route at a default **1:9** ratio with min widths.
   **Verify:** `view:` left "1" and right "9" regions render; divider drags within min bounds.
3. **Do:** Left region: a `ControlPanel` placeholder with section slots (Run / Status / Projection / Save / Evidence / Next action) per [control-panel-and-run-lifecycle.md](../../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md).
   **Verify:** `view:` all sections present as placeholders.
4. **Do:** Right region: a `Workspace` container with three canvas slots (focus+rails per OQ; default arrangement) and a work-tree strip placeholder.
   **Verify:** `view:` three labeled canvas slots + work-tree strip render.

## Acceptance criteria

- [ ] Nav bar on all routes with correct active state.
- [ ] Simulation screen shows a draggable 1:9 split with min widths.
- [ ] Control-panel section slots and three canvas slots + work-tree strip are present (placeholders).

## Rollback / safety

UI-only; revert components to roll back. Layout state is UI-local, not persisted to the work-tree.

## Hand-off

Canvas runbooks (phase-2) mount real canvases into the three slots; the control-panel wiring runbook (RB-012)
fills the left sections.

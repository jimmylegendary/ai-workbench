# RB-024: Canvas 3 — hardware design build

- Status: blocked
- Phase: phase-2-canvases
- Depends on: [RB-023]   # blocked until the 3D-vs-2D decision (OQ-08) is recorded
- Implements design: [canvas-3-hw-design.md](../../05-caw01-simulation-control-plane/canvas-3-hw-design.md), [../../04-data-layer/data-model.md](../../04-data-layer/data-model.md)
- Produces: `HardwareScene` + `PartInspector`, drill-down, pick→partId, edit/add→change_blob

## Objective

Build Canvas 3 on the renderer chosen by RB-023: design + visualize chip→die→package→tray→rack→cluster, drill
down, select a part (`partId`), and apply micro-level edits / add components, persisting to the `hw_node` tree.

## Preconditions

- [ ] RB-023 complete and the renderer decision (OQ-08) recorded.

## Steps

1. **Do:** Implement `HardwareScene` on the decided renderer; load the `hw_node` tree (RB-002) with load-on-drill-down.
   **Verify:** `view:` the saved hierarchy renders; drilling loads subtree detail on demand.
2. **Do:** Implement picking → `partId`; bind to `store.selection.partId`.
   **Verify:** `test:` selecting a part sets the correct `partId` in the store.
3. **Do:** Build `PartInspector`: edit a part's `spec` fields (micro-level) and add a child component (`hw_node` insert).
   **Verify:** `test:` an edit/add updates the `hw_node` tree and emits a `c3_part` change_blob.
4. **Do:** Feed the hardware config reference into `SimulationConfig.hw_config_ref` so Canvas 2 / RunService can require it.
   **Verify:** `test:` a composed experiment carries the hardware config ref.

## Acceptance criteria

- [ ] Full hierarchy renders + drills down on the decided renderer.
- [ ] Picking returns `partId`; edits/adds persist to `hw_node` and emit `c3_part` change_blobs.
- [ ] Hardware config is referenceable by Canvas 2 / RunService.

## Rollback / safety

Edits are work-tree-versioned (reversible). Revert the component to roll back the build.

## Hand-off

The engine (phase-4) consumes the hardware config for ASTRA-sim/SST and the syntorch HW design layer.

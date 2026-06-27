# RB-022: Canvas 2 — serving & representation composition

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-020]
- Implements design: [canvas-2-serving-representation.md](../../05-caw01-simulation-control-plane/canvas-2-serving-representation.md), [serving-and-representation-layer.md](../../05-caw01-simulation-control-plane/serving-and-representation-layer.md)
- Produces: Canvas 2 with typed-handle nodes, grammar validation, serialize→SimulationConfig

## Objective

Canvas 2 lets the user wire LLM model → serving framework → representation layer → Chakra exporter → ASTRA-sim,
validated against the pipeline grammar, and serializes a valid graph into a `SimulationConfig`.

## Preconditions

- [ ] RB-020 complete. `RegistryService` returns model/serving/strategy catalogs (stub ok).

## Steps

1. **Do:** Define node types (LLM model, serving{vLLM|LLMServingSim}, representation{torch|syntorch}, Chakra exporter, ASTRA-sim{analytical|+SST}) with **typed source/target handles**.
   **Verify:** `view:` nodes render from the registry; handles are typed.
2. **Do:** Implement the **grammar validation** (legal wirings from [serving-and-representation-layer.md](../../05-caw01-simulation-control-plane/serving-and-representation-layer.md)); reject illegal edges with an inline reason; require a hardware config before ASTRA-sim.
   **Verify:** `test:` legal wirings accepted; e.g. syntorch-without-vLLM-frontend and exporter-after-astrasim rejected.
3. **Do:** Serialize a valid graph to a `SimulationConfig` (serving_choice, representation, simulator_path, backend, hw_config_ref).
   **Verify:** `test:` a valid graph produces a schema-valid `SimulationConfig`.
4. **Do:** On edit emit `intent_event` + `c2_wiring` change_blob; mark dirty.
   **Verify:** `test:` wiring edit creates a change_blob.

## Acceptance criteria

- [ ] Typed handles + grammar validation reject illegal wirings with reasons.
- [ ] A valid composition serializes to a `SimulationConfig`.
- [ ] Edits produce `c2_wiring` change_blobs.

## Rollback / safety

UI; revert to roll back. Invalid configs cannot be run (RunService validates again).

## Hand-off

Canvas 2 produces the `SimulationConfig` that `RunService.start` consumes; combined with Canvas 1 + Canvas 3 it
forms a runnable experiment.

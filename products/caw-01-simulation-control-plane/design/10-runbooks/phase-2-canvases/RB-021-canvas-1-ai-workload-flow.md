# RB-021: Canvas 1 — AI workload flow (agent-turn)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-020]
- Implements design: [canvas-1-ai-workload-flow.md](../../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow.md), [l0-ir-schema.md](../../05-caw01-simulation-control-plane/l0-ir-schema.md)
- Produces: Canvas 1 with step/op/tensor nodes, L0-field inspector, edit→change_blob

## Objective

Canvas 1 renders a single agent-turn as a flow graph (step → op nodes, tensor ports, flow edges) that maps to
L0 `TensorNode`/`DataMovementEdge`, with an inspector showing L0 fields and edits producing `c1_node` change_blobs.

## Preconditions

- [ ] RB-020 (React Flow foundation) complete.

## Steps

1. **Do:** Define node types `StepNode`, `OpNode`, tensor-port handles, and `FlowEdge` per [canvas-1-ai-workload-flow.md](../../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow.md).
   **Verify:** `view:` an example agent-turn renders with expand/collapse on step nodes.
2. **Do:** Add the inspector: selecting an `OpNode` shows L0 op fields (op_class, strategy_id); selecting a tensor shows size/dtype/lifetime.
   **Verify:** `view:` op/tensor selection shows the correct L0 fields (UC-4).
3. **Do:** Support two sources: author mode (user-defined `WorkloadModel`) and inspect mode (from a run's L0 IR).
   **Verify:** `test:` loading a sample L0 renders the same graph it was lowered from.
4. **Do:** On edit (e.g. change strategy_id / workload param) emit an `intent_event` + a `c1_node` change_blob; mark dirty.
   **Verify:** `test:` an edit creates a change_blob and dirties the work-tree.

## Acceptance criteria

- [ ] Agent-turn renders as step/op/tensor/edge graph.
- [ ] Inspector maps a visual op/tensor to its L0 fields and back.
- [ ] Edits produce `c1_node` change_blobs and dirty state.

## Rollback / safety

UI; revert to roll back. Inspect mode is read-only; author edits are reversible via work-tree.

## Hand-off

Canvas 1 can author/inspect the workload half of an experiment; its L0 mapping is the contract the engine
(phase-3) lowers into.

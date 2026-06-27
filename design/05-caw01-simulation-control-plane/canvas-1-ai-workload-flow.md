# Canvas 1 — AI Workload Flow (agent-turn) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [l0-ir-schema.md](./l0-ir-schema.md), [canvas-2-serving-representation.md](./canvas-2-serving-representation.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Spec the UX + data mapping for Canvas 1: visualizing a **single agent-turn** as an inspectable flow graph that
maps to the L0 IR. Rendering (React Flow) is in [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md).

## What it shows

One **agent-turn** = the unit of AI workload. The canvas renders the turn as a directed graph of steps/ops and
their data movement — the "what is the workload" view that ultimately becomes the L0 op/tensor/movement graph.

## Node & edge types

| Element | Represents | Maps to L0 |
| --- | --- | --- |
| **Step node** | a phase of the turn (e.g. prefill, decode, tool-call) | a subgraph of `ops` |
| **Op node** | a single operation | L0 `op` (op_class, strategy_id) |
| **Tensor port** | a tensor in/out of an op | L0 `TensorNode` (size, dtype, lifetime) |
| **Flow edge** | data movement / dependency | L0 `DataMovementEdge` (bytes, tiers) |

Selecting an op node reveals its L0 fields; selecting a tensor shows size/lifetime (UC-4 in
[../00-overview/personas-and-use-cases.md](../00-overview/personas-and-use-cases.md)).

## Interactions

- Pan/zoom, expand/collapse step nodes, inspect node detail.
- Edits (e.g. change a strategy_id, adjust a workload param) produce a **change_blob** of kind `c1_node`
  ([change-management-worktree.md](./change-management-worktree.md)).
- Read-mostly for captured runs; editable for authoring a `WorkloadModel`.

## Source of the graph

| Mode | Graph from |
| --- | --- |
| Author | user-defined `WorkloadModel` (agent-turn spec) |
| Inspect | a completed run's L0 IR (synthetic or simulation axis) |

## Coordination

A selection here can highlight the corresponding serving stage in Canvas 2 and the executing hardware in
Canvas 3 via the shared store ([../06-frontend/state-management.md](../06-frontend/state-management.md)).

## Open questions

How much agent-turn structure is authored by hand vs imported from a captured L0 — TODO(open-question).

## Implications for runbooks

Phase-2 Canvas-1 runbook builds the React Flow graph + the L0-field inspector + edit→change_blob wiring.

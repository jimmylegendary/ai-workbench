# Canvas 2 — Serving & Representation — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [serving-and-representation-layer.md](./serving-and-representation-layer.md), [canvas-1-ai-workload-flow.md](./canvas-1-ai-workload-flow.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Spec the UX + data mapping for Canvas 2: composing, for a chosen LLM model, the serving framework ×
representation layer × simulator path, with live validation against the pipeline grammar. The grammar itself
is in [serving-and-representation-layer.md](./serving-and-representation-layer.md).

## What it shows

A node/flow composition where the user wires the run topology:

```
[LLM model] ─► [serving: vLLM | LLMServingSim] ─► [representation: torch | syntorch]
   ─► [Chakra exporter] ─► [ASTRA-sim: analytical | +SST] ─► [→ L0]
```

## Node & handle model (typed)

| Node | Typed output handle | Legal target |
| --- | --- | --- |
| LLM model | `model` | serving.in |
| serving (vLLM/ServingSim) | `serving` | representation.in / sim.in |
| representation (torch/syntorch) | `repr` | exporter.in |
| Chakra exporter | `chakra.et` | astrasim.in |
| ASTRA-sim | `metrics`,`et` | lowering.in |

Connections are validated against the grammar (typed source/target handles); illegal wirings are rejected with
an inline reason ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)).

## Result of a valid composition

A validated graph serializes to a **`SimulationConfig`** ([../04-data-layer/data-model.md](../04-data-layer/data-model.md)):
serving_choice, representation, simulator_path, backend, hw_config_ref. This is what `RunService.start` consumes.

## Interactions

- Drag to wire; invalid edges show why (grammar violation, missing hardware config).
- Selecting a node shows its config (e.g. ASTRA-sim backend = analytical).
- An edit produces a **change_blob** of kind `c2_wiring` ([change-management-worktree.md](./change-management-worktree.md)).

## Coordination

Requires a Canvas-3 hardware config before ASTRA-sim/SST can run; surfaces that requirement inline. Selecting a
serving stage can highlight the related agent-turn steps in Canvas 1.

## Open questions

Whether to expose syntorch's per-op cost-model substitution as a node option (tied to the ordering open
question) — TODO(open-question) ([../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).

## Implications for runbooks

Phase-2 Canvas-2 runbook builds the typed-handle graph, grammar validation, and the serialize→SimulationConfig step.

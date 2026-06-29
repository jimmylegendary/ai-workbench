# Canvas 1 — AI Workload Flow (agent-turn harness) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [l0-ir-schema.md](./l0-ir-schema.md), [canvas-2-serving-representation.md](./canvas-2-serving-representation.md), [canvas-3-hw-design.md](./canvas-3-hw-design.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Spec the UX + data mapping for Canvas 1: visualizing a **single agent-turn** at the **harness-engineering
level** — the top-level orchestration where LLM calls, tool calls, routing, and memory are wired as a graph.
This is NOT a torch-op / L0-tensor view; L0 op/tensor/movement detail lives *below* the harness level (revealed
by fractal drill-down into an LLM/tool step). Rendering (React Flow) is in
[../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md).

## What it shows

One **agent-turn** = the unit of AI workload, drawn as a directed graph of **harness steps**: user input →
router/planner → LLM call → tool call(s) → memory read/write → output, with branches. Each step is a node; edges
are turn control/data flow.

## Node & edge types

| Element | Represents |
| --- | --- |
| **Step node** (`kind`) | a harness step — `io` · `router` · `llm` · `tool` · `memory` |
| **Flow edge** | control/data flow between steps in the turn |
| **Fractal interior** | Ctrl/⌘+click an `llm` step → its interior (prompt assembly → decode → token stream → parse); a `tool` step → (args build → execute → result parse). Deeper still reaches the L0 op/tensor graph. |

`kind` is shown with a **categorical** color (a dedicated palette, off the reserved status hues). Selecting a
node reveals its detail; drilling reveals its interior logic (fractal).

## Execution location (server vs client)

Every step node carries an **execution location**: `server` or `client`.

- **`llm` steps execute on the server** — they are invoked **through the Canvas-2 serving framework** (the
  server-side SW stack), which runs in the **data center** (Canvas-3 "server" root).
- **All other steps execute on the client** — they read the **client HW** (Canvas-3 "client" root) and do
  simple compute or look up / derive a value from given data.

This is the load-bearing link across the three canvases: a C1 node's location selects which C3 root (data
center vs client) it maps to, and `llm` nodes additionally bind to a C2 serving path. Default policy: `llm` →
server; everything else → client (overridable per node).

## Interactions

- Pan/zoom, select a step, **Ctrl/⌘+click to drill into a step's interior** (fractal), breadcrumb/Back/Reset to ascend.
- Edits (change a step param, retarget execution location, rewire) produce a **change_blob** of kind `c1_node`
  ([change-management-worktree.md](./change-management-worktree.md)).
- Read-mostly for captured runs; editable for authoring a `WorkloadModel`.

## Source of the graph

| Mode | Graph from |
| --- | --- |
| Author | user-defined `WorkloadModel` (agent-turn harness spec) |
| Inspect | a completed run (the harness trace; drill reaches the captured L0 IR) |

## Coordination

A selection/location here highlights the corresponding serving stage in Canvas 2 and the executing hardware
(server data center / client) in Canvas 3 via the shared store
([../06-frontend/state-management.md](../06-frontend/state-management.md)).

## Open questions

- How much agent-turn structure is authored by hand vs imported from a captured trace — TODO(open-question).
- Per-node override UI for execution location, and validation (e.g. an `llm` forced to client) — TODO(open-question).

## Implications for runbooks

Phase-2 Canvas-1 runbook builds the React Flow harness graph + step inspector + fractal drill + execution-location
tagging + edit→change_blob wiring.

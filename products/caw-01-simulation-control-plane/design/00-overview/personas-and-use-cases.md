# Personas & Use Cases — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision.md](./vision.md), [scope-and-non-goals.md](./scope-and-non-goals.md), [../05-caw01-simulation-control-plane/overview.md](../05-caw01-simulation-control-plane/overview.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define who CAW-01 serves and the concrete walkthroughs the product must support. Each use case exercises the
three canvases, the control panel, and the work-tree, and ends in a preserved evidence artifact.

## Personas

| Persona | Goal | What they need from CAW-01 |
| --- | --- | --- |
| **Domain expert (Jimmy)** | Move/add/test design-space axes; defend memory-device implications | Fast composition of workload × serving × hardware; comparable projections; evidence trail |
| **Workload / network team** | Understand how a workload stresses memory/traffic | Canvas 1 agent-turn view; L0 capacity-peak + traffic rollups |
| **Memory-device team** | Turn workload pressure into device requirements | `MemoryProductRequirement` / `ArchitectureProposal` derived from runs |
| **AI-builder agent** | Build/extend CAW-01 from runbooks; later drive it via MCP/CLI | Stable `@caw/core` contract; MCP tools; deterministic runbooks |
| **Reviewer (Jimmy)** | Approve strategic conclusions | Separation of evidence vs generated conclusion; trust-ladder status |

## Use cases

### UC-1 — Compose and run the first comparison experiment
1. In **Canvas 2**, pick an LLM model, select a ServingSim-style path and a syntorch-style path.
2. In **Canvas 1**, confirm the agent-turn flow that defines the workload.
3. In the **control panel**, run. Engine produces Chakra traces for both axes; both lower into one **L0 IR**.
4. View a **comparable projection** (capacity peak + rough traffic) of the two axes side by side.
5. **Full save** → one experiment commit in the work-tree.
**Done when:** two axes appear as one experiment row with a comparable projection and preserved inputs.

### UC-2 — Design a custom hardware hierarchy and re-run
1. In **Canvas 3**, build chip → die → package → tray → rack → cluster.
2. Drill into a specific package/die/chip; select a component (`partId`); apply a micro-level edit / add a component.
3. Re-run from the control panel; observe how the projection changes.
4. **Per-item save** of just the hardware subtree.
**Done when:** a hardware change produces a new, comparable projection without re-authoring workload/serving.

### UC-3 — Branch a what-if configuration
1. From the work-tree, create a **branch** off the current experiment.
2. Change a serving choice (Canvas 2) or a tiling/partitioning strategy id.
3. Run both branches; compare projections.
**Done when:** two branches are independently runnable and comparable; the branch DAG is visible.

### UC-4 — Inspect an agent-turn and map it to L0
1. Open **Canvas 1**; expand the agent-turn into its op/data-movement graph.
2. Inspect a node's tensor size/lifetime; trace it to its `TensorNode` and `DataMovementEdge` in L0.
**Done when:** the user can move from a visual op to its L0 schema fields and back.

### UC-5 — Produce evidence for a paper/patent
1. Open a completed experiment; review the **trust-ladder status** (e.g. syntorch trace vs A100/OTel golden).
2. Export the comparable projection + cited sources/assumptions as an evidence artifact.
**Done when:** an artifact exists whose claims point to evidence (run outputs + sources), ready to **export** to CAW-03 (a separate, independent paper/patent product).

## Anti-use-cases (v1)

Chatting for answers without producing an artifact; running production serving; multi-user concurrent editing;
publishing to a public surface. These are explicitly out of scope (see [scope-and-non-goals.md](./scope-and-non-goals.md)).

## Open questions

How much op-level structure the real OTel anchor can realistically provide for UC-5 — tracked in
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

UC-1 is the acceptance scenario for the first end-to-end runbook chain; UC-2/UC-3 drive the Canvas-3 and
work-tree runbooks; UC-5 drives the evidence/projection runbook.

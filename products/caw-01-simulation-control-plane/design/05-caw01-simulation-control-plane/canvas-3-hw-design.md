# Canvas 3 — Hardware (Digital Twin) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [serving-and-representation-layer.md](./serving-and-representation-layer.md), [canvas-1-ai-workload-flow.md](./canvas-1-ai-workload-flow.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation.md), [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Canvas 3 visualizes the physical infrastructure as a **digital twin**: recognizable, rendered hardware objects
(not abstract boxes/tiles) that you **drill into**, and inside each you keep seeing more digital-twin objects —
**fractal** all the way down. It is both a *viewer* and a *composer* of the hardware the workload runs on.

> **Scope note.** The **digital-twin visualization direction** + the **Client/Server entry** + the
> **workload↔HW execution mapping** are the active design. The **data-center-as-root expansion** (composable
> cluster types, cluster CRUD, save-as-module) is **forward design (v-next)** — captured here so the data model
> and UI don't have to be reshaped later; not required for the first implementation.

## Entry: Client or Server

The canvas starts by choosing **Client** or **Server** — two independent HW configurations:

- **Server → IS the data center (root).** Entering "server" drills into a **data center** that contains many
  **clusters**. This is where server-side workload (the LLM, behind the serving framework) physically runs.
- **Client → the client device HW.** A separate subtree (the machine running the non-LLM workload steps).

## Hierarchy

```
Server  = DATA CENTER (root)
          └─ cluster*  (composable; one data center holds many, of mixed types)
               └─ rack ─► tray ─► package ─► die ─► chip ─► component
Client  = client device (root)
          └─ board ─► soc/package ─► die ─► chip ─► component
```

**Cluster types (forward, composable):** `gpu` · `cpu` · `cxl` (memory pooling) · `storage` · `cxmt`
(special-purpose memory) · other special-purpose · **custom**. A data center is composed of any mix the user
wants; each cluster's **rack architecture** is designed inside it. Every level is still a `hw_node`
(self-referential adjacency, `spec JSONB`, `part_id`); `data_center` and `client` become new root levels and
`cluster` gains a `cluster_type` ([../04-data-layer/data-model.md](../04-data-layer/data-model.md)).

## Visualization (digital twin)

- Each node renders as a **digital-twin object** — a representative graphic that *looks like* the real thing
  (a cluster/rack/tray/die/chip form), with depth/shading, not a flat labelled rectangle.
- **Drill-down (Ctrl/⌘+click)** zooms an object to fill the canvas and reveals its **interior as more
  digital-twin objects** (rack → trays → packages → dies …), recursively. Breadcrumb / Back / Reset to ascend.
- **Target renderer = 3D (react-three-fiber + drei)** per [ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md),
  with a **2D-stylized twin** (isometric SVG/CSS, shaded) as the gated fallback / first pass. The pick contract
  is identical either way: a pick returns a domain **`partId`**, never a renderer object.

## Composition & modules (forward)

- Inside **Server**, the user can **add / change / delete clusters**, and design rack architecture within each.
- Editing **any object** (cluster / tray / die / chip / …) can be **saved as a reusable module**.
- Conversely, a module designed from scratch in **Module Design** can be **imported** and dropped into the
  composition (bidirectional). Modules are versioned, parameterized HW subtrees
  ([../04-data-layer/data-model.md](../04-data-layer/data-model.md)).

## Interaction model

| Action | Result |
| --- | --- |
| Choose Client / Server | sets the root subtree (server = data center) |
| Drill-down (Ctrl/⌘+click) | zoom into the object; mount its interior digital-twin on demand (never the whole tree) |
| **Pick a part** | returns a domain **`partId`** (level + path), never a raw renderer object ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)) |
| Edit a part | change `spec` fields; micro-level edits |
| Add / delete (forward) | insert/remove a child `hw_node` (e.g. add a cluster to the data center) |
| **Save as module** (forward) | persist the edited subtree as a reusable, versioned module |
| Import module (forward) | drop a Module-Design module into the composition |

Every edit/add produces a **change_blob** of kind `c3_part` ([change-management-worktree.md](./change-management-worktree.md)).

## Feeds downstream

The designed hierarchy feeds the **syntorch HW design layer**, the **ASTRA-sim / SST** compute/network/memory
config (via `hw_config_ref` in `SimulationConfig`), and the L0 movement tiers (host/device/tier names derive
from the hardware model).

## Coordination (with Canvas 1 execution location)

A Canvas-1 workload node carries an **execution location** (server | client). **LLM steps execute on the
server** (the data center, reached through the Canvas-2 serving framework); **other steps execute on the
client** ([canvas-1-ai-workload-flow.md](./canvas-1-ai-workload-flow.md)). Selecting a part can highlight where
it executes the workload (C1) and which serving/sim path uses it (C2) via the shared store.

## Open questions

- Exact `spec` field set per level + per cluster type (first-class vs opaque) — promote by the L0 principle; TODO(open-question).
- 3D vs 2D-stylized twin for v1 — depends on the ADR-0004 spike; the digital-twin *direction* is fixed, the renderer is not.
- Data-center composition + cluster CRUD + save-as-module: forward scope; sequence vs the first implementation — TODO(open-question).

## Implications for runbooks

Phase-2 Canvas-3 runbook runs the 3D spike first (gate), then builds Client/Server entry → drill-down digital
twin → pick→partId → edit→change_blob. Data-center composition / cluster-CRUD / save-as-module are a later
phase once the root expansion lands.

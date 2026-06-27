# Component Inventory — CAW-01 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [layout-and-navigation.md](./layout-and-navigation.md), [open-design-integration.md](./open-design-integration.md), [canvas-rendering-implementation.md](./canvas-rendering-implementation.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The catalog of components CAW-01 v1 needs, each with purpose, a props sketch, and where it is used. Built from
shadcn/Radix primitives themed by DTCG tokens ([open-design-integration.md](./open-design-integration.md)).

## Shell & navigation

| Component | Purpose | Props sketch | Used in |
| --- | --- | --- | --- |
| `NavBar` | top system menu | `items[], active` | every screen |
| `AppShell` | nav + content slot | `children` | layout |
| `SplitPane` | 1:9 resizable split | `ratio, min[], onResize` | Simulation screen |

## Control panel

| Component | Purpose | Props sketch |
| --- | --- | --- |
| `RunControls` | run/stop/configure | `state, onRun, onStop, onConfigure` |
| `RunStatus` | per-axis progress/state | `perAxis[]` |
| `ProjectionReadout` | comparable projection | `projection` |
| `SaveControls` | per-item / full save | `dirty, onSaveItem, onSaveAll` |
| `EvidenceList` | artifacts + readiness | `artifacts[], trust` |
| `NextActionHint` | the honest next step | `action` |

## Canvases

| Component | Purpose | Props sketch |
| --- | --- | --- |
| `FlowCanvas` | shared React Flow wrapper (C1/C2) | `nodes, edges, onSelect, validate?` |
| `OpNode` / `TensorPort` | C1 op + tensor visuals | `op` / `tensor` |
| `ServingNode` + typed handles | C2 wiring nodes | `kind, config, handles` |
| `HardwareScene` | r3f scene for C3 | `rootNode, onPick(partId)` |
| `PartInspector` | edit a selected part | `partId, spec, onEdit, onAddChild` |

## Work-tree

| Component | Purpose | Props sketch |
| --- | --- | --- |
| `WorkTreeView` | three-subtree tree + dirty markers | `tree, dirty` |
| `DiffView` | ref/branch diff | `refA, refB, diff` |
| `BranchBar` | branch DAG + switch/create | `branches, head, onBranch` |
| `HistoryList` | commits | `commits[]` |

## Shared primitives (from shadcn/Radix)

`Button, Tabs, Dialog, Tooltip, Select, Resizable, ScrollArea, Badge, Toast` — themed via DTCG tokens.

## Inspector pattern

Selecting in any canvas opens a context-appropriate inspector (`OpNode`→L0 fields, `PartInspector`→spec),
driven by the shared `selection` ([state-management.md](./state-management.md)).

## Open questions

Whether the work-tree is a strip, a drawer, or a dedicated tab — leaning strip/drawer; TODO(open-question)
([layout-and-navigation.md](./layout-and-navigation.md)).

## Implications for runbooks

Each phase-1/phase-2 UI runbook builds a named subset of this inventory; the inventory is the UI completeness
checklist for v1.

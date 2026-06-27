# Dependency Graph — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases.md), [../10-runbooks/README.md](../10-runbooks/README.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The dependency DAG between phases and major components, so the runbooks run in a valid order and parallel work is
visible.

## Phase DAG

```
phase-0 (foundations: monorepo, @caw/core, data layer, design system)
   │
   ▼
phase-1 (app shell: nav, 1:9 layout, store, run/save wiring)
   │
   ├───────────────► phase-2 (canvases: C1/C2, C3 spike→build, work-tree UI)
   │
   └───────────────► phase-3 (engine: L0 IR, lowering, projection)
                          │
                          ▼
                       phase-4 (trace pipeline: syntorch capture, Chakra exporter, ASTRA-sim)
                          │
                          ▼
                       phase-5 (MCP + CLI surfaces)
```

phase-2 and phase-3 can proceed in **parallel** after phase-1 (the UI does not block the engine and vice versa);
they converge for Milestone 1.

## Component-level dependencies

```
@caw/core contract ──► everything (single contract)
data layer (phase-0) ──► work-tree UI, runs, IR storage
L0 IR schema ──► Chakra→L0 lowering ──► projection ──► evidence export
Chakra reference round-trip (T1) ──► syntorch capture ──► Chakra exporter ──► ASTRA-sim integration
Canvas-3 3D spike (OQ-08) ──► Canvas-3 build
hardware config (Canvas 3) ──► ASTRA-sim/SST run
serving grammar (Canvas 2) ──► SimulationConfig ──► RunService.start
```

## Critical path to Milestone 1

```
phase-0 ─► phase-1 ─► phase-3 (L0 + lowering + projection)
                   └─► phase-4 (T1 round-trip ─► syntorch ─► Chakra ─► ASTRA-sim)
   ─► T2 L0 round-trip ─► comparable projection ─► UC-1 demo
```

Canvas-3 3D and MCP/CLI are **off** the Milestone-1 critical path (deliberately deferred).

## Hard gates

| Gate | Blocks |
| --- | --- |
| Boundary/CI lint (phase-0) | all feature code |
| T1 Chakra→ASTRA-sim round-trip | syntorch wiring (phase-4) |
| Canvas-3 3D spike (OQ-08) | Canvas-3 build |
| T2 L0 round-trip | Milestone 1 sign-off |

## Open questions

Whether phase-2 fully parallels phase-3 given a single builder's budget — TODO(open-question), see
[risks-and-mitigations.md](./risks-and-mitigations.md).

## Implications for runbooks

The runbook `Depends on:` fields must reflect this DAG exactly; no runbook starts before its gate is green.

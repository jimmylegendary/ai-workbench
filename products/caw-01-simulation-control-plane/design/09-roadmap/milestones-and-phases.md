# Milestones & Phases — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [dependency-graph.md](./dependency-graph.md), [risks-and-mitigations.md](./risks-and-mitigations.md), [../10-runbooks/README.md](../10-runbooks/README.md), [../00-overview/vision.md](../00-overview/vision.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Map the build into phases that align 1:1 with the runbook folders, each with goal and entry/exit criteria. The
first vertical slice (Milestone 1) is the north-star acceptance.

## Phases (↔ runbook folders)

| Phase | Folder | Goal | Exit criteria |
| --- | --- | --- | --- |
| **0 Foundations** | `phase-0-foundations` | Monorepo, `@caw/core` contract, data layer, design system | Boundaries + CI lint green; SQLite schema migrates; tokens build |
| **1 App shell** | `phase-1-app-shell` | Nav bar, 1:9 layout, store, run/save wiring | Simulation screen renders; Server Actions reach core; SSE status route works |
| **2 Canvases** | `phase-2-canvases` | C1/C2 (React Flow), C3 (3D spike→build), work-tree UI | All three canvases edit→change_blob; work-tree save/branch/diff works |
| **3 Simulation engine** | `phase-3-simulation-engine` | L0 IR, lowering, projection | T2 L0 round-trip passes; projection renders |
| **4 Trace pipeline** | `phase-4-trace-pipeline` | syntorch capture, Chakra exporter, ASTRA-sim | T1 reference round-trip passes; synthetic axis produces L0 |
| **5 Persistence & API** | `phase-5-persistence-and-api` | MCP + CLI surfaces | Same ops reachable via MCP/CLI |

## Milestones

### Milestone 1 — First comparable experiment (the vertical slice)
The smallest thing that proves value ([../00-overview/vision.md](../00-overview/vision.md)):
1. L0 IR defined (phase-3).
2. One agent-turn run through a ServingSim-style path **and** a syntorch-style path (phase-3/4).
3. Both export to Chakra, lower into one L0 (phase-3/4).
4. Capacity-peak + traffic computed; **comparable projection** rendered (phase-3).
5. Inputs/assumptions/outputs preserved as an evidence row (phase-0 data + phase-3).
**Acceptance:** T2 passes and UC-1 is demoable.

### Milestone 2 — Custom hardware re-run
Canvas-3 hardware change → re-run → changed projection (UC-2). Requires phase-2 (C3) + phase-3/4.

### Milestone 3 — What-if branches
Branch a config, run both, compare (UC-3). Requires phase-2 work-tree + projection.

### Milestone 4 — Trust ladder
T3/T4 golden tests + trust-rung surfacing; evidence export for CAW-03. Requires real A100/OTel baselines.

## Sequencing note (budget-aware)

Phases can be built incrementally; Milestone 1 deliberately spans only phase-0/1/3/4 essentials so a credible
demo exists before C3 3D and MCP/CLI polish.

## Open questions

Exact ordering of phase-2 (C3 spike) vs phase-3 (engine) — they can proceed in parallel after phase-1;
TODO(open-question) ([dependency-graph.md](./dependency-graph.md)).

## Implications for runbooks

Each phase folder's runbooks must collectively satisfy that phase's exit criteria; Milestone 1 is the acceptance
chain across phase-0→4.

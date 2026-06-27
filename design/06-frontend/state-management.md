# State Management — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [ui-architecture-nextjs.md](./ui-architecture-nextjs.md), [canvas-rendering-implementation.md](./canvas-rendering-implementation.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define the single Zustand store that coordinates the three canvases + control panel + work-tree, and the rule
for what is client state vs server source of truth.

## One store, sliced

```ts
useWorkbenchStore = {
  selection: { canvas: 'c1'|'c2'|'c3', nodeId?: string, partId?: string },  // cross-canvas selection
  c1: { graph, dirtyBlobs },        // agent-turn flow
  c2: { graph, validation },        // serving/representation wiring
  c3: { sceneCursor, loadedSubtrees, partId },  // HW drill-down state
  worktree: { head, dirty, branches, diff },
  run: { status, perAxis, projection },
  layout: { focus, dividerRatio },  // UI-local, not versioned
}
```

Cross-canvas coordination is the reason for a single store ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)):
a `selection` change in one canvas highlights the related elements in the others.

## Client state vs server source of truth

| State | Lives in | Persisted via |
| --- | --- | --- |
| Selection, focus, divider, transient drill-down | Zustand (client only) | not persisted |
| Edits in progress (dirty) | Zustand + `intent_event` | committed via Server Actions → WorkTreeService |
| Committed config, runs, IR, metrics | server (DB) | source of truth; loaded into the store |

The store is a **cache + interaction layer**, never the source of truth for committed data.

## Optimistic updates

- Edits apply optimistically in the store and emit an `intent_event`; a failed save reverts the optimistic change.
- Run status is server-streamed (Route Handler), not optimistic.

## Selection model

- `partId` (Canvas 3 picking) and `nodeId` (Canvas 1/2) are the cross-canvas keys
  ([../05-caw01-simulation-control-plane/canvas-3-hw-design.md](../05-caw01-simulation-control-plane/canvas-3-hw-design.md)).
- Selecting a hardware part can highlight the ops that run on it (C1) and the serving path that uses it (C2).

## Open questions

Whether to add a persistence middleware (localStorage) for layout/selection across reloads — minor;
TODO(open-question).

## Implications for runbooks

Phase-1 creates the store skeleton + slices; each canvas runbook (phase-2) wires its slice and the shared
selection.

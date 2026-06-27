# Control Panel & Run Lifecycle (UX) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [simulation-engine-and-projection.md](./simulation-engine-and-projection.md), [change-management-worktree.md](./change-management-worktree.md), [../06-frontend/layout-and-navigation.md](../06-frontend/layout-and-navigation.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Spec the left **"1"** control panel of the Simulation screen: running, saving, and the run-status/evidence
readouts. The engine lifecycle is in [simulation-engine-and-projection.md](./simulation-engine-and-projection.md);
the layout ratio is in [../06-frontend/layout-and-navigation.md](../06-frontend/layout-and-navigation.md).

## Sections (top to bottom)

| Section | Controls | Backed by |
| --- | --- | --- |
| **Run** | Run / Stop / Configure (axes, backend tier) | `RunService.start/stop` |
| **Status** | per-axis progress, state (queued/running/done/failed/stopped) | `RunService.status` (stream) |
| **Projection** | comparable projection readout (capacity peak, traffic, latency, deltas, trust rung) | `EvidenceService.projection/trustStatus` |
| **Save** | **Per-item save** / **Full save** + message | `WorkTreeService.saveItem/saveAll` |
| **Evidence** | artifact list (Chakra/OTel/native) + readiness | `EvidenceService` |
| **Honest next action** | the single most useful next step (control-plane bias) | derived |

## Run flow (UX)

1. User composes across canvases → control panel shows "ready to run" when grammar + hardware config are satisfied.
2. **Run** → status streams per axis; canvases can reflect live progress.
3. On **done** → projection + evidence populate; "honest next action" updates (e.g. "validate against OTel golden").

## Save flow (UX)

- **Per-item save**: saves only the selected subtree (e.g. hardware change) → a subtree commit.
- **Full save**: commits the whole experiment tree with a message.
- Both feed the work-tree ([change-management-worktree.md](./change-management-worktree.md)).

## Control-plane bias

The panel foregrounds run status, evidence completeness, open questions, blockers, artifact readiness, and the
next honest action — **not** a chat box ([../00-overview/vision.md](../00-overview/vision.md)).

## States & guards

- Run disabled until composition is valid (grammar + hardware present).
- Stop only while running; Save always available (saves current tree state).
- Failed runs surface the error + a retry that preserves the config.

## Open questions

Whether "honest next action" is rule-derived in v1 or later LLM-assisted — v1 = rule-derived; TODO(open-question).

## Implications for runbooks

Phase-1 builds the panel shell + run/save buttons wired to core services; phase-3 fills the projection/evidence
readouts once the engine produces them.

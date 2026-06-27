# Scope & Non-Goals — CAW-01 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision.md](./vision.md), [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md), [../08-research-plan/research-plan.md](../08-research-plan/research-plan.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Draw a hard boundary around **CAW-01 version 1** so the build stays a small vertical slice that proves
workflow semantics, not a broad platform. Anything not listed *in scope* is deferred by default.

## In scope (CAW-01 v1)

| Area | v1 commitment |
| --- | --- |
| Shell | Top nav bar (Simulation / Module Design / User / Setting); Simulation screen with 1:9 control-panel:workspace split |
| Canvas 1 | Visualize a single agent-turn as a flow graph that maps to L0 `TensorNode`/`DataMovementEdge` |
| Canvas 2 | Compose serving framework × representation layer × simulator path; validate wiring against the pipeline grammar |
| Canvas 3 | Design + visualize chip→die→package→tray→rack→cluster; drill-down, part selection (`partId`), micro-edit/add |
| Control panel | Run / stop / configure; run-status state machine; evidence + projection readouts; per-item & full save |
| Work-tree | git-like change_blob/tree/commit/ref over all three canvases; branches for what-if |
| IR | **L0 fill level only** — op-level graph + tensor size/lifetime → capacity peak + rough traffic |
| Axes | Run the synthetic (syntorch→Chakra) and simulation (LLMServingSim+ASTRA-sim) axes **in parallel into one L0** |
| Engine | Out-of-process Python service; **ASTRA-sim analytical backend** as default fidelity tier |
| Surfaces | Web app primary; thin MCP + CLI adapters over the same `@caw/core` |
| Data | Start on **SQLite kept Postgres-portable**; large trace blobs on filesystem by path/URI |
| Design | Open-design system: shadcn/ui + Radix + Tailwind v4 themed from DTCG tokens |

## Out of scope / explicit non-goals (v1)

- **L1 / L2 fill levels** (memory-tier residency, kernel-level tiling schedules) — schema-ready but not populated in v1.
- **Real OTel integration as a live axis** — OTel is only a *validation anchor* concept in v1; no production telemetry wiring.
- **ns-3 / SST high-fidelity network backends** — analytical backend only; high-fidelity behind a flag, later.
- **Full vLLM embedding / production serving** — v1 uses a thin vLLM-shaped harness around syntorch, not a deployed vLLM.
- **MoE, disaggregated serving, power modeling** (LLMServingSim 2.x features) — deferred.
- **Neo4j / dedicated graph DB** — graphs stay in Postgres (adjacency + recursive CTE) until a measured hot path forces it.
- **Dedicated vector store** — pgvector in-DB only, and only when semantic search is a real need.
- **Real-time multi-writer collaboration / CRDT** — single-expert scale; deferred ([ADR-0007](../01-decisions/ADR-0007-change-management-worktree.md)).
- **Public website / REST API surface (CAW-04)** and **paper/patent product (CAW-03)** — separate independent products that may *consume CAW-01's exports*, not part of CAW-01 v1.
- **General knowledge repository** (ingesting external Sources / Claims / Notes / Concepts / Interests / OpenQuestions) — this is a **separate product (CAW-02)**, not part of CAW-01's data model. CAW-01 keeps only the lean run-evidence + provenance it needs for its own runs.
- **Generative-UI as source of truth** — allowed only as a one-off scaffolding spike ([ADR-0006](../01-decisions/ADR-0006-design-system-open-design.md)).

## Deferred but schema-anticipated

These are *not built* in v1 but the data model and IR must not preclude them: L1/L2 fill, real OTel rows,
additional serving frameworks, additional fidelity backends, multi-user branches, and a clean **export
boundary** through which CAW-01's run-evidence artifacts can be consumed by other independent products
(e.g. CAW-02's knowledge repository, CAW-03's paper/patent product). The broad knowledge model itself stays
out of CAW-01 — it lives in CAW-02.

## Guardrails (inherited)

- No confidential company data in public-facing outputs.
- Never conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate; claims must point to evidence.

## Open questions

Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) — notably the
ServingSim/ASTRA-sim ordering and the exact syntorch capture altitude.

## Implications for runbooks

Each non-goal becomes a "do NOT build yet" guard inside the relevant runbook; the in-scope table is the
checklist the phase-0→phase-5 runbooks must collectively satisfy.

# Open Questions (Tracked) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan.md](./research-plan.md), [validation-and-golden-tests.md](./validation-and-golden-tests.md), all ADRs in [../01-decisions/](../01-decisions/)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The single tracked list of open questions aggregated from the research docs, the ADRs, and the design docs.
Each row names the owning decision and the milestone by which it should resolve.

## Tracked questions

| ID | Question | Owner | Resolve by | Status |
| --- | --- | --- | --- | --- |
| OQ-01 | **ServingSim/ASTRA-sim ordering**: LLMServingSim already embeds ASTRA-sim — does syntorch replace its per-op cost model or run parallel into one L0? | [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md) | phase-3/4 | open (v1: parallel) |
| OQ-02 | syntorch **capture altitude** (`__torch_dispatch__` / custom dispatcher / own recorder)? | ADR-0005 | phase-4 | open |
| OQ-03 | Does syntorch emit **standard Chakra `.et`** directly or native + exporter? per-rank file convention? | ADR-0005 | phase-4 | open |
| OQ-04 | Which **Chakra `et_def.proto` revision** is the integration target? | ADR-0005 | phase-4 | open |
| OQ-05 | **vLLM version** pin (V0 vs V1) + exact torch API surface syntorch must satisfy? | ADR-0005 | phase-0/4 | open |
| OQ-06 | Does Chakra ET carry **tensor size/lifetime**, or need an extension/sidecar to reach L0? | ADR-0005/[ADR-0002](../01-decisions/ADR-0002-data-layer.md) | phase-3 | open |
| OQ-07 | Tensor **lifetime** by DAG walk only, or alloc/free events from syntorch? | ADR-0005 | phase-3 | open |
| OQ-08 | **Canvas-3 3D feasibility** — r3f interactive budget vs Konva 2D fallback? | [ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md) | phase-2 spike | open |
| OQ-09 | **Engine transport** for TS⇆Python seam (stdio / HTTP / queue)? | [ADR-0003](../01-decisions/ADR-0003-frontend-stack.md) | phase-4 | open (v1: HTTP) |
| OQ-10 | **L0 storage**: rows (queryable) vs blob+index at L0 scale? | ADR-0002 | phase-3 | open |
| OQ-11 | Data-layer scale triggers: when add **pgvector / Neo4j**? | ADR-0002 | ongoing | open |
| OQ-12 | **Trust-ladder thresholds** (T3/T4 tolerances) — require A100/OTel baselines | [validation](./validation-and-golden-tests.md) | phase-3 | open |
| OQ-13 | Which **fidelity backend** (ns-3/SST) and when becomes required vs analytical default? | ADR-0005 | later | open |
| OQ-14 | **Design authoring**: Penpot vs hand-authored DTCG; DTCG→Tailwind build tool? | [ADR-0006](../01-decisions/ADR-0006-design-system-open-design.md) | phase-0 | open |
| OQ-15 | Work-tree: expose **3-way merge** in v1 or branch+diff only? | [ADR-0007](../01-decisions/ADR-0007-change-management-worktree.md) | phase-2 | open (lean: no) |
| OQ-16 | **MCP scoping** (read-only vs mutating) + skill packaging manifest? | [ADR-0001](../01-decisions/ADR-0001-product-surface.md) | phase-5 | open |
| OQ-17 | "Honest next action" rule-derived vs LLM-assisted in v1? | [control-panel](../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md) | v1 | open (lean: rules) |
| OQ-18 | How much **agent-turn structure** is hand-authored vs imported from captured L0? | [canvas-1](../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow.md) | phase-2 | open |
| OQ-19 | Monorepo vs sibling repo for the Python `engine/`? | [repo-structure](../03-architecture/repo-structure.md) | phase-0 | open (lean: monorepo) |
| OQ-20 | Auth/session model for User/Setting in single-user v1? | [ui-architecture](../06-frontend/ui-architecture-nextjs.md) | phase-1 | open |

## Process

- A question is closed by recording the decision in its owning ADR/doc and flipping Status here to `resolved`.
- New questions discovered during build are appended with the next OQ id.

## Implications for runbooks

Gating questions (OQ-08 spike, OQ-04 Chakra rev, OQ-05 vLLM pin) must be resolved by their phase's first runbook
before dependent work proceeds.

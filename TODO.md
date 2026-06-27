# Company AI Workbench TODO

Status legend: `inbox`, `active`, `blocked`, `parked`, `done`.

## Program Goal

Ship six **independent products** (CAW-01..06), each self-contained under `products/`, with
no shared runtime substrate. Cross-product use is an explicit export boundary, not a shared
platform. CAW-01 is the first product to build.

## Top-Level TODOs

| ID | Product | Status | Current Objective | Next Concrete Step |
| --- | --- | --- | --- | --- |
| CAW-01 | Simulation control plane | active | Build the standalone instrument: real/synthetic/sim trace axes -> memory-annotated IR -> metrics -> comparable projection. | Define L0 IR schema and run one ServingSim-style output plus one syntorch-style output through a paper validation. |
| CAW-02 | Knowledge repository | parked | Standalone product to preserve sources, traces, insights, decisions, and experiments with append/retrieve/skill-wrap v0 before claiming continual learning. | Define source/claim/evidence/experiment/decision schema and private/public boundaries. |
| CAW-03 | Paper/patent harness | parked | Standalone harness agent that converts validated evidence (imported across an export boundary) into papers/patents. | Track P1/P2/P3 paper ladder and claim/evidence gates; not the first build. |
| CAW-04 | Tips/skills website + REST API | parked | Standalone read/API product for validated workflows and skills. | Defer until there is validated skill/workflow content to publish. |
| CAW-05 | Trend collection | parked | Standalone early-warning radar for related-work/novelty around memory-centric DSE, DeepStack/Rhu lines, memory devices for LLM, and TTT. | Create source shortlist and first related-work ledger. |
| CAW-06 | AI future / TTT research | parked | Standalone research product treating TTT-class inference as a workload axis (write traffic, gradients, optimizer state, new memory-device requirements). | Define TTT experiment scout and writeback-traffic schema fields. |

### Dropped (not active goals)

- **CAW-07 — Shared substrate.** Dropped. There is no shared runtime substrate; each product
  is independent. Cross-product reuse is an export boundary only.
- **CAW-08 — Periodic research loop.** Dropped as a program-level active goal.

## Immediate MVP Bias

Build **CAW-01 first** as a standalone product. Do not build platform scaffolding for the
other five; each will be implemented independently when it is its turn.

The first useful artifact should be a company-demoable simulation control plane with its own
knowledge/evidence/run registry behind it (internal to CAW-01).

More specifically, the first technical validation should be:

1. L0 memory-annotated IR schema.
2. One ServingSim-style output mapped into it.
3. One syntorch-style output mapped into it.
4. Manual capacity/traffic sanity projection.
5. A comparison view that can later become a paper/patent evidence artifact.

## Critical Path (CAW-01)

1. `CAW-01`: syntorch vs A100/OTel golden validation plan.
2. `CAW-01`: L0 IR paper validation.
3. `CAW-01`: source-agnostic control plane around ServingSim first.
4. `CAW-01`: add syntorch as second source adapter when vLLM connection is ready.
5. `CAW-01`: add TTT-class workload axis after the trust ladder is credible.

Other products (CAW-02..06) start only after CAW-01 has a credible first slice, and each is
designed and built on its own.

## Guardrails

- Do not store confidential company data in public-facing outputs.
- Do not conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate.
- Prefer small vertical slices that prove workflow semantics over broad platform scaffolding.
- Treat automatic research as proposal/update generation; Jimmy remains the reviewer for strategic decisions.
- Keep products independent: no shared runtime substrate; cross-product use only via explicit export boundaries.
</content>

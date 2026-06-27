# Company AI Workbench TODO

Status legend: `inbox`, `active`, `blocked`, `parked`, `done`.

## Program Goal

Build a company-side AI workbench that turns Jimmy's workload/team knowledge, simulation pipeline, writing workflows, trend research, and future-AI experiments into one inspectable, reusable operating system.

## Top-Level TODOs

| ID | Area | Status | Current Objective | Next Concrete Step |
| --- | --- | --- | --- | --- |
| CAW-01 | Simulation control plane | active | Build the core instrument: real/ synthetic/sim trace axes -> memory-annotated IR -> metrics -> comparable projection. | Define L0 IR schema and run one ServingSim-style output plus one syntorch-style output through a paper validation. |
| CAW-02 | Knowledge repository | active | Preserve sources, traces, insights, decisions, and experiments with append/retrieve/skill-wrap v0 before claiming continual learning. | Define source/claim/evidence/experiment/decision schema and private/public boundaries. |
| CAW-03 | Paper/patent harness | parked | Convert validated control-plane evidence into papers/patents after the first projection and trust ladder are credible. | Track P1/P2/P3 paper ladder and claim/evidence gates, but do not make this the first build. |
| CAW-04 | Tips/skills website + REST API | parked | Publish validated workflows and skills later as a read/API surface over the substrate. | Defer until internal skill/workflow registry has validated content. |
| CAW-05 | Trend collection automation | active | Build a narrow early-warning radar for related-work/novelty protection around memory-centric DSE, DeepStack/Rhu lines, memory devices for LLM, and TTT. | Create source shortlist and first related-work ledger. |
| CAW-06 | AI future / TTT research automation | active | Treat TTT-class inference as a future workload axis that can introduce write traffic, gradients, optimizer state, and new memory-device requirements. | Define TTT experiment scout and writeback-traffic schema fields. |
| CAW-07 | Shared substrate | active | Keep all six areas on one shared substrate rather than separate products. | Maintain `architecture.md` and module boundaries. |
| CAW-08 | Periodic research loop | active | Run scheduled OpenClaw research/design updates into this folder. | Keep cron job enabled and review weekly outputs. |

## Immediate MVP Bias

Prioritize `CAW-01` + `CAW-05` + `CAW-06` with enough `CAW-02/CAW-07` to preserve evidence and avoid throwaway implementation.

The first useful artifact should be a company-demoable simulation control plane with a real knowledge/evidence/run registry behind it.

More specifically, the first technical validation should be:

1. L0 memory-annotated IR schema.
2. One ServingSim-style output mapped into it.
3. One syntorch-style output mapped into it.
4. Manual capacity/traffic sanity projection.
5. Related-work radar entry showing which claims are novel versus threatened.

## Critical Path

1. `CAW-01`: syntorch vs A100/OTel golden validation plan.
2. `CAW-01`: L0 IR paper validation.
3. `CAW-05`: narrow weekly radar for DeepStack, Minsoo Rhu / MC-DLA, memory-centric DSE, memory devices for LLM, and TTT writeback traffic.
4. `CAW-01`: source-agnostic control plane around ServingSim first.
5. `CAW-01`: add syntorch as second source adapter when vLLM connection is ready.
6. `CAW-06`: add TTT-class workload axis after the trust ladder is credible.

## Guardrails

- Do not store confidential company data in public-facing outputs.
- Do not conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate.
- Prefer small vertical slices that prove workflow semantics over broad platform scaffolding.
- Treat automatic research as proposal/update generation; Jimmy remains the reviewer for strategic decisions.

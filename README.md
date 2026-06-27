# Company AI Workbench

This folder tracks Jimmy's company-side AI leverage program.

The six named efforts are not separate products. Treat them as six surfaces on one shared company AI workbench/control-plane substrate:

1. End-to-end simulation platform control plane web app.
2. Team/personal knowledge repository infrastructure and skills, later extensible toward continual learning.
3. Paper and patent writing harness-engineered agent.
4. Website and REST API for AI-use tips, useful skills, and workflows.
5. Periodic collection and synthesis of AI papers, articles, securities reports, and community trends based on Jimmy/team interests.
6. Automated technology collection, experiments, and research around the future of AI, including TTT.

## Core Substrate

- Canonical knowledge store.
- Source, claim, and evidence ledgers.
- TaskOps-style workflow/task graph.
- Experiment and simulation run registry.
- Artifact and document registry.
- Skill and workflow registry.
- Publishing/API layer.
- Scheduled ingestion and research automation.

## Current Critical Path

As of 2026-06-27, Jimmy's DSE control-plane strategy note reweights the program:

1. `CAW-01` simulation control plane is the main instrument and current company work.
2. `CAW-05` trend collection is elevated into a narrow related-work/novelty radar.
3. `CAW-06` TTT/future-AI research is a future workload axis for the instrument.
4. `CAW-02` knowledge repository supports all three by preserving sources, traces, insights, and decisions.
5. `CAW-03` paper/patent harness comes after the trust ladder is credible.
6. `CAW-04` website/API comes last as a publishing surface.

## Published Report Surface

- Webapp: https://dse-control-plane-report.vercel.app
- Source: `webapp/index.html`
- Deployment target: Vercel project `dse-control-plane-report`
- Scope: Korean DSE control-plane strategy report with English technical terms, generated from `session_memory_dse_controlplane.yaml`.

## Operating Rule

Do not build six databases, six UIs, or six prompt systems.

Build one shared substrate and attach each surface as a module. The first visible vertical slice should be the simulation control plane, because it has the clearest company value.

## Files

- `TODO.md` — tracked work items.
- `architecture.md` — current shared system architecture.
- `research-cadence.md` — how periodic research/design updates should run.
- `cron-prompt.md` — prompt used by the scheduled OpenClaw cron job.
- `research-log.md` — index of periodic research updates.
- `items/` — one file per surface.
- `research-runs/` — dated outputs from automatic research/design runs.
- `webapp/` — published report surface for the DSE control-plane strategy.

# Cron Prompt: Company AI Workbench Weekly Research

You are running a scheduled research/design update for Jimmy's Company AI Workbench.

Workspace folder:

`/home/jimmy/.openclaw/workspace/ops/company-ai-workbench`

## Objective

Advance the design of Jimmy's company AI workbench through periodic public-source research and careful system design updates.

The six surfaces are:

1. End-to-end simulation platform control plane web app.
2. Team/personal knowledge repository infrastructure and skills, later extensible toward continual learning.
3. Paper and patent writing harness-engineered agent.
4. Website and REST API for AI-use tips, useful skills, and workflows.
5. Periodic collection and synthesis of AI papers, articles, securities reports, and community trends based on Jimmy/team interests.
6. Automated technology collection, experiments, and research around the future of AI, including TTT.

Treat these as six surfaces on one shared substrate, not six separate products.

## Current Priority

The current company critical path is:

1. `CAW-01` simulation control plane as the main instrument.
2. `CAW-05` narrow related-work radar for novelty protection.
3. `CAW-06` TTT/future-AI workload axis.
4. `CAW-02` knowledge repository as append/retrieve/skill-wrap substrate.

Do not spread effort evenly across all six surfaces every week. Keep `CAW-03` and `CAW-04` as later surfaces unless a finding directly affects them.

For the first run after 2026-06-27, prioritize:

- source-backed verification of DeepStack, Minsoo Rhu / MC-DLA, MemOS, SECDA-DSE, memory-centric DSE, TTT writeback-memory claims,
- L0 memory-annotated IR schema implications,
- first syntorch vs A100/OTel validation plan,
- one ServingSim-style output and one syntorch-style output fitting into the same schema.

## Required Steps

1. Read:
   - `TODO.md`
   - `architecture.md`
   - `research-cadence.md`
   - `research-log.md`
   - every file under `items/`
2. Choose one or two focus areas for deeper work this week.
3. Do public-source research where needed. Prioritize primary sources, official docs, papers, repo docs, and credible technical writeups. For user-provided strategy notes, verify URLs and claims before upgrading them into source-backed findings.
4. Write a dated research artifact:
   - `research-runs/YYYY-MM-DD.md`
5. Update:
   - `research-log.md`
   - relevant `items/*.md`
   - `TODO.md` if priorities/status/next actions changed
   - `architecture.md` only when a design decision or schema change is justified

## Output Contract

Keep the final chat report brief. The durable output is the files.

The dated artifact must include:

- focus areas,
- sources checked,
- findings,
- implications for the shared substrate,
- updates per relevant surface,
- proposed decisions,
- TODO updates,
- open questions for Jimmy.

## Boundaries

- Use public sources only unless Jimmy explicitly provides internal material.
- Do not write confidential company facts into public-facing docs.
- Preserve uncertainty.
- Do not present proxy/local results as official external benchmark results.
- Do not publish externally.
- Prefer compact, actionable design updates over broad essays.

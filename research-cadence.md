# Research Cadence

## Scheduled Loop

Frequency: weekly, Monday morning KST.

Purpose:

- keep the six surfaces alive,
- update design notes with fresh public information,
- preserve useful sources,
- convert research into actionable design decisions,
- avoid drifting into six disconnected products.

## Weekly Run Shape

Each scheduled run should:

1. Read `TODO.md`, `architecture.md`, `research-log.md`, and all files under `items/`.
2. Pick one or two focus areas for deeper research.
3. Lightly refresh all six areas for important new developments.
4. Use public sources only unless Jimmy explicitly provides internal material.
5. Write a dated run artifact under `research-runs/YYYY-MM-DD.md`.
6. Update `research-log.md` with a short index entry.
7. Update relevant `items/*.md` files with new sources, implications, decisions, and next actions.
8. Preserve uncertainty and source boundaries.

## Current Priority Bias

Until the first vertical slice is validated, scheduled runs should bias toward:

- `CAW-01`: L0/L1 memory-annotated IR, trace/projection schema, syntorch validation, ServingSim adapter boundary.
- `CAW-05`: narrow related-work radar for novelty protection.
- `CAW-06`: TTT/future workload axis only insofar as it creates new memory-system pressures.

Avoid broad trend summaries unless they directly affect these areas.

## Source Categories

- AI systems / simulation / serving / memory architecture.
- AI papers and technical reports.
- TTT, test-time compute, self-improvement, memory, continual learning.
- Agent workflow tooling and harness engineering.
- Patent/paper writing workflows and research operations.
- Team knowledge management and enterprise AI knowledge stores.
- Community signals from GitHub, Hacker News, Reddit, blogs, and forums.
- Securities reports and market analysis when available through accessible sources.

Current narrow radar terms:

- DeepStack,
- Minsoo Rhu,
- MC-DLA,
- MemOS,
- memory-centric DSE,
- memory device for LLM,
- SECDA-DSE,
- TTT write traffic,
- test-time training memory traffic,
- Chakra execution trace,
- LLMServingSim,
- ASTRA-sim,
- OTel trace for LLM serving.

## Output Requirements

Each run artifact should include:

- focus areas,
- sources checked,
- new findings,
- implications for the shared substrate,
- updates per surface,
- decisions proposed,
- TODO changes,
- open questions for Jimmy.

## Non-Goals

- Do not invent internal company facts.
- Do not claim official benchmark or paper results without exact source contracts.
- Do not create a large implementation plan every week.
- Do not publish externally without Jimmy's explicit approval.

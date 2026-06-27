# 05 — Periodic Trend Collection and Synthesis

## Goal

Automatically collect and synthesize AI papers, articles, securities reports, and community trends based on Jimmy's interests and team interests.

Outputs should be readable in multiple formats: memo, digest, slide outline, paper-card, or action brief.

Updated role: this is not just support. It is an early-warning radar for novelty, related-work risk, and future workload axes. Missing one close paper or system can erase the novelty of the whole control-plane/paper strategy.

## Source Families

- arXiv and conference papers,
- company/research lab blogs,
- GitHub repositories,
- Hacker News / Reddit / technical forums,
- securities reports and market analysis,
- newsletters and media articles.

## Initial Narrow Radar

Start with a narrow weekly radar before broad trend collection:

- memory-centric DSE,
- memory device for LLM,
- DeepStack,
- Minsoo Rhu / MC-DLA / memory wall line,
- MemOS,
- SECDA-DSE,
- TTT writeback / test-time compute memory traffic,
- Chakra/trace-based workload modeling,
- LLM serving simulation and memory hierarchy simulation.

These names come from Jimmy's attached strategy note and need source-backed verification in the next research run.

## Design Questions

- How should interests be represented and updated?
- How do we distinguish signal from hype?
- What sources are accessible and legally safe to ingest?
- How should each finding become either knowledge, a task, an experiment, or a discard?
- How do we classify a source as novelty threat, support, adjacent, or noise?
- How do radar findings become open questions for `CAW-01` and `CAW-06`?

## Next Actions

- Define an `Interest` schema.
- Define a weekly digest template.
- Build the first related-work ledger for the narrow radar list.
- Verify the flagged DeepStack/Rhu/MemOS/SECDA-DSE references.

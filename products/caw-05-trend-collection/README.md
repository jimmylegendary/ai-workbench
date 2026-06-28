# CAW-05 — Periodic Trend Collection & Synthesis (Early-Warning Radar)

An **independent, standalone product** in the `ai-workbench` family of 6 (no shared runtime substrate).

CAW-05 is an **early-warning radar**: it collects AI papers / articles / securities reports / community trends per
Jimmy's & the team's interests, **classifies** each finding, and **synthesizes** it into readable outputs — to
protect the novelty of the control-plane / paper strategy (missing one close paper can erase novelty).

- **One pipeline core (a Run):** ingest → dedup → relevance → classify → triage/route → ledger → synthesize → export. Surfaces: scheduled pipeline + CLI + MCP.
- **Interest model:** typed, tiered; **BM25-first, explainable, recall-first** relevance; human-gated versioned updates; seeded from a narrow weekly watch list.
- **Classification/triage:** two-axis (novelty-threat / support / adjacent / noise × signal / hype) via an LF→LLM→human cascade with a recall-biased selective-review gate; deterministic routing to knowledge / task / experiment / open-question / discard. Generated rationale is never evidence.
- **Outputs:** memo, digest, slide outline, paper-card, action brief (markdown-first).
- **Ports & adapters:** sources (arXiv/Semantic Scholar/GitHub/RSS/HN-light + stubs), exports (CAW-02/CAW-03/CAW-01/CAW-06), scheduler (cron) — config-driven with documented stubs.

## Design

Full design set under [`design/`](./design/) — start at [`design/README.md`](./design/README.md). Korean mirror:
`design/korean/`.

## Status

Design complete (draft). Built by an AI builder following [`design/10-runbooks/`](./design/10-runbooks/).

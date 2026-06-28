# CAW-06 — AI Future / TTT Research Automation

An **independent, standalone product** in the `ai-workbench` family of 6 (no shared runtime substrate).

CAW-06 automates **scouting → claim extraction → hypothesis generation → small experiments → result logging →
implication mapping** around the future of AI, with **TTT (test-time training / test-time compute)** as the lead
theme. Its strategic payload: treat TTT as a candidate **future workload axis** for the simulation control plane
(CAW-01) — inference that **writes back** (weight updates, gradients, optimizer state) could create a memory axis
that read-dominant LLM serving profiles miss.

- **ExperimentScout Run:** discover → import (CAW-05) → dedup → extract → hypothesize → run toy experiment → log → map implications → produce a writeback-traffic schema → export. Surfaces: scheduled pipeline + CLI + MCP.
- **No overclaim:** a 4-state reversible status lifecycle (hypothesis/supported/refuted/inconclusive) with a hard evidence cap — generated evidence can never promote a hypothesis; a hypothesis is never a settled claim.
- **Failures useful:** one run = one append-only ledger entry, pre-registered decision rule, hard reproducibility gate; negative results are retained and surfaced.
- **Writeback-traffic schema (`wbtraffic.v0`):** a per-variant analytic L0 estimate, exported as a self-describing bundle lowered onto **CAW-01's** L0 IR + open questions (an export boundary, not a shared store).
- **Ports & adapters:** sources (arXiv/Semantic Scholar + CAW-05 import), experiment runners, exports (CAW-01 writeback, CAW-02 claims) — config-driven with documented stubs.

## Design

Full design set under [`design/`](./design/) — start at [`design/README.md`](./design/README.md). Korean mirror:
`design/korean/`.

## Status

Design complete (draft). Built by an AI builder following [`design/10-runbooks/`](./design/10-runbooks/).

# CAW-03 — Paper & Patent Writing Harness

An **independent, standalone product** in the `ai-workbench` family of 6 (no shared runtime substrate).

CAW-03 is an evidence-gated **harness** that turns verified claims + evidence into **papers and patents**. It does
**not** rebuild the writing pipeline — it **wraps PaperOrchestra** as a swappable writing engine and adds the
governance PaperOrchestra lacks:

- **Evidence gate + claim ledger** (P1/P2/P3) — only evidence-backed claims may enter a draft; *generated text is never evidence*.
- **Patent path** — a separate `PatentEngine` + **patent-first interlock** (file before disclose).
- **Novelty / paper ladder** — novel vs threatened; the P1/P2/P3 program sequence.
- **Confidentiality** — inherits CAW-02 boundary×visibility; fail-closed export.

It is built as **ports & adapters**: inputs (CAW-02 bundles, CAW-01 results), the writing/patent engines, novelty
signals (CAW-05), and publish targets are all adapters selected by config. **Future connectors — internal wiki,
internal experiment-server, venue submission, patent filing — ship as documented stubs**, so wiring a real one
later means implementing one adapter, not changing the core.

## Design

Full design set under [`design/`](./design/) — start at [`design/README.md`](./design/README.md). Korean mirror:
`design/korean/`.

## Status

Design complete (draft). Implementation is performed by an AI builder following
[`design/10-runbooks/`](./design/10-runbooks/). PaperOrchestra is reused, not rebuilt.

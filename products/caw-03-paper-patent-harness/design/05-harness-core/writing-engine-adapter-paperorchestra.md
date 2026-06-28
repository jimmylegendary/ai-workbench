# WritingEngine Adapter — PaperOrchestra — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [input-assembly.md](./input-assembly.md), [ports-and-adapters.md](./ports-and-adapters.md), [../02-research/paperorchestra-integration.md](../02-research/paperorchestra-integration.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The `WritingEngineAdapter` port and its v1 implementation: **PaperOrchestra** invoked in subprocess mode. CAW-03
does NOT rebuild the pipeline; it feeds inputs and captures outputs + provenance.

## The port

```ts
interface WritingEngineAdapter {
  capabilities(): EngineDescriptor      // name, version, input/output schema, modes
  draft(inputs: EngineInputs, workspace: Path): DraftResult
}
type DraftResult = { latexPath, pdfPath, bibPath, scores, provenance: FigureResultMap }
```

The core depends only on this port; PaperOrchestra is swappable for another engine.

## PaperOrchestra v1 adapter

- **Invocation:** subprocess over a CAW-03-owned `workspace/` (engine reads inputs, writes artifacts there).
- **Input mapping:** engine-neutral bundle → PaperOrchestra inputs (`idea.md`, `experimental_log.md`,
  `template.tex`, `conference_guidelines.md`, figures) — see [input-assembly.md](./input-assembly.md).
- **Pipeline used:** PaperOrchestra's outline → plotting → literature-review (Semantic Scholar) → section-writing →
  content-refinement, + paper-autoraters (scores). CAW-03 treats it as a black box behind the port.
- **Output capture:** LaTeX, PDF, BibTeX, autorater scores → recorded as an `EngineRun` + `Artifact.output_ref`.
- **Provenance:** capture PaperOrchestra `figure_id` and bind to CAW-01 `result_id` (the FigureTableManifest).
- **citation_pool reuse:** PaperOrchestra's Semantic-Scholar-verified `citation_pool.json` is reused by novelty
  ([paper-ladder-and-novelty.md](./paper-ladder-and-novelty.md)) — not re-queried.

## Version pinning

`EngineDescriptor.version` pins the PaperOrchestra suite + its `outline.json`/`citation_pool.json` schema; the
registry preflight rejects an incompatible engine.

## Confidentiality

The adapter only ever receives the bundle at the artifact's confidentiality track; intermediate engine artifacts
(outline.json etc.) inherit that track in `workspace/`.

## Open questions

PaperOrchestra non-interactive entrypoint (who runs its LLM/web/vision steps headless); whether intermediate
artifacts need the confidentiality filter before storage — see [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The engine-adapter runbook implements the subprocess invocation, input mapping, output+provenance capture, and the
version-pin preflight. It does NOT modify PaperOrchestra.

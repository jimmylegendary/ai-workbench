# Orchestration Service — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../05-harness-core/writing-engine-adapter-paperorchestra.md](../05-harness-core/writing-engine-adapter-paperorchestra.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle.md), [api-surface.md](./api-surface.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Run a draft end to end: drive the engine subprocess, capture outputs + provenance, advance the artifact lifecycle,
and enforce the patent-first interlock.

## Draft run (paper)

```
draftPaper(artifactId):
  1. load Artifact (must be `assembled`)              → else error
  2. resolve WritingEngineAdapter via registry (preflight)
  3. materialize EngineInputs into workspace/<run>/   (confidentiality track applied)
  4. adapter.draft(inputs, workspace)                 → subprocess (PaperOrchestra)
  5. capture DraftResult (LaTeX/PDF/BibTeX/scores) + provenance (figure_id↔result_id)
  6. persist EngineRun + FigureTableManifest; Artifact → `drafted`
```

## Draft run (patent)

Same shape via `PatentEngineAdapter`; Artifact branches to the patent tail; sets `InterlockState` for
patent-sensitive claims ([../05-harness-core/patent-drafting-module.md](../05-harness-core/patent-drafting-module.md)).

## Interlock enforcement

`publish` checks every claim in the artifact's `GatedClaimSet`; if any `InterlockState=held`, **deny** with reason.

## Failure & retry

A failed subprocess leaves the artifact in `drafting`→`failed`; retry creates a new `EngineRun` (outputs immutable
per run). `workspace/<run>/` is cleaned on success.

## Sync vs async

Long engine runs may need a **job-handle/poll** contract rather than a blocking call — TODO(open-question), affects
the WritingEngine port signature.

## Open questions

PaperOrchestra non-interactive run (who executes its LLM/web/vision steps); job-handle vs sync — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The orchestration runbook implements the run lifecycle, capture, provenance, and interlock enforcement around the
engine adapters.

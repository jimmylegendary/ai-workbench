# Input Assembly — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [evidence-gate-and-claim-ledger.md](./evidence-gate-and-claim-ledger.md), [writing-engine-adapter-paperorchestra.md](./writing-engine-adapter-paperorchestra.md), [../02-research/paperorchestra-integration.md](../02-research/paperorchestra-integration.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

How CAW-03 turns a `GatedClaimSet` + CAW-01 result refs into an **engine-neutral input bundle** the writing engine
consumes. This generalizes PaperOrchestra's `agent-research-aggregator` from "scattered logs → inputs" to
"workbench → inputs".

## Rule: gate before assemble

Only claims in the `GatedClaimSet` may be assembled. Assembly **refuses** any ungated claim
([evidence-gate-and-claim-ledger.md](./evidence-gate-and-claim-ledger.md)). Numbers/results are **result-ref-backed**
(each figure/value carries its CAW-01 `result_id`).

## Engine-neutral input bundle

A normalized intermediate (CAW-03 owns this schema) that any `WritingEngineAdapter` can map to its native inputs:

```jsonc
{
  "idea": { "title": "...", "thesis": "...", "claims": [ {claim_id, type, statement, evidence_refs[]} ] },
  "experimental_log": [ { "result_id": "...(CAW-01)", "metric": "...", "value": "...", "provenance": "..." } ],
  "figures": [ { "figure_id": "...", "result_id": "...(CAW-01)", "caption": "..." } ],
  "template": "...(venue template ref)",
  "conference_guidelines": "...(venue ref)",
  "boundary": "public|internal|confidential"
}
```

For the PaperOrchestra adapter this maps to its `idea.md`, `experimental_log.md`, `template.tex`,
`conference_guidelines.md`, and figures ([writing-engine-adapter-paperorchestra.md](./writing-engine-adapter-paperorchestra.md)).

## Confidentiality

The bundle is built at the artifact's confidentiality track; content above the track is excluded before the engine
ever sees it ([../04-data-layer/confidentiality-and-provenance.md](../04-data-layer/confidentiality-and-provenance.md)).

## Provenance

Each assembled value keeps its `claim_id` + `result_id` so the produced draft is reconstructable end-to-end and the
`FigureTableManifest` can bind figures to CAW-01 results.

## Open questions

The exact normalized IdeaDoc/ExpLog schema (so non-PaperOrchestra engines reuse it); reliable figure_id↔result_id
binding across PlotOn/PlotOff — see [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The assembly runbook implements the engine-neutral schema + the gate-before-assemble + result-ref binding; the
engine adapter maps it to PaperOrchestra inputs.

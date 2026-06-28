# API Surface (harness-core contract) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [orchestration-service.md](./orchestration-service.md), [adapter-registry-and-config.md](./adapter-registry-and-config.md), [../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The one typed contract (Zod) every surface consumes — the op-manifest as service operations.

## Services & operations

```ts
ImportLedgerService.import(sourceRef): Bundle
ImportLedgerService.buildLedger(bundleId): ClaimLedger
GateService.gate(ledgerId, profile): GatedClaimSet           // fail-closed; generated-text != evidence
AssemblyService.assemble(gatedSetId): EngineInputs           // gated only; result-ref-backed
DraftService.draftPaper(artifactId): DraftResult            // WritingEngineAdapter
PatentService.draftPatent(artifactId): PatentDraft          // PatentEngineAdapter; interlock
NoveltyLadderService.run(ledgerId): NoveltyFindings         // Novelty/Radar + citation_pool
NoveltyLadderService.ladder(): PaperLadderEntry[]
ReviewService.review(artifactId): ReviewResult
PublishService.publish(artifactId, sinkRef): PublishOutcome  // confirmation; interlock + confidentiality
RegistryService.list(): AdapterConfig[]
RegistryService.preflight(port): PreflightReport
```

## Error model

Typed `CawError` union: validation, not-found, gate-blocked, interlock-held, confidentiality-violation,
engine-failure, adapter-incompatible. Surfaces translate these to transport.

## Governance is in the services

`GateService`, `PatentService` (interlock), and `PublishService` (confidentiality + interlock) enforce invariants
regardless of caller — no adapter or surface can bypass them ([../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md)).

## Open questions

Sync vs async (job-handle) for `draftPaper`/`draftPatent` long runs — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Phase-0 defines these as empty typed contracts; later phases implement each service behind ports already stubbed.

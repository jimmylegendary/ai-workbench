# API Surface (harness-core contract) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [orchestration-service.md](./orchestration-service_ko.md), [adapter-registry-and-config.md](./adapter-registry-and-config_ko.md), [../03-architecture/component-boundaries.md](../03-architecture/component-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

모든 surface가 소비하는 단 하나의 타입이 지정된 contract(Zod)로, 서비스 operation으로서의 op-manifest이다.

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

타입이 지정된 `CawError` union: validation, not-found, gate-blocked, interlock-held, confidentiality-violation, engine-failure, adapter-incompatible. surface는 이를 transport로 변환한다.

## Governance is in the services

`GateService`, `PatentService`(interlock), `PublishService`(confidentiality + interlock)는 호출자와 무관하게 불변식(invariant)을 강제한다 — 어떤 adapter나 surface도 이를 우회할 수 없다 ([../03-architecture/component-boundaries.md](../03-architecture/component-boundaries_ko.md)).

## Open questions

`draftPaper`/`draftPatent`의 장시간 실행에 대한 Sync vs async (job-handle) — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## Implications for runbooks

Phase-0는 이들을 빈 타입 지정 contract로 정의하고, 이후 phase에서 이미 stub 처리된 port 뒤에 각 서비스를 구현한다.

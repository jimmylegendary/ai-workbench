# Persistence — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../04-data-layer/data-model.md](../04-data-layer/data-model_ko.md), [../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy_ko.md), [api-surface.md](./api-surface_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

CAW-03 자체의 governance 데이터 + path 기반 artifact를 위한 persistence layer로, CAW-01/02는 id/URI로 참조한다.

## Repositories (over the data model)

```ts
interface LedgerRepo   { putClaimRef, get, listByBundle, setGateStatus }
interface ArtifactRepo { create, get, setState, listByState }
interface EngineRunRepo{ create, attachOutputs, get }
interface ManifestRepo { put(FigureTableManifest), get }
interface ReviewRepo   { put(ReviewResult), get }
interface NoveltyRepo  { put(NoveltyFinding), listByLedger }
interface LadderRepo   { upsert(PaperLadderEntry), list }
interface RegistryRepo { listAdapterConfig, upsert }
interface InterlockRepo{ set(InterlockState), held(gatedSetId): boolean }
interface ArtifactStore{ put(path, bytes): uri; get(uri): stream }   // PDFs / patent drafts
```

## Storage

- governance entity → **SQLite** (dialect 이식 가능); artifact → **path 기반 filesystem**; 엔진 scratch → `workspace/` ([../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy_ko.md)).
- CAW-01/02는 **참조**될 뿐(id/URI), 절대 복사되지 않는다.

## Transactions

- draft 완료는 EngineRun + manifest + artifact 상태를 하나의 transaction으로 기록한다.
- `publish`는 `published` 상태를 기록하기 전에 interlock(`InterlockRepo.held`) + confidentiality를 확인한다.

## Open questions

SQLite single-file vs directory-of-files; governance 데이터를 사람 친화적 diff를 위해 md-first로 둘지 여부 — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## Implications for runbooks

persistence runbook은 이 repo들 + artifact store를 구현하며, 일관성 규칙을 테스트한다 (held 상태인 interlock 위에 published가 기록되지 않도록).

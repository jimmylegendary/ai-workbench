# Persistence — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy.md), [api-surface.md](./api-surface.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The persistence layer for CAW-03's own governance data + artifact-by-path, referencing CAW-01/02 by id/URI.

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

- Governance entities → **SQLite** (dialect-portable); artifacts → **filesystem by path**; engine scratch →
  `workspace/` ([../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy.md)).
- CAW-01/02 are **referenced** (id/URI), never copied.

## Transactions

- A draft completion writes EngineRun + manifest + artifact state in one transaction.
- `publish` checks interlock (`InterlockRepo.held`) + confidentiality before writing a `published` state.

## Open questions

SQLite single-file vs directory-of-files; whether governance data should be md-first for human diff — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The persistence runbook implements these repos + the artifact store; consistency rules tested (no published over a
held interlock).

# Component Boundaries — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture.md), [repo-structure.md](./repo-structure.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface.md), [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Module ownership, the op-manifest → surfaces relationship, the core service signatures, the port interfaces, and the
enforcement that adapters cannot weaken governance.

## Ownership map

| Module | Owns | Must NOT |
| --- | --- | --- |
| `core` (harness) | op-manifest, gate, assembly, orchestration, patent path, novelty/ladder, review, publish, confidentiality, governance store, registry | import a concrete adapter; let an op skip its invariant |
| `ports` | the 5 typed port interfaces + value objects | any concrete impl |
| `adapters/*` | concrete adapters (v1 + stubs) | governance logic (gates live in core) |
| `surfaces/*` | API/MCP/CLI/UI mapping to ops | domain logic |

## Op-manifest → surfaces

Every action is a **governed op**; surfaces only translate transport ↔ op. Representative ops:

```
import_bundle(sourceRef)            build_ledger(bundleId)        gate_claims(ledgerId, profile)
assemble_inputs(gatedSetId)         draft_paper(artifactId)       draft_patent(artifactId)
run_novelty(ledgerId)               review(artifactId)            publish(artifactId, sinkRef)
```

Each op enforces its invariant in the core (e.g. `assemble_inputs` refuses non-gated claims; `publish` enforces the
patent-first interlock + confidentiality).

## Core services (signature level)

```ts
ImportLedgerService.import(sourceRef): Bundle           // via SourceAdapter
ImportLedgerService.buildLedger(bundleId): ClaimLedger  // refs to CAW-02; never re-owns
GateService.gate(ledgerId, profile): GatedClaimSet      // type-specific; generated-text != evidence; fail-closed
AssemblyService.assemble(gatedSetId): EngineInputs      // engine-neutral; result-ref-backed numbers
DraftService.draftPaper(artifactId): DraftResult        // via WritingEngineAdapter (PaperOrchestra)
PatentService.draftPatent(artifactId): PatentDraft      // via PatentEngineAdapter; patent-first interlock
NoveltyLadderService.run(ledgerId): NoveltyFindings     // via Novelty/RadarAdapter + citation_pool
ReviewService.review(artifactId): ReviewResult
PublishService.publish(artifactId, sinkRef): PublishOutcoME // via Sink/PublishAdapter; confidentiality + interlock
RegistryService.select(port, config): Adapter           // preflight capability descriptor
```

## Port interfaces (the seams)

```ts
interface SourceAdapter        { fetch(ref): Bundle; capabilities(): Descriptor }
interface WritingEngineAdapter { draft(inputs: EngineInputs, workspace): DraftResult; capabilities(): Descriptor }
interface PatentEngineAdapter  { draft(inputs: PatentInputs, workspace): PatentDraft; capabilities(): Descriptor }
interface SinkAdapter          { publish(artifact, opts): PublishOutcome; capabilities(): Descriptor }
interface NoveltyAdapter       { signals(query): NoveltySignals; capabilities(): Descriptor }
```

Future connectors (internal wiki, experiment-server, venue submission, patent filing) implement one of these as a
**documented stub** until built ([../05-harness-core/ports-and-adapters.md](../05-harness-core/ports-and-adapters.md)).

## Enforcement

- **Governance in core, not adapters:** the gate + patent-first interlock + confidentiality run in core services,
  around adapter calls. An adapter returning bad data still cannot bypass a gate.
- **Boundary lint / CI:** `core` may not import `adapters/*`; only `ports`. Adapters may not import `core`.
- **Capability preflight:** the registry rejects an adapter whose descriptor is incompatible or whose config is invalid.

## Open questions

Source fan-in precedence when multiple SourceAdapters are active; sync vs async (job-handle) engine runs (affects the
WritingEngine port signature) — [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Phase-0 creates `core`, `ports` (with fakes), the registry, and the lint/CI guards before any adapter; later phases
fill adapters behind stable ports.

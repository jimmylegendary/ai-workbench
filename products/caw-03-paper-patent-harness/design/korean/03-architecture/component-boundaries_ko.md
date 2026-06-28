# 컴포넌트 경계(Component Boundaries) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture_ko.md), [repo-structure.md](./repo-structure_ko.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface_ko.md), [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

모듈 소유권, op-manifest → surfaces 관계, 핵심 서비스 시그니처, port 인터페이스, 그리고 adapter가 거버넌스를 약화시킬 수 없도록 하는 강제(enforcement)를 다룬다.

## 소유권 맵(Ownership map)

| Module | 소유(Owns) | 금지(Must NOT) |
| --- | --- | --- |
| `core` (harness) | op-manifest, gate, assembly, orchestration, patent path, novelty/ladder, review, publish, confidentiality, governance store, registry | 구체 adapter를 import하기; 어떤 op가 자신의 불변식(invariant)을 건너뛰도록 허용하기 |
| `ports` | 5개의 타입화된 port 인터페이스 + value object | 구체 구현(impl) 일체 |
| `adapters/*` | 구체 adapter (v1 + stub) | 거버넌스 로직 (gate는 core에 위치) |
| `surfaces/*` | API/MCP/CLI/UI를 op로 매핑 | 도메인 로직 |

## Op-manifest → surfaces

모든 동작은 **거버넌스를 거치는 op(governed op)** 이다. surfaces는 transport ↔ op 변환만 담당한다. 대표적인 op:

```
import_bundle(sourceRef)            build_ledger(bundleId)        gate_claims(ledgerId, profile)
assemble_inputs(gatedSetId)         draft_paper(artifactId)       draft_patent(artifactId)
run_novelty(ledgerId)               review(artifactId)            publish(artifactId, sinkRef)
```

각 op는 core에서 자신의 불변식을 강제한다(예: `assemble_inputs`는 비-gated 클레임을 거부하고, `publish`는 patent-first interlock + confidentiality를 강제한다).

## 핵심 서비스(시그니처 수준)

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

## Port 인터페이스 (이음매, the seams)

```ts
interface SourceAdapter        { fetch(ref): Bundle; capabilities(): Descriptor }
interface WritingEngineAdapter { draft(inputs: EngineInputs, workspace): DraftResult; capabilities(): Descriptor }
interface PatentEngineAdapter  { draft(inputs: PatentInputs, workspace): PatentDraft; capabilities(): Descriptor }
interface SinkAdapter          { publish(artifact, opts): PublishOutcome; capabilities(): Descriptor }
interface NoveltyAdapter       { signals(query): NoveltySignals; capabilities(): Descriptor }
```

향후 커넥터(내부 wiki, experiment-server, venue 제출, 특허 출원)는 구축되기 전까지 이들 중 하나를 **문서화된 stub**으로 구현한다([../05-harness-core/ports-and-adapters.md](../05-harness-core/ports-and-adapters_ko.md)).

## 강제(Enforcement)

- **거버넌스는 adapter가 아니라 core에:** gate + patent-first interlock + confidentiality는 adapter 호출을 감싸며 core 서비스에서 실행된다. adapter가 잘못된 데이터를 반환하더라도 gate를 우회할 수 없다.
- **Boundary lint / CI:** `core`는 `adapters/*`를 import할 수 없고 오직 `ports`만 import할 수 있다. adapter는 `core`를 import할 수 없다.
- **Capability preflight:** registry는 descriptor가 호환되지 않거나 config가 유효하지 않은 adapter를 거부한다.

## 미해결 질문(Open questions)

여러 SourceAdapter가 동시에 활성화되어 있을 때의 source fan-in 우선순위; 동기 vs 비동기(job-handle) engine 실행(WritingEngine port 시그니처에 영향) — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의(Implications for runbooks)

Phase-0는 어떤 adapter보다 먼저 `core`, `ports`(fake 포함), registry, 그리고 lint/CI 가드를 생성한다. 이후 단계에서 안정적인 port 뒤에 adapter를 채워 넣는다.

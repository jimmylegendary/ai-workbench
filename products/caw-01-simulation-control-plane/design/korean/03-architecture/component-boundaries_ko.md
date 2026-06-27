# 컴포넌트 경계 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture_ko.md](./system-architecture_ko.md), [repo-structure_ko.md](./repo-structure_ko.md), [../07-backend-api/api-surface_ko.md](../07-backend-api/api-surface_ko.md), [../01-decisions/ADR-0001-product-surface_ko.md](../01-decisions/ADR-0001-product-surface_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

모듈/패키지 경계, 각 구성요소의 소유권, 시그니처 수준의 코어 서비스 책임, 포트 인터페이스, 그리고 경계가 어떻게 강제되는지를 정의한다. 레포 디렉터리 레이아웃은 [repo-structure_ko.md](./repo-structure_ko.md)에 있다.

## 소유권 맵(Ownership map)

| Package | 소유(Owns) | 포함해서는 안 되는 것(Must NOT contain) |
| --- | --- | --- |
| `@caw/core` | 도메인 서비스, Zod 스키마, 포트 인터페이스, 리포지토리 인터페이스 | 모든 `next`/React import; 모든 구체적 DB 또는 엔진 코드 |
| `@caw/db` | 리포지토리 *구현체*, 마이그레이션, 아티팩트 저장소 클라이언트 | 도메인 규칙(코어에 위치) |
| `@caw/engine-adapters` | 엔진 포트의 구체적 구현(Python 엔진과 통신) | UI; 도메인 규칙 |
| `apps/web` | Next.js 표현(presentation), 캔버스, 캔버스 간 조정 | 도메인 로직(코어만 호출) |
| `apps/mcp` | 코어 연산에 매핑되는 MCP 도구 정의 | 도메인 로직 |
| `apps/cli` | 코어 연산에 매핑되는 CLI 명령 | 도메인 로직 |
| `engine/` (Python) | syntorch capture, Chakra export, LLMServingSim, ASTRA-sim, L0 lowering | TS surface에 대한 지식 |

## 코어 서비스 (시그니처 수준)

> 타입은 Zod로 검증된다. 여기서는 TS 유사 시그니처로 표시한다. 전체 계약은 [../07-backend-api/api-surface_ko.md](../07-backend-api/api-surface_ko.md)에 있다.

```ts
// Compose workload × serving × hardware into a runnable experiment
ExperimentService.create(input: ExperimentDraft): Experiment
ExperimentService.update(id, patch): Experiment
ExperimentService.get(id): Experiment

// Run lifecycle (state machine: draft → queued → running → done|failed)
RunService.start(experimentId, runConfig): Run
RunService.status(runId): RunStatus            // streamable
RunService.stop(runId): void

// Catalogs: models, serving frameworks, HW parts, tiling/partitioning strategy ids
RegistryService.listModels() / listServingFrameworks() / listHwParts() / listStrategyIds()

// git-like change tree across the three canvases
WorkTreeService.saveItem(experimentId, subtreePath, blob): Commit   // per-item save
WorkTreeService.saveAll(experimentId, message): Commit              // full save
WorkTreeService.branch(experimentId, fromRef, name): Ref
WorkTreeService.diff(refA, refB): TreeDiff

// Trace artifacts, metrics, projections, trust-ladder status
EvidenceService.registerArtifact(runId, kind, pathOrUri): TraceArtifact
EvidenceService.metrics(runId): Metric[]
EvidenceService.projection(experimentId, refs[]): Projection
EvidenceService.trustStatus(runId): TrustLadderStatus
```

## Engine-adapter 포트 (인터페이스만)

```ts
interface SyntorchCapturePort { capture(spec): { chakraPaths: string[]; meta } }
interface ChakraExporterPort  { toChakra(nativeTracePath): { etPaths: string[] } }
interface ServingSimPort      { run(simConfig): { chakraPaths: string[]; metrics } }
interface AstraSimPort         { simulate(etPaths, hwConfig, backend): { metrics; artifacts } }
interface L0LoweringPort       { lower(etPaths, opts): { irPath: string; rollups } }
```

Python 엔진이 프로세스 외부에서 이들을 구현하고, `@caw/engine-adapters`가 TS 쪽을 제공한다 ([system-architecture_ko.md](./system-architecture_ko.md)의 이음새).

## 리포지토리 인터페이스 (데이터 계층)

```ts
interface ExperimentRepo { ... }   interface RunRepo { ... }
interface IrRepo { ... }           interface ArtifactStore { put/get by path/URI }
interface WorkTreeRepo { blobs, trees, commits, refs }   interface KnowledgeRepo { ... }
```

구체적 구현은 Postgres/SQLite를 대상으로 `@caw/db`에 위치한다 ([../04-data-layer/storage-strategy_ko.md](../04-data-layer/storage-strategy_ko.md)).

## 강제(Enforcement)

- **패키지 경계 lint** (예: dependency-cruiser / eslint-plugin-boundaries): `@caw/core`는 `next`, React, `@caw/db`, `@caw/engine-adapters`를 import할 수 없으며 — 오직 그 인터페이스(코어에 위치)만 사용할 수 있다.
- 단방향 의존성 규칙에 대한 **CI 체크** (phase-0 런북).
- **타입 전용 계약:** surface는 코어 타입을 import하고, 런타임 연결(wiring)은 surface 진입점에서 의존성 주입(dependency injection)으로 이루어진다.

## 미해결 질문(Open questions)

`@caw/engine-adapters`와 `@caw/db`를 하나의 "인프라스트럭처" 패키지로 할지 둘로 나눌지 — TODO(open-question), Python 이음새 전송 방식이 정해질 때 재검토한다.

## 런북(runbook)에 대한 함의

Phase-0에서 기능 코드를 작성하기 전에 이 패키지들을 빈 인터페이스 + lint/CI 가드와 함께 생성한다. 그래서 이후의 모든 런북은 안정적인 경계 뒤에서 구현을 채워 넣는다.

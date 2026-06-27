# API 표면 (`@caw/core` 계약) — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [simulation-runtime-service_ko.md](./simulation-runtime-service_ko.md), [persistence-and-storage-api_ko.md](./persistence-and-storage-api_ko.md), [mcp-and-cli-adapters_ko.md](./mcp-and-cli-adapters_ko.md), [../03-architecture/component-boundaries_ko.md](../03-architecture/component-boundaries_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

모든 표면(web/MCP/CLI)이 소비하는 단 하나의 계약: Zod 타입으로 정의된 `@caw/core` 서비스 연산이다. 여기 명시된
시그니처가 표준 레퍼런스이며, 컴포넌트 경계는 [../03-architecture/component-boundaries_ko.md](../03-architecture/component-boundaries_ko.md)에 있다.

## 계약 원칙

- 모든 입력/출력은 `@caw/core/schemas` 내의 **Zod 스키마**이며, 이것이 단일 검증 계약이다.
- 서비스는 순수 도메인 로직이다. 구체 구현이 아니라 **포트(port)**(엔진)와 **리포지토리(repository)**(데이터)를 호출한다.
- 오류는 타입으로 정의된다(`CawError` 유니온): 검증(validation), 미발견(not-found), 충돌(conflict), 엔진 실패(engine-failure).

## 서비스

### ExperimentService
```ts
create(input: ExperimentDraft): Experiment        // compose workload×serving×hardware
update(id: Id, patch: ExperimentPatch): Experiment
get(id: Id): Experiment
list(filter?): Experiment[]
```

### RunService
```ts
start(experimentId: Id, runConfig: RunConfig): Run    // validates composition + grammar + hardware present
status(runId: Id): AsyncIterable<RunStatus>           // streamable (per-axis)
stop(runId: Id): void
get(runId: Id): Run
```

### RegistryService
```ts
listModels(): ModelRef[]
listServingFrameworks(): ServingRef[]      // vLLM, LLMServingSim
listHwParts(): HwPartRef[]                 // catalog for Canvas 3
listStrategyIds(): StrategyId[]            // tiling/partitioning
```

### WorkTreeService
```ts
saveItem(experimentId: Id, subtreePath: string, blob: ChangeBlob): Commit   // per-item save
saveAll(experimentId: Id, message: string): Commit                          // full save
branch(experimentId: Id, fromRef: RefName, name: RefName): Ref
diff(refA: RefName, refB: RefName): TreeDiff
history(experimentId: Id): Commit[]
```

### EvidenceService
```ts
registerArtifact(runId: Id, kind: ArtifactKind, pathOrUri: string): TraceArtifact
metrics(runId: Id): Metric[]
projection(experimentId: Id, refs: RefName[]): Projection
trustStatus(runId: Id): TrustLadderStatus
```

## 표면별 매핑

| 연산 종류 | Web | MCP | CLI |
| --- | --- | --- | --- |
| 변경(create/update/save/branch) | Server Action | tool | command |
| 스트림(run status) | Route Handler (SSE) | tool (poll/stream) | command (follow) |
| 읽기(get/list/metrics/projection) | RSC fetch / action | tool | command |

표면 매핑 세부 사항은 [mcp-and-cli-adapters_ko.md](./mcp-and-cli-adapters_ko.md)에 있다.

## 미해결 질문

v1에서 `projection`이 임의의 ref를 받을지, 아니면 한 실험 내의 ref만 받을지 — 단일 실험 쪽으로 기우는 중;
TODO(open-question).

## 런북에 대한 함의

Phase-0은 이 시그니처들과 Zod 스키마를 빈 계약으로 정의하며, 이후 단계에서 이미 스텁(stub)으로 만들어 둔
포트/리포지토리에 대해 각 서비스를 구현한다.

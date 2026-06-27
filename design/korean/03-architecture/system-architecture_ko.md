# 시스템 아키텍처 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries_ko.md](./component-boundaries_ko.md), [data-flow_ko.md](./data-flow_ko.md), [tech-stack_ko.md](./tech-stack_ko.md), [repo-structure_ko.md](./repo-structure_ko.md), [../01-decisions/ADR-0001-product-surface_ko.md](../01-decisions/ADR-0001-product-surface_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

CAW-01의 상위 수준 컨테이너 뷰: 공유 코어, 세 개의 surface(표면), engine-adapter 포트(ports), 프로세스 외부(out-of-process)의 Python 엔진, 그리고 데이터 계층 — 여기에 단방향 의존성 규칙을 더한다. 모듈 수준의 인터페이스와 강제(enforcement) 방식은 [component-boundaries_ko.md](./component-boundaries_ko.md)에 있다.

## 단방향 의존성 규칙

```
surfaces  ─►  @caw/core services  ─►  engine-adapter PORTS ─►  (Python engine)
                      │
                      └────────────►  repository interfaces ─►  (data layer)
```

화살표는 **아래로만** 향한다. surface는 코어에 의존하고, 코어는 *포트/인터페이스*에 의존하며, 구체적인 엔진이나 DB에는 절대 의존하지 않는다. 패키지 경계 lint 규칙과 "`@caw/core`에 `next` 의존성 제로" 규칙으로 강제된다 ([ADR-0001](../01-decisions/ADR-0001-product-surface_ko.md), [ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md)).

## 컨테이너 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SURFACES (thin)                              │
│  ┌───────────────┐     ┌───────────────┐      ┌───────────────┐          │
│  │  Web app      │     │  MCP server   │      │  CLI          │          │
│  │  (Next.js)    │     │  (agents)     │      │  (scripts)    │          │
│  └──────┬────────┘     └──────┬────────┘      └──────┬────────┘          │
└─────────┼─────────────────────┼──────────────────────┼──────────────────┘
          └─────────────────────┼──────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     @caw/core  (TypeScript, zero next)                    │
│  ExperimentService · RunService · RegistryService · WorkTreeService ·     │
│  EvidenceService        +  Zod schemas (the one validation contract)      │
└───────────┬───────────────────────────────────────────┬──────────────────┘
            ▼ engine-adapter ports                       ▼ repository interfaces
┌──────────────────────────────────┐        ┌────────────────────────────────┐
│  Python engine (out-of-process)  │        │       Data layer                │
│  syntorch capture · Chakra       │        │  Postgres/SQLite (rows, graph   │
│  exporter · LLMServingSim ·      │        │  via adjacency+CTE, pgvector)   │
│  ASTRA-sim (±SST) · L0 lowering  │        │  + filesystem/object store      │
└──────────────────────────────────┘        │    (trace blobs by path/URI)    │
                                             └────────────────────────────────┘
```

## 컨테이너

| Container | Tech | 책임 |
| --- | --- | --- |
| **Web app** | Next.js App Router | 주된 사람용 surface: 내비게이션 바, 1:9 Simulation 화면, 세 개의 캔버스, work-tree 리뷰. 표현(presentation) 전용 — 도메인 로직 없음. |
| **MCP server** | TS over `@caw/core` | 코어 연산을 도구(tool)로 노출하여 다른 에이전트가 워크벤치를 구동할 수 있게 한다. |
| **CLI** | TS over `@caw/core` | 동일한 연산에 대한 스크립트 가능한(scriptable) 접근. |
| **@caw/core** | TypeScript | 모든 도메인 로직 + Zod 계약. 동작의 단일 출처(single source). |
| **Python engine** | Python service | syntorch capture, Chakra export, LLMServingSim, ASTRA-sim, 그리고 Chakra→L0 lowering을 실행한다. 포트를 통해 호출되며, Next.js 프로세스에서는 절대 실행되지 않는다. |
| **Data layer** | Postgres/SQLite + FS | 기록 시스템(system of record, 행+그래프)이자 아티팩트 저장소(경로 기반 blob). |

## TS ⇆ Python 이음새(seam)

코어와 엔진은 서로 다른 런타임이다. 둘은 타입이 지정된 계약을 갖춘 **engine-adapter 포트**를 통해 통신한다. 큰 아티팩트는 **절대** 인라인으로 전달되지 않는다 — 엔진이 아티팩트 저장소에 blob을 쓰고 코어가 기록하는 **path/URI**를 반환한다 ([ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md), [ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)). [../07-backend-api/simulation-runtime-service_ko.md](../07-backend-api/simulation-runtime-service_ko.md)를 참고하라.

## 횡단 관심사(cross-cutting concerns)

- **검증(Validation):** `@caw/core`의 Zod 스키마가 모든 surface가 재사용하는 단일 계약이다.
- **출처(Provenance):** 모든 run/commit은 누가/언제/어느 surface에서 했는지를 담는다 ([ADR-0007](../01-decisions/ADR-0007-change-management-worktree_ko.md)).
- **충실도 계층(Fidelity tiers):** 분석적(analytical) 백엔드가 기본값이며, ns-3/SST는 플래그(flag) 뒤에 둔다 ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)).

## 미해결 질문(Open questions)

TS⇆Python 이음새의 정확한 전송 방식(subprocess + JSON-RPC 대 로컬 HTTP 대 큐)은 TODO(open-question)이며 [../07-backend-api/simulation-runtime-service_ko.md](../07-backend-api/simulation-runtime-service_ko.md)에서 해결된다.

## 런북(runbook)에 대한 함의

Phase-0에서 모노레포 + `@caw/core` 골격 + 데이터 계층을 스캐폴딩하고, phase-5에서 Python 엔진 서비스와 MCP/CLI 어댑터를 연결한다. 단방향 의존성 규칙은 phase-0에서 도입되는 CI 체크다.

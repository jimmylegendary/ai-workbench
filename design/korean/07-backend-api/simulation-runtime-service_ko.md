# 시뮬레이션 런타임 서비스 (Python 엔진 이음새) — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-surface_ko.md](./api-surface_ko.md), [../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md](../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md), [../03-architecture/system-architecture_ko.md](../03-architecture/system-architecture_ko.md), [../01-decisions/ADR-0005-trace-pipeline_ko.md](../01-decisions/ADR-0005-trace-pipeline_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

프로세스 외부(out-of-process)의 Python 엔진 서비스와 TS⇆Python 이음새(seam)를 정의한다: `@caw/core`가 어떻게
실행을 호출하고, 상태를 스트리밍하며, 아티팩트 경로를 넘겨받는지를 다룬다. 트레이스 파이프라인 내용은
[../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md](../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md)에 있다.

## 왜 프로세스 외부인가

엔진은 Python(syntorch, LLMServingSim, ASTRA-sim, Chakra 툴체인)이고, 코어는 TypeScript이다. 둘은 별개의
프로세스로 실행되며, 엔진은 Next.js 프로세스 안에서 **절대** 실행되지 않는다([ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md)).

## 이음새 계약

`@caw/engine-adapters`는 Python 서비스와 통신함으로써 코어의 엔진 포트를 구현한다. 각 포트는 하나의 엔진
연산에 매핑된다:

```
SyntorchCapturePort.capture(spec)            -> { chakraPaths[], meta }
ChakraExporterPort.toChakra(nativeTracePath) -> { etPaths[] }
ServingSimPort.run(simConfig)                -> { chakraPaths[], metrics }
AstraSimPort.simulate(etPaths, hwConfig, backend) -> { metrics, artifactPaths[] }
L0LoweringPort.lower(etPaths, opts)          -> { irPath, rollups }
```

## 전송 방식 (결정 예정)

| 옵션 | 장점 | 단점 |
| --- | --- | --- |
| Subprocess + stdio 위 JSON-RPC | 단순, 네트워크 불필요 | 단일 호스트만 가능 |
| 로컬 HTTP (FastAPI) | 스트리밍 가능, 디버깅 용이 | 추가로 실행할 서비스 발생 |
| 작업 큐(예: Redis/RQ) | 내구성 있음, 확장 가능 | v1에는 과한 무게 |

v1은 **로컬 HTTP (FastAPI) + 상태용 SSE** 쪽으로 기우는 중; 최종 선택은 TODO(open-question)
([../03-architecture/system-architecture_ko.md](../03-architecture/system-architecture_ko.md)).

## 아티팩트 인계

엔진은 블롭(blob)을 아티팩트 저장소에 쓰고 **경로/URI**를 반환한다. 코어는 인라인 블롭을 절대 받지 않는다.
경로 규약은 [../04-data-layer/storage-strategy_ko.md](../04-data-layer/storage-strategy_ko.md)에 있다.

## 상태 스트리밍

하나의 실행은 축별(per-axis) 진행 상황(queued/running/done/failed)을 `RunService.status`로 다시 스트리밍하며,
이는 Route Handler (SSE)를 통해 웹 앱에, follow 모드를 통해 CLI에 노출된다.

## 출처(Provenance) 고정

엔진은 재현성을 위해 각 실행마다 자신의 버전 고정값(vLLM, Chakra et_def.proto rev, ASTRA-sim rev)을 보고한다
([../05-caw01-simulation-control-plane/simulation-engine-and-projection_ko.md](../05-caw01-simulation-control-plane/simulation-engine-and-projection_ko.md)).

## 미해결 질문

- 전송 방식 선택(stdio vs HTTP vs 큐) — TODO(open-question).
- LLMServingSim에 내장된 ASTRA-sim을 호출할지, 아니면 독립형 ASTRA-sim을 호출할지 — TODO(open-question)
  ([../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)).

## 런북에 대한 함의

Phase-4는 포트 뒤에 엔진 서비스 + 어댑터를 세운다. 레퍼런스가 되는 Chakra→ASTRA-sim 왕복(round-trip)이
syntorch 연결에 앞선 첫 번째 런북이다.

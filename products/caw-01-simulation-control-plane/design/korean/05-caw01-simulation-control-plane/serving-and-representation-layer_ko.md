# Serving & Representation 레이어 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [canvas-2-serving-representation_ko.md](./canvas-2-serving-representation_ko.md), [trace-pipeline-syntorch-chakra_ko.md](./trace-pipeline-syntorch-chakra_ko.md), [../01-decisions/ADR-0005-trace-pipeline_ko.md](../01-decisions/ADR-0005-trace-pipeline_ko.md), [../02-research/serving-and-simulation-frameworks_ko.md](../02-research/serving-and-simulation-frameworks_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

사용자가 Canvas 2에서 구성(compose)하는 것을 정의한다: 주어진 LLM model에 대해 **어떤 serving framework**,
**어떤 representation layer**, **어떤 simulator path**를 실행할지, 그리고 배선(wiring)을 합법으로 만드는 **문법(grammar)** 을 정의한다.
Canvas-2 UX는 [canvas-2-serving-representation_ko.md](./canvas-2-serving-representation_ko.md)에 있고, 그 결과로 생기는
trace 흐름은 [trace-pipeline-syntorch-chakra_ko.md](./trace-pipeline-syntorch-chakra_ko.md)에 있다.

## 세 가지 구성 가능한 차원(dimension)

| 차원 | 선택지 (v1) | 의미 |
| --- | --- | --- |
| **Serving framework** | vLLM (harness) · LLMServingSim | request/serving 루프 |
| **Representation layer** | torch · **syntorch** | `forward()` 아래에서 실행되는 것; syntorch는 sub-torch capture를 가능하게 함 |
| **Simulator path** | ASTRA-sim (analytical) · +SST/ns-3 (flag) | comm/network/compute의 타이밍 방식 |

이들은 하나의 `SimulationConfig`로 매핑된다([../04-data-layer/data-model_ko.md](../04-data-layer/data-model_ko.md)).

## 구성 요소 (연구에서)

- **vLLM** = 실제 serving 루프; `syntorch`는 `model.forward()` 아래의 모든 것을 대체한다(torch frontend 계약).
- **LLMServingSim** = 시뮬레이션된 serving 루프로, **이미 수정된 ASTRA-sim + Chakra를 내장**한다(iteration마다 Chakra 방출).
- **ASTRA-sim** = Chakra ET를 소비; analytical 백엔드가 기본; ns-3/SST는 flag 뒤에 둔다.
- **syntorch** = 커스텀 kernel/HW 로직과 Chakra exporter를 갖춘 drop-in torch frontend([SOURCE-BRIEF §7](../_meta/SOURCE-BRIEF_ko.md)).

## 파이프라인 문법 (합법적인 배선)

Canvas 2는 실행 전에 구성이 이 문법에 부합하는지 검증한다:

```
LLM model ─► serving{ vLLM | LLMServingSim }
serving=vLLM      ─► representation{ torch | syntorch }
  representation=syntorch ─► [syntorch capture] ─► [Chakra exporter] ─► chakra.et ─► ASTRA-sim{analytical|+SST}
  representation=torch    ─► (no sub-torch capture; real/aux only)
serving=LLMServingSim ─► (embeds Chakra+ASTRA-sim) ─► chakra/metrics
ALL axes ─► [Chakra→L0 lowering] ─► one L0 IR
```

검증 규칙 (Canvas 2의 typed handle):
- syntorch는 torch frontend를 노출하는 serving framework(vLLM harness) 아래에서만 부착 가능하다.
- Chakra exporter는 반드시 ASTRA-sim보다 앞서야 한다.
- ASTRA-sim/SST를 실행하려면 그 전에 하드웨어 구성(Canvas 3)이 필요하다.
- 시뮬레이션 축(LLMServingSim)과 합성 축(synthetic axis, syntorch)은 비교를 위해 둘 다 **동일한** L0를 대상으로 삼을 수 있다.

## 구성 → 실행

유효한 구성 + Canvas-1 workload + Canvas-3 하드웨어 구성 = 실행 가능한 `Experiment`.
`RunService.start`는 활성화된 각 축을 엔진으로 디스패치한다([../03-architecture/data-flow_ko.md](../03-architecture/data-flow_ko.md)).

## 미해결 질문

브리프의 `LLMServingSim → syntorch → ASTRA-sim` 순서는 LLMServingSim이 이미 ASTRA-sim을 내장한다는 점과
충돌한다. v1 해법: 체이닝(chaining) 대신 **여러 축을 병렬로 실행하여 하나의 L0로 모은다**; syntorch가 대신
LLMServingSim의 per-op 비용 모델을 대체해야 하는지는 TODO(open-question)
([../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)).

## 런북에 대한 시사점

phase-2 Canvas-2 런북이 문법/검증을 구현하고, phase-3/4 런북이 엔진 포트(engine port) 뒤에서 축별
디스패치를 구현한다.

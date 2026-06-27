# Simulation 엔진 & Projection — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [l0-ir-schema_ko.md](./l0-ir-schema_ko.md), [trace-pipeline-syntorch-chakra_ko.md](./trace-pipeline-syntorch-chakra_ko.md), [control-panel-and-run-lifecycle_ko.md](./control-panel-and-run-lifecycle_ko.md), [../07-backend-api/simulation-runtime-service_ko.md](../07-backend-api/simulation-runtime-service_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

프로세스 외부(out-of-process) 엔진 내부의 실행 수명주기, fidelity tier, 생성되는 metric, 그리고 두 축/실행을
하나의 실험 행(experiment row)으로 비교 가능하게 만드는 **comparable projection**을 정의한다.

## 실행 수명주기 (상태 기계)

```
draft ─► queued ─► running ─► done
                        └────► failed
                        └────► stopped (user)
```

- `RunService.start`는 구성을 검증하고, `SimulationRun(status=queued)`을 영속화하며, 활성화된 축을 디스패치한다.
- `RunService.status`는 축별로 진행 상황을 스트리밍한다([../03-architecture/data-flow_ko.md](../03-architecture/data-flow_ko.md)).
- 완료 시 엔진은 **artifact 경로 + metric**을 반환하며, core가 이를 하나의 트랜잭션으로 등록한다.

## Fidelity tier

| Tier | 백엔드 | 사용 시점 |
| --- | --- | --- |
| **Default** | ASTRA-sim analytical | 빠른 반복; v1 기본 |
| Higher | ns-3 / SST-Merlin (flag) | network 신뢰성이 필요할 때 (연기됨) |

tier는 `SimulationConfig`의 일부이며, tier 전환은 L0 스키마를 바꾸어서는 안 되고 타이밍 fidelity만 바꿔야 한다.

## 생성되는 metric

| Metric | 출처 | 비고 |
| --- | --- | --- |
| capacity_peak_bytes | L0 rollup | 시간에 대한 live-tensor bytes의 최대값 |
| traffic_bytes(_per_tier) | L0 rollup | Σ movement bytes |
| latency / iteration_time | ASTRA-sim | fidelity tier별 |
| (축별 추가 항목) | engine | 승격되기 전까지는 불투명(opaque) |

## Comparable projection

**projection**은 실행/축을 정렬하여 하나의 행으로 읽을 수 있게 한다:

```
projection(experiment, refs[]) = [
  { axis: 'synthetic',  capacity_peak, traffic, latency, fill_level: 'L0', trust_rung: n },
  { axis: 'simulation', capacity_peak, traffic, latency, fill_level: 'L0', trust_rung: m },
  { delta: { capacity_peak: …, traffic: … } }   // cross-axis agreement
]
```

- 동일한 L0 + 동일한 단위 → delta가 의미를 갖는다.
- `trust_rung`은 trust ladder(신뢰 사다리)에서 온다([../04-data-layer/knowledge-substrate_ko.md](../04-data-layer/knowledge-substrate_ko.md)).
- projection은 제어 패널이 렌더링하는 것이자, CAW-01이 자신의 export 경계에서 증거 artifact로 방출하는 것이다(CAW-03 같은 다른 독립 제품이 소비 가능).

## 결정성 & 재현성

- 한 번의 실행은 `(WorkloadModel, SimulationConfig, hw_node tree, engine version pins)`로부터 재현 가능하다.
- 엔진 버전 고정(vLLM, Chakra rev, ASTRA-sim rev)은 출처(provenance)를 위해 실행에 기록된다.

## 미해결 질문

trust ladder에서 무엇을 "cross-axis agreement(축 간 합치)"로 볼 것인가에 대한 허용 오차 — 수치 임계값은
TODO(open-question)([../08-research-plan/validation-and-golden-tests_ko.md](../08-research-plan/validation-and-golden-tests_ko.md)).

## 런북에 대한 시사점

phase-3가 수명주기 + 집계(rollup) + projection을 구현하고; 제어 패널 런북(phase-1/2)이 상태와 projection을
렌더링하며; golden-test 런북이 cross-axis agreement를 검증한다.

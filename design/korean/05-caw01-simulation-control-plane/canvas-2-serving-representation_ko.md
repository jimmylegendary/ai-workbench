# Canvas 2 — 서빙 & 표현(Serving & Representation) — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [serving-and-representation-layer.md](./serving-and-representation-layer_ko.md), [canvas-1-ai-workload-flow.md](./canvas-1-ai-workload-flow_ko.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation_ko.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

Canvas 2의 UX + 데이터 매핑을 규정한다: 선택한 LLM 모델에 대해 serving framework × representation layer × simulator path를 구성하며, 파이프라인 grammar에 대해 실시간 검증을 수행한다. grammar 자체는 [serving-and-representation-layer.md](./serving-and-representation-layer_ko.md)에 있다.

## 무엇을 보여주는가

사용자가 run 토폴로지를 배선하는 노드/플로우 구성:

```
[LLM model] ─► [serving: vLLM | LLMServingSim] ─► [representation: torch | syntorch]
   ─► [Chakra exporter] ─► [ASTRA-sim: analytical | +SST] ─► [→ L0]
```

## 노드 & 핸들 모델 (타입 지정)

| 노드 | 타입 지정 출력 핸들 | 허용 대상 |
| --- | --- | --- |
| LLM model | `model` | serving.in |
| serving (vLLM/ServingSim) | `serving` | representation.in / sim.in |
| representation (torch/syntorch) | `repr` | exporter.in |
| Chakra exporter | `chakra.et` | astrasim.in |
| ASTRA-sim | `metrics`,`et` | lowering.in |

연결은 grammar(타입 지정된 source/target 핸들)에 대해 검증되며, 부적합한 배선은 인라인 사유와 함께 거부된다([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)).

## 유효한 구성의 결과

검증된 그래프는 **`SimulationConfig`**로 직렬화된다([../04-data-layer/data-model.md](../04-data-layer/data-model_ko.md)): serving_choice, representation, simulator_path, backend, hw_config_ref. 이것이 `RunService.start`가 소비하는 대상이다.

## 상호작용

- 드래그로 배선하며, 부적합한 엣지는 사유를 표시한다(grammar 위반, 하드웨어 config 누락).
- 노드를 선택하면 그 config가 표시된다(예: ASTRA-sim backend = analytical).
- 편집은 `c2_wiring` kind의 **change_blob**을 생성한다([change-management-worktree.md](./change-management-worktree_ko.md)).

## 조율(Coordination)

ASTRA-sim/SST를 실행하려면 먼저 Canvas-3 하드웨어 config가 필요하며, 그 요구사항을 인라인으로 노출한다. serving 단계를 선택하면 Canvas 1의 관련 agent-turn step을 하이라이트할 수 있다.

## 미해결 질문

syntorch의 op별 cost-model 치환을 노드 옵션으로 노출할지 여부(ordering 미해결 질문과 연관됨) — TODO(open-question) ([../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)).

## 런북에 대한 함의

Phase-2 Canvas-2 런북은 타입 지정 핸들 그래프, grammar 검증, 그리고 직렬화→SimulationConfig 단계를 구축한다.

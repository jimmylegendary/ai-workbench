# Canvas 1 — AI 워크로드 플로우 (agent-turn) — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [l0-ir-schema.md](./l0-ir-schema_ko.md), [canvas-2-serving-representation.md](./canvas-2-serving-representation_ko.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation_ko.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

Canvas 1의 UX + 데이터 매핑을 규정한다: **단일 agent-turn**을 L0 IR에 매핑되는 검사 가능한 플로우 그래프로 시각화한다. 렌더링(React Flow)은 [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation_ko.md)에서 다룬다.

## 무엇을 보여주는가

하나의 **agent-turn** = AI 워크로드의 단위. 캔버스는 해당 turn을 step/op 및 그 데이터 이동의 방향 그래프로 렌더링한다 — 궁극적으로 L0 op/tensor/movement 그래프가 되는 "워크로드가 무엇인가" 뷰이다.

## 노드 & 엣지 타입

| 요소 | 표현 대상 | L0 매핑 |
| --- | --- | --- |
| **Step node** | turn의 한 단계(예: prefill, decode, tool-call) | `ops`의 서브그래프 |
| **Op node** | 단일 연산 | L0 `op` (op_class, strategy_id) |
| **Tensor port** | op의 입/출력 텐서 | L0 `TensorNode` (size, dtype, lifetime) |
| **Flow edge** | 데이터 이동 / 의존성 | L0 `DataMovementEdge` (bytes, tiers) |

op 노드를 선택하면 해당 L0 필드가 드러나고, 텐서를 선택하면 size/lifetime이 표시된다([../00-overview/personas-and-use-cases.md](../00-overview/personas-and-use-cases_ko.md)의 UC-4).

## 상호작용

- 팬/줌, step 노드 확장/축소, 노드 상세 검사.
- 편집(예: strategy_id 변경, 워크로드 파라미터 조정)은 `c1_node` kind의 **change_blob**을 생성한다([change-management-worktree.md](./change-management-worktree_ko.md)).
- 캡처된 run에 대해서는 주로 읽기 전용이며, `WorkloadModel` 작성 시에는 편집 가능하다.

## 그래프의 출처

| 모드 | 그래프 출처 |
| --- | --- |
| Author | 사용자가 정의한 `WorkloadModel` (agent-turn 명세) |
| Inspect | 완료된 run의 L0 IR (synthetic 또는 simulation 축) |

## 조율(Coordination)

여기서의 선택은 공유 store를 통해 Canvas 2의 대응하는 serving 단계와 Canvas 3의 실행 하드웨어를 하이라이트할 수 있다([../06-frontend/state-management.md](../06-frontend/state-management_ko.md)).

## 미해결 질문

agent-turn 구조를 수작업으로 작성하는 비중과 캡처된 L0에서 가져오는 비중이 각각 얼마인지 — TODO(open-question).

## 런북에 대한 함의

Phase-2 Canvas-1 런북은 React Flow 그래프 + L0 필드 인스펙터 + 편집→change_blob 연결을 구축한다.

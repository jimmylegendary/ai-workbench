# RB-021: Canvas 1 — AI 워크로드 플로우 (agent-turn)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-020]
- Implements design: [canvas-1-ai-workload-flow.md](../../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow_ko.md), [l0-ir-schema.md](../../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)
- Produces: step/op/tensor 노드, L0 필드 인스펙터, edit→change_blob을 갖춘 Canvas 1

## 목표

Canvas 1은 단일 agent-turn을 플로우 그래프(step → op 노드, tensor 포트, flow 엣지)로 렌더링하며, 이는
L0 `TensorNode`/`DataMovementEdge`에 매핑된다. L0 필드를 보여주는 인스펙터와 함께, 편집은 `c1_node` change_blob을 생성한다.

## 사전 조건

- [ ] RB-020(React Flow 기반) 완료.

## 단계

1. **Do:** [canvas-1-ai-workload-flow.md](../../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow_ko.md)에 따라 노드 타입 `StepNode`, `OpNode`, tensor-port 핸들, `FlowEdge`를 정의한다.
   **Verify:** `view:` 예시 agent-turn이 step 노드의 펼치기/접기와 함께 렌더링된다.
2. **Do:** 인스펙터 추가: `OpNode`를 선택하면 L0 op 필드(op_class, strategy_id)를 보여주고; tensor를 선택하면 size/dtype/lifetime을 보여준다.
   **Verify:** `view:` op/tensor 선택이 올바른 L0 필드를 보여준다(UC-4).
3. **Do:** 두 가지 소스를 지원한다: author 모드(사용자 정의 `WorkloadModel`)와 inspect 모드(run의 L0 IR로부터).
   **Verify:** `test:` 샘플 L0를 로드하면 그것이 lowering된 동일한 그래프가 렌더링된다.
4. **Do:** 편집 시(예: strategy_id / workload 파라미터 변경) `intent_event` + `c1_node` change_blob을 방출한다; dirty로 표시한다.
   **Verify:** `test:` 편집이 change_blob을 생성하고 work-tree를 dirty 상태로 만든다.

## 수용 기준

- [ ] agent-turn이 step/op/tensor/edge 그래프로 렌더링된다.
- [ ] 인스펙터가 시각적 op/tensor를 해당 L0 필드로, 그리고 그 역으로 매핑한다.
- [ ] 편집이 `c1_node` change_blob과 dirty 상태를 생성한다.

## 롤백 / 안전성

UI이므로 롤백하려면 되돌린다. inspect 모드는 읽기 전용이다; author 편집은 work-tree를 통해 되돌릴 수 있다.

## 인계(Hand-off)

Canvas 1은 실험의 워크로드 절반을 작성/검사할 수 있다; 그 L0 매핑은 엔진(phase-3)이 lowering하는 계약(contract)이다.

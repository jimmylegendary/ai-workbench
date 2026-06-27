# CAW-01 개요 (폴더 맵)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** 이 폴더의 모든 문서; [../00-overview/vision_ko.md](../00-overview/vision_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

CAW-01 Simulation Control Plane 폴더의 색인이자 멘탈 모델이다. 화면 구조(screen anatomy)를 기술하고
각 세부 명세로 연결한다. 해당 명세들을 중복해서 담지는 않는다.

## 화면 구조 (screen anatomy)

```
┌───────────────────────────────────────────────────────────────────────┐
│ NAV BAR:  Simulation │ Module Design │ User │ Setting                   │
├──────────┬────────────────────────────────────────────────────────────┤
│ CONTROL  │  WORKSPACE  (right "9")                                      │
│ PANEL    │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────────┐   │
│ (left    │  │ Canvas 1    │ │ Canvas 2    │ │ Canvas 3             │   │
│  "1")    │  │ AI Workload │ │ Serving &   │ │ Hardware Design      │   │
│          │  │ Flow        │ │ Representation│ (chip→…→cluster)     │   │
│ run/stop │  │ (agent-turn)│ │ (compose)   │ │ (3D, drill, edit)    │   │
│ save     │  └─────────────┘ └─────────────┘ └──────────────────────┘   │
│ status   │                  ── coordinated by one work-tree ──          │
└──────────┴────────────────────────────────────────────────────────────┘
        1   :                          9
```

## 단위(unit)

하나의 재현 가능한 실험: `(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection`.
세 개의 canvas가 이 화살표의 왼쪽을 작성하고, 엔진이 오른쪽을 생성한다.

## 문서 맵

| 관심사 | 문서 |
| --- | --- |
| 메모리 주석이 달린 IR (가장 중요한 표면) | [l0-ir-schema_ko.md](./l0-ir-schema_ko.md) |
| serving framework × representation × simulator 선택 | [serving-and-representation-layer_ko.md](./serving-and-representation-layer_ko.md) |
| syntorch capture → Chakra → ASTRA-sim, L0로 정규화 | [trace-pipeline-syntorch-chakra_ko.md](./trace-pipeline-syntorch-chakra_ko.md) |
| 실행 수명주기, fidelity tier, comparable projection | [simulation-engine-and-projection_ko.md](./simulation-engine-and-projection_ko.md) |
| Canvas 1 — agent-turn flow | [canvas-1-ai-workload-flow_ko.md](./canvas-1-ai-workload-flow_ko.md) |
| Canvas 2 — serving/representation 구성 | [canvas-2-serving-representation_ko.md](./canvas-2-serving-representation_ko.md) |
| Canvas 3 — HW 계층 설계 | [canvas-3-hw-design_ko.md](./canvas-3-hw-design_ko.md) |
| 제어 패널 + 실행 수명주기 UX | [control-panel-and-run-lifecycle_ko.md](./control-panel-and-run-lifecycle_ko.md) |
| canvas 전반의 work-tree UX | [change-management-worktree_ko.md](./change-management-worktree_ko.md) |

canvas들의 렌더링 구현은 [../06-frontend/canvas-rendering-implementation_ko.md](../06-frontend/canvas-rendering-implementation_ko.md)에 있으며,
IR/work-tree의 저장은 [../04-data-layer/](../04-data-layer/)에 있다.

## 미해결 질문

ServingSim/ASTRA-sim 순서와 syntorch capture altitude(포착 고도) 문제(참고:
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)).

## 런북에 대한 시사점

이 폴더는 phase-2(canvas), phase-3(engine), phase-4(trace) 런북에 1:1로 대응된다.

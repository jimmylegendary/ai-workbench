# 상태 관리(State Management) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [ui-architecture-nextjs.md](./ui-architecture-nextjs_ko.md), [canvas-rendering-implementation.md](./canvas-rendering-implementation_ko.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

세 캔버스 + 컨트롤 패널 + work-tree를 협응시키는 단일 Zustand 스토어를 정의하고, 무엇이 클라이언트 상태이고 무엇이 서버 source of truth인지에 대한 규칙을 정의한다.

## 하나의 스토어, 슬라이스로 분할

```ts
useWorkbenchStore = {
  selection: { canvas: 'c1'|'c2'|'c3', nodeId?: string, partId?: string },  // cross-canvas selection
  c1: { graph, dirtyBlobs },        // agent-turn flow
  c2: { graph, validation },        // serving/representation wiring
  c3: { sceneCursor, loadedSubtrees, partId },  // HW drill-down state
  worktree: { head, dirty, branches, diff },
  run: { status, perAxis, projection },
  layout: { focus, dividerRatio },  // UI-local, not versioned
}
```

단일 스토어를 두는 이유는 캔버스 간 협응이다 ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)): 한 캔버스에서의 `selection` 변경이 다른 캔버스의 관련 요소들을 하이라이트한다.

## 클라이언트 상태 vs 서버 source of truth

| 상태 | 위치 | 영속화 경로 |
| --- | --- | --- |
| Selection, focus, divider, 일시적(transient) drill-down | Zustand (클라이언트 전용) | 영속화되지 않음 |
| 진행 중인 편집(dirty) | Zustand + `intent_event` | Server Actions → WorkTreeService를 통해 커밋됨 |
| 커밋된 config, run, IR, metrics | 서버(DB) | source of truth; 스토어로 로드됨 |

스토어는 **캐시 + 인터랙션 계층**이며, 커밋된 데이터에 대한 source of truth는 결코 아니다.

## 낙관적 업데이트(Optimistic updates)

- 편집은 스토어에 낙관적으로 적용되며 `intent_event`를 방출한다; 저장 실패 시 낙관적 변경은 되돌려진다(revert).
- Run 상태는 서버 스트림(Route Handler)이며 낙관적이지 않다.

## Selection 모델

- `partId`(Canvas 3 피킹)와 `nodeId`(Canvas 1/2)가 캔버스 간 키(cross-canvas key)이다 ([../05-caw01-simulation-control-plane/canvas-3-hw-design.md](../05-caw01-simulation-control-plane/canvas-3-hw-design_ko.md)).
- 하드웨어 부품을 선택하면 그 위에서 실행되는 ops(C1)와 그것을 사용하는 serving 경로(C2)를 하이라이트할 수 있다.

## 미해결 질문

리로드 간 레이아웃/선택을 유지하기 위해 영속성 미들웨어(localStorage)를 추가할지 여부 — 사소함; TODO(open-question).

## 런북에 대한 함의

Phase-1은 스토어 골격 + 슬라이스를 생성한다; 각 캔버스 런북(phase-2)은 자신의 슬라이스와 공유 selection을 연결한다.

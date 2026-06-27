# 컴포넌트 인벤토리 — CAW-01 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [layout-and-navigation.md](./layout-and-navigation_ko.md), [open-design-integration.md](./open-design-integration_ko.md), [canvas-rendering-implementation.md](./canvas-rendering-implementation_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

CAW-01 v1에 필요한 컴포넌트 카탈로그로, 각각의 목적, props 스케치, 사용처를 담는다. DTCG 토큰으로 테마가 지정된
shadcn/Radix 프리미티브로부터 구축한다 ([open-design-integration.md](./open-design-integration_ko.md)).

## 셸 & 내비게이션

| 컴포넌트 | 목적 | props 스케치 | 사용처 |
| --- | --- | --- | --- |
| `NavBar` | 상단 시스템 메뉴 | `items[], active` | 모든 화면 |
| `AppShell` | nav + 콘텐츠 슬롯 | `children` | 레이아웃 |
| `SplitPane` | 1:9 크기 조절 가능 분할 | `ratio, min[], onResize` | Simulation 화면 |

## 컨트롤 패널

| 컴포넌트 | 목적 | props 스케치 |
| --- | --- | --- |
| `RunControls` | 실행/중지/구성 | `state, onRun, onStop, onConfigure` |
| `RunStatus` | 축(axis)별 진행/상태 | `perAxis[]` |
| `ProjectionReadout` | 비교 가능한 프로젝션(projection) | `projection` |
| `SaveControls` | 항목별 / 전체 저장 | `dirty, onSaveItem, onSaveAll` |
| `EvidenceList` | 아티팩트 + 준비도(readiness) | `artifacts[], trust` |
| `NextActionHint` | 정직한 다음 단계 | `action` |

## 캔버스

| 컴포넌트 | 목적 | props 스케치 |
| --- | --- | --- |
| `FlowCanvas` | 공유 React Flow 래퍼 (C1/C2) | `nodes, edges, onSelect, validate?` |
| `OpNode` / `TensorPort` | C1 op + tensor 비주얼 | `op` / `tensor` |
| `ServingNode` + 타입 지정 핸들 | C2 배선(wiring) 노드 | `kind, config, handles` |
| `HardwareScene` | C3용 r3f scene | `rootNode, onPick(partId)` |
| `PartInspector` | 선택된 part 편집 | `partId, spec, onEdit, onAddChild` |

## Work-tree

| 컴포넌트 | 목적 | props 스케치 |
| --- | --- | --- |
| `WorkTreeView` | 세 개의 서브트리 트리 + dirty 마커 | `tree, dirty` |
| `DiffView` | ref/branch diff | `refA, refB, diff` |
| `BranchBar` | branch DAG + 전환/생성 | `branches, head, onBranch` |
| `HistoryList` | commit 목록 | `commits[]` |

## 공유 프리미티브 (shadcn/Radix에서)

`Button, Tabs, Dialog, Tooltip, Select, Resizable, ScrollArea, Badge, Toast` — DTCG 토큰으로 테마가 지정된다.

## Inspector 패턴

임의의 캔버스에서 선택하면 컨텍스트에 맞는 inspector가 열린다 (`OpNode`→L0 필드, `PartInspector`→spec).
이는 공유 `selection`에 의해 구동된다 ([state-management.md](./state-management_ko.md)).

## 미해결 질문

work-tree를 스트립(strip)으로, 드로어(drawer)로, 아니면 전용 탭으로 둘지 — 스트립/드로어로 기우는 중; TODO(open-question)
([layout-and-navigation.md](./layout-and-navigation_ko.md)).

## 런북에 대한 시사점

각 phase-1/phase-2 UI 런북은 이 인벤토리의 명명된 부분집합을 구축한다. 이 인벤토리는 v1의 UI 완성도
체크리스트이다.

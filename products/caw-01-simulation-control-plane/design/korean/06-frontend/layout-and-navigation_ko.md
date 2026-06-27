# 레이아웃 & 내비게이션 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [ui-architecture-nextjs.md](./ui-architecture-nextjs_ko.md), [../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md](../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle_ko.md), [component-inventory.md](./component-inventory_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

상단 내비게이션 바와 Simulation 화면의 1:9 분할(resize 동작 포함)을 명세한다. 캔버스별 세부 사항은 `05-*`에 있으며, 컴포넌트 카탈로그는 [component-inventory.md](./component-inventory_ko.md)에 있다.

## 상단 내비게이션 바

모든 화면에 걸쳐 있는 시스템 전역 메뉴:

```
┌──────────────────────────────────────────────────────────────────┐
│  ◰ CAW-01   │ Simulation │ Module Design │ User │ Setting │   ⚙   │
└──────────────────────────────────────────────────────────────────┘
```

- **Simulation** — 아래의 작업 화면(기본값).
- **Module Design**, **User**, **Setting** — 표준 앱 메뉴(v1에서 스캐폴드됨).

## Simulation 화면 — 1:9 분할

```
┌──────────────────────────────────────────────────────────────────┐
│ NAV BAR                                                            │
├────────────┬─────────────────────────────────────────────────────┤
│ CONTROL    │  WORKSPACE                                            │
│ PANEL      │   ┌──────────┬──────────┬───────────────────────┐    │
│  (1)       │   │ Canvas 1 │ Canvas 2 │ Canvas 3 (3D)         │    │
│            │   │          │          │                       │    │
│ run/stop   │   │          │          │                       │    │
│ status     │   └──────────┴──────────┴───────────────────────┘    │
│ projection │   work-tree strip (tree / diff / branch)             │
│ save       │                                                       │
└────────────┴─────────────────────────────────────────────────────┘
     1        :                          9
```

- 왼쪽 **1** = 컨트롤 패널 ([../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md](../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle_ko.md)).
- 오른쪽 **9** = 서로 협응하는 세 개의 캔버스 + work-tree strip을 포함한 workspace.

## 세 캔버스의 workspace 배치

- 기본값: 세 캔버스가 workspace를 공유한다; 활성 캔버스는 확장(focus 모드)될 수 있고 나머지는 레일(rail)로 접히며, 캔버스 간 선택은 유지된다.
- work-tree 뷰는 "9" 영역 내의 strip/drawer이다 ([../05-caw01-simulation-control-plane/change-management-worktree.md](../05-caw01-simulation-control-plane/change-management-worktree_ko.md)).

## Resize 동작

- 1:9 비율이 기본값이다; 분할선은 합리적인 최소 너비를 가진 채 드래그 가능하다(컨트롤 패널은 사용 불가능한 수준으로 접히지 않고, 캔버스는 최소한의 인터랙티브 영역을 유지한다).
- 레이아웃 상태는 UI 로컬(UI-local)이며 experiment work-tree의 일부가 아니다.

## 미해결 질문

세 캔버스를 기본적으로 탭(tab), 타일(tile), 아니면 focus+rails 레이아웃으로 할지 — focus+rails 쪽으로 기울고 있음; TODO(open-question), Canvas-3 스파이크로 검증할 것.

## 런북에 대한 함의

Phase-1 레이아웃 런북은 phase-2에서 캔버스가 구현되기 전에 내비게이션 바 + 1:9 분할 + workspace 컨테이너 + work-tree strip 플레이스홀더를 구축한다.

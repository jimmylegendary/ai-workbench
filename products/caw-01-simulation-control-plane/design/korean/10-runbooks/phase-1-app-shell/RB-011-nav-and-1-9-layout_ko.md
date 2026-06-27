# RB-011: Nav 바 + Simulation 1:9 레이아웃

- Status: ready
- Phase: phase-1-app-shell
- Depends on: [RB-010]
- Implements design: [layout-and-navigation.md](../../06-frontend/layout-and-navigation_ko.md), [component-inventory.md](../../06-frontend/component-inventory_ko.md), [../../05-caw01-simulation-control-plane/overview.md](../../05-caw01-simulation-control-plane/overview_ko.md)
- Produces: `NavBar`, `AppShell`, `SplitPane`, Simulation 화면 골격

## 목표

시스템 nav 바와, Simulation 화면의 크기 조절 가능한 1:9 분할(제어 패널 : 작업 공간), 그리고 세 개의 캔버스 + work-tree 스트립 플레이스홀더를 담는 작업 공간 컨테이너.

## 사전 조건

- [ ] RB-010(앱 셸) 완료.

## 단계

1. **Do:** server 레이아웃에 `NavBar`(Simulation / Module Design / User / Setting)를 구축한다; 활성 라우트를 강조 표시한다.
   **Verify:** `view:` 모든 라우트에 nav가 렌더링된다; 활성 상태가 정확하다.
2. **Do:** `SplitPane`(Resizable)을 구축하고 Simulation 라우트에 기본 **1:9** 비율과 최소 너비로 배치한다.
   **Verify:** `view:` 왼쪽 "1"과 오른쪽 "9" 영역이 렌더링된다; 구분선이 최소 한계 내에서 드래그된다.
3. **Do:** 왼쪽 영역: [control-panel-and-run-lifecycle.md](../../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle_ko.md)에 따른 섹션 슬롯(Run / Status / Projection / Save / Evidence / Next action)을 갖춘 `ControlPanel` 플레이스홀더.
   **Verify:** `view:` 모든 섹션이 플레이스홀더로 존재한다.
4. **Do:** 오른쪽 영역: 세 개의 캔버스 슬롯(OQ에 따른 focus+rails; 기본 배치)과 work-tree 스트립 플레이스홀더를 갖춘 `Workspace` 컨테이너.
   **Verify:** `view:` 라벨이 붙은 세 개의 캔버스 슬롯 + work-tree 스트립이 렌더링된다.

## 수용 기준

- [ ] 모든 라우트에 올바른 활성 상태로 nav 바가 표시된다.
- [ ] Simulation 화면이 최소 너비를 갖춘 드래그 가능한 1:9 분할을 보여준다.
- [ ] 제어 패널 섹션 슬롯과 세 개의 캔버스 슬롯 + work-tree 스트립이 존재한다(플레이스홀더).

## 롤백 / 안전성

UI 전용이므로, 롤백하려면 컴포넌트를 되돌린다. 레이아웃 상태는 UI 로컬이며 work-tree에 영속되지 않는다.

## 인계(Hand-off)

캔버스 런북(phase-2)이 실제 캔버스를 세 슬롯에 마운트한다; 제어 패널 연결 런북(RB-012)이 왼쪽 섹션을 채운다.

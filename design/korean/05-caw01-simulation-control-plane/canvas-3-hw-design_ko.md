# Canvas 3 — 하드웨어 설계(Hardware Design) — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [serving-and-representation-layer.md](./serving-and-representation-layer_ko.md), [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation_ko.md), [../04-data-layer/data-model.md](../04-data-layer/data-model_ko.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

Canvas 3의 UX + 데이터 매핑을 규정한다: 실제 하드웨어처럼 전체 물리적 하드웨어 계층을 드릴다운, 부품 선택, 마이크로 수준 편집과 함께 설계하고 시각화한다. 3D 렌더링 세부사항은 [../06-frontend/canvas-rendering-implementation.md](../06-frontend/canvas-rendering-implementation_ko.md)에 있다.

## 계층 구조

```
cluster ─► rack ─► tray ─► package ─► die ─► chip ─► component
```

각 레벨은 하나의 `hw_node`이다(자기 참조 인접 구조, `spec JSONB`, `part_id`) ([../04-data-layer/data-model.md](../04-data-layer/data-model_ko.md)).

## 무엇을 보여주는가

하드웨어와 유사한 3D 씬(react-three-fiber + drei): 사용자는 cluster를 보고 rack → tray → package → die → chip 순으로 드릴다운한 뒤, 특정 component/part를 선택한다.

## 상호작용 모델

| 동작 | 결과 |
| --- | --- |
| 드릴다운 | 선택된 서브트리의 상세를 온디맨드로 로드한다(전체 cluster를 풀 디테일로 마운트하지 않음) |
| **부품 선택(Pick a part)** | 도메인 **`partId`**(level + path + component)를 반환하며, 원시 렌더러 객체는 반환하지 않는다 ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)) |
| 부품 편집 | `spec` 필드 변경; 미세 단위의 마이크로 수준 변경 |
| component 추가 | 선택된 노드 아래에 자식 `hw_node`를 삽입 |

모든 편집/추가는 `c3_part` kind의 **change_blob**을 생성한다([change-management-worktree.md](./change-management-worktree_ko.md)).

## 성능 접근법 (ADR-0004 기준)

- LOD (`<Detailed/>`), 인스턴싱(`<Instances/>`), frustum culling.
- **드릴다운 시 로드**: 서브트리 상세는 진입할 때만 마운트된다.
- 시간 제한이 있는 **spike**로 현실적인 cluster에서의 인터랙티브 프레임 예산 + pick 정확도를 검증한다; 실패하면 **Konva 2D** 표현으로 폴백한다(결정 가드는 [ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)에 있음).

## 다운스트림으로의 전달

설계된 계층은 다음으로 전달된다:
- **syntorch HW 설계 레이어**(커스텀 chip/구조 가정),
- **ASTRA-sim / SST** compute/network/memory config (`SimulationConfig`의 `hw_config_ref`를 통해),
- L0 movement tier(host/device/tier 이름은 하드웨어 모델에서 도출됨).

## 조율(Coordination)

부품을 선택하면 그 부품이 워크로드를 어디서 실행하는지(Canvas 1)와 어떤 serving/sim path가 그것을 사용하는지(Canvas 2)를 공유 store를 통해 하이라이트할 수 있다.

## 미해결 질문

- 레벨별 정확한 `spec` 필드 집합(어느 것을 일급으로, 어느 것을 불투명하게 둘지) — L0 원칙에 따라 승격; TODO(open-question).
- v1이 3D를 출시할지 2D 폴백을 출시할지는 spike 결과에 달려 있음 — TODO(open-question).

## 런북에 대한 함의

Phase-2 Canvas-3 런북은 먼저 3D spike(게이트)를 실행한 뒤, 드릴다운 + pick→partId + 편집→change_blob을 구축한다; 하드웨어 `spec`은 phase-3/4 엔진 config로 흘러간다.

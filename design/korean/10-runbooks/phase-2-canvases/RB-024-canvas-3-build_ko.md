# RB-024: Canvas 3 — 하드웨어 설계 구축

- Status: blocked
- Phase: phase-2-canvases
- Depends on: [RB-023]   # 3D-vs-2D 결정(OQ-08)이 기록될 때까지 blocked
- Implements design: [canvas-3-hw-design.md](../../05-caw01-simulation-control-plane/canvas-3-hw-design_ko.md), [../../04-data-layer/data-model.md](../../04-data-layer/data-model_ko.md)
- Produces: `HardwareScene` + `PartInspector`, drill-down, pick→partId, edit/add→change_blob

## 목표

RB-023에서 선택된 렌더러 위에 Canvas 3을 구축한다: chip→die→package→tray→rack→cluster를 설계 + 시각화하고,
drill down하며, part(`partId`)를 선택하고, micro-level 편집 / 컴포넌트 추가를 적용하여 `hw_node` 트리에 영속한다.

## 사전 조건

- [ ] RB-023 완료 및 렌더러 결정(OQ-08) 기록됨.

## 단계

1. **Do:** 결정된 렌더러 위에 `HardwareScene`을 구현한다; drill-down 시 로드로 `hw_node` 트리(RB-002)를 로드한다.
   **Verify:** `view:` 저장된 계층 구조가 렌더링된다; drill down하면 서브트리 세부 정보가 필요할 때 로드된다.
2. **Do:** 피킹 → `partId`를 구현한다; `store.selection.partId`에 바인딩한다.
   **Verify:** `test:` part를 선택하면 스토어에 올바른 `partId`가 설정된다.
3. **Do:** `PartInspector`를 구축한다: part의 `spec` 필드(micro-level)를 편집하고 자식 컴포넌트를 추가한다(`hw_node` 삽입).
   **Verify:** `test:` 편집/추가가 `hw_node` 트리를 업데이트하고 `c3_part` change_blob을 방출한다.
4. **Do:** 하드웨어 구성 참조를 `SimulationConfig.hw_config_ref`에 공급하여 Canvas 2 / RunService가 이를 요구할 수 있게 한다.
   **Verify:** `test:` 조합된 실험이 하드웨어 구성 참조를 담고 있다.

## 수용 기준

- [ ] 결정된 렌더러 위에서 전체 계층 구조가 렌더링되고 drill down된다.
- [ ] 피킹이 `partId`를 반환한다; 편집/추가가 `hw_node`에 영속되고 `c3_part` change_blob을 방출한다.
- [ ] 하드웨어 구성을 Canvas 2 / RunService가 참조할 수 있다.

## 롤백 / 안전성

편집은 work-tree 버전 관리된다(되돌릴 수 있음). 구축을 롤백하려면 컴포넌트를 되돌린다.

## 인계(Hand-off)

엔진(phase-4)은 ASTRA-sim/SST 및 syntorch HW 설계 계층을 위해 하드웨어 구성을 소비한다.

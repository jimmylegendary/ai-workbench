# RB-012: Zustand 스토어 + run/save 연결

- Status: ready
- Phase: phase-1-app-shell
- Depends on: [RB-011]
- Implements design: [state-management.md](../../06-frontend/state-management_ko.md), [control-panel-and-run-lifecycle.md](../../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle_ko.md), [api-surface.md](../../07-backend-api/api-surface_ko.md)
- Produces: 단일 Zustand 스토어 + 동작하는 Run/Stop 및 항목별/전체 저장 컨트롤

## 목표

슬라이스(selection, c1, c2, c3, worktree, run, layout)를 갖춘 단일 Zustand 스토어와 동작하는 제어 패널:
Run/Stop은 (스텁 엔진에 대해) `RunService`에 연결되고, 항목별/전체 저장은 `WorkTreeService`에 연결된다.

## 사전 조건

- [ ] RB-011(레이아웃) 완료. 여기서는 미리 준비된 상태를 반환하는 스텁 엔진 어댑터로 충분하다.

## 단계

1. **Do:** [state-management.md](../../06-frontend/state-management_ko.md)의 슬라이스로 `useWorkbenchStore`를 생성한다. 캔버스 간 `selection`은 공유된다.
   **Verify:** `test:` 스토어 업데이트가 전파된다; selection 슬라이스가 왕복(round-trip)한다.
2. **Do:** `RunControls`의 **Run/Stop**을 Server Action → `RunService.start/stop`에 연결한다; `RunStatus`를 SSE 라우트(RB-010)에 구독시킨다.
   **Verify:** `view:` Run이 스텁 엔진으로부터 스트리밍 상태(queued→running→done)를 표시한다; Stop은 stopped로 전이된다.
3. **Do:** `SaveControls`의 **항목별 저장**과 **전체 저장**을 `WorkTreeService.saveItem/saveAll`에 연결한다; dirty 상태를 표시한다.
   **Verify:** `test:` 스텁 편집이 dirty로 표시된다; 전체 저장은 commit을 생성하고, 항목별 저장은 서브트리만 commit한다.
4. **Do:** 스토어에 바인딩된 `ProjectionReadout`/`EvidenceList`/`NextActionHint`를 렌더링한다(엔진이 데이터를 생성하기 전까지는 비어 있음).
   **Verify:** `view:` 섹션들이 스토어에 바인딩되고 상태 변경 시 업데이트된다.

## 수용 기준

- [ ] 하나의 스토어가 패널을 조율한다; 캔버스 간 selection이 동작한다.
- [ ] Run/Stop이 스트리밍 상태와 함께 `RunService`를 구동한다.
- [ ] 항목별 및 전체 저장이 `WorkTreeService`를 통해 올바른 commit을 생성한다.

## 롤백 / 안전성

스텁 엔진을 사용하므로 아직 실제 run은 없다. 롤백하려면 스토어/컨트롤을 되돌린다. 낙관적(optimistic) 편집은 저장 실패 시 되돌려진다.

## 인계(Hand-off)

캔버스(phase-2)는 자신의 슬라이스를 이 스토어에 연결한다; 엔진(phase-3/4)이 스텁을 대체하여 Run이 이미 바인딩된 readout에 실제 projection/evidence를 생성하게 한다.

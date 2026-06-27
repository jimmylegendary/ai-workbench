# RB-023: Canvas 3 — 3D 실현 가능성 스파이크 (GATE)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-012]
- Implements design: [canvas-3-hw-design.md](../../05-caw01-simulation-control-plane/canvas-3-hw-design_ko.md), [canvas-rendering-implementation.md](../../06-frontend/canvas-rendering-implementation_ko.md), [../../01-decisions/ADR-0004-canvas-rendering.md](../../01-decisions/ADR-0004-canvas-rendering_ko.md)
- Produces: OQ-08을 해소하는 시간 제한(time-boxed) 스파이크 결과 (3D r3f vs Konva 2D 폴백)

## 목표

현실적인 하드웨어 클러스터를 렌더링하고 상호작용 지연 + 픽(pick) 정확도를 측정하여, Canvas 3을
3D(react-three-fiber)로 출시할지 Konva 2D 폴백으로 할지를 증거에 기반해 결정한다. **이것은 RB-024의 게이트(gate)다.**

## 사전 조건

- [ ] RB-012 완료. 이 스파이크는 scratch 라우트에서 의도적으로 버리는(throwaway) 코드다.

## 단계

1. **Do:** scratch 라우트에서 `<Instances/>` + `<Detailed/>` LOD + frustum culling + drill-down 시 로드를 사용해 r3f + drei로 대표적인 클러스터(현실적인 rack×tray×package×die×chip 개수)를 렌더링한다.
   **Verify:** `view:` 클러스터가 렌더링되고 탐색할 수 있다.
2. **Do:** 히트(hit)를 도메인 `partId`(level + path + component)로 해석하는 raycaster 피킹을 구현한다.
   **Verify:** `test:` 알려진 part를 피킹하면 올바른 `partId`를 반환한다(픽 정확도).
3. **Do:** 대표 장면에서 drill-down + 선택 중의 상호작용 지연 / 프레임 예산을 측정한다.
   **Verify:** `cmd:`/`view:` 목표 대비 fps + 상호작용 지연을 기록한다(TODO(open-question: 정확한 목표값)).
4. **Do:** 결정을 기록한다: PASS → RB-024는 3D; FAIL → RB-024는 Konva 2D 폴백. OQ-08 상태를 업데이트한다.
   **Verify:** `view:` 결정이 [../../08-research-plan/open-questions.md](../../08-research-plan/open-questions_ko.md)(OQ-08)에 기록된다.

## 수용 기준

- [ ] 대표 클러스터가 LOD/instancing + drill-down 시 로드와 함께 렌더링된다.
- [ ] 피킹이 올바른 `partId`를 반환한다.
- [ ] 측정 수치와 함께 PASS/FAIL 결정이 기록되고 OQ-08이 업데이트된다.

## 롤백 / 안전성

버리는(throwaway) scratch 라우트 — 결정 후 삭제한다. 스파이크 코드가 source of truth가 되지 않도록 한다(RK-3, ADR-0006).

## 인계(Hand-off)

RB-024는 **결정된** 렌더러(3D 또는 2D 폴백) 위에 Canvas 3을 구축한다.

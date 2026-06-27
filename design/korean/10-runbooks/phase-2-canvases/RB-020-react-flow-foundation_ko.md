# RB-020: React Flow 기반 (Canvas 1 & 2 공용)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-012]
- Implements design: [canvas-rendering-implementation.md](../../06-frontend/canvas-rendering-implementation_ko.md), [../../01-decisions/ADR-0004-canvas-rendering.md](../../01-decisions/ADR-0004-canvas-rendering_ko.md)
- Produces: `FlowCanvas` 래퍼 + 공용 커스텀 노드/핸들 인프라 + 스토어 바인딩

## 목표

Canvas 1과 Canvas 2가 그 위에 구축되는 재사용 가능한 React Flow(`@xyflow/react` v12) 기반: 커스텀 노드,
타입이 지정된 핸들, 토큰 기반 테마, 공유 스토어에 연결된 selection, 그리고 Next.js client 전용 마운팅.

## 사전 조건

- [ ] RB-012(스토어 + 패널 연결) 완료.

## 단계

1. **Do:** `@xyflow/react`를 추가한다; `ssr: false`로 동적 import되는 client 컴포넌트로 `FlowCanvas`를 생성한다.
   **Verify:** `view:` 작업 공간 슬롯 안에 비어 있는 pan/zoom 가능한 캔버스가 렌더링된다.
2. **Do:** DTCG 토큰으로 테마가 적용된 공용 커스텀 노드 + 핸들 컴포넌트를 구축한다; 타입 핸들을 위한 `validate?(connection)` 훅을 노출한다.
   **Verify:** `view:` 샘플 커스텀 노드가 테마와 함께 렌더링된다; 유효하지 않은 연결이 훅에 의해 거부된다.
3. **Do:** selection을 `store.selection`에 바인딩한다(노드를 선택하면 `selection.nodeId`가 설정됨).
   **Verify:** `test:` 노드를 선택하면 스토어가 업데이트된다; 다른 패널이 이를 읽을 수 있다.
4. **Do:** 기본 상호작용(다중 선택, fit-view, minimap은 선택 사항)과 selection으로 구동되는 인스펙터 슬롯을 추가한다.
   **Verify:** `view:` 노드를 선택하면 인스펙터 슬롯이 열린다.

## 수용 기준

- [ ] `FlowCanvas`가 client 전용으로 마운트되며 SSR/하이드레이션 오류 없이 렌더링된다.
- [ ] 커스텀 노드/핸들이 테마를 갖추며 연결 검증 훅을 지원한다.
- [ ] selection이 공유 스토어에 연결된다.

## 롤백 / 안전성

UI 전용이므로, 롤백하려면 컴포넌트를 되돌린다. 여기에는 영속성이 없다.

## 인계(Hand-off)

Canvas 1(RB-021)과 Canvas 2(RB-022)는 `FlowCanvas`를 도메인 노드/핸들과 edit→change_blob으로 확장한다.

# 캔버스 렌더링 구현 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [state-management.md](./state-management_ko.md), [../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow.md](../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow_ko.md), [../05-caw01-simulation-control-plane/canvas-3-hw-design.md](../05-caw01-simulation-control-plane/canvas-3-hw-design_ko.md), [../01-decisions/ADR-0004-canvas-rendering.md](../01-decisions/ADR-0004-canvas-rendering_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

캔버스별 구체적인 렌더링 기술과 Next.js 통합 제약 사항을 다룬다. 캔버스별 UX/데이터는
`05-*`에 있으며, 이 문서는 구현 계약(contract)을 다룬다.

## 렌더러 선택 (ADR-0004)

| 캔버스 | 렌더러 | 이유 |
| --- | --- | --- |
| **C1 AI 워크로드 플로우** | `@xyflow/react` (React Flow v12) | 노드/엣지 그래프, 커스텀 노드, 팬/줌 |
| **C2 서빙/표현** | `@xyflow/react` | 타입이 지정된 source/target 핸들 + 문법(grammar) 검증 |
| **C3 하드웨어 설계** | `react-three-fiber` + `drei` (3D) | 물리적 계층 구조; spike 결과에 따라 **Konva 2D 폴백** |

세 개가 아닌 두 개의 렌더러를 사용한다. C1과 C2는 React Flow 인프라(커스텀 노드, 테마, 선택 처리)를 공유한다.

## React Flow (C1/C2)

- 공유 커스텀 노드 타입 + 핸들 컴포넌트를 사용한다. C2 핸들은 **타입이 지정되어** 있으며 연결을
  파이프라인 문법에 대해 검증한다 ([../05-caw01-simulation-control-plane/serving-and-representation-layer.md](../05-caw01-simulation-control-plane/serving-and-representation-layer_ko.md)).
- C1 op 노드는 L0 필드 참조를 지니므로 inspector가 크기/수명(lifetime)을 표시할 수 있다.
- 선택(selection)은 공유 store로 연결된다 (`selection.nodeId`).

## react-three-fiber (C3)

- `<Detailed/>`를 통한 **LOD**, `<Instances/>`를 통한 **인스턴싱**, 프러스텀 컬링(frustum culling).
- **드릴다운 시 로드(Load-on-drill-down)**: 진입했을 때만 서브트리의 상세를 마운트하고, 전체 클러스터를 풀 디테일로 마운트하지 않는다.
- **피킹(picking) → `partId`**: 레이캐스터 히트는 raw 메시가 아니라 도메인 `partId`로 해석된다
  ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)).
- **Spike 게이트**: 시간 제한이 있는 spike에서 현실적인 클러스터(rack×tray×package×die 개수)를 렌더링하고
  인터랙션 지연(latency) + 피킹 정확도를 측정한다. 실패 시 → Konva 2D로 폴백한다.

## Next.js 통합

- 캔버스는 클라이언트 컴포넌트이며, WebGL/canvas의 서버 하이드레이션을 피하기 위해
  **`ssr: false`로 동적 임포트(dynamically imported)** 한다 ([ui-architecture-nextjs.md](./ui-architecture-nextjs_ko.md)).
- WebGL 컨텍스트 라이프사이클은 마운트/언마운트 시점에 관리하며, C3는 하나의 r3f `<Canvas>`를 사용한다.
- 무거운 에셋/지오메트리는 드릴다운별로 지연 로드(lazy-load)한다.

## 성능 예산 (목표값, spike에서 검증)

- 대표적인 클러스터에서의 인터랙티브 프레임 예산 — TODO(open-question: 정확한 fps/latency 목표값).
- C1/C2의 그래프 크기는 작거나 중간 정도(에이전트 턴 단위)로 예상되므로 React Flow 기본 성능으로 충분하다.

## 미해결 질문

- C3의 3D vs 2D는 spike 결과에 따라 출시된다 — TODO(open-question).
- C1에서 매우 큰 에이전트-턴 그래프를 가상화(virtualize)할지 여부 — 필요할 때까지 보류한다.

## 런북에 대한 시사점

Phase-2 캔버스 런북: 먼저 React Flow 기반으로 C1/C2를 구축하고(위험이 낮음), C3 3D spike를 게이트된 런북으로 실행한 뒤,
선택된 렌더러 위에 C3를 구축한다.

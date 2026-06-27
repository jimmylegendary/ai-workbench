# ADR-0004: 캔버스 렌더링 — 두 개의 렌더러(C1+C2용 그래프, C3용 씬), 하나의 공유 스토어 위에서

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [canvas-and-visualization-tech](../02-research/canvas-and-visualization-tech_ko.md)
  - [ADR-0003 Frontend stack](./ADR-0003-frontend-stack_ko.md) (Next.js 서버/클라이언트 분할, 스토어 선택)
  - [ADR-0006 Design system / open design](./ADR-0006-design-system-open-design_ko.md) (캔버스 크롬이 동일 토큰을 소비)
  - [ADR-0007 Work-tree change management](./ADR-0007-change-management-worktree_ko.md) (클라이언트 work-tree가 영속 모델에 매핑)
  - [ADR-0005 Trace pipeline](./ADR-0005-trace-pipeline_ko.md) (C1 노드가 L0 IR `TensorNode`/`DataMovementEdge`에 매핑)
  - [open-questions](../08-research-plan/open-questions_ko.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF_ko.md)

## 목적(Purpose)

세 개의 조정된 캔버스 각각을 **어떤 렌더링 기술이 구동하는지**(SOURCE-BRIEF §5), 그리고 그것들을
조정 상태로 유지하고 work tree에 공급하는 **공유 패널 간 상태 모델**(SOURCE-BRIEF §6)을 결정한다.
이 ADR은 데이터 계층([ADR-0002](./ADR-0002-data-layer_ko.md)), 영속 work-tree 객체
모델([ADR-0007](./ADR-0007-change-management-worktree_ko.md)), 디자인 시스템
도구([ADR-0006](./ADR-0006-design-system-open-design_ko.md))는 **결정하지 않는다**; 그것들이 꽂히는
**클라이언트 측 렌더링 + 선택 표면**을 확정한다.

## 맥락(Context)

- 세 캔버스는 **같은 종류의 그림이 아니다**(SOURCE-BRIEF §5): C1(AI Workload Flow → L0 IR)과
  C2(Serving & Representation 구성)는 **방향 있는 node/edge 그래프**다; C3(Hardware Design,
  chip→die→package→tray→rack→cluster)는 드릴다운, 세밀한 부품 선택, 마이크로 편집과 함께 **"실제
  하드웨어처럼 시각화"**되어야 한다 — 깊은 공간/씬 문제다.
- 하나의 렌더러를 셋 모두에 강요하는 것이 주된 함정이다; 세 개의 독립 렌더러도 마찬가지다.
- 세 패널 모두 **조정**되어야 하고 모든 변경이 **work tree**에 추적되어야 한다(SOURCE-BRIEF §5–§6),
  따라서 선택/experiment 상태는 어떤 렌더러 안에도 살 수 없다.
- 규모는 적당하다: 단일 에이전트 턴(C1)과 serving 구성(C2)은 **수십에서 저-수백 노드**다; C3는 깊지만
  계층별로 시각화된다.
- 캔버스는 Next.js 서버 셸 안의 상호작용 클라이언트 아일랜드다([ADR-0003](./ADR-0003-frontend-stack_ko.md));
  WebGL은 엄격히 클라이언트 측이다; 영속적 변경은 코어를 통해 돌아간다([ADR-0001](./ADR-0001-product-surface_ko.md)).

## 검토한 선택지(Options considered)

### C1 / C2 — node/edge 그래프

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **React Flow / `@xyflow/react` v12** | node/edge UI 전용; **커스텀 노드 = 순수 React 컴포넌트**(검사 가능한 op 노드 & serving-stage 카드에 이상적); 내장 pan/zoom, 다중 선택, 타입 있는 handle/port, minimap; hook을 가진 내부 Zustand 스토어; v12의 SSR 지원 | DOM/SVG-per-node가 가시 노드 ~1–2k를 넘으면 저하 | **채택(C1+C2)** |
| Cytoscape.js | 성숙한 그래프 이론 레이아웃/알고리즘 | 래퍼가 React 관용적이지 않음; 스타일 주도 노드, 풍부한 편집 가능 본체에 약함 | 기각 |
| Sigma.js / Graphology | WebGL, 매우 큰 그래프 | 탐색 지향, 편집 가능한 port 파이프라인에 약함 | 기각 |
| D3-force / 직접 만든 SVG | 완전한 제어 | selection/pan/zoom/port/a11y를 처음부터 재구축 | 기각 |

### C3 — 하드웨어 설계(2D vs 3D)

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **react-three-fiber (R3F) + drei (3D)** | "실제 하드웨어처럼 보임"; 씬 그래프가 chip→…→cluster 중첩에 1:1 매핑; `<Detailed/>` LOD, `<Instances/>`(동일한 die 수천 개를 한 draw call로), raycast/GPU 피킹 | WebGL 클라이언트 전용(SSR 규율); 가파른 학습 곡선; instancing 규율 필요 | **채택, spike에 게이트** |
| Konva / `react-konva` (2D) | 최고의 React 2D-canvas 통합; 피킹용 도형별 이벤트; 레이어 분리 | CPU 캔버스; 물리적 사실성이 아닌 도식적 느낌 | **spike 실패 시 대안** |
| PixiJS (2D) | GPU 배치, 빠른 대규모 2D | 게임 지향, 덜 React 관용적 | 기각 |
| 원시 three.js / babylon.js | 최대 제어 / 일체형 | React 재조정 상실 / 더 무겁고, R3F 관용 스토리에 약함 | 기각 |

### 공유 상태

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **하나의 Zustand `ExperimentStore`, 좁은 셀렉터** | React Flow의 내부 Zustand와 나란히 관용적; 렌더러 비종속; intent 디스패치 + work-tree 추가 지원 | 신중하게 설계할 스토어 하나(셀렉터 규율) | **채택** |
| 캔버스별 로컬 상태 | 패널별로 단순 | 조정 + work-tree가-모든-변경을-추적 불변식 위배; 임시방편 동기화 | 기각 |

## 결정(Decision)

**하나도 셋도 아닌 두 개의 렌더러를, 단일 클라이언트 스토어로 통합한다.**

1. **Canvas 1과 Canvas 2 → `@xyflow/react`(React Flow v12).** 공유 커스텀 노드/handle, 테마,
   선택 배관. C1 op 노드는 L0 IR `TensorNode`/`DataMovementEdge`에 매핑된다
   ([ADR-0005](./ADR-0005-trace-pipeline_ko.md)). C2는 **타입 있는 source/target handle**을 사용하고
   파이프라인 문법 `input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+ SST)`에 대해 연결을
   검증한다.
2. **Canvas 3 → react-three-fiber + drei (3D), spike에 게이트된 Konva 2D 대안.**
   `<Detailed/>` LOD + `<Instances/>` + frustum culling + **드릴다운 시 서브트리 로드**(전체 cluster를
   완전한 디테일로 절대 마운트하지 않음) 사용. **피킹은 항상 도메인 `partId`를 반환한다**(chip/die/package/
   tray/rack/cluster + 컴포넌트 path), 절대 원시 렌더러 객체가 아니다.
   **결정 가드:** 시간 제한된 spike가 대표적인 cluster(현실적인 rack×tray×package×die 개수)를
   instancing + LOD로 렌더하고 상호작용 지연 + 피킹 정확도를 측정한다.
   상호작용 프레임 예산을 유지하지 *못하거나* 팀 학습 곡선이 CAW-01 v1에 비해 너무 높다면, **Konva
   2D**(도식/분해도)로 후퇴하여 물리적 사실성을 더 낮은 SSR/에셋 비용과 맞바꾼다.
3. **하나의 클라이언트 스토어: Zustand `ExperimentStore`** — `selection {panel, entityKind, entityId,
   partPath?}`, `composition`(workload × serving × hardware 초안), `workTree`(순서 있는 변경 이벤트 +
   dirty/saved 마커), 그리고 `runStatus`를 보유. 렌더러는 좁은 슬라이스를 구독하는 **뷰**다.
   - **선택은 도메인 정체성이지 렌더러 핸들이 아니다** — 어느 패널에서의 선택이든
     `{panel,entityKind,entityId,partPath}`를 기록한다; 다른 패널은 파생 셀렉터를 통해 반응한다.
   - **편집은 의도이지 변경이 아니다** — 캔버스는 `addComponent`/`editPart`/`wireStage`/
     `setNodeParam`을 디스패치한다; 리듀서가 그것들을 `composition`에 적용하고 **`workTree`에 변경
     이벤트를 추가한다**. 이것이 [ADR-0007](./ADR-0007-change-management-worktree_ko.md)의 영속 모델의
     클라이언트 면이다.
   - **조정은 파생된다**, 중복 상태가 아니다.
4. **work-tree 시각화는 그래프 스택을 재사용한다.** 왼쪽 Control Panel은 가상화된 변경 트리 + diff 패널 +
   **React Flow로 렌더된 branch DAG**를 호스팅한다 — 새 렌더러 없음.
5. **Next.js 통합 규칙:** 모든 캔버스는 Client Component(`'use client'`)다; C3 WebGL은
   클라이언트 컴포넌트로 감싼 `dynamic(() => import(...), { ssr: false })`다(서버 컴포넌트에서 직접 호출
   불가); Konva(선택 시)도 `ssr:false`다; React 19 / Next 15+를 위해 R3F v9 고정; 하이드레이션 시프트를
   피하기 위해 안정적 플레이스홀더 렌더; 무거운 WebGL 번들을 코드 분할하여 C3가 표시될 때만 로드.

## 결과(Consequences)

- **쉬움:** 각 관용구가 최적 도구로 처리됨; C1≈C2가 프리미티브 공유; branch DAG가 렌더러를 추가하지
  않음; 영속적 변경이 intent → work tree → 코어로 깔때기처럼 모임; 선택이 도메인 정체성이므로 패널 간
  이식 가능.
- **어려움 / 수용됨:** 유지할 렌더링 스택 둘; C3의 WebGL/SSR 규율과 3D 팀 학습 곡선(Konva 대안과 spike
  가드로 완화); React Flow 노드 개수 상한(가시 ~1–2k)이 점진적 공개(노드 그룹화, 뷰포트 culling)를
  요구하며 어떤 단일 과대 뷰에 대해 canvas/WebGL 그래프 렌더러로 가는 미래 트리거.
- **재검토 트리거:** C3 spike 결과(3D vs 2D); 완전히 펼쳐진 L0 op 그래프가 React Flow 가시 노드 예산을
  초과; WebGL 대신 three.js **WebGPU** 렌더러를 타깃.

## 미해결 질문 / 재검토 트리거

- `TODO(open-question: C3-2d-vs-3d)` — R3F spike가 현실적 개수에서 instancing+LOD로 프레임 예산을
  유지하는가, 그리고 v1에 학습 곡선이 수용 가능한가? 아니라면 Konva 2D.
- `TODO(open-question: c1-graph-scale)` — 완전히 펼쳐진 L0 op 그래프의 최대 노드 개수; React Flow →
  canvas/WebGL 임계점.
- `TODO(open-question: hw-assets)` — HW geometry/GLTF의 출처(저작 vs syntorch의 HW-design 계층 출력에서
  절차적 생성; 스키마 미지정 — 가정하지 말 것).
- `TODO(open-question: next-version)` — 고정된 Next.js/React/R3F 버전과 현행 `dynamic(ssr:false)`
  배치 규칙; 빌드 시 재검증.
- `TODO(open-question: worktree-store)` — 최종 패널 간 스토어 선택과 클라이언트 work-tree가
  [ADR-0007](./ADR-0007-change-management-worktree_ko.md)의 영속 모델에 어떻게 매핑되는지.
- `TODO(open-question: webgpu)` — C3에 three.js WebGPU vs WebGL.
- `TODO(open-question: coordination-semantics)` — 정확한 캔버스 간 하이라이트 규칙(C2 serving 선택이
  C1/C3에서 무엇을 하이라이트하는지) — 빌드 전에 제품 정의 필요.

## runbook에 대한 함의

- **RB-1xx — 캔버스 셸 & 패널 간 스토어**: 1:9 Simulation 화면, Zustand `ExperimentStore`,
  selection/intent 디스패치, `'use client'` 경계를 스캐폴드.
- **RB-1xx — C1/C2 그래프 캔버스**: `@xyflow/react`, 공유 커스텀 노드/handle, 타입 있는 port-grammar
  검증, 뷰포트-culling 성능 설정.
- **RB-1xx — C3 하드웨어 spike**: R3F+drei spike(instancing + `<Detailed/>` LOD + 피킹 → `partId`);
  결정 가드에 대해 측정; 2d-vs-3d 결정 산출.
- **RB-1xx — C3 하드웨어 캔버스(선택된 경로)**: 전체 chip→…→cluster 씬, 드릴다운, 부품 선택,
  마이크로 편집 폼.
- **RB-1xx — Work-tree UI**: 가상화된 변경 트리, 항목별/전체 저장, diff 패널, branch DAG(C1/C2 그래프
  스택 재사용), [ADR-0007](./ADR-0007-change-management-worktree_ko.md)에 연결.
- **RB-1xx — Next.js 통합**: `dynamic ssr:false` 래퍼, 버전 고정, WebGL 코드 분할, 하이드레이션 안전
  플레이스홀더.

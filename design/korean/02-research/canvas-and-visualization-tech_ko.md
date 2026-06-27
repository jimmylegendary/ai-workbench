# 캔버스 및 시각화 기술

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [ADR-0004 캔버스 렌더링 기술](../01-decisions/ADR-0004-canvas-rendering_ko.md)
  - [ADR-0003 프런트엔드 스택](../01-decisions/ADR-0003-frontend-stack_ko.md)
  - [ADR-0007 작업 트리(work-tree) 변경 관리 모델](../01-decisions/ADR-0007-change-management-worktree_ko.md)
  - [작업 트리 및 버전 관리](../04-data-layer/work-tree-and-versioning_ko.md)
  - [변경 관리 / 작업 트리](../05-caw01-simulation-control-plane/change-management-worktree_ko.md)
  - [열린 질문(open questions)](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

이 문서는 CAW-01 Simulation 화면(SOURCE-BRIEF §5)에 있는 **세 개의 협응형(coordinated) 캔버스 각각을 어떤 렌더링 기술로 구동할지** 결정하고, 패널들을 협응 상태로 유지하는 **공유 상호작용/상태 모델**과 캔버스/WebGL 컴포넌트를 위한 **Next.js 통합 규칙**을 명시한다. 이 내용은 [ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)로 이어진다.

이 문서는 데이터 레이어(see [data-layer-options](data-layer-options_ko.md) / ADR-0002), 전체 프런트엔드 스택 세부사항(ADR-0003), 디자인 시스템 도구(ADR-0006), 또는 영속화된 작업 트리 객체 모델(ADR-0007 / 데이터 레이어)을 결정하지 **않는다**. 이 문서는 그러한 결정들이 연결되는 **클라이언트 측 렌더링 + 선택(selection) 표면**만을 명시한다. 아래의 라이브러리 관련 사실들은 2026년 중반 기준 공개 상태를 반영하며, 변동 가능성이 있는 버전 종속적 주장은 열린 질문으로 표시한다.

---

## 1. 문제의 형태

세 개의 캔버스는 *같은* 종류의 그림이 아니며, 하나의 렌더러를 셋 모두에 강제하는 것이 피해야 할 가장 큰 함정이다:

| 캔버스 | 도메인 객체 | 시각적 관용구(idiom) | 상호작용 부하 |
|---|---|---|---|
| **C1 — AI Workload Flow** | 한 에이전트 턴 = 연산/데이터 이동 그래프 → L0 IR | 방향성 노드/엣지 그래프 | pan/zoom, 노드 검사, 커스텀 노드 본문 |
| **C2 — Serving & Representation** | vLLM / LLMServingSim / ASTRA-sim / syntorch의 조합 | 방향성/포트 그래프(파이프라인) | 컴포넌트 선택, 조합 배선(wire), 검증 |
| **C3 — Hardware Design** | chip→die→package→tray→rack→cluster | "실제 하드웨어처럼 보임", 깊은 공간적 계층 | 드릴다운, 부품 선택, 마이크로 편집 |

C1과 C2는 강한 공통 요구사항(커스텀 노드, 포트, pan/zoom, 선택, 레이아웃)을 가진 **그래프/플로우** 문제이다. C3는 **깊은 물리적 계층** 문제이다. 브리프에서 제시하는 가치 제안은 하드웨어가 드릴다운과 세밀한 부품 선택을 통해 *실제 하드웨어처럼 시각화*된다는 점인데, 이는 노드 그래프 문제가 아니라 공간적/장면(scene) 문제이다.

따라서 올바른 답은 **하나도 셋도 아닌 두 개의 렌더러**이다: C1+C2가 공유하는 그래프 라이브러리, 그리고 C3를 위한 장면/피킹(picking) 라이브러리, 그리고 이 둘을 단일 패널 간(cross-panel) 상태 저장소(§5)로 통합한다.

---

## 2. 캔버스 1 & 2 — 노드/엣지 그래프

### 2.1 후보군

| 옵션 | 장점 | 단점 | C1/C2 적합성 |
|---|---|---|---|
| **React Flow / `@xyflow/react`** (MIT) | React에서 노드/엣지 UI를 위해 특별히 제작됨; 커스텀 노드가 평범한 React 컴포넌트; 내장 pan/zoom, 다중 선택, 키보드, 핸들/포트, 미니맵, 컨트롤; v12는 SSR/SSG 지원과 계산된 노드 측정 추가; 내부 Zustand 스토어가 훅을 노출. 큰 생태계, 활발한 유지보수. | 노드당 DOM/SVG 방식이라 수천 개의 가시 노드는 성능 저하; 일부 편의 기능(예: 일부 Pro 예제)은 상용; 의견이 강한(opinionated) 데이터 모델. | **강함** — 에이전트 턴 그래프와 파이프라인 조합이 정확히 이 도구의 사용 사례. |
| **Cytoscape.js** (+ react 래퍼) | 성숙한 그래프 이론 레이어(레이아웃, 그래프 알고리즘, 캔버스 상의 매우 큰 그래프). | React 통합이 관용적이지 않은 래퍼; 커스텀 노드 렌더링이 React 컴포넌트가 아닌 스타일링 기반; 풍부한 검사 가능 노드 본문 임베드가 어려움. | 중간 — 편집 가능한 풍부한 노드보다 분석에 더 적합. |
| **Sigma.js / Graphology** | WebGL 렌더러, 매우 큰 그래프로 확장. | 네트워크 탐색/시각화 지향, 편집 가능한 포트 기반 파이프라인 + 풍부한 노드 UI에 약함. | C1/C2 편집 요구에는 약함. |
| **D3-force / 직접 구현 SVG** | 완전한 제어. | 선택, pan/zoom, 포트, 접근성, 레이아웃을 처음부터 재구축. | 회피. |
| **`reactflow` 위의 캔버스/WebGL 커스텀 노드 렌더러** | 노드 수가 폭증할 때의 탈출구. | "노드 = React 컴포넌트" 편의성 상실. | 폴백 전용(스케일 노트 참조). |

### 2.2 스케일 현실

단일 에이전트 턴(C1)과 서빙 조합(C2)은 그래프 데이터베이스 규모가 아니라 **수십에서 수백 개 정도의 노드**이다. React Flow는 이를 무리 없이 처리한다. 더 큰 쪽(예: 확장된 연산 수준 L0 그래프)을 위해 React Flow가 문서화한 수단은 다음과 같다:

- `onlyRenderVisibleElements` (뷰포트 컬링),
- 메모이즈된 `nodeTypes`/`edgeTypes`와 `React.memo` 커스텀 노드,
- 스토어에서 좁은 슬라이스를 선택하여 전체 그래프의 프레임당 재렌더링을 회피,
- 서브그래프를 그룹 노드로 접어(점진적 노출) L0 연산 그래프가 필요 시 펼쳐지도록 함.

단일 워크로드 그래프가 **동시에 가시적인 노드 ~1–2k 초과**를 필요로 하게 되면, 그것이 그 특정 뷰를 캔버스 렌더링 그래프로 옮길 트리거이다. 이는 지금 사전 최적화하지 않고 열린 질문으로 기록한다.

### 2.3 권장 사항 (C1 & C2)

**Canvas 1과 Canvas 2 둘 다에 `@xyflow/react` (React Flow v12)를 사용한다.** 커스텀 노드는 React 컴포넌트이다(L0 IR의 `TensorNode`/`DataMovementEdge`로 매핑되는 검사 가능한 연산 노드와 서빙 단계 카드에 이상적). 두 패널 간에 노드/엣지 프리미티브, 테마, 선택 배관(plumbing)을 공유한다. C2의 포트 간 조합에는 타입이 지정된 source/target 핸들을 사용하고, 파이프라인 문법(`input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+ SST)`)에 대해 연결을 검증한다.

---

## 3. 캔버스 3 — 하드웨어 디자인 (2D vs 3D)

이것이 핵심적 결정이다. 브리프는 다음을 요구한다: 깊은 계층(chip/die/package/tray/rack/cluster), **드릴다운**, **세밀한 단위의 부품 선택**, 선택된 부품에 대한 **마이크로 편집**, 모두 *실제 하드웨어처럼 시각화*될 것.

### 3.1 2D vs 3D 축

| 차원 | 2D (Konva / PixiJS) | 3D (three.js / react-three-fiber + drei) |
|---|---|---|
| "실제 하드웨어처럼 보임" | 도식적/분해(exploded) 2D 레이아웃, 평면도 스타일의 랙 정면도 | 사실에 가까운 칩, 다이, 랙; 회전/궤도(orbit); 물리적으로 읽힘 |
| 깊은 계층 드릴다운 | 중첩 레이어/그룹 + 브레드크럼 줌으로 용이 | 장면 그래프 중첩 + 카메라 포커스로 자연스러움 |
| 부품 피킹 | 형상에 대한 히트 테스트(Konva: 장면 그래프 이벤트; Pixi: interaction) | 메시/인스턴스에 대한 레이캐스팅 / GPU 피킹 |
| 마이크로 편집 작성 | 선택된 형상 위의 단순 2D 폼 | 동일한 폼; 3D 기즈모는 선택 사항 |
| 에셋 비용 | 낮음(벡터 프리미티브) | 높음(지오메트리, 인스턴싱 규율, GLTF 에셋) |
| 깊은 계층용 LOD | 수동: 줌 레벨로 디테일 교체 | 일급(first-class): `<Detailed/>` (LOD), `<Instances/>`, 프러스텀 컬링 |
| Next.js/SSR 마찰 | 낮음(2D 캔버스, 그래도 클라이언트 전용) | 높음(WebGL은 엄격히 클라이언트 측) |
| 팀 적응 비용 | 낮음 | 높음(3D 장면/카메라/머티리얼 멘탈 모델) |

### 3.2 2D 라이브러리 트레이드오프 (2D 선택 시)

| 옵션 | 장점 | 단점 |
|---|---|---|
| **Konva / `react-konva`** | 2D 캔버스에 대한 최고의 React 통합; 선택/드릴다운에 이상적인 형상별 이벤트를 가진 장면 그래프; 저렴한 재도색을 위한 레이어 분리(정적 하드웨어 vs 상호작용 선택 오버레이); 선언적 React 컴포넌트. | CPU 캔버스 — 매우 큰 동적 장면은 WebGL보다 느림. |
| **PixiJS** | WebGL/GPU 배치(batched), 매우 크거나 애니메이션된 2D 장면에 가장 빠름. | 게임 지향; React 바인딩이 덜 관용적; 장면이 대부분 정적이라면 필요 이상으로 풍부함. |
| **Fabric.js** | 디자인 에디터 선택/변형 UX에 강함. | 에디터 중심; 중첩 하드웨어 계층 의미론에 약함. |

### 3.3 3D 라이브러리 트레이드오프 (3D 선택 시)

| 옵션 | 장점 | 단점 |
|---|---|---|
| **react-three-fiber (R3F) + drei** | React에서의 선언적 three.js; 장면 그래프가 chip→…→cluster 중첩에 깔끔하게 매핑됨; drei가 `<Detailed/>` (LOD), `<Instances/>` (동일한 다이/칩 수천 개를 한 번의 드로우 콜로), `<Bvh>`/레이캐스트 헬퍼, `<Select>`/선택 헬퍼, 컨트롤 제공. 활발한 생태계. | WebGL은 클라이언트 전용(SSR 제약, §6); 가파른 학습 곡선; 빠르게 유지하려면 인스턴싱 규율 필요. React 19 / Next 15+에는 R3F v9 필요. |
| **Raw three.js** | 최대 제어. | React 조정(reconciliation) 상실; 상태를 장면에 수동으로 재바인딩. |
| **babylon.js** | 모든 것을 포함한 엔진, 강한 피킹/LOD. | 무거움; R3F보다 React 관용성이 약함. |

### 3.4 하위 컴포넌트의 피킹 / 선택

C3의 결정적 요구사항(특정 부품을 선택한 뒤 마이크로 편집)이 피킹 전략을 좌우한다:

- **3D (R3F):** 기본 레이캐스팅은 적당한 객체 수에는 충분하다; **인스턴스화된** 지오메트리(동일한 칩/다이 다수)에는 레이캐스트 히트의 `instanceId` 또는 O(다수) 피킹 가능성을 위한 **GPU/색상 피킹**을 사용한다. 안정적인 `partId → mesh/instance` 맵을 유지하여 피킹이 메시가 아닌 도메인 엔티티로 해결되도록 한다.
- **2D (Konva):** 형상별 클릭 이벤트가 형상으로 직접 해결됨; 형상 속성(attrs)에 `partId`를 부착한다.

어느 쪽이든 **피킹은 원시 렌더러 객체가 아니라 도메인 `partId`(chip/die/package/tray/rack/cluster + 컴포넌트 경로)를 반환한다** — 이것이 C3를 작업 트리 및 다른 캔버스들과 협응 상태로 유지하는 것이다.

### 3.5 깊은 물리적 계층을 위한 레벨 오브 디테일(LOD)

계층 자체가 LOD 계획이다. 각 티어를 디테일 밴드로 취급한다:

| 줌 / 포커스 티어 | 렌더링되는 것 | 기법 |
|---|---|---|
| cluster / rack | 랙을 박스로, 트레이를 슬랩으로; 개수/라벨 | 인스턴싱 + 임포스터; 하위 지오메트리 숨김 |
| tray / package | 패키지 윤곽, 다이 배치 | LOD를 통해 중간 디테일 메시로 교체 |
| die / chip / component | 전체 컴포넌트 지오메트리, 편집 가능 부품 | 포커스된 서브트리에만 전체 디테일 |

R3F에서 이는 `<Detailed/>` (거리 기반 LOD) + `<Instances/>` + 프러스텀 컬링 + **드릴다운 시 서브트리 로드**(사용자가 패키지에 들어가기 전까지 칩 수준 지오메트리를 마운트하지 않음)이다. 2D에서는 줌 임계값 기반 레이어 교체로 동일한 아이디어를 구현한다. 어느 쪽이든: **전체 클러스터를 절대 전체 디테일로 마운트하지 않는다.**

### 3.6 권장 사항 (C3)

**react-three-fiber + drei (3D)를 권장하며, 스파이크에 따라 게이트된 2D Konva 폴백을 둔다.**

근거: 브리프의 명시적 요구는 드릴다운과 부품 선택을 갖춘 *실제 하드웨어처럼 시각화된* 하드웨어이다 — 3D가 이 제안을 직접 충족하며, drei의 장면 그래프 + LOD + 인스턴싱 프리미티브가 chip→…→cluster 계층과 그 피킹/LOD 요구에 거의 1:1로 매핑된다. 비용은 WebGL/SSR 규율(§6)과 팀 적응이다.

**결정 가드:** 대표적 클러스터(예: 현실적인 rack × tray × package × die 개수)를 인스턴싱 + LOD로 렌더링하고 상호작용 지연 시간과 피킹 정확도를 측정하는 시간 제한(time-boxed) 스파이크를 수행한다. 3D 스파이크가 상호작용 프레임 예산을 지킬 수 없거나 *또는* 팀 적응 비용이 CAW-01 v1에 비해 너무 높다고 판단되면, **Konva 2D로 폴백**한다(도식적/분해 하드웨어 뷰) — 이는 "물리적 사실감" 느낌을 포기하는 대신 훨씬 적은 SSR/에셋 비용으로 드릴다운 + 선택 + 마이크로 편집을 충족한다. 이 가드는 스파이크가 실행될 때까지 열린 질문이다.

---

## 4. 캔버스별 권장 사항 요약

| 캔버스 | 권장 라이브러리 | 이유(한 줄) | 폴백 |
|---|---|---|---|
| **C1 Workload flow** | `@xyflow/react` (React Flow v12) | React 커스텀 노드를 가진 노드/엣지 UI = 정확한 적합; L0 IR 노드/엣지로 매핑 | 가시 노드 ~1–2k 초과 시에만 캔버스 렌더링 그래프 |
| **C2 Serving composition** | `@xyflow/react` (C1과 공유) | 동일한 프리미티브; 타입 지정 포트가 파이프라인 문법 검증 | C1과 동일 |
| **C3 Hardware design** | react-three-fiber + drei (3D) | "실제 하드웨어처럼 보임" + 드릴다운 + 부품 피킹 + 장면 그래프/인스턴싱을 통한 LOD | 3D 스파이크가 프레임/적응 예산 실패 시 Konva 2D (react-konva) |

---

## 5. 공유 상호작용 & 패널 간 상태 모델

브리프는 세 패널 모두가 **협응**되고 모든 변경이 **작업 트리**에 추적될 것을 요구한다(§5–§6). 따라서 두 개의 서로 다른 렌더러(React Flow + R3F/Konva)는 선택이나 실험 상태를 소유해서는 **안 된다**. 그것들은 *뷰*이며, 상태는 그 바깥에 산다.

### 5.1 계층화된 상태 모델

```
┌──────────────────────────────────────────────────────────────────┐
│ ExperimentStore  (single client store; recommend Zustand)         │
│   selection:    { panel, entityKind, entityId, partPath? }        │   ← cross-panel selection
│   composition:  workload(C1) × serving(C2) × hardware(C3) draft    │   ← the runnable experiment
│   workTree:     ordered change events + dirty/saved markers        │   ← per-item & full save (§6)
│   runStatus:    control-plane readouts (status, evidence, blockers)│
└──────────────────────────────────────────────────────────────────┘
        ▲ subscribe (narrow selectors)        │ dispatch intents
        │                                      ▼
   React Flow (C1)   React Flow (C2)   R3F/Konva (C3)   Left Control Panel
```

- **하나의 스토어, 좁은 셀렉터.** Zustand가 잘 맞는다: React Flow가 이미 내부적으로 Zustand를 사용하고 훅을 노출하므로, 앱 수준 Zustand 스토어를 함께 두는 것이 관용적이다. 각 캔버스는 자신이 렌더링하는 슬라이스만 구독하여 패널 간 재렌더링 폭풍을 피한다.
- **선택은 렌더러 핸들이 아니라 도메인 정체성이다.** 어떤 패널에서의 피킹이든 `{panel, entityKind, entityId, partPath}`를 `selection`에 기록한다. 다른 패널들이 반응한다: 예컨대 C2에서 서빙 단계를 선택하면 C1에서 그것이 영향을 주는 워크로드 연산을 강조하고, C3에서 하드웨어를 선택하면 어떤 매핑이 표시될지 범위를 좁힐 수 있다. 렌더러 객체는 절대 패널 간에 새어나가지 않는다.
- **편집은 변이(mutation)가 아니라 의도(intent)이다.** 캔버스는 의도(`addComponent`, `editPart`, `wireStage`, `setNodeParam`)를 디스패치한다; 리듀서가 이를 `composition`에 적용하고 *동시에* `workTree`에 노드를 추가한다. 이것이 항목별 vs 전체 저장(§6)과 실행 취소를 가능하게 한다.
- **협응은 파생된다.** 상호 강조와 "이 선택이 무엇을 건드리는가"는 중복 저장된 상태가 아니라 `composition`에 대한 계산된 셀렉터이다.

### 5.2 왜 캔버스별 로컬 상태가 아닌가

각 렌더러의 로컬 선택은 임시방편적 동기화를 강제하고, *어떤* 패널에서의 *모든* 변경이 하나의 추적된 트리라는 작업 트리 불변식을 깨뜨린다. 중앙집중화가 더 저렴한 정확성 보장이다. (영속화/분기 객체 모델은 ADR-0007 / [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning_ko.md)이며, 이 문서는 **클라이언트** 형태만 고정한다.)

---

## 6. 작업 트리 UI 패턴 (변경 트리, 저장, diff/branch)

Left Control Panel(1:9 분할의 "1")이 작업 트리 UI를 호스팅한다. 이것은 UI 패턴 권장 사항이며, 저장/분기 모델은 ADR-0007이다.

| 관심사 | 패턴 | 비고 |
|---|---|---|
| 변경 트리 | 가상화된 트리 컴포넌트(예: `react-arborist` 또는 헤드리스 트리 + 가상화) | 많은 편집에 걸친 깊은 트리는 윈도잉 필요 |
| 항목별 저장 | 각 트리 노드가 `dirty/saved` 상태 + 노드/서브트리의 저장 어포던스를 가짐 | "개별 변경/서브트리 저장"(§6)에 매핑 |
| 전체 저장 | 루트 수준 저장이 전체 dirty 집합을 커밋 | "전체 트리 저장"(§6) |
| diff 뷰 | 영향받는 엔티티에 대한 변경의 before→after를 나란히/인라인 diff | 노드 파라미터, 하드웨어 부품 편집, 조합 배선용 |
| 분기 뷰 | 실험 설정의 git 유사 branch/commit 그래프 | React Flow로 렌더링(커밋 DAG) — C1/C2 그래프 스택 재사용 |
| 출처(provenance) | 각 변경이 그것이 유래한 캔버스 + 엔티티로 연결됨 | 사용자가 증거 사슬을 추적할 수 있게 함(브리프 §1) |

패턴 입장: **작업 트리를 git 유사 객체 모델로 취급하고 (a) 변경 트리, (b) diff 페인, (c) branch DAG로 표면화한다.** branch DAG는 C1/C2에 선택된 React Flow 스택을 재사용할 수 있으므로, 작업 트리 분기 시각화는 새 렌더러를 추가하지 않는다.

---

## 7. Next.js 통합 노트 (SSR / 'use client' / 하이드레이션)

세 캔버스 모두 브라우저 전용 API(DOM 측정, Canvas2D, WebGL)를 건드린다. app-router 빌드를 위한 규칙:

1. **모든 캔버스는 Client Component이다.** C1/C2/C3의 파일은 `'use client'`로 시작한다. 그것들은 현 상태로는 서버 컴포넌트 트리에서 실행될 수 없다.
2. **WebGL(C3)은 `ssr: false`로 동적 임포트되어야 한다.** three.js/R3F는 `window`/WebGL을 요구하며 SSR 하에서 실패하거나 불일치를 일으킨다. 패턴:
   - 클라이언트 래퍼가 `const Scene = dynamic(() => import('./HardwareScene'), { ssr: false })`를 수행한다.
   - **노트(app router):** `dynamic(..., { ssr: false })`는 *서버* 컴포넌트 내부에서 직접 호출할 수 없다 — 클라이언트 컴포넌트로 감싼 뒤 그 래퍼를 임포트한다. (2026년 기준 공개 지침이며, 고정된 Next 버전에 대해 검증할 것 — 열린 질문.)
3. **React Flow (C1/C2):** v12는 SSR/SSG를 지원하지만 상호작용 에디터는 여전히 클라이언트 측에서 실행된다. 패널을 `'use client'`로 표시한다; 노드 지오메트리의 서버 사전 렌더링을 원한다면 React Flow의 서버 측정 지원을 사용하고, 그렇지 않으면 단순성을 위해 클라이언트 전용으로 유지한다.
4. **Konva(2D 폴백):** 마찬가지로 클라이언트 전용; SSR 중 `canvas`/`window` 이슈를 피하기 위해 `react-konva`는 `ssr: false`로 동적 임포트해야 한다.
5. **버전 고정:** R3F v9가 React 19 / Next 15+와 호환되는 라인이다; React 19 앱에 R3F v8을 고정하지 말 것. ADR-0003에서 정확한 버전을 락하고 빌드 시점에 재검증한다.
6. **하이드레이션 위생:** 서버 렌더링 마크업에서 캔버스 DOM을 제외한다(`ssr:false` 경계가 이를 처리); 레이아웃 시프트 하이드레이션 불일치를 피하기 위해 서버에서는 안정적인 플레이스홀더/스켈레톤을 렌더링한다.
7. **무거운 렌더러의 지연 로드/코드 분할:** three.js + drei는 크다; 하드웨어 캔버스가 실제로 표시될 때만 C3의 번들을 로드하여 Simulation 화면의 초기 페인트가 WebGL로 인해 차단되지 않게 한다.

---

## 8. 트레이드오프: 하나의 렌더러 vs 두 개

| 접근 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 셋 모두에 하나의 렌더러 | 단일 멘탈 모델, 작은 번들 | C3의 물리적 하드웨어 느낌 + LOD 피킹이 노드 그래프 라이브러리에서 빈약; 또는 장면에 강제되면 C1/C2가 React 컴포넌트 노드 상실 | 기각 |
| 세 개의 렌더러 | 각각 최적 | 통합/상태 표면 3배; C1≈C2 중복 낭비 | 기각 |
| **두 개의 렌더러 (C1+C2용 그래프, C3용 장면)** | 각 관용구를 충족; 공유 스토어가 협응을 통합; branch DAG가 그래프 스택 재사용 | 유지할 두 개의 렌더링 스택 | **채택** |

---

## 9. 열린 질문

[open-questions.md](../08-research-plan/open-questions_ko.md)에 기록/추적:

- `TODO(open-question: C3-2d-vs-3d)` — 3D(R3F) 하드웨어 스파이크가 인스턴싱+LOD로 현실적인 cluster×rack×tray×package×die 개수에서 상호작용 프레임 예산을 지키는가, 그리고 팀 적응 비용이 CAW-01 v1에 수용 가능한가? 아니라면 Konva 2D로 폴백한다.
- `TODO(open-question: c1-graph-scale)` — C1에서 완전히 펼쳐진 L0 연산 그래프의 최대 노드 수; React Flow가 캔버스/WebGL 그래프 렌더러에 양보해야 하는 임계값.
- `TODO(open-question: hw-assets)` — 하드웨어 지오메트리/GLTF 에셋의 출처(저작된 것 vs syntorch의 HW 디자인 레이어 출력으로부터 절차적으로 생성된 것). syntorch HW 레이어 출력 스키마는 브리프에 명시되어 있지 않음 — 가정하지 말 것.
- `TODO(open-question: next-version)` — 정확히 고정된 Next.js/React/R3F 버전과 `dynamic(ssr:false)` 배치에 대한 현행 app-router 규칙; 빌드 시 서버 컴포넌트 래퍼 요구사항을 재검증.
- `TODO(open-question: worktree-store)` — 최종 패널 간 스토어 선택(Zustand vs 대안)과 클라이언트 작업 트리가 ADR-0007 / work-tree-and-versioning의 영속화 모델에 어떻게 매핑되는지.
- `TODO(open-question: webgpu)` — C3에 three.js WebGPU 렌더러(현재 폭넓게 사용 가능)를 대상으로 할지 vs WebGL; 성능 한계와 브라우저 매트릭스에 영향.
- `TODO(open-question: coordination-semantics)` — 정확한 캔버스 간 강조 규칙(C2 서빙 선택이 C1/C3에서 무엇을 강조하는지) — 빌드 전에 제품 정의 필요.

## 10. 런북에 대한 함의

이 문서는 다음 런북들을 이끈다(`10-runbooks/`에서 작성될 예정):

- **RB-1xx — 캔버스 셸 & 패널 간 스토어**: 1:9 Simulation 화면, Zustand `ExperimentStore`, 선택/의도 디스패치, `'use client'` 경계를 스캐폴딩.
- **RB-1xx — C1/C2 그래프 캔버스**: `@xyflow/react` 통합, 공유 커스텀 노드/핸들, 서빙 파이프라인을 위한 타입 지정 포트 문법 검증, 뷰포트 컬링 성능 설정.
- **RB-1xx — C3 하드웨어 스파이크**: R3F+drei 스파이크(인스턴싱 + `<Detailed/>` LOD + `partId`를 반환하는 GPU/레이캐스트 피킹) 구축, C3 결정 가드에 대해 측정; 2d-vs-3d 결정 산출.
- **RB-1xx — C3 하드웨어 캔버스(선택된 경로)**: 전체 chip→…→cluster 장면, 드릴다운, 부품 선택, 마이크로 편집 폼.
- **RB-1xx — 작업 트리 UI**: 가상화된 변경 트리, 항목별/전체 저장, diff 페인, branch DAG(C1/C2 그래프 스택 재사용).
- **RB-1xx — Next.js 통합**: 동적 `ssr:false` 래퍼, 버전 고정, WebGL 번들 코드 분할, 하이드레이션 안전 플레이스홀더.

---

### 출처 (이 문서를 위해 검증된 공개 라이브러리 사실)

- React Flow / `@xyflow/react` 성능 & 기능 — reactflow.dev/learn/advanced-use/performance, npmjs.com/package/@xyflow/react
- react-three-fiber 스케일링, drei `<Detailed/>`/`<Instances/>`, WebGPU 가용성 — r3f.docs.pmnd.rs/advanced/scaling-performance, threejsresources.com
- Konva vs PixiJS (2D 캔버스 트레이드오프, React 통합, 레이어 최적화) — konvajs.org, pkgpulse.com
- Next.js app-router `dynamic(ssr:false)` + R3F v9/React 19 노트 — nextjs.org/docs, threejsresources.com/frameworks/three-js-nextjs

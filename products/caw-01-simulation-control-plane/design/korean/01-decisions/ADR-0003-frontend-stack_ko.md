# ADR-0003: 프론트엔드 스택 — Next.js App Router, 서버 셸 + 클라이언트 캔버스 아일랜드

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF_ko.md) (§3, §4, §5, §6, §8)
  - [Product Surface & Stack (research)](../02-research/product-surface-and-stack_ko.md)
  - [Canvas & Visualization Tech (research)](../02-research/canvas-and-visualization-tech_ko.md)
  - [Design System & open design (research)](../02-research/design-system-open-design_ko.md)
  - [ADR-0001 Product surface](./ADR-0001-product-surface_ko.md)
  - [ADR-0006 Design system / open design](./ADR-0006-design-system-open-design_ko.md)
  - [ADR-0004 Canvas rendering tech](./ADR-0004-canvas-rendering_ko.md)
  - [ADR-0002 Data layer](./ADR-0002-data-layer_ko.md)
  - [ADR-0005 Trace pipeline boundaries](./ADR-0005-trace-pipeline_ko.md)
  - [ADR-0007 Work-tree change-management model](./ADR-0007-change-management-worktree_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적(Purpose)

이 ADR은 CAW-01 웹 앱을 위한 **Next.js 세부 사항**을 확정한다: App Router, 서버/클라이언트 컴포넌트
분할, 세 캔버스가 어디에 사는지, 데이터를 어떻게 가져오고 변경하는지, 캔버스 간 상태 모델, 그리고
**Next.js 기준으로 TS↔Python 경계가 어디에 위치하는지**. 캔버스 *렌더링 엔진*(ADR-0004),
디자인 시스템/토큰 계층(ADR-0006), 데이터 저장소(ADR-0002), 트레이스 파이프라인(ADR-0005)은 **결정하지
않는다**. [ADR-0001](./ADR-0001-product-surface_ko.md)에서 정의된 웹 표면을 구현하며 SOURCE-BRIEF §§3–6을
구체화하되, 1:9 레이아웃, nav bar, 세 캔버스, work-tree는 재정의하지 않는다.

## 맥락(Context)

우리가 충족해야 하는 힘과 제약:

- **Brief §3–§5:** 시스템 전역 상단 nav bar(Simulation / Module Design / User / Setting); Simulation
  화면은 **1:9 좌:우 분할** — 왼쪽 Control Panel, 오른쪽은 **세 개의 조정된 캔버스**(C1 workload flow,
  C2 serving/representation, C3 hardware design)의 Workspace.
- **Brief §5 캔버스 간 동작:** 한 패널에서의 선택/변경이 관련된 곳에 반영된다; workspace는 하나의 실행
  가능한 experiment를 구성한다.
- **Brief §6 work tree:** 어느 패널에서의 모든 선택/변경이 추적된다; 항목별 및 전체 저장.
- **Brief §1 컨트롤 플레인 느낌:** 밀도 높고, 상태 우선, IDE/관측성 콘솔 UX — 마케팅 사이트도 챗봇도
  아니다.
- **Brief §8 엔진 현실:** `SimulationRun`은 무거운 Python 네이티브 작업이다; Node는 **계산이 아니라
  오케스트레이션하고 관찰**해야 한다.
- **ADR-0001 불변식:** 웹 앱은 프레젠테이션 관심사만 가진다; **모든 영속적 변경은 공유 코어를 통해
  돌아간다** — 그래야 MCP/CLI가 동일한 의미론을 얻는다.
- 캔버스는 브라우저 전용이다(DOM 측정, Canvas2D, WebGL) — 현 상태로는 서버 컴포넌트 트리에 살 수 없다.

## 검토한 선택지(Options considered)

### 라우터 / 렌더링 모델

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **App Router(RSC 기본) + 클라이언트 아일랜드** | Server Component가 코어를 통해 직접 fetch(셸의 클라이언트 JS 0); Server Action + Route Handler가 일급; ADR-0001 계층화와 일치 | 캔버스/WebGL에 신중한 `'use client'` + `ssr:false` 경계 필요 | **선택됨** |
| Pages Router | 친숙, 더 단순한 멘탈 모델 | 레거시 기본; RSC 없음; 직접-코어 서버 데이터 접근의 편의성 상실 | 기각 |
| SPA(Vite) + 별도 API | 가장 단순한 클라이언트 전용 캔버스 스토리 | 코어가 피하려던 별도 백엔드/API를 재도입(ADR-0001 위배); 밀도 높은 셸의 서버 렌더링 상실 | 기각 |

### 변경(Mutation) 메커니즘

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **인간 변경에는 Server Action + 머신/스트림 URL에는 Route Handler** | Action은 fetch/JSON 보일러플레이트를 제거하고 점진적 향상; Handler는 SSE/webhook/산출물에 안정적 URL 제공 | 배워야 할 메커니즘 둘; Action은 MCP/CLI가 재사용 불가(의도됨) | **선택됨** |
| Route Handler만(어디서나 REST) | 메커니즘 하나; 재사용 가능 | 보일러플레이트 증가; 변경이 컨트롤 플레인에 "로컬"하게 느껴지지 않음 | 기본으로는 기각 |
| Server Action만 | 최소 보일러플레이트 | 스트리밍 run 상태, Python 콜백, 큰 산출물 다운로드용 안정적 URL 없음 | 기각 |

### 캔버스 간 조정을 위한 클라이언트 상태

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **단일 Zustand `ExperimentStore`, 좁은 셀렉터** | React Flow가 이미 내부적으로 Zustand 사용 → 관용적; 하나의 스토어가 selection/composition/work-tree/runStatus 보유; 셀렉터로 리렌더 폭주 회피 | 라이브러리 하나 추가; 렌더러를 상태 밖에 두는 규율 | **선택됨** |
| 캔버스별 로컬 상태 | 패널별로 단순 | brief §5 조정 + §6 단일 work-tree 위배; 임시방편 동기화 | 기각 |
| React Context만 | 의존성 없음 | 무거운 캔버스 전반에 거친 리렌더 | 기각 |

## 결정(Decision)

**App Router를 "서버 셸, 클라이언트 아일랜드" 아키텍처로 채택하고, 인간 변경에는 Server Action,
머신/스트림 URL에는 Route Handler, 캔버스 간 조정에는 단일 Zustand 스토어를 채택한다.** Python 엔진은
Next.js 프로세스에서 절대 실행되지 않는다.

### 1. App Router + 서버/클라이언트 분할

기본은 React Server Component; 상호작용이 요구하는 곳에서만 클라이언트로 내려간다.

| 조각 | 컴포넌트 종류 | 근거 |
|---|---|---|
| Nav bar, 페이지 셸, run-history 목록, evidence/projection 표시 | **Server Component** | 코어를 통한 서버 측 데이터 fetch; 최소 클라이언트 JS |
| 왼쪽 **Control Panel**(start/stop/save 버튼, 상태, skill 런처) | 서버 셸 안의 **클라이언트 아일랜드** | 상호작용 + 라이브 상태; server action 호출 |
| **Canvas 1** AI Workload Flow (→ L0 IR) | **Client** | 고도로 상호작용적인 노드 그래프(엔진은 ADR-0004) |
| **Canvas 2** Serving & Representation 선택 | **Client** | 선택 + 캔버스 간 조정 |
| **Canvas 3** Hardware Design (chip→cluster) | **Client** | 무거운 상호작용 HW 편집(WebGL 가능성, ADR-0004) |
| 캔버스 간 조정 상태 | **Client** Zustand 스토어, server action으로 영속 | brief §5 조정 + §6 work tree |

**패턴:** 각 Simulation 페이지는 코어를 통해 experiment + work-tree 스냅샷을 fetch하여 클라이언트 캔버스
아일랜드에 props로 전달하는 **Server Component**다. 캔버스는 일시적 UI 상태를 소유한다; **모든 영속적
변경은 server action → 코어 서비스로 돌아가며**, 따라서 변경이 UI, MCP, CLI 중 어디서 왔든 동일한
`WorkTreeService`(ADR-0007) 규칙이 적용된다.

### 2. 변경: Server Action vs Route Handler

| 메커니즘 | 용도 | CAW-01 예시 |
|---|---|---|
| **Server Action**(`'use server'`) | 인간이 시작한, 폼 형태의 변경 | work-tree 항목 저장 / 전체 저장, run 시작/중지, HW 컴포넌트 편집, experiment 구성 |
| **Route Handler**(`app/api/**/route.ts`) | 안정적 HTTP 계약이 필요한 모든 것 | `GET /api/runs/:id/stream`(SSE run 상태), `POST /api/internal/run-callback`(긴 Python 작업 콜백), `GET /api/artifacts/:id`(큰 트레이스 다운로드), 헬스 체크 |

규칙: **"사람이 버튼을 클릭했다"에는 Server Action; "머신/스트림이 URL을 필요로 한다"에는 Route
Handler.** 둘 다 얇다 — 공유 Zod 스키마로 검증한 뒤 코어 서비스에 위임한다. **MCP와 CLI는 action이나
route handler를 절대 호출하지 않는다**(ADR-0001); 코어를 직접 import한다.

### 3. 데이터 fetch

- **읽기:** Server Component가 코어 읽기 서비스 / 리포지토리를 직접 호출(셸, 목록, 표시에 클라이언트
  fetch 없음). 초기 캔버스 데이터는 서버에서 fetch되어 클라이언트 아일랜드를 하이드레이트하도록 props로
  전달.
- **라이브 run 상태:** Python 작업이 진행을 보고하는 동안 `RunService`가 구동하는 SSE Route
  Handler(`/api/runs/:id/stream`)를 통해 스트리밍.
- **변경:** 타입이 있는 결과를 반환하는 Server Action; 클라이언트 스토어는 낙관적으로 업데이트하고 action
  결과로 조정.
- **클라이언트 측 ORM/DB 접근 없음.** 데이터 저장소(ADR-0002)는 서버에서 코어를 통해서만 도달.

### 4. 캔버스 간 상태 모델

단일 클라이언트 **`ExperimentStore`(Zustand)**가 보유: `selection {panel, entityKind, entityId, partPath}`,
`composition`(workload C1 × serving C2 × hardware C3 초안), `workTree`(순서 있는 변경 이벤트 +
dirty/saved 마커), 그리고 `runStatus`(컨트롤 플레인 표시). 규칙:

- **선택은 도메인 정체성이지 렌더러 핸들이 아니다.** 어느 캔버스에서의 선택이든 `partId` / 엔티티 정체성을
  기록한다; 렌더러 객체(React Flow 노드, three.js 메시)는 패널을 절대 넘나들지 않는다.
- **편집은 의도이지 직접 변경이 아니다.** 캔버스는 의도를 디스패치한다(`addComponent`, `editPart`,
  `wireStage`, `setNodeParam`); 리듀서가 `composition`을 업데이트하고 **동시에** `workTree`에 추가한다 —
  이것이 항목별/전체 저장과 undo를 가능하게 한다.
- **조정은 파생된다** — 중복 상태가 아니라 `composition`에 대한 셀렉터를 통해.
- work-tree의 **영속 저장**은 server action → `WorkTreeService`를 통해 일어난다; Zustand 스토어는
  *클라이언트* 형태일 뿐이다(영속 객체 모델 = ADR-0007).

### 5. 캔버스 호스팅 + SSR 규칙(ADR-0004와의 경계)

- 모든 캔버스 파일은 `'use client'`로 시작한다.
- **WebGL(C3)은 클라이언트 래퍼를 통해 `ssr: false`로 동적 import된다**(`ssr:false` 동적 import는
  서버 컴포넌트에 직접 놓을 수 없다). 하이드레이션 레이아웃 시프트를 피하기 위해 서버에 안정적 스켈레톤을
  렌더한다.
- React Flow(C1/C2)는 클라이언트 측에서 실행된다; 패널을 `'use client'`로 표시.
- **무거운 렌더러를 코드 분할**(three.js/drei)하여 Simulation 화면의 첫 페인트가 WebGL에 의해 막히지
  않게 한다. *렌더러 선택 자체는 ADR-0004다; 이 ADR은 Next.js 호스팅 계약만 확정한다.*

### 6. Next.js 기준 TS↔Python 경계(load-bearing 라인)

**Next.js(Node 런타임)는 시뮬레이션을 인-프로세스로 실행하지 않는다.** `SimulationRun`은 긴 Python
작업이다(`LLMServingSim → syntorch → ASTRA-sim (+ SST)`). Node는 **오케스트레이션하고 관찰**한다:

- 웹 앱은 코어의 `RunService`를 통해 run을 시작하며, 이는 **engine-adapter 포트**
  (`SimEnginePort` / `TraceCapturePort` / `HwDesignPort`)를 호출한다. 실제 TS⇆Python 전송은
  ADR-0005에서 결정된다; Next.js 관점에서 엔진은 항상 포트 뒤에 있다.
- Python 작업은 **`/api/internal/run-callback` Route Handler**를 통해 진행을 보고한다; 브라우저는
  **SSE 스트림 Route Handler**를 통해 상태를 소비한다.
- **교환은 명시적 JSON + 산출물 참조**이며, Next.js를 통과하는 바이트는 절대 없다: experiment 명세 + HW
  config는 JSON으로 나가고; Chakra ET / 메트릭 / memory-annotated IR(L0/L1/L2 — 동일 스키마, fill
  레벨만 가변)은 path/URI로 주소 지정되는 타입이-있지만-불투명한 산출물로 돌아온다. TS 측은 sub-torch
  내부를 절대 파싱하지 않는다.

### 7. 버전 관리 / 툴링 기준선

- **TypeScript, strict 모드.** `@caw/core`/`@caw/schemas`의 공유 **Zod** 스키마가 단일 검증
  계약이다(ADR-0001).
- 고정된 Next.js 라인 위의 **App Router**; **React 19** 호환 렌더러 버전(예: 3D 선택 시 R3F v9 라인 —
  최종 고정은 ADR-0004). 정확한 버전은 빌드 시 고정되고 재검증된다.
- **`@caw/core`는 `next` import이 0이다**(ADR-0001); 웹 앱이 Next에 의존하는 유일한 패키지다.

## 결과(Consequences)

**쉬워지는 것:**
- 밀도 높은 셸이 최소 클라이언트 JS로 서버에서 렌더된다; 상호작용 캔버스만 무거운 번들을 배포한다.
- 하나의 변경 경로(server action → 코어)가 UI/MCP/CLI 동작을 동일하게 유지한다(ADR-0001).
- 폴링 churn 없이 SSE를 통한 라이브, 컨트롤 플레인 스타일 상태.
- 캔버스 간 조정과 work-tree가 하나의 코어 서비스가 뒷받침하는 단일, 테스트 가능한 클라이언트 스토어다.

**어려워지는 것 / 비용:**
- 캔버스용 `ssr:false` + `'use client'` 경계는 주의가 필요하다(하이드레이션, 코드 분할); 클라이언트
  래퍼 + 서버 스켈레톤으로 완화.
- Server Action은 MCP/CLI가 재사용할 수 없다(의도됨) — 동사는 코어에 있어야 한다.
- 정리해야 할 두 변경 메커니즘(action + route handler); §2의 경험칙이 이를 지배.
- React 19 / Next / R3F 버전 결합은 고정되고 재검증되어야 한다(미해결 질문, ADR-0004와 조율).

**후속 작업(runbooks):**
- Next.js app-router 스켈레톤: 서버 셸 + 클라이언트 캔버스 아일랜드; 변경용 server action; run-status
  SSE, 산출물 다운로드, Python 콜백용 Route Handler.
- 캔버스 셸 + 패널 간 Zustand `ExperimentStore`(selection/intent 디스패치, `'use client'` 경계) —
  ADR-0004 캔버스 runbook과 공유.
- Next.js 통합: 동적 `ssr:false` 래퍼, 버전 고정, WebGL 번들 코드 분할, 하이드레이션 안전 플레이스홀더.

## 미해결 질문 / 재검토 트리거

- `TODO(open-question: next-version-pins)` 정확한 Next.js / React / 렌더러 버전 고정과 `dynamic(ssr:false)`
  배치에 대한 현행 app-router 규칙; 빌드 시 서버 컴포넌트 래퍼 요건 재검증(ADR-0004와 조율).
- `TODO(open-question: worktree-store-mapping)` 최종 패널 간 스토어 선택(Zustand 가정)과 클라이언트
  work-tree가 ADR-0007의 영속 모델에 어떻게 매핑되는지.
- `TODO(open-question: coordination-semantics)` 정확한 캔버스 간 하이라이트 규칙(C2 serving 선택이
  C1/C3에서 무엇을 하이라이트하는지) — 빌드 전에 제품 정의 필요.
- `TODO(open-question: run-callback-transport)` run 진행이 여기 SSE+콜백 패턴으로 도착하는지, 아니면
  Python 사이드카가 정착되면 더 풍부한 스트리밍 전송으로 도착하는지(ADR-0005와 조율).
- **재검토 트리거:** 캔버스가 데이터 fetch를 넘어선 서버 측 계산을 필요로 하게 되면, "Node는
  오케스트레이션, Python은 계산" 라인을 재검토하라 — 엔진 로직을 Next.js로 옮기지 말라.

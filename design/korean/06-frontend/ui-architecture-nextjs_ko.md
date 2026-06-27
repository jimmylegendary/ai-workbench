# UI 아키텍처 (Next.js) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [layout-and-navigation.md](./layout-and-navigation_ko.md), [state-management.md](./state-management_ko.md), [../01-decisions/ADR-0003-frontend-stack.md](../01-decisions/ADR-0003-frontend-stack_ko.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

웹 표면(surface)을 위한 Next.js App Router 구조: 서버 셸(server shell)과 클라이언트 아일랜드(client island)의 구분, 변경(mutation)/스트림 경로, 그리고 캔버스들이 `@caw/core` 위에서 어떻게 클라이언트 컴포넌트로 자리잡는지를 다룬다.

## 서버 셸 + 클라이언트 아일랜드

| 계층 | 유형 | 예시 |
| --- | --- | --- |
| 셸, 내비게이션 바, 페이지 스캐폴드, 데이터 로딩 | **Server Components** | layout, route 페이지, 초기 experiment fetch |
| 인터랙티브 캔버스, 컨트롤 패널, work-tree | **클라이언트 아일랜드** (`'use client'`) | React Flow 캔버스, r3f 캔버스, Zustand 바인딩 위젯 |

인터랙티브한 부분만 클라이언트 컴포넌트이며, 그 외 모든 것은 서버에서 렌더링된다 ([ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md)).

## 변경(mutation) vs 스트림

| 필요 | 메커니즘 |
| --- | --- |
| 사람에 의한 변경(experiment 생성/수정, 저장, 브랜치) | **Server Actions** → `@caw/core` |
| 기계/스트림(run 상태, 실시간 진행 상황) | **Route Handlers** (SSE/stream) → `RunService.status` |
| 대량 처리/자동화 | 웹 앱이 아닌 MCP/CLI 표면 |

## 클라이언트 컴포넌트로서의 캔버스

- React Flow (C1/C2)와 react-three-fiber (C3)는 서버에서 WebGL/canvas가 하이드레이션되는 것을 피하기 위해 `ssr: false`로 동적 임포트된다 ([canvas-rendering-implementation.md](./canvas-rendering-implementation_ko.md)).
- 이들은 단일 Zustand 스토어를 읽고 쓴다 ([state-management.md](./state-management_ko.md)); 영속성은 직접적인 DB 접근이 아니라 Server Actions를 통해 흐른다.

## TS ⇆ Python 이음새(seam) (UI 관점)

웹 앱은 결코 Python 엔진과 직접 통신하지 않는다. 웹 앱은 (Server Actions/Route Handlers를 통해) `@caw/core`를 호출하고, core는 포트(port)를 통해 엔진을 호출한다 ([../03-architecture/system-architecture.md](../03-architecture/system-architecture_ko.md)).

## Route 구조

```
app/
├─ layout.tsx                 # nav bar shell (server)
├─ (simulation)/page.tsx      # 1:9 Simulation screen
├─ (module-design)/page.tsx
├─ user/ · setting/
└─ api/runs/[id]/stream/route.ts   # SSE run status
```

## 미해결 질문

v1(단일 사용자)에서 User/Setting 메뉴를 위한 인증/세션 모델 — TODO(open-question).

## 런북에 대한 함의

Phase-1 app-shell 런북은 캔버스를 추가하기 전에 App Router 골격, core로의 Server Actions 연결, 그리고 SSE route를 구축한다.

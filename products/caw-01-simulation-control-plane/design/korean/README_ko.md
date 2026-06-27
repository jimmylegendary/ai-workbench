# CAW-01 설계 세트 — 인덱스

이 폴더는 **CAW-01, 즉 Simulation Control Plane(시뮬레이션 제어 평면)** 의 완전한 설계 + 빌드 명세서입니다. CAW-01은
**독립적이고 단독으로 동작하는 제품**입니다. CAW-01은 여섯 개 제품 패밀리(CAW-01..06) 중 하나로, 각 제품은 개별적으로 빌드되고
배포되며 **공유 런타임 substrate가 없습니다**. 이 문서는 **AI 빌더**에게 전달되도록 작성되었습니다. 설계 문서는
*무엇을* 그리고 *왜*를 설명하고, 런북은 *어떻게 빌드하는지*를 설명합니다. **설계 작성자는 어떤 제품 코드도 작성하지 않습니다.**

> 먼저 읽으세요: [`_meta/SOURCE-BRIEF.md`](./_meta/SOURCE-BRIEF_ko.md) (정본 제품 비전)과
> [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS_ko.md) (모든 문서 + 런북을 작성하는 방식).

## 탐색 방법

| # | 폴더 | 담고 있는 내용 |
| --- | --- | --- |
| `_meta` | 소스 브리프, 문서 작성 규약, [용어집](./_meta/GLOSSARY_ko.md) | 진실 + 규칙 |
| `00` | [overview](./00-overview/) | [vision](./00-overview/vision_ko.md), [범위 및 비목표](./00-overview/scope-and-non-goals_ko.md), [페르소나 및 유스케이스](./00-overview/personas-and-use-cases_ko.md) |
| `01` | [decisions](./01-decisions/) | 7개의 ADR (제품 표면, 데이터 계층, 프론트엔드, 캔버스, 트레이스 파이프라인, 디자인 시스템, work-tree) |
| `02` | [research](./02-research/) | ADR 뒤에 있는 근거 리서치 |
| `03` | [architecture](./03-architecture/) | 시스템 아키텍처, 컴포넌트 경계, 데이터 흐름, 기술 스택, 레포 구조 |
| `04` | [data-layer](./04-data-layer/) | 데이터 모델, 스토리지 전략, work-tree 스토리지, 런 증거(run-evidence) 및 출처(provenance) |
| `05` | [caw01-simulation-control-plane](./05-caw01-simulation-control-plane/) | 핵심: L0 IR, serving/representation, 트레이스 파이프라인, 엔진, 3개의 캔버스, 컨트롤 패널, work-tree UX |
| `06` | [frontend](./06-frontend/) | Next.js UI 아키텍처, 레이아웃/내비게이션, 상태, 캔버스 렌더링, open-design, 컴포넌트 |
| `07` | [backend-api](./07-backend-api/) | 코어 API 계약, 시뮬레이션 런타임 서비스, 영속성, MCP/CLI 어댑터 |
| `08` | [research-plan](./08-research-plan/) | 리서치 계획, 검증/골든 테스트, [열린 질문](./08-research-plan/open-questions_ko.md) |
| `09` | [roadmap](./09-roadmap/) | 마일스톤/단계, 의존성 그래프, 리스크 |
| `10` | [runbooks](./10-runbooks/) | 실행 가능한 빌드 계획 (단계 0–5) — [runbooks/README.md](./10-runbooks/README_ko.md)에서 시작 |

## 한 문단으로 보는 제품

**Next.js 웹 앱**(하나의 `@caw/core` 제품 코어 위에 올라간, *이* 제품을 외부 에이전트와 도구가 구동할 수 있도록 하는
CAW-01 고유의 MCP + CLI 자동화 표면 포함)으로, 그 **Simulation** 화면은
**1:9**로 분할됩니다: 왼쪽의 **컨트롤 패널**(run/save/status)과 오른쪽의 **워크스페이스**로, 세 개의 협응 캔버스로 구성됩니다 —
**(1) AI 워크로드 흐름**(에이전트 턴을 그래프로), **(2) serving & representation**(vLLM/LLMServingSim ×
torch/syntorch × ASTRA-sim 중에서 선택), **(3) 하드웨어 설계**(chip→die→package→tray→rack→cluster, 실제
하드웨어처럼 시각화되며 드릴다운 + 편집 가능). 모든 편집은 git 유사 **work-tree**에서 버전 관리됩니다(항목별 & 전체 저장). 런(run)은
세 가지 근거 축(실측 OTel / 합성 syntorch→Chakra / 시뮬레이션 LLMServingSim+ASTRA-sim)을
하나의 **메모리 주석이 달린 L0 IR**로 정규화하고, 근거로 보존되는 **비교 가능한 프로젝션(projection)**을 산출합니다.

## 핵심 결정 (`01-decisions/` 참조)

- **표면(Surface):** 하나의 TS 제품 코어 `@caw/core` + 얇은 web/MCP/CLI 표면(모두 CAW-01에만 속함).
- **데이터:** Postgres 척추(spine) 폴리글랏; SQLite로 시작(PG 이식 가능); 블롭은 파일시스템에 경로로 저장.
- **프론트엔드:** Next.js App Router, server shell + client islands, Zustand; Python 엔진은 프로세스 외부.
- **캔버스:** React Flow (C1/C2), react-three-fiber 3D (C3), 스파이크 결과에 따라 Konva 2D 폴백.
- **트레이스:** syntorch 캡처 → Chakra exporter → ASTRA-sim; Chakra→L0 lowering이 정규화의 잘록한 허리(waist)이며, 축들은 병렬로 하나의 L0로 들어감.
- **디자인:** "open design" = shadcn/ui + Radix + Tailwind v4 + DTCG 토큰.
- **Work-tree:** git 유사 콘텐츠 주소 기반 객체 모델 + 의도 이벤트 로그, Postgres 내.

## 빌드 경로

[`10-runbooks/`](./10-runbooks/) 단계 0→5를 따르세요. **Milestone 1**(첫 번째 비교 가능한 실험, UC-1)이
북극성 합격 기준이며 단계 0/1/3/4에 걸쳐 있습니다. Canvas-3 3D와 MCP/CLI는 의도적으로 Milestone-1
크리티컬 패스에서 제외되어 있습니다.

## 상태

모든 문서는 **draft**이며 SOURCE-BRIEF + 리서치를 바탕으로 작성되었습니다. 이들은 `TODO(open-question)`
마커와 추적되는 [open-questions](./08-research-plan/open-questions_ko.md) 목록을 포함합니다. Jimmy가
전략적 결정의 리뷰어이며, 여기 어떤 것도 SOURCE-BRIEF를 넘어 내부 `syntorch` 사실을 지어내지 않습니다.

# 제품 표면(Product Surface) 및 스택

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF_ko.md)
  - [ADR-0001 제품 표면](../01-decisions/ADR-0001-product-surface_ko.md)
  - [ADR-0003 프론트엔드 스택](../01-decisions/ADR-0003-frontend-stack_ko.md)
  - [ADR-0005 트레이스 파이프라인 경계](../01-decisions/ADR-0005-trace-pipeline_ko.md)
  - [데이터 계층 옵션](./data-layer-options_ko.md)
  - [트레이스 파이프라인 & syntorch 경계](./trace-capture-and-chakra_ko.md)
  - [L0 IR 스키마](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)
  - [변경 관리 / 작업 트리(work tree)](../05-caw01-simulation-control-plane/change-management-worktree_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적(Purpose)

이 문서는 **CAW-01이 노출하는 제품 표면이 몇 개인지, 각각이 무엇을 위한 것인지, 그리고 이들이 어떻게 하나의
공유 코어(shared core) 위에 함께 놓이는지**를 결정하여, 웹 UI, MCP 서버, CLI가 결코 세 개의 서로 다른 제품으로
갈라지지 않도록 한다. 계층화된 아키텍처(UI 표면 → 공유 코어/서비스 → 엔진 어댑터 → 데이터 계층), 역량(capability)→표면
매트릭스, 그리고 — 결정적으로 — **TypeScript/Next.js 측과 Python 시뮬레이션/트레이스 측(syntorch, LLMServingSim,
ASTRA-sim, Chakra) 사이의 경계**를 정의한다.

이 문서는 데이터 저장소 기술(그것은 [data-layer-options.md](./data-layer-options_ko.md) / ADR-0002), 캔버스
렌더링 기술(ADR-0004), syntorch의 내부 트레이스 캡처 메커니즘(ADR-0005 /
[trace-capture-and-chakra.md](./trace-capture-and-chakra_ko.md))을 결정하지 **않는다**. SOURCE-BRIEF에서
고정된 3-canvas / 1:9 / nav-bar / work-tree UI를 상세화하되 재정의하지는 않는다.

---

## 1. 표면들, 그리고 왜 셋인가

브리프는 최상위 수준에서 답을 고정한다: **Next.js 웹 앱 = 주요 인간 표면; MCP 서버 + CLI =
자동화 표면; "skill" = 패키징된 워크플로.** 이 문서의 역할은 세 개의 백엔드를 만들지 않으면서 그것을 현실화하는 것이다.

| 표면 | 주 사용자 | 잘하는 것 | 절대 되어서는 안 되는 것 |
|---|---|---|---|
| **웹 앱 (Next.js)** | 도메인 전문가 (Jimmy + 리뷰어) | 3-canvas 저작 표면, 실행(run) 생명주기, 증거(evidence)/투영(projection) 판독, work-tree 리뷰 | 브라우저에서 엔진 로직을 다시 구현하는 얇은 클라이언트 |
| **MCP 서버** | 다른 에이전트들 (Company AI Workbench 기반, Claude 등) | 에이전트가 실험을 구성/실행하고, 트레이스/메트릭을 읽고, 레지스트리를 **도구(tools) + 리소스(resources)**로 질의하도록 함 | 자체 검증 규칙을 가진, 두 번째로 갈라진 API |
| **CLI** | 터미널 안의 인간 + CI/스크립트 | 재현 가능한 배치 실행, 스크립트화된 실험 스윕(sweep), 스모크 테스트, 픽스처 생성 | 코어를 능가하는 "진짜" 제품 기능 세트 |

**설계 규칙(전체의 핵심):** 셋 모두 **하나의 공유 코어 위의 얇은 어댑터**이다. 새로운 역량은
코어에 **한 번** 추가되고, 그 후 그것을 노출해야 하는 표면에 *투영(project)*된다. 웹 앱은 추가적인
*표현(presentation)* 관심사(캔버스, 조율)는 허용되지만, 추가적인 *도메인* 로직은 결코 허용되지 않는다.

---

## 2. 계층화된 아키텍처

```
┌──────────────────────────── UI / ENTRY SURFACES (thin) ─────────────────────────────┐
│  Next.js web app            MCP server (TS)            CLI (TS)                       │
│  - app-router pages         - tools (actions)          - commands                     │
│  - server actions           - resources (read)         - flags → core calls           │
│  - route handlers           - prompts (skill templates)- text/JSON output             │
└───────────────┬──────────────────────┬────────────────────────┬──────────────────────┘
                │  all call the SAME functions (no surface owns domain logic)            │
                ▼                       ▼                        ▼
┌──────────────────────── SHARED CORE / SERVICES (TypeScript) ────────────────────────┐
│  @caw/core  — pure-ish application services + domain types                            │
│   • ExperimentService  (compose workload × serving × hardware → runnable spec)        │
│   • RunService         (start/stop/status lifecycle, run state machine)               │
│   • RegistryService    (models, serving frameworks, HW catalog, strategy-ids)         │
│   • WorkTreeService    (per-item / full save, versioning — see ADR-0007)              │
│   • EvidenceService    (trace artifacts, metrics, trust-ladder status, projections)   │
│   • Zod schemas = the ONE contract reused by UI, MCP, CLI                             │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                │  typed adapter interfaces (engine-agnostic ports)                      │
                ▼
┌──────────────────────── ENGINE ADAPTERS (TS ports → Python) ────────────────────────┐
│  SimEnginePort        → drives LLMServingSim → syntorch → ASTRA-sim (+ SST)           │
│  TraceCapturePort     → vLLM(torch→syntorch) sub-torch trace + Chakra exporter        │
│  HwDesignPort         → syntorch HW design layer (chip/die/package/tray/rack/cluster) │
│  IngestPort           → OTel trace ingest (real-measurement axis)                     │
│  --- process boundary (TS ⇆ Python) lives HERE; see §6 ---                            │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────── DATA LAYER ─────────────────────────────────────────┐
│  Knowledge substrate · Simulation substrate · HW design substrate · Work-tree         │
│  (relational / vector / graph / md-first — decided in ADR-0002)  +  artifact store     │
│  for large trace files (Chakra ET, OTel, raw sub-torch dumps)                         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

불변식(invariant): **화살표는 오직 아래로만 향한다.** 표면은 코어에 의존하고, 코어는 어댑터 *포트(port)*
(인터페이스)에 의존하며 구체적인 엔진에는 의존하지 않는다. 어댑터는 지저분한 TS⇆Python 경계를 소유하며,
데이터 계층은 저장소(repository) 인터페이스를 통해 도달되므로 저장 기술(ADR-0002)이 표면을 건드리지 않고도 바뀔 수 있다.

---

## 3. Next.js app-router 아키텍처 (인간 표면)

현재의 Next.js에 기반한다(App Router가 기본이자 권장 라우터이며, React Server Components가 기본이고,
Server Actions와 Route Handlers가 일급(first-class) 시민이다).

### 3.1 Server vs Client 컴포넌트 — 3개 캔버스를 위한 분할

| 요소 | 컴포넌트 종류 | 근거 |
|---|---|---|
| Nav bar, 페이지 셸, 실행 이력 목록, 증거/투영 판독 | **Server Components** | 서버에서 데이터 페치, JS 전송 0, 코어를 통한 저장소 직접 접근 |
| 좌측 **Control Panel** (start/stop/save 버튼, 상태) | **Client** 아일랜드(server 셸 내부) | 상호작용 + 실시간 상태 필요; server actions 호출 |
| **Canvas 1** AI Workload Flow (노드 그래프 → L0 IR) | **Client** (노드 그래프 라이브러리, ADR-0004) | 고도로 상호작용적; 서버에서 페치한 스펙으로 하이드레이트 |
| **Canvas 2** Serving & Representation 선택 | **Client** (서버에서 페치한 레지스트리 사용) | 선택 상태 + 캔버스 간 조율 |
| **Canvas 3** Hardware Design (chip→cluster 계층) | **Client** (아마 3D/canvas, ADR-0004) | HW 트리의 무거운 상호작용 편집 |
| 캔버스 간 조율 상태 | **Client** 스토어 (예: Zustand/Jotai), server actions로 영속화 | 한 캔버스의 선택이 다른 캔버스에 반영됨 (브리프 §5) |

패턴: **server 셸, client 아일랜드.** 각 페이지는 코어를 통해 실험 + work-tree 스냅샷을 페치하고
그것을 props로 client 캔버스 아일랜드에 전달하는 Server Component이다. 캔버스는 상호작용적이며
일시적(ephemeral) UI 상태를 소유한다. **모든 영속적 변경(mutation)은 server action → 코어 서비스를 거쳐
돌아간다**(따라서 변경이 UI, MCP, CLI 중 어디서 왔든 동일한 WorkTreeService 규칙이 적용된다).

### 3.2 Server Actions vs Route Handlers — 언제 무엇을 쓰는가

브리프의 UX는 REST API가 아니라 컨트롤 플레인(control plane)이므로, 변경은 로컬처럼 *느껴져야* 한다. 우리는 의도적으로 둘 다 사용한다:

| 메커니즘 | 용도 | CAW-01에서의 예 |
|---|---|---|
| **Server Actions** (`'use server'` async 함수) | UI에서 인간이 시작하는 변경; 폼 형태, 점진적 향상(progressive-enhancement), 수작업 fetch/JSON 없음 | work-tree 항목 저장 / 전체 저장, 실행 start/stop, HW 컴포넌트 편집, 실험 구성 |
| **Route Handlers** (`app/api/**/route.ts`) | 안정적인 HTTP 계약이 필요한 모든 것: 실행 상태 스트리밍(SSE), 장시간 Python 작업의 웹훅, 대용량 아티팩트 다운로드, 헬스 체크 | `GET /api/runs/:id/stream`, `POST /api/internal/run-callback`, `GET /api/artifacts/:id` |

경험칙: **"인간이 앱에서 버튼을 클릭했다"면 Server Actions; "기계/스트림이 URL을 필요로 한다"면 Route
Handlers.** 둘 다 얇다 — 공유 Zod 스키마로 검증하고 코어 서비스에 위임한다. **MCP 서버와 CLI는 server
actions나 route handlers를 결코 사용하지 않는다**; 코어 서비스를 직접 import한다. 이로써 코어가 도메인 로직이
사는 단일 장소로 유지되며, 한 표면이 다른 표면의 HTTP 계층을 호출하는 일을 피한다.

### 3.3 Python 시뮬레이션 엔진이 Next.js에 대해 어디에 들어맞는가

Next.js(Node 런타임)는 시뮬레이션을 **in-process로 실행하지 않는다.** SimulationRun은 길고 무거운 Python-네이티브
작업이다(LLMServingSim → syntorch → ASTRA-sim + SST). Node의 역할은 *조율하고 관찰하는 것*이지 계산이 아니다.
엔진은 **엔진 어댑터 포트**(§5) 뒤에 위치하며 Python으로 실행된다(§6). 웹 앱은 RunService를 통해 실행을 시작한
뒤, Python 작업이 진행 상황을 보고하는 동안 Route Handler(SSE)를 통해 상태를 스트리밍한다.

---

## 4. 자동화 표면들

### 4.1 MCP 서버 — 다른 에이전트를 위한 동일한 엔진/레지스트리

MCP TypeScript SDK는 세 가지 컨텍스트 유형을 노출한다; 우리는 CAW-01을 그것들에 직접 매핑한다:

| MCP 프리미티브 | CAW-01 매핑 | 예 |
|---|---|---|
| **Tools** (액션 / 부작용) | 코어의 동사들 — compose, run, save, ingest | `compose_experiment`, `start_run`, `stop_run`, `save_worktree`, `ingest_otel_trace` |
| **Resources** (읽기 전용 데이터) | 명사들 — 레지스트리 + 증거, URI로 주소 지정 가능 | `caw://registry/serving-frameworks`, `caw://runs/{id}/status`, `caw://runs/{id}/metrics`, `caw://traces/{id}`, `caw://ir/{id}` (L0/L1/L2) |
| **Prompts** (재사용 가능한 템플릿) | 프롬프트 템플릿으로 노출된 패키징된 **skills**(§5.x) | `skill: project-workload-to-memory-requirement`, `skill: compare-two-hardware-configs` |

모든 MCP 도구는 **동일한 Zod 스키마**를 사용하는 코어 서비스 위의 한 줄짜리 래퍼이므로, 에이전트는 인간이
UI에서 얻는 것과 정확히 동일한 검증과 동작을 얻는다. MCP 서버는 자체 프로세스로 실행되며(로컬 에이전트용
stdio, 원격용 Streamable HTTP), `@caw/core`를 import한다. 그것은 브리프가 요구하는 **레지스트리와 엔진**을
노출한다: 에이전트는 serving 프레임워크를 나열하고, 실행을 구성하고("vLLM로 서빙, torch→syntorch 교체"),
실행을 시작하고, Chakra 트레이스 / 메트릭 / 메모리 주석이 달린 IR을 리소스로 읽어올 수 있다.

### 4.2 CLI — 코어를 공유하고 워크플로를 스크립트화한다

CLI는 MCP 서버와 정확히 동일하게 `@caw/core`를 import하는 TypeScript 바이너리(예: 표준 인자 파서 기반)이다.
재현성과 CI를 위해 존재한다: 스크립트화된 스윕, 픽스처 생성, 결정론적 스모크 테스트.

```
caw experiment compose --workload turn.json --serving vllm+syntorch --hw cluster-a.json
caw run start --experiment exp_123 --watch         # streams status, exits on terminal state
caw run status exp_123 --json                       # machine-readable for CI
caw trace export exp_123 --format chakra -o out/    # pull Chakra ET artifact
caw ir show exp_123 --fill-level L1                  # inspect memory-annotated IR
```

CLI는 기본적으로 인간용 텍스트를 출력하고 파이프라인용으로 `--json`을 출력한다. 의도적으로 코어의
**부분집합(subset)**이다: UI/MCP가 갖지 않은 로직을 결코 키워서는 안 된다. 한 명령에 새로운 동작이 필요하면,
그 동작은 코어 서비스에 추가되고 그 후 UI와 MCP에도 *함께* 사용 가능해진다.

### 4.3 Company AI Workbench 맥락에서 "skill"의 의미

여기서 **skill**은 **패키징된, 이름 붙은 워크플로**이다 — 선언된 입력/출력과 증거 계약(evidence contract)을
가지고 코어 서비스들을 고차(higher-order) 연산으로 조합하는 재사용 가능한 레시피이다. 그것은 새 엔진이 *아니고*
새 API도 *아니다*; 기존 코어 위의 안무(choreography)이다.

skill 정의(코어에 살며, 모든 표면에 노출됨):

```ts
interface Skill {
  id: string;                       // e.g. "project-workload-to-memory-requirement"
  title: string;
  inputs: ZodSchema;                // validated identically everywhere
  steps: SkillStep[];               // calls to core services (compose → run → read IR → derive metric)
  produces: string[];               // artifact/entity kinds, e.g. ["MemoryAnnotatedIR","MemoryProductRequirement"]
  evidenceContract: {               // trust-ladder honesty (brief §1)
    requires: ("OTel"|"Chakra"|"syntorch")[];
    validatesAgainst?: "A100/OTel";
  };
}
```

한 skill의 표면 투영:
- **웹 앱:** Control Panel의 안내형 액션(진행 상황 + 증거 판독을 동반한 다단계 실행).
- **MCP:** 동일한 skill 도구를 구동하는 `prompt` 템플릿(에이전트 대면 진입점).
- **CLI:** `caw skill run project-workload-to-memory-requirement --input ...`.

이것이 "MCP/CLI = 자동화 표면"을 구체화하는 것이다: *자동화의 단위*는 skill이며, skill은 하나의 코어를
통과하는 이름 붙은 경로일 뿐이다.

---

## 5. 역량 → 표면 매트릭스

| 역량 | 웹 앱 | MCP | CLI | 비고 |
|---|---|---|---|---|
| 실험 구성 (workload × serving × hardware) | ✅ (3 캔버스) | ✅ tool | ✅ cmd | 캔버스는 동일한 스펙 위의 UI 전용 저작 어포던스 |
| HW 계층 편집 (chip→cluster, 마이크로 수준) | ✅ (Canvas 3) | ✅ tool (구조화된 편집) | ✅ (파일로부터) | 세밀한 시각 편집은 UI 우선; MCP/CLI는 구조화된 패치를 받음 |
| workload flow / L0 IR 저작 | ✅ (Canvas 1) | ◑ tool (구조화) | ◑ (파일로부터) | 자유 형식 그래프 저작은 UI 강점; 에이전트는 구조화된 그래프 제출 |
| 실행의 start / stop / status | ✅ | ✅ | ✅ | 코어 RunService; UI/Route-Handler 스트림, CLI `--watch`, MCP status 리소스 |
| work-tree 항목별 / 전체 저장 | ✅ | ✅ | ✅ | 하나의 WorkTreeService (ADR-0007); 동일한 의미 |
| 트레이스 아티팩트 읽기 (OTel / Chakra / sub-torch) | ✅ (뷰어) | ✅ resource | ✅ export | 대용량 아티팩트는 artifact store + 서명된 URL / 파일 경로 경유 |
| 메트릭 / 투영 읽기 | ✅ 판독 | ✅ resource | ✅ `--json` | 비교 가능한 투영은 표면이 아니라 코어가 계산 |
| 메모리 주석 IR 검사 (L0/L1/L2) | ✅ | ✅ resource | ✅ | 동일한 스키마, 다른 채움 수준 (브리프 §1) |
| 실측 OTel 트레이스 수집(ingest) | ◑ (업로드) | ✅ tool | ✅ cmd | 자동화 지향적; UI는 업로드 제공 |
| 패키징된 **skill** 실행 | ✅ 안내형 | ✅ prompt+tools | ✅ `skill run` | 자동화의 단위 |
| 레지스트리 탐색 (모델/프레임워크/HW 카탈로그/strategy-ids) | ✅ | ✅ resource | ✅ list | RegistryService |
| 신뢰 사다리(trust-ladder) / 증거 완전성 상태 | ✅ (컨트롤 플레인 느낌) | ✅ resource | ✅ `--json` | 브리프 §1이 요구하는 정직성(honesty) 표면 |

범례: ✅ 일급 · ◑ 지원되나 보조적/구조화 전용.

이 매트릭스는 의도적인 비대칭을 인코딩한다: **시각적 저작(자유 형식 캔버스 그래프 + 마이크로 수준 HW 편집)은
웹 우선**이고, **동사이거나 사실인 모든 것(실행, 저장, 읽기, 수집, 투영)은 세 표면 모두에서 동등하다** — 그것이
코어 로직이기 때문이다.

---

## 6. TypeScript ⇆ Python 경계 (하중을 지탱하는 결정)

이것은 스택에서 가장 중대한 경계이다. **TS는 조율, UI, 계약, 영속성, 그리고 에이전트/자동화 표면을 소유한다.
Python은 시뮬레이션과 트레이스 세계를 소유한다** — 거기에 syntorch(맞춤 커널/HW 로직을 갖춘 drop-in torch
프론트엔드), Chakra 익스포터, LLMServingSim, ASTRA-sim, SST가 살며, HW 설계 계층이 실행된다. 그 선은 §2의
**엔진 어댑터 포트**에 그어진다.

### 6.1 각 측에 무엇이 사는가

| 관심사 | 측 | 이유 |
|---|---|---|
| 웹 UI, server actions, route handlers | **TS** | Next.js |
| 코어 서비스, 도메인 타입, Zod 계약 | **TS** | 모든 표면을 위한 하나의 계약 |
| MCP 서버, CLI | **TS** | 동일한 코어 import |
| 영속성 / 저장소(repositories) | **TS** | 코어에서 도달하는 데이터 계층 ADR-0002 |
| syntorch (vLLM 내부의 torch→syntorch 교체, 맞춤 커널/HW 로직, tiling/partitioning strategy-ids) | **Python** | 그것은 Python 패키지이다(브리프 §7); TS로 재구현 불가 |
| Chakra 익스포터 (sub-torch trace → Chakra ET) | **Python** | syntorch와 함께 살며; MLCommons ET를 생성 |
| LLMServingSim / ASTRA-sim / SST 드라이버 | **Python** | 네이티브 Python/C++ 시뮬레이터 |
| HW 설계 *실행/검증* (chip→cluster) | **Python** | syntorch HW 설계 계층이 진실의 원천(source of truth); UI Canvas 3은 그것의 편집기/시각화기 |
| HW 설계 *저작 상태 / work-tree* | **TS** | 데이터 계층에서 버전 관리; Python에 config로 전달 |

### 6.2 양측이 대화하는 방법 — 옵션

| 옵션 | 방법 | 장점 | 단점 | 적합성 |
|---|---|---|---|---|
| **A. 별도의 Python 서비스 (FastAPI 사이드카)** | TS 코어가 엔진을 감싸는 장기 실행 Python HTTP/gRPC 서비스를 호출; 장시간 실행은 콜백 Route Handler + SSE를 통해 보고 | 깨끗한 프로세스 격리; Python 의존성(torch/syntorch/CUDA)이 Node 밖에 유지; 수평 확장 가능; Node 재시작에도 생존; 장시간 작업 현실에 부합 | 두 개의 배포 대상; 작업/큐 + 상태 계약 필요; 이음새(seam)에서의 직렬화 | SimulationRun + 트레이스 캡처를 위한 **권장 기본값** |
| **B. 서브프로세스 (Node가 실행마다 Python을 spawn)** | `child_process`가 Python CLI 진입점을 실행; stdout/JSON-lines 스트림; 아티팩트는 공유 store로 | 시작하기 가장 간단; 호스팅할 서비스 없음; CLI/CI 및 로컬 개발에 훌륭 | Node 생명주기가 작업에 결합; 약한 백프레셔; 동시/장시간 실행에 지저분; 확장 어려움 | **로컬 개발, CLI, 짧은 HW 설계 검증 호출**에 적합; A가 존재하기 전 허용 가능한 부트스트랩 |
| **C. 메시지 큐 / 작업 러너** | 코어가 실행을 enqueue; Python 워커가 소비; 결과는 데이터 계층에 도착; 표면은 폴링/구독 | 배치 스윕, 재시도, 다수 동시 실행에 최적; 표면을 워커로부터 분리 | 가장 많은 인프라; 최종 일관성(eventual-consistency) UX; 초기에는 과잉 | 스윕 볼륨이 커질 때의 **Phase-2** 확장 경로 |
| **D. In-process 브리지 (PyodideMcp / node-calls-python)** | Node에 Python 임베드 | 네트워크 이음새 없음 | 네이티브/CUDA 의존성에 취약; 이벤트 루프 차단; 무거운 sim에 비현실적 | 엔진용으로 **기각(Rejected)** |

**권장:** 부트스트랩과 CLI/로컬 개발 경로 구동을 위해 **B(서브프로세스)**로 시작하되,
**SimEnginePort/TraceCapturePort/HwDesignPort 인터페이스를 A(FastAPI/gRPC 사이드카)로 교체하는 것이
리팩터가 아니라 config 변경이 되도록 설계하라.** 실행이 길어지고 동시화되는 즉시 무거운 SimulationRun 경로를
A로 마이그레이션하고, 짧고 동기적인 HW 설계 검증 호출에는 B를 유지하라. 실험 스윕이 큐를 요구할 때를 위해
C를 예비하라. 셋 모두 동일한 포트 뒤에 있으므로 코어와 모든 표면은 그 선택에 영향받지 않는다.

### 6.3 이음새에서의 계약

- **교환 형식은 명시적이고 버전 관리된다:** 실험 스펙 + HW config는 **TS→Python으로 JSON으로** 가고;
  엔진은 **Chakra ET**(MLCommons 표준, ASTRA-sim이 소비), **메트릭 JSON**, 그리고 **메모리 주석 IR**
  (L0/L1/L2 — 동일 스키마, 채움 수준만 다름)을 반환한다. OTel 트레이스는 실측 축에서 들어온다. 대용량 아티팩트는
  **artifact store**로 간다(바이트가 아니라 경로/URI가 이음새를 건넌다).
- **TS 측은 sub-torch 내부를 결코 파싱하지 않는다.** Chakra ET / IR / 메트릭을 불투명하지만-타입이-있는
  아티팩트로 다루고 관계를 저장한다(브리프 §9에 따라). 깊은 트레이스 의미론은 Python 측에 머문다.
- **strategy-ids는 산문이 아니라 식별자로 이음새를 건넌다**(브리프: tiling/partitioning은 명시적 코드/strategy
  id이다). 레지스트리는 id를 저장하고; syntorch가 그것을 실행한다.

---

## 7. "하나의 코어, 세 개의 표면" 접근의 트레이드오프

| 결정 | 장점 | 단점 / 비용 | 완화책 |
|---|---|---|---|
| UI/MCP/CLI가 import하는 공유 TS 코어 | 로직 분기 없음; 하나의 검증 계약 (Zod) | 코어가 프레임워크 무관(framework-agnostic)으로 유지되어야 함(Next.js import 누출 금지) | Lint 규칙 / 패키지 경계: `@caw/core`는 `next` 의존성 0 |
| UI 변경을 위한 Server Actions | 보일러플레이트 감소, 점진적 향상 | MCP/CLI가 재사용 불가 | MCP/CLI는 액션을 우회하고 코어를 직접 import(의도된 바) |
| 어댑터 포트 뒤의 Python | 엔진 기술 변경 가능; TS는 깨끗하게 유지 | 직렬화 + 프로세스 관리 오버헤드 | 버전 관리된 JSON 계약; 서브프로세스로 시작해 사이드카로 성장 |
| MCP = 코어 위의 얇은 래퍼 | 에이전트가 정확한 인간 동작을 얻음 | MCP 고유 어포던스(elicitation, 스트리밍) 설계 필요 | MCP 전송 기능을 표현으로 취급, 동사는 코어에 유지 |
| 패키징된 워크플로로서의 Skills | 모든 표면에서 재사용되는 자동화 단위 | 관리해야 할 또 하나의 추상화 | `Skill`을 선언적으로 유지; steps = 코어 서비스 호출만 |

---

## 8. 미해결 질문(Open Questions)

이것들을 [open-questions.md](../08-research-plan/open-questions_ko.md)에 반영하라.

- **OQ-PS-1:** *권장* 안정 상태를 위한 TS⇆Python 전송 — 사이드카(A)용 FastAPI HTTP vs gRPC?
  gRPC는 실행 진행 상황에 타입이 있는 스트리밍을 제공; HTTP+SSE는 더 간단. `TODO(open-question)`.
- **OQ-PS-2:** syntorch의 HW 설계 계층이 *프로그래밍 방식의* API(import 가능)를 노출하는가, 아니면 CLI/파일
  인터페이스만 노출하는가? 이는 HwDesignPort가 in-process 서브프로세스(B)인지 서비스(A)인지를 결정한다. 가정할 수
  없음 — SOURCE-BRIEF §7 너머의 syntorch 내부는 알려지지 않음. `TODO(open-question)`.
- **OQ-PS-3:** 실행 위치 — Node와 동일 호스트인가, 전용 sim 호스트/클러스터(CUDA, SST)인가? B가 프로덕션에서
  유효할 수 있는지 또는 A/C가 필수인지에 영향. `TODO(open-question)`.
- **OQ-PS-4:** 더 넓은 Company AI Workbench 기반을 위해 MCP 서버에 인증/멀티테넌트 범위 지정이 필요한가, 아니면
  단일 신뢰 로컬인가? (필요시 MCP SDK에 OAuth/URL-elicitation 헬퍼가 있음.) `TODO(open-question)`.
- **OQ-PS-5:** skills는 데이터 계층의 버전 관리된 아티팩트인가(자체 work-tree 포함), 아니면 코드로만 정의되는가?
  ADR-0007과 상호작용. `TODO(open-question)`.
- **OQ-PS-6:** CLI 배포 — 번들된 Node 바이너리, npx, 또는 컨테이너? CI 재현성에 중요.
  `TODO(open-question)`.
- **OQ-PS-7:** OTel 실측 수집이 Node에 대해 정확히 어디서 실행되는가(collector vs 직접)?
  [trace-capture-and-chakra.md](./trace-capture-and-chakra_ko.md)와 조율하라. `TODO(open-question)`.

---

## 9. 런북(runbooks)에 대한 함의

이 문서는 다음 런북들(`design/10-runbooks/`)을 구동한다:

- **RB-0XX — Monorepo & `@caw/core` 스캐폴드:** 워크스페이스 레이아웃(`apps/web`, `apps/mcp`, `apps/cli`,
  `packages/core`, `packages/schemas`), 프레임워크 무관 코어 경계, 공유 Zod 스키마. §2, §7 구현.
- **RB-0XX — Next.js app-router 골격:** server 셸 + client 캔버스 아일랜드, 변경을 위한 server actions,
  실행 상태 SSE + 아티팩트 다운로드 + Python 콜백을 위한 Route Handlers. §3 구현. (캔버스 내부 → ADR-0004 RB.)
- **RB-0XX — 엔진 어댑터 포트 & 서브프로세스 브리지:** SimEnginePort/TraceCapturePort/HwDesignPort/IngestPort
  정의와 JSON-lines 스트리밍 + artifact-store 인계를 갖춘 child-process(B) 구현. §6.2/§6.3 구현.
- **RB-0XX — Python sim 사이드카(A) 마이그레이션:** LLMServingSim→syntorch→ASTRA-sim을 감싸는 FastAPI/gRPC
  서비스, 실행 콜백 계약, 상태 스트리밍. §6.2 옵션 A 구현. (OQ-PS-1/2/3에 의해 게이팅됨.)
- **RB-0XX — MCP 서버:** 코어 서비스 → tools, registry/evidence → resources, skills → prompts 매핑; stdio +
  Streamable HTTP 전송. §4.1 구현.
- **RB-0XX — CLI:** `@caw/core` 위의 arg-parser 바이너리, `--json` 모드, `--watch` 실행 스트리밍. §4.2 구현.
- **RB-0XX — Skill 패키징:** `Skill` 정의, 레지스트리, 표면별 투영. §4.3 구현.

---

## 10. 출처(공개 근거)

- [Next.js Docs: App Router](https://nextjs.org/docs/app)
- [Route Handlers vs Server Actions (Next.js)](https://medium.com/@nuwan.thuduwage/route-handlers-vs-server-actions-the-old-way-vs-the-modern-way-in-next-js-a78d2300bb48)
- [MCP TypeScript SDK (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP TypeScript SDK server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [Model Context Protocol primer (2026)](https://www.developersdigest.tech/blog/what-is-model-context-protocol-2026-primer)

> 내부 패키지 `syntorch`는 SOURCE-BRIEF §7에 따라서만 기술된다; 그 너머의 어떤 내부도 여기서 주장되지 않는다.
> syntorch의 실제 API 표면에 의존하는 항목들은 가정이 아니라 미해결 질문으로 표시된다.

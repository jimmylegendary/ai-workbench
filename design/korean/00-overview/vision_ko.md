# 비전 — CAW-01 시뮬레이션 컨트롤 플레인(control plane)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [scope-and-non-goals_ko.md](./scope-and-non-goals_ko.md), [personas-and-use-cases_ko.md](./personas-and-use-cases_ko.md), [../03-architecture/system-architecture_ko.md](../03-architecture/system-architecture_ko.md), [../05-caw01-simulation-control-plane/overview_ko.md](../05-caw01-simulation-control-plane/overview_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

이 문서는 Company AI Workbench의 첫 번째 가시적 제품이자 시스템의 핵심인 **CAW-01**의 북극성(north star)을
정의한다. 제품이 *왜* 존재하는지, 그리고 *첫 번째로 신뢰할 만한 버전이 무엇을 입증하는지*를 규정한다.
UI 동작 방식, 스키마, 빌드 단계는 다루지 *않는다* — 그것들은 `05-*`, `04-*`, `10-runbooks/`에 있다.

## 명제: 솔버(solver)가 아니라 계측기(instrument)

전통적인 설계 공간 탐색(design-space exploration, DSE)은 *고정된* 설계 공간 내부에서 최적점을 탐색한다.
CAW-01의 베팅은 다르다: 메모리 중심 AI 하드웨어에서는 **워크로드 축과 디바이스 클래스가 알려져 있지 않거나,
움직이거나, 미래의 AI 워크로드에 의해 새롭게 만들어진다**. 그래서 이 제품은 도메인 전문가가 설계 공간 축을
저렴하게 *옮기고, 추가하고, 테스트할 수 있게* 하는 **계측기**이며 — 워크로드 가설에서 메모리 디바이스
함의(implication)까지 이어지는 증거 사슬(evidence chain)을 보존한다.

따라서 용량 대 대역폭(capacity-vs-bandwidth)은 **출발점에 있는 질문이 아니다**. 그것은 워크로드 축이
선택되고 실행된 뒤에 산출되는 *결과물*이다.

## 가치의 단위: 하나의 재현 가능한 실험

이 제품의 원자적 산출물은 결코 화면이 아니다. 그것은 하나의 재현 가능한 실험이다:

```
(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection
```

CAW-01의 모든 것 — 세 개의 캔버스, 컨트롤 패널, 워크 트리(work-tree), 엔진 — 은 그 루프를
**조합 가능하고, 실행 가능하고, 검사 가능하며, 증거로 보존 가능하게** 만들기 위해 존재한다.

## 세 개의 증거 축, 하나의 IR

CAW-01은 세 개의 독립적인 진실의 원천(source of truth)을 단일 **메모리 주석 IR(memory-annotated IR)**
(`L0 → L1 → L2` 채움 수준 — [l0-ir-schema_ko.md](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md) 참조)로
정규화한다:

| 축 | 원천 | 트레이스 |
| --- | --- | --- |
| 실측 | 실제 서비스 인프라 | OTel trace (검증 앵커) |
| 합성 실행 | torch→`syntorch`를 사용한 vLLM | sub-torch trace → Chakra trace |
| 시뮬레이션 | LLMServingSim + ASTRA-sim (+ SST) | Chakra 기반 projection |

결정적인 엔지니어링 선택([ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)): 세 축은
**병렬로 하나의 L0 IR로 들어가서** 하나의 실험 행(row)으로 비교된다 — 문자 그대로 사슬처럼 연결되지 않는다.

## 제품 한눈에 보기

상단 **nav bar**(Simulation / Module Design / User / Setting)를 갖춘 **Next.js 웹 앱**
([ADR-0001](../01-decisions/ADR-0001-product-surface_ko.md),
[ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md)). **Simulation** 화면은 **1:9**로 분할된다:

- **왼쪽 (1) — 컨트롤 패널:** 실행 / 정지 / 설정, 실행 상태, 증거 + projection 판독값, 항목별 및 전체 저장.
- **오른쪽 (9) — 워크스페이스:** 서로 연동되는 세 개의 캔버스 —
  1. **AI Workload Flow** (하나의 agent-turn을 그래프로 시각화),
  2. **Serving & Representation** (서빙 프레임워크 × 표현 계층 × 시뮬레이터 경로 선택),
  3. **Hardware Design** (chip → die → package → tray → rack → cluster, 실제 하드웨어처럼 시각화하며, 드릴 가능하고 편집 가능).

세 캔버스 전반의 모든 선택/편집은 항목별 및 전체 저장이 가능한 **워크 트리(work-tree)**로 추적된다
([ADR-0007](../01-decisions/ADR-0007-change-management-worktree_ko.md)).

동일한 도메인 코어는 **MCP**와 **CLI**를 통해서도 접근할 수 있어, Company AI Workbench 기반(substrate)의
다른 에이전트들이 이를 구동할 수 있다.

## 설계 편향(design bias)

CAW-01은 **챗봇이 아니라 컨트롤 플레인처럼 느껴져야** 한다. 주요 표면은 다음과 같다: 실행 상태, 증거
완전성, 미해결 질문, 블로커, 아티팩트 준비 상태, 그리고 다음으로 취할 정직한 행동.

## 첫 번째 수직 슬라이스(Milestone 1)

실질적인 가치를 입증하는 가장 작은 것([../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md) 참조):

1. **L0 메모리 주석 IR**을 정의한다.
2. **하나의 agent-turn** 요청을 ServingSim 스타일 경로 **와** syntorch 스타일 경로로 실행한다.
3. 둘 다 **Chakra**로 내보내고, 둘 다 **동일한 L0**로 낮춘다(lower).
4. 용량 피크(capacity-peak) + 대략적인 트래픽을 계산하고, 두 축의 **비교 가능한 projection**을 렌더링한다.
5. 출처, 가정, 출력을 나중에 논문/특허에 공급될 수 있는 증거 행으로 보존한다.

## 왜 중요한가 (북극성)

이 루프가 신뢰할 만해지면, CAW-01은 프로그램의 나머지를 위한 기반이 된다: 논문/특허 증거
(CAW-03), 트렌드/신규성 레이더(CAW-05), 미래 AI/TTT 워크로드 축(CAW-06)이 모두 동일한
실험 레지스트리와 신뢰 사다리(trust ladder)에 연결된다.

## 미해결 질문

- 문자 그대로의 파이프라인 순서 대 병렬 축 해법
  ([../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적됨).

## 런북에 대한 함의

`10-runbooks/`의 phase-0 → phase-5 마일스톤 프레이밍을 견인한다; 위의 Milestone 1은 첫 번째 종단 간
(end-to-end) 런북 체인의 수용 목표(acceptance target)이다.

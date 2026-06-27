# 범위 & 비목표(Non-Goals) — CAW-01 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision_ko.md](./vision_ko.md), [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md), [../08-research-plan/research-plan_ko.md](../08-research-plan/research-plan_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

**CAW-01 버전 1** 주위에 단단한 경계를 긋는다. 그래서 빌드가 광범위한 플랫폼이 아니라 워크플로 의미론을
입증하는 작은 수직 슬라이스로 유지되도록 한다. *범위 내(in scope)*에 나열되지 않은 모든 것은 기본적으로
연기(defer)된다.

## 범위 내 (CAW-01 v1)

| 영역 | v1 약속 |
| --- | --- |
| 셸(Shell) | 상단 nav bar (Simulation / Module Design / User / Setting); 1:9 컨트롤 패널:워크스페이스 분할을 갖춘 Simulation 화면 |
| Canvas 1 | 하나의 agent-turn을 L0 `TensorNode`/`DataMovementEdge`로 매핑되는 플로 그래프로 시각화 |
| Canvas 2 | 서빙 프레임워크 × 표현 계층 × 시뮬레이터 경로를 조합; 파이프라인 문법(grammar)에 대해 배선(wiring) 검증 |
| Canvas 3 | chip→die→package→tray→rack→cluster 설계 + 시각화; 드릴다운, 부품 선택(`partId`), 마이크로 편집/추가 |
| 컨트롤 패널 | 실행 / 정지 / 설정; 실행 상태 머신; 증거 + projection 판독값; 항목별 및 전체 저장 |
| 워크 트리 | 세 캔버스 전체에 걸친 git 유사 change_blob/tree/commit/ref; what-if를 위한 브랜치 |
| IR | **L0 채움 수준만** — 연산 수준(op-level) 그래프 + 텐서 크기/수명 → 용량 피크 + 대략적 트래픽 |
| 축 | 합성(syntorch→Chakra) 축과 시뮬레이션(LLMServingSim+ASTRA-sim) 축을 **병렬로 하나의 L0로** 실행 |
| 엔진 | 프로세스 외부(out-of-process) Python 서비스; 기본 충실도 계층(fidelity tier)으로 **ASTRA-sim 분석 백엔드** |
| 표면(Surfaces) | 웹 앱이 주력; 동일한 `@caw/core` 위에 얇은 MCP + CLI 어댑터 |
| 데이터 | **Postgres 이식성을 유지한 SQLite**로 시작; 큰 트레이스 blob은 경로/URI로 파일시스템에 저장 |
| 디자인 | 오픈 디자인 시스템: DTCG 토큰에서 테마링한 shadcn/ui + Radix + Tailwind v4 |

## 범위 외 / 명시적 비목표 (v1)

- **L1 / L2 채움 수준** (메모리 계층 상주, 커널 수준 타일링 스케줄) — 스키마는 준비되어 있으나 v1에서 채워지지 않음.
- **라이브 축으로서의 실제 OTel 통합** — v1에서 OTel은 *검증 앵커* 개념일 뿐; 프로덕션 텔레메트리 배선 없음.
- **ns-3 / SST 고충실도 네트워크 백엔드** — 분석 백엔드만; 고충실도는 플래그 뒤에서, 나중에.
- **완전한 vLLM 임베딩 / 프로덕션 서빙** — v1은 배포된 vLLM이 아니라 syntorch를 감싼 얇은 vLLM 형태의 하니스(harness)를 사용.
- **MoE, 분산(disaggregated) 서빙, 전력 모델링** (LLMServingSim 2.x 기능) — 연기됨.
- **Neo4j / 전용 그래프 DB** — 측정된 핫 경로가 강제하기 전까지 그래프는 Postgres(인접 리스트 + 재귀 CTE)에 유지.
- **전용 벡터 스토어** — pgvector를 DB 내부에서만, 그리고 시맨틱 검색이 실제 필요할 때만.
- **실시간 다중 작성자 협업 / CRDT** — 단일 전문가 규모; 연기됨 ([ADR-0007](../01-decisions/ADR-0007-change-management-worktree_ko.md)).
- **공개 웹사이트 / REST API 표면 (CAW-04)** 및 **논문/특허 제품 (CAW-03)** — *CAW-01의 내보내기(export)를 소비할* 수 있는 별도의 독립 제품이며, CAW-01 v1의 일부가 아님.
- **일반 지식 저장소** (외부 Sources / Claims / Notes / Concepts / Interests / OpenQuestions를 수집) — 이는 **별도의 제품(CAW-02)**이며, CAW-01의 데이터 모델의 일부가 아님. CAW-01은 자체 실행에 필요한 얇은(lean) run-evidence + provenance만 유지한다.
- **진실의 원천으로서의 Generative-UI** — 일회성 스캐폴딩 스파이크로만 허용됨 ([ADR-0006](../01-decisions/ADR-0006-design-system-open-design_ko.md)).

## 연기되었으나 스키마로 예상된 것

이것들은 v1에서 *빌드되지 않지만* 데이터 모델과 IR이 이를 배제해서는 안 된다: L1/L2 채움, 실제 OTel 행,
추가 서빙 프레임워크, 추가 충실도 백엔드, 다중 사용자 브랜치, 그리고 CAW-01의 run-evidence 아티팩트가 다른
독립 제품(예: CAW-02의 지식 저장소, CAW-03의 논문/특허 제품)에 의해 소비될 수 있는 깨끗한 **내보내기 경계
(export boundary)**. 광범위한 지식 모델 자체는 CAW-01 외부에 남는다 — 그것은 CAW-02에 있다.

## 가드레일 (상속됨)

- 외부 공개 출력물에 회사 기밀 데이터를 넣지 말 것.
- 공개 출처 연구를 내부 Samsung/SAIT 주장과 절대 혼동하지 말 것.
- 출처, 주장, 증거, 생성된 결론을 분리해 유지할 것; 주장은 증거를 가리켜야 한다.

## 미해결 질문

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적됨 — 특히
ServingSim/ASTRA-sim 순서와 정확한 syntorch 캡처 고도(altitude).

## 런북에 대한 함의

각 비목표는 관련 런북 내부의 "아직 빌드하지 말 것(do NOT build yet)" 가드가 된다; 범위 내 표는
phase-0→phase-5 런북들이 집합적으로 충족해야 하는 체크리스트이다.

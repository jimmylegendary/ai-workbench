# 리스크 및 완화 방안(Risks & Mitigations) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases_ko.md), [dependency-graph.md](./dependency-graph_ko.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

CAW-01 구축의 최상위 리스크와 그 완화 방안으로, 신뢰 사다리(trust ladder) 및 비목표(non-goals)와 일관된다.

## 리스크 레지스터

| ID | 리스크 | 가능성 | 영향도 | 완화 방안 |
| --- | --- | --- | --- | --- |
| RK-1 | **syntorch 내부 불확실성** (캡처 고도(altitude), Chakra 방언) | 높음 | 높음 | syntorch를 배선하기 전에 Chakra interchange를 먼저 디리스크(T1 reference 라운드트립); 파이프라인의 앞단만 가변적인 것으로 취급; 사실(fact)은 [SOURCE-BRIEF §7](../_meta/SOURCE-BRIEF_ko.md)에 한정. |
| RK-2 | **ServingSim/ASTRA-sim 순서 충돌** (OQ-01) | 높음 | 중간 | v1은 축들을 리터럴 체인이 아니라 하나의 L0로 병렬 실행; phase-3/4에서 증거 기반으로 replace 대 parallel을 결정. |
| RK-3 | 인터랙티브 예산에서 **Canvas-3 3D 실현 불가능** | 중간 | 중간 | 문서화된 **Konva 2D 폴백**을 갖춘 타임박스 스파이크(OQ-08); 3D는 Milestone-1 임계 경로 밖. |
| RK-4 | **트레이스 신뢰성** (syntorch 대 실제 HW) | 높음 | 높음 | 신뢰 사다리 + golden 테스트 T3/T4; 실행은 trust rung을 동반; 어떤 것도 자신의 rung을 넘어 게시되지 않음. |
| RK-5 | v1을 넘어선 **스코프 크리프(scope creep)** | 중간 | 높음 | 명시적 비목표([../00-overview/scope-and-non-goals.md](../00-overview/scope-and-non-goals_ko.md)); 각 runbook은 "아직 빌드하지 말 것" 가드를 동반. |
| RK-6 | **빌드 예산 / rate-limit 중단** | 높음 | 중간 | runbook은 작고 원자적이며 재개 가능하게; 대규모 병렬 fan-out보다 순차적 메인 루프 작성을 선호; 각 runbook은 깨끗한 핸드오프를 갖춰 한도 리셋 후 작업이 재개되도록. |
| RK-7 | **L0에서 데이터 모델 오류** (1급(first-class) 필드 누락) | 중간 | 높음 | 승격(promotion) 원칙: 불투명(opaque)하게 시작하고 반복된 증거에서만 승격; L0 라운드트립(T2)이 스키마 충돌을 조기에 포착. |
| RK-8 | **TS⇆Python 이음매(seam) 복잡성** | 중간 | 중간 | 엔진을 타입드 포트(typed port) 뒤의 out-of-process로 유지; 아티팩트는 인라인이 아니라 경로 기반(artifact-by-path); 전송(transport) 선택은 연기하되 격리(OQ-09). |
| RK-9 | **출처(provenance) 누출** (기밀이 공개로) | 낮음 | 높음 | 경계/신뢰 태그 + DB 제약; 공개 출력은 공개 안전(public-safe) 소스에서만([../04-data-layer/knowledge-substrate.md](../04-data-layer/knowledge-substrate_ko.md)). |

## 교차 관심사 원칙(Cross-cutting principle)

**가장 약한 고리 = 트레이스 신뢰성**을 보호하라. 모든 아키텍처 선택(명시적 strategy_ids, 단일 L0,
golden 테스트, trust rung)은 그 고리를 방어 가능하게 만들기 위해 존재한다.

## 이 설계 작업 자체에 대한 노트(실제 적용된 RK-6)

바로 이 설계 세트가 rate-limit 중단 하에서 만들어졌다. 그 교훈은 빌드 계획에 인코딩되어 있다:
대규모 병렬 에이전트 fan-out보다 작고 재개 가능한 runbook과 순차적 작성을 선호하라.

## 미해결 질문

빌드 예산 시퀀싱(단일 빌더가 지속할 수 있는 병렬성의 정도) — TODO(open-question),
[dependency-graph.md](./dependency-graph_ko.md).

## runbook에 대한 함의

각 runbook의 **Rollback/safety** 및 **Hand-off** 섹션이 RK-6를 운영화한다. RK-5 가드는 각 runbook에서
명시적 비목표 리마인더로 나타난다.

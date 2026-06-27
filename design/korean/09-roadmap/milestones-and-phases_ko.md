# 마일스톤 및 단계(Phase) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [dependency-graph.md](./dependency-graph_ko.md), [risks-and-mitigations.md](./risks-and-mitigations_ko.md), [../10-runbooks/README.md](../10-runbooks/README_ko.md), [../00-overview/vision.md](../00-overview/vision_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

빌드 작업을 runbook 폴더와 1:1로 정렬되는 단계들로 나누고, 각 단계마다 목표와 진입/종료 기준을 부여한다.
첫 번째 수직 슬라이스(Milestone 1)가 북극성(north-star) 격의 인수 기준이다.

## 단계(Phase) (↔ runbook 폴더)

| 단계 | 폴더 | 목표 | 종료 기준 |
| --- | --- | --- | --- |
| **0 Foundations** | `phase-0-foundations` | 모노레포, `@caw/core` 계약, 데이터 계층, 디자인 시스템 | 경계(boundary) + CI lint 통과(green); SQLite 스키마 마이그레이션 동작; 토큰 빌드 |
| **1 App shell** | `phase-1-app-shell` | 내비게이션 바, 1:9 레이아웃, 스토어, run/save 배선 | 시뮬레이션 화면 렌더링; Server Actions가 core에 도달; SSE 상태 라우트 동작 |
| **2 Canvases** | `phase-2-canvases` | C1/C2 (React Flow), C3 (3D 스파이크→빌드), work-tree UI | 세 캔버스 모두 편집→change_blob 동작; work-tree save/branch/diff 동작 |
| **3 Simulation engine** | `phase-3-simulation-engine` | L0 IR, lowering, projection | T2 L0 라운드트립 통과; projection 렌더링 |
| **4 Trace pipeline** | `phase-4-trace-pipeline` | syntorch 캡처, Chakra exporter, ASTRA-sim | T1 reference 라운드트립 통과; 합성(synthetic) 축이 L0 생성 |
| **5 Persistence & API** | `phase-5-persistence-and-api` | MCP + CLI 표면(surface) | 동일한 연산을 MCP/CLI로 접근 가능 |

## 마일스톤

### Milestone 1 — 최초의 비교 가능한 실험(수직 슬라이스)
가치를 증명하는 가장 작은 단위([../00-overview/vision.md](../00-overview/vision_ko.md)):
1. L0 IR 정의(phase-3).
2. 하나의 agent-turn을 ServingSim 스타일 경로 **그리고** syntorch 스타일 경로로 실행(phase-3/4).
3. 둘 다 Chakra로 export하고, 하나의 L0로 lowering(phase-3/4).
4. capacity-peak + traffic 계산; **비교 가능한 projection** 렌더링(phase-3).
5. 입력/가정/출력을 증거(evidence) 행으로 보존(phase-0 데이터 + phase-3).
**인수 기준:** T2 통과 및 UC-1 데모 가능.

### Milestone 2 — 커스텀 하드웨어 재실행
Canvas-3 하드웨어 변경 → 재실행 → 변경된 projection(UC-2). phase-2 (C3) + phase-3/4 필요.

### Milestone 3 — What-if 브랜치
구성을 브랜치하고, 둘 다 실행하여 비교(UC-3). phase-2 work-tree + projection 필요.

### Milestone 4 — 신뢰 사다리(Trust ladder)
T3/T4 golden 테스트 + trust-rung 표출; CAW-03용 증거 export. 실제 A100/OTel 기준선(baseline) 필요.

## 시퀀싱 노트(예산 인식)

단계들은 점진적으로 구축할 수 있다. Milestone 1은 의도적으로 phase-0/1/3/4의 핵심만 걸치도록 하여
C3 3D 및 MCP/CLI 다듬기 이전에 신뢰할 만한 데모가 존재하게 한다.

## 미해결 질문

phase-2(C3 스파이크)와 phase-3(엔진)의 정확한 순서 — phase-1 이후 병렬로 진행 가능;
TODO(open-question) ([dependency-graph.md](./dependency-graph_ko.md)).

## runbook에 대한 함의

각 단계 폴더의 runbook들은 집합적으로 해당 단계의 종료 기준을 충족해야 한다. Milestone 1은 phase-0→4에 걸친
인수 체인이다.

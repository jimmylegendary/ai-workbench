# 컨트롤 패널 & Run 라이프사이클 (UX) — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [simulation-engine-and-projection.md](./simulation-engine-and-projection_ko.md), [change-management-worktree.md](./change-management-worktree_ko.md), [../06-frontend/layout-and-navigation.md](../06-frontend/layout-and-navigation_ko.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

Simulation 화면의 왼쪽 **"1"** 컨트롤 패널을 규정한다: 실행, 저장, 그리고 run 상태/근거(evidence) 표시. 엔진 라이프사이클은 [simulation-engine-and-projection.md](./simulation-engine-and-projection_ko.md)에, 레이아웃 비율은 [../06-frontend/layout-and-navigation.md](../06-frontend/layout-and-navigation_ko.md)에 있다.

## 섹션 (위에서 아래로)

| 섹션 | 컨트롤 | 백엔드 |
| --- | --- | --- |
| **Run** | Run / Stop / Configure (축, backend tier) | `RunService.start/stop` |
| **Status** | 축별 진행률, 상태(queued/running/done/failed/stopped) | `RunService.status` (스트림) |
| **Projection** | 비교 가능한 projection 표시(capacity peak, traffic, latency, delta, trust rung) | `EvidenceService.projection/trustStatus` |
| **Save** | **항목별 저장(Per-item save)** / **전체 저장(Full save)** + 메시지 | `WorkTreeService.saveItem/saveAll` |
| **Evidence** | 아티팩트 목록(Chakra/OTel/native) + 준비 상태 | `EvidenceService` |
| **Honest next action** | 가장 유용한 단 하나의 다음 단계(control-plane 편향) | 도출됨 |

## Run 플로우 (UX)

1. 사용자가 캔버스들에 걸쳐 구성 → grammar + 하드웨어 config가 충족되면 컨트롤 패널이 "실행 준비됨(ready to run)"을 표시한다.
2. **Run** → 상태가 축별로 스트리밍되며, 캔버스는 실시간 진행을 반영할 수 있다.
3. **done** 시 → projection + evidence가 채워지고, "honest next action"이 갱신된다(예: "validate against OTel golden").

## Save 플로우 (UX)

- **항목별 저장(Per-item save)**: 선택된 서브트리만 저장한다(예: 하드웨어 변경) → 서브트리 커밋.
- **전체 저장(Full save)**: 메시지와 함께 전체 실험 트리를 커밋한다.
- 둘 다 work-tree로 전달된다([change-management-worktree.md](./change-management-worktree_ko.md)).

## Control-plane 편향

이 패널은 run 상태, evidence 완전성, 미해결 질문, 블로커, 아티팩트 준비 상태, 그리고 다음 honest action을 전면에 둔다 — 채팅 박스가 **아니다** ([../00-overview/vision.md](../00-overview/vision_ko.md)).

## 상태 & 가드

- 구성이 유효해질 때까지(grammar + 하드웨어 존재) Run은 비활성화된다.
- Stop은 실행 중에만 가능하며, Save는 항상 가능하다(현재 트리 상태를 저장).
- 실패한 run은 오류와 함께 config를 보존하는 재시도를 노출한다.

## 미해결 질문

"honest next action"이 v1에서 규칙 기반인지, 이후 LLM 보조 방식인지 — v1 = 규칙 기반; TODO(open-question).

## 런북에 대한 함의

Phase-1은 패널 셸 + core 서비스에 연결된 run/save 버튼을 구축한다; phase-3는 엔진이 결과를 산출하면 projection/evidence 표시를 채운다.

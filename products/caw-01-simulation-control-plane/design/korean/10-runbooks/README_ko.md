# 런북 — CAW-01 빌드 지침

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** AI 빌더 (사람 독자가 아님)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md · 규약: [runbook-conventions_ko.md](./runbook-conventions_ko.md)

## 이것은 무엇인가

런북은 CAW-01의 **실행 가능한 빌드 계획**이다. 각 런북은 원자적이고 검증 가능한 단계로 이루어진 하나의 응집된 빌드 단위다. `design/00..09`의 설계 문서는 *무엇을* 그리고 *왜*를 말하고, 런북은 *어떻게 만드는지*를 말한다.
**제품은 이 런북을 따르는 AI 에이전트가 빌드하며, 설계 작성자가 빌드하는 것이 아니다.**

## 실행 방법

1. [runbook-conventions_ko.md](./runbook-conventions_ko.md)와 `../_meta/SOURCE-BRIEF_ko.md`를 한 번 읽는다.
2. 런북을 phase 순서대로 실행한다. 한 phase 안에서는 각 런북의 `Depends on:`을 존중한다.
3. 게이트([../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md) 참조)가 green이 아닌 런북은 시작하지 않는다.
4. 각 런북 이후 다음으로 넘어가기 전에 그 **Acceptance criteria**를 확인한다.

## Phase (↔ [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md))

| Phase | 폴더 | 런북 |
| --- | --- | --- |
| 0 Foundations | `phase-0-foundations` | RB-000 repo scaffold · RB-001 tooling/CI · RB-002 data layer · RB-003 design system |
| 1 App shell | `phase-1-app-shell` | RB-010 Next.js shell · RB-011 nav + 1:9 layout · RB-012 store + run/save wiring |
| 2 Canvases | `phase-2-canvases` | RB-020 React Flow foundation · RB-021 Canvas 1 · RB-022 Canvas 2 · RB-023 Canvas 3 3D spike (gate) · RB-024 Canvas 3 build · RB-025 work-tree UI |
| 3 Simulation engine | `phase-3-simulation-engine` | RB-030 L0 IR · RB-031 Chakra→L0 lowering · RB-032 simulation runtime · RB-033 projection + metrics |
| 4 Trace pipeline | `phase-4-trace-pipeline` | RB-040 Chakra↔ASTRA-sim reference round-trip (gate) · RB-041 syntorch capture · RB-042 Chakra exporter · RB-043 ASTRA-sim integration |
| 5 Persistence & API | `phase-5-persistence-and-api` | RB-050 MCP server · RB-051 CLI |

## Milestone 1 체인

`RB-000 → RB-001 → RB-002 → RB-010 → RB-012 → RB-030 → RB-031 → RB-033 → RB-040 → (RB-041→RB-042→RB-043)`
T2 L0 round-trip + 비교 가능한 projection(UC-1)으로 마무리된다.

## 예산 규율 (RK-6)

런북은 의도적으로 작고 재개 가능하게 설계되었다. 빌드 세션이 중단되면(rate limit 등) 시작하지 않은 다음 런북에서 재개하면 된다. 각 런북의 **Hand-off**가 다음 런북이 가정해도 되는 사항을 명시한다.

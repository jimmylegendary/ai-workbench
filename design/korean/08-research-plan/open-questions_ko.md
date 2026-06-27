# 미해결 질문(추적 대상) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan_ko.md](./research-plan_ko.md), [validation-and-golden-tests_ko.md](./validation-and-golden-tests_ko.md), [../01-decisions/](../01-decisions/)의 모든 ADR
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

연구 문서, ADR, 설계 문서에서 집계한 미해결 질문의 단일 추적 목록이다. 각 행은 소유 결정(owning decision)과 해결되어야 할 마일스톤을 명시한다.

## 추적 질문

| ID | 질문 | Owner | Resolve by | Status |
| --- | --- | --- | --- | --- |
| OQ-01 | **ServingSim/ASTRA-sim 순서**: LLMServingSim은 이미 ASTRA-sim을 내장한다 — syntorch가 그 op별 비용 모델을 대체하는가, 아니면 병렬로 하나의 L0에 입력되는가? | [ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md) | phase-3/4 | open (v1: parallel) |
| OQ-02 | syntorch **캡처 고도(altitude)** (`__torch_dispatch__` / custom dispatcher / 자체 recorder)? | ADR-0005 | phase-4 | open |
| OQ-03 | syntorch는 **표준 Chakra `.et`** 를 직접 방출하는가, 아니면 네이티브 + exporter 방식인가? per-rank 파일 규약은? | ADR-0005 | phase-4 | open |
| OQ-04 | 통합 목표가 되는 **Chakra `et_def.proto` 리비전**은 무엇인가? | ADR-0005 | phase-4 | open |
| OQ-05 | **vLLM 버전** 고정(V0 vs V1) + syntorch가 충족해야 하는 정확한 torch API 표면? | ADR-0005 | phase-0/4 | open |
| OQ-06 | Chakra ET는 **텐서 크기/수명**을 담는가, 아니면 L0에 도달하기 위해 확장(extension)/사이드카가 필요한가? | ADR-0005/[ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md) | phase-3 | open |
| OQ-07 | 텐서 **수명(lifetime)**은 DAG 순회만으로 구하는가, 아니면 syntorch의 alloc/free 이벤트로 구하는가? | ADR-0005 | phase-3 | open |
| OQ-08 | **Canvas-3 3D 실현 가능성** — r3f 상호작용 예산(budget) vs Konva 2D 폴백? | [ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md) | phase-2 spike | open |
| OQ-09 | TS⇆Python 경계(seam)의 **엔진 전송(transport)** (stdio / HTTP / queue)? | [ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md) | phase-4 | open (v1: HTTP) |
| OQ-10 | **L0 저장**: L0 규모에서 행(rows, 쿼리 가능) vs blob+index? | ADR-0002 | phase-3 | open |
| OQ-11 | 데이터 레이어 규모 트리거: **pgvector / Neo4j**는 언제 추가하는가? | ADR-0002 | 상시(ongoing) | open |
| OQ-12 | **신뢰 사다리 임계값**(T3/T4 허용 오차) — A100/OTel 기준선 필요 | [validation](./validation-and-golden-tests_ko.md) | phase-3 | open |
| OQ-13 | 어느 **충실도 백엔드(fidelity backend)**(ns-3/SST)를, 언제 분석적(analytical) 기본값 대비 필수로 두는가? | ADR-0005 | 추후(later) | open |
| OQ-14 | **디자인 저작(authoring)**: Penpot vs 손으로 작성한 DTCG; DTCG→Tailwind 빌드 도구? | [ADR-0006](../01-decisions/ADR-0006-design-system-open-design_ko.md) | phase-0 | open |
| OQ-15 | 워크 트리(work-tree): v1에서 **3-way merge**를 노출하는가, 아니면 branch+diff만 두는가? | [ADR-0007](../01-decisions/ADR-0007-change-management-worktree_ko.md) | phase-2 | open (lean: no) |
| OQ-16 | **MCP 범위 지정(scoping)** (read-only vs mutating) + skill 패키징 매니페스트? | [ADR-0001](../01-decisions/ADR-0001-product-surface_ko.md) | phase-5 | open |
| OQ-17 | "정직한 다음 행동(honest next action)"은 v1에서 규칙 기반(rule-derived)인가, LLM 보조(LLM-assisted)인가? | [control-panel](../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle_ko.md) | v1 | open (lean: rules) |
| OQ-18 | **에이전트 턴 구조(agent-turn structure)**는 얼마만큼 손으로 작성하고, 얼마만큼 캡처된 L0에서 가져오는가? | [canvas-1](../05-caw01-simulation-control-plane/canvas-1-ai-workload-flow_ko.md) | phase-2 | open |
| OQ-19 | Python `engine/`을 모노레포(monorepo)에 둘 것인가, 형제 레포(sibling repo)에 둘 것인가? | [repo-structure](../03-architecture/repo-structure_ko.md) | phase-0 | open (lean: monorepo) |
| OQ-20 | 단일 사용자 v1에서 User/Setting에 대한 인증/세션 모델은? | [ui-architecture](../06-frontend/ui-architecture-nextjs_ko.md) | phase-1 | open |

## 프로세스

- 질문은 그 소유 ADR/문서에 결정을 기록하고 여기 Status를 `resolved`로 전환하면 닫힌다.
- 빌드 중 발견된 새 질문은 다음 OQ id로 추가된다.

## 런북에 대한 함의

게이팅 질문(OQ-08 스파이크, OQ-04 Chakra 리비전, OQ-05 vLLM 고정)은 의존 작업이 진행되기 전에 해당 phase의 첫 런북에서 해결되어야 한다.

# Review / Status UI (minimal) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-and-mcp.md](./api-and-mcp_ko.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적 (Purpose)

human gate를 위한, 의도적으로 최소화한 읽기/실행(read/act) surface. 편집기가 아니라 control-plane에 가까운 느낌이다.

## 뷰 (Views)

| View | 표시 내용 |
| --- | --- |
| **Artifact board** | lifecycle 상태별 artifact (gated→assembled→drafting→drafted→reviewed→published / filing-gate / held) |
| **Gate view** | claim별 gate 상태 + **blocked-claim backlog**(각 claim이 실패한 이유) |
| **Novelty/ladder** | claim 플래그(novel/threatened/patent-sensitive) + P1/P2/P3 준비 상태 |
| **Review** | checklist + autorater 점수; 승인 → publish/filing-gate |
| **Adapters** | registry + capability preflight 상태(향후 connector 중 어느 것이 stub인지 포함) |

## 동작 (Actions, 모두 core를 거침)

- review 승인; `publish` 트리거(core의 confirmation + interlock + 기밀성(confidentiality)).
- 특허 draft를 사람/법무(counsel)의 **filing-gate**로 전송(절대 자동 출원하지 않음).
- counsel가 승인하면 patent-first interlock을 해제.

## 비목표 (Non-goals)

claim/evidence 편집(그것은 CAW-02), draft 편집(그것은 engine), 또는 어떤 gate든 우회하는 것. UI는 op-manifest가 금지하는 것을 할 수 없다.

## 미해결 질문 (Open questions)

v1에서 UI를 함께 출시할지 아니면 CLI만 먼저 낼지 여부(UI는 "minimal"이며 후속으로 갈 수 있음) — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의 (Implications for runbooks)

UI runbook은 얇다: lifecycle/gate/novelty/review 상태를 읽고 동일한 governed op를 호출한다. Milestone 1에서는 선택 사항이다(CLI로 충분).

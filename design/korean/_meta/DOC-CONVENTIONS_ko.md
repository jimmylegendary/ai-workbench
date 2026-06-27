# 문서 작성 규약 — `design/`의 모든 파일을 작성하는 방식

모든 작성자(사람이든 AI든)는 이 규약을 따르므로, 문서 집합 전체가 하나의 일관된 시스템처럼 읽힙니다.

## 1. 언어 및 대상 독자
- **언어: 영어** — 모든 설계 산출물과 런북에 영어를 사용합니다(기술적 정밀성 + 도구 친화성).
- 두 부류의 독자: (a) **Jimmy / 리뷰어**(설계 문서: 무엇을, 왜), (b) **AI 빌더**(런북: 어떻게).

## 2. 파일 헤더 (모든 문서는 이것으로 시작)
```
# <Title>

- **Status:** draft | reviewed | accepted
- **Owner:** Jimmy
- **Last-reviewed:** (leave as TODO; do not invent dates)
- **Related:** [relative links to sibling docs]
- **Source of truth:** ../_meta/SOURCE-BRIEF.md
```
그다음 한 문단의 **Purpose**로, 이 문서가 무엇을 결정/기술하는지, 그리고 명시적으로 다루지 *않는* 것이 무엇인지를 서술합니다.

## 3. 구조
- `##`/`###` 제목, 짧은 문단, 비교에는 표, 스키마/스니펫에는 fenced code를 사용합니다.
- 산문 덩어리보다 **결정 표(decision table)**와 **명시적 트레이드오프**를 선호합니다.
- 설계 문서는 **Open Questions**(이를 `08-research-plan/open-questions.md`로 링크)와
  **Implications for runbooks**(이 문서가 추동하는 RB 파일들)로 끝냅니다.
- 날짜, 벤치마크 수치, 내부 사실을 지어내지 마십시오. 알 수 없는 부분은 `TODO(open-question: ...)`로 표시합니다.

## 4. 상호 링크
- 상대 경로로 링크합니다. 예: `[L0 IR](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)`.
- 설계 문서가 참조하는 모든 ADR은 링크되어야 하며, 런북이 구현하는 모든 설계 문서는 다시 역링크되어야 합니다.

## 5. ADR 형식 (`01-decisions/ADR-XXXX-*.md`)
```
# ADR-XXXX: <decision title>
- Status: proposed | accepted | superseded
- Context: <forces, constraints, what we must satisfy>
- Options considered: <table: option | pros | cons | fit>
- Decision: <the chosen option, stated plainly>
- Consequences: <what becomes easy/hard; follow-on work>
- Open questions / revisit triggers
```

## 6. 런북 형식 (`10-runbooks/**/RB-*.md`) — 엄격함
런북은 AI 빌더가 실행합니다. 각 런북은 **하나의 응집된 빌드 단위**이며 반드시 다음을 포함해야 합니다:
```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-### , RB-###]   # runbooks that must complete first
- Implements design: [links to design docs this realizes]
- Produces: <artifacts/files/components this runbook creates>

## Objective
One paragraph: what "done" looks like for this runbook.

## Preconditions
Checklist of state that must already be true before starting.

## Steps
Numbered, atomic, verifiable steps. Each step:
  - **Do:** the concrete action (commands, files to create, code skeleton)
  - **Verify:** how the AI confirms the step worked (command output, test, screenshot)
Steps should be small enough that a wrong one is caught at its own Verify.

## Acceptance criteria
A checklist that, when all true, means the runbook is complete. Must be objectively checkable.

## Rollback / safety
How to undo if a step fails midway.

## Hand-off
What the next runbook(s) can now assume.
```
- 런북은 근거(rationale)에 대해서는 설계 문서를 참조하며, 그 이유를 길게 다시 설명하지 않습니다.
- 런북의 코드는 **빌드 가이드**(스켈레톤, 시그니처, 설정)입니다. 실제 코드는 빌더가 작성합니다.
- 번호 체계: `RB-0XX`는 phase 0, `RB-1XX`는 phase 1, ... phase 폴더와 대응됩니다.

## 7. 네이밍
- 파일: kebab-case `.md`. ADR: `ADR-XXXX-topic.md`. 런북: `RB-XXX-topic.md`.
- SOURCE-BRIEF의 엔티티 이름을 그대로 사용합니다(예: `MemoryAnnotatedIR`, `syntorch`, `Chakra trace`).

## 8. 일관성 계약(consistency contract)
- 파이프라인, 3개의 캔버스, 1:9 레이아웃, 내비게이션 바, work-tree, L0/L1/L2 채움 레벨,
  그리고 syntorch 설명은 SOURCE-BRIEF에 의해 **고정**되어 있습니다. 이를 구체화하되, 재정의하지 마십시오.

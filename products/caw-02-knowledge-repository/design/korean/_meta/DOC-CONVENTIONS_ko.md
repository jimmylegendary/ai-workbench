# DOC CONVENTIONS — 제품의 `design/` 내 모든 파일을 작성하는 방식

제품에 종속되지 않는 규약. 이 파일을 `<product>/design/_meta/DOC-CONVENTIONS.md`로 복사하세요. 해당 제품의
`_meta/PRODUCT-BRIEF.md`(단일 진실 공급원)와 함께 읽으세요.

## 1. 언어 및 대상 독자
- **언어: 영어** — 모든 설계 산출물과 runbook에 적용(기술적 정밀성 + 도구 친화성).
- 두 부류의 독자: 리뷰어(설계 문서: 무엇을 & 왜)와 **AI builder**(runbook: 어떻게).

## 2. 파일 헤더 (모든 문서는 이것으로 시작)
```
# <Title>

- **Status:** draft | reviewed | accepted
- **Owner:** Jimmy
- **Last-reviewed:** (leave as TODO; do not invent dates)
- **Related:** [relative links to sibling docs]
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
```
그다음 이 문서가 무엇을 결정/기술하며 무엇을 다루지 **않는지**를 밝히는 한 문단의 **Purpose**를 작성합니다.

## 3. 구조
- `##`/`###` 헤딩, 짧은 문단, 비교를 위한 테이블, 스키마/스니펫을 위한 fenced code를 사용합니다.
- 산문으로 된 벽보다 **decision table**과 **명시적 tradeoff**를 선호합니다.
- 설계 문서는 **Open Questions**(`08-research-plan/open-questions.md`로 링크)와 **Implications
  for runbooks**로 끝맺습니다.
- 날짜, 벤치마크 수치, 내부 사실을 지어내지 마세요. 미상의 항목은 `TODO(open-question: ...)`로 표시합니다.

## 4. 상호 링크
- 상대 경로로 링크합니다. 문서가 의존하는 모든 ADR을 링크하고, runbook에서는 그것이 구현하는 설계로 역링크합니다.
- 제품 간 참조는 **import/export boundary**입니다 — 상대 제품을 명시하고(예: "CAW-05, a separate
  product") 공유 store/registry/substrate를 암시하지 마세요.

## 5. ADR 형식 (`01-decisions/ADR-XXXX-*.md`)
```
# ADR-XXXX: <decision title>
- Status: proposed | accepted | superseded
- Context: <forces, constraints>
- Options considered: <table: option | pros | cons | fit>
- Decision: <the chosen option, stated plainly>
- Consequences: <what becomes easy/hard; follow-on work>
- Open questions / revisit triggers
```

## 6. Runbook 형식 (`10-runbooks/**/RB-*.md`) — 엄격함
각 runbook은 AI builder가 실행하는 하나의 응집된 빌드 단위입니다:
```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [links]
- Produces: <artifacts/components>

## Objective         — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```
- runbook 내의 코드는 **빌드 가이드**(스켈레톤/시그니처/설정)입니다. 실제 코드는 builder가 작성합니다.
- 번호 체계: `RB-0XX` phase 0, `RB-1XX` phase 1, … phase 폴더와 일치하게.
- 각 Acceptance 체크포인트에서 트리를 green 상태(컴파일·lint 통과)로 유지하여 중단된 빌드가 깔끔하게 재개되도록 합니다.

## 7. 명명
- 파일: kebab-case `.md`. ADR: `ADR-XXXX-topic.md`. Runbook: `RB-XXX-topic.md`.
- 제품의 `PRODUCT-BRIEF.md`와 `GLOSSARY.md`에 있는 entity/용어 이름을 정확히 사용합니다.

## 8. 독립성 계약
- 제품의 core, data, surface는 그 제품 **고유의 것**입니다. 다른 제품과 공유하는 런타임 substrate는 없습니다.
- `PRODUCT-BRIEF.md`로 고정된 부분은 FIXED입니다 — 그것을 구체화하되 재정의하지 마세요.

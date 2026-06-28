# DOC CONVENTIONS — 제품의 `design/` 안 모든 파일을 작성하는 방식

제품에 종속되지 않는 규약. 이 파일을 `<product>/design/_meta/DOC-CONVENTIONS.md`로 복사하라. 해당 제품의
`_meta/PRODUCT-BRIEF.md`(단일 진실 공급원)와 함께 읽어라.

## 1. 언어와 대상 독자
- **언어: 영어** — 모든 설계 산출물과 runbook(기술적 정확성 + 도구 연동을 위해).
- 두 종류의 독자: 리뷰어(설계 문서: 무엇을 & 왜)와 **AI builder**(runbook: 어떻게).

## 2. 파일 헤더 (모든 문서는 이것으로 시작한다)
```
# <Title>

- **Status:** draft | reviewed | accepted
- **Owner:** Jimmy
- **Last-reviewed:** (leave as TODO; do not invent dates)
- **Related:** [relative links to sibling docs]
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
```
그다음 이 문서가 무엇을 결정/기술하는지, 그리고 무엇을 다루지 **않는지**를 진술하는 한 문단짜리 **Purpose**를 둔다.

## 3. 구조
- `##`/`###` 제목, 짧은 문단, 비교를 위한 표, 스키마/스니펫을 위한 펜스드 코드(fenced code)를 사용하라.
- 산문 덩어리보다 **decision table**과 **명시적 트레이드오프**를 선호하라.
- 설계 문서는 **Open Questions**(`08-research-plan/open-questions.md`로 링크)와 **Implications
  for runbooks**로 끝맺어라.
- 날짜, 벤치마크 수치, 내부 사실을 지어내지 말라. 알 수 없는 것은 `TODO(open-question: ...)`로 표시하라.

## 4. 상호 링크
- 상대 경로로 링크하라. 문서가 의존하는 모든 ADR을 링크하고, runbook에서는 그것이 구현하는 설계로 되돌아 링크하라.
- 제품 간 참조는 **import/export 경계**다 — 다른 제품을 이름으로 지칭하고(예: "CAW-05, a separate
  product") 공유 저장소/레지스트리/기반(substrate)을 암시하지 말라.

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

## 6. Runbook 형식 (`10-runbooks/**/RB-*.md`) — 엄격함(STRICT)
각 runbook은 AI builder가 실행하는 하나의 응집된 빌드 단위다:
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
- runbook 안의 코드는 **빌드 가이드**(뼈대/시그니처/설정)다; 실제 코드는 builder가 작성한다.
- 번호 체계: `RB-0XX`는 phase 0, `RB-1XX`는 phase 1, … 식으로 phase 폴더와 일치시킨다.
- 각 Acceptance 체크포인트에서 트리를 green(컴파일됨, lint 통과) 상태로 남겨, 중단된 빌드가 깔끔하게 재개되도록 하라.

## 7. 명명(Naming)
- 파일: kebab-case `.md`. ADR: `ADR-XXXX-topic.md`. Runbook: `RB-XXX-topic.md`.
- 제품의 `PRODUCT-BRIEF.md`와 `GLOSSARY.md`에 있는 엔티티/용어 이름을 정확히 사용하라.

## 8. 독립성 계약(Independence contract)
- 제품의 core, data, surface는 그 제품 자신의 것이다. 다른 제품과 공유하는 런타임 기반(substrate)은 없다.
- `PRODUCT-BRIEF.md`가 고정한 부분은 FIXED다 — 그것을 정교화하라; 재정의하지 말라.

# 문서 작성 규칙 (DOC CONVENTIONS) — 제품의 `design/` 안 모든 파일이 작성되는 방식

제품에 종속되지 않는(product-agnostic) 규칙입니다. 이 파일을 `<product>/design/_meta/DOC-CONVENTIONS.md`로 복사하세요. 해당 제품의 `_meta/PRODUCT-BRIEF.md`(단일 진실 공급원, single source of truth)와 함께 읽으세요.

## 1. 언어 및 독자
- **언어: 영어** — 모든 설계 산출물과 runbook에 적용합니다(기술적 정밀성 + 도구 호환성 때문).
- 두 독자층: 리뷰어(설계 문서: 무엇을, 왜)와 **AI builder**(runbook: 어떻게).

## 2. 파일 헤더 (모든 문서는 이것으로 시작)
```
# <Title>

- **Status:** draft | reviewed | accepted
- **Owner:** Jimmy
- **Last-reviewed:** (leave as TODO; do not invent dates)
- **Related:** [relative links to sibling docs]
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
```
그다음 이 문서가 무엇을 결정/기술하는지, 그리고 무엇을 다루지 *않는지*를 한 단락으로 적는 **Purpose**를 둡니다.

## 3. 구조
- `##`/`###` 제목, 짧은 단락, 비교를 위한 표, 스키마/스니펫을 위한 fenced code를 사용하세요.
- 산문 덩어리보다 **decision table(결정 표)** 과 **명시적 tradeoff(절충점)** 를 우선하세요.
- 설계 문서는 **Open Questions**(`08-research-plan/open-questions.md`로 링크)와 **Implications for runbooks**(runbook에 대한 함의)로 끝맺으세요.
- 날짜, 벤치마크 수치, 내부 사실을 지어내지 마세요. 미상인 것은 `TODO(open-question: ...)`로 표시하세요.

## 4. 상호 링크(Cross-linking)
- 상대 경로로 링크하세요. 문서가 의존하는 모든 ADR을 링크하고, runbook에서는 그것이 구현하는 설계로 역링크하세요.
- 제품 간(cross-product) 참조는 **import/export 경계(boundary)** 입니다 — 상대 제품의 이름을 명시하고(예: "CAW-05, a separate product"), 공유 store/registry/substrate를 암시하지 마세요.

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

## 6. Runbook 형식 (`10-runbooks/**/RB-*.md`) — 엄격(STRICT)
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
- runbook 안의 코드는 **빌드 가이드(build guidance)** 입니다(골격/시그니처/설정). 실제 코드는 builder가 작성합니다.
- 번호 체계: `RB-0XX`는 phase 0, `RB-1XX`는 phase 1, … phase 폴더와 일치시킵니다.
- 각 Acceptance 체크포인트에서 트리를 green 상태(컴파일 성공, lint 통과)로 유지하여, 중단된 빌드가 깨끗하게 재개되도록 하세요.

## 7. 명명(Naming)
- 파일: kebab-case `.md`. ADR: `ADR-XXXX-topic.md`. Runbook: `RB-XXX-topic.md`.
- 제품의 `PRODUCT-BRIEF.md`와 `GLOSSARY.md`에 있는 엔티티/용어 이름을 정확히 사용하세요.

## 8. 독립성 계약(Independence contract)
- 제품의 core, data, surface는 그 제품의 것(OWN)입니다. 다른 제품과 공유하는 런타임 substrate가 없습니다.
- `PRODUCT-BRIEF.md`가 고정한 부분은 고정(FIXED)입니다 — 그것을 구체화하되, 재정의하지 마세요.

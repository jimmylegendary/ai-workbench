# 런북 규약 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** AI 빌더
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md · ../_meta/DOC-CONVENTIONS_ko.md §6

## 계약(contract)

모든 런북은 [../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md) §6의 엄격한 형식을 따른다:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder>
- Depends on: [RB-###, ...]
- Implements design: [links]
- Produces: <artifacts/files/components>

## Objective        — one paragraph; what "done" looks like
## Preconditions     — checklist that must be true before starting
## Steps             — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off          — what the next runbook can assume
```

## 빌더를 위한 규칙

- **런북 하나 = 응집된 단위 하나.** 앞서 건너뛰지 말고, `Depends on:`과 phase 게이트를 존중하라.
- **모든 단계에는 Verify가 있다.** Verify가 실패하면 멈추고 진행하기 전에 고쳐라 — 실패를 모아 뒤로 넘기지 마라.
- **런북의 코드는 가이드다**(스켈레톤, 시그니처, 설정). 실제 구현은 주변 코드베이스 스타일에 맞춰 직접 작성한다.
- **경계를 존중하라**: `@caw/core`는 `next` 의존성이 전혀 없다. Python 엔진은 Next.js 프로세스 안에서 절대 실행되지 않는다
  ([../03-architecture/component-boundaries_ko.md](../03-architecture/component-boundaries_ko.md)).
- **비목표를 존중하라**: 보류된 기능은 만들지 마라 ([../00-overview/scope-and-non-goals_ko.md](../00-overview/scope-and-non-goals_ko.md)).
- **미지 사항을 표시하라**: 어떤 단계가 open question([../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md))에 부딪히면,
  문서화된 기본값을 사용하고 그 사실을 메모하라. SOURCE-BRIEF를 넘어서는 `syntorch`에 대한 사실을 지어내지 마라.
- **재개 가능성(Resumability)**: 각 Acceptance 체크포인트에서 트리를 green(컴파일되고 lint 통과) 상태로 남겨, 중단된 빌드가 깔끔하게 재개될 수 있게 하라(RK-6).

## Verify 어휘

- `cmd:` 종료 코드 / 출력이 검사 기준이 되는 셸 명령.
- `test:` 통과해야 하는 단위/e2e 테스트.
- `view:` 수동/시각적 확인(스크린샷 또는 기술된 상태).

## Status 의미

- `ready` — 모든 `Depends on:`이 완료되었고 게이트가 green이다.
- `blocked` — 의존성, 게이트, 또는 open question을 기다리는 중. 어느 것인지 명시하라.

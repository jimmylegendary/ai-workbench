# RB-001: 툴링, lint 경계, 그리고 CI

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [component-boundaries_ko.md](../../03-architecture/component-boundaries_ko.md) (강제), [tech-stack_ko.md](../../03-architecture/tech-stack_ko.md)
- Produces: ESLint/TS 설정, 패키지 경계 규칙, 테스트 러너, CI 파이프라인

## Objective

단방향 의존성 규칙과 "`@caw/core`에 `next` 제로" 규칙을 기계가 강제하도록 만들고, 테스트 러너(Vitest/pytest/Playwright) + CI를 연결하여 이후의 모든 런북이 객관적인 green/red 신호를 갖게 한다.

## Preconditions

- [ ] RB-000 완료(컴파일되는 모노레포).

## Steps

1. **Do:** 패키지 전반에 ESLint + strict TS 설정을 추가한다. 다음을 인코딩하는 **패키지 경계** 규칙(dependency-cruiser 또는 eslint-plugin-boundaries)을 추가한다: surfaces→core→ports→data, 그리고 `@caw/core`는 `next`, React, `@caw/db`, `@caw/engine-adapters`를 import할 수 없다.
   **Verify:** `cmd: pnpm lint`가 의도적으로 잘못된 import를 추가하면 실패하고, 제거하면 통과한다.
2. **Do:** Vitest(TS), pytest(engine), Playwright(e2e)를 각각 통과하는 사소한 테스트 하나씩과 함께 추가한다.
   **Verify:** `cmd: pnpm test`와 `cmd: pytest`가 0으로 종료된다.
3. **Do:** push 시 install → typecheck → lint(경계 규칙 포함) → tests를 실행하는 CI(예: GitHub Actions)를 추가한다.
   **Verify:** `cmd:` CI 설정이 검증된다. 로컬 `act`/dry-run 또는 첫 push가 green을 보인다.
4. **Do:** 포매팅(Prettier) + pre-commit/CI 포맷 체크를 추가한다.
   **Verify:** `cmd: pnpm format:check`가 통과한다.

## Acceptance criteria

- [ ] 경계 규칙이 금지된 import를 차단한다(임시 위반 테스트로 증명).
- [ ] `pnpm typecheck && pnpm lint && pnpm test`가 모두 green이다.
- [ ] CI가 push 시 전체 게이트를 실행한다.

## Rollback / safety

설정 전용이다. 설정 파일을 되돌리면 롤백된다. 의도적 위반 테스트는 주석 처리된 참조로 남겨 두라.

## Hand-off

이후의 모든 런북은 `pnpm typecheck && pnpm lint && pnpm test`를 객관적 Verify로 신뢰할 수 있다. 의존성 규칙은 자동으로 강제된다.

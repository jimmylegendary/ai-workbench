# RB-010: Next.js 앱 셸 (App Router + 이음매)

- Status: ready
- Phase: phase-1-app-shell
- Depends on: [RB-002, RB-003]
- Implements design: [ui-architecture-nextjs.md](../../06-frontend/ui-architecture-nextjs_ko.md), [../../01-decisions/ADR-0003-frontend-stack.md](../../01-decisions/ADR-0003-frontend-stack_ko.md)
- Produces: App Router 구조, `@caw/core`로 연결되는 Server Action + Route Handler 이음매(seam)

## 목표

server-shell/client-island 분리, 변경(mutation)을 위한 Server Action 경로, 그리고 실행(run) 상태를 위한
Route Handler(SSE)를 갖춘 동작하는 Next.js 앱 셸 — 모두 (DB나 엔진을 직접 호출하지 않고) `@caw/core`에 연결된다.

## 사전 조건

- [ ] RB-002(데이터 계층), RB-003(디자인 시스템) 완료.

## 단계

1. **Do:** App Router 트리 생성: `app/layout.tsx`(server shell), 라우트 세그먼트 `(simulation)`, `(module-design)`, `user`, `setting`.
   **Verify:** `cmd:` `next build`가 컴파일된다; 각 라우트가 플레이스홀더를 렌더링한다.
2. **Do:** `@caw/core` 서비스를 호출하는 Server Action 모듈을 추가한다(앱 진입점에서 `@caw/db` repo를 DI로 연결). 실제 액션 하나 구현: `ExperimentService.create`.
   **Verify:** `test:` 해당 액션을 호출하면 Experiment 행이 생성된다.
3. **Do:** `RunService.status`를 스트리밍(SSE)하는 Route Handler `app/api/runs/[id]/stream/route.ts`를 추가한다.
   **Verify:** `cmd:` 스텁 run에 대해 SSE 엔드포인트를 curl하면 이벤트가 나온다.
4. **Do:** 코드 상에서 규칙 확립: web은 오직 `@caw/core`만 import하고, engine/DB는 DI를 통해 접근한다. 경계(boundary) 테스트를 추가한다.
   **Verify:** `cmd: pnpm lint` 경계 규칙이 통과한다; web에 직접적인 `@caw/db`/engine import가 없다.

## 수용 기준

- [ ] 앱이 빌드되고 네 개의 nav 라우트를 모두 서빙한다(플레이스홀더 허용).
- [ ] Server Action이 core를 통해 Experiment를 생성한다.
- [ ] SSE run-status 라우트가 스트리밍된다.
- [ ] web은 오직 `@caw/core`에만 의존한다(경계 테스트 통과).

## 롤백 / 안전성

새로운 앱 코드이므로, 롤백하려면 `app/` 추가분을 되돌린다. DB/engine 연결은 DI 뒤에 두어 스텁으로 대체 가능하게 유지한다.

## 인계(Hand-off)

레이아웃/nav 런북(RB-011)을 이 셸 안에서 구축할 수 있다; 변경과 스트림은 동작하는 이음매를 갖추고 있다.

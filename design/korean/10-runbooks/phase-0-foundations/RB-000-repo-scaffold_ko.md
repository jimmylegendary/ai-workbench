# RB-000: 모노레포 스캐폴드 구성

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [component-boundaries_ko.md](../../03-architecture/component-boundaries_ko.md), [tech-stack_ko.md](../../03-architecture/tech-stack_ko.md)
- Produces: 빈 `@caw/*` 패키지 + `apps/*` + `engine/` 디렉터리를 가진 pnpm/turbo 모노레포 스켈레톤

## Objective

[repo-structure_ko.md](../../03-architecture/repo-structure_ko.md)의 디렉터리 트리와 정확히 일치하는, 컴파일되는 모노레포. 빈 패키지와 인터페이스 stub만 포함하여, 이후의 모든 런북이 안정적인 경계 뒤에서 구현을 채워 넣을 수 있게 한다.

## Preconditions

- [ ] Node + pnpm 설치됨. `engine/`용 Python 사용 가능.
- [ ] 빈 대상 repo(또는 `caw01-workbench/` 루트가 생성됨).

## Steps

1. **Do:** 루트에 pnpm workspace + Turborepo를 초기화한다(`package.json`, `pnpm-workspace.yaml`, `turbo.json`).
   **Verify:** `cmd: pnpm -v && pnpm install`이 0으로 종료된다.
2. **Do:** 패키지를 생성한다: `packages/core` (`@caw/core`), `packages/db` (`@caw/db`), `packages/engine-adapters`, `packages/design-tokens`. 각각 `package.json`, `tsconfig`, `src/index.ts`를 둔다.
   **Verify:** `cmd: pnpm -r exec tsc --noEmit`가 컴파일된다(빈 export 허용).
3. **Do:** `@caw/core`에 `src/services/`, `src/schemas/`, `src/ports/`를 **인터페이스 stub만** 두고 생성한다([api-surface_ko.md](../../07-backend-api/api-surface_ko.md) 및 [component-boundaries_ko.md](../../03-architecture/component-boundaries_ko.md)의 시그니처). 구현은 없다.
   **Verify:** core에서 `cmd: tsc --noEmit`가 통과한다. `next`/React import가 없다.
4. **Do:** 앱을 생성한다: `apps/web`(빈 Next.js App Router 앱), `apps/mcp`, `apps/cli`(빈 엔트리포인트).
   **Verify:** `cmd: pnpm --filter web build`(또는 `next build`)가 빈 앱을 컴파일한다.
5. **Do:** `engine/`를 하위 디렉터리 `syntorch_capture/ chakra_export/ servingsim/ astrasim/ l0_lowering/` + `pyproject.toml`과 함께 생성한다. `artifacts/`를 추가한다(gitignore 처리).
   **Verify:** `cmd: python -c "import sys; print(sys.version)"`. `view:` 트리가 repo-structure.md와 일치한다.

## Acceptance criteria

- [ ] 디렉터리 트리가 [repo-structure_ko.md](../../03-architecture/repo-structure_ko.md)와 일치한다.
- [ ] `pnpm install` + `pnpm -r exec tsc --noEmit`가 성공한다.
- [ ] `@caw/core`는 인터페이스/stub만 포함하며 `next`/React를 import하지 않는다.
- [ ] `artifacts/`가 gitignore 처리되어 있다.

## Rollback / safety

모든 변경은 새 파일이다. 롤백하려면 생성한 디렉터리를 삭제하면 된다. Acceptance가 통과한 후에만 commit하라.

## Hand-off

다음 런북들은 안정적인 패키지 경계와 빈 `@caw/core` 인터페이스를 가진 컴파일되는 모노레포를 가정할 수 있다.

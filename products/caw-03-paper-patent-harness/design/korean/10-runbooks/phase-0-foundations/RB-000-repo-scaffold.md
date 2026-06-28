# RB-000: Scaffold the harness repo

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../03-architecture/component-boundaries_ko.md](../../03-architecture/component-boundaries_ko.md)
- Produces: repo-structure.md와 일치하는 컴파일 가능한 skeleton (core, ports, adapters, surfaces, config, workspace, artifacts)

## Objective

트리가 [repo-structure_ko.md](../../03-architecture/repo-structure_ko.md)와 일치하는, 컴파일 가능한 TypeScript 프로젝트:
`src/core`(`ports`에만 의존), `src/ports`, `src/adapters/*`(v1 + stub 폴더), `src/surfaces/*`,
`config/`, `workspace/` + `artifacts/`(gitignore됨), `migrations/`.

## Preconditions
- [ ] Node + pnpm; 비어 있는 product 폴더.

## Steps
1. **Do:** 패키지 + tsconfig(strict)를 초기화한다. repo-structure.md의 디렉터리 트리를 module마다 빈 `index.ts`와 함께 생성한다.
   **Verify:** `cmd: pnpm i && pnpm tsc --noEmit`이 0으로 종료된다.
2. **Do:** 다섯 개 port에 대한 빈 interface 파일들과 함께 `src/ports/`를 생성한다; `src/core/`는 `ports`만 import한다.
   **Verify:** `cmd: tsc --noEmit`; `core` → `adapters` import 없음.
3. **Do:** `src/adapters/{source,writing-engine,patent-engine,sink,novelty}/`를 각각 `v1/`과 `stubs/` 하위 폴더 placeholder와 함께 생성한다.
   **Verify:** `view:` 트리가 repo-structure.md와 일치한다.
4. **Do:** `workspace/` + `artifacts/`를 `.gitignore`에 추가한다.
   **Verify:** `cmd: git status`가 이들이 무시됨을 보여준다.

## Acceptance criteria
- [ ] 트리가 repo-structure.md와 일치; `pnpm tsc --noEmit` 통과.
- [ ] `core`는 `ports`만 import; `workspace/`+`artifacts/`가 gitignore됨.

## Rollback / safety
신규 파일만 추가; 롤백하려면 삭제한다. Acceptance 이후 commit한다.

## Hand-off
RB-001+를 위한 안정적인 module boundary를 갖춘 컴파일 가능한 skeleton.

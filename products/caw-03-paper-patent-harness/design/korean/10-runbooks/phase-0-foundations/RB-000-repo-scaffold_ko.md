# RB-000: Scaffold the harness repo

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../03-architecture/component-boundaries_ko.md](../../03-architecture/component-boundaries_ko.md)
- Produces: repo-structure.md과 일치하는 컴파일되는 스켈레톤 (core, ports, adapters, surfaces, config, workspace, artifacts)

## Objective

[repo-structure_ko.md](../../03-architecture/repo-structure_ko.md)와 트리가 일치하는, 컴파일되는 TypeScript 프로젝트:
`src/core`(`ports`에만 의존), `src/ports`, `src/adapters/*`(v1 + stub 폴더), `src/surfaces/*`,
`config/`, `workspace/` + `artifacts/`(gitignore됨), `migrations/`.

## Preconditions
- [ ] Node + pnpm; 비어 있는 제품 폴더.

## Steps
1. **Do:** package + tsconfig(strict)를 초기화한다. repo-structure.md의 디렉터리 트리를 모듈별 빈 `index.ts`와 함께 생성한다.
   **Verify:** `cmd: pnpm i && pnpm tsc --noEmit`가 0으로 종료된다.
2. **Do:** 다섯 개 port에 대한 빈 인터페이스 파일과 함께 `src/ports/`를 생성한다. `ports`만 import하는 `src/core/`를 만든다.
   **Verify:** `cmd: tsc --noEmit`; `core` → `adapters` import 없음.
3. **Do:** `src/adapters/{source,writing-engine,patent-engine,sink,novelty}/`를 각각 `v1/`과 `stubs/` 하위 폴더 placeholder와 함께 생성한다.
   **Verify:** `view:` 트리가 repo-structure.md과 일치한다.
4. **Do:** `workspace/` + `artifacts/`를 `.gitignore`에 추가한다.
   **Verify:** `cmd: git status`에서 이들이 무시됨으로 표시된다.

## Acceptance criteria
- [ ] 트리가 repo-structure.md과 일치한다; `pnpm tsc --noEmit` 통과.
- [ ] `core`는 `ports`만 import한다; `workspace/`+`artifacts/`는 gitignore됨.

## Rollback / safety
새 파일만 추가됨; 롤백하려면 삭제하라. Acceptance 후 커밋하라.

## Hand-off
RB-001+를 위한, 안정적인 모듈 경계를 가진 컴파일되는 스켈레톤.

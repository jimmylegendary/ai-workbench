# RB-000: CAW-02 monorepo scaffold 구성(content 트리 + code skeleton)

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [repo-structure.md](../../03-architecture/repo-structure_ko.md), [tech-stack.md](../../03-architecture/tech-stack_ko.md), [storage-strategy.md §2](../../04-data-layer/storage-strategy_ko.md), [component-boundaries.md](../../03-architecture/component-boundaries_ko.md)
- Produces: 디스크 상의 제품 레이아웃 — `knowledge/` content 트리 + `_events/`, `src/` core + adapter + index skeleton, `manifest/`, `schemas/`, `migrations/`, `var/`, `.index/`, 컴파일되는 TypeScript workspace, `.gitignore`, `README.md`

## Objective
디렉터리 형태가 `repo-structure.md`와 정확히 일치하는 새롭고 버전 관리되는 제품 리포지토리: 정규(canonical) `knowledge/**` content 트리(모든 entity-kind 디렉터리 및 `_events/` 포함), `core/`, `index/`, `adapters/`, `boundary-io/`, `codegen/`으로 나뉜 `src/` skeleton, 그리고 이를 뒷받침하는 `manifest/`, `schemas/`, `migrations/`, `scripts/`, `tests/`, `var/`, `.index/` 디렉터리. TypeScript workspace는 green으로 컴파일되며(비어 있는/stub 모듈), 정규-vs-derived 구분은 `.gitignore`에 인코딩된다. "Done" = 빈 트리에서 `tsc`가 통과하고 디렉터리 레이아웃 audit(Step 8)이 깨끗함. 이 RB는 구조만 만든다. 동작은 이후 RB가 추가한다.

## Preconditions
- [ ] Node + 패키지 매니저가 사용 가능(`node -v`, 정확한 LTS pin은 여기서 선택 — Step 1 참조).
- [ ] `git` CLI 사용 가능(`git --version`); commit signing key는 TBD(RB-002에서 처리).
- [ ] 제품 폴더 `caw-02-knowledge-repository/`가 존재하고 이미 `design/`을 포함(이 corpus).
- [ ] `repo-structure.md`(최상위 레이아웃 + 모듈 소유권)와 `component-boundaries.md`(의존성 방향 `adapters → core/* → store/*`)를 읽었음.

## Steps

1. **toolchain을 pin하라.**
   - Do: 제품 루트에서 TypeScript workspace용 `package.json`을 생성; Node LTS, 패키지 매니저, `typescript`/`tsx`를 pin(이제 `tech-stack.md`의 §"Version-pin checklist"에 있는 `TODO(open-question)` pin을 resolve하고 선택한 값을 `README.md`에 기록). `rootDir: src`, `outDir: .index/build`(빌드 출력은 derived → gitignore됨)인 `strict: true` `tsconfig.json` 추가.
   - Verify: `node -v`가 pin과 일치; `npx tsc --version`이 pin된 버전을 출력.

2. **`knowledge/` content 트리를 생성(단일 source of truth).**
   - Do: `repo-structure.md` §`knowledge/`에 있는 대로 entity kind당 정확히 하나의 디렉터리 생성: `sources/ claims/ evidence/ notes/ concepts/ interests/ decisions/ open-questions/ assumptions/ signals/` 더하기 `_events/`. 빈 디렉터리가 commit되도록 각각에 `.gitkeep` 추가.
   - Verify: `ls knowledge/`가 10개 entity 디렉터리 + `_events/`를 모두 나열; `git status`가 `.gitkeep` 파일이 staged됨을 표시.

3. **`src/` code skeleton을 생성(하나의 core, 얇은 adapter).**
   - Do: `repo-structure.md` §`src/`의 모듈 트리 생성: `core/{ops,validate,invariant,evidence-gate,boundary,trust,audit,store,retrieval}`, `index/{schema,reindex,query}`, `adapters/{api,mcp,cli,viewer}`, `boundary-io/{envelope,redact,import-caw01,import-caw05,export-caw03}`, `codegen/`. 각 leaf 모듈에 패키지가 컴파일되도록 typed stub을 export하는 `index.ts` 추가(예: `export const TODO = 'unimplemented' as const;`).
   - Verify: 위의 모든 디렉터리가 존재하고 적어도 하나의 `.ts` 파일을 포함; `npx tsc --noEmit` 성공.

4. **`manifest/`, `schemas/`, `migrations/` placeholder를 생성.**
   - Do: `manifest/`(ops manifest는 RB-001에서 안착), `schemas/frontmatter/`와 `schemas/boundary/`(zod schema는 RB-002 / 이후에 안착), 그리고 `repo-structure.md` §`migrations/`와 일치하는 빈 placeholder 파일명(`0001_core.sql`, `0002_fts.sql`, `0003_vec.sql.reserved`)이 있는 `migrations/` 생성 — 지금은 비어 있거나 comment만; 실제 DDL은 RB-003.
   - Verify: `ls migrations/`가 세 개의 번호 매겨진 파일을 표시; `ls schemas/`가 `frontmatter/`와 `boundary/`를 표시.

5. **올바른 git 정책으로 runtime + derived 디렉터리를 생성.**
   - Do: `var/{quarantine,vault,exports}/`(runtime, 비정규), `.index/`(derived index home), `scripts/`, `tests/` 생성. commit된 빈 디렉터리가 필요한 곳에만 `.gitkeep` 추가; `var/` 하위 디렉터리와 `.index/`는 내용을 commit하기보다 gitignore를 선호.
   - Verify: 디렉터리가 존재; Step 6이 ignore 정책을 확인.

6. **정규-vs-derived 구분을 `.gitignore`에 인코딩.**
   - Do: `repo-structure.md` §"What is canonical vs derived"와 `storage-strategy.md` §2에 따라 `.index/index.sqlite`, `.index/build/`, FTS/vector sidecar 파일, `var/quarantine/`, `var/exports/`, `node_modules/`를 ignore. `knowledge/**`(`_events/` 포함)는 ignore하지 마라 — 그것들은 source of truth이자 ledger이다.
   - Verify: `git check-ignore .index/index.sqlite var/exports/x`가 그 경로들을 반환; `git check-ignore knowledge/_events/x.jsonl`이 아무것도 반환하지 않음(ignore되지 않음).

7. **`README.md` 작성(orientation + pin).**
   - Do: 제품 이름, 정규/derived 구분(`storage-strategy.md` 링크), 의존성 방향 `adapters → core/* → store/*`(`component-boundaries.md` 링크), Step 1에서 resolve한 버전 pin을 명명하는 짧은 README 하나.
   - Verify: README 링크가 기존 설계 문서로 resolve됨.

8. **레이아웃 + 컴파일 audit.**
   - Do: `repo-structure.md`에서 요구하는 디렉터리 집합이 존재함을 단언하는 `scripts/check-layout`(작은 스크립트 또는 테스트)을 추가하고, `tsc --noEmit`을 컴파일 검사로 연결.
   - Verify: `scripts/check-layout`이 0으로 종료; `npx tsc --noEmit`이 0으로 종료.

9. **초기 commit.**
   - Do: `git add -A` 후 scaffold의 첫 commit 생성.
   - Verify: `git log --oneline`이 scaffold commit을 표시; `git status`가 깨끗함.

## Acceptance criteria
- [ ] `knowledge/`가 10개 entity-kind 디렉터리 + `_events/`를 모두 포함하고, 모두 버전 관리됨.
- [ ] `src/`가 `repo-structure.md` 모듈 트리(core/index/adapters/boundary-io/codegen)와 일치하고 모든 leaf가 컴파일되는 stub을 가짐.
- [ ] `manifest/`, `schemas/{frontmatter,boundary}/`, `migrations/{0001_core.sql,0002_fts.sql,0003_vec.sql.reserved}`, `var/{quarantine,vault,exports}/`, `.index/`, `scripts/`, `tests/`가 모두 존재.
- [ ] `.gitignore`가 `.index/` + `var/quarantine,exports/`는 ignore하지만 `knowledge/**`나 `knowledge/_events/**`는 ignore하지 않음.
- [ ] `npx tsc --noEmit`과 `scripts/check-layout`이 둘 다 0으로 종료.
- [ ] 버전 pin이 resolve되고 `README.md`에 기록됨.
- [ ] 깨끗한 초기 commit이 존재; 트리가 green.

## Rollback / safety
- 순수 scaffold, 데이터 없음. commit 전에 되돌리려면: `git clean -fdx`가 untracked 파일을 제거; commit 후에는 `git reset --hard <pre-scaffold>`(또는 리포지토리 삭제). 아직 `knowledge/` 데이터가 존재하지 않으므로 위험에 처한 정규 데이터는 없다.

## Hand-off
- 다음 runbook(RB-001)은 다음을 가정할 수 있다: 컴파일되는 TS workspace, `ops.yaml`을 기다리는 `manifest/` 디렉터리, generator를 기다리는 `src/codegen/` 디렉터리, CI 연결을 위해 준비된 `tests/`.
- RB-002는 `knowledge/**` content 디렉터리 + `schemas/frontmatter/`가 존재하고 `_events/`가 commit됨(ignore되지 않음)을 가정할 수 있다.
- RB-003은 `migrations/` placeholder와 `.index/`(gitignore됨)가 존재함을 가정할 수 있다.

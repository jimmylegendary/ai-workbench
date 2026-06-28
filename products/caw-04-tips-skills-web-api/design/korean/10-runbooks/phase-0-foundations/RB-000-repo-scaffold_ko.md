# RB-000: Scaffold the Astro 5 + Starlight repo and the hexagonal tree

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../03-architecture/tech-stack_ko.md](../../03-architecture/tech-stack_ko.md), [../../01-decisions/ADR-0006-web-stack_ko.md](../../01-decisions/ADR-0006-web-stack_ko.md)
- Produces: 전체 `src/{content,pages,core,ports,adapters,lib,components}` + `_audit/` tree, gitignore된 `dist/`, 그리고 pin된 lockfile을 갖춘, compile되고 lint-clean한 Astro 5 + Starlight 프로젝트.

## Objective

`astro build`가 성공하며 **clean하게 build**되는, 새롭고 비어 있지만 잘 타입 지정된 CAW-04 제품 repo. [repo-structure_ko.md](../../03-architecture/repo-structure_ko.md)가 고정한 정확한 on-disk skeleton을 포함한다: 서빙되는 corpus tree `src/content/{tips,skills,workflows,playbooks}/`, 물리적으로 분리된 `_audit/` sidecar tree, hexagonal `src/core/`, `src/ports/`, `src/adapters/{sources,sinks}/` 디렉터리, 그리고 build-time API endpoint tree `src/pages/api/v1/`. 아직 비즈니스 로직은 없다 — 디렉터리, 타입 체크되는 placeholder 모듈, config만 있다. "Done" = tree가 green이고 중단된 build가 알려진 checkpoint에서 재개되는 것. 이것은 DAG([dependency-graph_ko.md](../../09-roadmap/dependency-graph_ko.md))의 **node A**이다; 이후의 모든 runbook이 이것에 의존한다.

## Preconditions

- [ ] PRODUCT-BRIEF와 ADR-0002/0004/0005/0006/0007이 accepted됨.
- [ ] Node.js LTS + 패키지 매니저가 사용 가능함(정확한 버전을 pin 테이블에 기록 — 지어내지 말고 실행 중인 toolchain에서 채워라).
- [ ] 빈 제품 repo 디렉터리 `caw-04-tips-skills-web-api/` 안에 있음(자체 git repo = source of truth, ADR-0005).

## Steps

1. **프로젝트 초기화 + toolchain pin.**
   - Do: `git init`; Astro 5 프로젝트 생성(Starlight starter를 base로 써도 됨), 그다음 Starlight integration 추가. `package.json`에서 Astro 5.x, Starlight, TypeScript의 **정확한** 버전(`^`/`~` 없이)을 pin하고 lockfile을 commit. `astro.config.mjs`에 `output: "static"`(SSG) 설정 — public path에는 SSR adapter가 없다(tech-stack §Web framework).
   - Verify: `package.json`에 정확한 pin이 있음; lockfile이 존재하고 commit됨; `astro.config.mjs`에 `output: "static"`이 있음.

2. **version-pin 테이블 채우기.**
   - Do: [../../03-architecture/tech-stack_ko.md](../../03-architecture/tech-stack_ko.md)의 "Version-pin summary"를 편집해 Node / TypeScript / 패키지 매니저 / Astro / Starlight 행을 **실제 설치된 버전**으로 교체. 아직 미정인 행(MCP SDK, CDN, digest algo)은 `TODO(open-question: ...)`로 남겨라.
   - Verify: 지어낸 값 없음; 채워진 모든 행이 `package.json`/lockfile과 일치.

3. **서빙되는 corpus tree + content collection schema stub 생성.**
   - Do: `src/content/{tips,skills,workflows,playbooks}/`(각각 `.gitkeep` 포함) 생성. 네 개 collection을 선언하는 `src/content/config.ts`(Astro content collections) 생성; 여기의 Zod schema는 common-field 집합만(`id, kind, title, summary, version, status, license, boundary, content_hash`) stub으로 둔다 — 전체 per-entity schema는 RB-003에서 도착한다.
   - Verify: `astro build`가 content config를 오류 없이 실행함(빈 collection도 유효); 네 개 type 디렉터리가 존재함.

4. **audit sidecar tree 생성 — 물리적으로 분리되고, 절대 서빙되지 않음.**
   - Do: `_audit/sidecar/`와 빈 `_audit/_events.log`(hash-chained ledger의 placeholder, ADR-0003) 생성. `_audit/README.md`를 추가해 명시: 이 tree는 endpoint가 절대 읽지 않으며 `dist/`로 절대 복사되지 않는다(구조적 public-safe 보장, repo-structure §Layout-rule 1).
   - Verify: `_audit/`가 `src/`의 sibling이며 `src/content/` 아래가 아님.

5. **hexagonal core skeleton 생성.**
   - Do: `src/core/{model,recheck,redact,version,projection,gate}/` 각각에 타입 지정된 placeholder를 export하는 `index.ts`(예: `export {}` 또는 TODO 본문 시그니처) 생성. 각 파일 상단에 주석 추가: 어떤 ADR 개념을 소유하는지와 "core has NO I/O; imports ports only, never an adapter".
   - Verify: `tsc --noEmit` 통과; `src/core/` 아래 어떤 파일도 `src/adapters/`에서 import하지 않음.

6. **ports + adapters + registry skeleton 생성.**
   - Do: `src/ports/ContentSourceAdapter.ts`와 `src/ports/PublishSinkAdapter.ts`(빈 `interface` placeholder; 실제 시그니처는 RB-002에서) 생성. `src/adapters/sources/{caw02-knowledge,caw03-skills-registry,stub-internal-wiki,stub-curated-bundle}/`와 `src/adapters/sinks/{site-and-api,mcp-resources,stub-external-docs-host,stub-package-registry,stub-syndication}/`를 각각 `.gitkeep`과 함께 생성. `src/adapters/registry.ts` placeholder 생성.
   - Verify: 디렉터리 집합이 [repo-structure_ko.md](../../03-architecture/repo-structure_ko.md) §Top-level tree와 정확히 일치; `tsc --noEmit` 통과.

7. **build-time API endpoint tree 생성(빈 route).**
   - Do: `src/pages/api/v1/`를 placeholder endpoint 파일 `index.json.ts`, `[type].json.ts`, 그리고 `[type]/[slug]/` 집합(`index.json.ts`, `index.md.ts`, `versions.json.ts`, `versions/[semver].json.ts`, `versions/[semver].md.ts`, `manifest.json.ts`)과 함께 생성. 각각은 지금은 빈/stub payload를 반환하는 `GET`을 export(실제 serialization은 phase-4 runbook). `src/pages/index.astro`와 `{tips,skills,workflows,playbooks}/[slug]/` 페이지 placeholder(`index.astro`, `v/[semver].astro`) 생성.
   - Verify: `astro build`가 placeholder route를 오류 없이 emit함.

8. **`lib/`, `components/`, `public/` 생성, `dist/` gitignore.**
   - Do: `src/lib/`(digest/canonical-serialize/manifest helper — 빈 stub), `src/components/`(placeholder, 미래의 410 tombstone component 포함), `public/`(robots.txt, favicon, 빈 llms.txt) 생성. `.gitignore`에 `dist/`와 `node_modules/` 추가. `dist/`는 파생물이며 gitignore된다(repo-structure §Layout-rule 4).
   - Verify: `.gitignore`에 `dist/` 포함; `public/` 존재.

9. **Green-tree checkpoint.**
   - Do: 전체 `astro build` + `tsc --noEmit` 실행.
   - Verify: 둘 다 성공; `dist/`가 생성되고 gitignore됨; `git status`가 commit된 `dist/`를 보이지 않음.

## Acceptance criteria

- [ ] 빈 skeleton에서 `astro build`가 성공함; `dist/`가 생성되고 gitignore됨.
- [ ] `tsc --noEmit`가 오류 0으로 통과함.
- [ ] 디렉터리 tree가 [repo-structure_ko.md](../../03-architecture/repo-structure_ko.md) §Top-level tree와 정확히 일치함(서빙되는 corpus, 별도 tree로서의 `_audit/` sidecar, `core/ports/adapters/lib/components`, `pages/api/v1/**`).
- [ ] `_audit/`가 `src/`의 sibling이며 어떤 페이지나 endpoint에서도 참조되지 않음.
- [ ] `src/core/` 아래 어떤 파일도 `src/adapters/`에서 import하지 않음.
- [ ] `package.json`에 정확한 pin, commit된 lockfile, `output: "static"`이 있음; tech-stack pin 테이블이 실제 toolchain에서 채워짐(지어낸 값 없음).

## Rollback / safety

- 이 runbook은 additive scaffolding일 뿐이다; 되돌리려면 scaffold 이전 commit으로 `git reset --hard`. (아직 published 콘텐츠가 없으므로 frozen된 것이 없다.)
- endpoint가 읽는 어떤 파일도 `_audit/` 아래에 만들지 말고, sidecar 파일을 `src/content/` 아래에 두지 마라 — 이후의 guard가 존재하기 전에 public-safe-by-construction 분리를 깨뜨린다.

## Hand-off

다음 runbook들은 다음을 가정할 수 있다: compile되는 Astro 5 + Starlight repo; 전체 hexagonal + content + API 디렉터리 tree; 전체 per-entity schema(RB-003)를 받을 준비가 된 `src/content/config.ts`; 실제 interface(RB-002)를 받을 준비가 된 `src/ports/*`; 분리되고 절대 서빙되지 않는 `_audit/` tree. RB-001은 tooling/CI + boundary lint 규칙 + op-manifest를 추가한다; RB-002는 ports/registry를 채운다; RB-003은 frontmatter schema + versioning model을 채운다.

# RB-020: 콘텐츠 컬렉션을 정적 HTML로 렌더링하는 Astro 5 + Starlight SSG 구축

- Status: ready
- Phase: phase-2-build-and-publish
- Depends on: [RB-010 (import + ContentSource), RB-011 (core public-safe re-check), RB-012 (git content store + sidecar split), RB-002 (content-model types + public projection)]
- Implements design:
  - [../../05-publishing-core/rendering-web-and-api_ko.md](../../05-publishing-core/rendering-web-and-api_ko.md) (§1 단일 소스 파이프라인, §5 build invariant)
  - [../../07-backend-api/build-and-publish-service_ko.md](../../07-backend-api/build-and-publish-service_ko.md) (build 파이프라인 단계, boundary assert, verify-output)
  - [../../01-decisions/ADR-0006-web-stack_ko.md](../../01-decisions/ADR-0006-web-stack_ko.md) (Astro 5 + Starlight, SSG)
  - [../../01-decisions/ADR-0002-content-model_ko.md](../../01-decisions/ADR-0002-content-model_ko.md) (public projection, sidecar)
- Produces: `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`를 타입이 지정된 콘텐츠 컬렉션으로 로드하고, 모든 레코드에 대해 `boundary === "public"`을 단언하며, public projection을 적용하여(audit sidecar를 제거) 정적 HTML 페이지를 `dist/`로 내보내는 Astro 5 + Starlight 프로젝트.

## Objective

"Done"의 의미: 동결된 git 코퍼스에 대해 SSG build를 실행하면 정적 HTML 페이지의 `dist/` 트리가 생성된다 — 발행된 `(type, slug)`마다 정규(canonical) 페이지 하나, 그리고 `(type, slug, semver)`마다 고정(pinned) 페이지 하나 — 서버 런타임이 **없고** 어떤 내부 저장소로의 라이브 경로도 **없다**. 이 build는 **fail-closed**다: `boundary !== "public"`이거나 `provenance.public_safe_recheck !== "passed"`인 레코드는 전체 build를 중단시키며, audit 전용 필드(`origin_ref`, `origin_version`)가 렌더링된 페이지에 도달하면 build를 중단시킨다. audit sidecar(`<semver>.audit.json`)는 결코 렌더 코퍼스로 로드되지 않는다. 이 runbook은 HTML 표면만 제공한다. RB-021은 동일한 `getCollection()` 코퍼스 위에 JSON/markdown/manifest/MCP 이미터를 추가하고, RB-022는 아티팩트를 배포한다.

## Preconditions

- [ ] RB-012 완료: git content store가 `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`에 존재하며, core re-check **이후에** 작성된 검증된 Skill이 최소 하나 있고 그 `<semver>.audit.json` sidecar도 함께 있다.
- [ ] RB-002 완료: TypeScript content-model types + `toPublicProjection()`이 존재하며 `origin_ref`/`origin_version`을 제외한다.
- [ ] RB-011 완료: public-safe re-check은 CORE 단계다. 디스크상의 레코드는 이미 `boundary: "public"`과 `provenance.public_safe_recheck: "passed"`를 가지고 있다.
- [ ] Node LTS + 패키지 매니저를 사용할 수 있다. RB-012 체크포인트에서 트리가 green이다(컴파일, lint 통과).
- [ ] build가 내부/업스트림 저장소에 대한 네트워크 접근을 요구하지 않는다(그런 의존성이 없음을 확인한다).

## Steps

1. **Astro 5 + Starlight 프로젝트 스캐폴딩.**
   - Do: 제품 repo에서 Starlight 통합(`astro`, `@astrojs/starlight`)과 함께 Astro 앱을 생성하고, `astro.config.mjs`에 `output: "static"`을 설정한다. Starlight가 네 가지 콘텐츠 타입을 가리키게 한다. 어떤 SSR 어댑터나 런타임 데이터 소스도 추가하지 마라.
   - Verify: 빈 스캐폴드에서 `astro build`가 0으로 종료되고 `dist/index.html`을 작성한다. `grep -r "output:" astro.config.mjs`가 `static`을 보여준다. `@astrojs/node`/SSR 어댑터가 설치되어 있지 않다.

2. **엔티티 frontmatter와 일치하는 콘텐츠 컬렉션 스키마 정의.**
   - Do: `src/content.config.ts`에서 컬렉션 `tips, skills, workflows, playbooks`를 선언하고, 공통 필드(`id, kind, title, summary, version, safety_boundary, tags, inputs, outputs, preconditions, provenance, digest`)와 타입 확장(workflows의 `steps[]`, playbooks의 `contains[]`)에 대한 Zod 스키마를 둔다. 스키마는 `.strict()`를 통해 알 수 없는 키를 금지해야 하며, 그래야 잘못 들어온 audit 필드가 스키마 오류가 된다. 어떤 스키마에도 `origin_ref`/`origin_version`을 포함하지 마라.
   - Verify: 단위 테스트가 알려진 정상 fixture를 로드하여 스키마 검증을 통과한다. `origin_ref`를 포함한 fixture는 `SCHEMA_NONCONFORMANT`로 검증에 실패한다.

3. **렌더 코퍼스에서 audit sidecar 제외.**
   - Do: 콘텐츠 로더가 `*.md`/`*.mdx`만 glob하고 `*.audit.json`은 결코 글롭하지 않도록 한다. `**/*.audit.json`에 대한 명시적 로더 exclude를 추가한다.
   - Verify: 테스트에서 `getCollection("skills")`가 `origin_ref`/`origin_version`이 없는 항목을 반환한다. 어떤 로드된 항목에도 `.audit.json` 콘텐츠가 나타나지 않음을 테스트가 단언한다.

4. **fail-closed boundary 단언을 build gate로 구현.**
   - Do: 렌더링 전에 실행되는 build-time 모듈을 추가하여, 네 컬렉션 전체의 `getCollection()` 모든 레코드를 순회하며 레코드별로 `boundary === "public"` AND `provenance.public_safe_recheck === "passed"`를 단언한다. 실패 시 `BOUNDARY_NOT_PUBLIC`과 문제의 `(type, slug, semver)`로 throw하여 build를 중단한다. 이는 core re-check 뒤에 있는 API 측 백스톱이며(렌더링 문서 §5), 업스트림에 대한 신뢰가 아니다.
   - Verify: fixture를 `boundary: "internal"`로 뒤집으면 `astro build`가 `BOUNDARY_NOT_PUBLIC`으로 0이 아닌 코드로 종료된다. 전부 public인 fixture에서는 0으로 종료된다.

5. **렌더 경계에서 public projection 적용.**
   - Do: 모든 항목을 페이지 컴포넌트에 도달하기 전에 `toPublicProjection(entry)`로 통과시켜, audit 전용 필드가 템플릿에서 참조될 수 없게 한다. 투영된 레코드만으로 Starlight 페이지를 렌더링한다.
   - Verify: 테스트가 `toPublicProjection()` 출력에 `origin_ref`/`origin_version`이 없음을 단언한다. TypeScript 체크가 페이지 컴포넌트가 디스크상의 원본 타입이 아니라 투영된 타입을 소비함을 확인한다.

6. **canonical + pinned HTML 라우트 생성.**
   - Do: `getStaticPaths` 페이지를 추가한다: canonical `/{type}/{slug}/`(최신 발행 semver, 이동형) 및 pinned `/{type}/{slug}/v/{semver}/`(불변). canonical 페이지는 자신의 pinned 버전들로 링크하고 해결된 `semver` + `digest`를 표시한다.
   - Verify: 시드된 Skill에 대해 `dist/`에 `skills/<slug>/index.html`과 `skills/<slug>/v/<semver>/index.html`이 존재한다. canonical 페이지의 해결된 semver가 가장 최신의 발행 버전과 같다.

7. **HTML에 대한 렌더 후 verify-output 누출 스캔 추가.**
   - Do: `astro build` 이후, `dist/**/*.html`에 대해 verifier를 실행하여 렌더링된 페이지에 audit 전용 필드 이름/값이나 알려진 기밀 패턴이 포함되면 실패(`LEAK_DETECTED`)하게 한다. 이를 build 단계로 연결하여 green build가 깨끗한 HTML 표면을 함의하도록 한다.
   - Verify: 렌더링된 fixture에 `origin_ref`를 주입하면 verifier가 0이 아닌 코드로 종료된다. 깨끗한 코퍼스는 통과한다.

8. **build + 체크를 하나의 명령으로 연결하고 트리를 green으로 유지.**
   - Do: 스키마 검증 → boundary assert → `astro build` → HTML 누출 스캔을 순서대로 실행하는 npm 스크립트(예: `build`)와 `lint`/`typecheck` 스크립트를 추가한다. 어떤 단계든 실패하면 CI가 실패하도록 한다.
   - Verify: 깨끗한 코퍼스에서 `npm run build`가 0으로 종료되고 `dist/` HTML을 생성한다. `npm run lint && npm run typecheck`가 0으로 종료된다.

## Acceptance criteria

- [ ] `npm run build`가 시드된 Skill에 대한 canonical 및 pinned HTML 페이지를 가진 `dist/`를 생성한다.
- [ ] 콘텐츠 컬렉션이 `*.md(x)`만 로드한다. `*.audit.json`은 결코 코퍼스에 없다(테스트로 증명).
- [ ] 스키마가 `.strict()`다. `origin_ref`를 지닌 fixture는 스키마 검증에 실패한다.
- [ ] non-public / non-passed-recheck 레코드가 있으면 build가 중단된다(`BOUNDARY_NOT_PUBLIC`).
- [ ] 페이지가 `toPublicProjection()` 출력으로 렌더링된다. 어떤 audit 전용 필드도 템플릿에서 참조 가능하지 않다.
- [ ] 렌더 후 HTML 누출 스캔이 주입된 audit 필드에서 실패하고 깨끗한 코퍼스에서 통과한다.
- [ ] build에 SSR 어댑터, 런타임 데이터 소스, 내부 저장소 의존성이 없다.
- [ ] `lint` + `typecheck`가 green이다.

## Rollback / safety

- build는 fail-closed다: 중간 단언 실패는 `dist/`가 확정되기 전에 중단하므로, 깨졌거나 누출된 코퍼스가 배포 가능한 아티팩트를 결코 생성하지 않는다. 이 runbook의 어떤 것도 배포하지 않는다.
- 스캐폴드가 잘못되면 Astro 프로젝트 디렉터리를 삭제하고 step 1을 다시 실행한다. git content store(RB-012)는 손대지 않는다.
- build를 통과시키려고 `.strict()` 스키마나 boundary assert를 결코 완화하지 마라 — boundary/leak 체크 실패는 올바른 중단이지 버그가 아니다.

## Hand-off

RB-021은 다음을 가정할 수 있다: 네 컬렉션에 대한 타입 지정 `getCollection()`을 갖춘 동작하는 Astro 5 + Starlight SSG, fail-closed `boundary==public ∧ public_safe_recheck==passed` gate, 제외된 audit sidecar, 렌더 경계에서 적용된 `toPublicProjection()`. RB-021은 web/API 패리티를 위해 **동일한** 코퍼스 위에 JSON/raw-markdown/`manifest.json`/`SKILL.md`/`index.json`/MCP 이미터를 추가한다. RB-022는 그 결과 `dist/` 아티팩트를 배포에 사용한다.

# RB-040: 공개 Starlight 웹사이트 표면 구축

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-020 (Astro/Starlight SSG build), RB-021 (SiteAndApi sink), RB-030 (versioning + tombstones)]
- **Implements design:** [../../06-interfaces/website_ko.md](../../06-interfaces/website_ko.md), [../../01-decisions/ADR-0006-web-stack_ko.md](../../01-decisions/ADR-0006-web-stack_ko.md), [../../01-decisions/ADR-0001-product-surface-and-delivery_ko.md](../../01-decisions/ADR-0001-product-surface-and-delivery_ko.md), [../../01-decisions/ADR-0002-content-model_ko.md](../../01-decisions/ADR-0002-content-model_ko.md), [../../01-decisions/ADR-0005-storage-and-versioning_ko.md](../../01-decisions/ADR-0005-storage-and-versioning_ko.md), [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
- **Produces:** Starlight 사이트 IA(발행 가능 엔티티별 nav 섹션 하나), 타입별 아티팩트 페이지 템플릿, moving/immutable/version-index 라우트, 410 tombstone 페이지, 클라이언트 측 검색 인덱스, 그리고 `SiteAndApiSinkAdapter`의 website 투영에 연결된 build-time public-safe 단언.

## Objective

공개 웹사이트는 CAW-04 자체의 git content repo로부터 build 시점에 렌더링되는 **동결되고 검증된 정적 아티팩트**이며, **어떤 내부 또는 업스트림 저장소로의 요청 시점 경로도 없다**. "Done" = 독자가 Tips/Skills/Workflows/Playbooks를 탐색하고, 한 아티팩트를 최신 버전에서 열고, 임의의 불변 pinned 버전으로 점프하고, 버전 이력을 보고, 철회된 항목에 대해 410 tombstone에 도달하고, 클라이언트 측 검색을 사용할 수 있다 — 그리고 내보낸 모든 페이지가 `boundary === "public"`을 단언하고 audit 전용 sidecar 필드를 포함하지 않는다. 사이트는 구성에 의해 읽기 전용이다: 로그인 없음, 댓글 상자 없음, 공개 쓰기 경로 없음.

## Preconditions

- [ ] Astro 5 + Starlight 프로젝트가 스캐폴딩되고 깨끗하게 build된다(RB-020에서).
- [ ] 타입 지정 콘텐츠 컬렉션이 ADR-0002 스키마에 바인딩되어 있다. `getCollection()`이 `boundary`, `provenance.public_safe_recheck`, `version`, `digest`를 가진 발행 항목을 반환한다.
- [ ] public-projection split이 존재한다: audit 전용 `origin_ref`/`origin_version`이 sidecar에 있고 컬렉션의 public 뷰에는 없다.
- [ ] git의 `src/content/{type}/<slug>/<semver>.md(x)`에 최소 하나의 발행 아티팩트가 존재한다(RB-030 / import 경로에서).
- [ ] tombstone 상태 데이터(unpublished/redacted `(slug,semver)`)를 RB-030으로부터 build에서 사용할 수 있다.

## Steps

1. **정보 구조(최상위 nav).**
   - Do: Starlight를 발행 가능 엔티티 타입별로 정확히 하나의 nav 섹션을 갖도록 구성한다: Tips (`/tips/`), Skills (`/skills/`), Workflows (`/workflows/`), Playbooks (`/playbooks/`), 그리고 보조 페이지 About (`/about/`), Safety (`/safety/`), API docs (`/api-docs/`). `Example`, `Source`, `SafetyBoundary`, `Version`에 대한 최상위 nav를 만들지 마라.
   - Verify: build된 사이트가 네 콘텐츠 섹션과 세 보조 페이지를 노출한다. 발행 불가능한 네 엔티티에 대한 nav 항목이 없다.

2. **사이드바 생성.**
   - Do: `getCollection()`으로부터 섹션별 왼쪽 사이드바를 자동 구성한다. 타입 내에서 항목을 `tag`로 그룹화하고 `title`로 정렬한다. title + 한 줄 `summary`를 표시한다. deprecated이지만 여전히 발행 중인 항목에 "deprecated" 배지를 추가한다. non-`public`, unpublished, 또는 tombstone된 항목은 제외한다.
   - Verify: 시드된 deprecated 항목이 배지를 표시한다. 시드된 tombstone 항목이 사이드바에 없다.

3. **타입별 아티팩트 페이지 템플릿.**
   - Do: 타입별로 하나의 Astro/Starlight 페이지 템플릿을 구축하여 아티팩트를 **최신** 발행 버전에서 다음과 함께 렌더링한다: h1 title + type 배지 + version pill(semver) + status 배지; 한 단락 summary; 메타데이터 카드(Skills/Workflows의 Inputs/Outputs/Preconditions; provenance `source_product` + `validated` + `public_safe_recheck: passed`; `boundary: public`; `version` + 짧은 `digest` + `published_at`); 렌더링된 markdown/MDX body; Workflows의 `steps[]`(각각 pinned skill `id@version`으로 링크); Playbooks의 `contains[]`(각각 멤버 아티팩트로 링크); 인라인 Examples; "Get this" 패널; 그리고 버전 이력.
   - Verify: Skill 페이지가 Inputs/Outputs/Preconditions와 provenance 블록을 렌더링한다. Workflow가 링크된 pinned 단계를 렌더링한다. Playbook이 링크된 멤버를 렌더링한다.

4. **"Get this" 교차 표면 패널.**
   - Do: 패널에서 [../../06-interfaces/rest-api.md](../../06-interfaces/rest-api_ko.md)의 동일 아티팩트의 다른 표현을 링크한다: `.md`와 `.json` 접미사 별칭, `manifest.json`, 그리고 `.skill` 번들.
   - Verify: 각 링크가 동일 `(slug, semver)`에 대한 매칭되는 API 아티팩트로 해결된다.

5. **버전 라우팅.**
   - Do: 아티팩트별로 세 가지 라우트 형태를 내보낸다: `/{type}/{slug}/`(이동형 — 최신, `rel=canonical` self, short/revalidate 캐시); `/{type}/{slug}/v/{semver}/`(불변 — 동결된 한 버전, `Cache-Control: public, max-age=31536000, immutable`, `rel=canonical` → 이동형 URL); `/{type}/{slug}/versions/`(모든 semver + status를 나열하는 버전 인덱스, short 캐시). 불변 페이지에서는 해당될 때 비차단 "더 새로운 버전이 존재함 → latest" 배너를 렌더링한다.
   - Verify: 이동형 URL이 최신을 렌더링한다. 불변 URL이 불변 캐시 헤더와 canonical 링크와 함께 정확한 pinned 버전을 렌더링한다. 기존 `(slug,semver)`를 다시 렌더링해도 그 출력은 결코 바뀌지 않는다(영원히 동결).

6. **Tombstone 페이지(unpublish / redact).**
   - Do: unpublished 또는 redacted 아티팩트/버전에 대해, `reason ∈ {deprecated, boundary-changed, redacted}`와 선택적 `superseded_by` 링크를 담고 기밀 세부 정보가 없는 **HTTP 410 Gone** tombstone 페이지(404 아님, 이전 콘텐츠 아님)를 내보낸다. build의 라우트별 status 매핑을 통해 410 status를 내보낸다. tombstone된 주소를 사이드바, sitemap, 검색 인덱스에서 제외한다.
   - Verify: 시드된 tombstone 주소가 tombstone body와 함께 HTTP 410을 반환하고 sitemap/사이드바/검색에 없다.

7. **클라이언트 측 검색.**
   - Do: `boundary=public` 렌더링 페이지에 대해서만 build 시점에 사전 구축된 클라이언트 측 검색 인덱스(Pagefind 스타일)를 생성하여 `dist/`에 번들하고 브라우저 내에서 로드한다. 어떤 쿼리도 서버에 도달하지 않는다. 미래의 서버 측 검색 엔드포인트를 위한 문서화된 스텁 노트를 남긴다(v1 범위 밖; 런타임 기반이 강제될 것임).
   - Verify: 검색이 발행된 페이지만 반환한다. 쿼리 시 어떤 네트워크 요청도 브라우저를 떠나지 않는다. tombstone된/non-public 페이지가 결과에 결코 나타나지 않는다.

8. **website 투영의 public-safe 백스톱.**
   - Do: CI로 강제되는 두 백스톱을 연결한다: (a) build-time 불변식 — 내보낸 모든 페이지가 `boundary === "public"`을 단언하고, 그렇지 않으면 build가 **실패**한다; (b) public-projection strip 테스트 — `origin_ref`/`origin_version`(audit sidecar)이 어떤 HTML 출력에도 결코 나타나지 않음을 단언한다.
   - Verify: `boundary !== "public"`인 fixture 페이지가 build를 실패시킨다. HTML에 sidecar 필드를 담은 fixture가 strip 테스트를 실패시킨다.

## Acceptance criteria

- [ ] 네 가지 발행 가능 타입을 탐색할 수 있고, 각각 자체 nav 섹션과 사이드바를 갖는다. 발행 불가능한 엔티티는 최상위 nav가 아니다.
- [ ] 한 아티팩트가 라우트별로 올바른 `rel=canonical`과 `Cache-Control`을 갖고 moving, immutable, version-index 라우트에서 렌더링된다.
- [ ] 발행된 `(slug, semver)` 출력이 동결된다 — rebuild 시 동일하다.
- [ ] 철회된 아티팩트/버전이 HTTP 410 tombstone을 반환하고 사이드바/sitemap/검색에서 제외된다.
- [ ] 클라이언트 측 검색이 public 페이지만 인덱싱하고 어떤 서버 쿼리도 발행하지 않는다.
- [ ] 어떤 non-public 페이지(build-time 단언)와 HTML에 나타나는 어떤 audit 전용 필드(strip 테스트)에서도 CI가 실패한다.
- [ ] 웹사이트가 API에 없는 콘텐츠를 보유하지 않는다(모든 페이지에 대해 RB-041의 패리티 대응물이 존재한다).

## Rollback / safety

- 웹사이트는 정적 `dist/` 아티팩트다. rollback = 이전 `dist/` build를 재배포. 데이터 마이그레이션 없음, 런타임 상태 없음.
- build가 `boundary === "public"` 단언이나 strip 테스트를 실패하면, build 자체가 rollback이다 — fail closed, 아무것도 배포되지 않는다. 출하를 위해 이 단언들을 결코 우회하지 마라.
- re-check와 gate는 업스트림(core)에 있다. 이 runbook은 이미 검증된 git 콘텐츠만 렌더링하며 내부 저장소로의 요청 시점 경로를 결코 추가해서는 안 된다.

## Hand-off

- RB-041 (REST API)은 동일한 `getCollection()` 소스로부터 모든 페이지의 1:1 markdown/JSON 대응물을 함께 생성한다. 이 runbook은 HTML 투영과 그것이 가리키는 패리티 링크를 보장한다.
- RB-042 (preview/admin)은 이 runbook의 public-projection 렌더(동일한 `boundary===public` 단언 + strip 테스트)를 자신의 "public preview" 창으로 재사용한다.
- RB-043 (MCP + 스텁)은 이 website 투영을 `SiteAndApiSinkAdapter`의 한 면(facet)으로 취급한다.

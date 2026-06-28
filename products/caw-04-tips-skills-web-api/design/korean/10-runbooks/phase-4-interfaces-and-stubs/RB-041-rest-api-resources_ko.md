# RB-041: 읽기 전용 REST API 리소스 모델 구축

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-020 (Astro SSG build), RB-021 (SiteAndApi sink), RB-030 (versioning + tombstones), RB-040 (website parity source)]
- **Implements design:** [../../06-interfaces/rest-api_ko.md](../../06-interfaces/rest-api_ko.md), [../../01-decisions/ADR-0007-api-design_ko.md](../../01-decisions/ADR-0007-api-design_ko.md), [../../01-decisions/ADR-0006-web-stack_ko.md](../../01-decisions/ADR-0006-web-stack_ko.md), [../../01-decisions/ADR-0005-storage-and-versioning_ko.md](../../01-decisions/ADR-0005-storage-and-versioning_ko.md), [../../01-decisions/ADR-0002-content-model_ko.md](../../01-decisions/ADR-0002-content-model_ko.md), [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
- **Produces:** 동일한 Astro build가 방출하는 prebuilt static JSON + raw markdown 형태의 `/api/v1` 리소스 트리; canonical JSON envelope(public projection), content negotiation(`Accept` + `.md`/`.json` aliases), version addressing, `index.json` manifest, 사전 계산된 cursor pagination + whitelisted filters, 410 tombstone 본문, 그리고 emit 시점 public-safe validator.

## Objective

REST API는 웹사이트와 동일한 Astro build가 방출하는 **prebuilt static JSON + raw markdown** 표면이다 — **런타임 substrate 없음, 요청 시점에 내부 store로 들어가는 경로 없음**. "완료"의 정의 = 발행된 모든 artifact가 세 가지 표현(RB-040을 통한 HTML, raw markdown, JSON envelope)으로 `(slug, latest)`에서 그리고 불변인 모든 `(slug, semver)`에서 제공되는 하나의 canonical 리소스인 상태; `index.json`이 모든 항목+버전을 나열함; list 엔드포인트는 cursor pagination + whitelisted filters로 사전 계산됨; 철회된 리소스는 HTTP 410을 반환함. 둘 다 하나의 `getCollection()` 소스의 projection이므로 Web/API parity가 유지된다. Audit 전용 sidecar 필드는 어떤 표현으로도 **절대 직렬화되지 않는다**(테스트로 강제됨).

## Preconditions

- [ ] RB-040이 public projection에서 audit sidecar를 제외한, 타입이 지정된 `getCollection()` 소스를 생산했다.
- [ ] Versioning(semver + content-digest)과 tombstone 상태 데이터가 RB-030으로부터 제공된다.
- [ ] Astro build가 HTML 페이지와 함께 파일 기반 엔드포인트(JSON + `.md` 파일)를 방출할 수 있다.
- [ ] 모든 collection 항목이 `boundary`와 `provenance.public_safe_recheck`를 지닌다.

## Steps

1. **리소스 트리 (파일 기반 엔드포인트).**
   - Do: 동일한 `getCollection()` 데이터로부터 `/api/v1` 라우트를 생성한다: `GET /api/v1/{type}` (index/list, 각 항목의 latest); `/{type}/{slug}` (이동하는 latest); `/{type}/{slug}/versions` (모든 버전); `/{type}/{slug}/versions/{semver}` (하나의 불변 pin); `/{type}/{slug}/examples`; `/{type}/{slug}/manifest.json`; `/api/v1/index.json`; `/api/v1/search`. `{type} ∈ tips|skills|workflows|playbooks`. `Source`를 fetch 가능한 리소스로 노출하지 말 것(provenance는 embedded reference일 뿐이다). `/api/v1` prefix는 contract 버전이며, content `{semver}`와는 직교한다.
   - Verify: 각 라우트가 static 파일을 방출한다; `Source` 엔드포인트가 없다; `{type}`이 발행 가능한 네 종류로 제한된다.

2. **Canonical JSON envelope (public projection).**
   - Do: ADR-0002 public projection envelope를 방출한다: `id, type, version (resolved semver), title, summary, boundary:"public", tags, inputs, outputs, preconditions, body (lists에서는 by-reference / markdown에서는 inlined), provenance {source_product, source_ref, validated, public_safe_recheck}, links {self, pinned, html, manifest}, digest, published_at`. Workflows는 skill `id@version`을 pin하는 정렬된 `steps[]`를 추가한다; Playbooks는 `contains[]` member ref를 추가한다; Tips는 공통 필드만 지닌다. Provenance는 반드시 reference 전용이어야 한다 — **`origin_ref`/`origin_version` 없음**.
   - Verify: Skill JSON 리소스가 envelope와 일치한다; provenance 블록에 audit 전용 origin 필드가 없다; lists는 `body`를 reference로 전달하고 markdown은 이를 inline한다.

3. **Content negotiation (세 가지 표현).**
   - Do: 하나의 canonical 리소스를 다음으로 제공한다: `text/html` (RB-040 페이지), `text/markdown` (`.md` alias — body + manifest 필드의 작은 YAML frontmatter), `application/json` (`.json` alias — envelope). `Accept` 헤더를 canonical로 취급하고 `.md`/`.json` suffix를 static/dumb 클라이언트를 위한 cache-safe alias로 취급한다. `Vary: Accept`를 설정하고, 명시적 `Content-Type`을 방출하며, public read를 위해 CORS를 열고, auth는 없다.
   - Verify: 동일한 `(slug,semver)`가 일치하는 내용과 올바른 `Content-Type`으로 HTML, `.md`, `.json`으로 resolve된다; `Vary: Accept`가 존재한다.

4. **Version addressing + integrity.**
   - Do: `/{type}/{slug}` = 이동하는 latest (body가 resolved `semver` + `digest`를 지님, short/revalidate cache). `/{type}/{slug}/versions/{semver}` = 불변 pin (`Cache-Control: public, max-age=31536000, immutable`). `/{type}/{slug}/versions` = `[{semver, digest, published_at, status}]` 목록. 모든 버전 응답은 body에 `digest`를 지니고 그로부터 파생된 strong `ETag`를 지닌다; `latest` 응답은 호출자가 결정론적으로 다시 pin할 수 있도록 resolved `semver`+`digest`를 포함한다.
   - Verify: latest body가 `semver`+`digest`를 노출한다; pinned 응답이 immutable cache 헤더와 `digest`에 일치하는 `ETag`를 지닌다; 기존 `(slug,semver)`의 재발행이 불가능하다(frozen).

5. **`index.json` manifest.**
   - Do: `/api/v1/index.json`을 방출한다 — 발행된 모든 것의 단일 body 없는 manifest: 항목별 `{id, type, latest, boundary, digest, versions[], links{self, manifest}}` 더하기 `api_version`과 `generated_at`. 선택적으로 `/llms.txt`(상위 artifact의 markdown 인덱스)를 방출한다.
   - Verify: `index.json`이 발행된 모든 항목을 그 모든 버전과 함께 나열하고 링크된 리소스를 resolve한다; body와 audit 필드를 포함하지 않는다.

6. **Pagination & filtering (사전 계산, static).**
   - Do: cursor envelope `{data:[lightweight refs], pagination:{next_cursor, has_more, total_count}}`로 list 페이지를 사전 계산한다; `next`를 `Link` 헤더로도 방출한다. whitelisted filter만 구현한다: `type, tag, source_product, q, updated_since, sort`. 임의의 DSL을 거부한다. `boundary`는 의도적으로 filter가 **아니다**(노출하면 비-public 값이 존재한다는 의미가 되기 때문).
   - Verify: list 엔드포인트가 `Link` 헤더와 함께 cursor로 페이징한다; 알 수 없는 filter 파라미터는 무시/거부된다; `boundary`는 filter로 받아들여지지 않는다.

7. **410 tombstone 본문.**
   - Do: 제거된 리소스/버전에 대해 기밀 정보가 없는 machine-readable HTTP 410 본문 `{status:410, id, version, tombstone:true, reason, superseded_by?}`을 방출한다 — 절대 404가 아니다.
   - Verify: 철회된 `(slug,semver)`가 tombstone 본문과 선택적 `superseded_by`와 함께 HTTP 410을 반환한다.

8. **Emit 시점 public-safe validator + no-sidecar 테스트.**
   - Do: 어떤 표현이 작성되기 전에 `boundary == "public"` AND `provenance.public_safe_recheck == "passed"`를 assert하고, 그렇지 않으면 build를 실패시킨다. audit 전용 sidecar 필드가 어떤 JSON이나 markdown 출력에도 절대 나타나지 않음을 assert하는 테스트를 추가한다.
   - Verify: `public_safe_recheck != passed`이거나 비-public boundary인 fixture가 build를 실패시킨다; sidecar 필드를 JSON/md로 유출하는 fixture가 no-sidecar 테스트를 실패시킨다.

## Acceptance criteria

- [ ] 발행된 모든 artifact가 latest와 각 불변 버전 모두에 대해 HTML, raw `.md`, JSON으로 resolve된다.
- [ ] JSON envelope가 ADR-0002 public projection과 일치하며 `origin_ref`/`origin_version`을 지니지 않는다.
- [ ] `index.json`이 작동하는 링크와 함께 모든 항목 + 버전을 열거하며 body가 없다.
- [ ] list 엔드포인트가 cursor pagination + `Link` 헤더 + whitelisted filters로 사전 계산된다; `boundary`는 filter가 아니다.
- [ ] 불변 버전이 long-immutable cache 헤더와 `digest`에서 파생된 `ETag`를 지닌다.
- [ ] 철회된 리소스/버전이 404가 아니라 HTTP 410 tombstone 본문을 반환한다.
- [ ] CI가 비-public / 재확인되지 않은 emit과 JSON 또는 markdown 출력의 모든 audit 전용 필드에 대해 실패한다.
- [ ] Web/API parity: 모든 RB-040 페이지가 동일한 소스로부터 1:1 JSON + markdown 대응물을 가진다.

## Rollback / safety

- API는 `dist/`의 static 파일이다; rollback = 이전 build를 재배포. 런타임 상태 없음, DB 마이그레이션 없음.
- emit 시점 validator와 no-sidecar 테스트는 fail closed다 — 실패하는 build는 아무것도 배포하지 않는다. 출시를 위해 절대 비활성화하지 말 것.
- 요청 시점에 내부 store로 가는 경로를 도입해서는 안 된다; API는 구조상 frozen된 CDN artifact다.

## Hand-off

- RB-043 (MCP + stubs)이 이 runbook의 envelope와 `index.json`을 재사용하여, 동일한 `SiteAndApiSinkAdapter`의 추가 facet으로서 MCP `resources/*` 뷰와 `.skill` bundle 패키징을 구축한다.
- RB-042 (preview/admin)는 이 runbook의 emit 시점 validator가 그것의 public-preview pane이 실행하는 것과 동일하다는 점에 의존한다.
- RB-030의 lifecycle ops(tombstones/cache)가 여기서 방출되는 410 본문을 구동한다.

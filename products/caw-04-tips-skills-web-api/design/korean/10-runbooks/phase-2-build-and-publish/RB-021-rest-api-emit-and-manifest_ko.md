# RB-021: 동일한 build에서 REST API(JSON + raw markdown), manifest, index.json, MCP resources 뷰 내보내기

- Status: ready
- Phase: phase-2-build-and-publish
- Depends on: [RB-020 (Astro SSG + getCollection corpus + boundary gate + public projection)]
- Implements design:
  - [../../06-interfaces/rest-api_ko.md](../../06-interfaces/rest-api_ko.md) (resource tree, JSON envelope, negotiation, index.json)
  - [../../05-publishing-core/rendering-web-and-api_ko.md](../../05-publishing-core/rendering-web-and-api_ko.md) (§2 representations, §3 distribution + MCP, §4 lists)
  - [../../07-backend-api/build-and-publish-service_ko.md](../../07-backend-api/build-and-publish-service_ko.md) (emit 단계, verify-output 패리티)
  - [../../01-decisions/ADR-0007-api-design_ko.md](../../01-decisions/ADR-0007-api-design_ko.md) (API 계약)
- Produces: HTML 페이지와 **동일한** `getCollection()` 코퍼스로부터 정적 REST API를 내보내는 build-time Astro 엔드포인트 — 항목별/버전별 JSON envelope와 raw markdown, skill별 `manifest.json` + `SKILL.md`, 카탈로그 `index.json`, 커서 페이지네이션 + 화이트리스트 필터를 갖춘 list/search 엔드포인트, MCP `resources/list` + `resources/read` 뷰 — 모두 public-projection 전용이며 패리티 검증됨.

## Objective

"Done"의 의미: 한 번의 `astro build`가 RB-020의 HTML과 나란히, `dist/api/v1/...` 아래에 정적 파일로 전체 읽기 전용 API를 내보낸다. 여기서 각 아티팩트는 JSON(`.json`)으로, raw markdown(`.md`)으로, 배포 manifest(`manifest.json` + `SKILL.md`)로 가져올 수 있고, `index.json`에 나열되며, MCP resources 뷰를 통해 노출된다 — **모두 페이지가 사용하는 것과 동일한 코퍼스에서 직렬화되므로** web과 API가 결코 어긋나지 않는다. 모든 이미터는 `toPublicProjection()`을 거친다. audit sidecar 필드(`origin_ref`, `origin_version`)는 어떤 출력에도 나타나지 않는다. 패리티 체크가 `(slug, semver, digest)`별로 HTML/markdown/JSON이 일치함을 단언한다. boundary, leak, 또는 패리티 위반이 있으면 build가 fail closed한다. 이 runbook은 이미터만 추가한다. RB-022가 아티팩트를 배포한다.

## Preconditions

- [ ] RB-020 완료 및 green: Astro SSG, 타입 지정 `getCollection()`, fail-closed boundary assert, sidecar 제외, `toPublicProjection()`이 모두 갖춰져 있다.
- [ ] 시드된 검증 Skill이 HTML(canonical + pinned)로 렌더링된다.
- [ ] [rest-api.md](../../06-interfaces/rest-api_ko.md)의 canonical JSON envelope 형태와 `index.json` 형태가 필드 이름의 권위 기준이다.

## Steps

1. **canonical JSON envelope 직렬화기 정의(public projection).**
   - Do: [rest-api.md](../../06-interfaces/rest-api_ko.md) envelope를 생성하는 `toEnvelope(projectedRecord)`를 구현한다: `id, type, version, title, summary, boundary, tags, inputs, outputs, preconditions, body:{ref}, provenance:{source_product, source_ref, validated, public_safe_recheck}, links, digest, published_at`. JSON에서 `body`는 참조로 표현된다. `provenance`는 참조 필드만 담는다 — 절대 `origin_ref`/`origin_version`은 아니다. Workflows는 `steps[]`를 추가하고(각각 `skill id@version`을 고정), Playbooks는 `contains[]`를 추가한다.
   - Verify: 테스트가 시드된 Skill에 대한 envelope를 스냅샷하고 어떤 깊이에서도 `origin_ref`/`origin_version` 키가 없음을 단언한다.

2. **항목별 및 버전별 JSON 엔드포인트 내보내기.**
   - Do: `getCollection()`을 통해 읽는 Astro 엔드포인트를 추가한다: `/api/v1/{type}/{slug}.json`(최신, 이동형; body는 해결된 `semver`+`digest`를 담음), `/api/v1/{type}/{slug}/versions.json`(`{semver, digest, published_at, status}` 목록), `/api/v1/{type}/{slug}/versions/{semver}.json`(불변 고정). `Content-Type: application/json`, `digest`에서 파생된 강한 `ETag`, 라우트별 `Cache-Control`(pinned는 `immutable`, latest는 short/revalidate)을 설정한다.
   - Verify: `dist/api/v1/skills/<slug>.json`과 `.../versions/<semver>.json`이 존재하고 envelope에 대해 검증된다. pinned 라우트의 `Cache-Control`에 `immutable`이 포함된다.

3. **raw markdown 표현 내보내기.**
   - Do: `/api/v1/{type}/{slug}.md`와 `/api/v1/{type}/{slug}/versions/{semver}.md`를 추가하여, 각각 인라인된 아티팩트 body와 manifest 필드의 작은 YAML frontmatter 헤더를 내보낸다. `Content-Type: text/markdown`.
   - Verify: `.md` body가 소스 markdown body와 일치한다. frontmatter에 audit 전용 필드가 없다.

4. **content negotiation 별칭 연결.**
   - Do: `.json`/`.md` 접미사 파일을 핵심이 되는 정적 아티팩트로 취급한다(SSG에는 요청별 서버가 없다). 각각에 `Vary: Accept`와 명시적 `Content-Type`을 내보낸다. RB-022의 edge 레이어를 위해 호스트 기본값(website 호스트 → HTML; `api.` 호스트 → JSON)을 문서화한다. 런타임 negotiation 서버를 만들지 마라.
   - Verify: 내보낸 각 엔드포인트가 `Vary: Accept`와 올바른 `Content-Type`을 설정한다. SSR 라우트가 추가되지 않았다.

5. **skill별 `manifest.json` + `SKILL.md` 내보내기(배포 형식).**
   - Do: `/api/v1/{type}/{slug}/manifest.json`(envelope와 동일한 필드, canonical 기계용 형식)과 `SKILL.md`(open Agent Skills frontmatter: `name`=slug, `description`, 더해서 추가 거버넌스 필드 `version`, `boundary`, `provenance`, `license`)를 추가한다. 둘 다 하나의 manifest의 투영이다.
   - Verify: 시드된 Skill에 대해 `manifest.json`과 `SKILL.md`가 동일한 거버넌스 필드를 담는다. 둘 다 audit 전용 필드가 없다.

6. **`index.json` 카탈로그 manifest 및 list/search 엔드포인트 내보내기.**
   - Do: 모든 항목+버전+boundary+links를 **body 없이** 나열하는 `/api/v1/index.json`을 추가한다. 타입별 list 엔드포인트와, 커서 envelope `{data:[refs], pagination:{next_cursor, has_more, total_count}}`, `Link: next` 헤더, 화이트리스트 필터만(`type, tag, source_product, q, updated_since, sort`)을 갖춘 `/api/v1/search`를 추가한다. `boundary`는 필터가 아니다. 선택적으로 `/llms.txt`를 내보낸다.
   - Verify: `index.json`이 시드된 Skill을 그 버전들과 함께 나열한다. list 요청이 커서 envelope + `Link` 헤더를 반환한다. `?boundary=`를 전달해도 효과가 없다(화이트리스트가 아님).

7. **MCP resources 뷰 내보내기.**
   - Do: 동일한 canonical 리소스 위에 `resources/list` + `resources/read` 투영을 구축한다. `uri = caw04://{type}/{slug}@{semver}`, `name`/`description`은 `title`/`summary`에서, `mimeType`은 `text/markdown`(body) 또는 `application/json`(manifest), `resources/read`는 `.md` body 또는 `manifest.json`을 반환한다. 이는 코퍼스 위의 또 하나의 PublishSinkAdapter다 — 공유 기반(substrate)이 없다.
   - Verify: `resources/list`가 시드된 Skill의 `uri`를 포함한다. 그 uri의 `resources/read`가 `.md` 엔드포인트와 동일한 body 바이트를 반환한다.

8. **emit-time validator + verify-output 패리티/누출 스캔 추가.**
   - Do: 모든 emit에서 `boundary === "public"` ∧ `provenance.public_safe_recheck === "passed"` ∧ 투영에 audit 전용 필드가 없음을 단언하고, 그렇지 않으면 build를 실패시킨다. build 후 `dist/api/**`에 대해 verify-output을 실행하여 `(slug, semver, digest)`별로 HTML/markdown/JSON 투영이 일치함을 단언하고(`PARITY_MISMATCH`) 누출된 sidecar 필드를 다시 스캔한다(`LEAK_DETECTED`).
   - Verify: 표현 간 digest가 불일치하는 fixture는 `PARITY_MISMATCH`로 실패한다. 어떤 내보낸 파일에 주입된 `origin_version`은 `LEAK_DETECTED`로 실패한다. 깨끗한 코퍼스는 둘 다 통과한다.

9. **트리를 green으로 유지.**
   - Do: 모든 이미터 + 체크를 RB-020의 단일 `build` 스크립트로 통합하여, 한 명령이 HTML + JSON + md + manifests + index + MCP를 내보내고 모든 단언을 실행하도록 한다.
   - Verify: 깨끗한 코퍼스에서 `npm run build`가 0으로 종료된다. `lint` + `typecheck`가 green이다.

## Acceptance criteria

- [ ] 한 번의 `astro build`가 동일한 `getCollection()` 코퍼스로부터 HTML(RB-020)과 더불어 JSON + raw `.md` + `manifest.json` + `SKILL.md` + `index.json` + MCP 뷰를 내보낸다.
- [ ] 시드된 Skill을 JSON과 raw markdown으로 가져올 수 있다. 둘 다 HTML과 일치한다(`(slug, semver, digest)`별 패리티 검증).
- [ ] `index.json`이 아티팩트 + 버전을 나열한다. MCP `resources/list`가 이를 노출하고 `resources/read`가 body를 반환한다.
- [ ] pinned 버전 JSON/md가 `Cache-Control: immutable` + `digest`에서 온 `ETag`를 담는다. latest는 해결된 `semver`+`digest`를 담는다.
- [ ] list가 커서 envelope + `Link` 헤더 + 화이트리스트 필터만 사용한다. `boundary`는 필터가 아니다.
- [ ] 어떤 내보낸 파일도 `origin_ref`/`origin_version`을 포함하지 않는다(테스트로 강제). emit-time + verify-output 스캔이 통과한다.
- [ ] boundary, leak, 또는 패리티 위반 시 build가 fail closed한다. 깨끗한 코퍼스는 green이다.

## Rollback / safety

- 모든 이미터는 RB-020 fail-closed gate를 공유한다. boundary/leak/패리티 실패는 `dist/`가 확정되기 전에 중단하므로, 어떤 표현이라도 누출되거나 어긋날 수 있으면 어떤 API 파일도 출하되지 않는다.
- 이미터가 깨지면 해당 엔드포인트 파일을 되돌린다. HTML 표면(RB-020)과 git store(RB-012)는 영향받지 않는다.
- 필터 화이트리스트를 `boundary`를 포함하도록 결코 넓히지 마라. green build를 강제하려고 패리티/누출 스캔을 결코 비활성화하지 마라.

## Hand-off

RB-022는 다음을 가정할 수 있다: `dist/` 내의 완전하고 패리티 검증되었으며 누출이 없는 정적 아티팩트로, 세 표면(HTML, REST API JSON+md, MCP 뷰)과 manifests, `index.json`을 모두 담고 있으며, 모든 파일이 내부 저장소로의 라이브 경로가 없는 하나의 동결된 코퍼스의 public-projection 직렬화다. RB-022는 이 아티팩트를 원자적 배포와 rebuild/purge 라이프사이클을 위해 `SiteAndApi` PublishSink로 감싼다.

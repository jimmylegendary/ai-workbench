# REST API — 읽기 전용 리소스 모델 (하나의 리소스, 여러 표현)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./website_ko.md](./website_ko.md) (동일 source에서 함께 생성됨; web/API parity)
  - [./preview-admin_ko.md](./preview-admin_ko.md) (내부 전용; 공개 쓰기 없음)
  - [../01-decisions/ADR-0007-api-design_ko.md](../01-decisions/ADR-0007-api-design_ko.md) (이것이 구체화하는 API 계약)
  - [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md) (사전 빌드된 정적 JSON + 원시 md)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (semver+digest, 410 tombstone)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md) (JSON envelope 필드 + public projection)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (boundary=public 만)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

**읽기 전용 REST API** 표면을 명세한다: 리소스 트리, 정규(canonical) JSON envelope, 원시 markdown 형식,
content negotiation, 버전 주소 지정, `index.json` manifest, 페이지네이션, 필터링. 빌더(builder)를 위해
[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)을 구체화한다. 스택([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)),
content model([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)), gate([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md))를
다시 결정하지는 않는다. `.skill` 번들과 MCP view는 여기서 요약되며 [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)이 소유한다.

## 구조적으로(by construction) public-safe

API는 웹사이트와 동일한 Astro 빌드가 방출하는 **사전 빌드된 정적 JSON + 원시 markdown**이다
([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)) — **런타임 기반(substrate)이 없으며 내부 저장소로 향하는
요청 시점(request-time) 경로가 없다**. 모든 응답은 CDN 위의 동결된 파일이다. 어떤 표현이든 방출되기 전에, 빌드는
`boundary == "public"` **그리고** `provenance.public_safe_recheck == passed`를 assert하며, 그렇지 않으면 실패한다.
audit 전용 provenance 필드는 sidecar에 살며 어떤 표현으로도 **절대 직렬화되지 않는다**
([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)); 테스트가 이를 강제한다. `boundary`는 필터 매개변수가
**아니다** — 필터로 노출하면 비공개 값이 존재한다는 것을 암시하기 때문이다.

## 리소스 트리

계약(contract) 버전은 경로 접두사 `/api/v1`이며, 콘텐츠 `{semver}`와 직교(orthogonal)한다.
`{type} ∈ tips | skills | workflows | playbooks`.

```
GET /api/v1/{type}                          list/index (latest of each; cursor pagination, whitelisted filters)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable, pinned version
GET /api/v1/{type}/{slug}/examples          Example sub-resource
GET /api/v1/{type}/{slug}/manifest.json     distribution manifest (machine form)
GET /api/v1/index.json                      manifest of ALL items+versions+boundary+links (no bodies)
GET /api/v1/search                          cross-type lightweight refs (powers website global search)
GET /api/v1/openapi.json                    TODO(open-question: ship a static OpenAPI description)
```

`Source`는 **절대** 독립 리소스가 아니다 — provenance는 내장된 *참조*일 뿐, 가져올 수 있는 내부 문서가 아니다
(brief §11). `SafetyBoundary`는 내장된 assert된 필드이며 항상 `public`이다. 제거된 리소스/버전은 기계 판독 가능한
tombstone 본문과 함께 **HTTP 410 Gone**을 반환한다(404 절대 아님),
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)에 따라.

## 정규(canonical) JSON envelope

[ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) 엔티티의 public projection. List는 가볍게 유지하기 위해
`body`를 **참조(by reference)** 로 전달한다; markdown 표현은 이를 인라인(inline)한다.

```jsonc
{
  "id": "skills/safe-prompt-redaction",
  "type": "skill",
  "version": "1.4.0",                      // resolved semver
  "title": "Safe prompt redaction",
  "summary": "Strip identifiers before sending text to an LLM.",
  "boundary": "public",                    // always "public" on this surface
  "tags": ["safety", "redaction"],
  "inputs":  [{ "name": "text", "type": "string", "required": true }],
  "outputs": [{ "name": "redacted_text", "type": "string" }],
  "preconditions": ["caller has the raw text"],
  "body": { "ref": "/api/v1/skills/safe-prompt-redaction.md" }, // inlined in md rep
  "provenance": {                          // reference only — NO origin_ref/origin_version
    "source_product": "CAW-03",
    "source_ref": "skills-registry/safe-prompt-redaction",
    "validated": true,
    "public_safe_recheck": "passed"
  },
  "links": {
    "self":     "/api/v1/skills/safe-prompt-redaction",
    "pinned":   "/api/v1/skills/safe-prompt-redaction/versions/1.4.0",
    "html":     "/skills/safe-prompt-redaction/",
    "manifest": "/api/v1/skills/safe-prompt-redaction/manifest.json"
  },
  "digest": "sha256:…",                    // immutability proof
  "published_at": "TODO(open-question: timestamp+tz policy)"
}
```

타입 확장: **Workflows**는 순서가 있는 `steps[]`를 추가하며, 각각 skill `id@version`을 pin한다; **Playbooks**는
`contains[]` 멤버 참조를 추가한다. Tips는 공통 필드만 가진다.

## Content negotiation

동일한 정규 리소스, 세 가지 표현([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).

| `Accept` | Suffix alias | Body | 주요 소비자 |
|---|---|---|---|
| `text/html` | — | 렌더된 페이지 (see [website_ko.md](./website_ko.md)) | 사람 (웹사이트 호스트 기본값) |
| `text/markdown` | `.md` | 아티팩트 본문 + 작은 YAML frontmatter (manifest 필드) | *콘텐츠*를 가져오는 HTTP agent (HTML보다 토큰 ~80% 적음) |
| `application/json` | `.json` | 위의 envelope | MCP / 프로그래밍 방식 (API 호스트 기본값) |

- `Accept` header가 **정규(canonical)** 메커니즘이다; `.md`/`.json` suffix는 멍청한/정적 클라이언트를 위한
  **보조적이고 edge-cacheable한** alias다. `Vary: Accept`를 설정하고; `Content-Type`을 명시적으로 방출한다.
- **무결성(Integrity):** 모든 버전 응답은 본문에 `digest`와 그로부터 파생된 강한 `ETag`를 지닌다; `latest` 응답은
  호출자가 결정론적으로 다시 pin할 수 있도록 resolved `semver` + `digest`를 포함한다
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- **CORS**는 공개 읽기를 위해 열려 있다. auth 없음, rate-limit identity 없음(정적 CDN).
- TODO(open-question: 일부 CDN은 `Vary: Accept`를 잘 처리하지 못한다 — suffix alias가 cache-safe 경로,
  [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)에 따라).

## 버전 주소 지정

| URL | 의미 | Cache |
|---|---|---|
| `/api/v1/{type}/{slug}` | latest published (moving); 본문에 resolved `semver`+`digest` 포함 | short / revalidate |
| `/api/v1/{type}/{slug}/versions/{semver}` | immutable pin; 영원히 동결 | `public, max-age=31536000, immutable` |
| `/api/v1/{type}/{slug}/versions` | list `[{semver, digest, published_at, status}]` | short |

게시된 `(slug, semver)`는 immutable하다; 수정은 새 버전을 만든다; boundary 변경은 410 tombstone을 통해
deprecate/unpublish/redact한다([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

```jsonc
// HTTP 410 Gone tombstone body
{ "status": 410, "id": "skills/old-thing", "version": "0.9.0",
  "tombstone": true, "reason": "boundary-changed",   // no confidential detail
  "superseded_by": "/api/v1/skills/old-thing/versions/1.0.0" }
```

## index.json — 카탈로그 manifest

게시된 모든 것의 단일 본문 없는(bodiless) manifest — agent/crawler 진입점.

```jsonc
{
  "api_version": "v1",
  "generated_at": "TODO(timestamp policy)",
  "items": [
    { "id": "skills/safe-prompt-redaction", "type": "skill", "latest": "1.4.0",
      "boundary": "public", "digest": "sha256:…",
      "versions": ["1.4.0", "1.3.0", "1.0.0"],
      "links": { "self": "/api/v1/skills/safe-prompt-redaction",
                 "manifest": "/api/v1/skills/safe-prompt-redaction/manifest.json" } }
  ]
}
```

동반 발견(discovery) 진입점: `/llms.txt`(상위 아티팩트의 markdown index, 있으면 좋음)와 MCP resources view
(`uri = caw04://{type}/{slug}@{semver}`) — 둘 다 동일 코퍼스의 projection이며, 각각 하나의 `PublishSinkAdapter`
([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)), 공유 substrate 없음.

## 페이지네이션 & 필터링 (사전 계산, 정적)

전달이 정적이므로([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)), list 페이지는 **사전 계산(precomputed)** 된다.

**페이지네이션** — cursor 기반, 안정적 envelope (게시 중에도 안정적; agent-loop 친화적):

```jsonc
{ "data": [ /* lightweight refs (no bodies) */ ],
  "pagination": { "next_cursor": "…", "has_more": true, "total_count": 42 } }
```

`next`는 완전히 구성된 `Link` header로도 방출된다. `total_count`는 best-effort다. TODO(open-question: 규모에서
`total_count`를 저렴하게 유지할지, 순수 cursor를 위해 버릴지 — [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).

**필터링** — whitelist된 1급(first-class) 필드만(cacheable; 임의 DSL은 거부):

| Param | 의미 |
|---|---|
| `type` | tip / skill / workflow / playbook |
| `tag` | tag 매칭 |
| `source_product` | provenance 출처 (예: CAW-02, CAW-03) — 참조 label일 뿐 |
| `q` | 경량 키워드 (사전 계산; see `/search`) |
| `updated_since` | timestamp 이후 변경된 항목 |
| `sort` | whitelist된 정렬 키 |

`boundary`는 의도적으로 필터가 **아니다**. 런타임/서버 측 검색은 유보됨(deferred) — 런타임 substrate를 도입하게 될
문서화된 후속 기능([website_ko.md](./website_ko.md)과 공유되는 미해결 질문).

## 배포 형식(Distribution format) (요약)

게시된 아티팩트는 두 가지 상호 교환 가능한 인코딩의 한 manifest다
([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)): `SKILL.md`(개방형 Agent Skills frontmatter+본문, `name`=slug,
추가적 거버넌스 필드 `version`/`boundary`/`provenance`/`license` 포함)와 `manifest.json`(동일 필드, 정규 기계 형식).
pin된 버전은 `slug@semver`로 키된 `.skill` 번들(`SKILL.md`, `manifest.json`, `references/`, `examples/`, `assets/`)로
다운로드되며, provenance가 stamp되고 오프라인 실행 가능하다; Workflows는 순서가 있는 `{skill_id, version}` step을 가진
`workflow.json`을 추가한다.

## 미해결 질문(Open Questions)

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조:
- TODO(open-question: `SKILL.md` 스펙을 그대로(verbatim) 채택할지 CAW-04 superset으로 할지; drift 위험).
- TODO(open-question: 공개 `license` 필드 + 기본 SPDX id + 상류 Source로부터의 상속).
- TODO(open-question: `published_at`/`updated_at` timestamp + timezone 정책).
- TODO(open-question: 규모에서의 `total_count` 비용).
- TODO(open-question: 정적 `/api/v1/openapi.json` 제공).
- TODO(open-question: `Vary: Accept` CDN 동작; cache-safe 경로로서의 suffix alias).
- TODO(open-question: `references/`/`assets/` 크기 제한 + 번들링 전 secret/virus 스캔).
- TODO(open-question: workflow step pin을 정확한 `id@version`으로 할지 range/`latest`로 할지).

## 런북(runbook)에 대한 함의

- 페이지와 동일한 `getCollection()` 데이터로부터 모든 라우트에 대해 Astro 파일 기반 엔드포인트를 생성한다.
- 아티팩트/버전마다 JSON envelope + 원시 `.md`를 방출한다; 라우트별로 `Vary: Accept`, `ETag`/`digest`, `Cache-Control`을 배선한다.
- cursor envelope, `Link` header, whitelist된 필터로 list/index 페이지를 사전 계산한다; `index.json`, `/llms.txt`를 빌드한다.
- 방출 시점 `boundary==public ∧ public_safe_recheck==passed` validator + public-projection (no-sidecar) 테스트를 배선한다.
- 제거된 리소스/버전에 대해 410 tombstone 본문을 방출한다; `.skill` 번들 패키징 + MCP `resources/*` adapter를 빌드한다.

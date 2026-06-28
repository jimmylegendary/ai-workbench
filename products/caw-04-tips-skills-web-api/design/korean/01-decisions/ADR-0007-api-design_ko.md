# ADR-0007: REST API — 하나의 canonical resource, 여러 representation; SKILL.md/manifest 배포

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§3 agents fetch via API, §4 web+REST, §5 immutable versions)
  - [../02-research/skills-distribution-and-api-resources_ko.md](../02-research/skills-distribution-and-api-resources_ko.md) (이 ADR이 승인하는 research)
  - [../02-research/web-and-api-stack_ko.md](../02-research/web-and-api-stack_ko.md)
  - [./ADR-0006-web-stack_ko.md](./ADR-0006-web-stack_ko.md) (API는 동일 Astro content collection에서 co-generate됨)
  - [./ADR-0005-storage-and-versioning_ko.md](./ADR-0005-storage-and-versioning_ko.md) (semver+digest identity, 410 tombstone)
  - [./ADR-0002-content-model_ko.md](./ADR-0002-content-model_ko.md) (JSON envelope 필드)
  - [./ADR-0003-publishing-policy-and-public-safe-gate_ko.md](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (`boundary=public`만, edge 강제)
  - [./ADR-0004-import-and-ports_ko.md](./ADR-0004-import-and-ports_ko.md) (REST + MCP view는 PublishSinkAdapter)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

세 종류의 소비자가 **동일한** published artifact를 가져가며 각각 다른 representation을 필요로 한다: 사람 reader(HTML,
website 경유), HTTP agent(저토큰 markdown 또는 JSON), 그리고 MCP host(JSON resource catalog) — brief §3. API는
**read-only**이며(publish는 curator 전용, out of band — brief §10), website와 동일한 검증된 public-safe corpus를
제공하고([ADR-0006](./ADR-0006-web-stack_ko.md)), 불변·addressable 버전을 갖는다(brief §5,
[ADR-0005](./ADR-0005-storage-and-versioning_ko.md)). 설계 규칙: **하나의 canonical resource, 여러 representation** —
HTML/markdown/JSON은 content negotiation으로 선택되는 projection이며 결코 별개의 source of truth가 아니다. 그래서
provenance + safety boundary가 모든 representation에 붙어 있게 된다.

## Options considered

| Decision point | Options | Chosen | Why |
|---|---|---|---|
| Resource identity | format별 source vs 하나의 canonical resource, 여러 representation | **하나의 canonical resource, 여러 representation** | provenance + `boundary=public`이 모든 projection에 붙어 유지됨 |
| Version addressing | query `?version=` vs path 세그먼트 | **`/{id}` = latest(이동); `/{id}/versions/{semver}` = 불변 pin** | cache 가능, addressable, brief §5; agent가 known-good을 pin |
| Content negotiation | `Accept` header vs `.md`/`.json` suffix vs `?format=` | **`Accept` header(주, canonical) + `.md`/`.json` suffix(부, alias)** | HTTP-native + 공유/edge-cache 가능; agent에 친화적인 static-file |
| Pagination | offset/limit vs cursor/keyset | **cursor + stable envelope(+ `Link` header)** | publish 중에도 안정적; agent-loop 친화적 |
| Filtering | 임의 DSL vs whitelist된 일급 필드 | **whitelist된 필드만**(`type`,`tag`,`source_product`,`q`,`updated_since`,`sort`) | cache 가능; `boundary`는 filter가 아님(non-public 값이 존재함을 암시하게 됨) |
| Manifest format | custom vs open Agent Skills `SKILL.md` | **`SKILL.md`(frontmatter+body) ⇆ `manifest.json`, 동일 필드** | Claude 스타일 loader + MCP/JSON 클라이언트에 그대로 들어감 |
| Catalog discovery | REST만 vs REST + MCP + `/llms.txt` | **세 가지 모두** | HTTP agent, MCP host, crawler를 모두 커버 |

## Decision

**read-only REST API로, 동일 Astro build([ADR-0006](./ADR-0006-web-stack_ko.md))가 static JSON + raw markdown으로
prebuild하며, artifact마다 하나의 canonical resource를 HTML/markdown/JSON으로 노출하고, 추가로 `SKILL.md`/`manifest.json`
배포 포맷과 MCP resources view를 제공한다.**

**Resource model** — resource는 [ADR-0002](./ADR-0002-content-model_ko.md) 엔티티와 1:1로 매핑된다; API 계약
버전은 prefix `/api/v1`이며, 콘텐츠 `{semver}`와 **직교(orthogonal)**로 유지된다:

```
GET /api/v1/{type}                          list/index (latest of each; cursor pagination, whitelisted filters)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/examples          Example sub-resource
GET /api/v1/{type}/{slug}/manifest.json     the distribution manifest (machine form)
GET /api/v1/index.json                      manifest of all items+versions+boundary+links (no bodies)
GET /api/v1/search                          cross-type lightweight refs (website global search)
```
`{type} ∈ tips | skills | workflows | playbooks`. `Source`는 **결코 독립 resource가 아니다** — provenance는 내장된
*reference*(`source_product`, `source_ref`, `validated`, `public_safe_recheck`)이며, 결코 fetch 가능한 내부
문서가 아니다(brief §11). `SafetyBoundary`는 내장된 단언 필드이며, 이 surface에서는 항상 `public`이다. 제거된
resource는 [ADR-0005](./ADR-0005-storage-and-versioning_ko.md)에 따라 기계가 읽을 수 있는 tombstone body와 함께
**HTTP 410 Gone**을 반환한다(404 아님).

**Canonical JSON envelope**([ADR-0002](./ADR-0002-content-model_ko.md) public projection): `id`, `type`, `version`,
`title`, `summary`, `boundary:"public"`, `tags`, `inputs[]`, `outputs[]`, `preconditions[]`, `body`(list에서는
`ref`로, markdown으로 fetch될 때 inline), `provenance`(reference만), `links`(`self`/`pinned`/`html`/`manifest`),
`digest`, `published_at`. Workflow는 순서 있는 `steps[]`(각각 skill `id@version`을 pin)를 추가; Playbook은
`contains[]`를 추가. **List는 가볍게 유지하기 위해 `body`를 reference로 전달**하며; markdown representation은 이를
inline한다.

**Content negotiation** — 동일 resource, 세 representation:
- `text/html` → 렌더된 페이지(website host 기본).
- `text/markdown` → artifact body + 작은 YAML frontmatter header(manifest 필드); *콘텐츠*를 fetch하는 agent가 받는
  것(HTML 대비 ~80% 적은 토큰). Agent(Claude Code / OpenCode)는 오늘날 `Accept: text/markdown`을 보낸다.
- `application/json` → 위의 구조화된 envelope(기계 추론, list, MCP; `api.` host 기본).

`Accept` header가 canonical 메커니즘이며; `.md`/`.json` suffix alias는 멍청한 클라이언트를 위한 부차적이고
edge-cache 가능한 탈출구다. `Vary: Accept`를 설정하고 `Content-Type`을 명시적으로 emit한다. **Integrity:** 모든
version 응답은 body에 `digest`와 그로부터 파생된 강한 `ETag`를 담는다; `latest` 응답은 resolve된 `semver` +
`digest`를 포함하므로 호출자가 결정론적으로 re-pin할 수 있다([ADR-0005](./ADR-0005-storage-and-versioning_ko.md)).
공개 read를 위해 CORS open.

**Pagination** — stable envelope `{ data:[refs], pagination:{ next_cursor, has_more, total_count } }`를 가진
cursor 기반; `next`는 완전히 형성된 `Link` header로도 제공. `total_count`는 best-effort.

**Skill/Workflow 배포 포맷** — published artifact는 하나의 manifest를 두 가지 상호 교환 가능한 인코딩으로 갖는
**manifest envelope**로 배포된다:
- **(a) `SKILL.md`** — open Agent Skills 형태(필수 `name`, `description`; `name` = artifact slug) + 추가적인
  CAW-04 governance 필드(`version`, `boundary`, `provenance`, `license`)이며, 이를 모르는 loader는 무시한다.
- **(b) `manifest.json`** — JSON envelope와 동일한 필드로, `/api/v1/{type}/{slug}/manifest.json`에서 served됨;
  canonical 기계 형태이자 MCP resource가 참조하는 body.

pin된 version은 **`.skill` bundle**(폴더 관례: `SKILL.md`, `manifest.json`, `references/`, `examples/`, `assets/`)로
다운로드 가능하며 `slug@semver`로 keyed된다 — self-contained, provenance-stamped, offline-runnable. Workflow는
재현성을 위해 순서 있는 `{skill_id, version}` 단계를 나열하는 `workflow.json`을 추가한다.

**MCP discoverability** — catalog를 MCP **resources** view(`resources/list` + `resources/read`)로 노출한다:
`uri = caw04://{type}/{slug}@{semver}`, `name/description` = manifest `title/summary`, `mimeType =
text/markdown | application/json`. MCP view는 동일한 canonical resource 위의 **하나의 `PublishSinkAdapter`**
([ADR-0004](./ADR-0004-import-and-ports_ko.md))이며 — website + REST API sink와 나란히 있다. 공유 substrate 없음;
MCP는 그저 또 하나의 projection이다. `/llms.txt`(상위 artifact의 markdown index)는 편의 진입점으로 publish되며,
nice-to-have로 취급된다(load-bearing 메커니즘은 content negotiation을 통한 per-URL markdown이다).

**gate의 edge 강제** — 어떤 representation이 emit되기 전에, validator가 `boundary == "public"`과
`provenance.public_safe_recheck == passed`를 단언한다([ADR-0006](./ADR-0006-web-stack_ko.md)의 build-time invariant를
모든 endpoint에 적용). 이는 import 재검증([ADR-0004](./ADR-0004-import-and-ports_ko.md))과
publish gate([ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md)) 뒤의 API 측 backstop이다.

## Consequences

- **쉬움:** 사람, HTTP agent, MCP host가 하나의 corpus를 재사용한다; provenance + boundary가 모든 representation과
  함께 이동한다; `semver`(호환성) 또는 `digest`(바이트)로의 pinning이 결정론적이다.
- **쉬움:** static JSON + `.md` 파일은 손쉽게 CDN-cache 가능하다; 공개 경로에 런타임 substrate 없음
  ([ADR-0006](./ADR-0006-web-stack_ko.md)).
- **어려움 / 비용:** static 전달은 filter/pagination이 precompute되고 search가 client-side로 시작됨을 의미한다;
  `Vary: Accept`는 CDN 주의가 필요하다; `SKILL.md`/MCP 형태는 drift할 수 있는 외부 spec을 따라간다.
- **Follow-on runbooks:** API route + cursor envelope + whitelist된 filter + `Accept`/`.md` negotiation(`Vary:
  Accept`, host별 기본 format); `SKILL.md` frontmatter schema + `manifest.json` JSON Schema + emit 전
  `boundary==public` ∧ `public_safe_recheck==passed`를 단언하는 validator; content scan을 포함한 `.skill` bundle
  패키징; MCP `resources/*` adapter + registry-listing stub; 제거된 resource를 위한 410 + 기계가 읽을 수 있는
  tombstone body([ADR-0005](./ADR-0005-storage-and-versioning_ko.md)).

## Open questions / revisit triggers

- TODO(open-question: open Agent Skills `SKILL.md` spec을 그대로 채택 vs CAW-04 superset profile; drift 위험).
- TODO(open-question: artifact별 공개 `license` 필드 — 재배포에 필수이며, 기본 SPDX id; upstream Source에서 어떻게
  상속되는가). [ADR-0002](./ADR-0002-content-model_ko.md)와 조율.
- TODO(open-question: `published_at`/`updated_at` timestamp + timezone 정책 — 임의로 만들지 말 것).
- TODO(open-question: catalog가 커져도 `total_count`가 저렴하게 유지되는가, 아니면 순수 cursor로 두고 drop할 것인가).
- TODO(open-question: v1 범위의 MCP Registry listing vs 나중의 PublishSinkAdapter stub만).
- TODO(open-question: `references/`/`assets/` 크기 제한 + bundling 전 secret/virus scan — public-safe).
- TODO(open-question: `Vary: Accept`에 대한 CDN 동작; 일부 CDN은 이를 잘 처리하지 못함 — suffix alias를 cache-safe
  경로로).
- TODO(open-question: agent를 위해 read API의 OpenAPI/JSON-Schema 기술을 static `/api/v1/openapi.json`에 publish할지).
- TODO(open-question: 버전 간 workflow step ref — 정확한 `id@version` pin vs range/`latest` 허용).
- **Revisit trigger:** static을 넘어서는 agent query 요구(server-side filter/search)는 런타임 search endpoint를
  도입하게 만든다 — 동일한 `PublishSinkAdapter` seam 뒤에서, static-delivery 결정을 재검토하면서.

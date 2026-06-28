# Rendering — 하나의 source에서 나오는 Web + API 동등성 (Astro SSG)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-entities.md](./content-entities_ko.md) (렌더링되는 엔티티 + public projection)
  - [./versioning-and-immutability.md](./versioning-and-immutability_ko.md) (URL/resource 체계, tombstones)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack_ko.md) (Astro 5 + Starlight, SSG)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design_ko.md) (이 문서가 구체화하는 결정)
  - [../02-research/skills-distribution-and-api-resources.md](../02-research/skills-distribution-and-api-resources_ko.md)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 **하나의 markdown/MDX source가 어떻게 모든 공개 표현(representation)이 되는지** — HTML 페이지, 정적 JSON, raw markdown, `manifest.json` / `SKILL.md`, `index.json` manifest, MCP resources view — 를 단일 **Astro 5 + Starlight SSG** 빌드를 통해 설명한다. [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)와
[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)을 구체화한다. resource/URL 체계
([versioning-and-immutability](./versioning-and-immutability_ko.md)), 엔티티 필드
([content-entities](./content-entities_ko.md)), 게이트([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md))를 재정의하지는 않는다.
여기서 구체화하는 속성: **web/API 동등성은 구성상(by construction) 보장된다 — 모든 표현은 동일한 `getCollection()` corpus의 projection이므로, frozen된 검증 완료 정적 artifact는 어떤 내부 store로도 돌아가는 라이브 경로를 갖지 않는다.**

## 1. The one-source pipeline

```
CAW-02 / CAW-03 import (ContentSourceAdapter)
        │  cross-boundary; public-safe RE-CHECK runs in CORE here (deny-by-default)
        ▼
CAW-04 git repo: src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
        │            + <semver>.audit.json  (sidecar — NEVER built into output)
        ▼
Astro Content Collections  ── typed, schema-validated load → ONE in-memory corpus (getCollection)
        ├──────────► HTML pages     src/pages/{type}/[slug]/[...].astro       (Starlight UI)
        ├──────────► JSON resources src/pages/api/v1/{type}/[slug]/...json.ts (Response JSON)
        ├──────────► Raw markdown   src/pages/api/v1/{type}/[slug]/...md.ts   (Response markdown)
        ├──────────► Manifests      manifest.json / SKILL.md per artifact
        ├──────────► index.json     src/pages/api/v1/index.json.ts (all items+versions+boundary+links)
        └──────────► MCP view       resources/list + resources/read (PublishSinkAdapter)
        ▼
astro build (SSG) → dist/ static files (HTML + .json + .md)  →  CDN
```

모든 emitter는 페이지가 사용하는 것과 **동일한** `getCollection()` 데이터를 import하므로, API는 *렌더링된 corpus의 직렬화*다. 두 번째 콘텐츠 store도 없고 drift도 없다. 웹사이트 빌드, REST API, MCP view는 하나의 core 위에 놓인 세 개의 **PublishSinkAdapters**다([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).

## 2. 하나의 resource에서 나오는 표현들

| 표현 | 빌드된 artifact | 소비자 | 비고 |
|---|---|---|---|
| **HTML** | `/{type}/{slug}/` (+ `/v/{semver}/`) | 사람 독자 | Starlight nav/search/version 라우팅 |
| **JSON** | `/api/v1/{type}/{slug}.json` (+ `/versions/{semver}.json`) | HTTP agent, MCP | 구조화된 envelope (public projection) |
| **Raw markdown** | `/api/v1/{type}/{slug}.md` (+ `/versions/{semver}.md`) | LLM에 공급하는 agent | body + 작은 YAML 헤더; HTML 대비 토큰 약 80% 절감 |
| **manifest.json** | `/api/v1/{type}/{slug}/manifest.json` | skill loader, MCP | 표준 기계용 형식 |
| **SKILL.md** | `.skill` bundle 내부 | Claude 스타일 loader | manifest와 동일한 필드, frontmatter+body |
| **index.json** | `/api/v1/index.json` | crawler, agent | 모든 item+version+boundary+link, body 없음 |

### 2.1 Content negotiation

[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) 기준: **`Accept` header가 표준 메커니즘이며; `.md` / `.json`
suffix alias는 부차적이고 edge에서 캐시 가능한 비상 통로(escape hatch)다.** 빌드가 SSG(요청별 서버 없음)이므로 suffix 파일이 하중 지지 정적 artifact이고; `Accept`-header 규칙은 그 위에 놓인 얇은 CDN/edge 레이어다.

| `Accept` | Suffix alias | 서빙되는 것 |
|---|---|---|
| `text/html` | (없음 / `/`) | 렌더링된 Starlight 페이지 (웹사이트 호스트 기본값) |
| `text/markdown` | `.md` | body + YAML frontmatter 헤더 (agent content fetch) |
| `application/json` | `.json` | 구조화된 envelope (기계 추론; `api.` 호스트 기본값) |

`Vary: Accept`를 설정하고, `Content-Type`을 명시적으로 emit한다. TODO(open-question: CDN behaviour for `Vary: Accept` — some CDNs
handle it poorly; suffix aliases are the cache-safe path — from [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).

### 2.2 Canonical JSON envelope (public projection)

```jsonc
{
  "id": "triage-incident",
  "type": "skill",
  "version": "2.1.0",
  "title": "Triage an incoming incident",
  "summary": "One-line public-safe description.",
  "boundary": "public",                 // asserted after the public-safe re-check
  "tags": ["ops", "incident-response"],
  "inputs":  [{ "name": "alert", "type": "string", "required": true }],
  "outputs": [{ "name": "triage_report", "type": "markdown" }],
  "preconditions": ["a non-empty alert payload is provided"],
  "body": { "format": "markdown", "ref": "/api/v1/skills/triage-incident.md" },  // by REF in lists
  "provenance": {                        // reference only — NO internal payload (sidecar stays unserved)
    "source_product": "CAW-03",
    "validated": true,
    "public_safe_recheck": "passed"
  },
  "links": {
    "self":     "/api/v1/skills/triage-incident",
    "pinned":   "/api/v1/skills/triage-incident/versions/2.1.0",
    "html":     "https://.../skills/triage-incident",
    "manifest": "/api/v1/skills/triage-incident/manifest.json"
  },
  "digest": "sha256:cc…",
  "published_at": "TODO(open-question: timestamp policy)"
}
```

`body`는 리스트/JSON에서는 **참조로(by reference)** 전달되고(리스트를 가볍게 유지), markdown 표현에서는 **인라인된다**. Workflow는 순서가 있는 `steps[]`(각각 skill `id@version`을 pin함)를 추가하고; Playbook은 `contains[]`를 추가한다. public projection 주의([content-entities](./content-entities_ko.md) §3): `origin_ref` / `origin_version`은 존재하지 않는다 — audit sidecar는 결코 빌드에 들어가지 않는다.

## 3. Distribution format — manifest, bundle, MCP

**하나의** manifest에 대한 두 개의 상호 교환 가능한 인코딩([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)):

**(a) `SKILL.md`** — 개방형 Agent Skills 형태(필수 `name`=slug, `description`) + 추가적인 CAW-04 governance
필드(`version`, `boundary`, `provenance`, `license`)이며, 이를 모르는 loader는 무시함.

**(b) `manifest.json`** — §2.2 envelope과 동일한 필드; 표준 기계용 형식이자 MCP가 읽는 body.

pin된 version은 `slug@semver`로 키된 **`.skill` bundle**로 다운로드된다 — 자기 완결적이고, provenance가 찍혀 있으며, 오프라인 실행 가능:

```
triage-incident@2.1.0/
  SKILL.md        # manifest (a)
  manifest.json   # manifest (b) — identical fields
  references/     # supporting docs loaded into agent context
  examples/       # Example sub-resources (each public-safe; own boundary)
  assets/         # templates (large assets by path, brief §6)
```

Workflow는 재현성을 위해 순서가 있는 `{skill_id, version}` step을 나열하는 `workflow.json`을 추가한다. TODO(open-question:
`references/` / `assets/` size limits + secret/virus scan before bundling — public-safe, from
[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).

### 3.1 MCP resources view

카탈로그를 MCP **resources** view(`resources/list` + `resources/read`)로 노출한다 — 동일한 표준 resource 위에 놓인 또 하나의 PublishSinkAdapter이며, 공유 substrate 없음:

| MCP 개념 | CAW-04 매핑 |
|---|---|
| Resource `uri` | `caw04://{type}/{slug}@{semver}` |
| `name` / `description` | manifest `title` / `summary` |
| `mimeType` | `text/markdown` (body) 또는 `application/json` (manifest) |
| `resources/read` payload | `.md` body 또는 `manifest.json` |

`/llms.txt`(상위 artifact의 markdown 인덱스)는 편의용 진입점으로 공개된다 — 있으면 좋은 정도; 하중 지지 메커니즘은 content negotiation을 통한 URL별 markdown이다. TODO(open-question: MCP Registry listing in v1
vs a later PublishSinkAdapter stub — from [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).

## 4. Lists, filters, search

정적 전달이라는 것은 이들이 요청 시점이 아닌 **빌드 시점에 미리 계산됨**을 의미한다
([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)).

| 관심사 | v1 메커니즘 |
|---|---|
| **Pagination** | cursor + 안정적 envelope `{ data:[refs], pagination:{ next_cursor, has_more, total_count } }`; `next`는 `Link` header로도 제공. `total_count`는 best-effort. |
| **Filtering** | whitelist된 first-class 필드만: `type`, `tag`, `source_product`, `q`, `updated_since`, `sort`. **`boundary`는 필터가 아니다** — 제공하면 비공개 값이 존재함을 암시하게 됨. |
| **Search** | 클라이언트 측 / 사전 빌드된 인덱스(Pagefind 스타일) 또는 정적 `search-index.json`; 런타임 search endpoint는 연기된 선택적 adapter. |

## 5. Public-safe-by-construction 강제 (빌드 불변식)

게이트는 upstream을 신뢰하는 것이 아니라 **빌드 시점과 매 emit마다** 강제된다 — import 재검사([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md))와 publish gate
([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)) 뒤의 API 측 backstop.

```text
for every record entering ANY representation (HTML | JSON | MD | manifest | MCP):
    assert boundary == "public"            ∧
           public_safe_recheck == "passed" ∧
           toPublicProjection(record) contains NO audit-only field
    else  → FAIL THE BUILD (do not emit)
```

이것이 배포된 corpus가 **내부 store로의 라이브 경로가 없는, frozen된 검증 완료 정적 파일 집합**인 이유다 — brief §11의 가장 강한 해석. 제거된 resource는 404가 아니라 **410 + 기계 판독 가능 tombstone** body를 emit한다
([versioning-and-immutability](./versioning-and-immutability_ko.md) §3).

## 6. Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적:

- TODO(open-question: ship `.json`/`.md` suffix routes only, or also an edge `Accept`-header rule — introduces an edge layer?)
- TODO(open-question: is a prebuilt client-side search index enough for v1, or do agents need a server-side query endpoint?)
- TODO(open-question: publish an OpenAPI/JSON-Schema description at a static `/api/v1/openapi.json` for agents?)
- TODO(open-question: does Starlight's doc-centric layout/versioning fit all four entity types, or need custom Astro pages?)
- TODO(open-question: rebuild trigger for the PublishSinkAdapter on approve/update/unpublish — webhook vs CI vs scheduled.)
- TODO(open-question: adopt the Agent Skills `SKILL.md` spec verbatim vs a CAW-04 superset profile — drift risk.)
- TODO(open-question: does `total_count` stay cheap as the catalog grows, or drop it for pure cursor?)

## 7. Implications for runbooks

- **Scaffold runbook:** Astro 5 + Starlight; [content-entities](./content-entities_ko.md) frontmatter에 맞는 content-collection 스키마.
- **API endpoints runbook:** item별/version별 JSON + raw markdown + collection 리스트 + `index.json`을 위한 빌드 타임 endpoint, 모두 `getCollection()`을 통해 읽음; cursor envelope; whitelist된 필터; `Vary: Accept`와 함께 `Accept` + `.md`/`.json` negotiation; 호스트별 기본 형식.
- **Manifest runbook:** `SKILL.md` frontmatter 스키마 ⇆ `manifest.json` JSON Schema; `boundary==public` ∧ `public_safe_recheck==passed` ∧ projection에 audit 필드 없음을 단언하는 emit-time validator.
- **Bundle runbook:** content scan과 함께 `slug@semver`로 키된 `.skill` 패키징.
- **MCP adapter runbook:** 표준 resource 위의 `resources/list` + `resources/read`; registry-listing stub.
- **CI safety check:** non-public-boundary item이나 audit-only 필드가 web 또는 API에 도달하면 빌드를 실패시킴.
</parameter>

# 웹 & API 스택 (Web & API Stack)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - `../01-decisions/ADR-0006-web-and-api-stack.md` (TODO: to be written from this doc)
  - `../08-research-plan/open-questions.md` (TODO: link when created)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04의 공개 읽기 표면을 위한 **웹 프레임워크 + REST API 스택**을 결정하고, 단일한 **markdown source of truth**가
렌더링된 웹 페이지와 기계 판독 가능한 API 응답(markdown 및/또는 JSON) 양쪽 모두가 되는 메커니즘을 결정한다. static-site/웹
옵션(Astro, Next.js, Docusaurus/Starlight 등), API 전달 스타일, 그리고 content-from-git 대 headless CMS를 비교한 뒤
v1 스택을 권장한다.

이 문서는 콘텐츠 모델/엔티티(Tip/Skill/Workflow/…), public-safe publish gate, import adapter, 또는 버저닝 체계를 결정하지
**않는다** — 그것들은 각자의 ADR을 갖는다. brief의 방향을 가정한다: **git 안의 markdown/MDX-first를 source of truth로 +
API를 위한 index**(brief §6), read-only 공개 표면, curator만 publish(brief §10), ports & adapters(brief §8).

## 선택을 이끄는 제약 (brief에서)

| # | Constraint | Stack implication |
|---|------------|-------------------|
| C1 | Public surface, **read-only**; no public write API, no user accounts (§10) | Favors static/prebuilt output; no per-request app server needed for the public path |
| C2 | **Public-safe only**; never leak confidential data (§11, the most critical guardrail) | Build must publish ONLY a vetted, public corpus; no live pull from internal stores at request time |
| C3 | Markdown/MDX-first in git as source of truth + an index for the API (§6) | Content-from-git, not a headless CMS DB; the SSG and the API read the same files |
| C4 | Same content served as **web + REST**, markdown and/or JSON (§4) | Need one pipeline that emits HTML pages and JSON/markdown endpoints from one source |
| C5 | Versioned, immutable, addressable published versions (§5) | URLs/endpoints must carry version; old builds/versions stay reachable |
| C6 | Ports & adapters, no shared substrate (§8) | The `PublishSinkAdapter` = "web build + REST API" must be swappable; stack must not bleed other products' runtimes |
| C7 | Agents fetch skills/workflows via API (§3) | Stable, documented JSON contract + content negotiation; CORS open for public read |

## 결정 1 — 웹 / static-site 프레임워크

현재(2026) 툴링에 근거한 후보들. 문서 중심 프레임워크(Starlight, Docusaurus, Nextra, VitePress) 대 일반 콘텐츠
프레임워크(Astro, Next.js).

| Option | What it is | Pros | Cons | Fit for CAW-04 |
|--------|-----------|------|------|----------------|
| **Astro (+ Starlight)** | Content-first SSG; islands; Content Layer API for typed collections; file-based **endpoints** that emit JSON at build | Minimal JS shipped; first-class markdown/MDX **content collections** with schema validation; **endpoints** generate `*.json` from the SAME collections → web + API from one source; Starlight gives docs UX (search, nav, versions) out of the box | Smaller React ecosystem if heavy app UI later; Starlight opinionated layout | **Strong.** Directly satisfies C3/C4 — one content set → pages + `.json` endpoints. Best alignment. |
| **Next.js** | Full-stack React; App Router, RSC, API routes, SSR/ISR | Most flexible; route handlers give a real REST API; ISR for incremental updates | Heaviest runtime; pulls in a React app server (tension with C1 "read-only, prebuilt" and C6 "no extra substrate"); more attack surface for a public read site | Overkill for v1 read-only docs; revisit only if rich interactivity needed |
| **Docusaurus** | Meta's React+MDX docs platform | Proven for OSS docs; built-in versioning, search, i18n | React/MDX heavier output; **no native "emit JSON API" path** — you bolt on a separate API; versioning is doc-centric, not item/provenance-centric | Good docs UX but weak on the API-from-same-source requirement (C4) |
| **VitePress / Nextra** | Vue (VitePress) / Next-based (Nextra) docs SSGs | Fast, simple, popular in 2026 | Same gap as Docusaurus for a co-generated JSON API; Nextra ties to Next runtime | Viable web-only; lose the unified web+API win |
| **MkDocs / Hugo / Eleventy** | Python (MkDocs) / Go (Hugo) / JS (Eleventy) SSGs | Very fast builds; mature | API-from-same-source is manual; less type-safe content schema than Astro collections | Workable but more glue for C4 |

**선택: 웹사이트에는 Astro + Starlight.** 결정적 요인은 C4이다: Astro **content collections**(하나의 타입화된
markdown/MDX 코퍼스)가 렌더링된 페이지와 파일 기반 **endpoints**(`src/pages/api/...json.ts`) 양쪽 모두에 공급되며, 이
endpoint들은 빌드 시점에 정확히 동일한 항목을 JSON으로 직렬화한다 — 두 번째 콘텐츠 store도, drift도 없다. Starlight가 그 위에
docs UX(search, sidebar, version별 라우팅)를 얹어주므로 우리가 내비게이션을 직접 만들지 않아도 된다.

## 결정 2 — REST API 전달 스타일

API는 **read-only**이며 웹사이트와 동일한 코퍼스를 제공한다. 두 가지 전달 모델:

| Option | How it works | Pros | Cons | Fit |
|--------|--------------|------|------|-----|
| **Prebuilt static JSON (build-time endpoints)** | Astro endpoints emit `/api/v1/skills.json`, `/api/v1/skills/{id}.json`, `/api/v1/skills/{id}/{version}.json`, plus `.md` raw files, written as static files at build | No server to run; cacheable on CDN; cheap; matches C1/C2 (nothing live-queries internal stores); trivially scalable | No request-time logic (filtering/pagination must be precomputed); updates only on rebuild | **v1 default** |
| **Runtime API (SSR route handlers / small service)** | A server (Astro SSR adapter, or a tiny separate API app) reads the index/files per request | Dynamic queries, search params, pagination, content negotiation logic | Adds a runtime substrate + ops + attack surface (tension w/ C1/C6); harder public-safe guarantee | Defer; only if query needs outgrow static |
| **Hybrid** | Static JSON for items/lists + one small search endpoint (or client-side search index) | Keeps bulk static; adds search where static struggles | Two delivery paths to maintain | Likely **v1.x** for search |

**선택: 동일한 빌드로 생성되는 prebuilt static JSON + raw markdown 파일.** 이것이 C2에 대한 가장 안전한 해석이다 —
공개 아티팩트는 frozen되고 검증된 파일 집합이며, 공개 요청에서 어떤 내부 또는 upstream store로 되돌아가는 live 코드 경로가 없다.
검색은 **client-side index**(Starlight/Pagefind 스타일)나 prebuilt `search-index.json`으로 시작하며, 런타임 검색
endpoint는 추후의 선택적 adapter이다.

### 콘텐츠 협상 & 형태

각 항목의 세 가지 표현을 제공하며, 모두 하나의 source 항목에서 빌드된다:

| Representation | URL pattern | Use |
|----------------|-------------|-----|
| HTML page | `/skills/{id}/` (latest), `/skills/{id}/{version}/` | Human web reading |
| JSON | `/api/v1/skills/{id}.json`, `/api/v1/skills/{id}/{version}.json` | Agents/programmatic; structured metadata (inputs/outputs, provenance, boundary, version) |
| Raw markdown | `/api/v1/skills/{id}.md` (or `.../{version}.md`) | Agents that want the source body to feed an LLM |

여기에 collection/index endpoint도 추가한다: `/api/v1/skills.json`, `/api/v1/index.json`(모든 항목 + version +
boundary 태그의 manifest, 본문 없음). 선택적 `Accept` 헤더 협상(`text/markdown` 대 `application/json`)은 추후 얇은
CDN/edge 규칙으로 둘 수 있다; **명시적 확장자가 v1 계약(contract)이다.** 왜냐하면 그것이 static-file 친화적이고 에이전트에게
모호하지 않기 때문이다(헤더를 분기하기 위해 SSR이 필요하지 않다). 하나의 markdown source에서 HTML + JSON을 내보내는 선행 사례로는
GitHub/GitLab markdown render API와 `restdown`/`markdown-to-api` 패턴을 참고하라.

## 결정 3 — Content-from-git 대 headless CMS

| Option | Pros | Cons | Fit for CAW-04 |
|--------|------|------|----------------|
| **Content-from-git (markdown/MDX in repo)** | Own your content; no network at build; versioning via git + frontmatter `version`; diffable review = natural fit for a **curator approval / publish gate**; no extra runtime (C6); cheapest public-safe story (the repo IS the vetted corpus) | Rebuild per change; weak for thousands of large media assets (store by path/CDN); editing UX is files+PR, not a WYSIWYG | **Chosen.** Matches brief §6 exactly and the publish gate is a PR/curator step. |
| **Git-based CMS (editor on top of git, e.g. CloudCannon/Decap-style)** | Adds editing UX while keeping git as source of truth | Extra tool; still rebuild-on-change | Optional later for curator ergonomics; does not change the architecture |
| **API/headless CMS (DB-backed, e.g. Sanity/Contentful-style)** | Editorial workflows, real-time, scales to many pages; faster builds at scale | Content leaves git; adds a service + DB (shared-substrate smell, C6); content-leak surface; provenance/version harder to pin to git history | **Rejected for v1.** Conflicts with §6 and the public-safe/own-data posture. |

CAW-04는 `ContentSourceAdapter`를 통해 **CAW-02(별도 제품)**와 **CAW-03 / skills registry(별도 제품)**로부터 검증된
항목을 import한다. 그 import들은 **public-safe 재검사**(brief §7) 이후 CAW-04 자체 repo에 markdown/MDX 파일로 안착(land)한다.
웹사이트 빌드와 API는 둘 다 그 파일들을 읽는다 — 이것은 import 경계이지 공유 store가 아니다.

## 결정 4 — 공개 읽기 경로에 대한 SSG 대 SSR

| Strategy | Pros | Cons | Fit |
|----------|------|------|-----|
| **SSG (prebuild everything)** | Fastest, cheapest, most cacheable; smallest attack surface; the published set is a frozen vetted artifact (C2); old versions stay as static files (C5) | Content updates require a rebuild+deploy; not for second-by-second data (irrelevant here — curator-paced publishes) | **v1 choice** |
| **ISR / on-demand** | Incremental updates without full rebuild | Needs a runtime; marginal benefit at our publish cadence | Defer |
| **SSR** | Per-request dynamic | Runtime substrate, ops, leak surface; unjustified for read-only curated content | Reject for v1 |

Publish 주기는 curator-gated이고 저빈도이므로, **SSG**가 중요한 모든 축(비용, 안전, 단순성)에서 승리한다. Rebuild는 항목이
승인/갱신/unpublish될 때 `PublishSinkAdapter`에 의해 트리거된다.

## 권장 v1 스택

- **Web:** **Astro 5+ with Starlight**, 콘텐츠는 **content collections**로(스키마를 통한 타입화된 frontmatter).
- **API:** **build-time Astro endpoints**가 static **JSON** + **raw markdown** 파일 + `index.json` manifest를
  내보냄; collection 및 항목별/version별 라우트; CDN/static 호스트로의 **SSG** 출력.
- **Source of truth:** **CAW-04 자체 git repo 안의 markdown/MDX**(content-from-git), public-safe 재검사 이후 import
  adapter가 채움; 큰 asset은 path/CDN으로.
- **Search:** v1에서는 client-side / prebuilt 검색 index(Pagefind 스타일); 런타임 검색 endpoint는 보류.
- **Versioning:** frontmatter의 version + URL/endpoint 경로의 version; 게시된 version은 immutable static 파일.
- **Deploy:** static 호스팅 + CDN; 승인된 publish 이벤트로 rebuild 트리거. 빌드를 swappable한 `PublishSinkAdapter`로
  유지하여, 대체 sink(외부 docs 호스트, package registry, syndication — brief §8)가 콘텐츠 모델을 건드리지 않고 꽂힐 수 있게 한다.

### 이 스택을 선택한 이유 (요약)

1. **하나의 source, 두 표면(C3/C4):** Astro collections가 페이지와 JSON/`.md` endpoint에 공급된다 — 두 번째 store도,
   drift도, 내부 데이터로의 live query도 없다.
2. **구조적으로 public-safe(C2):** 배포된 아티팩트는 frozen되고 검증된 static 파일 집합이다; 요청 시점에 CAW-02/CAW-03이나
   어떤 기밀 store로 되돌아가는 경로가 없다.
3. **저렴 + 단순 + 낮은 attack surface(C1/C6):** 공개 경로에 app server/DB 런타임이 없다; 형제 제품들과 공유하는 것이 없다.
4. **버전 가능 + 감사 가능(C5):** git history + frontmatter + version별 URL/파일이 immutable하고 addressable한 version과
   provenance trail을 제공한다.

## markdown source가 웹 페이지와 API 응답이 되는 방법 (the pipeline)

```
CAW-02 / CAW-03 import (ContentSourceAdapter)
        │  (cross-boundary; public-safe RE-CHECK happens here)
        ▼
CAW-04 git repo: src/content/{tips,skills,workflows,playbooks}/<id>/<version>.md(x)
        │  frontmatter: id, title, version, boundary=public, source(provenance),
        │               inputs/outputs, preconditions, status
        ▼
Astro Content Collections  ── typed, schema-validated load (one in-memory corpus)
        ├──────────────► Pages:     src/pages/skills/[id]/[version].astro  → HTML (Starlight UI)
        ├──────────────► JSON API:  src/pages/api/v1/skills/[id]/[version].json.ts → GET → Response(JSON)
        ├──────────────► Raw MD:    src/pages/api/v1/skills/[id]/[version].md.ts   → GET → Response(markdown)
        └──────────────► Manifest:  src/pages/api/v1/index.json.ts → list (id,version,boundary,links)
        ▼
astro build (SSG)  → dist/ static files (HTML + .json + .md)  → CDN
```

핵심: JSON/markdown endpoint는 페이지가 사용하는 것과 **동일한** `getCollection()` 데이터를 import하므로, API는 렌더링된
코퍼스의 직렬화이다 — 이는 web/API 동등성(parity)과 **게시되고 public-safe한 항목만이** 어느 쪽에든 나타남을 보장한다. 빌드 시점
불변식이 모든 내보내는 항목에 대해 `boundary === "public"`을 단언하고 그렇지 않으면 빌드를 실패시켜야 한다(C2에 대한 방어).

## Open Questions

> 생성되면 `../08-research-plan/open-questions.md`로 미러링.

- TODO(open-question: content-negotiation) — 명시적 확장자 라우트(`.json`/`.md`)만 출시할 것인가, 아니면 edge/CDN
  `Accept` 헤더 규칙도 추가할 것인가? 이 결정은 어떤 런타임/edge 레이어가 도입되는지에 영향을 준다.
- TODO(open-question: search) — prebuilt client-side index(Pagefind 스타일)가 v1에 충분한가, 아니면 에이전트가
  서버 측 query/filter endpoint(SSR/런타임을 강제하는)를 필요로 하는가?
- TODO(open-question: api-versioning) — API 경로 prefix를 `/api/v1`로 고정; JSON 스키마가 바뀔 때 대 항목의 콘텐츠
  version이 바뀔 때(서로 다른 두 "version")의 deprecation 정책은 무엇인가?
- TODO(open-question: starlight-fit) — Starlight의 문서 중심 레이아웃/버저닝이 Tip/Skill/Workflow/Playbook 엔티티
  모델에 맞는가, 아니면 일부 엔티티에 대해 커스텀 Astro 페이지가 필요한가?
- TODO(open-question: rebuild-trigger) — `PublishSinkAdapter`가 approve/update/unpublish 시 rebuild+deploy를
  트리거하는 메커니즘(webhook 대 git push 시 CI 대 scheduled). 버저닝 ADR과 연결된다.
- TODO(open-question: openapi) — 에이전트를 위해 읽기 API의 OpenAPI/JSON-Schema 기술서를 게시할 것인가, 그리고 그것은
  어디에 두는가(static `/api/v1/openapi.json`)?
- TODO(open-question: unpublish) — unpublish/redact(§3 use case 4)가 "immutable static version"과 어떻게
  조정되는가 — manifest에서 제거 + tombstone 추가인가, 아니면 파일도 삭제하는가?

## 런북에 대한 함의

- **RB (scaffold web app):** Astro 5 + Starlight 초기화; content-model ADR의 엔티티 및 frontmatter(id, version,
  boundary, provenance, inputs/outputs, preconditions, status)에 맞는 content collection 스키마 정의.
- **RB (content-from-git source):** `src/content/<entity>/<id>/<version>.md(x)` 레이아웃 생성; public-safe 재검사
  이후 `ContentSourceAdapter`가 사용하는 import 안착 경로(landing path)를 문서화.
- **RB (API endpoints):** 항목별/version별 JSON, raw markdown, collection 목록, `index.json` manifest를 위한 빌드
  시점 endpoint를 구현하며, 모두 `getCollection()`을 통해 읽음; `boundary === "public"` 빌드 시점 단언을 추가.
- **RB (build & deploy as PublishSinkAdapter):** SSG 빌드 → adapter 인터페이스 뒤의 static 호스트/CDN; rebuild 트리거
  연결; 오래된 version이 addressable하게 유지되도록 보장.
- **RB (search):** prebuilt/client-side 검색 index 추가; 향후 런타임 검색 endpoint를 위한 문서화된 stub을 남김.
- **Safety check in CI:** non-public-boundary 항목이 web 또는 API로 내보내질 경우 빌드를 실패시킴.

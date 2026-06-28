# ADR-0006: Web stack — Astro + Starlight, content-from-git, SSG static output

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§4 surfaces, §6 data, §10 non-goals, §11 guardrails)
  - [../02-research/web-and-api-stack_ko.md](../02-research/web-and-api-stack_ko.md) (이 ADR이 승인하는 research)
  - [./ADR-0005-storage-and-versioning_ko.md](./ADR-0005-storage-and-versioning_ko.md) (md/MDX 우선 source + version identity)
  - [./ADR-0002-content-model_ko.md](./ADR-0002-content-model_ko.md) (collection schema = 엔티티)
  - [./ADR-0003-publishing-policy-and-public-safe-gate_ko.md](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (`boundary=public`만 emit 가능)
  - [./ADR-0004-import-and-ports_ko.md](./ADR-0004-import-and-ports_ko.md) (build가 `SiteAndApiSinkAdapter`)
  - [./ADR-0007-api-design_ko.md](./ADR-0007-api-design_ko.md) (동일 source에서 co-generate되는 JSON/markdown API)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

CAW-04의 주요 surface는 **공개 website**(browse/read)와 **REST API**(programmatic read)이며, 동일 콘텐츠를
**markdown 및/또는 JSON**으로 제공한다(brief §4, §6). 주요 제약:

- **read-only 공개 surface**; 공개 write API 없음, 사용자 계정 없음(brief §10) → prebuilt/static output을 선호; 공개
  경로에 per-request app server 없음.
- **public-safe만; 기밀 데이터를 결코 누출하지 않음**(brief §11, 가장 중요한 guardrail) → build는 검증된 corpus만
  emit해야 하며; **요청 시점에 내부/upstream 저장소에서 live pull 없음**.
- **git 내 markdown/MDX 우선 + API용 index**(brief §6, [ADR-0005](./ADR-0005-storage-and-versioning_ko.md))
  → content-from-git; website와 API가 **동일 파일**을 읽는다.
- **하나의 source → web + REST, 두 surface**(brief §4) → HTML 페이지와 JSON/markdown을 emit하는 단일 pipeline 필요.
- **불변, addressable 버전**(brief §5) → URL이 version을 담고; 옛 버전은 static 파일로 reachable하게 유지.
- **Ports & adapters, 공유 substrate 없음**(brief §1, §8) → website build = `PublishSinkAdapter`이며, 다른 제품의
  런타임을 새지 않게 하면서 교체 가능해야 한다.

## Options considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Astro 5 + Starlight** | Content-first SSG; typed **content collections**(schema-validated frontmatter); file 기반 **endpoints**가 동일 collection에서 build 시 `*.json`/`*.md`를 emit → 하나의 source에서 web + API, 두 번째 store 없음; Starlight이 docs UX 제공(search, nav, per-version routing); 최소 JS 전송 | 향후 무거운 interactivity 시 React app-ecosystem이 더 작음; Starlight 레이아웃은 의견이 강함 | **Chosen** — 동일 콘텐츠에서 API를 co-generate하는 유일한 후보(brief §4/§6을 직접 충족) |
| Next.js | 가장 유연; route handler = 실제 REST API; ISR | 가장 무거운 런타임; React app server를 끌어들임(read-only/no-extra-substrate와 긴장); 더 큰 attack surface | v1에는 과함; 풍부한 interactivity 필요 시에만 재검토 |
| Docusaurus / VitePress / Nextra | 검증된 docs UX; 내장 versioning/search | 네이티브 "동일 source에서 JSON API emit" 경로 없음; 별도 API를 덧붙임 → drift 위험 | web 전용으로는 가능; 통합된 web+API 이점 상실 |
| MkDocs / Hugo / Eleventy | 매우 빠른 build; 성숙함 | 동일 source에서의 API는 수작업 glue; 약한 typed content schema | 가능하나 glue가 더 많음 |

전달 모델: 런타임/SSR API보다 **prebuilt static JSON + raw markdown**(build-time endpoints) — static artifact가
public-safe guardrail의 가장 안전한 해석이다(내부 저장소로 되돌아가는 request-time 코드 경로 없음).

## Decision

**v1 web stack: Astro 5 + Starlight, content-from-git, SSG static output, `SiteAndApiSinkAdapter` 뒤에 배포.**

- **Web framework:** **Astro 5 with Starlight**. 콘텐츠는 typed frontmatter를 가진 **content collections**로 존재하며,
  그 schema가 [ADR-0002](./ADR-0002-content-model_ko.md) 엔티티 모델(id, kind, title, version, boundary,
  source/provenance, inputs/outputs, preconditions, status)이다. Starlight이 search, sidebar nav, per-version
  routing을 제공하므로 navigation을 직접 만들지 않는다.
- **Source of truth:** **CAW-04 전용 git repo 내 markdown/MDX**([ADR-0005](./ADR-0005-storage-and-versioning_ko.md)),
  public-safe 재검증 **이후** import adapter가 채운다([ADR-0004](./ADR-0004-import-and-ports_ko.md)). 대용량 asset은
  path/CDN. **headless/DB CMS 없음** — brief §6 및 no-shared-substrate 자세와 충돌한다.
- **Rendering strategy: SSG(전부 prebuild).** published 집합은 고정되고 검증된 static artifact다; 가장 작은 attack
  surface; 가장 저렴; 옛 버전이 static 파일로 유지된다. SSR/ISR은 v1에서 거부된다(curator 속도의 저빈도 publishing에서
  런타임 substrate + 누출 표면은 정당화되지 않음). rebuild는 approve/update/unpublish 시 `PublishSinkAdapter`가
  트리거한다.
- **하나의 source → 두 surface:** Astro의 file 기반 **endpoints**가 페이지가 사용하는 것과 **동일한** `getCollection()`
  데이터를 import하여, build 시점에 정확히 같은 entry를 JSON과 raw `.md`로 serialize한다(API 계약은
  [ADR-0007](./ADR-0007-api-design_ko.md)이 소유). 이는 하나의 store에서 web/API parity를 보장한다 — 두 번째 source of
  truth 없음, drift 없음.
- **public-safe by construction(brief §11 방어):** **build-time invariant가 emit되는 모든 항목(page, JSON,
  markdown)에 대해 `boundary === "public"`을 단언**하고, 그렇지 않으면 **build를 실패시킨다**. 이는 import 재검증
  ([ADR-0004](./ADR-0004-import-and-ports_ko.md))과 gate([ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md))
  뒤의 마지막 static backstop이다. **public projection**은 어떤 serialization 이전에 audit 전용 필드
  ([ADR-0002](./ADR-0002-content-model_ko.md))를 제거하며; test가 이들이 output에 결코 나타나지 않음을 단언한다.
- **Search:** v1 = prebuilt **client-side index**(Pagefind 스타일). 런타임 search endpoint는 문서화된 나중의
  adapter이며 v1이 아니다(런타임 substrate를 강제하게 됨).
- **URL에 surface되는 versioning**([ADR-0005](./ADR-0005-storage-and-versioning_ko.md)): artifact마다 **이동하는**
  canonical 페이지(latest를 렌더; `rel=canonical`이 자기 자신)와 **불변** `/{type}/{slug}/v/{semver}` 페이지(`rel=canonical`을
  이동 URL로 설정, `Cache-Control: public, max-age=31536000, immutable`로 served). redact된 version 주소와
  unpublish된 item 주소는 **410 Gone** tombstone 페이지를 렌더하며 sitemap/index에서 제외된다.
- **Deploy:** static hosting + CDN; rebuild+deploy는 승인된 publish 이벤트에 대한 `PublishSinkAdapter` 동작이다.
  이를 adapter 뒤에 두면 대체 sink(외부 docs host, package registry, syndication — brief §8)가 content model을 건드리지
  않고 plug in될 수 있다.

```
import (ADR-0004) → public-safe re-check → git repo (ADR-0005)
  src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
        │  Astro Content Collections (typed, one in-memory corpus)
        ├─► Pages:    src/pages/{type}/[slug]/[semver].astro       → HTML (Starlight)
        ├─► JSON API: src/pages/api/v1/{type}/[slug]/[semver].json.ts (ADR-0007)
        ├─► Raw MD:   src/pages/api/v1/{type}/[slug]/[semver].md.ts
        └─► Manifest: src/pages/api/v1/index.json.ts
        ▼  astro build (SSG) → dist/ (HTML + .json + .md) → CDN
        ▲  build-time assert: every emitted item boundary === "public", else fail
```

## Consequences

- **쉬움:** 하나의 콘텐츠 집합이 페이지 + JSON/`.md` endpoint를 공급한다 — web/API parity가 공짜; 내부 데이터를 live
  query하는 것이 없음; 저렴하고 cache 가능하며 낮은 attack surface; 형제 제품과 공유되는 것이 없음.
- **쉬움:** 옛 버전은 그냥 static 파일이다([ADR-0005](./ADR-0005-storage-and-versioning_ko.md)에 따라 불변,
  addressable).
- **어려움 / 비용:** 업데이트에 rebuild+deploy 필요(curator cadence에서는 괜찮음); static 경로에서는 filtering/pagination이
  precompute만 가능(search는 client-side로 시작); 수천 개의 대용량 미디어에는 asset-by-path 규율 필요.
- **Follow-on runbooks:** [ADR-0002](./ADR-0002-content-model_ko.md)에 맞는 collection schema로 Astro 5 + Starlight
  scaffold; [ADR-0004](./ADR-0004-import-and-ports_ko.md)가 사용하는 content-from-git 안착 경로;
  `boundary === "public"` build-time 단언 + public-projection test; `SiteAndApiSinkAdapter`로 wired된 build & deploy;
  미래 런타임 search endpoint를 위한 문서화된 stub을 가진 client-side search index.

## Open questions / revisit triggers

- TODO(open-question: Starlight의 doc 중심 레이아웃/versioning이 Tip/Skill/Workflow/Playbook 엔티티 모델에 맞는가,
  아니면 일부 엔티티는 custom Astro 페이지가 필요한가).
- TODO(open-question: `PublishSinkAdapter`의 rebuild+deploy 트리거 메커니즘 — webhook vs CI-on-git-push vs
  scheduled). [ADR-0005](./ADR-0005-storage-and-versioning_ko.md) publish 이벤트와 연결.
- TODO(open-question: unpublish/redact 시 cache/CDN purge 경계 — 공개 artifact가 edge-cache될 수 있음; time-to-purge
  보장은 무엇인가). [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md)/[ADR-0007](./ADR-0007-api-design_ko.md)와 공유.
- TODO(open-question: client-side Pagefind 스타일 index가 v1에 충분한가, 아니면 agent가 server-side query/filter
  endpoint를 필요로 하는가 — 런타임을 강제하게 됨).
- **Revisit trigger:** 풍부한 per-request interactivity나 dynamic query 요구사항은 SSG-vs-SSR을 재검토하게 만든다(Next.js
  / SSR adapter 방향) — 단, 동일한 `PublishSinkAdapter` seam 뒤에서만.

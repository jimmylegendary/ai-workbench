# Tech Stack — 컴포넌트, 언어, 버전 핀

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./data-flow.md](./data-flow_ko.md) (이 컴포넌트들이 실행하는 흐름)
  - [./repo-structure.md](./repo-structure_ko.md) (각 컴포넌트가 사는 곳)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack_ko.md) (Astro 5 + Starlight, SSG)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design_ko.md) (static JSON + raw md + manifest + MCP)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (git store, semver+digest)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md) (ports/adapters, 코어 내 재검사)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack_ko.md) (이 핀들을 비준하는 연구)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04가 어떤 구체적 컴포넌트, 언어, 런타임으로 빌드되는지를 명명하고, 버전 핀을 기록한다(아직 고정되지
않은 곳은 `TODO`로 — 발명하지 말 것). [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)과
[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)을 부연한다. 이들을 다시 결정하지 않으며, content model,
gate, API contract도 정의하지 않는다(각각 자체 ADR). 통합 속성: 모든 컴포넌트는 **공개 경로에서 build-time 전용**이다 —
내부 저장소에 도달할 수 있는 request-time 런타임이 없으므로, 스택은 **public-safe by
construction**이다.

## 한눈에 보는 스택

| Layer | Choice | Role | 공개 경로? |
|-------|--------|------|--------------|
| Language | TypeScript | 코어, adapters, endpoints, build config | build-time 전용 |
| Web framework | Astro 5 | SSG; content collections; file-based endpoints | build-time |
| Docs UI | Starlight | nav, search shell, per-version routing, layout | build-time |
| Content store | CAW-04 자체 git 리포 내 markdown/MDX + YAML frontmatter | 진실 공급원 | n/a (라이브로 서빙 안 함) |
| Audit store | sidecar 파일 + hash-chained `_events` ledger | provenance/audit, 절대 서빙 안 함 | never |
| API | Astro endpoints를 통한 static JSON + raw `.md` + `index.json`/manifest | 기계 read 표면 | static 파일 |
| Distribution | `SKILL.md` ⇆ `manifest.json`, `.skill` bundle | agent/loader 포맷 | static 파일 |
| MCP | 동일 corpus에 대한 resources view (`resources/list`/`read`) | MCP 호스트 | static/derived |
| Search | 클라이언트 측 prebuilt index (Pagefind-style) | 웹사이트 검색 | static index |
| Deploy | `SiteAndApiSinkAdapter` 뒤의 static 호스트 + CDN | publish | edge-cached static |
| 공개 경로상의 런타임 | **none** | — | — |

## 컴포넌트

### Language — TypeScript (코어 + adapters + endpoints)
hexagonal **코어**(normalize, public-safe 재검사, redaction, semver 할당, digest, public projection)와
두 포트(`ContentSourceAdapter`, `PublishSinkAdapter` — [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md))는
Astro content-collection 스키마 및 JSON envelope와 타입을 공유하기 위해 TypeScript다. 재검사는
**build가 import하는 코어 모듈**이며 절대 adapter 내부에 있지 않으므로, 어떤 source/sink 교체도 gate를 우회할 수 없다.

- Pin: TODO(open-question: Node.js LTS version) · TODO(open-question: TypeScript version) · package manager
  TODO(open-question: pnpm vs npm).

### Web framework — Astro 5
Content-first SSG. **Content collections**는 스키마가 곧
[ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) 엔티티 모델인, 타입이 있고 스키마 검증된 frontmatter를 준다.
File-based **endpoints**는 페이지가 쓰는 것과 동일한 `getCollection()` 데이터를 import해서 빌드 시점에 JSON / raw
`.md`로 직렬화한다 → 하나의 소스, 두 개의 표면([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)). 출력 모드는
**static (SSG)**다. v1의 공개 경로에는 SSR adapter가 없다.

- Pin: TODO(open-question: exact Astro 5.x minor) — 재현 가능한 빌드를 위해 `package.json` + lockfile에 핀.

### Docs UI — Starlight
사이드바 nav, search shell, per-version routing을 제공해 내비게이션을 손으로 만들지 않게 한다. 레이아웃은
의견이 강하다(opinionated). 일부 엔티티는 커스텀 Astro 페이지가 필요할 수 있다.

- Pin: TODO(open-question: Starlight version compatible with the chosen Astro 5.x).
- TODO(open-question: does Starlight's doc-centric layout/versioning fit Tip/Skill/Workflow/Playbook, or do some
  entities need custom Astro pages — [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)).

### Content store — CAW-04 자체 git 리포 내 markdown/MDX
진실 공급원이며, 코어 재검사 **후**에 `ContentSourceAdapter`가 작성한다
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). 레이아웃은
`src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`. 대용량 에셋은 path/CDN으로. Diff 가능한 PR
리뷰가 큐레이터 gate의 일부다. **headless/DB CMS 없음** — 그것은 공유 기반 런타임과 leak 표면을 더할 것이다.

- Versioning: **semver**(공개 주소 지정 identity) + **content-digest**(정규 직렬화에 대한 `sha256:`;
  불변성 증명 + 강한 `ETag`). `(slug, semver)`는 영원히 동결되며 절대 재사용되지 않는다.
- Pin: TODO(open-question: canonical serialization spec + digest algorithm/prefix — `sha256:` vs multihash).

### Audit store — sidecar + hash-chained ledger
Audit 전용 provenance(`origin_ref`, `origin_version`, redaction 내부)는 **파일 옆의 sidecar**에 살며,
gate 검사를 위해 로드되지만 **모든 서빙 출력에서 제외**된다(B3 public projection). hash-chained append-only
`_events` ledger([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md))가 publish
기록이다. git history는 중복된 두 번째 증인이다. 한 테스트가 sidecar 필드가 `dist/`에 절대 나타나지 않음을 단언한다.

### API — static JSON + raw markdown + manifest (Astro endpoints)
읽기 전용, 동일한 빌드가 미리 만든다([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)). 하나의 정규 리소스,
여러 표현:

```
GET /api/v1/{type}                          list/index (cursor pagination, whitelisted filters)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          all versions (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/manifest.json     distribution manifest (machine form)
GET /api/v1/index.json                      manifest of all items+versions+boundary+links (no bodies)
```
`{type} ∈ tips | skills | workflows | playbooks`. 표현: `text/html`(페이지), `text/markdown`(body + 작은
YAML 헤더), `application/json`(envelope). `Accept` 헤더가 정규다. `.md`/`.json` suffix 별칭은
edge-cacheable한 탈출구다. Runtime search + 완전한 `Accept` 협상은 **연기됨**(런타임을 강제할 것이므로).

### Distribution — SKILL.md / manifest.json / .skill bundle
하나의 manifest의 두 가지 호환 인코딩: **`SKILL.md`**(open Agent Skills 형태 — 필수 `name`,
`description`; `name` = slug — 더하여 추가적 CAW-04 governance 필드 `version`, `boundary`, `provenance`,
`license`) 와 **`manifest.json`**(정규 기계 형태). 핀된 버전은 `slug@semver`로 키가 매겨진 **`.skill` bundle**
(`SKILL.md`, `manifest.json`, `references/`, `examples/`, `assets/`)로 다운로드된다.

- Pin: TODO(open-question: adopt the `SKILL.md` spec verbatim vs a CAW-04 superset profile — drift risk).
- TODO(open-question: `references/`/`assets/` size limits + secret/virus scan before bundling).

### MCP — resources view
카탈로그를 MCP **resources** view로(`resources/list` + `resources/read`): `uri = caw04://{type}/{slug}@{semver}`,
`mimeType = text/markdown | application/json`. 이것은 동일한 정규 리소스에 대한 **하나의 `PublishSinkAdapter`**다 —
또 하나의 projection일 뿐, 공유 기반 없음.

- Pin: TODO(open-question: MCP SDK/protocol version; MCP Registry listing in v1 vs a later stub).

### Search — 클라이언트 측 prebuilt index
v1 = `dist/`에 빌드된 Pagefind-style 클라이언트 측 index. 서버 없음. 런타임 search endpoint는 문서화된 나중의
adapter이지 v1이 아니다.

- Pin: TODO(open-question: Pagefind version, or Starlight's bundled search).

### Deploy / CDN — sink adapter 뒤의 static 호스트
SSG `dist/` → static 호스트 + CDN. rebuild+deploy는 승인된 publish 이벤트에 대한 `SiteAndApiSinkAdapter`
액션이다. 핀된 `/v/{semver}` 파일은 `Cache-Control: public, max-age=31536000, immutable`로 서빙된다. moving URL +
`index.json` + manifests는 publish/unpublish/redact 시 purge된다.

- Pin: TODO(open-question: static host + CDN provider) · TODO(open-question: rebuild trigger — webhook vs
  CI-on-git-push vs scheduled) · TODO(open-question: CDN handling of `Vary: Accept` — suffix aliases as cache-safe path).

## 버전 핀 요약 (첫 빌드 때 채울 것; 발명 금지)

| Component | Pin |
|-----------|-----|
| Node.js | TODO(open-question) |
| TypeScript | TODO(open-question) |
| Package manager | TODO(open-question: pnpm vs npm) |
| Astro | TODO(open-question: 5.x minor) |
| Starlight | TODO(open-question) |
| Search (Pagefind/Starlight) | TODO(open-question) |
| MCP SDK | TODO(open-question) |
| Static host + CDN | TODO(open-question) |
| Digest algorithm | TODO(open-question: sha256 vs multihash) |

## 왜 이 스택이 public-safe by construction인가

1. **공개 런타임 없음** — 모든 컴포넌트가 빌드 시점에 실행된다. 공개 요청은 오직 static 파일에만 닿는다(CAW-02/CAW-03
   이나 어떤 confidential 저장소로 되돌아가는 경로 없음).
2. **하나의 소스, 모든 표면** — 페이지, JSON, raw md, manifest, MCP가 모두 동일한 `getCollection()` corpus를
   직렬화하므로, gate 밖으로 drift할 두 번째 저장소가 없다.
3. **세 개의 backstop** — 코어 재검사(B1) → build invariant `boundary==="public"`(B2) → public projection이
   sidecar 필드를 strip(B3); [./data-flow.md](./data-flow_ko.md) 참조.
4. **공유 없음** — 코어/adapters/store는 CAW-04 자체의 것. 싱크(web, API, MCP, 향후)는 하나의 포트 뒤에서
   교체 가능하다.

## Open Questions

> `../08-research-plan/open-questions.md`로 미러링할 것. (위의 모든 버전 핀은 첫 빌드까지 열려 있다.)

- TODO(open-question: client-side index sufficient for v1 vs server-side query/filter forcing a runtime).
- TODO(open-question: publish a static `/api/v1/openapi.json` description of the read API for agents).
- TODO(open-question: `published_at`/timezone policy — do not invent).

## 런북에 대한 함의

- **RB (scaffold):** [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)에 맞는 collection 스키마로 Astro 5 +
  Starlight 초기화; lockfile을 commit하고 핀 테이블을 채운다.
- **RB (core + ports):** 재검사를 갖춘 TypeScript hexagonal 코어; `ContentSourceAdapter` + `PublishSinkAdapter`
  인터페이스와 문서화된 스텁을 가진 설정 기반 레지스트리.
- **RB (endpoints):** `getCollection()`을 통한 build-time JSON / raw md / `index.json` / manifest endpoints +
  `boundary === "public"` 단언.
- **RB (distribution + MCP):** `SKILL.md`/`manifest.json` 스키마 + `.skill` 번들링 + MCP resources adapter.
- **RB (deploy):** SSG 빌드 → sink 뒤의 static 호스트/CDN; rebuild 트리거와 cache 규칙 배선.

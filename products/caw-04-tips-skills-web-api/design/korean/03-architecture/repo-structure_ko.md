# Repo Structure — 제품 레이아웃

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./data-flow_ko.md](./data-flow_ko.md) (이 디렉터리들을 통해 흐르는 것)
  - [./tech-stack_ko.md](./tech-stack_ko.md) (여기에 위치하는 컴포넌트)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (content layout, sidecar, ledger)
  - [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md) (Astro pages + endpoints)
  - [../01-decisions/ADR-0007-api-design_ko.md](../01-decisions/ADR-0007-api-design_ko.md) (endpoint routes, manifest, bundle)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md) (core/ports/adapters)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04 제품 repo의 디스크상 레이아웃을 확정한다: git content store
(`src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>`), audit sidecar 디렉터리, hexagonal
`core/ports/adapters`, Astro pages, 빌드 타임 API endpoint, 그리고 build artifact. 이 문서는
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)/[ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)를
구체화하며, 그것들을 재결정하지 **않는다**. **제공되는(served) 콘텐츠**와 **audit sidecar**의 분리는
public-safe-by-construction 속성의 구조적 표현이다 — audit-only 필드는 제공 트리(served tree) 바깥에 물리적으로
위치한다.

## 최상위 트리

```
caw-04-tips-skills-web-api/                  (product repo = source of truth, ADR-0005)
├─ src/
│  ├─ content/                               # SERVED CORPUS — vetted, public-safe, frozen
│  │  ├─ tips/<slug>/<semver>.md(x)
│  │  ├─ skills/<slug>/<semver>.md(x)
│  │  ├─ workflows/<slug>/<semver>.md(x)
│  │  ├─ playbooks/<slug>/<semver>.md(x)
│  │  └─ config.ts                           # Astro content collections schema = ADR-0002 entities
│  │
│  ├─ pages/                                 # Astro routes (ADR-0006)
│  │  ├─ index.astro
│  │  ├─ {tips,skills,workflows,playbooks}/
│  │  │  └─ [slug]/
│  │  │     ├─ index.astro                   # moving canonical page (renders latest)
│  │  │     └─ v/[semver].astro              # immutable pinned page (long-TTL)
│  │  └─ api/v1/                             # BUILD-TIME API ENDPOINTS (ADR-0007)
│  │     ├─ index.json.ts                    # manifest: all items+versions+boundary+links (no bodies)
│  │     ├─ [type].json.ts                   # list/index per type (cursor, whitelisted filters)
│  │     └─ [type]/[slug]/
│  │        ├─ index.json.ts                 # latest (moving)
│  │        ├─ index.md.ts                   # latest raw markdown (body + yaml header)
│  │        ├─ versions.json.ts              # all versions
│  │        ├─ versions/[semver].json.ts     # immutable version
│  │        ├─ versions/[semver].md.ts       # immutable raw markdown
│  │        └─ manifest.json.ts              # distribution manifest
│  │
│  ├─ core/                                  # HEXAGONAL CORE (TS) — no I/O; gate lives here (ADR-0004)
│  │  ├─ model/                              # entity types + public-projection types (ADR-0002)
│  │  ├─ recheck/                            # PUBLIC-SAFE RE-CHECK (deny-by-default) — CORE, not adapter
│  │  ├─ redact/                             # redaction transforms
│  │  ├─ version/                            # semver assignment + content-digest (ADR-0005)
│  │  ├─ projection/                         # split public vs sidecar; strip audit-only fields (B3)
│  │  └─ gate/                               # approval state machine + ledger writer (ADR-0003)
│  │
│  ├─ ports/                                 # PORT INTERFACES (ADR-0004)
│  │  ├─ ContentSourceAdapter.ts
│  │  └─ PublishSinkAdapter.ts
│  │
│  ├─ adapters/
│  │  ├─ sources/                            # ContentSourceAdapter impls
│  │  │  ├─ caw02-knowledge/                 # v1
│  │  │  ├─ caw03-skills-registry/           # v1
│  │  │  ├─ stub-internal-wiki/              # documented stub
│  │  │  └─ stub-curated-bundle/             # documented stub
│  │  ├─ sinks/                              # PublishSinkAdapter impls
│  │  │  ├─ site-and-api/                    # v1 = the Astro build + deploy
│  │  │  ├─ mcp-resources/                   # v1 = MCP resources view (projection)
│  │  │  ├─ stub-external-docs-host/         # documented stub
│  │  │  ├─ stub-package-registry/           # documented stub
│  │  │  └─ stub-syndication/                # documented stub
│  │  └─ registry.ts                         # config-driven adapter registry
│  │
│  ├─ lib/                                   # shared helpers (digest, canonical-serialize, manifest build)
│  └─ components/                            # Astro/Starlight UI components (incl. 410 tombstone)
│
├─ _audit/                                   # AUDIT SIDECAR — NEVER served, NEVER in dist/ (ADR-0005/0003)
│  ├─ sidecar/
│  │  └─ {type}/<slug>/<semver>.audit.json   # origin_ref, origin_version, redaction internals
│  └─ _events.log                            # hash-chained append-only publish ledger (ADR-0003)
│
├─ public/                                   # static passthrough (llms.txt, robots.txt, favicon)
├─ dist/                                     # BUILD ARTIFACT (gitignored) → deployed by the sink
│  ├─ {type}/<slug>/...                      # HTML pages (moving + /v/<semver>)
│  ├─ api/v1/...                             # static .json + .md + index.json + manifests
│  ├─ skills/.../<slug>@<semver>.skill/      # downloadable bundles (ADR-0007)
│  └─ pagefind/                              # client-side search index
│
├─ tests/                                    # incl. test: audit-only fields NEVER appear in dist (B3)
├─ astro.config.mjs
├─ package.json + lockfile                   # version pins (see tech-stack.md)
└─ tsconfig.json
```

## 각 ADR 개념이 안착하는 위치

| Concept | Location | ADR |
|---------|----------|-----|
| Served corpus (frozen, vetted) | `src/content/{type}/<slug>/<semver>.md(x)` | [0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) |
| Collection schema = entity model | `src/content/config.ts` | [0002](../01-decisions/ADR-0002-content-model_ko.md)/[0006](../01-decisions/ADR-0006-web-stack_ko.md) |
| Audit-only sidecar (never served) | `_audit/sidecar/{type}/<slug>/<semver>.audit.json` | [0002](../01-decisions/ADR-0002-content-model_ko.md)/[0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) |
| Hash-chained publish ledger | `_audit/_events.log` | [0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| Public-safe re-check (deny-by-default) | `src/core/recheck/` | [0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| Public projection / strip sidecar | `src/core/projection/` | [0002](../01-decisions/ADR-0002-content-model_ko.md)/[0006](../01-decisions/ADR-0006-web-stack_ko.md) |
| semver + content-digest | `src/core/version/` + `src/lib/` | [0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) |
| Ports | `src/ports/` | [0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| v1 + stub adapters | `src/adapters/{sources,sinks}/` | [0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| HTML pages (moving + pinned) | `src/pages/{type}/[slug]/` | [0006](../01-decisions/ADR-0006-web-stack_ko.md) |
| API endpoints (JSON/md/manifest) | `src/pages/api/v1/` | [0007](../01-decisions/ADR-0007-api-design_ko.md) |
| Build artifact (deployed) | `dist/` (gitignored) | [0006](../01-decisions/ADR-0006-web-stack_ko.md) |

## 레이아웃 규칙 (핵심을 떠받침)

1. **제공(served) 트리와 audit 트리는 물리적으로 분리되어 있다.** `src/content/`는 제공되고; `_audit/`는 어떤
   endpoint에서도 **결코** 읽히지 않으며 `dist/`로 **결코** 복사되지 않는다. 테스트가 `dist/`에 어떤
   `_audit`/sidecar 필드도 나타나지 않음을 assert한다(B3 — [./data-flow_ko.md](./data-flow_ko.md) 참조). 이것이
   구조적 public-safe 보장이다.
2. **`<semver>`는 파일/디렉터리 이름이며, 영원히 동결된다.** `src/content/{type}/<slug>/<semver>.md(x)`가 일단
   게시되면 결코 편집되지 않으며 `(slug, semver)` 쌍은 결코 재사용되지 않는다 — 편집은 **새로운** `<semver>` 파일이다
   ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
3. **gate는 adapter가 아니라 `src/core/`에 위치한다.** Adapter는 import/export boundary를 가로질러 byte를 옮길
   뿐이다; deny-by-default re-check와 approval state machine은 core이므로, source/sink를 교체해도 이를 우회할 수 없다.
4. **`dist/`는 파생물이며 gitignore된다.** source of truth는 `src/content/` + `_audit/` + git history이다; `dist/`는
   `astro build`로 재생성 가능하며 `SiteAndApiSinkAdapter`가 소유한다.
5. **Stub은 TODO 주석이 아니라, 문서화된 인터페이스를 지닌 실제 디렉터리이다** — 미래의 source/sink가 재설계 없이
   끼워진다([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).

## 명명 규칙

| Thing | Convention | Example |
|-------|-----------|---------|
| Type dir | plural, fixed set | `skills/` |
| Slug | kebab-case, stable, URL segment | `triage-incident` |
| Version file | semver `.md`/`.mdx` | `2.1.0.md` |
| Sidecar | `_audit/sidecar/{type}/<slug>/` 아래의 `<semver>.audit.json` | `2.1.0.audit.json` |
| Bundle | `<slug>@<semver>.skill/` | `triage-incident@2.1.0.skill/` |
| MCP uri | `caw04://{type}/{slug}@{semver}` | `caw04://skills/triage-incident@2.1.0` |

## 미해결 질문

> `../08-research-plan/open-questions_ko.md`로 미러링할 것.

- TODO(open-question: slug가 변경되는(rename) 경우가 있는지 — 옛 slug에서 301 vs 새 항목 + provenance link).
- TODO(open-question: Starlight 레이아웃 바깥에 커스텀 Astro 페이지가 필요한 엔티티가 있는지 — [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)).
- TODO(open-question: 대용량 asset 배치 — path/CDN로 `assets/` vs in-repo; 번들링 이전 크기 제한).
- TODO(open-question: hash된 digest envelope 내부 vs 외부의 정확한 sidecar 필드 집합 — [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

## runbook에 대한 함의

- **RB (scaffold):** 위 트리를 생성하라; `src/content/config.ts`를 entity schema에 배선하라; `dist/`를 gitignore하라.
- **RB (content-from-git landing):** import adapter는 core re-check 이후
  `src/content/{type}/<slug>/<semver>.md(x)` + `_audit/sidecar/...` 레코드를 기록한다.
- **RB (endpoints):** `getCollection()`에서 `src/pages/api/v1/**`를 구현하라; B3 served-vs-audit 테스트를 추가하라.
- **RB (adapters):** v1 sources/sinks + 문서화된 stub 디렉터리 + `registry.ts`를 scaffold하라.
</content>

# Website — 공개 탐색/읽기 표면 (Astro + Starlight)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./rest-api_ko.md](./rest-api_ko.md) (동일 source에서 함께 생성되는 API)
  - [./preview-admin_ko.md](./preview-admin_ko.md) (콘텐츠를 이 사이트로 승격시키는 내부 큐레이터 표면)
  - [../01-decisions/ADR-0001-product-surface-and-delivery_ko.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
  - [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

**공개 웹사이트** 표면을 설명한다: 게시된 Tips, Skills, Workflows, Playbooks에 대한 사람의 탐색/읽기 경험 —
내비게이션, 아티팩트별 페이지, 버전 라우팅, tombstone, 그리고 (유보된) 검색. [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)
(Astro 5 + Starlight, SSG static)과 [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)(세 가지 표면)을
구체화한다. API 리소스 스킴([rest-api_ko.md](./rest-api_ko.md)), content model([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)),
gate([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)), 또는 storage/versioning
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md))을 정의하지는 않는다.

## 구조적으로(by construction) public-safe (load-bearing 속성)

웹사이트는 **어떤 내부/상류 저장소로도 향하는 요청 시점(request-time) 경로가 없는** **동결되고 검증된 정적 아티팩트**다
([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)). 모든 페이지는 빌드 시점에 CAW-04 자체 git 저장소로부터 렌더되며,
이 저장소는 import 재검사([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md))와 publish gate
([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md))를 이미 통과한 콘텐츠만 담고 있다.
두 가지 backstop이 공개 표면을 지킨다:

1. **빌드 시점 불변(invariant)** — 방출되는 모든 페이지는 `boundary === "public"`을 assert한다; 그렇지 않으면 빌드가 **실패**한다.
2. **Public projection** — audit 전용 provenance 필드(`origin_ref`/`origin_version`, [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)에
   따른 sidecar)는 렌더 전에 제거된다; 테스트가 이들이 어떤 HTML 출력에도 절대 나타나지 않음을 assert한다.

로그인 없음, 댓글 상자 없음, 공개 쓰기 경로 없음(brief §10). 사이트는 구조적으로 읽기 전용이다.

## 정보 아키텍처(Information architecture)

최상위 내비게이션은 게시 가능한 엔티티 타입당 하나의 섹션, 그리고 지원 페이지들이다.

| Nav section | Route prefix | 내용 |
|---|---|---|
| Tips | `/tips/` | 원자적, 단일 아이디어 실천 노트 |
| Skills | `/skills/` | inputs/outputs, preconditions, examples를 갖춘 재사용 단위 |
| Workflows | `/workflows/` | pin된 skill의 순서 있는 구성 |
| Playbooks | `/playbooks/` | 시나리오를 위한 큐레이션된 번들(`contains[]`) |
| About / Safety | `/about/`, `/safety/` | "public-safe" + "validated"의 의미; provenance 정책 |
| API docs | `/api-docs/` | [rest-api_ko.md](./rest-api_ko.md)에 대한 사람 판독 가능한 가이드; `index.json`, `SKILL.md`, MCP로의 링크 |

`Example`, `Source`, `SafetyBoundary`, `Version`은 최상위 nav가 **아니다**. Examples는 부모 아티팩트 페이지에 인라인으로
렌더된다; Source/SafetyBoundary는 메타데이터 블록으로 표면화된다; Version은 버전 선택기(아래)를 구동한다.

### 사이드바 (Starlight)

Starlight가 섹션별로 자동 구축되는 좌측 사이드바를 공급한다. 한 타입 내에서 list 항목은 `tag`로 그룹화되고 `title`로
정렬된다. 각 항목은 title + 한 줄 `summary`를 보여준다. Deprecated이지만 여전히 게시된 항목은 badge를 받는다;
unpublished/redacted 항목은 부재한다(사이드바, sitemap, 검색 index에서 제외).

## 아티팩트 페이지 구조(anatomy)

타입당 단일 Astro/Starlight 페이지 템플릿이 하나의 아티팩트를 그 **latest** 게시 버전으로 렌더한다.

```
┌─ Title (h1)  + type badge + version pill (semver) + status badge ─────────┐
│ Summary (one paragraph)                                                    │
│ ── Metadata card ──────────────────────────────────────────────────────  │
│   Inputs · Outputs · Preconditions   (Skills/Workflows)                    │
│   Provenance: source_product, validated ✓, public_safe_recheck: passed    │
│   Boundary: public      License: TODO(open-question: license field)        │
│   Version: <semver>  · digest: <short>  · published_at: <ts>              │
│ ── Body (rendered markdown/MDX) ───────────────────────────────────────── │
│   Steps[] (Workflows, each linking the pinned skill id@version)            │
│   contains[] (Playbooks, each linking the member artifact)                 │
│ ── Examples (inline) ──────────────────────────────────────────────────── │
│ ── "Get this" panel: links to .md / .json / manifest.json / .skill ─────── │
│ ── Version history (selector → immutable version pages) ──────────────────│
└───────────────────────────────────────────────────────────────────────── ┘
```

"Get this" 패널은 [rest-api_ko.md](./rest-api_ko.md)가 제공하는 동일 아티팩트의 다른 표현들을 상호 링크한다:
`Accept`-negotiated 콘텐츠와 `.md`/`.json` suffix alias, `manifest.json`, 그리고 `.skill` 번들. 이것이 사람이
agent-facing 형식을 발견하는 방법이다.

## 버전 라우팅

[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) identity 모델을 URL에 직접 표면화한다.

| URL | 의미 | Caching | `rel=canonical` |
|---|---|---|---|
| `/{type}/{slug}/` | **moving** — latest 게시 버전을 렌더 | revalidate / short | self |
| `/{type}/{slug}/v/{semver}/` | **immutable** — 동결된 하나의 버전 | `public, max-age=31536000, immutable` | → moving URL |
| `/{type}/{slug}/versions/` | 버전 index (모든 semver + status 목록) | short | self |

- 게시된 `(slug, semver)`는 **영원히 동결**된다; 수정은 새 버전 페이지이지 제자리(in-place) 변경이 아니다.
- moving 페이지의 버전 선택기는 모든 버전을 나열한다; 하나를 선택하면 그 immutable 페이지로 이동한다.
- 오래된 immutable 페이지에 도착한 독자는 비차단(non-blocking) 배너를 본다: "더 새로운 버전이 존재함 → latest".

### Tombstone (unpublish / redact)

아티팩트 또는 특정 버전이 unpublish 또는 redact될 때([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md),
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)) 해당 주소는 404도 아니고 옛 콘텐츠도 아닌
**HTTP 410 Gone tombstone 페이지**를 렌더한다:

```
410 Gone — this artifact (or version) was withdrawn.
  reason: <deprecated | boundary-changed | redacted>     (no confidential detail)
  superseded_by: /{type}/{slug}/v/{newer-semver}/         (optional)
```

Tombstone된 주소는 사이드바, sitemap, 검색 index에서 제외된다. 정적 호스팅은 빌드가 방출하는 라우트별 상태 매핑을 통해
410을 제공한다. TODO(open-question: 이미 edge-cache된 페이지에 대한 CDN/edge purge time-to-purge 한계 —
[ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)/[rest-api_ko.md](./rest-api_ko.md)과 공유).

## 검색 (client-side index로 유보)

v1 검색 = 동일한 검증된 코퍼스 위에 빌드 시점에 생성되는 **사전 빌드된 client-side index**(Pagefind 스타일)
([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)). `boundary=public`으로 렌더된 페이지만 색인하므로, 페이지가 이미
보여주지 않는 것은 무엇도 누출할 수 없다. 어떤 쿼리도 서버에 도달하지 않는다.

| Aspect | v1 (지금) | 유보(Deferred) |
|---|---|---|
| Index | 정적, `dist/`에 빌드됨, 브라우저 내 로드 | 서버 측 쿼리 엔드포인트 |
| Scope | 게시된 latest 페이지 (+ 선택적으로 버전 페이지) | cross-version / faceted 서버 검색 |
| Privacy | 네트워크 쿼리 없음; 로그 없음 | n/a |

런타임/서버 검색 엔드포인트는 문서화된 후속 `PublishSinkAdapter`-인접 기능이다 — 그것은 런타임 substrate를 강제하므로
v1에서 명시적으로 제외된다. TODO(open-question: 카탈로그 규모에서 client-side index로 충분한지, 아니면 agent가 서버 측
필터를 필요로 하는지 — [rest-api_ko.md](./rest-api_ko.md)과 공유).

## Cross-surface parity

웹사이트와 REST API는 **하나의 source의 두 projection**이다(`getCollection()` 데이터,
[ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)). 모든 HTML 페이지는 [rest-api_ko.md](./rest-api_ko.md)에 설명된
1:1 markdown 및 JSON 대응물을 가진다; provenance와 public-safe boundary는 셋 모두와 함께 이동한다. 사이트는 API에
없는(또는 그 반대) 콘텐츠를 절대 보유하지 않는다.

## 미해결 질문(Open Questions)

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조. 주요 항목:
- TODO(open-question: Starlight의 doc 중심 레이아웃이 네 엔티티 타입 모두에 맞는지, 아니면 일부는 커스텀 Astro 페이지가 필요한지 — [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)).
- TODO(open-question: 공개 `license` 필드 렌더링 + 기본 SPDX id — [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).
- TODO(open-question: `published_at` timestamp + timezone 표시 정책 — 임의로 만들지 말 것).
- TODO(open-question: client-side 검색의 충분성 대 서버 검색).
- TODO(open-question: unpublish/redact 시 edge-cache purge 한계).

## 런북(runbook)에 대한 함의

- [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) collection 스키마에 바인딩된 엔티티 타입당 하나의 페이지 템플릿으로 Astro 5 + Starlight를 scaffold한다.
- moving 대 immutable 버전 라우트 + 버전 선택기 + `rel=canonical`/`Cache-Control` 규칙을 구현한다.
- 빌드에서 410 tombstone 페이지를 방출한다; tombstone된 항목과 비-`public` 항목을 사이드바/sitemap/search에서 제외한다.
- 빌드 시점 `boundary === "public"` assertion과 public-projection strip 테스트를 CI에 배선한다.
- 게시된 페이지에 대해서만 Pagefind 스타일 client-side index를 빌드한다; 서버 검색을 위한 문서화된 stub를 남긴다.

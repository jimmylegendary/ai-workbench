# Skills 배포 및 API 리소스 (Skills Distribution & API Resources)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **(a) REST API 리소스 모델**과 **(b) 게시되는 Skill/Workflow를 위한 전송 형식(on-the-wire distribution format)**을
결정하여, **사람**(웹사이트)과 **에이전트**(프로그래밍 방식 fetch + MCP 디스커버리)가 모두 CAW-04 콘텐츠를 재사용할 수 있도록 한다.
리소스 형태, 페이지네이션, 필터링, 콘텐츠 협상(content negotiation, markdown 대 JSON), 그리고 skill/workflow manifest 엔벨로프를
다룬다. 이 문서는 저장/버저닝 내부 구조(별도 ADR), public-safe publish gate(load-bearing ADR), 웹 UI 프레임워크를
결정하지 **않는다**. CAW-04는 CAW-02(별도 제품)와 CAW-03 / skills registry(별도 제품)로부터 가져온, 검증되고 public-safe한
아티팩트만을 *게시(publish)*할 뿐이다. 콘텐츠를 작성(author)하지 않으며, 공개 경계(public boundary) 위에 있는 어떤 것도 절대 제공하지 않는다.

---

## 1. "배포(distribution)"가 충족해야 하는 것

세 부류의 소비자가 동일한 아티팩트를 가져오며, 각각 그것의 서로 다른 표현(representation)을 필요로 한다:

| Consumer | Wants | Native format | Discovery path |
|---|---|---|---|
| Human reader (browser) | rendered, navigable page | HTML | website nav / search |
| AI agent (HTTP client) | low-token, parseable body | Markdown or JSON | REST list + filter |
| AI agent (MCP host) | machine-discoverable catalog | JSON resources | MCP `resources/list` |

설계 규칙: **하나의 canonical 리소스, 여러 표현(representations).** 게시된 아티팩트는 단일한 안정적 identity와 version을 갖는다.
HTML, Markdown, JSON은 콘텐츠 협상으로 선택되는 그것의 *projection*일 뿐이며, 결코 별도의 source of truth가 아니다. 이렇게 하면
provenance + safety boundary가 모든 표현에 함께 붙어 다닌다.

---

## 2. API 리소스 모델

리소스는 brief의 도메인 엔티티와 1:1로 대응한다. 공개 표면(public surface)에서는 모두 **read-only**이다(publish는
curator만 가능하며, 별도 경로(out of band)로 이루어진다).

| Resource | Path | Notes |
|---|---|---|
| Tip | `/v1/tips/{id}` | smallest unit; single insight + source |
| Skill | `/v1/skills/{id}` | reusable operating pattern w/ I/O + preconditions |
| Workflow | `/v1/workflows/{id}` | ordered multi-step composition of skills |
| Playbook | `/v1/playbooks/{id}` | scenario-level bundle of workflows/tips |
| Example | `/v1/skills/{id}/examples` | sub-resource; concrete usage instances |
| Version | `/v1/skills/{id}/versions/{semver}` | immutable, addressable snapshot |
| Source | embedded `provenance` block | not a public top-level resource (internal ref) |
| SafetyBoundary | embedded `boundary` field | always `public` on this surface; value asserted, not negotiable |

설계 결정:
- **Versioned addressing(버전 기반 주소 지정).** `/{id}`는 가장 최근에 게시된 version으로 해석되고, `/{id}/versions/{semver}`는
  immutable pin이다. 둘 다 본문에 `version`을 담고 `ETag`를 갖는다. 이는 brief §5(게시된 version은 immutable + addressable)를
  충족하며, 에이전트가 검증된 skill을 pin할 수 있게 한다.
- **`Source`는 결코 독립 리소스가 아니다.** Provenance는 가져올 수 있는 문서가 아니라 *reference*(예: 내부 source id +
  검증 상태)로 노출된다. 내부 source를 게시하면 기밀 컨텍스트가 유출될 수 있기 때문이다(brief §11). public-safe하게 재검사된
  projection만 제공된다.
- **Flat catalog + typed collections(평면 카탈로그 + 타입별 컬렉션).** `/v1/skills`, `/v1/workflows` 등은 각각 페이지네이션되는
  컬렉션이며, 타입을 가로지르는 `/v1/search`는 웹사이트 전역 검색을 위한 경량 reference를 반환한다.

### 2.1 Canonical JSON 형태 (skill 예시)
```jsonc
{
  "id": "skill.pr-triage",
  "type": "skill",
  "version": "2.1.0",
  "title": "Triage an incoming pull request",
  "summary": "One-line, public-safe description.",
  "boundary": "public",            // asserted after public-safe re-check
  "tags": ["code-review", "agents"],
  "inputs":  [{ "name": "pr_url", "type": "string", "required": true }],
  "outputs": [{ "name": "triage_report", "type": "markdown" }],
  "preconditions": ["read access to the repo"],
  "body": { "format": "markdown", "ref": "/v1/skills/skill.pr-triage?format=md" },
  "provenance": {                  // reference only, no internal payload
    "source_product": "CAW-03",
    "source_ref": "registry://skills/pr-triage@validated",
    "validated": true,
    "public_safe_recheck": "passed"
  },
  "links": {
    "self": "/v1/skills/skill.pr-triage",
    "pinned": "/v1/skills/skill.pr-triage/versions/2.1.0",
    "html": "https://.../skills/pr-triage",
    "manifest": "/v1/skills/skill.pr-triage/manifest.json"
  },
  "published_at": "TODO(open-question: timestamp policy)"
}
```
`body`는 list/JSON 뷰에서는 **by reference**로 전달되고(목록을 가볍게 유지), 아티팩트 자체를 markdown으로 가져올 때는
**inline**으로 포함된다. Workflow는 순서가 있는 `steps[]` 배열을 추가하며(각 step은 skill `id` + `version`을 참조한다),
Playbook은 `contains[]`를 추가한다.

### 2.2 페이지네이션

| Option | Pros | Cons | Fit for CAW-04 |
|---|---|---|---|
| Offset/limit (`?page=&size=`) | trivial, jump-to-page, total counts | drifts on insert, slow deep scans | OK — catalog is small + curated |
| Cursor/keyset (`?cursor=`) | stable under writes, scales deep | opaque, no random page jump | future-proof; matches agent loops |

**Decision:** 내부 store와 무관하게 유지할 수 있도록, 안정적인 엔벨로프를 갖춘 cursor 기반을 계약(contract)으로 채택한다.
큐레이션된 카탈로그는 작지만, 에이전트는 전체 목록을 순회하며 새 version이 게시되어도 cursor는 유효하게 유지된다.
```jsonc
{ "data": [ /* resource refs */ ],
  "pagination": { "next_cursor": "eyJ...", "has_more": true, "total_count": 142 } }
```
`total_count`는 best-effort이다(여기서는 비용이 저렴하다). dumb client가 본문을 파싱하지 않고도 따라갈 수 있도록 `Link` 헤더에도
`next`를 완전한 형태의 URL로 포함한다.

### 2.3 필터링 & 정렬
- first-class 필드로만 필터링한다(임의의 query DSL은 피한다): `?type=`, `?tag=`, `?source_product=`,
  `?q=`(title/summary/tags에 대한 full-text), `?updated_since=`.
- 정렬: `?sort=published_at|title|-updated_at`(앞에 붙은 `-`는 내림차순), whitelist에 등록된 필드만 허용.
- `boundary`는 필터가 **아니다** — 이 표면의 모든 것은 이미 `public`이다. 이 파라미터를 제공하면 다른 값이 공개적으로 존재한다는
  의미가 되어버린다.

### 2.4 콘텐츠 협상 (핵심 결정)

| Strategy | Mechanism | Pros | Cons |
|---|---|---|---|
| `Accept` header | `Accept: text/markdown` / `application/json` / `text/html` | clean, one URL, HTTP-native, agents already send `text/markdown` | needs server negotiation + caching by `Vary` |
| `.md`/`.json` suffix | `/skills/x.md` | trivially cacheable, copy-pasteable, no header logic | URL proliferation, weaker "one resource" story |
| `?format=` query | `?format=md` | explicit, easy to debug | pollutes cache keys, not idiomatic |

**Decision:** `Accept` 헤더 협상(주(primary), canonical)과 `.md` suffix alias(부(secondary), 공유 가능한 에이전트 친화적
링크 + edge caching용)를 **모두** 지원한다. `Vary: Accept`를 설정하고 `Content-Type`을 명시적으로 내보낸다. 아무것도 지정되지
않았을 때의 기본값: 웹사이트 호스트에서는 HTML, `api.` 호스트에서는 JSON.

리소스별 표현:
- `text/html` — 렌더링된 페이지(웹사이트).
- `text/markdown` — 아티팩트 본문 + 작은 YAML frontmatter 헤더(manifest 필드). 에이전트가 *콘텐츠*를 가져올 때 받는 것으로,
  Cloudflare가 공개한 측정치에 따르면 HTML 대비 토큰이 약 80% 적다.
- `application/json` — §2.1의 구조화된 엔벨로프(기계 추론, list 뷰, MCP).

또한 루트에 **`/llms.txt`**(상위 아티팩트의 markdown 인덱스)를 편의용 진입점으로 게시한다. 이는 보장이 아니라 nice-to-have로
취급한다 — 공개 측정치(Search Engine Journal, 2025년 11월)는 입증된 인용 향상(citation lift)을 보여주지 않는다. load-bearing
메커니즘은 콘텐츠 협상을 통한 URL별 markdown이며, Claude Code / OpenCode가 이를 요청하는 것이 확인되었다(`Accept: text/markdown`).

---

## 3. Skill / Workflow 배포 형식 (the manifest)

게시된 Skill/Workflow는 어떤 에이전트 런타임이든 ingest할 수 있는 **manifest 엔벨로프**로 배포된다. 우리는 manifest를 사실상의
표준인 **`SKILL.md` 형태**(YAML frontmatter + markdown 본문)에 맞춰, 아티팩트가 Claude 스타일의 skill 로더에 그대로 들어가게
하면서, *동시에* 같은 필드를 MCP 및 일반 클라이언트를 위한 JSON으로도 노출한다.

### 3.1 하나의 manifest를 위한 상호 교환 가능한 두 가지 인코딩

**(a) `SKILL.md`(markdown + frontmatter)** — 사람 작성자 + skill-folder 로더용:
```markdown
---
name: pr-triage
description: Triage an incoming pull request and produce a structured report.
version: 2.1.0
boundary: public
license: TODO(open-question: public license per artifact)
provenance: { source_product: CAW-03, validated: true }
inputs:  [pr_url]
when_to_use: When a new PR needs initial classification before review.
---

# Triage an incoming pull request
...markdown body: steps, constraints, examples...
```
필수 frontmatter는 오픈 Agent Skills 명세(`name`, `description`)를 따르며, `name`은 아티팩트 slug과 일치한다.
여기에 CAW-04 거버넌스 필드(`version`, `boundary`, `provenance`)를 추가한다 — 추가적(additive)이며, 이를 모르는 로더는 무시한다.

**(b) `manifest.json`** — §2.1 엔벨로프와 동일한 필드로, `/v1/{type}/{id}/manifest.json`에서 제공된다. 이것이 canonical한
기계용 형태이며 MCP resources가 참조하는 본문이다.

### 3.2 다운로드용 패키징
pin된 version은 **`.skill` 번들**(skill-folder 관례를 따르는 zip/tar)로 다운로드할 수 있다:
```
pr-triage@2.1.0/
  SKILL.md            # manifest (a)
  manifest.json       # manifest (b), identical fields
  references/         # supporting docs loaded into agent context
  examples/           # Example sub-resources
  assets/             # templates (large assets by path, per brief §6)
```
이를 통해 에이전트(또는 사람)는 self-contained하고 version이 pin되며 provenance가 찍힌 단위를 `GET`하여 오프라인으로 실행할 수
있다. Workflow도 같은 방식으로 배포되며, 순서가 있는 `{skill_id, version}` step들을 나열하는 `workflow.json`을 추가하여 번들이
재현 가능하도록 한다.

### 3.3 MCP 디스커버리 가능성(discoverability)
카탈로그를 MCP **resources** 뷰로 노출하여, MCP 호스트가 별도 통합 없이 `resources/list`와 `resources/read`를 할 수 있게 한다:

| MCP concept | CAW-04 mapping |
|---|---|
| Resource `uri` | `caw04://skills/pr-triage@2.1.0` |
| Resource `name` / `description` | manifest `title` / `summary` |
| Resource `mimeType` | `text/markdown` (body) or `application/json` (manifest) |
| `resources/read` payload | the `.md` body or `manifest.json` |

이것은 **PublishSinkAdapter**(brief §8)이다: MCP 뷰는 동일한 canonical 리소스 위의 한 adapter이며, 웹사이트 + REST API는
다른 v1 adapter들이다. 선택적인 미래 sink로는 CAW-04를 공개 **MCP Registry**에 등재하는 것이 있다. 공유 substrate는 없다 —
MCP는 또 하나의 projection일 뿐이다.

---

## 4. 트레이드오프 요약 (결정)

| Decision point | Chosen | Why |
|---|---|---|
| Resource identity | one canonical resource, many representations | provenance + boundary stay attached |
| Versioning | latest at `/{id}`, immutable pin at `/versions/{semver}` | brief §5 immutability + addressability |
| Pagination | cursor + stable envelope (+ `Link` header) | stable under publishes, agent-loop friendly |
| Filtering | whitelisted first-class fields only | no leak via boundary filter, cacheable |
| Negotiation | `Accept` header (primary) + `.md` alias (secondary) | HTTP-native + shareable/cacheable |
| Markdown body | frontmatter + body, ~80% token cut vs HTML | agents request `text/markdown` today |
| Manifest | `SKILL.md` ⇆ `manifest.json` (same fields) | reuse open skill spec + MCP/JSON clients |
| Packaging | `.skill` bundle (folder convention) | self-contained, pinned, offline-runnable |
| Catalog discovery | REST list + MCP `resources/*` + `/llms.txt` | covers HTTP agents, MCP hosts, crawlers |

---

## 5. Open Questions
`../08-research-plan/open-questions.md`에서 추적:
- **OQ:** 오픈 Agent Skills `SKILL.md` 명세를 그대로(verbatim) 채택할 것인가, 아니면 CAW-04 superset 프로필을 정의할 것인가?
  upstream 명세가 바뀌면 drift 위험이 있다.
- **OQ:** 아티팩트별 공개 **license** 필드 — 재배포에 필수인가? 기본값은 무엇인가?
- **OQ:** `published_at` / `updated_at` 타임스탬프 + 타임존 정책(임의로 만들지 말 것).
- **OQ:** 카탈로그가 커져도 `total_count`가 저렴하게 유지되는가, 아니면 순수 cursor를 위해 폐기할 것인가?
- **OQ:** MCP Registry 등재 — v1 범위인가, 아니면 추후 PublishSinkAdapter stub만 둘 것인가?
- **OQ:** 번들링 전에 `references/`/`assets/`의 크기 제한과 바이러스/secret 스캔(public-safe)을 어떻게 할 것인가?
- **OQ:** `Vary: Accept`에 대한 캐시 전략 / CDN 동작(일부 CDN은 이를 잘 처리하지 못한다).
- **OQ:** 아티팩트 version을 가로지르는 Workflow step 참조 — 정확한 version을 pin할 것인가, 아니면 range/`latest`를 허용할 것인가?

## 6. 런북에 대한 함의

- **API runbook:** §2 리소스 라우트, cursor 페이지네이션 엔벨로프, whitelist 필터, 그리고 `Vary: Accept`를 갖춘
  `Accept`/`.md` 협상을 구현한다. 호스트별 기본 형식을 둔다.
- **Manifest runbook:** `SKILL.md` frontmatter 스키마와 그에 상응하는 `manifest.json` JSON Schema를 정의하고, 어떤 표현이든
  내보내기 전에 `boundary == public`과 `provenance.public_safe_recheck == passed`를 단언하는 validator를 정의한다
  (edge에서의 publish gate 시행).
- **Bundle runbook:** pin된 version을 키로 하는 `.skill` 패키징 단계(`SKILL.md` + `manifest.json` + `references/` +
  `examples/` + `assets/`의 zip)를 빌드하며, 콘텐츠 스캔 단계를 포함한다.
- **MCP adapter runbook:** canonical 리소스 위에서 `resources/list` + `resources/read`를 PublishSinkAdapter로 구현하고,
  registry 등재 stub을 문서화한다.
- **Ports & adapters:** 웹사이트 빌드, REST API, MCP 뷰는 하나의 core 위의 세 가지 PublishSinkAdapter이다. canonical 리소스
  모델을 어떤 adapter와도 독립적으로 유지한다.

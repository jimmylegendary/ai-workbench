# 버저닝 & 불변성 (Versioning & Immutability)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - `../_meta/PRODUCT-BRIEF.md`
  - `./` (sibling research: content-model, storage, publish-gate — TODO when authored)
  - `../01-decisions/ADR-XXXX-versioning-model.md` (TODO: ADR to be raised from this doc)
  - `../01-decisions/ADR-XXXX-url-and-api-resource-scheme.md` (TODO)
  - `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

CAW-04는 하나의 가치 단위를 게시한다: **게시되고, 버전이 부여되고, public-safe한 아티팩트**(Tip / Skill / Workflow /
Playbook). brief는 "게시된 version은 immutable + addressable"(§5, §6)임을 고정한다. 이 문서는 그 **방법(how)**을 결정한다:
version identity 체계(semver 대 date 대 content-hash), 불변성 + 주소 지정 가능성 보장, unpublish/redact/deprecate 처리,
그리고 `Version`에서 웹 URL 및 API 리소스로의 매핑.

이 문서는 저장 substrate(md/MDX-first 대 DB — 별도 ADR), 콘텐츠 모델 필드, publish-gate 정책을 결정하지 않는다. 그것들이
존재한다고 가정하고, 버저닝이 어디에 hook되는지를 보여준다.

## 힘(Forces) & 제약(constraints)

- **공개 읽기 표면, curator만 쓰기.** 공개 write API가 없으며, 모든 publish는 Jimmy의 승인을 받는다(§3, §11).
  이는 다른 곳에서 순수 content-hash 체계를 강제하는 멀티 작성자 race condition을 제거한다.
- **불변성은 신뢰 + 감사(audit)에 load-bearing이다.** 게시된 각 항목은 검증된 내부 source + 안전 검토로 추적되어야 한다
  (§5 use case 5). version을 pin한 소비자(사람 또는 에이전트)는 바이트 단위로 동일한 콘텐츠를 돌려받거나 명확한 tombstone을
  받아야 하며, 결코 조용히 변경된 콘텐츠를 받아서는 안 된다.
- **에이전트는 일급(first-class) 소비자이다.** 그들은 API를 통해 skill/workflow를 가져오며, version으로 캐시하거나 pin할 수
  있다. 그들에게는 안정적이고 기계 검증 가능한 identity(integrity)와 사람이 읽을 수 있는 호환성 신호가 모두 필요하다.
- **public-safe boundary는 게시 후에 바뀔 수 있다.** Redaction/unpublish는 실제 기능이어야 하지만(§3 use case 4),
  정직한 cacher들에 대한 불변성 약속을 위반해서는 안 된다. 그 조정(reconciliation)이 곧 **tombstone**이며, 편집(edit)이 아니다.
- **Ports & adapters.** `PublishSinkAdapter`(웹사이트 빌드 + REST API)와 향후의 어떤 sink든 동일한 version identity를
  소비해야 한다. 체계는 특정 sink 하나를 가정해서는 안 된다.

## 버저닝 모델 — 옵션 비교

| Scheme | What it is | Pros | Cons | Fit for CAW-04 |
|---|---|---|---|---|
| **Date-based** (`2026-06-28`, CalVer) | version = publish date/time | trivial; intuitive recency; good for changelogs | no compatibility signal; collisions on same-day re-publish; agents can't tell breaking vs trivial change | as **metadata only** (good) |
| **Semver** (`MAJOR.MINOR.PATCH`) | semantic compatibility contract | machine-readable compat (breaking/feature/fix); industry-standard for API consumers; npm-proven | requires human judgement on bump; not self-verifying (says nothing about bytes) | **primary human/agent identity** |
| **Content-hash / digest** (`sha256:…`) | id = hash of canonicalized content | self-verifying integrity; intrinsically immutable; dedup-free addressing; matches OCI/IPFS/git | opaque to humans; no compat signal; verbose URLs | **immutability + integrity layer** |

**권장 — 하이브리드, OCI/Docker(`tag` + `@digest`)와 npm(`semver` + `integrity`) 패턴을 미러링:**

1. **Semver**는 curator가 publish 시 부여하는 *published version identity*이다(`skill-name @ 2.1.0`). 이것은 사람과
   에이전트를 향한 호환성 계약이자 주된 경로 구성요소(path component)이다.
2. **Content digest**(canonical화된 markdown 본문 + 감사된 metadata 엔벨로프의 `sha256:`)는 publish 시 계산되어 모든
   `Version`에 저장된다. 이것은 *불변성 증명(immutability proof)*이자 대체 주소 키이다. 에이전트는 바이트 정확성을 위해 digest로
   pin할 수 있으며, API가 이를 반환한다(그리고 `Digest:`/`ETag` 헤더로 제공할 수 있다).
3. **`published_at` date**는 필수 metadata이다(recency, audit, sort). 결코 identity가 아니다.

이는 brief가 함의하는 두 축을 모두 제공한다: semver는 "이것이 breaking change인가?"에 답하고, digest는 "이것이 내가 신뢰하는
정확한 바이트인가?"에 답한다. 어느 하나만으로는 충분하지 않다.

### 불변성 규칙 (the contract)

- `(slug, semver)` 쌍은 일단 게시되면 **영원히 frozen된다.** 그 바이트와 digest는 결코 바뀌지 않는다.
- `(slug, semver)` 쌍은 일단 사용되면 **결코 재사용되지 않는다** — unpublish 이후에도(npm의 규칙; redact된 version이 같은
  주소에서 다른 콘텐츠로 조용히 교체되는 것을 막는다).
- 게시된 아티팩트에 대한 어떤 변경이든 = 새로운 semver(그리고 필연적으로 새로운 digest)를 가진 **새로운 `Version`**.
- digest는 **canonical serialization**(정규화된 front-matter 키 순서, LF 개행, trim된 후행 공백) 위에서 계산되어, 동일한
  논리적 콘텐츠가 rebuild를 가로질러 항상 동일하게 해시되도록 한다. TODO(open-question:
  정확한 canonicalization 명세 + 어떤 metadata 필드가 해시되는 엔벨로프의 안에 있고 밖에 있는가).
- "사소한" curator 수정(오타)도 여전히 새로운 PATCH version이다 — 게시된 version의 in-place 편집은 없다.

### *콘텐츠*에 대한 semver 의미론 (코드가 아님)

Semver는 코드 API를 위해 설계되었으나, 우리는 이를 콘텐츠 아티팩트에 맞춘다. 제안 매핑(ADR에서 비준할 것):

| Bump | Meaning for a Tip/Skill/Workflow |
|---|---|
| **MAJOR** | guidance changed in a way that would lead a reader/agent to a *different action* (steps removed/reordered, preconditions changed, reversed recommendation) |
| **MINOR** | additive, backward-compatible (new example, extra optional step, clarified rationale) |
| **PATCH** | cosmetic/no-behaviour-change (typo, formatting, link fix) |

이는 "`^2.0.0`에 pin된 에이전트"를 의미 있게 유지한다: 그 에이전트는 action을 바꾸는 guidance를 조용히 받지 않는다.

## Unpublish, redact, deprecate — 서로 다른 연산

brief의 use case 4("boundary가 바뀌면 unpublish / redact")는 사실 서로 다른 의미론을 가진 **세 가지** 연산이다. 이것들을
뭉뚱그리는 것이 여기서의 주된 위험이다.

| Operation | Scope | Public behaviour | Internal record | When |
|---|---|---|---|---|
| **Deprecate** | a version or whole item | still served; carries a visible `deprecated` flag + successor pointer; API sets a warning field/header | kept | superseded but still safe and true |
| **Unpublish** | whole item (all versions) | item routes return **HTTP 410 Gone**; removed from index/listing/sitemap; web shows a tombstone page | metadata + provenance retained for audit; bytes may be retained or purged per policy | item should no longer be public at all |
| **Redact** | a single version (or a field) | that version returns **410 Gone**; sibling versions unaffected; `latest` re-points to newest non-redacted version | **immutable audit record of what/why/when/who** retained internally; public bytes purged | one version leaked above the public-safe boundary |

핵심 규칙:

- **410 Gone, 404 아님.** 410은 "이것은 존재했으나 의도적으로 제거되었다"고 말한다 — SEO에 올바르고(빠르게 de-index됨),
  에이전트에게 정직하며, audit trail과 일관된다. 404는 "결코 존재하지 않았다"를 함의하여 감사 가능성을 훼손한다.
  콘텐츠가 진정으로 새로운 canonical URL로 *이동*했을 때(rename/merge)만 **301**을 사용하고, boundary 제거에는 사용하지 않는다.
- **Tombstone하라, 다시 쓰지(rewrite) 말라.** `(slug, semver)`는 결코 재사용되지 않으므로, redact된 version의 주소는
  영구적으로 410 tombstone(id, semver, digest, `redacted_at`, 기계 판독 가능한 reason code)으로 해석된다. 그것을 pin했던
  cacher는 교체된 콘텐츠를 받는 대신 그것이 철회되었음을 알게 된다 — 이것이 불변성 약속을 지키면서 *동시에* 제거를 허용하는 방법이다.
- **Redaction 자체가 감사되고 Jimmy의 승인을 받는 이벤트이다**(publish gate를 미러링, §11). 감사 기록은 CAW-04 자체 store에
  존재하며, 공개 바이트가 purge된 후에도 내부 source로의 provenance는 유지된다.
- **모든 (re)publish 시 boundary 재검사**(§7): unpublish/redact는 gate의 실패 모드(failure-mode) 대응물이다.

## URL + API 리소스 체계

원칙: **아티팩트당 두 가지 주소 형태** — *이동하는(moving)* canonical 주소(항상 가장 최근에 게시된 version)와 *immutable한
pin된* 주소(정확히 하나의 version). 이는 Read-the-Docs의 `latest`/`stable` alias 패턴에 OCI의 `tag@digest` pin을 더해
콘텐츠에 맞춘 것이다.

### Web URLs

```
/{type}/{slug}                     canonical; 200 → renders latest published version; rel=canonical points here
/{type}/{slug}/v/{semver}          immutable; pinned version (e.g. /skills/triage-incident/v/2.1.0)
/{type}/{slug}/v/{semver}          → 410 Gone (tombstone page) if that version was redacted
/{type}/{slug}                     → 410 Gone if whole item unpublished
/{type}/{slug}/versions            human-readable version history / changelog
```

- `{type}` ∈ `tips | skills | workflows | playbooks`(§5의 엔티티 이름).
- canonical 페이지는 자기 자신(이동하는 URL)으로 `rel=canonical`을 설정하여, 검색 엔진이 stale한 pin 페이지가 아니라
  *latest*를 인덱싱하도록 한다 — "오래된 version이 검색 최상위 결과"라는 문제에 대한 문서화된 Read-the-Docs 해법이다.
- pin된 `/v/{semver}` 페이지는 직접 도달 가능한 상태를 유지하면서 이동하는 URL로 `rel=canonical`을 설정하며, 장수명 immutable
  캐시 헤더(`Cache-Control: public, max-age=31536000, immutable`)로 제공되어야 한다(SHOULD).

### API resources

```
GET /api/v1/{type}                          list/index (latest of each; supports filters, pagination)
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          list every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/versions/{semver} → 410 Gone (machine-readable tombstone body) if redacted
GET /api/v1/{type}/{slug}                    → 410 Gone if unpublished
```

- **분리된 채로 유지되는 두 개의 version 축**(고전적인 혼란의 원천): **API contract version**은 URL prefix `/api/v1`이며
  (breaking API 형태 변경 시에만 바뀐다), **content version**은 `{semver}` 경로 세그먼트 / 리소스 필드이다. 하나를 다른 하나로
  절대 overload하지 않는다.
- **형식을 위한 콘텐츠 협상**(markdown 대 JSON, brief §4/§6): 동일한 리소스, `Accept: text/markdown` →
  raw 게시 markdown; `Accept: application/json` → 구조화된 엔벨로프(본문 + 재사용/감사 가능한 metadata:
  inputs/outputs, preconditions, provenance, safety boundary, version, digest). 선택적으로 dumb client를 위한 탈출구로
  `.md`/`.json` suffix를 둔다. TODO(open-question: canonical 메커니즘으로 header-negotiation 대 suffix 중 무엇인가).
- **클라이언트에 노출되는 integrity:** 모든 version 응답은 본문에 `digest`와 `ETag`(strong, digest에서 파생됨)를 담는다.
  `latest` 응답은 호출자가 결정론적으로 다시 pin할 수 있도록 해석된 `semver` + `digest`도 포함한다.
- **`?version=` query는 권장하지 않으며** 경로 세그먼트를 선호한다(cacheable, addressable, log-friendly). 경로 안의
  `latest` 리터럴(`/versions/latest`)은 docs 툴링과의 대칭성을 위해 이동하는 리소스의 alias가 될 수 있다(MAY).

### 공개 URL에 content-hash를 쓰지 않는 이유

Digest-in-URL(`…@sha256:abcd…`)은 주된 공개 웹 URL이 아니라 *선택적* API pin alias로만 제공된다:
읽을 수 없고, 공유할 수 없으며, SEO에 나쁘다. Semver 경로는 사람을 향한 채로 유지되고, digest는 헤더/본문/선택적 pin에 남는다.
(OCI가 정확히 이 split을 한다: 사람은 tag를 쓰고, 기계/pin은 digest를 쓴다.)

## 권장 요약

- **Identity:** 하이브리드 — **semver**(부여됨, 사람/에이전트 호환성 계약) + **content digest**(계산됨,
  불변성/integrity) + **`published_at`**(metadata). 콘텐츠에 맞춘 semver bump 규칙을 채택한다.
- **Immutability:** `(slug, semver)`는 frozen되고 결코 재사용되지 않는다; 모든 편집은 새 version이다; digest는 canonical
  serialization 위에서 계산한다.
- **Removal:** 세 가지 구별되는 연산 — **deprecate**(제공 + 경고), **unpublish**(item → 410), **redact**
  (version → 410 tombstone, 형제(sibling)는 그대로, `latest` 재지정). 바이트가 purge된 후에도 감사 기록은 유지된다.
- **Addressing:** 이동하는 canonical URL + immutable pin된 `/v/{semver}` URL; API는 `/versions/{semver}`로 미러링;
  형식은 콘텐츠 협상으로; API-contract version(`/api/v1`)은 content version과 직교(orthogonal)하게 유지.

## Open Questions

각각을 `../08-research-plan/open-questions.md`로 승격(promote)할 것:

- TODO(open-question: exact canonical serialization + which metadata fields are inside the hashed envelope vs
  mutable-around-it, e.g. is `deprecated` flag inside the digest or a side-band attribute?).
- TODO(open-question: who/what assigns the semver bump — curator judgement only, or a diff-assisted proposal that
  Jimmy approves? How is a mis-judged bump corrected without breaking immutability?).
- TODO(open-question: on redact, do we purge public bytes immediately or retain encrypted internally for audit? Legal/
  boundary retention policy needed).
- TODO(open-question: digest algorithm + prefix convention (`sha256:` vs multihash) and whether to expose a
  digest-pin URL alias at v1 or defer).
- TODO(open-question: format addressing — `Accept` header negotiation as canonical with `.md`/`.json` suffix as
  fallback, or suffix-first?).
- TODO(open-question: does an item slug ever change (rename), and if so is that a 301 from old slug or a new item +
  provenance link? Interaction with immutability of old version URLs).
- TODO(open-question: sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged?).

## 런북에 대한 함의

- **Storage/index runbook**은 `Version`별로 다음을 영속화해야 한다: `slug`, `semver`, `digest`, `published_at`, `status`
  (`published | deprecated | redacted`), successor pointer, 그리고 감사 기록(who/why/when) — 그리고 쓰기 시점에
  "`(slug, semver)`를 결코 재사용하지 않는다" 불변식을 시행한다.
- **Publish-gate runbook**은 승인 시 다음을 해야 한다: semver 부여/검증(downgrade/재사용 거부), canonical serialization
  위에서 digest 계산, 그리고 version이 주소 지정 가능해지기 전에 provenance + boundary-recheck 결과를 기록.
- **Website build runbook (PublishSinkAdapter)**은 이동하는 canonical 페이지와 immutable `/v/{semver}` 페이지를 모두
  내보내고, `rel=canonical` + immutable 캐시 헤더를 올바르게 설정하며, unpublish/redact된 주소에 대해 410 tombstone 페이지를
  생성하고, sitemap/index에서 unpublish된 항목 및 (정책에 따라) deprecate된 version을 제외해야 한다.
- **REST API runbook (PublishSinkAdapter)**은 위의 리소스 트리, 콘텐츠 협상(md/JSON), `ETag`/`digest` 헤더, 그리고 제거된
  리소스에 대한 **410 + 기계 판독 가능한 tombstone 본문**(404 아님)을 구현해야 한다; `/api/v1`을 content `{semver}`와 직교하게
  유지한다.
- **Unpublish/redact runbook**은 Jimmy 승인을 받고 감사되는 연산이어야 하며, status를 뒤집고, `latest`를 재지정하고, 영향받는
  주소에 대해 캐시/CDN을 무효화하고, 바이트가 purge되기 전에 immutable 감사 기록을 쓴다.

---

Sources (external grounding): npm immutable-version + unpublish policy (`docs.npmjs.com/policies/unpublish`),
MDN HTTP 410 Gone (`developer.mozilla.org/en-US/docs/Web/HTTP/Status/410`), Read the Docs canonical-URL/version-alias
guidance (`docs.readthedocs.com`), SemVer for APIs (`zuplo.com/learning-center/semantic-api-versioning`), OCI/Docker
tag-vs-digest and IPFS content-addressing patterns. Internal product facts are from the CAW-04 PRODUCT-BRIEF only.

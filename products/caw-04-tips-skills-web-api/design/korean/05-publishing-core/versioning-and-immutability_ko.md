# Versioning & Immutability — semver + digest, frozen versions, tombstones

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-entities.md](./content-entities_ko.md) (`Version` 엔티티 + composition pin)
  - [./rendering-web-and-api.md](./rendering-web-and-api_ko.md) (URL/resource가 어떻게 emit되는지)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (이 문서가 구체화하는 결정)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design_ko.md) (resource/URL 체계, 410 tombstone body)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (모든 (re)publish 시 재검사)
  - [../02-research/versioning-and-immutability.md](../02-research/versioning-and-immutability_ko.md) (옵션 비교 + 외부 근거)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 **공개된 artifact가 어떻게 영원히 불변이고 주소 지정 가능하게 유지되는지**(brief §5)를 확정한다: 하이브리드 **semver + content-digest** 식별자, `(slug, semver)`를 freeze하는 규칙, "수정 = 새 version" 모델, 세 가지 removal 연산(deprecate / unpublish / redact)과 그들의 **tombstone**, 그리고 `Version`에서 web URL 및 API resource로의 매핑. [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)와 [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)을 구체화한다. 엔티티 필드([content-entities](./content-entities_ko.md))나 빌드 메커니즘([rendering-web-and-api](./rendering-web-and-api_ko.md))을 정의하지는 않는다.
전반에 걸쳐 가지는 속성: **pin된 version은 byte 단위로 동일한 콘텐츠 또는 정직한 tombstone을 반환한다 — 결코 조용히 변경된 콘텐츠를 반환하지 않는다.**

## 1. Identity — 두 개의 축, 결코 혼동되지 않음

| 축 | 값 | 할당 vs 계산 | 답하는 질문 | 노출 형태 |
|---|---|---|---|---|
| **Semver** | `MAJOR.MINOR.PATCH` (예: `2.1.0`) | publish 시 curator가 **할당** | "이것은 breaking change인가?" | URL/path 세그먼트, `version` 필드 |
| **Content digest** | canonical serialization에 대한 `sha256:<hex>` | publish 시 **계산** + frozen | "이것이 내가 신뢰하는 바로 그 byte인가?" | `digest` body 필드 + strong `ETag` |
| **`published_at`** | ISO-8601 timestamp | publish 시 기록 | recency / 정렬 / audit | 메타데이터 전용 — **결코** 식별자가 아님 |

이것은 OCI `tag@digest`와 npm `semver+integrity`를 반영한다: 사람/agent는 읽기 쉬운 semver로 주소를 지정하고; 기계는 digest로 검증한다. 어느 하나만으로는 충분하지 않다 — semver는 무결성 증명을 담지 않고; digest는 호환성 신호를 담지 않는다.

### 1.1 Content-adapted semver bump 규칙

semver는 code API를 위해 만들어졌으나; CAW-04는 이를 **content**에 맞게 적응시킨다([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)에서 비준):

| Bump | Tip / Skill / Workflow / Playbook에 대한 트리거 |
|---|---|
| **MAJOR** | 독자/agent가 *다른 행동*을 취하게 될 만큼 가이던스 변경 — step 제거/재배열, precondition 변경, 권고 역전 |
| **MINOR** | 추가적, 하위 호환 — 새 example, 선택적 step, 명확해진 rationale |
| **PATCH** | 외관상, 동작 변경 없음 — 오타, 서식, 링크 수정 |

이것은 "`^2.0.0`에 pin된 agent"가 의미를 갖게 유지한다: 그 agent는 결코 조용히 행동을 바꾸는 가이던스를 받지 않는다.
TODO(open-question: who assigns the bump — curator judgement only vs a diff-assisted proposal Jimmy approves; how a
mis-judged bump is corrected without breaking immutability — from [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

### 1.2 The digest — 무엇이 해시되는가

```text
digest = sha256( canonical_serialization( public_projection_body + audited_metadata_envelope ) )

canonical_serialization:
  - normalized frontmatter key order
  - LF newlines only
  - trailing whitespace trimmed
  → the same logical content hashes identically across rebuilds
```

TODO(open-question: exact canonicalization spec + whether mutable side-band flags like `deprecated` are inside the
hashed envelope or outside it; whether the digest covers the audit sidecar or only the public projection — from
[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) / [content-entities](./content-entities_ko.md) §3).
TODO(open-question: digest algorithm + prefix convention — `sha256:` vs multihash.)

## 2. Immutability — the contract

| 규칙 | 진술 | 강제 위치 |
|---|---|---|
| **Frozen** | 공개된 `(slug, semver)` 쌍의 byte + digest는 결코 변하지 않음 | storage write-time 검사 |
| **Never reused** | `(slug, semver)` 쌍은 일단 사용되면 결코 재발행되지 않음 — *unpublish 후에도* | storage write-time 검사 |
| **Edits = new version** | 공개된 콘텐츠의 모든 변경 = 새 semver를 가진 새 `Version`(⇒ 새 digest) | publish gate |
| **No in-place edit** | 오타 수정조차 새 PATCH; 공개된 version의 mutation은 없음 | publish gate |

"Never reused"는 redact된 주소가 조용히 다른 콘텐츠로 다시 채워지는 것을 막는 규칙(npm에서 유래)이다. tombstone(§3)과 결합하면 CAW-04가 정직한 cacher에 대한 불변성 약속을 **깨지 않으면서** 콘텐츠를 *제거*할 수 있게 한다.

```
src/content/skills/triage-incident/
  1.0.0.mdx   (frozen)        ← published_at T0, digest sha256:aa…
  2.0.0.mdx   (frozen)        ← MAJOR: steps reordered, digest sha256:bb…
  2.1.0.mdx   (frozen, latest)← MINOR: added example,    digest sha256:cc…
# 2.0.0.mdx is NEVER edited; a fix to it ships as 2.0.1 or 2.1.0.
```

## 3. Removal — 세 가지 구별되는, audit되는, Jimmy 승인 연산

brief의 use case 4("boundary가 바뀌면 unpublish / redact")는 실제로 **세 가지** 연산이다. 이들을 혼동하는 것이 주된 리스크다; 각각 다른 범위와 공개 동작을 가진다
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

| 연산 | 범위 | 공개 동작 | 보관되는 기록 | 시점 |
|---|---|---|---|---|
| **Deprecate** | version 또는 item 전체 | 여전히 서빙됨; 가시적 `deprecated` flag + 후속(successor) 포인터; API warning 필드/header | 전체 | 대체되었으나 여전히 안전하고 참 |
| **Unpublish** | item 전체 (모든 version) | 모든 item route → **HTTP 410 Gone**; index/listing/sitemap에서 제거; web tombstone 페이지 | provenance + 메타데이터 유지 | item이 더 이상 전혀 공개되지 않아야 함 |
| **Redact** | 단일 version (또는 필드) | 그 version → **410 Gone** tombstone; 형제(sibling)는 영향 없음; `latest`는 가장 최신의 redact되지 않은 것으로 재지정 | 불변 audit 기록(무엇/왜/언제/누가); 공개 byte는 purge됨 | 한 version이 public-safe 경계를 넘음 |

### 3.1 Tombstone 규칙

- **410 Gone, 404 아님.** 410은 "존재했으나 의도적으로 제거됨"을 의미한다 — 빠른 SEO de-index에 적합하고, agent에게 정직하며, audit trail과 일관됨. 404("결코 존재하지 않음")는 감사 가능성(auditability)을 훼손한다.
- **301은 진짜 이동에만**(새 canonical URL로의 rename/merge), 경계 제거에는 결코 사용하지 않음.
- **Tombstone, 결코 rewrite 아님.** `(slug, semver)`는 결코 재사용되지 않으므로, redact된 주소는 영구적으로 410 tombstone으로 해석된다. 그것을 pin했던 cacher는 바뀐 콘텐츠를 받는 대신 *그것이 철회되었음을 알게 된다*.
- **Provenance는 byte-purge 후에도 남는다.** audit 기록(그리고 내부 Source로의 링크)은 공개 byte가 purge된 후에도 유지된다. TODO(open-question: purge public bytes immediately vs retain encrypted internally
  for audit — legal/retention policy, from [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- **Re-check가 그 짝이다.** public-safe 재검사는 모든 (re)publish 시 실행된다
  ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)); unpublish/redact는 그 실패 모드 쌍둥이다.

### 3.2 기계 판독 가능 tombstone body (410)

```jsonc
{
  "status": "redacted",                 // or "unpublished"
  "id": "triage-incident",
  "type": "skill",
  "version": "2.0.0",                   // present for a redacted version; absent for whole-item unpublish
  "digest": "sha256:bb…",              // the digest that USED to resolve here
  "redacted_at": "TODO(open-question: timestamp policy)",
  "reason_code": "boundary-change",     // machine-readable; no confidential detail
  "successor": "/api/v1/skills/triage-incident/versions/2.1.0"  // null if none
}
```

## 4. URL + API resource 매핑

원칙([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) 기준): **artifact당 두 가지 주소 형태** — *이동하는(moving)* canonical 주소(항상 최신 published)와 *불변 pin된* 주소(정확히 한 version).

### 4.1 Web URLs

```
/{type}/{slug}                 canonical; 200 → latest published version; rel=canonical points here
/{type}/{slug}/v/{semver}      immutable pinned page (e.g. /skills/triage-incident/v/2.1.0)
/{type}/{slug}/versions        human-readable version history / changelog
/{type}/{slug}/v/{semver}      → 410 Gone tombstone page if that version was redacted
/{type}/{slug}                 → 410 Gone if the whole item was unpublished
```

- `{type}` ∈ `tips | skills | workflows | playbooks`.
- **이동하는** canonical 페이지는 `rel=canonical`을 자기 자신으로 설정해 검색 엔진이 stale한 pin된 페이지가 아니라 *latest*를 인덱싱하게 한다("오래된 version이 검색 최상위 결과로 뜨는 문제"에 대한 Read-the-Docs식 해법).
- **Pin된** `/v/{semver}` 페이지는 직접 도달 가능한 채로 유지되면서 `rel=canonical`을 이동하는 URL로 설정하고, `Cache-Control: public, max-age=31536000, immutable`로 서빙된다(byte가 frozen이므로 안전).

### 4.2 API resources

```
GET /api/v1/{type}/{slug}                   latest published version (moving)
GET /api/v1/{type}/{slug}/versions          every version (semver, digest, published_at, status)
GET /api/v1/{type}/{slug}/versions/{semver} one immutable version (pinned)
GET /api/v1/{type}/{slug}/versions/{semver} → 410 + tombstone body if redacted
GET /api/v1/{type}/{slug}                    → 410 if unpublished
```

| 관심사 | 규칙 |
|---|---|
| **Two version axes** | API-contract version = path prefix `/api/v1`(breaking API shape에서 변경); content version = `{semver}` 세그먼트. 하나를 다른 하나로 절대 overload하지 않음. |
| **Integrity to clients** | 모든 version 응답은 body에 `digest` + 그로부터 파생된 strong `ETag`를 담음. |
| **Re-pin determinism** | `latest` 응답은 호출자가 결정론적으로 re-pin할 수 있도록 해석된 `semver` + `digest`를 포함. |
| **Digest in URL** | *선택적* API pin alias로만 제공되며, 결코 주된 공개 URL이 아님(읽기 어렵고, 공유 불가, SEO에 나쁨). TODO(open-question: expose a digest-pin alias at v1 or defer — from [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)). |
| **`?version=` query** | path 세그먼트(캐시 가능, 주소 지정 가능, 로그 친화적)를 선호하여 권장하지 않음. |

Content negotiation(markdown vs JSON), pagination, `index.json` manifest은
[rendering-web-and-api](./rendering-web-and-api_ko.md)와 [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)에 명세되어 있으며 — 여기서 반복하지 않는다.

## 5. Lifecycle at a glance

```
in-review ──[gate: assign semver, compute digest, freeze]──▶ published ──▶ (latest)
                                                               │
                              edit (any change) ──────────────┘  ⇒ NEW Version (new semver, new digest)
published ──[deprecate]──▶ deprecated (still served, warned, successor pointer)
published ──[unpublish]──▶ 410 (whole item; provenance retained)
version   ──[redact]────▶ 410 tombstone (this version; siblings intact; latest re-points)
```

## 6. Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적:

- TODO(open-question: exact canonical serialization + which metadata is inside vs outside the hashed envelope.)
- TODO(open-question: who/what assigns the semver bump; correcting a mis-judged bump without breaking immutability.)
- TODO(open-question: on redact, purge public bytes immediately vs retain encrypted internally — retention policy.)
- TODO(open-question: digest algorithm/prefix; expose a digest-pin URL alias at v1 or defer.)
- TODO(open-question: does a slug ever change (rename) — 301 from old slug vs new item + provenance link.)
- TODO(open-question: sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged.)
- TODO(open-question: timestamp + timezone policy for `published_at` / `redacted_at` — do not invent.)

## 7. Implications for runbooks

- **Storage/index runbook:** `Version`마다 `{slug, semver, digest, published_at, status, successor, audit
  record}`를 영속화; write 시점에 "never reuse `(slug, semver)`"를 강제.
- **Publish-gate runbook:** 승인 시 semver를 할당/검증(downgrade/reuse는 reject), canonical serialization에 대해 digest 계산, provenance + boundary-recheck 결과 기록, *그 후에* version을 주소 지정 가능하게 만듦.
- **Website build runbook:** moving + pinned 페이지 emit; `rel=canonical` + immutable 캐시 헤더 설정; 410 tombstone 페이지 생성; unpublish된 item(+ 정책에 따라 deprecated version)을 sitemap/index에서 제외.
- **API runbook:** 위의 resource 트리; `digest`/`ETag`; 404가 아닌 **410 + 기계 판독 가능 tombstone body**; `/api/v1`을 content `{semver}`와 직교하게 유지.
- **Unpublish/redact runbook:** Jimmy 승인, audit되는 연산으로 status를 뒤집고, `latest`를 재지정하고, 영향받는 주소에 대해 CDN/캐시를 무효화하며, byte가 purge되기 전에 불변 audit 기록을 작성.
</parameter>

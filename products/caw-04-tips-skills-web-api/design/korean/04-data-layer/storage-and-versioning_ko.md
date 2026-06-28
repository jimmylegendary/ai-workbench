# Storage & Versioning — md/MDX-in-Git, slug/semver 레이아웃, 불변 버전, tombstone

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-model_ko.md](./content-model_ko.md) — 저장되는 레코드(public projection + audit sidecar)
  - [./public-safe-and-provenance_ko.md](./public-safe-and-provenance_ko.md) — sidecar가 담는 것 + 재확인
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (이를 비준)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (gate + 감사 ledger)
  - [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md) / [../01-decisions/ADR-0007-api-design_ko.md](../01-decisions/ADR-0007-api-design_ko.md) (버전 정체성을 소비)
  - [../02-research/versioning-and-immutability_ko.md](../02-research/versioning-and-immutability_ko.md) (연구 근거)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 데이터 레이어 문서는 **게시된 콘텐츠가 물리적으로 어디에 사는지**와 **버전이 어떻게 불변하고 주소 지정
가능해지는지**를 명시합니다: markdown/MDX-in-git 정본(source of truth), `<slug>/<semver>` 디스크 레이아웃,
semver + content-digest 하이브리드 정체성, 동결/재사용 금지 규칙, 그리고 deprecate / unpublish / redact를 통한
제거(HTTP 410 tombstone). 이는 [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)를 구체화합니다.
frontmatter 필드([content-model](./content-model_ko.md)), 경계 재확인
([public-safe-and-provenance](./public-safe-and-provenance_ko.md)), 웹/API 리소스 스킴
([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md))은 정의하지 **않습니다**.

## 정본(source of truth): CAW-04 자체 git repo의 markdown/MDX

게시된 콘텐츠는 **CAW-04 자체 git repo 안의 YAML frontmatter가 있는 markdown/MDX**입니다 — DB도 없고 공유
substrate도 없습니다. repo가 곧 검증된 공개 코퍼스입니다: 동결되고 diff 가능한 파일 집합이며, **공개 요청에서
어떤 내부 store로 가는 라이브 경로가 없습니다**. 이것이 가장 저렴한 public-safe-by-construction 이야기입니다
(see [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) 및
[ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)).

파일은 in-core public-safe 재확인이 통과한 **후에** `ContentSourceAdapter`에 의해 기록됩니다
(see [public-safe-and-provenance](./public-safe-and-provenance_ko.md) 및
[ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)) — public-safe로 재유도되기 전에는 아무것도 디스크에
내려앉지 않습니다.

### 리포지토리 레이아웃

```
src/content/
  tips/        <slug>/<semver>.md        + <slug>/<semver>.audit.yml   (sidecar, never served)
  skills/      <slug>/<semver>.mdx       + <slug>/<semver>.audit.yml
  workflows/   <slug>/<semver>.mdx       + <slug>/<semver>.audit.yml
  playbooks/   <slug>/<semver>.mdx       + <slug>/<semver>.audit.yml
assets/        <slug>/…                  large media by path (CDN-backed)
_events/       ledger.ndjson             hash-chained publish/unpublish/redact log
index.json                              derived API manifest (regenerable; NOT source of truth)
```

| Path piece | 규칙 |
|---|---|
| `{kind}/` | 네 가지 게시 가능 종류 중 하나; frontmatter의 `kind`와 일치 |
| `<slug>/` | 산출물의 안정적 공개 `id`; 한 디렉터리가 한 산출물의 **모든** 버전을 담음 |
| `<semver>.md(x)` | 불변 게시 버전 하나; **public projection**만 |
| `<semver>.audit.yml` | 그 정확한 버전의 **audit sidecar**; 빌드 출력에서 제외됨(firewall 참고) |
| `index.json` | 빌드 시 파일로부터 파생됨; 파일이 정본으로 남음 |
| `_events/ledger.ndjson` | append-only, 해시 체인된 감사 ledger([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)); git history가 중복된 두 번째 증인 |

새 버전은 같은 `<slug>/` 디렉터리의 **새 파일**입니다 — 기존 파일의 편집이 절대 아닙니다.

## 버전 정체성 — semver + content-digest 하이브리드

OCI `tag@digest` 및 npm `semver+integrity`를 본떴습니다: 두 축, 어느 하나만으로는 불충분.

| Axis | What | 할당/계산 | 역할 |
|---|---|---|---|
| **semver** (`2.1.0`) | 호환성 계약 | 게시 시 큐레이터가 **할당** | 사람/에이전트 대면 정체성; URL/path 세그먼트 |
| **content-digest** (`sha256:…`) | 무결성 증명 | 게시 시 정규(canonical) 직렬화에 대해 **계산** | 불변성 증명; 대체 주소 키; 강한 `ETag` |
| **`published_at`** | 최신성/정렬 | 게시 시 기록 | 메타데이터일 뿐 — **절대** 정체성이 아님 |

### 콘텐츠 적응형 semver bump 규칙

semver는 코드용으로 설계되었으나 여기서는 **행동 변화(action change)**를 게이팅합니다. 따라서 `^2.0.0`에 핀된
에이전트는 행동을 바꾸는 가이드를 결코 조용히 받지 않습니다.

| Bump | Tip/Skill/Workflow/Playbook에 대한 의미 |
|---|---|
| **MAJOR** | 독자/에이전트가 *다른 행동*을 취하게 됨(단계 제거/재배열, 전제조건 변경, 권고 반전) |
| **MINOR** | 가산적이고 하위 호환(새 example, 선택적 단계, rationale 명확화) |
| **PATCH** | 외형적 / 행동 변화 없음(오타, 서식, 링크 수정) |

### 콘텐츠 다이제스트(content digest)

```
digest = "sha256:" + sha256( canonical_serialization(public_projection) )

canonical_serialization:
  - frontmatter keys sorted (normalized order)
  - LF newlines; trailing whitespace trimmed
  - markdown body appended after a single normalized delimiter
  - covers the PUBLIC PROJECTION (see open question on whether the sidecar is in/out)
```

다이제스트는 **게시 시 계산되고 동결**되며, `Version`에 저장되고, API 본문에서는 `content_hash`로, 그리고 강한
`ETag`로 표면화됩니다. `latest` 응답은 해석된 `semver` + `digest`를 포함하여 호출자가 결정적으로 다시 핀할 수
있게 합니다. TODO(open-question: exact canonicalization spec + which metadata fields are inside the hashed
envelope; digest algorithm/prefix convention `sha256:` vs multihash.)

## 불변성 규칙 (계약)

1. `(slug, semver)` 쌍은 한 번 게시되면 **영원히 동결됨** — 바이트와 다이제스트가 결코 바뀌지 않음.
2. `(slug, semver)` 쌍은 한 번 사용되면 **절대 재사용되지 않음** — unpublish/redact 이후에도. 이는 편집된
   주소가 다른 콘텐츠로 조용히 다시 채워지는 것을 방지함. 저장 런북이 기록 시점에 강제함.
3. 게시된 산출물의 모든 변경 = 새 semver를 가진 **새 `Version`**(따라서 새 다이제스트). 오타 수정은 새 PATCH임;
   in-place 편집은 없음.

따라서 버전을 핀한 소비자는 바이트가 동일한 콘텐츠를 돌려받거나 **명확한 tombstone**을 받습니다 — 조용히 변형된
콘텐츠는 절대 받지 않습니다.

## 제거 — 세 가지 구별되는, 감사되는, Jimmy 승인 작업

Brief §3 use-case 4("경계가 바뀌면 unpublish / redact")는 실제로는 세 가지 작업입니다. 이를 혼동하는 것이 주된
위험입니다. 셋 모두 `_events` ledger에 기록되는 Jimmy 승인 이벤트이며, 어느 것도 조용한 삭제가 아닙니다.

| Operation | 범위 | 공개 동작 | 보존되는 기록 |
|---|---|---|---|
| **Deprecate** | 버전 또는 아이템 | 여전히 제공됨; 보이는 `deprecated` 플래그 + 후속(successor) 포인터; API 경고 필드/헤더 | 전체 레코드 |
| **Unpublish** | 아이템 전체(모든 버전) | 모든 아이템 라우트 → **HTTP 410 Gone**; index/listing/sitemap에서 제거; 웹 tombstone 페이지 | 감사용 provenance + 메타데이터 유지; 바이트는 정책에 따름 |
| **Redact** | 단일 버전(또는 필드) | 그 버전 → **410 Gone** tombstone; 형제 버전은 영향 없음; `latest`는 redact되지 않은 최신으로 재지정 | 불변 감사 레코드(무엇을/왜/언제/누가); 공개 바이트는 퍼지됨 |

### Tombstone 의미론

- **410 Gone, 404 아님.** 410은 "존재했으나 의도적으로 제거됨"을 말함 — 빠른 SEO 디인덱스에 적합하고,
  에이전트에 정직하며, 감사 추적과 일관됨. **301**은 콘텐츠가 실제로 *이동*했을 때만 사용됨(rename/merge),
  경계 제거에는 절대 아님.
- **Tombstone, 절대 재작성 안 함.** `(slug, semver)`는 결코 재사용되지 않으므로, redact된 주소는 영구적으로
  `{id, semver, digest, redacted_at, reason_code}`를 담은 410 tombstone으로 해석됨. 이를 핀한 캐셔는 콘텐츠가
  교체되는 대신 끌어내려졌음을 알게 됨 — 이것이 불변성 약속을 지키면서 *동시에* 제거를 허용함.

```json
// 410 machine-readable tombstone body (API)
{
  "status": "gone",
  "id": "summarize-pr-diff",
  "semver": "1.2.0",
  "digest": "sha256:…",
  "redacted_at": "TODO(set at redact)",
  "reason_code": "boundary-changed",
  "successor": null
}
```

- **Provenance는 바이트가 퍼지된 후에도 유지됨**(see [public-safe-and-provenance](./public-safe-and-provenance_ko.md#감사-추적audit-trail)).
- 경계 재확인은 모든 (재)게시마다 실행됨; unpublish/redact는 그 실패 모드 대응물.

## 파생 index & 감사 증인

- `index.json`은 빌드 시 파일로부터 **재생성 가능**(API가 소비, [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md));
  결코 정본이 아니며 처음부터 다시 빌드됨.
- 게시 ledger(`_events/ledger.ndjson`)는 **append-only이고 해시 체인됨**
  (`hash = H(prev_hash ‖ canonical(line))`, [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md));
  **git history가 중복된 두 번째 증인**. 두 독립 증인이 변조를 탐지 가능하게 만듦.

## 미해결 질문(Open Questions)

`../08-research-plan/open-questions_ko.md`로 승격:

- TODO(open-question: exact canonical serialization spec + which metadata fields are inside the hashed envelope vs a mutable side-band — e.g. is `deprecated` inside the digest?)
- TODO(open-question: who/what assigns the semver bump — curator-only vs diff-assisted proposal Jimmy approves; how a mis-judged bump is corrected without breaking immutability.)
- TODO(open-question: on redact, purge public bytes immediately vs retain encrypted internally for audit — legal/retention policy.)
- TODO(open-question: digest algorithm + prefix convention; expose a digest-pin URL alias at v1 or defer? Coordinate with [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md).)
- TODO(open-question: does a slug ever change (rename) — 301 from old slug vs new item + provenance link; interaction with old-version URL immutability.)
- TODO(open-question: sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged.)

## 런북(runbook)에 대한 함의

- **Storage 런북**은 `Version`마다 `{slug, semver, digest, published_at, status, successor, audit-record-ref}`를
  영속화하고 기록 시점에 **"`(slug, semver)` 절대 재사용 금지"를 강제**한다; sidecar를 각 파일 옆에 두는
  `<kind>/<slug>/<semver>` 레이아웃을 깐다.
- **Publish-gate 런북**은 semver를 할당/검증하고(다운그레이드/재사용 거부), 정규 직렬화에 대해 다이제스트를
  계산하며, 버전이 주소 지정 가능해지기 전에 provenance + 경계 재확인 결과를 기록한다.
- **Build 런북**은 파일로부터 `index.json`을 재생성하고 unpublished/redacted 주소에 대해 410 tombstone
  페이지/본문을 방출한다; sitemap/index에서 unpublished 아이템(그리고 정책에 따라 deprecated 버전)을 제외한다.
- **Unpublish/redact 런북**은 Jimmy 승인의 감사되는 작업으로, status를 전환하고 `latest`를 재지정하며 영향받는
  주소의 캐시/CDN을 무효화하고 바이트가 퍼지되기 전에 불변 감사 레코드를 기록한다.

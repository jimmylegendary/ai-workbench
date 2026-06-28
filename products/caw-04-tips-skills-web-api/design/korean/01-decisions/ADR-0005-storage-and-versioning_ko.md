# ADR-0005: 저장소는 git 내 markdown/MDX 우선; 불변 content-addressable 버전

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§5 versioning, §6 data)
  - [../02-research/versioning-and-immutability_ko.md](../02-research/versioning-and-immutability_ko.md) (이 ADR이 승인하는 research)
  - [../02-research/content-model-and-metadata_ko.md](../02-research/content-model-and-metadata_ko.md)
  - [./ADR-0002-content-model_ko.md](./ADR-0002-content-model_ko.md) (저장되는 엔티티 + frontmatter)
  - [./ADR-0003-publishing-policy-and-public-safe-gate_ko.md](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (gate + hash-chained audit)
  - [./ADR-0004-import-and-ports_ko.md](./ADR-0004-import-and-ports_ko.md) (재검증된 항목이 여기에 안착)
  - [./ADR-0006-web-stack_ko.md](./ADR-0006-web-stack_ko.md) / [./ADR-0007-api-design_ko.md](./ADR-0007-api-design_ko.md) (version identity를 소비)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

CAW-04는 자신의 콘텐츠 저장소를 소유하며(brief §6), 하나의 가치 단위를 publish한다: 바로 **published, versioned,
public-safe artifact**로서, 그 published 버전들은 **불변 + addressable**하다(brief §5). 작용하는 힘들:

- **공개 read surface, curator만 write 가능; 공개 write API 없음**(brief §10). 모든 publish는 Jimmy의 승인을 거친다.
  이는 다른 곳에서라면 순수 content-hash 방식을 강제했을 다중 저자 write race를 제거한다.
- **불변성은 신뢰 + audit를 떠받치는 핵심**(brief §5 uc5). 어떤 버전을 pin한 소비자는 바이트 단위로 동일한 콘텐츠를
  되받거나, 명확한 tombstone을 받아야 한다 — 결코 조용히 변형된 콘텐츠를 받아서는 안 된다.
- **Agent는 일급 소비자**다 — 이들은 pin/cache하며 기계가 검증 가능한 integrity key와 사람이 읽을 수 있는 호환성
  신호를 모두 필요로 한다.
- **boundary는 publish 이후에도 변할 수 있다**(brief §3 uc4) — redaction/unpublish는 정직한 cacher에 대한 불변성
  약속을 깨지 않으면서 실제로 일어나야 한다.
- **공유 substrate 없음; ports & adapters**(brief §1, §8) — 저장소는 형제 제품과 공유되는 서비스가 될 수 없으며,
  version identity는 sink-agnostic해야 한다([ADR-0004](./ADR-0004-import-and-ports_ko.md)).

## Options considered

### Storage substrate

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-04 전용 git repo 내 markdown/MDX 우선**(+ 파생 index, 대용량 asset은 path/CDN) | 콘텐츠를 직접 소유; git history = 중복 audit 증인; diff 가능한 PR 리뷰 *자체가* curator gate; 런타임/DB substrate 없음(brief §1); repo가 곧 검증된 공개 corpus(가장 저렴한 public-safe 구조) | 변경마다 rebuild; 수천 개 대용량 미디어에는 취약(완화: asset은 path로) | **Chosen** — brief §6과 정확히 일치 |
| Git 기반 CMS(git 위의 editor) | 편집 UX, git이 source of truth로 유지 | 추가 도구; 동일한 rebuild 모델 | curator 편의를 위해 나중에 선택 가능; architecture 변경 없음 |
| DB 기반 / headless CMS | 편집 workflow, 다수 페이지로 확장 | 콘텐츠가 git을 떠남; 서비스+DB 추가(shared-substrate 냄새); provenance/version pin이 더 어려움; 누출 표면 증가 | v1 거부 — brief §6/§1과 충돌 |

### Version identity

| Scheme | Pros | Cons | Fit |
|---|---|---|---|
| Date / CalVer | 직관적인 최신성 | 호환성 신호 없음; 같은 날 충돌 | metadata 전용 |
| **Semver** | 기계가 읽는 호환성(breaking/feature/fix); agent가 pin 가능; 업계 표준 | 사람의 bump 판단 필요; self-verifying 아님 | **주요 human/agent identity** |
| **Content digest**(canonical serialization의 `sha256:`) | self-verifying integrity; 본질적으로 불변; 대체 addressable key | 사람에게 불투명; 호환성 신호 없음 | **immutability/integrity 계층** |

## Decision

**Storage:** CAW-04 **전용 git repo** 내 YAML frontmatter를 갖춘 markdown/MDX가 source of truth이며, public-safe
재검증 *이후* `ContentSourceAdapter`가 채운다([ADR-0004](./ADR-0004-import-and-ports_ko.md)). 레이아웃:
`src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`. Audit 전용 필드(`origin_ref`,
`origin_version`, redaction 내부 — [ADR-0002](./ADR-0002-content-model_ko.md))는 **파일 옆의 sidecar
record에 두고 served output에서 제외**하며, 렌더링되는 frontmatter에는 결코 넣지 않는다. 대용량 asset은 path/CDN.
파생 **index**(`index.json` manifest)는 API를 위해 파일들로부터 빌드된다([ADR-0007](./ADR-0007-api-design_ko.md)) —
파일이 source of truth로 남고, index는 재생성 가능하다. publish ledger는
[ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md)의 hash-chained append-only `_events` 로그이며,
git history가 중복된 두 번째 증인 역할을 한다.

**Version identity — hybrid**(OCI `tag@digest`와 npm `semver+integrity`를 본뜸):

1. **Semver** = curator가 publish 시 부여하는 published version identity(`triage-incident @ 2.1.0`); human/agent
   호환성 계약이자 주요 URL/path 세그먼트. 콘텐츠에 맞춘 bump 규칙:
   - **MAJOR** = reader/agent가 *다른 행동*을 취하게 될 만큼 guidance가 변경됨(단계 제거/재배열, 전제조건 변경,
     권장사항 반전).
   - **MINOR** = 추가적이고 backward-compatible(새 example, optional 단계, 명확해진 rationale).
   - **PATCH** = 표면적 / 동작 변화 없음(오타, 서식, 링크 수정).
2. **Content digest** = markdown body + audited metadata envelope의 **canonical serialization**(정규화된 frontmatter
   key 순서, LF newline, 끝 공백 제거)에 대한 `sha256:`. publish 시 계산되어 고정됨; 모든 `Version`에 저장됨;
   immutability proof + 대체 addressable key; API body에 `digest`로, 그리고 강한 `ETag`로 노출됨.
3. **`published_at`** = 필수 metadata(최신성, audit, 정렬), 결코 identity가 아님.

**Immutability rules (계약):**

- `(slug, semver)` 쌍은 한 번 publish되면 **영원히 고정** — 바이트와 digest는 결코 변하지 않는다.
- `(slug, semver)` 쌍은 한 번 사용되면 **결코 재사용되지 않는다** — unpublish 이후에도(redact된 주소가 다른
  콘텐츠로 조용히 다시 채워지는 것을 방지). storage runbook이 write 시점에 강제한다.
- published artifact에 대한 모든 변경 = 새 semver(따라서 새 digest)를 가진 **새 `Version`**. 오타 수정은 새 PATCH이며,
  in-place 편집은 존재하지 않는다.

**Removal — 서로 구별되고, audit되며, Jimmy가 승인하는 세 가지 작업**(brief §3 uc4를 혼동하지 말 것):

| Operation | Scope | Public behaviour | Record |
|---|---|---|---|
| **Deprecate** | version 또는 item | 여전히 served; 보이는 `deprecated` 플래그 + 후속 포인터; API warning 필드/header | 유지 |
| **Unpublish** | item 전체 | item route는 **HTTP 410 Gone** 반환; index/listing/sitemap에서 제거; 웹 tombstone 페이지 | audit용 provenance + metadata 보존 |
| **Redact** | 단일 version(또는 필드) | 해당 version → **410 Gone** tombstone; 형제 version은 영향 없음; `latest`는 redact되지 않은 최신으로 재지정 | 불변 audit record(무엇/왜/언제/누가); public 바이트는 purge |

- **410 Gone, 404 아님** — "존재했으나 의도적으로 제거됨"을 의미한다(SEO de-index에 적절, agent에 정직, audit와 일관).
  **301**은 콘텐츠가 실제로 *이동*한 경우(rename/merge)에만 사용하며, boundary 제거에는 사용하지 않는다.
- **Tombstone, 결코 rewrite하지 않음** — `(slug, semver)`는 결코 재사용되지 않으므로, redact된 주소는 영구적으로 410
  tombstone(id, semver, digest, `redacted_at`, 기계가 읽을 수 있는 이유)으로 resolve된다. 이는 불변성 약속을 지키면서
  *동시에* 제거를 허용한다. 내부 source로의 provenance는 바이트가 purge된 후에도 보존된다.
- boundary 재검증은 모든 (re)publish마다 실행된다([ADR-0004](./ADR-0004-import-and-ports_ko.md)); unpublish/redact는
  그 failure-mode 대응물이다.

## Consequences

- **쉬움:** 배포/published된 corpus는 고정되고 검증된 파일 집합이다 — 공개 요청에서 어떤 내부 저장소로도 이어지는 live
  경로가 없다([ADR-0006](./ADR-0006-web-stack_ko.md)가 이 위에 세워짐). Audit는 "git history + hash-chained ledger"다.
- **쉬움:** agent는 두 축을 모두 얻는다 — semver는 "이것이 breaking change인가?"에, digest는 "이것이 내가 신뢰하는
  정확한 바이트인가?"에 답한다. `latest` 응답은 resolve된 `semver` + `digest`를 포함하므로 호출자가 결정론적으로 re-pin할
  수 있다.
- **어려움 / 비용:** 콘텐츠 업데이트에 rebuild+deploy가 필요하다(curator cadence에서는 수용 가능 — [ADR-0006](./ADR-0006-web-stack_ko.md)).
  대용량 미디어에는 asset-by-path 규율이 필요하다. semver bump에는 사람의 판단이 필요하다(diff-assisted 제안 가능).
- **Follow-on:** storage runbook은 `Version`마다 `{slug, semver, digest, published_at, status, successor,
  audit record}`를 persist하고 "`(slug, semver)` 재사용 금지"를 강제한다; publish-gate runbook은 semver를
  부여/검증하고(downgrade/재사용 거부) version이 addressable해지기 전에 digest를 계산한다.

## Open questions / revisit triggers

- TODO(open-question: 정확한 canonical serialization 스펙 + 어떤 metadata 필드가 hash된 envelope 안에 있고 어떤 것이
  mutable side-band인지 — 예: `deprecated`가 digest 안에 있는가).
- TODO(open-question: 누가/무엇이 semver bump를 부여하는가 — curator만 vs Jimmy가 승인하는 diff-assisted 제안; 잘못
  판단된 bump를 불변성을 깨지 않으면서 어떻게 교정하는가).
- TODO(open-question: redact 시, public 바이트를 즉시 purge할지 vs audit를 위해 내부적으로 암호화 보존할지 —
  법적/보존 정책).
- TODO(open-question: digest 알고리즘 + prefix 관례(`sha256:` vs multihash); v1에 digest-pin URL alias를 노출할지
  연기할지). [ADR-0007](./ADR-0007-api-design_ko.md)와 조율.
- TODO(open-question: slug가 변경(rename)되는 경우가 있는가 — 옛 slug에서 301 vs 새 item + provenance 링크; 옛 버전
  URL 불변성과의 상호작용).
- TODO(open-question: deprecated되었으나 여전히 served되는 버전에 대한 sitemap/index 동작 — listed, hidden, 또는
  flagged).
- **Revisit trigger:** git+rebuild를 고통스럽게 만드는 catalog/미디어 볼륨은 substrate 선택을 재검토하게 만든다(DB가
  아니라 git 기반 CMS 방향으로).

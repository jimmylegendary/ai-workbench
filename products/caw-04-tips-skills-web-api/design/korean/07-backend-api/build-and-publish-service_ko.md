# Build & Publish 서비스 (Astro SSG + PublishSink)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md) (Build/Publish 동작 계약)
  - [./import-service_ko.md](./import-service_ko.md) (빌드 전에 corpus를 채우는 것)
  - [./persistence_ko.md](./persistence_ko.md) (빌드가 읽는 md-in-git 소스)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack_ko.md)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **build & publish 서비스**를 설명한다: Astro 5 + Starlight SSG가 어떻게 md-in-git corpus를 동결된 정적
산출물(HTML + 원본 markdown + JSON + manifests)로 바꾸는지, 그 산출물이 `SiteAndApiSinkAdapter`를 통해 어떻게 배포되는지,
무엇이 재빌드를 트리거하는지, 그리고 unpublish/redact가 캐시/CDN을 어떻게 정리(purge)하는지를 다룬다. 이 문서는 content
model, 재검사(see [./import-service_ko.md](./import-service_ko.md)), 또는 공개 REST 리소스 스킴(그것은 발행된 산출물이며
[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)에서 다룬다)을 정의하지 **않는다**.

## 설계 속성: 구조적으로 public-safe

배포된 산출물은 **어떤 내부 또는 upstream 저장소로도 요청 시점(request-time) 경로가 없는, 동결되고 검증된 정적 파일
집합**이다 ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md),
[ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)). 빌드가 마지막 강제 지점이다: **fail-closed 불변식**이 emit되는 모든
항목에 대해 `boundary == public`을 단정하며, **그렇지 않으면 전체 빌드를 실패시킨다** — 아무것도 배포되지 않는다.
Web/API 동등성(parity)은 구조적이다: 하나의 빌드가 하나의 canonical 소스로부터 모든 projection을 emit한다
([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).

## 빌드 파이프라인 (단계)

```
read corpus (md-in-git, sidecar excluded)
  -> validate frontmatter against content-model schema
  -> ASSERT boundary == public for every item        [fail-closed gate]
  -> render HTML pages (Starlight)                    [human surface]
  -> emit raw .md per (slug, semver)                  [low-token agent surface]
  -> emit JSON envelope per (slug, semver)            [MCP/programmatic surface]
  -> emit SKILL.md + manifest.json (skills)           [distribution format, ADR-0007]
  -> emit index.json manifest + per-kind listings     [discovery]
  -> emit MCP resources view                          [MCP host]
  -> emit sitemap (excludes unpublished/redacted)
  -> verify-output stage (parity + leak scan)
  -> hand artifact to PublishSinkAdapter.publish
```

| Stage | Input | Output | 실패 모드 |
|---|---|---|---|
| read | git working tree | in-memory entries | `READ_ERROR` |
| schema-validate | entries | typed entries | `SCHEMA_NONCONFORMANT` (빌드 실패) |
| **boundary assert** | typed entries | confirmed-public entries | `BOUNDARY_NOT_PUBLIC` (빌드 실패) |
| render/emit | entries | static files | `RENDER_ERROR` |
| verify-output | static files | verified artifact | `PARITY_MISMATCH` / `LEAK_DETECTED` (빌드 실패) |

**verify-output** 단계는 두 번째, 렌더링 후(post-render) 방어선이다: *렌더링된* 출력을 confidential 패턴과 유출된
`origin_ref`/`origin_version`(sidecar 필드, [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md))에 대해 재스캔하고,
HTML/markdown/JSON projection이 `(slug, semver, digest)` 단위로 일치함을 단정한다.

## 빌드 범위(Build scope)

```ts
interface BuildScope {
  mode: "full" | "incremental";       // v1: full is the safe default
  reason: "publish" | "unpublish" | "redact" | "deprecate" | "manual" | "scheduled";
  slugs?: string[];                   // hint only; correctness never depends on it
}
interface BuildArtifact {
  artifact_id: string;                // content-addressed build id
  built_at: string;
  item_count: number;
  digests: Record<string, string>;    // (slug@semver) -> sha256 of emitted canonical body
}
```

- **v1 기본값은 전체 재빌드(full rebuild)이다.** publish 주기는 큐레이터 페이스이며 저빈도이므로
  ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)), 전체 재빌드는 저렴하고 incremental-staleness 유출
  위험을 제거한다. incremental은 동일한 boundary 단정으로 게이트되는, 추후로 미뤄진 최적화이다.
- 이전 버전은 정적 파일로 남는다(불변성, [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). 재빌드는 그것들을
  바이트 단위로 동일하게 다시 emit한다(digest 검사가 drift를 방지한다).

## 재빌드 트리거

모든 publish/unpublish는 재빌드+배포를 트리거한다 ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
§Consequences). 트리거:

| Trigger | Source | Scope.reason | 비고 |
|---|---|---|---|
| 큐레이터 `approve` | curator surface ([api-surface](./api-surface_ko.md)) | publish | 주요 경로; 승격 + 재빌드 |
| `unpublish` / `redact` | curator surface | unpublish/redact | 반드시 CDN도 purge (아래) |
| `deprecate` | curator surface | deprecate | 여전히 서빙됨; flag + successor 재emit |
| content repo로의 Git push | corpus repo main | manual | PR 병합이 곧 큐레이터 게이트 ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)) |
| 예약된 drift 검사 | scheduler | scheduled | 배포된 digest == corpus digest를 재검증 |

트리거 메커니즘 자체가 미해결 질문이다 ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
TODO: rebuild-trigger). v1 방향: `PublishSinkAdapter`가 큐레이터 surface가 approve/unpublish 시 호출하는
`requestRebuild(scope)`를 노출하고, content-repo push에 대한 webhook이 중복 트리거 역할을 한다.

## PublishSinkAdapter를 통한 배포

배포는 활성 sink에 위임된다 ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §1). v1 sink =
`SiteAndApiSinkAdapter`; 문서화된 stub = `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`,
`SyndicationSinkAdapter` (config로 비활성화됨; preflight는 `active` stub을 거부한다).

```ts
interface PublishSinkAdapter {
  capabilities(): AdapterCapabilities;          // requiresPublicSafe: true (cannot self-disable)
  canAccept(item: PublishableItem): Acceptance;
  publish(artifact: BuildArtifact, ctx: PublishCtx): PublishReceipt;
  unpublish(ref: ItemRef, ctx: PublishCtx): PublishReceipt;
  requestRebuild(scope: BuildScope): void;
}
interface PublishReceipt { artifact_id: string; deployed_at: string; urls: string[]; purged?: string[]; }
```

- adapter는 이미 재검사·승인·버전 부여되고 `boundary=public`인 `PublishableItem`들로 구성된, 빌드된 `BuildArtifact`만을
  받는다. adapter는 boundary 로직을 **전혀** 수행하지 않는다(그것은 코어 전용, [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §2).
- 배포는 **원자적(atomic) + 빌드 단위 불변(immutable-by-build)**이다: 새로운 불변 산출물을 publish한 다음, 서빙되는 root를
  원자적으로 전환(flip)한다(절반만 배포된 상태 없음). 롤백 = 이전 산출물로 다시 가리킴.

## Unpublish / redact → 캐시 & CDN purge

제거는 실제적이며 audit된다 ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). 배포된 집합은 정적이고
캐시되므로, 제거 시 반드시 모든 캐시된 복사본을 purge해야 한다. 그렇지 않으면 410 처리된 항목이 여전히 서빙될 수 있다.

| Op | 빌드 효과 | 라우팅 | CDN/캐시 purge |
|---|---|---|---|
| **Deprecate** | `deprecated` flag + successor를 달아 버전 재emit | 여전히 200, warning 필드/헤더 | 변경된 페이지만 purge |
| **Unpublish** (item) | index/listing/sitemap에서 모든 버전 제거; web tombstone emit | 모든 item route → **HTTP 410 Gone** | 모든 item URL (HTML/.md/.json) + index + sitemap purge |
| **Redact** (version) | 해당 버전 제거; `latest`는 가장 최신의 non-redacted로 재지정; tombstone emit | 해당 버전 → **410 Gone**; 형제(sibling)는 영향 없음 | 해당 버전 URL + `latest` alias + index purge |

Purge 규칙:

- **410 Gone을 사용하고 404가 아니다** — "존재했으나 의도적으로 제거됨"; agent에게 정직하고 SEO de-index에 올바르다
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). `301`은 진짜 이동(rename/merge)에만 사용하며, boundary
  제거에는 결코 사용하지 않는다.
- Purge 순서: **tombstone 산출물을 먼저 배포한 다음, 영향받는 경로에 대해 CDN purge를 발행**한다 — 그래야 캐시 미스 시
  stale한 공개 바이트가 아니라 410을 다시 가져온다. purge-verify 단계가 purge된 URL을 재요청하여 410을 단정한다.
- `(slug, semver)`는 결코 재사용되지 않으므로, redact된 주소는 영구적으로 그 410 tombstone(id, semver, digest,
  `redacted_at`, 기계 판독 가능한 reason)으로 해석된다 — 불변성 약속이 지켜지고 *동시에* 제거도 준수된다.
- sink `PublishReceipt.purged[]`가 purge된 URL을 기록한다. audit 이벤트(`unpublish`/`redact`)가 hash-chained 원장에
  추가된다 ([./api-surface_ko.md](./api-surface_ko.md) Audit ops).

## 실패 & 롤백

| Failure | 동작 |
|---|---|
| Boundary/leak/parity 단정 실패 | 빌드 중단; 이전 산출물이 라이브 유지; 아무것도 배포되지 않음 |
| 배포 flip 실패 | 서빙 root 변경 없음(원자적 flip); 재시도 또는 롤백 |
| unpublish 후 CDN purge 실패 | **alert + 재시도**; 인시던트로 취급 — purge 확인 전까지 stale한 공개 바이트는 가드레일 위반 (brief §11) |
| drift 검사가 배포된 digest != corpus를 발견 | 전체 재빌드 트리거; alert |

## 미해결 질문(Open Questions)

- TODO(open-question: rebuild-trigger 메커니즘 — sink `requestRebuild` vs webhook vs CI; [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)).
- TODO(open-question: CDN/host 선택 + 정확한 purge API; purge가 path-level인지 tag-level인지 — sink adapter에 영향).
- TODO(open-question: incremental 빌드 안전성 — 전체 boundary 단정을 건너뛸 수 있는가? 기본은 no).
- TODO(open-question: 검색 — 사전 빌드된 client index vs 지연된 runtime endpoint; [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)).
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북(runbook)에 대한 함의

- 런북은 git에서 corpus를 읽는 Astro 5 + Starlight 프로젝트를 세우고 ([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)), 하나의 빌드에서 HTML + .md + .json + manifests를 emit한다 ([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).
- 런북은 **fail-closed `boundary == public`** 단정과 렌더링 후 verify-output leak/parity 스캔을 CI에 연결한다. 성공(green) 빌드는 배포의 전제조건이다.
- 런북은 원자적 flip + 롤백을 갖춘 `SiteAndApiSinkAdapter`와, 410을 반환하는 unpublish/redact **purge-then-verify** 흐름을 구현한다.
- 런북은 [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)에 따라 sink stub(`maturity="stub"`, config 비활성화)을 출하한다.

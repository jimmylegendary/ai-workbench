# Persistence (md-in-git 콘텐츠 저장소 + Sidecar Audit + Index)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md) (Versioning + Audit 동작 계약)
  - [./import-service_ko.md](./import-service_ko.md) (재검사 + 승인 후 저장소에 write하는 것)
  - [./build-and-publish-service_ko.md](./build-and-publish-service_ko.md) (빌드를 위해 저장소를 읽는 것)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **persistence 계층**을 설명한다: CAW-04의 source of truth인 markdown/MDX-in-git 콘텐츠 저장소, provenance를
보관하며 web/API로 결코 직렬화되지 않는 **audit 전용 sidecar**, API를 공급하는 파생된 **index**, 그리고 upstream이
`origin_ref`로 참조되는 방식을 다룬다. 이는 백엔드에 대해 [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)(저장소 +
버저닝)와 [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)(public-projection split)를 상술한다. 이 문서는
빌드/배포([./build-and-publish-service_ko.md](./build-and-publish-service_ko.md))나 재검사([./import-service_ko.md](./import-service_ko.md))를
결정하지 않는다.

## 설계 속성: 저장소가 곧 검증된 공개 corpus

콘텐츠 repo는 CAW-04의 **자체 git repo**이다 ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)) — DB 없음,
공유 runtime substrate 없음 (brief §1). 이는 public-safe 재검사 + 큐레이터 승인 **이후에만** `ContentSourceAdapter`에
의해 write된다 ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)). 커밋된 파일 집합이 동결되고 검증된 공개
corpus이다. git history는 중복된 audit 증인이다. diff 가능한 PR 리뷰가 곧 큐레이터 게이트이다
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). **public-projection split**이 핵심 규칙이다:
audit 전용 필드는 web/API로 결코 직렬화되지 않는 sidecar에 있다(테스트로 강제,
[ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)).

## 저장소 레이아웃

```
src/content/
  tips/<slug>/<semver>.md
  skills/<slug>/<semver>.mdx
  workflows/<slug>/<semver>.md
  playbooks/<slug>/<semver>.md
.sidecar/                          # audit-only; NEVER built, NEVER served
  <kind>/<slug>/<semver>.audit.json
_events/                           # hash-chained append-only publish ledger (ADR-0003)
  ledger.ndjson
assets/                            # large media by path/CDN (not inlined)
index.json                         # DERIVED manifest (regenerable; not source of truth)
caw04.config.yaml                  # port/adapter registry + profiles.recheck (core)
```

`(slug, semver)`가 주소 지정 가능한 식별자이다. 파일 경로가 이를 직접 인코딩한다. 발행된 버전마다 하나의 파일 —
in-place 편집은 없다 ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

## 발행 파일: frontmatter + body (PUBLIC projection만)

```yaml
---
id: triage-incident            # stable slug
kind: skill                    # tip | skill | workflow | playbook
title: Triage a production incident
summary: Decision-ordered steps to triage and escalate.
version: 2.1.0                 # semver = published identity (ADR-0005)
digest: "sha256:..."          # content digest; immutability proof + strong ETag
boundary: public              # ONLY public is ever committed/served
published_at: 2026-01-01T00:00:00Z   # TODO(open-question: real value at write time)
status: published             # published | deprecated | unpublished | redacted
successor: null               # semver pointer when deprecated/redacted
safety_boundary: public-safe  # the SafetyBoundary entity (ADR-0002)
# reusable + auditable skill metadata (ADR-0002):
inputs: [...]
outputs: [...]
preconditions: [...]
provenance_public: "Imported from validated internal source; details audited internally."
---
<markdown body>
```

여기에는 **`origin_ref` / `origin_version`이 없다.** 그 audit 전용 필드는 오직 sidecar에만 있다
([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)/[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
`provenance_public`은 public-safe 진술일 뿐이며, 결코 confidential 내부 정보를 명시하지 않는다.

## Sidecar (audit 전용 — 결코 web/API 아님)

```json
{
  "slug": "triage-incident",
  "semver": "2.1.0",
  "digest": "sha256:...",
  "origin_ref": { "product": "CAW-03", "id": "skl_8f12", "uri": "caw03://skills/skl_8f12" },
  "origin_version": "5.4.0",
  "fetched_at": "2026-01-01T00:00:00Z",
  "recheck_evidence_ref": "_events#seq=842",
  "redaction": { "applied": false, "internals": [] },
  "approved_by": "Jimmy",
  "approved_at": "2026-01-01T00:00:00Z"
}
```

- sidecar는 **Astro 빌드 입력에서 제외**되고 모든 서빙 projection에서 제외된다. 빌드 시점 + 테스트 시점 가드가 어떤
  sidecar 필드(특히 `origin_ref`/`origin_version`)도 어떤 HTML/.md/.json 출력으로 유출되지 않음을 단정한다
  ([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md), 테스트로 강제).
- provenance는 redact 시 공개 바이트가 purge된 후에도 보존된다(audit는 제거를 견디고 살아남는다,
  [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- upstream은 **`origin_ref`로만** 참조된다 — id/URI/version이며, 결코 공유 저장소가 아니다
  ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)). CAW-04는 콘텐츠의 자체 복사본을 보유한다.

## 버전 식별자 (semver + content-digest)

| Axis | Role | Computed |
|---|---|---|
| `semver` | human/agent 호환성 + 주요 URL/path segment | approve 시 큐레이터 지정 ([./import-service_ko.md](./import-service_ko.md)) |
| `digest` | 자가 검증 불변성 증명 + 대체 키 + strong ETag | write 시 canonical serialization에 대한 `sha256:` |
| `published_at` | 최신성/audit/정렬 — **결코** 식별자가 아님 | write 시점 |

Semver bump 규칙 ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)): MAJOR = reader/agent가 *다른 행동*을
취하게 됨; MINOR = 가산적(additive) 하위 호환; PATCH = 외형적/동작 변화 없음.

digest를 위한 **Canonical serialization**: 정규화된 frontmatter 키 순서, LF 개행, 트림된 후행 공백, markdown body +
audit된 metadata envelope에 대해. (정확한 명세 + 어떤 필드가 해시된 envelope 안에 있고 어떤 것이 가변 side-band인지는
TODO(open-question), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md).)

## 불변성 + 제거 (write 시점 강제)

| Rule | Enforcement |
|---|---|
| `(slug, semver)` 영원히 동결 | write는 기존 경로에 대한 어떤 변경도 거부; 재빌드 시 digest 재검증 |
| `(slug, semver)` 결코 재사용 안 됨 | write는 한번이라도 존재했던 경로를 거부 (unpublish/redact 후에도) |
| 모든 편집 = 새 Version | in-place 편집 없음; 오타 수정도 새 PATCH |

제거 — 세 가지 구별되는 audit된 op ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)); 저장소 측 효과:

| Op | 저장소 효과 | 공개 효과 |
|---|---|---|
| Deprecate | 새 버전에 `status: deprecated` + `successor` 설정(in-place 아님); 파일 유지 | 여전히 서빙됨, 플래그됨 |
| Unpublish | 항목을 `unpublished`로 표시; `index.json`/sitemap에서 제거; provenance 유지 | 모든 route → 410 ([build-and-publish-service](./build-and-publish-service_ko.md)) |
| Redact | 버전을 `redacted`로 표시; 공개 바이트 purge; 불변 audit 기록 유지 | 버전 → 410 tombstone; `latest` 재지정 |

redact/unpublish된 주소는 영구적으로 `{id, semver, digest, redacted_at, reason}`을 담은 410 tombstone으로 해석된다 —
경로가 결코 재사용되지 않으므로 결코 재충전되지 않는다.

## 파생된 index

`index.json`은 빌드 시 **파일로부터 재생성**된다. 파일이 source of truth로 남는다
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). 이는 API discovery manifest를 구동하며
([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)) `published`/`deprecated` 버전만 나열한다(unpublished/redacted는
제외, 단 tombstone 참조로는 예외).

```json
{
  "generated_at": "2026-01-01T00:00:00Z",
  "items": [
    { "slug": "triage-incident", "kind": "skill",
      "latest": "2.1.0",
      "versions": [
        { "semver": "2.1.0", "digest": "sha256:...", "status": "published", "url": "/skills/triage-incident/2.1.0" },
        { "semver": "2.0.0", "digest": "sha256:...", "status": "deprecated", "successor": "2.1.0" }
      ] }
  ]
}
```

`latest`는 항상 가장 최신의 **non-redacted** 버전으로 해석되며, 해석된 `semver` + `digest`를 동반하므로 caller가
결정론적으로 재고정(re-pin)할 수 있다 ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

## Audit 원장 (`_events`)

publish 원장은 hash-chained 추가 전용 `_events/ledger.ndjson`이다
([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)); git history가 중복된 두 번째 증인이다.
모든 변경 op(import/recheck/approve/reject/publish/unpublish/redact/deprecate)는 `{seq, prev_hash, hash, op, slug?,
semver?, digest?, actor, at}`을 가진 정확히 하나의 이벤트를 추가한다 ([./api-surface_ko.md](./api-surface_ko.md) Audit ops).
`LEDGER_BROKEN` hash-chain 검증 실패는 publish를 중단시킨다.

## 미해결 질문(Open Questions)

- TODO(open-question: canonical serialization 명세 + 어떤 metadata 필드가 해시된 envelope 안에 있고 어떤 것이 가변 side-band인지 — 예: `deprecated`가 digest 안에 있는가; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- TODO(open-question: redact 시, 공개 바이트를 즉시 purge vs audit를 위해 내부적으로 암호화 보관 — 보존 정책; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- TODO(open-question: digest 알고리즘 + prefix (`sha256:` vs multihash); digest-pin URL alias를 v1에 노출 vs 연기; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)/[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).
- TODO(open-question: slug rename — 기존 slug에서 301 vs 새 항목 + provenance link; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- TODO(open-question: deprecated이지만 서빙되는 버전에 대한 sitemap/index 동작; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북(runbook)에 대한 함의

- 런북은 repo 레이아웃(`src/content/<kind>/<slug>/<semver>`, `.sidecar/`, `_events/`, `index.json`, `caw04.config.yaml`)을 스캐폴딩한다.
- 런북은 **write 가드**를 구현한다: 기존 경로의 변경을 거부하고 한번이라도 존재했던 경로의 재사용을 거부; 버전이 주소 지정 가능해지기 전에 digest를 계산 + 저장.
- 런북은 sidecar writer + **어떤 sidecar 필드도 직렬화되지 않음을 검증하는 테스트**를 어떤 HTML/.md/.json 출력에 대해 구현한다 ([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)).
- 런북은 index 생성기(파일로부터 재생성 가능)와 chain 검증을 갖춘 hash-chained 원장 appender를 구현한다.

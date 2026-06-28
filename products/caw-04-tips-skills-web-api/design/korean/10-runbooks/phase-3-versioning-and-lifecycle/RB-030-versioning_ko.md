# RB-030: semver + content-digest 할당, 버전 동결, canonical + pinned 주소 발행

- Status: ready
- Phase: phase-3-versioning-and-lifecycle
- Depends on: [RB-020 (저장소 레이아웃 + sidecar 분리), RB-021 (publish gate 쓰기 경로), RB-022 (SiteAndApi 빌드/발행)]
- Implements design:
  - [../../05-publishing-core/versioning-and-immutability_ko.md](../../05-publishing-core/versioning-and-immutability_ko.md)
  - [../../04-data-layer/storage-and-versioning_ko.md](../../04-data-layer/storage-and-versioning_ko.md)
  - [../../01-decisions/ADR-0005-storage-and-versioning_ko.md](../../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../../01-decisions/ADR-0007-api-design_ko.md](../../01-decisions/ADR-0007-api-design_ko.md)
- Produces: 버전 식별 모듈(`assign-semver`, `compute-digest`, `freeze-check`), 쓰기 시점의 freeze/never-reuse 강제, `Version`별 index 레코드, 그리고 moving-canonical + immutable-pinned URL/API 리소스 발행기.

## Objective

큐레이터가 승인한 아티팩트가 쓰기 경로에 도달하면, 시스템은 큐레이터가 선택한 **semver**를 할당하고, **public projection(공개 투영)만의** canonical 직렬화에 대해 동결된 **content-digest**를 계산하며, 해당 버전을 `src/content/{kind}/<slug>/<semver>.md(x)` 아래에 audit sidecar와 함께 새로운 불변(immutable) 파일로 영속화한다. 이미 존재하는 `(slug, semver)` 쌍을 다시 publish하거나 — 제거된 이후라도 — 한 번이라도 publish된 적이 있는 쌍을 재사용하면 빌드가 실패한다. 그런 다음 빌드는 아티팩트별로 **moving canonical** 주소(항상 최신 published)와 버전별 **immutable pinned** 주소를 발행하며, 올바른 `rel=canonical`, immutable 캐시 헤더, 강한 `ETag`, 그리고 `/versions` 히스토리를 함께 발행한다. "완료" = published 아티팩트를 편집하면 완전히 새로운 주소 지정 가능 버전이 생성되는 동시에, 이전의 모든 pinned 주소는 여전히 바이트 단위로 동일한 콘텐츠와 동일한 digest를 반환한다.

## Preconditions

- [ ] RB-020 저장소 레이아웃이 존재한다: `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`와 `<semver>.audit.yml` sidecar, 그리고 빌드 방화벽이 `*.audit.yml`을 출력에서 제외한다.
- [ ] RB-021 publish gate가 public-safe 재검사를 **core** 단계로 실행하고 PASS일 때만 쓰기 경로를 호출한다(deny-by-default).
- [ ] RB-022가 동일한 Astro 5 + Starlight 빌드에서 HTML + JSON + raw markdown을 발행한다.
- [ ] Content-model 타입이 public-projection 본문을 audit sidecar와 분리하여 노출한다(`origin_ref`, `origin_version`은 sidecar에만 존재한다).
- [ ] `_events/ledger.ndjson` append-only 해시 체인 ledger가 존재한다(RB-021).

## Steps

1. **버전 식별 모듈 표면(surface) 정의.**
   - Do: `src/core/version/identity.ts`를 만들어 순수 함수를 노출한다(시그니처는 빌드 가이드임):
     ```ts
     // semver assigned by curator; never derived from bytes
     function validateSemver(input: string): Semver            // reject non-semver
     function assertBump(prev: Semver | null, next: Semver): void // reject downgrade & reuse
     function canonicalize(pub: PublicProjection): string       // §1.2 canonical serialization
     function computeDigest(pub: PublicProjection): string      // "sha256:" + sha256(canonicalize(pub))
     ```
   - Verify: 단위 테스트가 모듈을 import한다. `validateSemver("2.1.0")`는 통과하고, `validateSemver("v2")`는 throw한다.

2. **canonical 직렬화 구현(digest는 재현 가능하다).**
   - Do: `canonicalize`에서 설계에 따라 정규화한다: frontmatter 키를 고정된 정규화 순서로 정렬하고, LF 개행만 사용하며, 후행 공백을 제거하고, 단일 정규화 구분자 뒤에 markdown 본문을 덧붙인다. **public projection만** 해시한다 — audit sidecar는 절대 해시하지 않는다.
   - Verify: golden-file 테스트가 fixture를 두 번(그리고 재읽기 왕복 후) 직렬화하여 바이트 단위로 동일한 출력임을 단언한다. `computeDigest`는 두 번의 실행과 재빌드 전반에서 동일한 `sha256:…`를 반환한다.

3. **콘텐츠에 맞춘 semver bump 의도 강제.**
   - Do: `assertBump(prev, next)`는 다음을 거부한다: 해당 slug의 가장 최근 기존 semver보다 작거나 같은 `next`(downgrade/reuse), 그리고 이전에 사용된 쌍과 동일한 모든 `next`. 큐레이터가 단언한 bump class(MAJOR/MINOR/PATCH)를 버전 레코드에 기록한다. bump를 자동 유도하지 말 것 — semver는 큐레이터가 할당한다.
   - Verify: 테스트: `2.1.0` 이후 `2.0.0` publish는 throw(downgrade); `2.1.0` 이후 `2.1.0`은 throw(reuse); `2.1.0` 이후 `2.2.0`은 통과.
   - Note: bump class를 누가 할당/검증하는지는 versioning-and-immutability.md §1.1에 따라 `TODO(open-question)`이다 — 필드만 연결하고 정책을 만들어내지 말 것.

4. **쓰기 시점 freeze + never-reuse 강제 구현.**
   - Do: 저장소 쓰기 경로(`src/core/storage/write-version.ts`)에서 `<slug>/<semver>.md(x)`를 쓰기 전에: (a) 대상 파일이 이미 존재하면 거부(frozen), (b) 파일이 없더라도 `(slug, semver)`가 `_events` ledger나 index 히스토리 어디에든 나타나면 거부(never-reuse — unpublished/redacted 주소를 포괄), (c) public projection을 `<semver>.md(x)`에, audit 전용 필드를 `<semver>.audit.yml`에 쓴다. 쓰기는 append-only이다: 기존 버전 파일을 절대 편집하지 않는다.
   - Verify: 기존 쌍에 대해 publish를 재실행하는 테스트는 freeze 에러로 실패하고 아무것도 쓰지 않는다. ledger에 redacted로 기록되었지만 파일이 없는 쌍 역시 never-reuse로 실패한다.

5. **`Version`별 index 레코드 영속화.**
   - Do: 쓰기 성공 시 `{slug, kind, semver, digest, published_at, status: "published", successor: null, audit_record_ref}`를 재생성 가능한 `index.json` 파생 소스에 기록한다. 파일이 여전히 source of truth이다. `index.json`은 빌드 시 처음부터 재구성된다.
   - Verify: 한 slug에 대해 두 번 publish한 후, 재생성된 `index.json`은 서로 다른 digest를 가진 두 버전을 나열한다. `index.json`을 삭제하고 재빌드하면 바이트 단위로 동일하게 재현된다.

6. **moving-canonical + immutable-pinned 웹 페이지 발행.**
   - Do: 빌드(RB-022 발행기)에서 각 아티팩트마다 생성한다: `/{type}/{slug}` → 200 최신 published, 자기 자신에 대한 `rel=canonical`; `/{type}/{slug}/v/{semver}` → pinned 페이지, moving URL을 가리키는 `rel=canonical`, `Cache-Control: public, max-age=31536000, immutable`로 제공; `/{type}/{slug}/versions` → 사람이 읽을 수 있는 히스토리/changelog. `{type}` ∈ `tips|skills|workflows|playbooks`.
   - Verify: 2개 버전을 가진 skill의 빌드된 HTML은 최신 semver를 렌더링하는 moving 페이지, 버전별 pinned 페이지, 그리고 immutable 캐시 헤더와 self-vs-moving canonical 링크를 담은 pinned 페이지들을 보여준다.

7. **integrity 필드를 포함한 API 리소스 트리 발행.**
   - Do: `GET /api/v1/{type}/{slug}`(최신, moving), `/versions`(모든 버전: semver, digest, published_at, status), `/versions/{semver}`(하나의 pinned 버전)에 대한 정적 JSON을 발행한다. 모든 버전 응답은 본문에 `digest`/`content_hash`를 담고, 그로부터 유도된 강한 `ETag`를 가진다. `latest` 응답은 호출자가 결정론적으로 재고정(re-pin)할 수 있도록 해석된 `semver` + `digest`를 포함한다. `/api/v1`(API-contract 축)을 콘텐츠 `{semver}` 축과 직교(orthogonal)하게 유지한다.
   - Verify: `GET /api/v1/skills/<slug>` JSON은 해석된 `semver` + `digest`를 포함한다. `/versions/<semver>`는 정확히 그 버전을 반환한다. 본문 digest가 `ETag`와 일치한다. 반환된 semver로 재고정하면 바이트 단위로 동일한 JSON을 반환한다.

8. **audit 필드는 절대 직렬화되지 않는다는 불변식이 모든 버전 표면에서 유지됨을 확인.**
   - Do: 발행된 모든 HTML 페이지, raw markdown, JSON 리소스(moving, pinned, `/versions`, `index.json`)에서 sidecar 키(`origin_ref`, `origin_version`, 모든 `*.audit.*` 콘텐츠)를 스캔하는 테스트를 추가한다.
   - Verify: 스캔이 모든 버전 관련 출력에서 발생 0건을 찾는다. 하나라도 나타나면 테스트가 빌드를 실패시킨다.

## Acceptance criteria

- [ ] `computeDigest`는 재현 가능하다: 동일한 바이트 → 재빌드 전반에서 동일한 `sha256:`(golden 테스트 green).
- [ ] 기존 `(slug, semver)` publish는 실패한다(frozen). 이전에 사용된 쌍의 재사용은 실패한다(never-reuse), 현재 파일이 없는 쌍도 포함.
- [ ] published 아티팩트를 편집하면 NEW 버전 파일이 생성된다. 이전의 모든 pinned 파일은 digest가 변하지 않은 채 바이트 단위로 그대로다.
- [ ] 각 아티팩트는 moving canonical 페이지/리소스 AND 버전별 immutable pinned 페이지/리소스를 노출하며, pinned 페이지에는 올바른 `rel=canonical`과 `Cache-Control: …immutable`이 있다.
- [ ] API 버전 응답은 `digest`/`content_hash` + 강한 `ETag`를 담는다. `latest`는 결정론적 재고정을 가능하게 하는 해석된 `semver` + `digest`를 반환한다. `/api/v1`은 `{semver}`와 직교를 유지한다.
- [ ] audit 전용 sidecar 필드가 버전 관련 출력에 ZERO로 나타난다(자동 스캔 green).
- [ ] `index.json`은 파일로부터 완전히 재생성 가능하며 바이트 단위로 동일하게 재현된다.
- [ ] Tree가 green이다(build, lint, tests).

## Rollback / safety

- 모든 작업은 빌드/쓰기 경로에 추가적(additive)이다. 이 runbook은 published 버전 파일을 절대 편집하거나 삭제하지 않는다 — 중도 실패는 기존 frozen 버전을 온전히 남긴다.
- digest/canonicalization이 개발 중간에 변경되면 재계산은 **첫 실제 publish 이전에만** 안전하다. 실제 publish 이후에는 기존 쌍의 digest 변경이 금지된다(immutability를 깨뜨림) — 대신 새 버전으로 bump한다.
- Revert는 새 모듈 + 발행기 연결의 깔끔한 제거다. 저장소 레이아웃(RB-020)과 gate(RB-021)는 그대로 동작한다.
- 테스트를 "고치려고" freeze/never-reuse를 약화시키지 말 것 — 이것이 immutability 계약이다.

## Hand-off

- 다음 runbook(RB-031)은 다음을 가정할 수 있다: 모든 published `Version`은 안정적인 `{slug, semver, digest, status, successor}` 레코드, 웹과 API에서의 moving + pinned 주소, 그리고 `(slug, semver)`가 frozen이며 절대 재사용되지 않는다는 쓰기 시점 보증을 가진다.
- RB-031은 publishing의 실패 모드 짝(twin)을 구축한다 — HTTP 410 tombstone + 제한된 캐시 purge를 통한 deprecate / unpublish / redact — `status`를 전환하고, `latest`를 재지정하며, audit 레코드를 작성하는데, 모두 여기서 확립된 immutable 식별 위에서 이루어진다.

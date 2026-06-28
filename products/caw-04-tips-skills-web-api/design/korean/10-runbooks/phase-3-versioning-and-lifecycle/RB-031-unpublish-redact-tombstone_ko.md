# RB-031: HTTP 410 tombstone + 제한된 캐시 purge + audit trail을 통한 deprecate / unpublish / redact

- Status: ready
- Phase: phase-3-versioning-and-lifecycle
- Depends on: [RB-030 (semver + digest + freeze + moving/pinned 주소), RB-021 (publish gate + `_events` ledger), RB-022 (SiteAndApi 발행)]
- Implements design:
  - [../../05-publishing-core/versioning-and-immutability_ko.md](../../05-publishing-core/versioning-and-immutability_ko.md)
  - [../../04-data-layer/storage-and-versioning_ko.md](../../04-data-layer/storage-and-versioning_ko.md)
  - [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../../01-decisions/ADR-0005-storage-and-versioning_ko.md](../../01-decisions/ADR-0005-storage-and-versioning_ko.md)
- Produces: Jimmy가 승인한 세 가지 lifecycle 연산(`deprecate`, `unpublish`, `redact`), HTTP 410 tombstone 페이지 + 기계 판독 가능한 tombstone 본문, `latest` 재지정, 제한된 CDN/캐시 무효화, 그리고 어떤 바이트 purge보다 먼저 작성되는 불변 audit-ledger 레코드.

## Objective

publishing의 실패 모드 짝을 제공한다: immutability 약속을 절대 깨뜨리지 않으면서 published 콘텐츠를 공개 유통에서 빼내는, Jimmy가 승인한 감사된(audited) 경로. **Deprecate**는 버전/항목을 계속 제공하되 successor 포인터로 표시한다. **Unpublish**는 항목 전체의 모든 라우트를 **HTTP 410 Gone**으로 만들고 index/listing/sitemap에서 제거한다. **Redact**는 단일 버전을 410 tombstone으로 만들고, 형제(sibling)들은 온전히 두며, `latest`를 가장 최근의 비-redacted 버전으로 재지정한다. `(slug, semver)`는 절대 재사용되지 않으므로(RB-030), redacted 주소는 **영구히** `{id, semver, digest, redacted_at, reason_code, successor}`를 담은 410 tombstone으로 해석된다 — 캐셔(cacher)는 바뀐 바이트를 받는 대신 콘텐츠가 회수되었음을 알게 된다. 모든 연산은 공개 바이트가 purge되기 **전에** 불변의 해시 체인 audit 레코드를 작성하고, 정확히 영향받은 주소들만의 제한된 CDN/캐시 purge를 트리거한다. "완료" = redacted 버전이 웹 + API에서 410을 반환하고, 그 형제들과 `latest`가 올바르게 동작하며, purge 윈도우 후 오래된 공개 사본이 살아남지 않고, audit trail이 여전히 내부 Source로 연결된다.

## Preconditions

- [ ] RB-030 완료: 모든 `Version`이 `{slug, semver, digest, published_at, status, successor}`와 웹/API에서의 moving + pinned 주소를 가진다.
- [ ] `_events/ledger.ndjson`이 append-only이며 해시 체인이다(`hash = H(prev_hash ‖ canonical(line))`). git 히스토리는 중복된 두 번째 증인이다.
- [ ] audit sidecar(`<semver>.audit.yml`)가 provenance(`origin_ref`, `origin_version`)를 보존하며 빌드 출력에서 제외된다.
- [ ] 무효화 API를 갖춘 deploy/CDN 대상이 존재한다. `TODO(open-question: pin deploy/CDN target — milestones-and-phases.md Open Questions)`.
- [ ] 선택한 호스트에서 정적 라우트에 대해 410 상태를 표현할 수 있다(tombstone 아티팩트 + 호스트 설정). `TODO(open-question: host 410 mechanism)`.

## Steps

1. **세 연산을 승인된 lifecycle 이벤트로 모델링.**
   - Do: `src/core/lifecycle/ops.ts`에 `deprecate`, `unpublish`, `redact`를 만들고, 각각 `{target, reason_code, approver, successor?}`를 받아 ledger 이벤트를 발생시킨다. Deny-by-default: 연산은 명시적 Jimmy 승인 토큰이 있을 때만 실행된다. 어느 것도 조용한(silent) 삭제가 아니다.
   - Verify: 승인 토큰 없이 어떤 연산을 호출하면 throw하고 ledger 항목을 쓰지 않는다.

2. **Deprecate 구현(여전히 제공, 표시됨).**
   - Do: 대상 버전 또는 항목에 `status: "deprecated"`를 설정하고 `successor`를 설정한다. 바이트는 계속 제공한다. 웹에는 보이는 `deprecated` 플래그 + successor 포인터를, API에는 warning 필드/헤더를 노출한다. `deprecated`를 동결된 digest 봉투(envelope) **바깥의** 가변 사이드밴드 플래그로 취급한다(버전 digest를 재계산하지 말 것). `TODO(open-question: is deprecated inside/outside the hashed envelope — versioning-and-immutability.md §1.2)`.
   - Verify: deprecated 버전은 웹과 API에서 여전히 플래그 + successor와 함께 200을 반환한다. 그 digest는 deprecation 이전과 변함없다.

3. **Unpublish 구현(항목 전체 → 410).**
   - Do: 항목(모든 버전)에 대해 `status: "unpublished"`를 설정한다. 빌드는 모든 항목 라우트(`/{type}/{slug}`, `/{type}/{slug}/v/{semver}`, `/{type}/{slug}/versions`)에 대해 **HTTP 410 Gone**을 발행한다 — 웹 tombstone 페이지와 API 라우트용 기계 판독 가능한 JSON 본문. `index.json`, listing, sitemap에서 항목을 제거한다. provenance + 메타데이터는 sidecar/ledger에 보존한다.
   - Verify: unpublish + 재빌드 후 모든 항목 라우트가 410(404 아님)을 반환한다. 항목이 `index.json`과 sitemap에서 사라진다. audit sidecar는 여전히 `origin_ref`를 해석한다.

4. **Redact 구현(단일 버전 → 410, 형제 온전, latest 재지정).**
   - Do: 정확히 하나의 `(slug, semver)`에 `status: "redacted"`를 설정한다. 그 버전의 웹 + API 주소는 410 tombstone을 발행한다. 형제 버전은 200을 유지한다. moving `latest`(웹 canonical + `GET /api/v1/{type}/{slug}`)를 가장 최근의 **비-redacted, 비-unpublished** 버전으로 재지정한다. 정책에 따라 redacted된 공개 바이트를 purge한다. `(slug, semver)`는 절대 재사용되지 않는다(RB-030 쓰기 경로에 의해 강제). `TODO(open-question: purge bytes immediately vs retain encrypted internally for audit — retention policy)`.
   - Verify: 3개 버전 skill의 `2.0.0`을 redact: `2.0.0` → 410, `1.0.0`/`2.1.0` → 200, `latest`는 `2.1.0`으로 해석된다. `2.0.0` 재publish는 freeze/never-reuse 검사에 의해 거부된다.

5. **410 tombstone 본문 발행(기계 판독 가능).**
   - Do: unpublished/redacted API 주소에 대해 설계에 맞춘 410 본문을 발행한다:
     ```jsonc
     {
       "status": "redacted",        // or "unpublished"
       "id": "<slug>",
       "type": "<kind>",
       "version": "<semver>",       // present for redacted version; absent for whole-item unpublish
       "digest": "sha256:…",       // the digest that USED to resolve here
       "redacted_at": "<timestamp>",
       "reason_code": "boundary-change",  // machine-readable; NO confidential detail
       "successor": "/api/v1/{type}/{slug}/versions/<semver>"  // or null
     }
     ```
     **410을 사용하고, 절대 404를 쓰지 말 것**(404 = "존재한 적 없음", auditability를 훼손함). **301은 오직** 진짜 이동(이름 변경/병합)에만 쓰고, boundary 제거에는 절대 쓰지 않는다. 본문에는 기밀 세부사항이 없어야 한다(이유는 코드이지 산문이 아니다).
   - Verify: redacted API 주소가 정확한 본문 형태로 HTTP 410을 반환한다. 스캔이 본문(과 tombstone 페이지)에 허용된 `digest`/`reason_code` 외의 sidecar/내부 필드가 없음을 확인한다.

6. **바이트 purge 이전에 불변 audit 레코드 작성.**
   - Do: 모든 연산에 대해 해시 체인 `_events/ledger.ndjson` 항목 `{op, target, reason_code, approver, redacted_at, prev_hash, hash}`를 append하고 provenance가 sidecar에 살아남도록 보장한다. ledger 쓰기 + 체인 검증이 성공한 이후에만 공개 바이트를 purge할 수 있다. git 히스토리는 중복된 두 번째 증인이다.
   - Verify: 각 연산 후 ledger 체인이 검증된다(`hash == H(prev_hash ‖ canonical(line))`). 성공적인 ledger 쓰기 전에 시도된 강제 purge는 연산 순서에 의해 차단된다.

7. **제한된 CDN/캐시 무효화 트리거.**
   - Do: 재빌드 + deploy 후, 정확히 영향받은 주소들(redacted/unpublished 라우트 + moving canonical + `index.json`/sitemap)을 제한적이고 문서화된 purge 윈도우 내에서 무효화한다. pinned immutable 형제 주소는 purge하지 않는다(그 바이트는 변하지 않았다).
   - Verify: 문서화된 한도 내에서 redacted 주소를 (로컬 캐시 우회) fetch하면 410을 반환한다. moving canonical은 재지정된 `latest`를 반영한다. 형제 pinned 주소는 여전히 장수명 immutable 캐시 헤더와 함께 원래 바이트를 제공한다.

8. **immutability + public-safe 불변식에 대한 회귀 가드.**
   - Do: 테스트 추가: (a) redacted/unpublished `(slug, semver)`는 절대 재publish될 수 없다(never-reuse); (b) 어떤 tombstone 출력도 audit 전용 sidecar 필드를 포함하지 않는다; (c) deprecate가 버전 digest를 변경하지 않는다; (d) 모든 lifecycle 연산이 대응하는 ledger 항목을 가진다(조용한 삭제 없음).
   - Verify: 네 가드 모두 green. tombstone이 sidecar 필드를 누출하면 빌드가 실패한다.

## Acceptance criteria

- [ ] 세 연산(`deprecate`, `unpublish`, `redact`)이 존재하며, 각각 명시적 Jimmy 승인을 요구한다. 어느 것도 조용한 삭제를 수행하지 않는다.
- [ ] Unpublish: 모든 항목 라우트가 **410**(404 아님)을 반환한다. 항목이 `index.json`/listing/sitemap에서 제거된다. provenance 보존.
- [ ] Redact: 대상 버전 → 410 tombstone. 형제들은 200. `latest`는 가장 최근의 비-redacted 버전으로 재지정된다.
- [ ] Deprecate: 대상은 보이는 플래그 + successor 및 API warning과 함께 여전히 제공된다(200). 버전 digest는 변하지 않는다.
- [ ] 410 API 본문이 설계 형태와 일치하고, 이전 `digest` + `reason_code`를 담으며, 기밀 세부사항을 포함하지 않는다.
- [ ] redacted/unpublished `(slug, semver)`는 영구히 재사용 불가하다(freeze/never-reuse 준수).
- [ ] 불변 해시 체인 audit 레코드가 어떤 바이트 purge보다 먼저 작성되고 체인 검증된다. git 히스토리는 두 번째 증인이다.
- [ ] 제한된 CDN/캐시 무효화가 문서화된 윈도우 내에서 영향받은 주소의 오래된 공개 사본을 제거한다. immutable 형제 pin은 건드리지 않는다.
- [ ] 어떤 tombstone 출력(페이지 또는 본문)도 audit 전용 sidecar 필드를 직렬화하지 않는다.
- [ ] Tree가 green이다(build, lint, tests).

## Rollback / safety

- 연산은 append-only ledger 이벤트다: 중도 실패는 ledger + git 히스토리로부터 이전 상태를 복구 가능하게 남긴다. 연산 재실행은 status에 대해 idempotent하다.
- **deprecate** 되돌리기는 허용된다(플래그 해제), 바이트가 제거된 적 없기 때문이다. **unpublish** 되돌리기는 NEW 버전을 publish할 때만 허용된다 — 원래 `(slug, semver)`는 재사용 불가로 유지된다. **redact** 바이트 purge는 되돌릴 수 없다. audit 레코드를 영속적 진실로 취급하라.
- CDN purge가 실패하면 연산은 미완이다: 주소를 표시된 채로 두고 purge를 재시도하라 — 오래된 공개 사본이 살아남을 수 있는 한 연산을 완료로 간주하지 말 것.
- 호스팅을 "단순화"하려고 410을 404로 격하하지 말 것 — 410은 auditability와 정직한 캐시 동작을 위해 필요하다.
- 정적 공개 아티팩트는 어떤 내부 저장소로도 라이브 코드 경로를 보유하지 않는다. tombstone과 provenance는 frozen 빌드 + ledger에서만 제공된다.

## Hand-off

- 이 runbook 이후 lifecycle이 완성된다: published 버전은 immutable + 주소 지정 가능(RB-030)하며, deprecate/unpublish/redact가 영구 410 tombstone과 제한된 캐시 purge를 갖춘 감사된 public-safe 제거 경로를 제공한다.
- 하류(phase-4 interfaces/stubs 및 ops): audit-report 도구는 `_events/ledger.ndjson`을 읽어 모든 published 항목이 검증된 내부 Source + 안전 검토로 추적되고, 모든 제거가 approver + reason_code로 추적됨을 증명할 수 있다. 미래의 PublishSink 스텁(외부 docs 호스트, 패키지 registry, syndication)은 동일한 410-tombstone + never-reuse 계약을 준수해야 한다.

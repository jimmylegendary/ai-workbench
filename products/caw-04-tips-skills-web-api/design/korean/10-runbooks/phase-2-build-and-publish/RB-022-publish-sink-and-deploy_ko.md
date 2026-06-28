# RB-022: SiteAndApi PublishSink 구현 — 원자적 static/CDN 배포 + rebuild 트리거

- Status: ready
- Phase: phase-2-build-and-publish
- Depends on: [RB-020 (SSG HTML), RB-021 (REST API + manifests + index + MCP), RB-001 (config-driven adapter registry + PublishSinkAdapter port)]
- Implements design:
  - [../../07-backend-api/build-and-publish-service_ko.md](../../07-backend-api/build-and-publish-service_ko.md) (PublishSink, atomic flip, triggers, purge)
  - [../../05-publishing-core/rendering-web-and-api_ko.md](../../05-publishing-core/rendering-web-and-api_ko.md) (§5 구성에 의한 public-safe)
  - [../../01-decisions/ADR-0004-import-and-ports_ko.md](../../01-decisions/ADR-0004-import-and-ports_ko.md) (ports; sink은 boundary 로직을 하지 않음)
  - [../../01-decisions/ADR-0001-product-surface-and-delivery_ko.md](../../01-decisions/ADR-0001-product-surface-and-delivery_ko.md) (delivery; publish/unpublish 시 rebuild)
- Produces: 검증된 `dist/` `BuildArtifact`를 받아 원자적 불변 flip으로 static 호스트/CDN에 배포하는, `PublishSinkAdapter` port를 구현한 `SiteAndApiSinkAdapter`. curator의 approve/update/unpublish에 연결된 `requestRebuild(scope)` 트리거. config로 비활성화된 sink 스텁. 그리고 web과 API 양쪽에서의 M1 종단 간(end-to-end) 가독성 증명.

## Objective

"Done"의 의미: RB-020/RB-021의 검증된 정적 아티팩트가 `SiteAndApiSinkAdapter`에 의해 새로운 불변 아티팩트로 static 호스트/CDN에 발행되고, 그런 다음 제공되는 루트가 원자적으로 flip된다(절반만 배포된 상태 없음; rollback = 이전 아티팩트로 다시 가리키기). 어댑터는 boundary 로직을 **수행하지 않는다** — 이미 재검사되고 승인된 `boundary=public` 아티팩트만 받아들인다(boundary는 core 전용). `requestRebuild(scope)` 진입점이 curator의 approve/update/unpublish 시 전체 rebuild+deploy를 트리거하며, content-repo push가 중복 트리거다. 이 runbook은 Milestone M1을 완성한다: 시드된 검증 Skill을 버전 지정된 웹 페이지로서 그리고 버전 지정된 API 리소스로서 공개 CDN을 통해 읽을 수 있으며, 어떤 내부 저장소로의 라이브 경로도 없다. (전체 unpublish/redact 410-tombstone + purge-verify 라이프사이클은 phase-3에서 견고화된다. 이 runbook은 `requestRebuild` + deploy 이음새와 스텁 가드를 연결한다.)

## Preconditions

- [ ] RB-020 + RB-021 green: `npm run build`가 패리티 검증되고 누출이 없는 `dist/` 아티팩트(HTML + JSON + md + manifests + index.json + MCP 뷰)를 생성한다.
- [ ] RB-001 완료: `PublishSinkAdapter` port + config-driven registry가 존재한다. `requiresPublicSafe: true`는 sink이 스스로 비활성화할 수 없는 port 능력이다.
- [ ] static 호스트/CDN 타깃을 config로 선택할 수 있다 (TODO(open-question: deploy 타깃 확정 — [milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) Open Questions 참조); 어댑터는 호스트를 config 뒤로 추상화해야 한다).

## Steps

1. **`BuildArtifact` packager 구현.**
   - Do: 검증된 build 이후, `dist/`에 대해 content-addressed `artifact_id`, `built_at`, `item_count`, `digests: {slug@semver -> sha256}`를 계산한다. 이 `BuildArtifact` manifest를 아티팩트 루트에 내보낸다.
   - Verify: 변경되지 않은 코퍼스의 두 build가 바이트 단위로 동일한 `digests`를 산출한다(불변성/no-drift). `artifact_id`는 코퍼스 콘텐츠가 변할 때만 바뀐다.

2. **port에 대해 `SiteAndApiSinkAdapter` 구현.**
   - Do: `capabilities()`(`requiresPublicSafe: true` 반환), `canAccept(item)`, `publish(artifact, ctx)`, `unpublish(ref, ctx)`, `requestRebuild(scope)`를 구현한다. `publish`는 불변 아티팩트를 호스트에 업로드한 뒤 제공 루트의 원자적 flip을 수행하고, `PublishReceipt {artifact_id, deployed_at, urls[], purged?[]}`를 반환한다. 어댑터는 boundary 체크를 하지 않는다 — build의 fail-closed gate와 core re-check을 신뢰한다(ADR-0004 §2).
   - Verify: 단위 테스트가 어댑터에 boundary/`public_safe` 결정 로직이 없음을 확인한다. 유효한 아티팩트의 `publish`가 배포된 URL을 가진 receipt를 반환한다.

3. **deploy를 원자적 + build에 의한 불변 + rollback 가능하게 만들기.**
   - Do: `artifact_id`로 키가 지정된 새로운 불변 경로에 업로드한다. 업로드가 완료된 후에만 제공 루트 포인터를 원자적으로 flip한다(symlink/alias/origin config). rollback = 루트를 이전 `artifact_id`로 다시 가리키기로 구현한다. 오래된 pinned 버전은 바이트 단위로 동일하게 다시 내보내진다(step 1의 digest 가드).
   - Verify: 진행 중인 업로드 동안 라이브 루트는 여전히 이전 아티팩트를 제공한다(절반 배포 없음). 강제 flip 실패는 이전 루트를 라이브로 남긴다. rollback이 다시 가리켜 이전 아티팩트를 제공한다.

4. **rebuild 트리거 연결.**
   - Do: curator 표면이 `approve`(reason `publish`), `update`(reason `publish`), `unpublish`/`redact`(해당 reason)에서 호출하는 `requestRebuild(scope)`를 노출한다. v1 기본 scope는 `mode: "full"`이다(curator 주도, 저빈도; 증분 staleness 누출 위험을 제거). content-repo push webhook을 중복 트리거로 추가한다. 선택한 메커니즘을 문서화한다. TODO(open-question: webhook vs CI vs scheduled — [build-and-publish-service.md](../../07-backend-api/build-and-publish-service_ko.md) Open Questions).
   - Verify: 시뮬레이션된 `approve`가 `requestRebuild({mode:"full", reason:"publish"})` → build → `publish`를 호출한다. content-repo push가 동일 경로를 호출한다.

5. **sink 스텁 가드(config로 비활성화).**
   - Do: `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`를 `maturity="stub"`, config로 비활성화된 문서화 스텁으로 등록한다. 스텁이 `active`로 표시되면 preflight가 실행을 거부한다.
   - Verify: 스텁을 `active`로 표시하면 preflight가 명확한 오류로 거부한다. `SiteAndApi`만 active이면 deploy가 진행된다.

6. **라우트별 CDN 캐시 헤더 + 무결성 설정.**
   - Do: pinned `(slug, semver)` URL(HTML/.md/.json)이 `Cache-Control: public, max-age=31536000, immutable`을 담고, latest/이동형 URL이 short/revalidate를 담으며, `ETag`(`digest`에서)와 `Vary: Accept`가 존중되도록 호스트를 구성한다. 호스트 기본값을 문서화한다: website 호스트 → HTML, `api.` 호스트 → JSON.
   - Verify: pinned API URL의 `curl -I`가 `immutable`을 보여준다. latest URL은 short/revalidate 정책 + `ETag`를 보여준다.

7. **양쪽 표면에서 M1 종단 간 가독성 증명.**
   - Do: 시드된 검증 Skill을 담은 아티팩트를 배포한다. 배포된 CDN에서 canonical + pinned HTML 페이지, JSON envelope, raw markdown을 가져온다. MCP `resources/read`와 `index.json`이 해결됨을 확인한다. 배포된 바이트 중 어느 것도 내부 저장소를 참조하지 않으며 audit 전용 필드가 없음을 확인한다.
   - Verify: [milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md)의 모든 M1 acceptance 체크가 통과한다: canonical URL에서 웹 페이지가 라이브; 동일 아티팩트를 JSON과 raw md로 가져올 수 있음(패리티); `index.json` + MCP가 이를 나열; audit 필드 부재(자동 테스트); 정적 아티팩트가 내부 저장소로의 라이브 경로가 없음.

## Acceptance criteria

- [ ] `SiteAndApiSinkAdapter`가 전체 `PublishSinkAdapter` port를 구현하며 boundary 로직을 포함하지 않는다(core 전용).
- [ ] `publish`가 불변 `artifact_id` 경로에 배포한 뒤 제공 루트를 원자적으로 flip한다. rollback은 이전 아티팩트로 다시 가리킨다.
- [ ] 진행 중인 deploy가 절반 배포된 상태를 결코 제공하지 않는다. flip 실패는 이전 아티팩트를 라이브로 남긴다.
- [ ] `requestRebuild(scope)`가 curator의 approve/update/unpublish에서 호출된다(기본 `mode:"full"`). content-repo push가 중복 트리거다.
- [ ] sink 스텁이 `maturity="stub"`, config로 비활성화로 등록된다. preflight가 `active` 스텁을 거부한다.
- [ ] pinned URL이 `Cache-Control: immutable` + `ETag`를 제공한다. latest는 revalidate를 제공한다. `Vary: Accept`가 존중된다.
- [ ] M1 증명: 시드된 Skill을 버전 지정된 웹 페이지로서 그리고 버전 지정된 API 리소스로서 공개 CDN을 통해 읽을 수 있으며, audit 필드 누출과 라이브 내부 경로가 없다.

## Rollback / safety

- deploy는 원자적이다: 실패한 flip은 이전 아티팩트를 라이브로 남긴다. 명시적 rollback이 제공 루트를 이전 `artifact_id`로 다시 가리킨다. 부분 상태는 결코 공개되지 않는다.
- 어댑터는 build의 fail-closed gate를 결코 완화하지 않는다. RB-020/RB-021 검증을 통과하지 못한 아티팩트는 deploy를 위해 패키징될 수 없다.
- unpublish 이후 CDN purge 실패(phase-3 라이프사이클)는 경고가 아니라 인시던트다 — stale 공개 바이트는 brief §11을 위반한다. purge가 확인될 때까지 해당 항목을 여전히 노출된 것으로 취급한다. (전체 purge-then-verify 410 흐름은 phase-3에서 도착한다.)
- sink 스텁을 결코 `active`로 표시하지 마라. preflight 가드는 강제된 상태로 유지되어야 한다.

## Hand-off

Phase-3 라이프사이클 runbook은 다음을 가정할 수 있다: 원자적 불변 deploy + rollback을 갖춘 동작하는 `SiteAndApiSinkAdapter`, `requestRebuild(scope)` 트리거 표면, config로 비활성화된 스텁, 그리고 web + API에서 검증 Skill의 라이브 M1 배포. Phase-3은 이 sink 위에 unpublish/redact → HTTP 410 tombstone + 경계가 있는 CDN purge-then-verify 흐름과 hash-chained audit ledger를 구축한다.

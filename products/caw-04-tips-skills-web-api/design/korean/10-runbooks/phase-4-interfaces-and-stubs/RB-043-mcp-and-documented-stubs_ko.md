# RB-043: MCP resources 뷰 구축 및 문서화된 stub 어댑터 출시

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-011 (ports + value objects), RB-012 (config registry + preflight), RB-021 (SiteAndApi sink), RB-041 (API envelope + index.json)]
- **Implements design:** [../../05-publishing-core/ports-and-adapters_ko.md](../../05-publishing-core/ports-and-adapters_ko.md), [../../06-interfaces/rest-api_ko.md](../../06-interfaces/rest-api_ko.md), [../../01-decisions/ADR-0004-import-and-ports_ko.md](../../01-decisions/ADR-0004-import-and-ports_ko.md), [../../01-decisions/ADR-0007-api-design_ko.md](../../01-decisions/ADR-0007-api-design_ko.md), [../../01-decisions/ADR-0002-content-model_ko.md](../../01-decisions/ADR-0002-content-model_ko.md)
- **Produces:** `SiteAndApiSinkAdapter`의 한 facet으로서의 MCP `resources/*` 뷰 (`uri = caw04://{type}/{slug}@{semver}`); 그리고 brief-§8의 다섯 개 문서화된 stub 어댑터(internal wiki + curated bundle sources; external docs host + package registry + syndication sinks)를 `maturity="stub"`, config 예시, active 시 preflight 거부와 함께 등록된 `NotImplemented` 본문으로 출시.

## Objective

"완료"의 정의 = (1) 동일한 검증된 corpus가 MCP resources 뷰로 노출되고(웹사이트 + API와 동일한 `getCollection()` 소스의 projection, 공유 substrate 없음, 내부 store로의 live 경로 없음), (2) PRODUCT-BRIEF §8에 명명된 모든 미래 connector가 **문서화된 stub**으로 출시되는 상태: `NotImplemented` 본문으로 구현된 실제 인터페이스, `maturity="stub"` 및 `requiresPublicSafe:true`를 지닌 capability descriptor, config 예시(기본적으로 disabled), 그리고 `registry.list()`와 preview/admin UI를 통한 발견 가능성. 나중에 stub을 wiring한다는 것은 *그 하나의 파일의* method 본문을 채우고 + 하나의 config 블록을 뒤집는 것을 의미한다 — core 편집 없음. Preflight는 어떤 `active` stub도 실행을 거부하며, 구현할 파일을 가리킨다. 안전 속성은 stub 패턴에서도 살아남는다: 완전히 wiring된 미래 sink조차 여전히 `PublishableItem`만 받고 여전히 core의 gate 뒤에 위치한다.

## Preconditions

- [ ] `ContentSourceAdapter`와 `PublishSinkAdapter` 인터페이스 + value objects (`CandidateItem`, `PublishableItem`, `AdapterCapabilities`, `Acceptance`, `PublishReceipt`)가 존재한다 (RB-011).
- [ ] config 기반 registry + preflight가 존재한다 (RB-012), 다음 규칙 포함: 알 수 없는 id 거부; `maturity:"stub"` active 거부; `requiresPublicSafe:false` 거부.
- [ ] `SiteAndApiSinkAdapter`와 `index.json` + JSON envelope이 구축되어 있다 (RB-021 / RB-041).

## Steps

1. **MCP resources 뷰 — enumeration.**
   - Do: (별도의 port가 아니라) `SiteAndApiSinkAdapter`의 한 facet으로서, 동일한 발행된 corpus에 대해 MCP `resources/list`를 노출한다. 발행된 `(slug, semver)`당 하나의 리소스 더하기 이동하는 latest를, `uri = caw04://{type}/{slug}@{semver}`로, 웹사이트/API와 동일한 `getCollection()` 소스 및 `index.json`으로부터 파생하여 노출한다.
   - Verify: `resources/list`가 `caw04://` URI 스킴으로 발행된 모든 항목+버전을 열거하며 `index.json`과 일치한다.

2. **MCP resources 뷰 — read.**
   - Do: 주어진 `caw04://` URI에 대해 canonical public projection(RB-041의 JSON envelope) 및/또는 raw markdown을 반환하는 `resources/read`를 구현한다. emit 시점 public-safe validator + no-sidecar 테스트를 재사용하여 audit 전용 필드가 절대 직렬화되지 않게 한다.
   - Verify: 리소스 읽기가 `origin_ref`/`origin_version` 없이 public envelope/markdown을 반환한다; tombstone된 URI는 stale 콘텐츠가 아니라 410 등가물의 tombstone을 반환한다.

3. **Source stubs — internal wiki + curated bundle.**
   - Do: `ContentSourceAdapter`에 대해 `InternalWikiSourceAdapter`와 `CuratedBundleSourceAdapter`를 구현한다: `discover`/`fetch`/`health` 본문은 `NotImplemented`를 던진다; capability descriptor `{port:"source", id, version:"0.0.0", provides:[...], requiresConfig:[...], requiresPublicSafe:true, maturity:"stub"}`. 각각을 registry를 통해 등록한다; config 예시(`enabled: false`)를 추가한다. 파일 헤더에 contract, brief 참조, config key를 문서화한다.
   - Verify: 둘 다 `registry.list()`에 나타난다; `fetch` 호출이 `NotImplemented`를 던진다; 어느 것도 `PublishableItem`으로 생성될 수 없다(type-enforced — source는 `CandidateItem`만 발행한다).

4. **Sink stubs — external docs host, package registry, syndication.**
   - Do: `PublishSinkAdapter`에 대해 `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`를 구현한다: `canAccept`는 `Acceptance.no("stub not wired")`를 반환한다; `publish`/`unpublish`는 `NotImplemented`를 던진다; descriptor `{port:"sink", id, accepts:[...], features:[...], requiresConfig:[...], requiresPublicSafe:true, maturity:"stub"}`. 각각을 등록한다; config 예시(`enabled: false`)를 추가한다. contract와 더불어 core gate를 존중하고 `boundary=public`만 받아들여야 함을 문서화한다.
   - Verify: 셋 모두 `registry.list()`에 나타난다; `publish`가 `NotImplemented`를 던진다; `canAccept`가 거부한다; 각 descriptor가 `requiresPublicSafe:true`를 선언한다.

5. **Config 예시.**
   - Do: 각 stub을 올바른 port 아래에 `{ enabled: false }`로 `caw04.config.yaml`에 추가한다. v1 active 어댑터와 나란히, ports-and-adapters §6 레이아웃과 일치하게. re-check 프로파일은 core에 유지하며, 어떤 어댑터에도 두지 않는다.
   - Verify: config가 파싱된다; 모든 stub 블록이 존재하며 disabled다; 유일한 `active` sink는 `site-and-api`로 유지되고 source는 v1 세트로 유지된다.

6. **active stub의 preflight 거부.**
   - Do: 어떤 stub을 `active`로 강제하면 구현할 파일을 명명하는 실행 가능한 메시지와 함께 실패하고, `requiresPublicSafe:false`를 선언하는 어떤 descriptor도 실패하도록 preflight(RB-012)를 확인/확장한다.
   - Verify: `external-docs-host`(또는 임의의 stub)를 `active`로 설정하면 "stub `<id>` is active — implement <file> or disable"와 함께 preflight가 실패한다; 변조된 `requiresPublicSafe:false` descriptor가 preflight를 실패시킨다.

7. **Seam 테스트 (open-by-design).**
   - Do: stub을 wiring하는 것이 그 하나의 어댑터 파일 + 하나의 config 블록만 건드림을 — core/re-check/gate/다른-어댑터 편집 없이 — assert하는 테스트를 추가한다. 새 connector는 leak 표면을 넓힐 수 없다(여전히 value-object 타입만 소비/생산한다).
   - Verify: seam 테스트가 다섯 stub 각각에 대해 통과한다; core를 거치지 않고 source로부터 발행을 시도하는 것(core 외의 `publish()` 호출자 없음)이 불가능하다.

## Acceptance criteria

- [ ] MCP `resources/list`/`resources/read`가 웹사이트 + API와 동일한 발행된 corpus를 `caw04://{type}/{slug}@{semver}` 아래에서, audit 전용 필드 없이 그리고 tombstone 처리와 함께 노출한다.
- [ ] 다섯 개의 brief-§8 stub (`internal-wiki`, `curated-bundle`, `external-docs-host`, `package-registry`, `syndication`) 모두가 `maturity="stub"`와 `requiresPublicSafe:true`를 지닌 등록된 `NotImplemented` 어댑터로 출시된다.
- [ ] 모든 stub이 `registry.list()`와 preview/admin UI에 나타나지만 기본적으로 config-disabled다.
- [ ] Preflight가 어떤 `active` stub도 파일을 가리키는 메시지와 함께 거부하고, 어떤 `requiresPublicSafe:false` descriptor도 거부한다.
- [ ] `caw04.config.yaml`이 모든 stub을 disabled로 나열한다; v1 어댑터만 active다; re-check 프로파일은 core에 산다.
- [ ] seam 테스트가 미래 connector가 하나의 어댑터 파일 + 하나의 config 블록만 건드리며 core/gate/re-check는 결코 건드리지 않음을 확인한다.
- [ ] source는 `PublishableItem`을 발행할 수 없다; sink는 `boundary=public` 항목만 받아들인다(type-enforced).

## Rollback / safety

- stub은 inert다(`NotImplemented`); 발행하거나 import할 수 없으므로 출시해도 런타임 효과가 없다. Rollback = 어댑터 파일 + 그 config 블록 제거.
- MCP 뷰는 static projection facet이다; rollback = 이전 build 재배포. 요청 시점에 내부 store로 가는 경로 없음.
- Preflight가 안전망이다: misconfigure되어 active인 stub은 부분적/안전하지 않은 발행을 생산하기보다 실행을 실패시킨다. stub을 active로 강제하기 위해 절대 preflight를 우회하지 말 것.

## Hand-off

- 이것으로 하나의 `SiteAndApiSinkAdapter` 위에서의 phase-4 인터페이스 fan-out(website RB-040, API RB-041, preview/admin RB-042, MCP+stubs RB-043)이 완료된다.
- 미래 connector 작업 = 하나의 stub 파일 본문 구현 + 그 config 블록 뒤집기; core 변경에 의존하는 추가 runbook은 없다.
- Hardening/ops(tombstone cache invalidation, audit reports, phase-5의 남은 stub 문서화)는 여기서 전달된 등록된 stub과 MCP 뷰 위에 구축된다.

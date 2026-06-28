# RB-002: 두 개의 port, config 기반 registry, preflight, 그리고 문서화된 stub 정의

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [../../05-publishing-core/ports-and-adapters_ko.md](../../05-publishing-core/ports-and-adapters_ko.md), [../../01-decisions/ADR-0004-import-and-ports_ko.md](../../01-decisions/ADR-0004-import-and-ports_ko.md)
- Produces: `ContentSourceAdapter` + `PublishSinkAdapter` port 인터페이스; load-bearing value object들(`CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`, `Acceptance`, `PublishReceipt`, `PublishedRef`, `HealthStatus`); `caw04.config.yaml` 로더 + env-ref secret을 가진 config 기반 registry; capability preflight; brief-§8의 모든 미래 connector를 위한 문서화된 stub 패턴; 그리고 in-memory fake. 구체적인 I/O는 없음.

## Objective

publishing core의 두 이음매(seam)가 엔지니어링 계약으로 존재한다([ports-and-adapters_ko.md](../../05-publishing-core/ports-and-adapters_ko.md)). 타입 경계가 곧 safety 경계다: `ContentSourceAdapter`는 오직 `CandidateItem`(`upstream_boundary_claim`을 **증거(evidence)로만** 운반)만 만들어낼 수 있고, `PublishSinkAdapter`는 오직 `PublishableItem`만 소비한다 — 이는 **core만이** re-check 이후에 만들어내는 타입으로, `boundary:"public"`을 가지며 audit 전용 필드(`origin_ref`/`origin_version`)는 이미 sidecar로 제거되어 있다. config 기반 **registry**는 논리적 id → adapter factory를 매핑하고 어느 것이 `active`인지 선택한다; **preflight**는 어떤 I/O 이전에 wiring을 검증하고, `active`인 `stub`-성숙도 adapter나 `requiresPublicSafe:false`를 선언하는 descriptor를 거부한다. 모든 미래 connector는 **문서화된 stub**(실제 인터페이스, `NotImplemented` 본문, descriptor, config 예시)으로 출시된다. "Done" = 트리가 fake만으로 green이고, source가 `PublishableItem`을 **구성할 수 없음**을 증명하는 테스트가 통과하는 것.

## Preconditions

- [ ] RB-001 완료: 경계 규칙 + op-manifest 자리잡음; CI green.
- [ ] `src/ports/`, `src/adapters/{sources,sinks}/`, `src/adapters/registry.ts`가 placeholder로 존재.

## Steps

1. **value object 정의(port를 가로지르는 유일한 것들).**
   - Do: `src/core/model/`에서 [ports-and-adapters_ko.md §2](../../05-publishing-core/ports-and-adapters_ko.md)에 따라 `CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`, `Acceptance`, `PublishContext`, `PublishReceipt`, `PublishedRef`, `HealthStatus`, `SourceRef`, `CandidateRef`, `SourceQuery`를 정의. safety shape을 강제:
     - `CandidateItem.upstream_boundary_claim`은 `string`으로 타입화되며 "EVIDENCE ONLY — never a verdict"로 문서화.
     - `PublishableItem.boundary`는 리터럴 타입 `"public"`(유일하게 허용되는 값)이며, `publicView: PublicProjection`(audit 전용 필드는 구조적으로 부재), `semver`, `content_digest`, `verdict_ref`를 운반.
     - `PublishableItem`은 **오직** core factory를 통해서만 구성 가능하게 만들기(예: branded type / private constructor / `src/core/`의 `mintPublishable()`); source는 만들 수 없다.
   - Verify: `typecheck` 통과; `PublicProjection`에 `origin_ref`/`origin_version` 키가 없음.

2. **두 개의 port 인터페이스 정의.**
   - Do: `src/ports/ContentSourceAdapter.ts`에 `capabilities`, `discover(query): Promise<CandidateRef[]>`, `fetch(ref): Promise<CandidateItem>`, `health(): Promise<HealthStatus>`를 선언. `src/ports/PublishSinkAdapter.ts`에 `capabilities`, `canAccept(item): Promise<Acceptance>`, `publish(item, ctx): Promise<PublishReceipt>`, `unpublish(ref, ctx): Promise<PublishReceipt>`를 선언. 메서드별 "Must NOT" 계약을 doc-comment로 추가(예: source는 `boundary:"public"`을 설정하거나 audit 필드를 제거하면 안 됨; sink는 boundary를 재도출하거나 frozen `(slug,semver)`를 변형하면 안 됨).
   - Verify: `typecheck` 통과; 인터페이스가 [ports-and-adapters §3/§4](../../05-publishing-core/ports-and-adapters_ko.md)와 정확히 일치.

3. **`AdapterCapabilities` + `requiresPublicSafe` 불변식 정의.**
   - Do: `AdapterCapabilities`를 `port`, `id`, `version`, `provides?`, `accepts?`, `features?`, `requiresConfig?`, `maturity: "v1"|"stub"|"experimental"`, 그리고 `requiresPublicSafe: true`(리터럴 `true`, `boolean` 아님)로 타입화. `requiresPublicSafe:false`인 descriptor는 **타입 오류**여야 하고 preflight에서도 거부됨(다층 방어).
   - Verify: `requiresPublicSafe: false` 할당이 `typecheck`를 실패시킴.

4. **config 기반 registry 구현.**
   - Do: `src/adapters/registry.ts` 구현 — `registerAdapter()` + `registry.list()` + `registry.resolve(id)`; registry는 논리적 id → factory를 매핑하며 adapter가 core re-check/gate/boundary를 덮어쓰게 하지 않는다(ports-and-adapters §6). `ports.source.active[]` / `ports.sink.active[]`, adapter별 config 블록, `enabled:false` stub을 읽고 secret을 **env ref로만**(`auth: "env:CAW02_TOKEN"`) 해석하는 `caw04.config.yaml` 로더 추가. `profiles.recheck` 블록은 읽히지만 **core**가 소유하며 절대 adapter가 소유하지 않는다.
   - Verify: 예시 `caw04.config.yaml`(ports-and-adapters §6에서)을 로드하면 active id가 해석되고 stub은 disabled로 남음; 누락된 env ref는 명확한 오류로 드러남.

5. **capability preflight 구현.**
   - Do: [ports-and-adapters §5](../../05-publishing-core/ports-and-adapters_ko.md)의 모든 규칙을 적용하는 preflight 구현: 각 active id가 해석됨; active sink가 build가 방출하는 것을 `accepts`함; active source가 필요한 종류를 `provides`함; `requiresConfig`/env ref가 존재함; **active adapter 중 `maturity:"stub"`인 것이 없음**; `health()` ok; 그리고 **`requiresPublicSafe:false`인 descriptor는 모두 거부**. 각 실패는 실행 가능한 메시지를 반환.
   - Verify: stub을 강제로 `active`로 만들면 구현할 파일을 가리키며 preflight 실패; 필요한 env ref를 제거하면 해당 키 이름과 함께 실패.

6. **brief-§8의 모든 미래 connector를 위한 문서화된 stub 출시.**
   - Do: 각 stub 디렉터리에 §7 패턴에 따라 그 port를 구현하는 클래스를 `maturity:"stub"`, `NotImplemented` 메서드 본문, descriptor, config 예시 doc-comment와 함께 생성. Stub들: source `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`; sink `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`. 이들을 등록(`registry.list()`에 나타나도록)하되 `enabled:false`로 둠.
   - Verify: `registry.list()`가 모든 stub을 포함; 강제로 `active`로 하면 각각을 preflight가 거부.

7. **in-memory fake 추가(구체적 I/O 없음).**
   - Do: `FakeSourceAdapter`(하드코딩된 `CandidateItem` 반환)와 `FakeSinkAdapter`(받은 `PublishableItem`을 기록)를 `tests/` 또는 `__fakes__` 디렉터리 아래에 추가, 테스트에서만 사용. v1 구체 adapter(`Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`, `SiteAndApiSinkAdapter`)는 여기서 구현하지 **않음** — 이후 phase runbook이다.
   - Verify: 테스트가 registry를 통해 fake를 연결할 수 있음.

8. **타입 경계 증명.**
   - Do: `ContentSourceAdapter`(또는 `FakeSourceAdapter`)가 `PublishableItem`을 **구성할 수 없음**을 단언하는 테스트/`@ts-expect-error`를 추가 — core factory만 만들 수 있다. `FakeSinkAdapter.publish`가 `origin_ref`/`origin_version` 키가 없는 `publicView`를 받음을 단언하는 테스트 추가.
   - Verify: core-only 제한을 제거하면 `@ts-expect-error` 테스트가 실패.

## Acceptance criteria

- [ ] `ContentSourceAdapter` + `PublishSinkAdapter` 인터페이스와 모든 §2 value object가 타입 체크됨.
- [ ] `PublishableItem.boundary`는 리터럴 `"public"`; `requiresPublicSafe`는 리터럴 `true`(`false`는 타입 오류).
- [ ] source/adapter가 `PublishableItem`을 **구성할 수 없음**(타입 강제 테스트 통과); core factory만이 만든다.
- [ ] registry가 `caw04.config.yaml`을 로드하고, `active` adapter를 선택하며, env-ref secret을 해석하고, core re-check/gate를 절대 덮어쓰지 않음.
- [ ] preflight가 다음을 거부: 강제로 active된 stub(파일을 가리킴), 누락된 env ref(이름과 함께), 능력 없는 sink/source, 그리고 `requiresPublicSafe:false`.
- [ ] 모든 brief-§8 stub이 `registry.list()`에 나타나고, `enabled:false`이며, active일 때 preflight가 거부함.
- [ ] fake가 registry를 통해 연결됨; CI는 green 유지. 구체적 network/file I/O 추가 없음.

## Rollback / safety

- 모든 작업은 인터페이스, registry, stub, fake다 — `git`으로 RB-001로 revert.
- 여기서 구체적 CAW-02/CAW-03 source나 SiteAndApi sink를 구현하지 말 것(이후 phase) — phase 0을 I/O-free로 유지하면 green하고 재개 가능한 트리가 보존된다.
- source가 sink로 직접 방출하게 하는 port 메서드를 절대 추가하지 말 것 — core가 `publish()`의 유일한 호출자로 남아야 한다(no-bypass 불변식).

## Hand-off

Phase-1 import/gate runbook은 다음을 가정할 수 있다: 안정적인 port 계약; safety 타입 경계를 가진 value object; 안전하지 않거나 stub인 wiring을 거부하는 config 기반 registry + preflight; 그리고 모든 미래 connector를 위한 문서화된 stub. 여기서 참조된 core re-check, curator gate, `mintPublishable()` factory는 phase 1에서 구현된다; v1 구체 adapter는 phase 1/2에서. RB-003은 `PublicProjection`/`PublishableItem`이 운반하는 frontmatter schema와 versioning 모델을 최종화한다.

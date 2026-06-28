# RB-010: v1 ContentSource adapter와 pull 기반 import 서비스 구축

- Status: ready
- Phase: phase-1-import-and-gate
- Depends on: [RB-001 (content-model 타입 + sidecar 선언), RB-002 (hexagonal core + 두 개의 port), RB-003 (config 기반 adapter registry)]
- Implements design:
  - [../../05-publishing-core/import-and-recheck_ko.md](../../05-publishing-core/import-and-recheck_ko.md)
  - [../../07-backend-api/import-service_ko.md](../../07-backend-api/import-service_ko.md)
  - [../../01-decisions/ADR-0004-import-and-ports_ko.md](../../01-decisions/ADR-0004-import-and-ports_ko.md)
- Produces: `ContentSourceAdapter` port 구현체 (`Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`), 문서화된 stub (`InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`), pull import 서비스 (`discover` → `fetch` → staging), 멱등(idempotent) staging store, preflight + health.

## Objective

CAW-04는 두 개의 형제 제품(CAW-02 knowledge, CAW-03 / skills registry)으로부터, 명시적이고 read-only이며 id/URI/version만 노출하는 경계를 가로질러 후보 콘텐츠를 pull할 수 있으며, 각 `CandidateItem`을 **절대 서빙되지 않고 절대 빌드되지 않는 staging 격리(quarantine)** 에 안착시킨다. Adapter는 순수한 read-only 배관(plumbing)이다. adapter는 **re-check가 존재한다는 사실 자체를 절대 알지 못하며**(RB-011) 이를 우회할 수 없다. 향후 source(internal wiki, curated bundle)는 registry에 등록되었지만 config로 비활성화된 stub로 출시된다. "Done"의 정의 = import 서비스가 CAW-03 adapter를 통해 검증된 upstream Skill 후보를 멱등하게 staging하고, 전체 provenance를 캡처하지만 git content store에는 아무것도 쓰지 않는 것이다(그것은 re-check + curator 승인 이후에만 발생한다).

## Preconditions

- [ ] RB-001이 8개 entity content-model 타입, 공통 필드 집합, **audit sidecar** 선언(`origin_ref`, `origin_version`은 sidecar 전용)을 안착시켰다.
- [ ] RB-002가 `ContentSourceAdapter`를 포함해 두 개의 port가 선언된 hexagonal core를 안착시켰다.
- [ ] RB-003이 config 기반 adapter registry 골격을 안착시켰다(아직 live adapter는 없음).
- [ ] 파이프라인 순서 `import → re-check → curator gate → version → publish`가 core에 고정되어 있다(ADR-0004 §2). 이 runbook은 `import` 단계만 구현한다.
- [ ] Secrets 정책: upstream 자격 증명은 **env ref 전용**이다(config에 inline secret 금지).

## Steps

1. **`ContentSourceAdapter` port 계약을 확정한다.**
   - Do: core ports 모듈에서 read-only 인터페이스를 정확히 확인/정의한다: `capabilities()`, `discover(query)`, `fetch(ref)`, `health()`. `fetch`는 `CandidateItem` = `{ payload, upstream_boundary_claim, source_ref, upstream_metadata }`를 반환한다. `capabilities()`는 `AdapterCapabilities`를 `port, id, version, provides, features, requiresConfig, requiresPublicSafe: true, maturity`와 함께 반환한다.
   - Do: `requiresPublicSafe`를 adapter가 **스스로 비활성화할 수 없는** 고정된 `true`로 만든다(ADR-0004 §3).
   - Verify: 타입/lint 검사로 어떤 adapter 메서드도 git content store를 반환하거나 거기에 쓸 수 없음을, 그리고 `requiresPublicSafe`에 setter가 없음을 확인한다. port에는 re-check라는 이름이거나 그런 형태를 띤 메서드가 없다.

2. **import envelope 스키마 + semver gate를 정의한다.**
   - Do: [import-and-recheck_ko.md](../../05-publishing-core/import-and-recheck_ko.md)에 따라 import envelope(`contract_version`, `source_product`, `declared_boundary`, `redaction_applied`, `payload_sha256`, `provenance.graph`, `payload`) 파싱을 구현한다. `declared_boundary`와 `redaction_applied`는 **증거 전용(evidence-only)** 필드로 취급한다 — 저장은 하되 절대 그것을 권위로 삼아 행동하지 않는다.
   - Do: 알 수 없는 `contract_version` MAJOR는 거부한다(절대 추측 금지). canonical 화된 payload에 대한 `payload_sha256` 불일치는 거부한다(integrity).
   - Verify: 단위 테스트 — 알 수 없는 MAJOR를 가진 envelope는 거부되고, 변조된 payload(digest 불일치)는 거부되며, 올바른 형식의 envelope는 파싱되어 raw `declared_boundary`/`redaction_applied`를 증거 필드로만 유지한다.

3. **`Caw02KnowledgeSourceAdapter`를 구현한다 (concrete, v1).**
   - Do: CAW-02 항목을 **id/URI/version만으로** 참조하는 `CandidateRef[]`를 반환하는 `discover(query)`를 구현한다 — 절대 공유 store 핸들이 아니다. 검증된 knowledge / 인용된 tip에 대해 provenance가 태깅된 `CandidateItem`을 반환하는 `fetch(ref)`를 구현한다.
   - Do: `capabilities().provides`는 knowledge/claims/citations를 나열한다. `maturity = "concrete"`.
   - Verify: CAW-02 fixture에 대해 `discover`는 ref를 반환하고 `fetch`는 `source_ref.product == "CAW-02"`이며 payload에 공유 store 핸들이 없는(id/URI/version만) `CandidateItem`을 반환한다.

4. **`Caw03SkillsRegistrySourceAdapter`를 구현한다 (concrete, v1).**
   - Do: 동일한 형태이며, Skill/Workflow/Playbook 실행 메타데이터(inputs/outputs/preconditions)에 대해 권위를 가진다. `source_ref.product == "CAW-03"`.
   - Verify: CAW-03 skills-registry fixture에 대해 `fetch`는 reuse/audit 메타데이터가 채워진 Skill `CandidateItem`을 반환하며 `upstream_boundary_claim`은 증거 전용으로 캡처된다.

5. **문서화된 stub을 출시한다: `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`.**
   - Do: 실제 인터페이스, `NotImplemented` 본문, descriptor `maturity = "stub"`, config 예제. 등록 + 발견은 가능하지만 **기본적으로 config로 비활성화**된다(ADR-0004 §5).
   - Verify: registry는 4개의 adapter를 모두 나열하고, 두 stub은 `maturity = "stub"`을 보고하며 기본적으로 비활성 상태다.

6. **config 기반 registry + preflight를 연결한다(active stub 거부).**
   - Do: config로부터 active adapter를 해석한다. Preflight(모든 I/O 전에)는 배선(wiring)을 검증한다(ADR-0004 §3): source가 content model이 필요로 하는 것을 `provides`하는지, 필요한 config/auth가 **env ref**로 존재하는지, `requiresPublicSafe`가 켜져 있는지, **`active`인 adapter 중 `stub`이 없는지**.
   - Do: registry가 어떤 adapter가 active인지는 배선할 수 있지만, adapter가 re-check, human gate, boundary 정책을 **절대** 재정의(override)하지 못하게 한다(ADR-0004 §4).
   - Verify: 테스트 — stub을 `active`로 표시하면 실행 가능한(actionable) 메시지와 함께 preflight가 실패하고, 유효한 concrete config는 통과하며, preflight는 어떤 network/fetch 호출보다 먼저 실행된다.

7. **pull import 서비스를 구현한다 (`discover` → `fetch` → staging).**
   - Do: v1은 **pull**이다 — curator가 트리거하거나 스케줄링된다. active source 전반에 걸쳐 `discover()`를 호출하고(fan-in 허용), 그다음 선택된 ref마다 `fetch()`를 호출한다. 각 `CandidateItem`을 **절대 서빙되지 않고 절대 빌드되지 않는 staging 격리**에 안착시킨다.
   - Do: staging을 `(source_ref.product, source_ref.id, origin_version)`마다 **멱등(idempotent)** 으로 만든다 — 변경되지 않은 upstream version은 중복 staged 레코드를 만들지 않는다.
   - Verify: 테스트 — 동일한 upstream version의 두 번 import는 하나의 staged 레코드를 만들고, staging은 빌드에서 제외된 경로에 있으며, 이 단계에서 git content-store 쓰기는 발생하지 않는다.

8. **provenance를 sidecar에 캡처한다(public projection에는 안 함).**
   - Do: staging 시, [public-safe-and-provenance_ko.md](../../04-data-layer/public-safe-and-provenance_ko.md)에 따라 `origin_ref`, `origin_version`, `validated_by`, `imported_at`을 **audit sidecar** 레코드로 라우팅한다. public-projection provenance(`origin_product`, `validated`, `derivation`)는 파생될 수 있으나 아직 published되지 않는다.
   - Verify: 테스트 — staged 후보의 `origin_ref`/`origin_version`은 sidecar 구조 안에만 존재하고 직렬화(serialization)를 위해 형성된 어떤 객체에도 없다.

9. **Health + 실패 모드.**
   - Do: adapter마다 `health()`와 import 실패 코드(`SOURCE_UNAVAILABLE` → source 건너뜀, 부분 publish 없음; `SCHEMA_NONCONFORMANT` → 거부 + audit)를 구현한다. Fan-in 충돌은 `DUPLICATE_PRECEDENCE`로 플래그되고 보류된다(dedup/precedence 알고리즘은 open question — 자동 병합 금지).
   - Verify: 테스트 — 사용 불가한 source는 부분 상태 없이 건너뛰어지고(health/preflight로 노출됨), schema-nonconformant fetch는 거부되고 audit된다.

## Acceptance criteria

- [ ] `ContentSourceAdapter`는 read-only이며, adapter는 upstream을 id/URI/version만으로 참조하고 절대 content store에 쓰지 않는다.
- [ ] `requiresPublicSafe`는 고정된 `true`이며 스스로 비활성화 불가능하다. 어떤 adapter도 re-check 메서드를 갖지 않는다.
- [ ] 두 concrete v1 adapter(`Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`)가 fixture로부터 후보를 staging한다.
- [ ] 두 stub은 등록되고 `maturity="stub"`이며 config로 비활성화된다. preflight는 `active` stub을 거부한다.
- [ ] Import는 pull 기반이다. `fetch`는 후보를 절대 서빙/빌드되지 않는 staging 격리에 안착시킨다.
- [ ] staging은 `(product, id, origin_version)`마다 멱등이다.
- [ ] Envelope semver gate는 알 수 없는 MAJOR를 거부하고, integrity 검사는 digest 불일치를 거부하며, `declared_boundary`/`redaction_applied`는 증거 전용으로만 저장된다.
- [ ] `origin_ref`/`origin_version`은 sidecar에만 안착하고 직렬화 형태 객체에는 없다.
- [ ] 트리가 green이다(빌드, lint, 테스트 통과).

## Rollback / safety

- 여기서의 모든 작업은 **pre-store**다. git content store나 서빙되는 어떤 표면에도 아무것도 도달하지 않으므로, 중간 실패가 무언가를 publish할 수 없다. 안전한 rollback = staging 레코드 폐기(격리는 일회성), registry config를 active adapter 없음으로 되돌리기.
- adapter가 공유 store 핸들을 유출하거나 re-check 영향점을 노출하는 것이 발견되면, 즉시 config(registry)에서 비활성화한다. gate(RB-012)는 여전히 기본적으로 거부하지만, adapter는 재활성화 전에 반드시 수정되어야 한다.

## Hand-off

다음 runbook(RB-011, core public-safe re-check)은 다음을 가정할 수 있다: staged `CandidateItem`들이 절대 서빙되지 않는 격리에 존재하며, 각각 파싱된 envelope(`provenance.graph` 포함), 증거 전용 `upstream_boundary_claim`, sidecar provenance 레코드를 지닌다. RB-011은 staged 후보를 소비하여 타입화된 `RecheckVerdict`를 생성한다. RB-011은 boundary를 로컬에서 다시 도출(re-derive)해야 하며 캡처된 upstream claim을 절대 신뢰하지 않는다. 그다음 RB-012(publish gate + curator queue)가 re-check된 후보를 소비한다.

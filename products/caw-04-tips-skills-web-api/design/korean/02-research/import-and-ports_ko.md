# Import & Ports (경계 간 import + public-safe 재확인 + port와 adapter)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md), `../01-decisions/ADR-0004-import-ports-and-public-safe-recheck.md` (TODO), `../01-decisions/ADR-0003-publish-gate.md` (TODO), `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **CAW-04가 독립 제품 경계를 넘어 검증된 콘텐츠를 어떻게 import하는지**(CAW-02 knowledge, CAW-03 / 또는 skills registry) 그리고 어떻게 **publish**하는지를, source·sink에 비종속적으로 유지하면서 결정한다. 구체적으로: (1) 두 개의 port — `ContentSourceAdapter`(driven, 후보를 끌어옴)와 `PublishSinkAdapter`(driven, 공개 표면을 내보냄); (2) import된 모든 항목을 경계에서 재검증하는 **public-safe 재확인** — *upstream 경계를 결코 맹신하지 않음*; (3) config 기반 registry + **documented stub**(문서화된 스텁) 패턴(내부 wiki, 외부 docs 호스트, 패키지 registry)을 명세한다. 이 문서는 content model(`Tip/Skill/Workflow/Playbook/...`), storage/versioning 레이아웃, 또는 publish-gate *policy* 규칙을 결정하지 않는다 — 그것들은 이 port들을 *소비하는* 별도의 ADR이다(brief §9). v1 adapter + stub만 구축한다(Non-goal §10).

## 1. Problem & forces (문제와 힘)
CAW-04는 **공개 읽기/API 발행 레이어**이다. 아무것도 저작하지 않으며, 자신의 런타임을 **공유하지 않는** 형제 제품들로부터 이미 검증된 콘텐츠를 import하여 세상에 재발행한다. 가장 위험한 단일 실패는 기밀 노하우를 공개 출력으로 누출하는 것이다(brief §11). 이음새(seam) 설계는 그 실패를 구조적으로 어렵게 만들어야 하며, 미래의 source/sink가 "코어를 수정하지 않고 adapter 하나만 채우는" 형태가 되도록 해야 한다.

| Force | 설계에 대한 함의 |
| --- | --- |
| CAW-02/CAW-03과 공유 기반(substrate) 없음 (Independence §1) | 모든 제품 간 링크는 공유 저장소/registry가 아니라 **명시적 import 경계 위의 adapter**이다. id/URI로 참조하고, CAW-04는 발행된 콘텐츠의 **자체 사본**을 유지한다(§6). |
| upstream이 항목을 public-safe라 *주장*할 수 있으나 그 경계는 다른 policy로 계산됨 | CAW-04는 import 시 public-safety를 **스스로 재확인**한다; upstream의 단언은 입력일 뿐 판정이 아니다(§3). |
| source가 이질적임(CAW-02 인용 tip, CAW-03 skill, 미래의 wiki/bundle) | 하나의 `ContentSourceAdapter` contract; 모두 `fetch() -> CandidateItem` 뒤에서 교체 가능하다. |
| sink가 지금→나중 다양함(지금은 website + REST; 나중엔 docs 호스트 / 패키지 registry) | 하나의 `PublishSinkAdapter` contract; publish **gate는 코어에 남는다**, adapter에 있지 않다. |
| 코드는 우리가 아니라 builder가 작성 | 우리는 타입 지정 contract + registry/config 설계 + stub 템플릿을 전달한다; 구체적 코드는 runbook의 일이다. |
| Jimmy가 모든 publish를 승인(§11) | 사람 gate + public-safe 재확인은 **코어에서**, 어떤 `publish()` 호출 이전에 실행된다. adapter는 결코 그것을 스스로 우회할 수 없다. |

## 2. Pattern choice (패턴 선택)
Hexagonal (ports & adapters): 코어는 **port**(의도 수준 인터페이스)에만 의존하며, 구체적 I/O는 코어가 알지 못하는 **adapter**에 산다([Cockburn](https://alistair.cockburn.us/hexagonal-architecture), [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))). source/sink 추가는 "`adapters/`의 새 파일 하나 + registry의 한 줄"이어야 한다([Hasan, two-codebase study](https://saadh393.github.io/blog/adapter-port-architecture-two-cases), [AWS hexagonal guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html)). CAW-03(별도 제품)과 같은 골격이지만, CAW-04의 코어는 작성 harness가 아니라 **발행 파이프라인**이다.

| Sub-pattern | 여기서의 역할 | Reference |
| --- | --- | --- |
| Ports & adapters | 코어 ↔ 외부 격리; port = 역량이지 기술 연산이 아님 | Cockburn |
| Plugin **registry** | 논리 id → adapter factory; config에서 실행마다 해석 | [Hasan](https://saadh393.github.io/blog/adapter-port-architecture-two-cases) |
| **Capability descriptor** + preflight | adapter가 제공/수용/요구하는 것을 선언; 코어가 I/O 전에 배선을 검증 | (우리 추가; §5) |
| **Re-check at trust boundary** | upstream이 정화했더라도 신뢰 영역으로 넘어오는 데이터를 정화/검증 | [CERT IDS00](https://wiki.sei.cmu.edu/confluence/display/java/Input+Validation+and+Data+Sanitization), [trust-boundary guidance](https://securecodingpractices.com/defining-and-managing-trust-boundaries/) |

여기 두 port는 모두 **driven**이다(코어가 바깥으로 호출함). 세상을 향한 *읽기 표면*으로서의 website + REST API는 CAW-04 자체 저장소에서 서빙되는 **driving** 가장자리이다; 이 문서는 driven import/publish 쪽을 다룬다.

## 3. The public-safe 재확인 (load-bearing; upstream을 결코 신뢰하지 않음)
CAW-04로 넘어오는 것은 **trust boundary**(신뢰 경계)를 넘는 것이다: validated-upstream ≠ public-safe-here. CAW-04는 항목이 `PublishableItem`이 되기 전에 모든 `CandidateItem`을 자신의 public-safe policy로 재검증한다. upstream의 `boundary` 레이블은 **provenance/evidence**로 기록되며, 결코 판정으로 받아들여지지 않는다([CERT: sanitize untrusted data passed across a trust boundary](https://www.informit.com/articles/article.aspx?p=1751371&seqNum=3)). 이는 발행 파이프라인의 출력 정화를 거울처럼 따른다 — 신뢰 영역을 떠나기 전에 정화하고, 진입 시 재검증한다([Access Guardrails / DLP](https://hoop.dev/blog/how-to-keep-data-sanitization-and-data-loss-prevention-for-ai-secure-and-compliant-with-access-guardrails/)).

재확인은 코어 단계이며(어떤 adapter에도 없음), source와 무관하게 모든 import에서 실행된다:

| Check | 무엇을 단언하는가 | 실패 시 |
| --- | --- | --- |
| **Provenance present** | 항목이 해석 가능한 validated-source ref(CAW-02/CAW-03 id/URI) + 버전을 지님 | reject (brief §5: source 없으면 publish 없음) |
| **Boundary = public** | 항목의 *재계산된* 안전 경계가 internal/confidential이 아니라 `public`임 | 큐레이터 검토를 위해 quarantine |
| **Confidential-pattern scan** | 내부 마커, 비밀, 호스트명, 고객/Samsung/SAIT 내부 식별자, 자격증명 없음 | redact-or-reject; finding 로그 기록 |
| **Claim/source separation** | 공개 source 연구가 내부 claim과 혼동되지 않음(§11) | 큐레이터에게 flag |
| **Schema/format conformance** | CAW-04 content model에 매핑됨; 필수 reusable/audit 메타데이터 존재 | 실행 가능한 메시지와 함께 reject |
| **Curator approval** | Jimmy가 publish를 승인(제안 생성만, §11) | preview/admin에 hold |

결과는 타입 지정된 `RecheckVerdict { decision: publish|quarantine|reject, findings[], boundary, evidence_ref }`이다. upstream이 항목을 public-safe로 표시했더라도 재확인이 실패하면 차단된다. 재확인은 *deny-by-default*이다: public-safe임을 적극적으로 확인할 수 없는 것은 무엇이든 발행되지 않는다.

## 4. The ports (이음새)
brief §8에 맞는 두 port. 각각은 작은 타입 지정 인터페이스이다(TypeScript 스타일 `interface`로 표시; contract는 언어 비종속 — 스택은 별도 ADR에서 결정). 모든 port는 CAW-04 자체의 **provenance를 지닌** 값 객체를 소비/반환하므로 파이프라인(`import → re-check → curator gate → version → publish`)이 adapter에 비종속적이다.

### 4.1 ContentSourceAdapter — 후보 콘텐츠가 오는 곳
```ts
interface ContentSourceAdapter {
  capabilities: AdapterCapabilities;        // provides=[TIP, SKILL, WORKFLOW, PLAYBOOK], read_only, auth needs
  discover(query: SourceQuery): Promise<CandidateRef[]>;   // list importable items by id/URI (no payload)
  fetch(ref: CandidateRef): Promise<CandidateItem>;        // pull ONE provenance-tagged candidate
  health(): Promise<HealthStatus>;                          // reachable? auth ok? for preflight
}
// CandidateItem = payload (md/structured) + upstream_boundary_claim + source_ref(id/URI/version) + upstream_metadata
// v1 adapters:  Caw02KnowledgeSourceAdapter, Caw03SkillsRegistrySourceAdapter
// stub adapters: InternalWikiSourceAdapter, CuratedBundleSourceAdapter
```
핵심 일반화: CAW-02, CAW-03, 그리고 미래의 wiki는 `fetch() -> CandidateItem` 뒤에서 교체 가능하다. **public-safe 재확인(§3)**은 반환된 후보에 대해 실행되며 source가 무엇인지 결코 알지 못한다. adapter는 **read-only**이며 id/URI/version으로 참조한다 — upstream 저장소를 복제하지 않는다(brief §7); CAW-04는 실제로 발행하는 것만 복사한다.

### 4.2 PublishSinkAdapter — 공개 표면이 내보내지는 곳
```ts
interface PublishSinkAdapter {
  capabilities: AdapterCapabilities;        // accepts=[WEBSITE_BUILD, REST_INDEX, MD_DOC, PKG], requires_public_safe
  canAccept(item: PublishableItem): Promise<Acceptance>;   // type/format/boundary preflight
  publish(item: PublishableItem, ctx: PublishContext): Promise<PublishReceipt>;  // emit a versioned artifact
  unpublish(ref: PublishedRef, ctx: PublishContext): Promise<PublishReceipt>;    // redact/withdraw (brief §3 uc4)
}
// PublishableItem = re-checked, curator-approved, versioned item with boundary=public + provenance
// v1 adapter:   SiteAndApiSinkAdapter (static site build + REST read index; md and/or JSON — ADR)
// stub adapters: ExternalDocsHostSinkAdapter, PackageRegistrySinkAdapter, SyndicationSinkAdapter
```
brief가 경계 변경 시 redaction을 요구하므로 `unpublish`는 일급(first-class)이다(§3 uc4). 발행된 버전은 **immutable + addressable**이다; 업데이트는 새 `Version`을 만들고, 이전 버전은 계속 도달 가능하다(brief §5). **사람 gate + §3 재확인은 `publish()` 이전 코어에 산다** — `requires_public_safe=true`를 선언하는 sink는 코어가 검증한다; adapter는 스스로 빠질 수 없다.

## 5. Capability descriptor + preflight
각 adapter는 코어가 **I/O 없이** 배선을 검증할 수 있도록 machine-readable descriptor를 지닌다:
```ts
type AdapterCapabilities = {
  port: "source" | "sink";
  id: string;
  version: string;
  provides?: ContentKind[];        // source: TIP/SKILL/WORKFLOW/PLAYBOOK
  accepts?: ArtifactKind[];        // sink: WEBSITE_BUILD/REST_INDEX/MD_DOC/PKG
  features?: string[];             // e.g. {"incremental","supports-unpublish","markdown","json"}
  requiresConfig?: string[];       // keys that MUST be set (preflight checks these)
  requiresPublicSafe: boolean;     // true; cannot be self-disabled by the adapter
  maturity: "v1" | "stub" | "experimental";
};
```
**Preflight**(어떤 실행 전에): 코어는 registry에서 각 `active` adapter id를 해석하고, 그 descriptor를 읽어 검증한다 — 예: active sink가 파이프라인이 생산할 것을 `accepts`하는지, source가 content model이 필요로 하는 것을 `provides`하는지, 필요한 auth/config가 존재하는지, 어떤 `active` adapter도 `stub`이 아닌지. 실패는 publish 도중이 아니라 **여기서** 실행 가능한 메시지와 함께 보고된다.

## 6. Registry + config 선택
adapter는 (코어에 하드코딩되지 않고) **등록**되며 **config로 선택**된다 — port당 한 블록, 전환에 코드 변경 없음([config-driven adapter registry](https://saadh393.github.io/blog/adapter-port-architecture-two-cases)). CAW-03(별도 제품)과 같은 패턴이며, 독립적으로 유지된다.

```yaml
# caw04.config.yaml — the ONLY place wiring changes
ports:
  source:
    active: [caw02-knowledge, caw03-skills]      # fan-in: multiple sources import in
    caw02-knowledge: { endpoint: "...", auth: "env:CAW02_TOKEN" }
    caw03-skills:    { endpoint: "...", auth: "env:CAW03_TOKEN" }
    internal-wiki:   { enabled: false }          # stub present, off until connector lands
  sink:
    active: [site-and-api]
    site-and-api:    { out_dir: "...", formats: [markdown, json] }
    external-docs-host: { enabled: false }       # stub
    package-registry:   { enabled: false }       # stub
profiles:
  recheck: { ... }   # public-safe re-check thresholds / pattern lists (§3) — core, not adapter
```
adapter별 **secret은 env ref로만**(공유 기반 없음). 발견 메커니즘(entry-point 대 manifest)은 `TODO(open-question)`이다. registry는 adapter가 코어의 재확인, 사람 gate, boundary policy를 override하도록 **결코** 허용하지 않는다 — adapter는 후보를 공급하거나 승인된 아티팩트를 내보낼 뿐이다.

## 7. The "documented stub" 패턴 (미래의 source/sink)
미래 adapter는 v1에서 **documented stub**으로 출하된다: 실제 인터페이스, not-implemented 마커, `maturity="stub"`인 capability descriptor, 그리고 config 예시. 나중에 실제 connector를 배선하는 것 = *그 한 파일*의 메서드 본문을 채우는 일.
```ts
@registerAdapter({ port: "sink", id: "package-registry" })
class PackageRegistrySinkAdapter implements PublishSinkAdapter {
  /** STUB — publish skills as installable packages to a registry. Implement when approved.
   *  Contract: PublishSinkAdapter (§4.2). Must respect core public-safe gate; only accept boundary=public.
   *  Config: ports.sink.package-registry: { registry_url, auth: "env:PKG_TOKEN", namespace } */
  capabilities = { port: "sink", id: "package-registry", version: "0.0.0",
    accepts: ["PKG"], features: ["supports-unpublish"],
    requiresConfig: ["registry_url", "auth"], requiresPublicSafe: true, maturity: "stub" };
  canAccept() { return Acceptance.no("stub not wired"); }
  publish()  { throw new NotImplemented("package-registry sink not yet wired (brief §8 stub, §10 non-goal v1)"); }
  unpublish(){ throw new NotImplemented("stub"); }
}
```
규칙: stub은 **등록되고 발견 가능**하지만(`registry.list()`와 preview/admin UI에 나타남) **기본적으로 config-disabled**이다; preflight는 `active`인 stub의 실행을 거부하며 구현할 파일을 가리킨다. brief-§8이 요구하는 stub: source — `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`; sink — `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`.

## 8. 왜 이것이 일반화되는가 (이음새 테스트)
새 통합이 **adapter 파일 하나 + config 블록 하나**만 건드린다면 그 변경은 "설계상 열려 있음(open by design)"이다:

| New integration | 추가되는 것 | 건드리지 않는 것 |
| --- | --- | --- |
| Internal wiki as a source | `InternalWikiSourceAdapter` 구현, config 활성화 | core, re-check (§3), publish gate, 다른 adapter |
| Curated bundle import | `CuratedBundleSourceAdapter` 구현 | content model / re-check(`CandidateItem` 소비) |
| Publish to external docs host | `ExternalDocsHostSinkAdapter` 구현, `active` 전환 | human gate + public-safe re-check(코어에 잔류) |
| Publish skills as packages | `PackageRegistrySinkAdapter` 구현 | versioning/immutability 규칙(core) |
| Syndicate to a feed | `SyndicationSinkAdapter` 구현 | `PublishableItem`의 provenance/boundary |

이 중 어느 것이라도 코어 수정을 강제한다면, contract가 새고 있는 것이므로 재검토해야 한다(재검토 트리거).

## 9. Tradeoffs

| Decision | Pros | Cons / cost | Stance |
| --- | --- | --- | --- |
| Hexagonal core + 2 ports | source/sink 자유로운 교체; fake로 테스트 가능 | 사전 contract 설계; 간접성 | adopt (brief §8 mandates) |
| **모든 import에 public-safe 재확인**(deny-by-default) | 구조적 누출 방지; upstream policy drift가 새어들 수 없음 | 중복 검증 비용; 패턴 리스트 유지 필요 | adopt — 타협 불가(brief §11) |
| upstream `boundary`를 판정이 아닌 evidence로 취급 | 독립성 안전; policy 소유자 하나(CAW-04) | 일부 upstream 로직 재구현 | adopt |
| Capability descriptor + preflight | 빠른 실패, 자기 기술적, 안전한 배선 | descriptor를 정직하게 유지해야 함 | adopt |
| v1의 documented stub | 이음새가 증명 가능하게 존재; "한 파일 채우기" 경로 | 배선 전까지 dead code | adopt (brief §8) |
| 다중 active source adapter (fan-in) | 한 import에서 CAW-02 + CAW-03 결합 | merge/precedence + dedup 규칙 필요 | adopt; precedence는 open question |

## Open Questions
`../08-research-plan/open-questions.md`에서 추적:
- TODO(open-question: 정확한 **public-safe 재확인 규칙 집합** — CAW-04가 어떤 confidential-pattern 리스트/분류기를 실행하며, 그중 일부가 CAW-02 boundary와 공유 설계인가 아니면 완전히 독립인가? 임계값은 `profiles.recheck` 어디에 사는가?)
- TODO(open-question: 두 source adapter가 **같은 논리적 항목**을 표면화할 때, dedup/precedence 규칙은 무엇이며, merge 전반에서 provenance는 어떻게 보존되는가?)
- TODO(open-question: import는 **pull**(CAW-04가 upstream `discover()`를 폴링)인가 **push**(upstream이 알림)인가? source port에 영향 — 현재 초안은 pull 전용.)
- TODO(open-question: adapter **발견 메커니즘** — 내장 registry만인가, 아니면 entry-point/manifest 플러그인 발견인가 — 그리고 adapter↔port SemVer/호환 정책?)
- TODO(open-question: **immutable addressable version**에 대한 `unpublish` 의미론 — tombstone 대 hard-removal, 그리고 REST API가 철회된 버전 요청에 어떻게 응답하는가.)
- TODO(open-question: upstream이 source 항목을 **재검증하거나 철회**할 때, CAW-04는 어떻게 알고 gate를 재실행하는가 — provenance ref가 liveness 검사를 포함하는가?)

## Implications for runbooks
- **RB (core/ports):** `ContentSourceAdapter` + `PublishSinkAdapter` 인터페이스와 값 객체(`CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`, descriptor)를 정의. fake만으로 트리를 녹색으로 유지 — 아직 구체적 I/O 없음.
- **RB (public-safe 재확인):** §3 코어 단계(deny-by-default), `RecheckVerdict`, finding 로그, 큐레이터 preview/admin hold를 구현. Acceptance: upstream에서 public-safe로 표시되었지만 confidential 패턴을 포함한 항목이 **차단**되고 quarantine되며, finding이 로그에 남는다.
- **RB (registry/config):** registry(등록 + config로 선택), `caw04.config.yaml` 로더, env-ref secret, **preflight** capability 검증을 구현. Acceptance: preflight가 stub/무능력/오설정 배선을 실행 가능한 메시지와 함께 거부한다.
- **RB (v1 adapters):** `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`, `SiteAndApiSinkAdapter`.
- **RB (stubs):** 모든 brief-§8 stub을 §7 템플릿으로 출하 — 등록됨, `maturity="stub"`, config-disabled. Acceptance: 각각이 `registry.list()`에 나타나며 강제로 active되면 preflight가 거부한다.
- 제품 간 링크(CAW-02, CAW-03)는 공유 저장소가 아니라 **import 경계 adapter**이다(Independence §1) — runbook은 이를 id/URI/version으로만 `ContentSourceAdapter` contract 뒤에 유지해야 한다.

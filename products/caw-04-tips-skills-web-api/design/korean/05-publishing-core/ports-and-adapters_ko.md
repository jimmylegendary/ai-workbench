# Ports & Adapters — publishing core의 두 seam

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§7 import boundary, §8 open interface)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md) (이 문서가 구체화하는 결정)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (이 seam이 호출하는 gate)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md) (`CandidateItem`/`PublishableItem` shape)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (재검사된 항목이 안착하는 곳 + freeze)
  - [../01-decisions/ADR-0007-api-design_ko.md](../01-decisions/ADR-0007-api-design_ko.md) (v1 sink: website + REST + MCP)
  - [../02-research/import-and-ports_ko.md](../02-research/import-and-ports_ko.md) (뒷받침 연구)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04 publishing core의 **두 driven port** — `ContentSourceAdapter`(candidate 콘텐츠가 들어오는 곳)와
`PublishSinkAdapter`(공개 surface가 emit되는 곳) — 그리고 미래 connector를 위한 **config 기반 registry**와
**documented-stub** 패턴을 규정한다. 이는 [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)의 엔지니어링
contract다: core는 **오직** port에만 의존하며, **어떤 adapter도 core의 public-safe 재검사나 curator gate를
우회할 수 없다**.

public-safe 재검사 규칙 집합, publish-gate policy, content model, 저장/버전 관리 레이아웃을 정의하지 않는다 — 그것들은
이 폴더의 형제 문서와 링크된 ADR이 소유하며 여기서는 *소비*된다. 이 문서는 **public-safe-by-construction** 속성을
강조한다: seam은 콘텐츠가 sink에 도달하는 유일한 방법이 core 단계를 *통과하는* 것이고, 결코 우회하는 것이 아니도록
형성되어 있다.

## 1. 한눈에 보는 hexagon

core는 writing harness가 아니라 **publishing pipeline**이다. 두 추상 port에 의존하며; 구체적 I/O는 core가 결코
import하지 않는 adapter에 산다. 고정된 파이프라인(core 소유)은:

```
discover/fetch          re-check (core)        curator gate (core)    version (core)     publish
 ┌───────────────┐      ┌───────────────┐      ┌──────────────┐      ┌──────────┐      ┌──────────────┐
 │ContentSource  │ ──▶  │ public-safe    │ ──▶ │ Jimmy        │ ──▶ │ semver + │ ──▶ │ PublishSink  │
 │Adapter (PORT) │      │ RE-CHECK       │      │ approval     │      │ digest   │      │ Adapter(PORT)│
 └───────────────┘      └───────────────┘      └──────────────┘      └──────────┘      └──────────────┘
   CandidateItem          RecheckVerdict          approval rec.         PublishableItem    PublishReceipt
```

| Property | hexagon이 이를 어떻게 보장하는가 |
| --- | --- |
| Core는 port에만 의존 | core는 두 `interface` + value object만 import한다; 구체적 adapter나 그 SDK는 결코 import하지 않는다. |
| adapter는 gate를 우회할 수 없음 | 어느 port에도 source에서 sink로 직접 emit하는 **method가 없다**. core가 `publish()`의 유일한 호출자이며, 재검사 + curator gate + 버전 부여 이후에만 호출한다. |
| Public-safe by construction | sink는 오직 `PublishableItem`만 받는데, 이 타입은 core가 재검사 **이후에만** 발행한다; source는 오직 `CandidateItem`만 반환할 수 있고, 이는 publishable하지 않다. 타입 boundary가 *곧* safety boundary다. |
| Independence (공유 substrate 없음) | adapter는 upstream을 id/URI/version으로 참조하고, CAW-04의 OWN 복사본을 유지하며, secret은 env ref로만 받는다. |

## 2. Value object (port를 가로지르는 유일한 것)

port는 CAW-04 자신의 provenance를 담은 value object로만 말한다. 둘은 safety에 load-bearing하다:
source는 `CandidateItem`을 발행할 수 있지만 `PublishableItem`은 **결코** 발행할 수 없다; 후자는 core만 발행한다.

```ts
// Produced by a source; NOT publishable. Carries upstream's claim as EVIDENCE only.
type CandidateItem = {
  kind: ContentKind;                 // TIP | SKILL | WORKFLOW | PLAYBOOK
  payload: ContentPayload;           // markdown/MDX + structured frontmatter (ADR-0002)
  source_ref: SourceRef;             // { adapterId, id/URI, upstream_version } — referenced, not embedded
  upstream_boundary_claim: string;   // EVIDENCE ONLY — never trusted as a verdict (ADR-0004 §Decision.2)
  upstream_metadata?: Record<string, unknown>;
};

// Minted ONLY by the core after re-check + curator gate + versioning. The only input a sink accepts.
type PublishableItem = {
  kind: ContentKind;
  publicView: PublicProjection;      // audit-only provenance (origin_ref/origin_version) STRIPPED → sidecar (ADR-0002)
  boundary: "public";                // re-computed by the core; the ONLY allowed value
  semver: string;                    // public addressable identity (ADR-0005)
  content_digest: string;            // immutability proof (ADR-0005)
  provenance: PublicProvenance;      // public-safe provenance kept on the artifact
  verdict_ref: string;               // back-ref to the RecheckVerdict that cleared it
};
```

> Public-projection split (ADR-0002): audit 전용 `origin_ref`/`origin_version`은 **sidecar**에 살며
> `PublicProjection`으로 결코 직렬화되어서는 안 된다. sink는 `publicView`만 받는다; 타입이 audit 전용 필드의 누출을
> 구조적으로 불가능하게 만든다(테스트로 집행).

`RecheckVerdict`, `AdapterCapabilities`, `Acceptance`, `PublishReceipt`, `PublishedRef`, `HealthStatus`는
공유 core 타입이다; 필드는 [../02-research/import-and-ports_ko.md](../02-research/import-and-ports_ko.md) §3–§5,
verdict 의미론은 [public-safe 재검사 문서](./import-and-recheck_ko.md)(TODO) 참조.

## 3. Port 1 — `ContentSourceAdapter`

Read-only, driven(core가 바깥으로 호출). 교체 가능: CAW-02 knowledge, CAW-03 skills, 그리고 미래의 어떤 wiki도
동일한 `fetch() -> CandidateItem` 뒤에 위치한다. adapter는 **재검사의 존재를 결코 알지 못한다**.

```ts
interface ContentSourceAdapter {
  capabilities: AdapterCapabilities;                        // port="source", provides=[...], requiresPublicSafe=true
  discover(query: SourceQuery): Promise<CandidateRef[]>;    // list importable items by id/URI (NO payload)
  fetch(ref: CandidateRef): Promise<CandidateItem>;         // pull ONE provenance-tagged candidate
  health(): Promise<HealthStatus>;                          // reachable? auth ok? (preflight)
}
```

| Method | Contract | Must NOT |
| --- | --- | --- |
| `discover` | query에 맞는 경량 ref(id/URI/version) 반환; v1은 pull-only. | payload를 반환하거나 boundary verdict를 적용. |
| `fetch` | 정확히 하나의 `CandidateItem` 반환, `source_ref` + `upstream_boundary_claim` 태깅. | `boundary:"public"` 설정, audit 필드 제거, publishability 주장. |
| `health` | preflight용 저렴한 reachability/auth 프로브. | write 수행이나 upstream 변경. |
| `capabilities` | `provides`, `requiresConfig`, `maturity` 선언; `requiresPublicSafe`는 `true`이며 불변. | public-safe 요구 사항을 스스로 비활성화. |

**v1 concrete:** `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`.
**Stub:** `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter` (see §6).

Cross-product 규칙: CAW-02와 CAW-03은 **별개의 제품**이다; 이 adapter들은 id/URI/version으로 명시적 import
boundary를 가로지르며 store/registry/runtime을 결코 공유하지 않는다(Independence §1). CAW-04는 실제로 publish하는
것만 복사한다.

## 4. Port 2 — `PublishSinkAdapter`

Driven; 검증된 아티팩트를 emit한다. **오직** `PublishableItem`만 소비한다 — 이미 재검사되고, curator 승인되고,
버전이 부여되고, `boundary=public`이며, audit 필드가 제거된 것.

```ts
interface PublishSinkAdapter {
  capabilities: AdapterCapabilities;                                          // port="sink", accepts=[...]
  canAccept(item: PublishableItem): Promise<Acceptance>;                      // type/format/boundary preflight
  publish(item: PublishableItem, ctx: PublishContext): Promise<PublishReceipt>;   // emit a versioned artifact
  unpublish(ref: PublishedRef, ctx: PublishContext): Promise<PublishReceipt>;     // tombstone/redact (brief §3 uc4)
}
```

| Method | Contract | Must NOT |
| --- | --- | --- |
| `canAccept` | 저렴한 preflight: 이 sink가 `boundary=public`에서 이 `kind`/format을 emit할 수 있는가? `Acceptance.yes/no(reason)` 반환. | boundary를 재유도하거나 override. |
| `publish` | immutable, addressable 아티팩트 하나 emit; `PublishReceipt`(location + digest echo) 반환. | freeze된 `(slug,semver)` 변경; gate 재실행이나 생략. |
| `unpublish` | first-class withdraw/redact → HTTP 410 tombstone(ADR-0005); 이전 version은 tombstone으로 addressable하게 유지. | 이력을 조용히 hard-delete. |
| `capabilities` | `accepts`, `features`(예: `supports-unpublish`, `markdown`, `json`), `requiresPublicSafe:true` 선언. | `boundary != public`인 항목을 수락. |

**v1 concrete:** `SiteAndApiSinkAdapter` — Astro SSG 빌드(HTML) + 하나의 source에서 나온 prebuilt static REST
JSON / raw markdown / MCP resources view(ADR-0006, ADR-0007). Web/API parity는 단일 빌드에서 나온다;
sink는 **내부 store로의 live path가 없는 frozen vetted static artifact**를 쓴다.
**Stub:** `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter` (see §6).

> MCP resources view는 별도 port가 아니라 동일한 sink의 facet으로 구현된다(ADR-0007).

## 5. Capability descriptor + preflight

모든 adapter는 기계가 읽을 수 있는 descriptor를 지녀, core가 **모든 I/O 이전에** 배선을 검증한다 — 실패는
publish 중간이 아니라 preflight에서 실행 가능한 메시지와 함께 드러난다.

```ts
type AdapterCapabilities = {
  port: "source" | "sink";
  id: string;
  version: string;
  provides?: ContentKind[];     // source: TIP/SKILL/WORKFLOW/PLAYBOOK
  accepts?: ArtifactKind[];     // sink: WEBSITE_BUILD/REST_INDEX/MD_DOC/PKG
  features?: string[];          // {"incremental","supports-unpublish","markdown","json"}
  requiresConfig?: string[];    // keys that MUST be present (preflight checks)
  requiresPublicSafe: true;     // INVARIANT — cannot be self-disabled by the adapter
  maturity: "v1" | "stub" | "experimental";
};
```

Preflight 규칙(실행 전 전부 통과해야 함):

| Rule | Failure message intent |
| --- | --- |
| 각 `active` id가 registry에서 resolve됨 | "unknown adapter `X` in ports.<port>.active" |
| Active sink가 파이프라인이 emit하는 것을 `accepts` | "sink `X` cannot accept REST_INDEX produced by the build" |
| Active source가 content model이 필요로 하는 것을 `provides` | "source `X` provides no SKILL kind" |
| 필요한 `requiresConfig`/auth 존재(env ref resolve) | "missing env CAW02_TOKEN for `caw02-knowledge`" |
| **`active` adapter 중 `maturity:"stub"`인 것이 없음** | "stub `package-registry` is active — implement <file> or disable" |
| active adapter에 대해 `health()` ok | "source `X` unreachable / auth failed" |

descriptor의 `requiresPublicSafe:true`는 core가 단언하는 불변식이다; 이를 `false`로 선언하려는 adapter는
preflight에 실패한다. 이것이 §2의 타입 boundary 뒤에 있는 두 번째 구조적 가드다.

## 6. config 기반 registry — 배선이 바뀌는 유일한 곳

adapter는 **등록**되며(core에 하드코딩되지 않음) **config로 선택**된다. port당 한 블록. source는
**fan-in**(여러 active)을 허용한다. secret은 **env ref만**(공유 substrate 없음). 재검사
프로필은 **core**에 살며, 결코 adapter에 있지 않다.

```yaml
# caw04.config.yaml — the ONLY place wiring changes
ports:
  source:
    active: [caw02-knowledge, caw03-skills]      # fan-in: multiple sources import in
    caw02-knowledge: { endpoint: "...", auth: "env:CAW02_TOKEN" }
    caw03-skills:    { endpoint: "...", auth: "env:CAW03_TOKEN" }
    internal-wiki:   { enabled: false }          # stub present, off until connector lands
    curated-bundle:  { enabled: false }          # stub
  sink:
    active: [site-and-api]
    site-and-api:       { out_dir: "...", formats: [markdown, json] }
    external-docs-host: { enabled: false }       # stub
    package-registry:   { enabled: false }       # stub
    syndication:        { enabled: false }       # stub
profiles:
  recheck: { ... }   # public-safe re-check thresholds / pattern lists — CORE, not any adapter
```

registry는 adapter가 core의 재검사, curator gate, boundary policy를 override하게 **결코** 두지 않는다. 논리적
id → adapter factory를 매핑하고 어떤 것이 `active`인지 선택할 뿐이다. adapter discovery 메커니즘(내장
registry vs entry-point/manifest)과 adapter↔port SemVer/compat 정책은
`TODO(open-question: see ADR-0004)`.

## 7. documented-stub 패턴 (미래 connector)

미래 connector는 v1에서 **documented stub**으로 출하된다: 실제 interface, `NotImplemented` 본문,
`maturity="stub"` descriptor, config 예시. 나중에 배선 = *그 한 파일의* method 본문을 채우는 것.
stub은 **등록되고 discoverable**하지만(`registry.list()`와 preview/admin UI에 나타남)
기본적으로 **config-disabled**다; preflight는 `active`한 `stub`의 실행을 거부하며 구현할 파일을 가리킨다.

```ts
@registerAdapter({ port: "sink", id: "package-registry" })
class PackageRegistrySinkAdapter implements PublishSinkAdapter {
  /** STUB — publish skills as installable packages. Implement when approved (brief §8 stub, §10 non-goal v1).
   *  Contract: PublishSinkAdapter (§4). Must respect core public-safe gate; only accept boundary=public.
   *  Config: ports.sink.package-registry: { registry_url, auth: "env:PKG_TOKEN", namespace } */
  capabilities = { port: "sink", id: "package-registry", version: "0.0.0",
    accepts: ["PKG"], features: ["supports-unpublish"],
    requiresConfig: ["registry_url", "auth"], requiresPublicSafe: true, maturity: "stub" } as const;
  canAccept() { return Acceptance.no("stub not wired"); }
  publish()   { throw new NotImplemented("package-registry sink not yet wired"); }
  unpublish() { throw new NotImplemented("stub"); }
}
```

| Required stub | Port | Notes |
| --- | --- | --- |
| `InternalWikiSourceAdapter` | source | 내부 wiki에서 import(여전히 재검사를 거침) |
| `CuratedBundleSourceAdapter` | source | 임의의 curated bundle import |
| `ExternalDocsHostSinkAdapter` | sink | 외부 docs host로 publish |
| `PackageRegistrySinkAdapter` | sink | skill을 설치 가능한 패키지로 publish |
| `SyndicationSinkAdapter` | sink | feed로 syndicate |

safety 속성이 stub 패턴에서도 살아남음에 주목: 완전히 배선된 미래 sink조차 여전히
`PublishableItem`만 받고 여전히 core의 gate 뒤에 위치한다 — 새 connector는 누출 surface를 넓힐 수 없다.

## 8. seam test (왜 이것이 일반화되는가)

새 통합이 **adapter 파일 하나 + config 블록 하나만** 건드리면 그 변경은 "open by design"이다. 이 중 어느 것이라도
core 편집을 강제한다면 contract가 새는 것이다 — [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)를 다시 연다.

| New integration | Adds | Does NOT touch |
| --- | --- | --- |
| 내부 wiki를 source로 | `InternalWikiSourceAdapter` 구현, config 활성화 | core, 재검사, gate, 다른 adapter |
| Curated bundle import | `CuratedBundleSourceAdapter` 구현 | content model / 재검사(`CandidateItem` 소비) |
| 외부 docs host로 publish | `ExternalDocsHostSinkAdapter` 구현, `active` 토글 | human gate + public-safe 재검사(core에 머묾) |
| skill을 패키지로 publish | `PackageRegistrySinkAdapter` 구현 | 버전/immutability 규칙(core) |
| feed로 syndicate | `SyndicationSinkAdapter` 구현 | `PublishableItem`의 provenance/boundary |

## Open Questions

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적:

- TODO(open-question: adapter **discovery 메커니즘** — 내장 registry vs entry-point/manifest — 과
  adapter↔port SemVer/compat 정책.)
- TODO(open-question: import이 **pull**(`discover()` 폴링) vs **push**(upstream이 알림); v1 초안은
  pull-only — source port에 영향.)
- TODO(open-question: CAW-02와 CAW-03이 같은 논리적 항목을 노출할 때의 **fan-in dedup/precedence** +
  provenance 보존 merge.)
- TODO(open-question: immutable addressable version에 대한 `unpublish` 의미론 — tombstone(HTTP 410) vs
  hard-removal; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)와 공동 소유.)
- TODO(open-question: upstream이 source item을 **철회/재검증**할 때 CAW-04가 이를 어떻게 알고 gate를
  재실행하는지 — `source_ref`가 liveness/revocation 검사를 담는가.)

## runbook에 대한 함의

- **RB (core/ports):** `ContentSourceAdapter` + `PublishSinkAdapter` interface와 value object
  (`CandidateItem`, `PublishableItem`, `RecheckVerdict`, `AdapterCapabilities`)를 정의한다. fake만으로 트리를
  green으로 유지 — 구체적 I/O 없음. Acceptance: source가 `PublishableItem`을 생성할 수 없음(타입으로 집행).
- **RB (registry/config):** register + select-by-config, `caw04.config.yaml` loader, env-ref
  secret, **preflight**를 구현한다. Acceptance: preflight가 stub/incapable/misconfigured 배선을 실행 가능한
  메시지와 함께 거부하고, `requiresPublicSafe:false`를 선언하는 descriptor를 거부한다.
- **RB (v1 adapters):** `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`,
  `SiteAndApiSinkAdapter`(후자는 [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md) +
  [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)로 구현).
- **RB (stubs):** brief-§8의 모든 stub을 §7을 통해 출하 — 등록됨, `maturity="stub"`, config-disabled. Acceptance:
  각각이 `registry.list()`에 나타나고 강제로 `active`되면 preflight에 의해 거부됨.
- Cross-product 링크(CAW-02, CAW-03)는 오직 `ContentSourceAdapter` contract 뒤에, id/URI/version으로만 머문다 —
  결코 공유 store가 아님(Independence §1).

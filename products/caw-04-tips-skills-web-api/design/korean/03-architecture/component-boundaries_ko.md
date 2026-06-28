# Component Boundaries — 모듈 소유권 및 핵심 서비스 시그니처

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./system-architecture_ko.md](./system-architecture_ko.md)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **Product Core 내부의 모듈 소유권**과 그 다섯 가지 핵심 서비스(Import, Re-check/Gate, Versioning,
Build/Publish, Audit)의 **시그니처 수준 계약**을 확정하며, 또한 핵심을 떠받치는 규칙 — 즉
**public-safe re-check와 curator gate(큐레이터 게이트)는 core에 위치하며 adapter가 이를 우회할 수 없다**는 규칙
— 을 확정한다. 이 문서는 [system-architecture_ko.md](./system-architecture_ko.md)의 컨테이너 분할을 구체화하며,
엔티티 필드(ADR-0002), gate 정책(ADR-0003), storage 정체성(ADR-0005)을 재정의하지 않는다. 시그니처는 runbook을
위한 **계약 스케치(contract sketch)** 이며(실제 코드는 builder가 작성), 언어 바인딩은 ADR-0006/0007에서 확정된다.

## 모듈 맵

| Module | Layer | Owns | Depends on (allowed) | Must NOT depend on |
|---|---|---|---|---|
| `core/model` | domain | Entity types, `CandidateItem`, `PublishableItem`, `RecheckVerdict`, value objects (`Boundary`, `Semver`, `ContentDigest`) | — | adapters, web stack, I/O |
| `core/ports` | domain | Port interfaces `ContentSourcePort`, `PublishSinkPort`; `AdapterCapabilities` | `core/model` | concrete adapters |
| `core/import` | application | Import service: discover/fetch via source port, assemble `CandidateItem` | `model`, `ports` | sink/source impls |
| `core/recheck` | application | **Re-check + gate** (deny-by-default); `profiles.recheck` | `model`, `audit` | any adapter |
| `core/versioning` | application | Assign immutable `(slug, semver)` + content-digest; freeze; tombstone | `model`, storage write | adapters |
| `core/publish` | application | Drive the chosen `PublishSinkPort`; emit `PublishReceipt` | `model`, `ports`, `audit` | source impls |
| `core/audit` | application | Append-only audit of every stage | `model` | adapters |
| `core/registry` | config | Resolve adapters from `caw04.config.yaml`; preflight wiring | `ports`, capabilities | adapter internals |
| `adapters/source/*` | adapter | `Caw02Knowledge`, `Caw03SkillsRegistry`, stubs | `core/ports`, `core/model` | `core/recheck`, `core/versioning` |
| `adapters/sink/*` | adapter | `SiteAndApiSink` (Astro build), stubs | `core/ports`, `core/model` | `core/recheck` |

확고한 규칙: 의존성은 **안쪽(inward)** 으로, `core/model` + `core/ports`를 향한다. Adapter는 port를 알 뿐,
결코 core 서비스를 알지 못한다. Core는 결코 구체 adapter를 import하지 않는다 — `core/registry`를 통해 해석한다
(ADR-0004 §4).

## 파이프라인과 각 단계의 위치

```
[adapters/source]      [core/import]   [core/recheck]    [core/versioning]   [core/publish]   [adapters/sink]
 fetch CandidateItem ─►  assemble    ─► RE-CHECK+GATE  ─►  freeze (slug,    ─►  drive sink  ─►  build/emit
 (+upstream claim =      provenance     deny-by-default     semver,digest)      PublishReceipt   static artifact
  EVIDENCE only)                        + curator gate
                                        ▲ CORE-ONLY ▲
```

re-check/gate는 source adapter와 임의의 sink **사이에** 위치한다. 이를 우회하는 **raw import 경로는 존재하지 않는다**
(ADR-0004 §2). 사람과 agent는 동일한 단계를 거친다.

## 핵심 서비스 시그니처 (계약 스케치)

### 공유 모델

```ts
type Boundary = "public" | "internal" | "confidential";

interface CandidateItem {            // produced by a source adapter, pre-check
  payload: EntityPayload;            // Tip|Skill|Workflow|Playbook + Example/Source refs
  upstream_boundary_claim: Boundary; // EVIDENCE ONLY — never a verdict
  source_ref: SourceRef;            // id/URI/version into the upstream product
  upstream_metadata: Record<string, unknown>;
}

interface PublishableItem {          // ONLY thing a sink may consume
  payload: PublicProjection;         // audit-only fields already stripped (ADR-0002)
  boundary: "public";               // invariant: always public here
  semver: Semver;                    // immutable identity (ADR-0005)
  content_digest: ContentDigest;     // immutability proof
  provenance_public: ProvenancePublic; // public-safe subset only
}

interface RecheckVerdict {
  decision: "publish" | "quarantine" | "reject";
  boundary_eff: Boundary;           // RE-COMPUTED; fail-closed to "confidential"
  findings: Finding[];
  evidence_ref: AuditRef;
}
```

### 1. Import service — `core/import`

```ts
interface ImportService {
  // Pull candidates from one/many active source adapters (fan-in).
  discover(query: DiscoverQuery): Promise<CandidateRef[]>;
  fetch(ref: CandidateRef): Promise<CandidateItem>;
}
```
provenance(출처) 조립을 담당하며, 안전성에 관해서는 아무것도 담당하지 않는다. 오직 `ContentSourcePort`만 호출한다.

### 2. Re-check / Gate service — `core/recheck` (핵심을 떠받침, core 전용)

```ts
interface RecheckGateService {
  // The import-time enforcement of the ADR-0003 gate. Deny-by-default.
  recheck(item: CandidateItem): Promise<RecheckVerdict>;
  // Promote to live ONLY after a passing verdict AND explicit curator approval.
  approve(verdict: RecheckVerdict, curator: CuratorRef): Promise<ApprovedItem>;
}
```
검사 항목(ADR-0004 §2): provenance 존재 여부; `boundary_eff === "public"` 재계산(해소 불가능한 조상에 대해
fail-closed); visibility가 private 파생이 아닐 것; **렌더링된 공개 뷰**에 대한 redaction/leak 스캔; claim/source
분리; schema 적합성. re-check 실패는 **upstream이 public-safe로 표시했더라도** 해당 항목을 차단한다.
`profiles.recheck`(임계값, 패턴 목록)는 여기에 위치하며, 결코 adapter에 두지 않는다.

### 3. Versioning service — `core/versioning`

```ts
interface VersioningService {
  freeze(item: ApprovedItem): Promise<PublishableItem>; // assign (slug,semver)+digest; write public projection to git; sidecar audit-only
  supersede(slug: Slug, next: ApprovedItem): Promise<PublishableItem>; // edits = NEW version
  tombstone(ref: VersionRef, reason: TombstoneReason): Promise<Tombstone>; // unpublish/redact → HTTP 410
}
```
게시된 `(slug, semver)`는 **영원히** 동결된다(ADR-0005); boundary 변경은 `tombstone`으로 라우팅되며, 결코
변형(mutate)하지 않는다.

### 4. Build/Publish service — `core/publish`

```ts
interface PublishService {
  publish(item: PublishableItem, ctx: PublishCtx): Promise<PublishReceipt>;
  unpublish(ref: VersionRef, ctx: PublishCtx): Promise<PublishReceipt>;
}
```
활성 `PublishSinkPort`로 위임한다. `SiteAndApiSink`의 경우 이는 Astro SSG 빌드를 트리거하며, 이 빌드는 `dist/`를
방출하기 전에 빌드 타임 `boundary === "public"` assertion + public-projection 테스트를 실행한다(ADR-0006). 이
서비스는 `boundary !== "public"`인 임의의 항목을 거부한다.

### 5. Audit service — `core/audit`

```ts
interface AuditService {
  record(event: AuditEvent): Promise<AuditRef>; // import|recheck|approve|publish|unpublish, with provenance
}
```
Append-only(추가 전용); 다른 모든 서비스가 이를 통해 기록하므로 게시된 각 항목은 그 검증된 source + 안전성
검토까지 추적된다(brief §3 uc5).

## Port 계약 (유일한 adapter 표면)

```ts
interface ContentSourcePort {
  capabilities(): AdapterCapabilities;            // requiresPublicSafe: true (cannot self-disable)
  discover(query: DiscoverQuery): Promise<CandidateRef[]>;
  fetch(ref: CandidateRef): Promise<CandidateItem>;
  health(): Promise<Health>;
}

interface PublishSinkPort {
  capabilities(): AdapterCapabilities;
  canAccept(item: PublishableItem): Acceptance;   // type guarantees boundary === "public"
  publish(item: PublishableItem, ctx: PublishCtx): Promise<PublishReceipt>;
  unpublish(ref: VersionRef, ctx: PublishCtx): Promise<PublishReceipt>;
}
```

## 비우회 규칙 (핵심을 떠받침)

"adapter가 re-check + gate를 우회할 수 없다"가 구조적으로 어떻게 강제되는가:

| Mechanism | Effect |
|---|---|
| **Type wall** | Sink은 `PublishableItem`만 소비하는데, 이는 **오직** `core/versioning.freeze`만이 생산할 수 있고, 이는 다시 `core/recheck.approve`가 내놓은 `ApprovedItem`만을 받아들인다. core 외부에서는 `CandidateItem`에서 `PublishableItem`으로 가는 생성자 경로가 존재하지 않는다. |
| **No core import in adapters** | `adapters/*`는 `core/ports` + `core/model`만 import할 수 있다; `core/recheck`/`core/versioning`을 import하는 것은 금지된 의존성이다(architecture fitness test). |
| **Capability flag** | 모든 adapter descriptor는 `requiresPublicSafe: true`를 지니며, 이는 스스로 비활성화할 수 없다; preflight(`core/registry`)는 이를 결여한 adapter의 배선을 거부한다(ADR-0004 §3). |
| **Preflight** | 어떤 `active` adapter도 `stub`이어서는 안 된다; sink의 `accepts`는 파이프라인이 방출하는 것과 일치해야 한다; 누락된 config는 게시 도중이 아니라 즉시(fail fast) 실패한다. |
| **Build backstop** | 오작동하는 sink조차도 빌드 타임 `boundary === "public"` assertion + public-projection 테스트(ADR-0006)에 걸리며, 이는 빌드를 실패시킨다. |
| **Deny-by-default** | public-safe로 긍정적으로 확인되지 않은 것은 게시되지 않는다(ADR-0003/0004). |

음성 테스트(§11 회귀 가드): **upstream이 public-safe로 표시했으나** confidential 패턴을 지닌 항목은 기록된
finding과 함께 **차단 + 격리(quarantine)** 되어야 한다 — upstream claim이 verdict가 아니라 evidence임을 증명한다.

## 미해결 질문

- TODO(open-question: language-binding) — core를 위한 구체 언어(port는 여기서 기술 중립적; ADR-0006/0007).
- TODO(open-question: recheck-ruleset) — 정확한 re-check 규칙 집합 + `profiles.recheck` 임계값의 위치;
  공유 substrate 없이 CAW-02의 boundary와의 교리적(doctrinal) 정합성.
- TODO(open-question: fan-in-merge) — source adapter 전반에 걸친 provenance 보존 dedup/우선순위.
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의

- `core/model` + `core/ports`를 먼저 구축하라; 그 다음 임의의 sink보다 먼저 음성 중심(negative-heavy) 테스트 스위트와
  함께 `core/recheck`를 구축하라.
- `adapters/* → core/recheck|core/versioning` import를 금지하는 architecture fitness test를 추가하라.
- `PublishableItem`이 **오직** `core/versioning.freeze`를 통해서만 생성 가능하도록 실현하라(private constructor /
  factory) — type wall은 가장 저렴한 비우회 보장이다.
- 컨테이너 뷰와 public-safe-by-construction 레이어: [system-architecture_ko.md](./system-architecture_ko.md) 참조.
</content>
</invoke>

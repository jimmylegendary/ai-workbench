# 백엔드 코어 동작 계약 (타입 명세)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./import-service_ko.md](./import-service_ko.md) (Import + 재검사(re-check) 파이프라인)
  - [./build-and-publish-service_ko.md](./build-and-publish-service_ko.md) (PublishSink을 통한 Build/Publish)
  - [./persistence_ko.md](./persistence_ko.md) (md-in-git 저장소 + sidecar + index)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **CAW-04 제품 코어의 타입화된 동작 계약** — 두 개의 port(`ContentSourceAdapter`, `PublishSinkAdapter`)와
md-in-git 저장소 사이에 위치하는 헥사고날(hexagonal) 애플리케이션 계층 — 을 정의한다. 코어 동작(Import, ReCheckGate,
Versioning, Build/Publish, Audit)을 그 시그니처, 입력, 출력, 실패 모드와 함께 열거한다. 이 문서는 구현 언어, *공개(public)*
읽기 surface의 HTTP/REST 형태(그것은 발행된 산출물이며 [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)에서 다룬다),
adapter 내부 구현을 결정하지 **않는다** — 오직 모든 adapter와 큐레이터 surface가 호출하는 **내부 코어 API**만을 다룬다.
타입은 기술 중립적인 의사 스키마(pseudo-schema)이며, 바인딩 언어는 [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)/[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)에서 고정된다.

## 핵심 불변식 (구조적으로 public-safe)

공개 surface에 도달할 수 있는 모든 변경(mutating) 동작은 **하나의 파이프라인**을 거친다:
`import → re-check → curator gate → version → build → publish`. 재검사나 큐레이터 승인을 건너뛰고 발행된 corpus에
쓰는 동작은 **존재하지 않는다**. 기본 거부(deny-by-default): `boundary_eff == public`임이 적극적으로 확인되지 않은
항목은 결코 버전이 부여되지 않고 결코 빌드되지 않는다. adapter는 코어를 호출하며, 코어는 어떤 adapter도 게이트를
스스로 우회(self-bypass)하도록 허용하지 않는다 ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).

## 동작 맵

| Group | Operation | Caller | corpus 변경? | 큐레이터 필요? |
|---|---|---|---|---|
| Import | `discoverCandidates` / `importCandidate` | curator surface / scheduler | no (staging만) | no |
| ReCheckGate | `runRecheck` | core (import 후 자동) | no (판정만) | no |
| Curator gate | `listQueue` / `approve` / `reject` | curator surface | approve 시 승격 | **yes** |
| Versioning | `assignVersion` / `resolveLatest` | core / read | publish 시 Version 기록 | yes (approve 경유) |
| Build/Publish | `build` / `publish` / `unpublish` / `redact` / `deprecate` | publish service | yes | yes |
| Audit | `appendEvent` / `getProvenance` / `listEvents` | 모든 ops (write) / curator (read) | 추가 전용(append-only) 원장 | no |

## 공유 타입

```ts
type Kind = "tip" | "skill" | "workflow" | "playbook";
type Boundary = "public" | "internal" | "confidential";
type Decision = "publish" | "quarantine" | "reject";

// Upstream-tagged candidate produced by a ContentSourceAdapter (ADR-0004).
interface CandidateItem {
  kind: Kind;
  payload: ContentPayload;            // body + reusable/auditable metadata (ADR-0002)
  source_ref: OriginRef;              // id/URI/version of the upstream item
  upstream_boundary_claim: Boundary;  // EVIDENCE ONLY — never trusted as verdict
  upstream_metadata: Record<string, unknown>;
}

// Audit-only; lives in SIDECAR, NEVER serialized to web/API (ADR-0002/0005).
interface OriginRef { product: string; id: string; origin_version: string; fetched_at: string; }

// A re-checked, curator-approved, versioned, public artifact ready for a sink.
interface PublishableItem {
  slug: string;
  kind: Kind;
  semver: string;                     // assigned at publish (ADR-0005)
  digest: string;                     // "sha256:..." over canonical serialization
  boundary: "public";                 // type-narrowed: only public reaches here
  payload: ContentPayload;            // public projection ONLY (no origin_ref)
  published_at: string;
}

interface Result<T> { ok: boolean; value?: T; error?: CoreError; }
interface CoreError { code: string; message: string; findings?: Finding[]; }
```

## Import 동작

파이프라인은 [./import-service_ko.md](./import-service_ko.md)를 참고하라. 계약 surface는 다음과 같다:

```ts
// Pull discovery across one or many active source adapters (fan-in, ADR-0004 §4).
function discoverCandidates(query: DiscoverQuery): Result<CandidateRef[]>;

// Fetch one candidate into the staging area (NOT the published corpus).
// Always immediately triggers runRecheck; the raw payload is never addressable.
function importCandidate(ref: CandidateRef): Result<StagedCandidate>;
```

- `importCandidate`는 `(source_ref.product, source_ref.id, origin_version)` 단위로 멱등(idempotent)하다. 변경되지 않은
  upstream 버전을 재import하면 중복이 아니라 기존 staged 레코드를 반환한다.
- staging은 격리(quarantine) 영역이며, 결코 서빙되지 않고 결코 빌드되지 않는다. 실패 모드: `SOURCE_UNAVAILABLE`,
  `SCHEMA_NONCONFORMANT`, `DUPLICATE_PRECEDENCE` (fan-in 충돌 — TODO(open-question: dedup/precedence, ADR-0004)).

## ReCheckGate 동작 (코어 단계 — 핵심적)

재검사는 **코어 단계이며 결코 adapter 안에 있지 않다** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §2).
이는 `upstream_boundary_claim`을 신뢰하는 대신 boundary를 재계산한다.

```ts
function runRecheck(staged: StagedCandidate): Result<RecheckVerdict>;

interface RecheckVerdict {
  decision: Decision;                 // publish | quarantine | reject
  boundary_eff: Boundary;            // RE-COMPUTED; fail-closed to confidential
  findings: Finding[];
  evidence_ref: string;              // pointer into the audit ledger
}
interface Finding { rule: string; severity: "block" | "warn"; detail: string; locus?: string; }
```

검사 항목 (기본 거부; 어떤 `block` finding이라도 ⇒ `decision != publish`):

| Rule | 실패 ⇒ |
|---|---|
| `provenance.present` | reject (검증된 내부 source 없음) |
| `boundary.recompute` | `boundary_eff` 재계산; 해결 불가능한 ancestor ⇒ `confidential` ⇒ quarantine |
| `visibility.not_private_derived` | quarantine |
| `redaction.leak_scan` | 렌더링된 **public view**에서 confidential 패턴을 스캔 ⇒ quarantine |
| `claim_source.separation` | warn/quarantine (internal-claim/public-research 혼동 없음) |
| `schema.conformance` | reject |

재검사의 `block`은 어떤 upstream public-safe 주장도 무효화한다. `quarantine`은 큐레이터 검토를 위해 항목을 보류시키고,
`reject`는 audit 기록과 함께 항목을 staging에서 폐기한다. 패턴 목록/임계값은 코어의 `profiles.recheck`에 있으며,
결코 adapter에 있지 않다 ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §4).

## Curator gate 동작

```ts
function listQueue(filter?: QueueFilter): Result<QueueEntry[]>;     // verdicts awaiting Jimmy
function approve(entryId: string, decision: ApproveDecision): Result<PublishableItem>;
function reject(entryId: string, reason: string): Result<void>;

interface ApproveDecision { semver: string; notes?: string; }     // curator assigns the bump
```

- `approve`는 `decision=publish` 판정을 `PublishableItem`으로 승격시키는 **유일한** 경로이다
  ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md) §3, [ADR-0003] gate). 이는 큐레이터가 semver bump를
  지정하도록 요구하고, 승격 시점에 `runRecheck`를 재실행한다(오래된 판정 없음).
- `quarantine` 항목은 findings가 해결되기 전까지 승인될 수 없다(재import 또는 그 자체가 audit되는 명시적 override).
  자동 생성은 제안(proposal)일 뿐이며, 모든 publish는 사람이 승인한다 (brief §11).

## Versioning 동작

식별자 = **semver + content-digest** ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

```ts
function assignVersion(item: PublishableItem, bump: ApproveDecision): Result<Version>;
function resolveLatest(slug: string): Result<Version>;             // newest non-redacted

interface Version {
  slug: string; semver: string; digest: string;
  published_at: string; status: "published" | "deprecated" | "unpublished" | "redacted";
  successor?: string;                 // semver pointer for deprecate/redact
}
```

강제되는 규칙 (write 시점, [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)):

- 한번 publish된 `(slug, semver)`는 **영원히 동결(frozen)**된다. 바이트 + digest는 결코 변하지 않는다.
- 한번 사용된 `(slug, semver)`는 **결코 재사용되지 않는다** — unpublish/redact 이후에도 마찬가지(주소 재충전 방지).
- 모든 편집은 **새로운 Version**이다. `assignVersion`은 다운그레이드나 재사용을 `VERSION_CONFLICT`로 거부한다.
- `digest`는 버전이 주소 지정 가능(addressable)해지기 전에 canonical serialization에 대해 계산된다.

## Build/Publish 동작

상세 내용은 [./build-and-publish-service_ko.md](./build-and-publish-service_ko.md)에 있다. 계약 surface:

```ts
function build(scope: BuildScope): Result<BuildArtifact>;          // Astro SSG; asserts boundary==public
function publish(version: Version, ctx: PublishCtx): Result<PublishReceipt>;
function unpublish(slug: string, ctx: PublishCtx): Result<PublishReceipt>;     // whole item -> 410
function redact(slug: string, semver: string, ctx: PublishCtx): Result<PublishReceipt>;  // one version -> 410
function deprecate(slug: string, semver: string, successor?: string): Result<PublishReceipt>;
```

`build`는 **fail-closed 불변식**을 가진다: emit된 항목 중 하나라도 `boundary != public`이면 빌드가 실패하고 아무것도
배포되지 않는다 ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md) §Decision). `publish`/`unpublish`는
활성 `PublishSinkAdapter`(v1: `SiteAndApiSinkAdapter`)에 위임된다. 코어는 `PublishableItem`만을 공급한다.

## Audit 동작

```ts
function appendEvent(ev: PublishEvent): Result<void>;             // hash-chained append-only ledger
function getProvenance(slug: string, semver: string): Result<OriginRef>;   // SIDECAR — curator only
function listEvents(filter?: EventFilter): Result<PublishEvent[]>;

interface PublishEvent {
  seq: number; prev_hash: string; hash: string;   // hash chain (ADR-0003 ledger)
  op: "import" | "recheck" | "approve" | "reject" | "publish" | "unpublish" | "redact" | "deprecate";
  slug?: string; semver?: string; digest?: string; actor: string; at: string;
  verdict?: Decision; reason?: string;
}
```

- `getProvenance`는 sidecar에서 **audit 전용** `origin_ref`/`origin_version`을 반환한다. 이는 공개 web/API surface에
  결코 노출되어서는 안 된다(테스트로 강제, [ADR-0002]/[ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- 원장(ledger)이 주요 audit 증인(witness)이며, git history는 중복된 두 번째 증인이다
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). 모든 변경 op는 정확히 하나의 이벤트를 추가한다.

## 오류 코드 (안정적 계약)

| Code | Group | 의미 |
|---|---|---|
| `SOURCE_UNAVAILABLE` | Import | adapter `health()` 실패 / fetch 오류 |
| `SCHEMA_NONCONFORMANT` | Import/ReCheck | payload가 content-model 스키마를 통과하지 못함 |
| `RECHECK_BLOCKED` | ReCheckGate | `block` finding ⇒ public-safe 아님 |
| `BOUNDARY_NOT_PUBLIC` | ReCheck/Build | 재계산된 boundary != public (fail-closed) |
| `CURATOR_REQUIRED` | Gate | `approve` 없이 publish 시도됨 |
| `VERSION_CONFLICT` | Versioning | 다운그레이드 / `(slug,semver)` 재사용 |
| `SINK_REJECTED` | Publish | `PublishSinkAdapter.canAccept`가 false 반환 |
| `LEDGER_BROKEN` | Audit | hash-chain 검증 실패 (중단) |

## 미해결 질문(Open Questions)

- TODO(open-question: pull vs push import trigger — `discoverCandidates` 주기에 영향; [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) 참고).
- TODO(open-question: CAW-02 + CAW-03 source 전반의 fan-in dedup/precedence + provenance 병합; [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).
- TODO(open-question: 누가 semver bump를 지정하는가 — 큐레이터 전용 vs diff-assisted 제안; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- TODO(open-question: liveness/revocation — upstream source가 import된 항목을 철회할 때 코어가 어떻게 알게 되는가; [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북(runbook)에 대한 함의

- 런북은 위의 코어 동작 인터페이스를 두 port + 큐레이터 surface가 바인딩하는 안정적 내부 API로 정의한다.
- 런북은 **fail-closed `boundary == public` 빌드 단정(assertion)**을 CI에 연결한다 ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)).
- 런북은 **부정(negative) 테스트 중심 스위트**를 구현한다: upstream에서 public-safe로 표시되었지만 confidential 패턴을 담고 있는 항목은 반드시 차단되고 격리되며 finding이 로그로 남아야 한다.
- 런북 테스트는 `origin_ref`/`origin_version`이 어떤 web/API projection에도 직렬화되지 않음을 단정한다.

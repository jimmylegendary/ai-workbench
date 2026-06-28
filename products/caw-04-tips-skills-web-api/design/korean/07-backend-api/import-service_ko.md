# Import 서비스 (ContentSource + Core 재검사 + Curator Queue)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md) (Import + ReCheckGate 동작 계약)
  - [./persistence_ko.md](./persistence_ko.md) (재검사·승인된 항목이 안착하는 곳)
  - [./build-and-publish-service_ko.md](./build-and-publish-service_ko.md) (승인 후 실행되는 것)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **import 서비스**를 설명한다: `ContentSourceAdapter`들이 명시적 경계(boundary)를 넘어 형제(sibling) 제품에서
후보 콘텐츠를 어떻게 pull하는지, **core public-safe 재검사** 파이프라인이 모든 import에서 어떻게 실행되는지, 그리고
**큐레이터 승인 큐(curator approval queue)**가 발행 corpus로의 승격을 어떻게 게이트하는지를 다룬다. 이 문서는 게이트
*정책*(그것은 [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)), 저장소 레이아웃
([./persistence_ko.md](./persistence_ko.md)), 또는 빌드([./build-and-publish-service_ko.md](./build-and-publish-service_ko.md))를
재정의하지 않는다.

## 파이프라인 개요

```
discover() ── fetch() ──> [STAGING]  ── runRecheck() ──> verdict
   (source adapters)        (quarantine,                    │
                             never served)                  ├─ publish    -> curator QUEUE
                                                            ├─ quarantine -> curator QUEUE (blocked)
                                                            └─ reject     -> discarded + audited
                                                                              │
                                          curator approve(semver) ───────────┘
                                                            │
                                          assignVersion -> write md-in-git -> trigger build
```

파이프라인 순서 (핵심적, [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §2):
`import → re-check → curator gate → version → publish`. 재검사를 건너뛰는 **raw import 경로는 없다** —
agent와 사람이 동일한 검사를 사용한다. CAW-04는 자신이 발행하는 것의 **자체 복사본**을 유지하며, upstream은
id/URI/version으로만 참조하고 결코 공유 저장소를 통하지 않는다 ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).

## ContentSource port

```ts
interface ContentSourceAdapter {
  capabilities(): AdapterCapabilities;        // port, id, version, provides, requiresPublicSafe:true, maturity
  discover(query: DiscoverQuery): CandidateRef[];
  fetch(ref: CandidateRef): CandidateItem;    // payload + upstream_boundary_claim + source_ref + upstream_metadata
  health(): HealthStatus;
}
```

- **읽기 전용(Read-only).** adapter는 upstream을 id/URI/version으로 참조하며 결코 되쓰지(write back) 않는다.
- adapter는 **재검사가 존재한다는 것조차 알지 못한다** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §1) —
  그것에 영향을 주거나 우회할 수 없다. `upstream_boundary_claim`은 **증거(evidence)일 뿐**, 결코 판정이 아니다.

### v1 source + 문서화된 stub

| Adapter | Maturity | Provides |
|---|---|---|
| `Caw02KnowledgeSourceAdapter` | concrete (v1) | CAW-02(별도 제품)의 검증된 지식 / 인용된 tips |
| `Caw03SkillsRegistrySourceAdapter` | concrete (v1) | CAW-03 / skills registry(별도 제품)의 검증된 Skills/Workflows/Playbooks |
| `InternalWikiSourceAdapter` | stub | 향후 내부 wiki import |
| `CuratedBundleSourceAdapter` | stub | 향후 임의의 curated bundle |

stub은 다음으로 출하된다: 실제 인터페이스, `NotImplemented` 본문, descriptor `maturity="stub"`, config 예시 — 등록되고
발견 가능하며 **기본적으로 config 비활성화**. preflight는 `active` stub을 거부한다
([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §5). source는 **fan-in**(여러 개 동시 활성)을 지원한다.

## Import: discover + fetch

- v1은 **pull**이다: import 서비스(큐레이터 트리거 또는 예약)가 활성 source 전반에 `discover()`를 호출한 다음,
  선택된 ref마다 `fetch()`한다. (upstream으로부터의 push는 TODO(open-question), [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md).)
- `fetch()`는 `CandidateItem`을 **staging**에 안착시킨다 — 결코 서빙되지 않고 결코 빌드되지 않는 격리(quarantine) 영역.
- import는 `(source_ref.product, source_ref.id, origin_version)` 단위로 멱등하다. 변경되지 않은 upstream 버전은 중복
  staged 레코드를 만들지 않는다.
- **Fan-in 충돌**(CAW-02와 CAW-03이 모두 동일한 논리적 항목을 노출)에는 dedup/precedence + provenance 병합 규칙이
  필요하다 — TODO(open-question, [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).

## Core 재검사 (신뢰 경계에서의 public-safe 게이트)

재검사는 **코어 단계이며 결코 adapter 안에 있지 않다** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §2) —
이는 [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) 게이트의 import 시점 강제이다.
**기본 거부(Deny-by-default):** public-safe로 적극 확인되지 않은 것은 무엇도 발행되지 않는다. 재검사 실패는 **upstream이
public-safe로 표시한 경우에도** 항목을 차단한다.

```ts
function runRecheck(staged: StagedCandidate): RecheckVerdict;
interface RecheckVerdict {
  decision: "publish" | "quarantine" | "reject";
  boundary_eff: Boundary;            // RE-COMPUTED locally; NOT the upstream claim
  findings: Finding[];
  evidence_ref: string;              // pointer into the hash-chained audit ledger
}
```

| # | Check | Rule | 실패 ⇒ |
|---|---|---|---|
| 1 | Provenance present | 검증된 내부 `source_ref`가 존재 | reject |
| 2 | Boundary recompute | `boundary_eff` 재계산; **fail-closed**: 해결 불가능한 ancestor ⇒ `confidential` | quarantine |
| 3 | `boundary_eff == public` | public만 진행 가능 | quarantine |
| 4 | Visibility not private-derived | private/internal-only 항목에서 파생되지 않음 | quarantine |
| 5 | Redaction / leak scan | **렌더링된 public view**를 confidential 패턴에 대해 스캔 | quarantine |
| 6 | Claim/source separation | 내부 Samsung/SAIT 주장과 public research의 혼동 없음 (brief §11) | quarantine/warn |
| 7 | Schema conformance | content model에 부합 ([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)) | reject |

- 임계값 + 패턴 목록은 **코어**의 `profiles.recheck`에 있으며 결코 adapter에 있지 않다. registry는 adapter가 재검사, human
  gate, 또는 boundary 정책을 override하도록 결코 허용할 수 없다 ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) §4).
- CAW-04는 boundary 로직을 **로컬에서** 재구현한다(재사용보다 독립성) — 자체 복사본이며, 공유 의존성 *없이* CAW-02와
  교리적으로 정렬된 상태를 유지한다 ([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) Consequences).
- 모든 판정은 `evidence_ref`로 참조되는 audit 이벤트(`recheck`)를 추가한다 ([./api-surface_ko.md](./api-surface_ko.md) Audit ops).

## 큐레이터 승인 큐

내부 미리보기/관리(admin) surface ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md) §3)가 후보를
라이브로 승격시키는 **유일한** 경로이다. **Jimmy가 모든 publish를 승인한다** (brief §11); 자동 생성은 제안일 뿐이다.

```ts
function listQueue(filter?: QueueFilter): QueueEntry[];
function approve(entryId: string, d: { semver: string; notes?: string }): PublishableItem;
function reject(entryId: string, reason: string): void;

interface QueueEntry {
  id: string; kind: Kind; slug: string;
  verdict: RecheckVerdict;            // findings + recomputed boundary shown to curator
  source_ref: OriginRef;             // shown in admin ONLY; never reaches public projection
  proposed_semver?: string;          // diff-assisted bump proposal (TODO open-question)
}
```

| Verdict | Queue 상태 | 큐레이터 동작 |
|---|---|---|
| `publish` | ready | findings + provenance 검토 → semver 지정 → `approve` (승격 시 재검사 재실행) |
| `quarantine` | blocked | findings 해결 전까지 승인 불가 (재import 또는 audit된 명시적 override) |
| `reject` | not queued | audit 기록과 함께 staging에서 폐기 |

- `approve`는 승격 시점에 **`runRecheck`를 재실행**하고(오래된 판정 없음), semver bump를 지정한 다음,
  `assignVersion` → md-in-git에 write ([./persistence_ko.md](./persistence_ko.md)) → 재빌드
  ([./build-and-publish-service_ko.md](./build-and-publish-service_ko.md))를 트리거한다.
- content repo로의 PR diff가 중복된 두 번째 큐레이터 게이트이다
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

## 철회(Retraction) / liveness

upstream이 source 항목을 재검증하거나 **철회(retract)**할 때, CAW-04는 이를 학습하고 게이트를 재실행해야 한다
(unpublish/redact의 대응물). 메커니즘은 TODO(open-question): provenance ref가 liveness/revocation 검사를 담는가
([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

## 실패 모드

| Code | Stage | 동작 |
|---|---|---|
| `SOURCE_UNAVAILABLE` | discover/fetch | source 건너뜀; preflight/health가 노출; 부분 publish 없음 |
| `SCHEMA_NONCONFORMANT` | fetch/re-check #7 | reject; audit됨 |
| `RECHECK_BLOCKED` | re-check | quarantine; finding 로그; 결코 자동 승격 안 됨 |
| `BOUNDARY_NOT_PUBLIC` | re-check #2/3 | fail-closed quarantine |
| `DUPLICATE_PRECEDENCE` | fan-in | 큐레이터용 보류; TODO(open-question) |

## 미해결 질문(Open Questions)

- TODO(open-question: pull vs push import; [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).
- TODO(open-question: fan-in dedup/precedence + provenance 병합; [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).
- TODO(open-question: 정확한 재검사 규칙 집합 + `profiles.recheck`에서 임계값이 어디에 있는지; 공유 substrate 없이 CAW-02와의 정렬; [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)/[ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).
- TODO(open-question: semver bump — 큐레이터 전용 vs diff-assisted 제안; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- TODO(open-question: upstream 철회/liveness 감지; [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북(runbook)에 대한 함의

- 런북은 `ContentSourceAdapter` 인터페이스 + config 기반 registry 블록을 정의하며, `Caw02KnowledgeSourceAdapter` + `Caw03SkillsRegistrySourceAdapter`는 concrete로, wiki/bundle stub은 config 비활성화로 둔다.
- 런북은 코어에 `profiles.recheck`를 둔 **우회 불가능한 단계로서의 core 재검사**와 **부정 테스트 중심 스위트**(confidential 패턴을 담은 upstream-public 항목은 반드시 quarantine + finding 로그)를 구현한다.
- 런북은 findings + provenance를 보여주는 큐레이터 큐 surface(내부 전용)를 구축하며, `approve`는 어떤 write 전에든 재검사를 재실행하고 semver를 지정한다.
- 런북은 결코 서빙되거나 빌드되지 않는, `(product,id,origin_version)`을 키로 하는 멱등 staging을 구현한다.

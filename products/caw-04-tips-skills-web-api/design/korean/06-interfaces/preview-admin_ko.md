# Preview / Admin — 내부 큐레이터 publish-gate 표면 (공개 쓰기 없음)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./website_ko.md](./website_ko.md) (이 표면이 콘텐츠를 승격시키는 대상인 공개 사이트)
  - [./rest-api_ko.md](./rest-api_ko.md) (승인 시 함께 게시되는 공개 API)
  - [../01-decisions/ADR-0001-product-surface-and-delivery_ko.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md) (세 가지 표면 중 이것이 표면 #3)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (이 표면이 구동하는 gate)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md) (ContentSource port; core 재검사)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (승인 시 git에 쓰기; tombstone)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md) (public projection 대 audit sidecar)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

**내부 preview/admin** 표면을 설명한다. 즉, 가져온 후보(candidate) 아티팩트를 gate 결과(findings)에 비추어 검토하고,
필요하면 편집(redaction)하며, **승인(approve)** 하는 큐레이터 전용(Jimmy) 작업 공간이다. 이것은 gate를 통과한 후보를
공개 웹사이트([website_ko.md](./website_ko.md))와 API([rest-api_ko.md](./rest-api_ko.md))로 승격시키는 *유일한* 경로다.
[ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)의 표면 #3과
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)의 사람(human) 단계를 구체화한다.
gate 정책([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md))이나 import 메커니즘
([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md))을 다시 결정하지는 않는다.

## 이 표면의 엄격한 경계

- **내부 전용.** 절대 공개되지 않으며, 공개 CDN/호스트에 올라가지 않는다. TODO(open-question: 호스팅 + 인증 메커니즘 —
  예: 로컬 전용 도구 대 내부 인증 앱; 임의로 만들지 말 것).
- **공개 쓰기 경로 없음.** 이 표면은 CAW-04의 git 저장소에 쓰고 재빌드를 트리거한다. 공개 표면은 읽기 전용 정적
  아티팩트로 유지된다. 공개 인터넷에서 도달 가능한 런타임 쓰기 엔드포인트는 없다.
- **더 많이 보되, 더 적게 게시한다.** 큐레이터의 결정을 위해 **audit 전용** 필드(`origin_ref`/`origin_version` sidecar,
  전체 provenance, 원시 gate findings)를 표시할 수 있다. 그러나 그 필드들은 **public projection**
  ([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md))에 의해 제거되며 웹사이트/API에 **절대** 도달하지 않는다.
  preview 렌더와 공개 렌더는 동일한 후보에 대한 의도적으로 서로 다른 projection이다.
- **승인은 필수이며 아티팩트 단위다.** 자동 생성/import는 *제안(proposal)* 생성일 뿐이며, 명시적 사람 승인 없이는 어떤 것도
  라이브로 가지 않는다(brief §11, [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)).
  deny-by-default: 승인의 부재 = 미게시.

## 파이프라인에서의 위치

```
ContentSource adapters (CAW-02, CAW-03, …)        [ADR-0004]
        │  import candidate
        ▼
CORE public-safe RE-CHECK  (NOT in adapters; deny-by-default; upstream claims = evidence only)  [ADR-0004/0003]
        │  candidate + gate findings (pass / fail / needs-redaction)
        ▼
┌──────────────  PREVIEW / ADMIN  (this surface, internal)  ──────────────┐
│  review · diff · redact · decide                                         │
│         approve ─┐            reject / hold ──► stays in queue (not live)│
└──────────────────┼──────────────────────────────────────────────────── ┘
                   ▼
   write to git (ADR-0005): src/content/{type}/<slug>/<semver>.md(x) + sidecar
                   ▼
   SiteAndApiSinkAdapter → astro build (boundary===public assert) → CDN   [ADR-0006/0007]
```

재검사(re-check)는 이 표면의 상류(upstream)에 있는 **core 단계**다. 큐레이터는 그 *findings*를 검토할 뿐,
상류의 boundary 주장에 대해 신뢰(trust)를 다시 실행하지 않는다(그것들은 증거(evidence)일 뿐이다,
[ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).

## 검토 큐(Review queue)

| Column | 의미 |
|---|---|
| candidate | `{type}/{slug}` 제안 버전 (semver 할당/확정 예정) |
| source | `source_product` + `source_ref` (provenance 참조) |
| gate result | core 재검사로부터의 `pass` / `fail` / `needs-redaction` |
| diff | 현재 게시된 latest 대비 (신규 아티팩트 / 신규 버전 / boundary 변경) |
| status | `pending` / `held` / `approved` / `rejected` / `redacted` |

상태는 deny-by-default다: `approved` 상태의 아티팩트만이 git에 쓰이고 게시된다.

## 후보 상세 보기(Candidate detail view)

하나의 후보에 대해 큐레이터는 다음을 나란히 본다:

1. **Public preview** — 웹사이트/API가 내보낼 바로 그것(public projection; 실제 빌드와 동일한
   `boundary===public` assertion과 no-sidecar 테스트를 실행하므로, preview는 공개 표면이 보여줄 것보다 더 많이
   보여줄 수 없다). 이것은 "독자/에이전트가 받는 것" 창(pane)이다.
2. **Audit pane (내부 전용)** — sidecar `origin_ref`/`origin_version`을 포함한 전체 provenance, 원시 gate findings,
   그리고 재검사가 편집(redact)하기를 원하는 플래그된 구간(span). 공개 projection으로 절대 직렬화되지 않는다.
3. **Diff pane** — 현재 게시된 latest와 대비: 변경된 필드, 본문 diff, 그리고 이것이 신규 아티팩트인지, 신규 버전인지,
   혹은 **boundary 변경**(편집이 아니라 deprecate/unpublish/redact로 라우팅됨)인지 여부.

## 큐레이터 액션(Curator actions)

| Action | 효과 | 하류(Downstream) |
|---|---|---|
| **Approve & publish** | `semver` 할당/확정; `<slug>/<semver>.md(x)` + sidecar를 git에 쓰기 | 재빌드 트리거 → 웹사이트 + API에서 라이브 |
| **Redact then approve** | public projection에 redaction 적용; 재검사 재실행; 그 후 승인 | 위와 동일; 원시 데이터는 내부 전용으로 유지 |
| **Hold** | 메모와 함께 큐에 유지; 미게시 | git 쓰기 없음 |
| **Reject** | 사유와 함께 reject 표시 | git 쓰기 없음; deny-by-default 유지 |
| **Unpublish / redact (live item)** | **tombstone** 쓰기 ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)) | 재빌드 → 웹사이트 + API에서 410 Gone; index/sitemap/search에서 제외 |

모든 액션은 **append-only로 audit**된다: 누가(큐레이터), 무엇을(후보 + 버전 + digest), 언제(timestamp), 왜(사유 /
gate findings 스냅샷). 게시된 `(slug, semver)`는 영원히 동결되며, 수정은 **새 버전**이지 제자리(in-place) 편집이 아니다
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).

## Gate 강제는 계층적이다 (이 표면은 넷 중 하나)

큐레이터 승인은 **사람(human)** gate다. 이것이 기계(machine) gate를 대체하지 않는다. 사람이 실수하더라도 public-safe
속성은 유지된다:

| Layer | 강제 위치 | ADR |
|---|---|---|
| Import 재검사 (core, deny-by-default) | preview 이전 core 단계 | [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| **큐레이터 승인 (이 표면)** | preview/admin | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| 빌드 시점 `boundary===public` assertion | astro build | [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md) |
| 방출(emit) 시점 validator + no-sidecar 테스트 | 모든 API/페이지 방출 | [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) / [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) |

승인된 후보가 어떻게든 비공개 boundary를 지니거나 sidecar 필드를 누출하면, 빌드/방출 계층이 **fail closed**된다 —
공개 표면은 구조적으로(by construction) public-safe하게 유지된다.

## 재빌드 / 배포 트리거

승인/unpublish/redact는 `SiteAndApiSinkAdapter`가 소비하는 **publish event**를 방출하여 정적 아티팩트를 재빌드 +
재배포한다. TODO(open-question: 트리거 메커니즘 — webhook 대 CI-on-git-push 대 scheduled;
[ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)과 공유). TODO(open-question: unpublish/redact 시 CDN purge의
time-to-purge 한계 — [website_ko.md](./website_ko.md)/[rest-api_ko.md](./rest-api_ko.md)과 공유).

## 미해결 질문(Open Questions)

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조:
- TODO(open-question: preview/admin 호스팅 + 인증 모델 — 내부 전용; 임의로 만들지 말 것).
- TODO(open-question: 승인/업데이트/unpublish 시 재빌드+배포 트리거 메커니즘).
- TODO(open-question: 큐레이터 액션에 대한 audit log 저장 + 보존).
- TODO(open-question: Jimmy 외에 누가 큐레이터로 행동할 수 있는지; 단일 대 다중 승인자 워크플로).
- TODO(open-question: redaction UX — span 단위 편집 대 전체 필드; 편집 후 재검사가 어떻게 재실행되는지).

## 런북(runbook)에 대한 함의

- 후보 큐 위에 내부 전용 검토 앱/도구를 구축한다; 공개 호스트에 절대 배포하지 않는다.
- 후보마다 두 projection을 렌더한다: public preview(실제 빌드와 동일한 assertion) + 내부 audit pane.
- approve → semver 할당 → `<slug>/<semver>.md(x)` + sidecar 쓰기 → publish event 방출을 구현한다.
- unpublish/redact → tombstone 쓰기 → 재빌드 → 두 공개 표면 모두에서 410을 구현한다.
- 모든 큐레이터 액션의 append-only audit log(누가/무엇을/언제/왜); 승인되지 않은 모든 것에 대해 deny-by-default.

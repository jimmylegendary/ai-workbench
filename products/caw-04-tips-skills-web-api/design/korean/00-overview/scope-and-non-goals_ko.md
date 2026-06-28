# Scope & Non-Goals — CAW-04

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](./vision_ko.md)
  - [personas-and-use-cases.md](./personas-and-use-cases_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 **CAW-04 v1의 경계**를 긋는다: 무엇이 scope에 들어가는지, 무엇이 명시적으로 non-goal인지, 그리고
import/export seam(이음매)이 어디에 위치하는지를 정한다. 이는 제품이 publish 대상인 내부 제품들로 번지지 않게 막는
계약이다. 이 문서는 각 부분이 *어떻게* 빌드되는지는 명세하지 **않는다** — 그것은 링크된 ADR과 runbook의 몫이다.

## In scope (v1)

| # | In scope | Why it belongs here | Anchor |
|---|---|---|---|
| S1 | published artifacts의 **public website**(browse/read HTML). | Brief §4 primary surface. | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md), [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md) |
| S2 | 단일 source로부터 web/API parity를 갖는 **read-only public REST API**(JSON + raw markdown). | Brief §4; agent는 reader가 보는 동일 콘텐츠를 fetch한다. | [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) |
| S3 | curator publish gate를 위한 **internal preview/admin** surface. | Brief §4 secondary; G8 승인이 일어나는 곳. | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| S4 | `ContentSourceAdapter`를 통한 이미 검증된 콘텐츠의 **import**(v1: CAW-02, CAW-03/skills registry). | Brief §7; CAW-04는 import하며 결코 author하지 않는다. | [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| S5 | **core public-safe re-check + deny-by-default publish gate**(boundary 재도출; fail-closed). | Brief §5/§11 load-bearing. | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| S6 | source of truth로서의 CAW-04 **자체 md/MDX + frontmatter git content store**, audit 전용 필드를 위한 sidecar 포함. | Brief §6; independence. | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md), [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) |
| S7 | **Semver versioning + content-digest immutability**; published `(slug, semver)`는 영원히 동결됨. | Brief §5. | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) |
| S8 | HTTP 410 tombstone를 통한 **Unpublish / redact**(serving에서 철회; version은 불변으로 유지). | Brief §3 uc4. | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| S9 | 각 publish를 검증된 source + 승인으로 추적하는 **append-only, hash-chained audit ledger**. | Brief §3 uc5. | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| S10 | **SKILL.md + manifest.json** distribution format, **MCP resources view**, 그리고 **index.json** manifest. | Brief §4 delivery; agent consumption. | [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) |
| S11 | 미래의 source/sink를 위한 **documented stub가 있는 ports & adapters**(config 기반 registry). | Brief §8 design the seams. | [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |

## Non-goals (v1)

| # | Non-goal | Why excluded | Where it actually lives |
|---|---|---|---|
| N1 | **콘텐츠를 처음부터 저작(authoring)하는 것.** | CAW-04는 검증된 upstream 콘텐츠를 publish하며, 원본 노하우를 저작하지 않는다. | CAW-02 / CAW-03 (separate products). |
| N2 | **검증되지 않았거나 `public` 이상인 것을 publish하는 것.** | Brief §10/§11 — 단 하나의 hard guardrail. `internal`/`confidential`은 publishable-never. | 내부에 머문다; 새로운 public-safe import로서만 재진입. |
| N3 | **CAW-04 내부에서의 reclassify / downgrade**(confidential→public). | public surface가 confidential을 public으로 만드는 곳이 결코 되어서는 안 된다. | upstream에서만 발생; re-import됨. |
| N4 | **사용자 계정 또는 public write API.** | read-only public surface; curator만 publish. | curator 승인이 유일한 write path(내부). |
| N5 | **knowledge repo가 되는 것.** | 그것은 별개 제품인 CAW-02다. | CAW-02. |
| N6 | **skills harness / registry가 되는 것.** | 그것은 별개 제품인 CAW-03다. | CAW-03 / a skills registry. |
| N7 | **Auto-approval / auto-publish.** | gate는 auto-reject만 가능; Jimmy가 모든 publish를 승인한다. | Curator gate G8. |
| N8 | **Shared runtime substrate**(형제와 공유하는 store/registry/library). | Brief §1 independence contract. | 명시적 import boundary를 넘는 adapter. |
| N9 | **검증된 upstream entry가 존재하기 전에 live로 가는 것.** | 지금 설계하고, 나중에 publish. | 실제 검증된 entry가 존재할 때 슬라이스가 출시됨. |
| N10 | **Runtime search + Accept-header content negotiation.** | static, frozen-artifact 속성을 지키기 위해 연기됨. | Deferred([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)); post-v1에 재검토. |
| N11 | **audit 전용 provenance를 web/API로 serialize하는 것.** | `origin_ref`/`origin_version`은 audit 전용; public-projection split이 test로 강제됨. | Sidecar only([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)). |

## Import / export boundaries

CAW-04는 명시적이고 타입이 부여된 boundary를 통해서**만** 제품군의 나머지와 접촉한다 — id/URI/version으로 참조하며,
공유 store가 결코 아니다. 인바운드 콘텐츠는 **verdict(판정)이 아니라 claim(주장)이다**; core가 이를 re-check한다.

```
IMPORT (ContentSourceAdapter, read-only)            EXPORT (PublishSinkAdapter)
  CAW-02 knowledge  ─────────┐                       ┌─────▶ public WEBSITE (HTML)         [v1]
  CAW-03 / skills registry ──┼──▶ CAW-04 core ──────▶┼─────▶ read-only REST API (JSON+md)  [v1]
  internal wiki        (stub)│   re-check + gate     ├─────▶ MCP resources view            [v1]
  curated bundle       (stub)┘   + version + audit   ├─────▶ external docs host       (stub)
                                                     ├─────▶ package registry         (stub)
                                                     └─────▶ syndication              (stub)
```

| Direction | v1 concrete | v1 documented stubs (config-disabled) |
|---|---|---|
| **Import** (`ContentSourceAdapter`) | `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter` | `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter` |
| **Export** (`PublishSinkAdapter`) | `SiteAndApiSinkAdapter` (+ MCP view as a sink) | `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter` |

Boundary rules (from [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)):

- **Pull, not push (v1).** CAW-04가 `discover()`/`fetch()`를 polling한다; upstream은 CAW-04에 write하지 않는다.
  (TODO(open-question: push notification on upstream change).)
- **adapter가 아니라 core에서의 re-check.** source adapter는 "re-check가 존재한다는 것을 결코 알지 못한다"; public-safe
  강제를 self-disable할 수 없다(`requiresPublicSafe: true`).
- **stub은 `NotImplemented` body + `maturity="stub"`을 가진 실제 interface다**; preflight는 `active`로
  표시된 `stub`의 실행을 거부한다. 실제 source/sink 추가 = adapter 파일 하나 + config 블록 하나, core 수정 없음.
- **Export가 유일한 외향(outward) 흐름**이며 외부 세계에 대해 read-only다; 유일한 인바운드 write는 curator 승인이다.

## What "done" excludes (slice discipline)

첫 슬라이스(see [vision.md](./vision_ko.md))는 의도적으로 **하나의** artifact를 end-to-end로 출시하며 N10과 모든
stub adapter를 미구현 상태로 둔다. 넓은 카탈로그 성장, multi-source fan-in dedup, search는 **post-slice**이며
슬라이스의 done-criterion을 막지 않는다.

## Open Questions

- TODO(open-question: whether CAW-02 ships the full provenance ancestor graph or only the leaf — affects fail-closed
  scope; see [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md).)
- TODO(open-question: dedup/precedence + provenance merge for multi-source fan-in; see
  [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md).)
- TODO(open-question: revocation/unpublish cadence when upstream reclassifies a source to confidential.)
- Consolidated in `../08-research-plan/open-questions.md` (TODO: create).

## Implications for runbooks

- 각 stub adapter는 interface + `NotImplemented` body + descriptor + config 예시(config-disabled)를 생성하는
  runbook을 가지며, `active` stub을 거부하는 preflight test를 동반한다.
- 한 runbook은 public-projection serialization test(N11)를 acceptance gate로 추가한다.
- 어떤 runbook도 curator gate 외에 public surface로의 write path를 도입해서는 안 된다(N4/N7 강제).

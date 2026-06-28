# Vision — CAW-04 AI Tips / Skills Website & REST API

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [scope-and-non-goals.md](./scope-and-non-goals_ko.md)
  - [personas-and-use-cases.md](./personas-and-use-cases_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04의 **북극성(north star)** 을 기술한다: *검증된* AI 활용 사례(practice)를 위한 공개 read/API publishing 계층이다.
이 문서는 가치 단위(unit of value), 제품 전체가 그 주위로 조직되는 단 하나의 속성(**public-safe by
construction**, 구조적으로 공개 안전), 그리고 첫 번째 수직 슬라이스(vertical slice)를 정의한다. 이 문서는 content model을 결정하지
**않으며**(see [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) 참조), gate 동작 방식(see
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) 참조)이나 stack
(see [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)/[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) 참조)도 결정하지 않는다.

## North star

> 검증된 AI 활용 사례 — tips, skills, workflows, 그리고 재사용 가능한 운영 패턴 — 는 **사람이 공개적으로
> 읽을 수 있고 agent가 fetch할 수 있어야** 하며, 출처(provenance)와 safety boundary(안전 경계)가 부착되어 있어야 하되, **검증되지 않았거나
> 회사 기밀(company-confidential)인 노하우를 결코 유출하지 않아야** 한다.

CAW-04는 `ai-workbench` 제품군(독립적인 여섯 개 제품)의 **최종 publishing/read 계층**이다. 이 제품은 콘텐츠를
저작(author)하지 않으며 지식을 소유하지 않는다. 형제 제품들이 이미 검증한 콘텐츠를 **import**한다(CAW-02 knowledge;
CAW-03 / a skills registry — 각각 *별개의 제품*이며 *공유 runtime substrate가 없음*), 자체적인
public-safe re-check를 실행하고, 웹사이트와 read-only REST API를 **publish**한다. 오늘날 갇혀 있는 내부 노하우는
안전하게 공유 가능해진다; 기밀 자료를 유출하거나 검증되지 않은 snippet을 내보내는 임시적 공유는 gate가 적용되고 audit되며 versioning된
파이프라인으로 대체된다.

이 포지션은 의도적으로 좁고 핵심을 떠받친다(load-bearing): **publishing에는 고유한 관심사들이 있다** — public-safe gating,
versioning, web/API 전달(delivery), audit — 이들은 내부 제품 안에 살아서는 안 된다. CAW-04는 바로 그
관심사들을 하나의 제품 core 뒤로 격리한다.

## Unit of value

CAW-04가 생산하는 원자적 단위는 **하나의 published, versioned, public-safe artifact**이다.

| Property | Meaning |
|---|---|
| **Published** | 단일 정규(canonical) source로부터 공개 웹사이트와 read-only REST API 양쪽에서 도달 가능함([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) web/API parity). |
| **Versioned** | `(slug, semver)`로 주소 지정 가능; published version은 **영원히 동결(frozen)**됨(content-digest가 불변성을 증명; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). |
| **Public-safe** | `boundary == public`을 지님. provenance ancestors에 대해 로컬에서 재도출(re-derive)됨 — 신뢰된 upstream flag가 결코 아님([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) G2). |
| **Provenanced** | 검증된 내부 source + safety review로 추적됨; audit 전용 필드는 web/API로 결코 serialize되지 않는 sidecar에 남음([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)). |
| **Curator-approved** | Jimmy가 이 version을 명시적으로 승인했기 때문에만 존재함; gate는 auto-reject할 수 있으나 결코 auto-approve할 수 없음. |

하나의 artifact는 `Tip`, `Skill`, `Workflow`, 또는 `Playbook`(publishable한 네 entity)이다. 성공은 페이지 뷰로
측정되지 **않는다**; *gate를 통과했고 추적 가능하며 철회(withdrawable) 가능한 상태로 남아 있는 artifact의 수*로 측정된다. gate를
약화시키는 더 큰 카탈로그는 진전이 아니라 퇴행(regression)이다.

## The organizing property: public-safe by construction

CAW-04의 모든 것은 `internal`, `confidential`, 또는 `private`에서 파생된 항목이 공개 surface에 도달**할 수 없도록**
형성되어 있다 — 정책적 상기가 아니라 구조로써. 서로 강화하는 네 개의 계층:

1. **Deny-by-default core gate.** publish 결정 함수는 기본값이 REJECT다; 첫 번째 hard failure에서 reject된다;
   불확정적인 것은 모두 제외된다([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)).
2. **adapter가 아니라 core에서의 re-check.** 모든 import는 provenance로부터 boundary를 재도출하는 단 하나의
   core-resident public-safe re-check를 거친다(fail-closed: 해결 불가능한 ancestor는 `confidential`/`private`로 해결됨).
   어떤 adapter도 이를 self-bypass할 수 없다; **raw import path가 존재하지 않는다**([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)).
3. **sink에서의 frozen static artifact.** site/API는 내부 store로의 **live path 없이** static output으로 빌드된다;
   public bundle은 검증되고 동결된 artifact다([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)).
4. **Build-time `boundary == public` assertion + public-projection split.** audit 전용 provenance 필드는
   sidecar에 살며 web/API로 결코 serialize되지 않도록 test로 강제된다([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md));
   빌드는 non-public artifact 방출을 거부한다.

```
upstream (CAW-02 / CAW-03)        CAW-04 core (independent)              public surfaces
  validated content   ──import──▶  re-check ─▶ curator gate ─▶ version  ──build──▶  WEBSITE (HTML)
  (boundary = CLAIM)   (port)      (deny-by-default, fail-closed)        (frozen)    REST API (JSON + md)
                                          │                                           MCP resources view
                                          └─ append-only, hash-chained audit ledger
```

방어는 의도적으로 계층화되어 있다: 단일 upstream 오분류는 re-check가 잡는다; re-check의 누락(gap)은
build-time assertion이 잡는다; serialization 누락(slip)은 projection test가 잡는다. **단일 failure로는 leak이
나가지 않는다.**

## First vertical slice

brief는 넓은 scaffolding보다 작은 수직 슬라이스를 우선하도록, 그리고 콘텐츠는 **upstream에 검증된 entry가 존재할
때에만** live로 가도록 명령한다. 첫 슬라이스는 넓은 카탈로그가 아니라 *하나의 artifact에서 전체 척추(spine)를 end-to-end로* 증명한다:

| Step | What the slice does | Anchored in |
|---|---|---|
| 1 | CAW-03 / CAW-02 source adapter에서 `discover()`/`fetch()`를 통해 **하나의** 검증된 `Skill`(또는 `Tip`)을 import한다. | [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| 2 | **core public-safe re-check**를 실행한다; findings report와 함께 `CandidateItem`을 방출한다 — published item은 결코 아니다. | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| 3 | curator가 **internal preview/admin** surface에서 검토하고 `(slug, semver)`를 승인한다. | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md) |
| 4 | frozen md/MDX + frontmatter를 CAW-04의 **자체 git store**에 기록한다(audit 필드는 sidecar로). | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) |
| 5 | static build가 단일 source로부터 artifact를 **website + REST JSON + raw markdown + MCP view**로 방출한다. | [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md), [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) |
| 6 | reader가 HTML 페이지를 탐색하고; agent가 API를 통해 동일한 artifact를 fetch한다 — **web/API parity** 검증됨. | [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) |

첫 슬라이스에서 명시적으로 *제외*되는 것들(문서화된 stub / 연기 항목으로 유지): runtime search, Accept-header
negotiation, multi-source fan-in dedup, 그리고 모든 미래의 source/sink adapter. 슬라이스의 done-criterion은
다음과 같다: **하나의 실제 검증된 artifact가 published, audited되고 withdrawable하며, public 출력에 public 이상의 필드가
도달할 수 없음을 증명하는 test가 존재함.**

## Why CAW-04 is separate (independence contract)

CAW-04는 자체 core, 자체 content store([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)), 그리고
자체 surface를 가진다. 형제 제품은 **import boundary**를 넘어 id/URI/version으로만 참조한다 — 공유 store,
registry, 또는 library가 결코 아니다. boundary semantics의 *자체 사본*을 유지한다(CAW-02와 교리상 정렬되어 있으나 공유
dependency는 아님). 이것이 public surface가 그 자체로 leak에 강한 단위로서 진화하고 추론될 수 있게 한다.

## Open Questions

- TODO(open-question: timing of go-live — gated on the existence of validated upstream entries; see brief §10.)
- TODO(open-question: success metric definition beyond "count of audited, withdrawable artifacts".)
- See [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) and
  [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) open questions (redaction engine, provenance bundle
  completeness, pull-vs-push import, revocation/unpublish cadence).
- Consolidated in `../08-research-plan/open-questions.md` (TODO: create).

## Implications for runbooks

- 첫 슬라이스 척추(import → re-check → gate → version → publish)가 runbook 순서의 중추(backbone)이다.
- `pub.safe` re-check 라이브러리는 **negative-heavy, mutation-tested** suite로 빌드된다: 기본 분기를
  `PUBLISH_OK`로 약화시키면 suite가 반드시 깨져야 한다(per [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) follow-on).
- build-time test는 어떤 sidecar/audit 필드도 web/API 출력으로 serialize되지 않음을 assert해야 한다(public-projection split).

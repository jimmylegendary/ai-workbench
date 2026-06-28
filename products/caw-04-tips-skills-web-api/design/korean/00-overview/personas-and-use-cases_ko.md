# Personas & Use Cases — CAW-04

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](./vision_ko.md)
  - [scope-and-non-goals.md](./scope-and-non-goals_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04의 **personas**와 그들이 end-to-end로 이끄는 **use cases**를 명명한다. 제품이 *누구를* 위해
봉사하며 *어떤 흐름*을 지원해야 하는지를 틀 짓는다; mechanics(작동 방식)는 명세하지 않는다(그것은 링크된 ADR에 있다). 모든
use case는 단 하나의 guardrail에 의해 제약된다: **public-safe source로부터만 나오는 public 출력.**

## Personas

| Persona | Surface(s) | Goal | Trust level | Can write? |
|---|---|---|---|---|
| **External reader** | Public WEBSITE (HTML) | 검증된 tips/skills/workflows/playbooks를 탐색하고 읽는다. | Untrusted public. | No (read-only). |
| **AI / API consumer** | Read-only REST API, raw markdown, `SKILL.md` + `manifest.json`, MCP resources view | agent에서 재사용하기 위해 skill/workflow를 프로그래밍 방식으로 fetch한다. | Untrusted public. | No (read-only). |
| **Internal curator (Jimmy)** | Internal PREVIEW/ADMIN | candidate를 검토하고, publish를 approve/reject하고, unpublish/redact하고, audit한다. | Trusted, authenticated. | Yes — **유일한** write path(승인). |

Notes:

- External reader와 AI/API consumer는 단일 source로부터 **동일한 정규(canonical) artifact**를 본다(web/API parity,
  [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)); 표현(representation)에서만 다르다(HTML vs JSON/markdown).
- curator는 gate가 요구하는 human in the loop이다: gate는 auto-**reject**할 수 있으나 결코 auto-**approve**할 수 없다
  ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)).
- **persona가 아닌 것:** content authors. CAW-04는 검증된 콘텐츠를 import한다; 저작은 CAW-02 / CAW-03
  (separate products)에 있다. See [scope-and-non-goals.md](./scope-and-non-goals_ko.md) N1.

## Use cases

### UC1 — Import → public-safe gate → publish (the spine)

가치 단위를 생산하는 core 흐름. brief §3 uc1에 매핑됨.

```
curator triggers import
  └▶ ContentSourceAdapter.discover()/fetch()         [ADR-0004]  (boundary = upstream CLAIM)
       └▶ CORE public-safe re-check (deny-by-default) [ADR-0003/0004]
            • provenance present?  • boundary_eff == public (re-derived)?
            • visibility not private-derived?  • redaction/leak scan clean?
            • claim/source separation?  • schema conforms?
            └▶ emit CandidateItem + findings report (NEVER a published item)
                 └▶ curator reviews in PREVIEW/ADMIN  [ADR-0001]
                      └▶ approve (G8) → version (semver + digest) [ADR-0005]
                           └▶ write to CAW-04 git store (audit→sidecar) [ADR-0002/0005]
                                └▶ static build → SiteAndApiSinkAdapter [ADR-0006/0007]
                                     └▶ append-only audit ledger entry  [ADR-0003]
```

- **Actors:** internal curator(주도), AI source adapter(fetch).
- **Precondition:** *검증된* upstream entry가 존재함(brief §10 — 그 전에는 go-live 없음).
- **Fail-closed:** 불확정적/해결 불가능한 check ⇒ REJECT; 비어 있는 post-gate 결과는 degraded publish가 아니라
  no-op다. leak marker ⇒ **reject + escalate**, auto-strip이 아님.
- **Done:** `(slug, semver)` 동결, web + API에서 live, ledger에서 추적 가능.

### UC2 — Web browse + API fetch (parity)

reader와 agent가 동일한 artifact를 consume한다. brief §3 uc2에 매핑됨.

| Actor | Action | Representation | Anchor |
|---|---|---|---|
| External reader | 사이트를 탐색하고, artifact 페이지를 연다. | HTML | [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md) |
| AI / API consumer | artifact + `index.json` manifest를 `GET`한다. | JSON + raw markdown | [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) |
| AI / API consumer | `SKILL.md` + `manifest.json`을 fetch하거나, MCP resources view를 통한다. | distribution format / MCP | [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) |

- **Invariant:** HTML/markdown/JSON 전반에 걸쳐 artifact당 하나의 정규 resource; 어떤 표현도 audit
  전용/sidecar 필드를 노출하지 않는다(public-projection split, test로 강제).
- **Deferred:** runtime search 및 Accept-header negotiation(see [scope-and-non-goals.md](./scope-and-non-goals_ko.md) N10).

### UC3 — Publish a new version

published artifact가 업데이트된다. brief §3 uc3에 매핑됨.

- edit은 frozen version을 결코 mutate하지 않는다. 변경 ⇒ **새로운** `(slug, semver)`; 이전 version은 주소 지정
  가능하고 불변으로 유지됨([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)).
- 새 version은 전체 UC1 척추(re-check + curator 승인)를 다시 실행한다 — versioning이 gate를 우회하지 않는다.
- **Done:** old와 new version 모두 주소 지정 가능; consumer는 semver를 pin할 수 있다.

### UC4 — Unpublish / redact (boundary change)

artifact의 safety boundary가 변하거나, 철회되어야 한다. brief §3 uc4에 매핑됨.

- curator에 의해 트리거됨(예: upstream이 source를 `confidential`로 reclassify).
- published **version은 불변으로 유지**되나, HTTP **410 tombstone**을 통해 **serving에서 철회**됨
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)); unpublish/redact는 delete가 아니라 **event**다
  ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)).
- Redaction은 **detection + rejection이며, 결코 transformation/laundering이 아니다** — CAW-04 내부에 downgrade path 없음.
- **Open:** withdraw 이후 cache/CDN purge bound(TODO(open-question), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)).
- **Done:** resource가 410을 반환; ledger가 withdraw event를 기록.

### UC5 — Audit a published artifact

public한 것이 왜 publishable한지 그리고 누가 승인했는지를 증명한다. brief §3 uc5에 매핑됨.

- 모든 artifact는 **append-only, hash-chained** ledger를 통해 검증된 내부 `source_ref`(+ `producer_run_id`)와
  safety review로 추적된다([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)).
- 보장: **traceability**(live handle 없이 upstream으로 거슬러 올라감), **tamper-evidence**(`verify_audit()` →
  `broken_at`), **reconstructable decisions**(per-check gate result + approver를 replay 가능).
- **Actor:** curator(그리고, spot check를 위해, 두 번째 witness로서 ledger + git history를 읽는 auditor).

### UC6 — Onboard a new source or sink (seam extension)

core 수정 없이 카탈로그의 도달 범위를 확장한다. brief §8 / [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)에 매핑됨.

- 개발자가 하나의 adapter(예: `CuratedBundleSourceAdapter` 또는 `PackageRegistrySinkAdapter`) + 하나의
  config 블록을 구현한다; preflight가 wiring을 검증하고 **`active` stub을 거부한다**.
- re-check, human gate, boundary policy는 core에 머문다 — adapter는 이들을 결코 override할 수 없다
  (`requiresPublicSafe: true`).
- **Done:** 새 통합은 adapter 파일 하나 + config 블록 하나에만 영향을 준다(the seam regression test).

## Use-case → ADR traceability

| UC | Primary ADRs |
|---|---|
| UC1 | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) |
| UC2 | [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md), [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md), [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) |
| UC3 | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| UC4 | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| UC5 | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) |
| UC6 | [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |

## Open Questions

- TODO(open-question: does the curator need a diff/preview of the *rendered public view* vs. raw candidate in the
  admin surface for faster G8 review?)
- TODO(open-question: authn for the internal preview/admin surface — out of scope for content but needed for the
  curator persona.)
- TODO(open-question: how the AI/API consumer pins/discovers versions — `index.json` shape; see
  [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md).)
- Consolidated in `../08-research-plan/open-questions.md` (TODO: create).

## Implications for runbooks

- UC1이 runbook 척추다; UC3/UC4가 이를 재사용한다(version + withdraw path).
- 한 runbook은 G8을 위해 re-check findings report를 노출하는 curator preview/admin 검토 흐름을 빌드한다.
- 한 runbook은 410 tombstone path를 구현하고 이를 ledger withdraw event(UC4)에 연결한다.
- UC6 seam regression test(새 통합 = adapter 하나 + config 블록 하나)는 acceptance criterion이다.

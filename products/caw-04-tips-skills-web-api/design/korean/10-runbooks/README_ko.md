# Runbooks — CAW-04 (Tips / Skills 웹사이트 & REST API)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./runbook-conventions_ko.md](./runbook-conventions_ko.md)
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md)
  - [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 인덱스는 **AI builder**에게 CAW-04 runbook을 어떻게 실행하는지 알려준다: runbook이 무엇인지,
실행 순서, phase 사이의 gate, 그리고 **Milestone M1**을 전달하는 체인. 이 문서는 설계 결정을 내리지
않는다 — 그것은 [`../01-decisions/`](../01-decisions/)(ADR)와 roadmap 문서에 있다.
여기 내용이 [PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF_ko.md)와 충돌하면 brief가 우선한다.

## What these runbooks are

- 각 runbook(`RB-XXX-*.md`)은 AI builder가 처음부터 끝까지 실행하는 **하나의 응집된, 재개 가능한
  build 단위**이다. 실제 코드는 builder가 작성한다. runbook의 코드는 **build 가이드일 뿐**이다
  (skeleton, 시그니처, config).
- 엄격한 형식과 CAW-04 고유의 builder 규칙은
  [runbook-conventions_ko.md](./runbook-conventions_ko.md)에 한 번만 정의되어 있다 — **runbook을
  실행하기 전에** 반드시 읽어라.
- Runbook은 **CAW-04: 독립적인 public publishing 제품**을 만든다 — 세 가지 surface(public
  website, public read-only REST API, internal preview/admin)가 **하나의 hexagonal core** 위에
  올라가며, 각 surface는 하나의 `PublishSinkAdapter`이다. CAW-04는 CAW-02와
  CAW-03/skills-registry(별도 제품)로부터 검증된 콘텐츠를 명시적 boundary를 넘어 **import**한다.
  이들과 runtime substrate를 절대 공유하지 않는다.

## How to execute (phase order, Depends-on, gates)

1. **Phase는 순서대로 실행**한다(`phase-0` → `phase-4`). 각 phase 폴더는 runbook 번호 대역
   (`RB-0XX` … `RB-4XX`)에 매핑되어, 중단된 build가 알려진 checkpoint에서 재개된다.
2. 각 runbook의 `Depends on:` 목록을 사용해 **phase 내에서 위상 정렬(topologically sort)**한다.
   이 목록은 [dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)의 build-order DAG를
   반영한다. **gate runbook보다 adapter runbook을 절대 먼저 스케줄링하지 마라** — 그러면 gate를
   우회하는 경로가 생긴다.
3. **각 runbook은 하나의 gate이다.** runbook의 `Preconditions` 체크리스트가 참이고 그 `Depends on:`
   목록의 모든 runbook이 `Acceptance criteria`를 충족하기 전에는 runbook을 시작하지 마라.
4. 모든 Acceptance checkpoint에서 **tree를 green으로 유지**하라(build, lint, test 통과). 그래야
   재개된 build가 clean하다.
5. **가정하지 말고 검증하라.** 모든 step에는 `Do:`와 `Verify:`가 있다. 계약은 `Verify:`이다.

### Load-bearing invariants every runbook must preserve

| Invariant | Where enforced |
|-----------|----------------|
| Public-safe **re-check은 CORE stage**이다(adapter가 아님); upstream boundary = 증거(evidence) 뿐 | phase-1 gate + phase-1 import |
| **Deny-by-default** publish: 검증된 source가 없거나 public-safe boundary가 없으면 ⇒ denied | phase-1 gate |
| **Audit-only 필드**(`origin_ref`, `origin_version`)는 sidecar에 있고, 웹/API로 **절대 serialize되지 않음** | phase-0 model + phase-2 build (test로 강제) |
| **Immutable versions**: published된 `(slug, semver)`는 영구히 frozen; 편집 = 새 version | phase-2 storage + phase-3 lifecycle |
| **Public-safe by construction**: frozen static artifact는 internal store로 가는 live path가 없음 | phase-2 build |
| **Stub은 문서화된 `NotImplemented`**이며, 절대 silent하지 않음 | phase-4 interfaces |

## Phase table

> 폴더 이름이 authoritative하다. 아래 runbook ID는 계획된 단위이다; DAG에 따라 생성/정제하라.
> 이 phase 폴더들은 roadmap의 P0–P5를 통합한다(
> [milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md) 참조).

| Phase folder | Band | Theme | Runbooks (planned) | Implements |
|--------------|------|-------|--------------------|------------|
| `phase-0-foundations` | RB-0XX | Repo scaffold, 8-entity content model + **sidecar split**, config-driven adapter registry skeleton | RB-001 repo-scaffold-and-ci · RB-002 content-model-types-and-sidecar · RB-003 adapter-registry-skeleton | [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) |
| `phase-1-import-and-gate` | RB-1XX | Hexagonal core, **two ports**, **deny-by-default gate**, **public-safe re-check (core stage)**, v1 ContentSource adapters | RB-101 hexagonal-core-and-ports · RB-102 publish-gate-deny-by-default · RB-103 public-safe-recheck-core-stage · RB-104 contentsource-caw02-and-caw03 | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md) |
| `phase-2-build-and-publish` | RB-2XX | Git content store + semver + content-digest, Astro 5 + Starlight SSG, `SiteAndApi` sink (HTML + JSON + raw md + manifest), parity | RB-201 git-content-store-and-versioning · RB-202 astro-starlight-ssg-build · RB-203 siteandapi-sink-web-api-parity · RB-204 audit-fields-never-serialized-test | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md), [ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md), [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md) |
| `phase-3-versioning-and-lifecycle` | RB-3XX | Immutable `(slug,semver)` enforcement, new-version edits, unpublish/redact via HTTP 410 tombstone + bounded CDN purge, audit reports | RB-301 frozen-version-enforcement · RB-302 unpublish-redact-tombstone · RB-303 cache-purge-and-audit-report | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md) |
| `phase-4-interfaces-and-stubs` | RB-4XX | Documented `NotImplemented` stubs (internal wiki, curated bundle source; external docs host, package registry, syndication sinks), MCP resources view | RB-401 contentsource-stubs · RB-402 publishsink-stubs · RB-403 mcp-resources-and-distribution | [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md), [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md) |

## The Milestone-1 chain

> **M1 = 검증된 Skill 하나가 upstream에서 import되어 → public-safe gate를 통과해 → versioned web
> page AND versioned API resource로 published되고, website와 REST API 양쪽에서 읽을 수 있는 것.**

이 critical path를 실행하라(DAG `A → D → (B,C → E) → F → G → {H,I}`를 반영):

```
RB-001 ─► RB-002 ─► RB-003 ─┐
                            ├─► RB-101 ─► RB-102 ─► RB-103 ─► RB-104 ─► RB-201 ─► RB-202 ─► RB-203 ─► RB-204  =  M1
RB-201 (git store) ─────────┘  (storage may build in parallel after RB-002; gate must precede RB-104)
```

M1은 다음일 때 충족된다(전체 체크리스트는
[milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md) 참조): 실제 검증된 Skill이
CAW-03 adapter를 통해 import되고, **core re-check**가 통과하며, 콘텐츠가 content-digest와 함께
`skills/<slug>/<semver>.mdx`에 기록되고, SSG가 HTML 페이지를 emit하며, 동일한 artifact가 JSON과 raw
markdown으로도 fetch 가능하고(**parity**), `index.json`이 그것을 나열하며, **audit 필드가 모든 public
출력에서 부재(자동화된 test)**하고, static artifact가 어떤 internal store로도 **live path가 없을** 때.
Phase-3/4(lifecycle, stub, MCP view)는 곧바로 뒤따르지만 M1 critical path에는 없다.

## Budget discipline

- **넓은 scaffolding보다 작은 vertical slice**(PRODUCT-BRIEF §11). M1 critical path를 우선하라;
  Skill 하나를 end-to-end로 publish하는 데 필요하지 않은 것은 미뤄라.
- **v1 adapter만 build하고 나머지는 stub하라.** 미래의 source/sink는 *문서화된* `NotImplemented`
  seam(phase-4)이며 구현이 아니다 — seam을 설계하되 build는 건너뛰라.
- **명시적 non-scope를 존중하라**(authoring UI 없음, public write API/계정 없음, runtime search
  없음, content negotiation 없음 — [milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md)
  "Deferred" 참조). revisit trigger가 발동하지 않는 한 deferred 항목에 budget을 쓰지 마라.
- **하나의 build, 병렬 writer.** `G → {H,I,J}` fan-out은 병렬 sink writer를 가진 하나의 build
  runbook이다 — 세 개의 파이프라인이 아니다. surface별로 build 로직을 중복하지 마라.
- **green checkpoint에서 멈춰라.** runbook의 Acceptance criteria가 통과하고 tree가 green이면 그
  단위를 끝내라; runbook의 `Produces`를 넘어 gold-plating하지 마라.

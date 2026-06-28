# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./dependency-graph_ko.md](./dependency-graph_ko.md)
  - [./risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04 전달(delivery)을 runbook phase 폴더(`10-runbooks/RB-0XX` … `RB-5XX`)에 1:1로 매핑되는 phase로
순서화하며, phase별 **entry**/**exit** 기준과 명명된 milestone을 둔다. *무엇이 언제 출시되는지*와 
**public-safe-by-construction** 속성을 보존하는 순서를 정의한다. 이 문서는 DAG edge를 정의하지 않으며(see
[dependency-graph_ko.md](./dependency-graph_ko.md)) 위험 처리도 정의하지 않는다(see
[risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md)). 어떤 ADR 결정도 재정의하지 않는다.

## Phase ↔ runbook 매핑

각 phase는 runbook 번호 대역(band)에 대응하므로, 중단된 빌드가 알려진 checkpoint에서 재개된다. phase는 의도적으로
작고 수직으로 슬라이스되어 있다; 모든 phase는 트리를 green으로 남긴다(build, lint, test 통과).

| Phase | Runbook band | Theme | Milestone gate |
|-------|--------------|-------|----------------|
| P0 Foundations | RB-0XX | Repo scaffold, content model 타입, config registry 골격 | — |
| P1 Core & ports | RB-1XX | Hexagonal core, two ports, deny-by-default gate 단계 | — |
| P2 Storage & versioning | RB-2XX | Git content store, semver + content-digest, sidecar split | — |
| P3 Import & re-check | RB-3XX | v1 ContentSource adapters + core public-safe 재검사 | — |
| P4 Build & publish | RB-4XX | Astro/Starlight SSG, SiteAndApi sink, web + API parity | **M1**(아래 참조) |
| P5 Hardening & ops | RB-5XX | Tombstone, cache/unpublish, audit report, stub 문서화 | M2 |

> Cross-product 노트: CAW-02(knowledge)와 CAW-03(skills registry)는 **별도 제품**이다;
> CAW-04는 명시적 boundary를 가로질러 import하며 그들과 런타임 기반(runtime substrate)을 절대 공유하지 않는다.

---

## Phase P0 — Foundations

**Goal:** 비어 있지만 잘 타입화된 제품 골격.

| Entry | Exit |
|-------|------|
| PRODUCT-BRIEF + ADR 수락됨 | Repo가 깨끗하게 빌드됨(CI green) |
| Doc convention 마련됨 | 8개 엔티티 content model 타입 정의됨([ADR-0002]) |
| — | Config 기반 adapter registry 골격 존재(live adapter 없음) |
| — | sidecar 분리를 포함한 public-projection schema 선언됨 |

Deliverables: TypeScript content-model 타입; 동결된 공통 필드 집합(`id, kind, title, summary,
version, safety_boundary, provenance`); audit 전용 필드(`origin_ref`, `origin_version`)에 대한 **sidecar** 선언.

## Phase P1 — Core & ports

**Goal:** 어떤 adapter가 존재하기 전에, gate를 갖춘 hexagonal core.

| Entry | Exit |
|-------|------|
| P0 exit 충족 | 두 port 정의됨: `ContentSourceAdapter`, `PublishSinkAdapter`([ADR-0004]) |
| — | Deny-by-default publish gate 단계가 **core** 단계로 구현됨([ADR-0003]) |
| — | public-safe 재검사가 CORE 단계임(adapter 안이 아님); upstream 주장은 증거로만 취급 |
| — | Gate 단위 테스트: 검증된 source 없음 OR public-safe boundary 없음 ⇒ publish 거부됨 |

근거(see DAG): port + registry + gate가 adapter보다 **먼저** 존재해야 adapter가 gate를 우회하는 경로가 결코 될 수 없다.

## Phase P2 — Storage & versioning

**Goal:** 내구성 있고 불변이며 addressable한 content store.

| Entry | Exit |
|-------|------|
| P1 exit 충족 | `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`에 Git content store([ADR-0005]) |
| — | semver = public identity; content-digest = immutability 증명; 둘 다 write 시 계산됨 |
| — | Audit 전용 필드는 **sidecar**에 영속화되며, 게시 가능한 frontmatter에는 결코 들어가지 않음 |
| — | 동결된 `(slug, semver)` 강제: 기존 쌍의 재게시는 빌드를 실패시킴 |

versioning이 여기에 들어오는 이유는 **versioning이 존재하기 전에는 어떤 update 경로도 존재해서는 안 되기** 때문이다 —
편집은 새 버전을 만들고, 이전 버전은 addressable하게 유지된다.

## Phase P3 — Import & re-check

**Goal:** 검증된 upstream 콘텐츠가 store에 들어오고, core가 재검사한다.

| Entry | Exit |
|-------|------|
| P2 exit 충족 | v1 adapter: CAW-02 knowledge import, CAW-03/skills-registry import([ADR-0004]) |
| — | Stub 문서화됨(빌드 안 함): 내부 wiki, curated bundle |
| — | core 재검사가 모든 import마다 실행됨; upstream boundary 주장은 증거일 뿐 |
| — | ContentSource는 재검사가 통과한 **이후에만** git에 write([ADR-0005]) |
| — | Test: confidential 태그가 붙은 fixture는 upstream이 "public"으로 표시해도 거부됨 |

## Phase P4 — Build & publish — **Milestone M1**

**Goal:** end-to-end 수직 슬라이스가 양쪽 surface에서 가동됨.

| Entry | Exit (M1) |
|-------|-----------|
| P3 exit 충족 | git에서 Astro 5 + Starlight SSG 정적 빌드([ADR-0006]) |
| — | `SiteAndApi` PublishSink이 HTML 페이지 + 사전 빌드된 JSON + raw markdown 방출([ADR-0007]) |
| — | HTML/markdown/JSON 전반에 걸쳐 artifact당 하나의 canonical resource(web/API parity) |
| — | `index.json` manifest + `SKILL.md`/`manifest.json` 배포 + MCP resources view |
| — | **Test-enforced:** audit 전용 sidecar 필드는 web 또는 API 출력에 절대 직렬화되지 않음 |

### Milestone M1 (첫 출시 가능 가치의 정의)

> **M1 = upstream에서 import된 검증된 Skill 하나 → public-safe gate 통과 → 버전화된 웹 페이지 AND 버전화된 API
> resource로 게시, 웹사이트와 REST API 양쪽에서 읽을 수 있음.**

M1 인수 체크리스트:

- [ ] 실제 검증된 Skill이 CAW-03 ContentSource adapter를 통해 import된다.
- [ ] core 재검사가 통과한다(검증된 source 존재 + public-safe boundary 존재).
- [ ] 콘텐츠가 content-digest와 함께 `skills/<slug>/<semver>.mdx`에 git에 write된다.
- [ ] SSG 빌드가 canonical URL에 HTML 페이지를 생성한다.
- [ ] 동일 artifact가 JSON과 raw markdown으로 fetch 가능하다(parity 검증됨).
- [ ] `index.json`이 artifact를 나열한다; MCP resources view가 그것을 노출한다.
- [ ] audit 전용 필드가 모든 public 출력에서 부재한다(자동 테스트 통과).
- [ ] 정적 artifact가 어떤 내부 store로도 live 경로를 갖지 않는다(구조적으로 public-safe).

## Phase P5 — Hardening & ops — Milestone M2

**Goal:** lifecycle, cache, audit, 그리고 future-proofing.

| Entry | Exit (M2) |
|-------|-----------|
| M1 충족 | **HTTP 410 tombstone**을 통한 Unpublish/redact([ADR-0005], [ADR-0003]) |
| — | Boundary-change flow: deprecate / unpublish / redact |
| — | unpublish 시 cache invalidation 문서화 + 테스트됨(stale public 사본 없음) |
| — | Audit report: 모든 게시 항목이 검증된 내부 source + safety review로 추적됨 |
| — | 모든 future stub 문서화됨(외부 docs host, package registry, syndication) |

## Deferred (v1 명시적 비범위)

| Deferred item | Revisit trigger |
|---------------|-----------------|
| 런타임 search | 카탈로그 크기가 사전 빌드된 index를 불충분하게 만들 때 |
| Accept-header content negotiation | 소비자가 단일 URL negotiation을 요구할 때 |
| Authoring UI | 절대 — authoring은 CAW-04의 non-goal(PRODUCT-BRIEF §10) |
| Public write API / accounts | 범위 밖(read-only public surface) |

## Open Questions

- 정적 artifact의 Hosting/CDN 대상 — TODO(open-question: pin deploy target).
- M1 → M2의 주기 — TODO(open-question: depends on upstream validated-entry availability).
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## Implications for runbooks

- runbook을 phase 대역(`RB-0XX`…`RB-5XX`)으로 번호 매기라; 각 단위를 작고 재개 가능하게 유지하라.
- gate(P1)와 재검사(P3)는 모든 runbook 순서에서 publish 경로(P4)보다 앞서야 한다.
- M1은 첫 "데모 가능한" runbook checkpoint다 — 중단된 빌드가 깔끔하게 재개되도록 분할하라.

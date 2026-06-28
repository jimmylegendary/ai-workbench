# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./dependency-graph_ko.md](./dependency-graph_ko.md)
  - [./risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04 delivery를 runbook phase 폴더(`10-runbooks/RB-0XX` … `RB-5XX`)와 1:1로 매핑되는 phase로
순서화하고, phase별 **entry** 및 **exit** 기준과 명명된 milestone을 정의한다. 이 문서는 *무엇이 언제 출시되는가*와
**public-safe-by-construction** 속성을 보존하는 순서를 정의한다. 이 문서는 DAG edge(see
[dependency-graph.md](./dependency-graph_ko.md))나 risk 처리(see
[risks-and-mitigations.md](./risks-and-mitigations_ko.md))를 정의하지 않는다. 어떤 ADR 결정도 재정의하지 않는다.

## Phase ↔ runbook 매핑

각 phase는 runbook 번호 대역에 대응하므로, 중단된 빌드가 알려진 checkpoint에서 재개된다. phase는 의도적으로 작고
수직으로 슬라이스되어 있다; 모든 phase는 트리를 green 상태로 남긴다(build, lint, test 통과).

| Phase | Runbook band | Theme | Milestone gate |
|-------|--------------|-------|----------------|
| P0 Foundations | RB-0XX | Repo scaffold, content model 타입, config registry skeleton | — |
| P1 Core & ports | RB-1XX | Hexagonal core, 두 ports, deny-by-default gate stage | — |
| P2 Storage & versioning | RB-2XX | Git content store, semver + content-digest, sidecar 분리 | — |
| P3 Import & re-check | RB-3XX | v1 ContentSource adapter + core public-safe 재검사 | — |
| P4 Build & publish | RB-4XX | Astro/Starlight SSG, SiteAndApi sink, web + API parity | **M1**(아래 참조) |
| P5 Hardening & ops | RB-5XX | Tombstone, cache/unpublish, audit report, 문서화된 stub | M2 |

> Cross-product 참고: CAW-02(knowledge)와 CAW-03(skills registry)은 **별개 제품**이다;
> CAW-04는 명시적 경계를 가로질러 import하며 결코 런타임 기반(substrate)을 공유하지 않는다.

---

## Phase P0 — Foundations

**Goal:** 비어 있지만 잘 타입화된 제품 skeleton.

| Entry | Exit |
|-------|------|
| PRODUCT-BRIEF + ADR 승인됨 | Repo가 clean하게 빌드됨(CI green) |
| Doc convention 정비됨 | 8-entity content model 타입 정의됨([ADR-0002]) |
| — | Config 기반 adapter registry skeleton 존재(라이브 adapter 없음) |
| — | sidecar 분리를 포함한 public-projection schema 선언됨 |

Deliverable: TypeScript content-model 타입; 동결된 common-field 집합(`id, kind, title, summary,
version, safety_boundary, provenance`); audit 전용 필드(`origin_ref`, `origin_version`)에 대한
**sidecar** 선언.

## Phase P1 — Core & ports

**Goal:** 어떤 adapter도 존재하기 전에 gate를 가진 hexagonal core.

| Entry | Exit |
|-------|------|
| P0 exit 충족 | 두 ports 정의: `ContentSourceAdapter`, `PublishSinkAdapter`([ADR-0004]) |
| — | Deny-by-default publish gate stage가 **core** stage로 구현됨([ADR-0003]) |
| — | Public-safe 재검사가 CORE stage(adapter 안 아님); upstream claim은 증거로만 취급 |
| — | Gate unit 테스트: 검증된 소스 없음 OR public-safe boundary 없음 ⇒ publish 거부 |

Rationale(see DAG): ports + registry + gate는 adapter보다 **먼저** 존재해야 하며, 그래야 adapter가
gate를 우회하는 경로가 결코 될 수 없다.

## Phase P2 — Storage & versioning

**Goal:** 내구성 있고 immutable하며 주소 지정 가능한 content store.

| Entry | Exit |
|-------|------|
| P1 exit 충족 | `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`의 Git content store([ADR-0005]) |
| — | semver = public identity; content-digest = immutability 증명; 둘 다 write 시 계산 |
| — | Audit 전용 필드는 **sidecar**에 persist, 절대 발행 가능 frontmatter에 넣지 않음 |
| — | 동결된 `(slug, semver)` 강제: 기존 쌍의 재발행은 빌드 실패 |

versioning은 여기에 등장하는데 **versioning이 존재하기 전에는 어떤 update 경로도 존재할 수 없기** 때문이다 —
편집은 새 버전을 만들고, 이전 버전은 주소 지정 가능 상태로 남는다.

## Phase P3 — Import & re-check

**Goal:** 검증된 upstream 콘텐츠가 store에 들어오고, core가 재검사한다.

| Entry | Exit |
|-------|------|
| P2 exit 충족 | v1 adapter: CAW-02 knowledge import, CAW-03/skills-registry import([ADR-0004]) |
| — | Stub 문서화됨(빌드 안 됨): internal wiki, curated bundle |
| — | 모든 import에서 Core 재검사 실행; upstream boundary claim은 증거로만 |
| — | ContentSource는 재검사 통과 **후에만** git에 write([ADR-0005]) |
| — | 테스트: confidential 태그된 fixture는 upstream이 "public"으로 표시해도 거부됨 |

## Phase P4 — Build & publish — **Milestone M1**

**Goal:** end-to-end 수직 슬라이스가 두 표면 모두에서 라이브.

| Entry | Exit (M1) |
|-------|-----------|
| P3 exit 충족 | git으로부터 Astro 5 + Starlight SSG 정적 build([ADR-0006]) |
| — | `SiteAndApi` PublishSink가 HTML 페이지 + 사전 빌드된 JSON + raw markdown 방출([ADR-0007]) |
| — | HTML/markdown/JSON 전반에서 artifact당 하나의 canonical resource(web/API parity) |
| — | `index.json` manifest + `SKILL.md`/`manifest.json` 배포 + MCP resources view |
| — | **Test-enforced:** audit 전용 sidecar 필드는 web나 API 출력으로 절대 직렬화되지 않음 |

### Milestone M1(첫 출시 가능 가치의 정의)

> **M1 = upstream에서 import된 검증된 Skill 하나 → public-safe gate를 통과 → versioned 웹 페이지 AND
> versioned API 리소스로 발행, 웹사이트와 REST API 양쪽에서 읽을 수 있음.**

M1 인수 체크리스트:

- [ ] 실제 검증된 Skill이 CAW-03 ContentSource adapter를 통해 import됨.
- [ ] Core 재검사 통과(검증된 소스 존재 + public-safe boundary 존재).
- [ ] 콘텐츠가 `skills/<slug>/<semver>.mdx`에 content-digest와 함께 git에 write됨.
- [ ] SSG build가 canonical URL에 HTML 페이지를 생성.
- [ ] 동일한 artifact가 JSON 및 raw markdown으로 fetch 가능(parity 검증됨).
- [ ] `index.json`이 artifact를 나열; MCP resources view가 이를 노출.
- [ ] Audit 전용 필드가 모든 public 출력에서 부재(자동 테스트 통과).
- [ ] 정적 artifact가 어떤 내부 저장소로도 라이브 경로가 없음(구조적으로 public-safe).

## Phase P5 — Hardening & ops — Milestone M2

**Goal:** lifecycle, cache, audit, 그리고 future-proofing.

| Entry | Exit (M2) |
|-------|-----------|
| M1 충족 | **HTTP 410 tombstone**을 통한 Unpublish/redact([ADR-0005], [ADR-0003]) |
| — | Boundary-change 흐름: deprecate / unpublish / redact |
| — | unpublish 시 Cache invalidation 문서화 + 테스트됨(stale public copy 없음) |
| — | Audit report: 모든 발행 항목이 검증된 내부 소스 + 안전성 검토로 추적됨 |
| — | 모든 미래 stub 문서화됨(external docs host, package registry, syndication) |

## Deferred(v1의 명시적 비-범위)

| Deferred item | Revisit trigger |
|---------------|-----------------|
| Runtime 검색 | 카탈로그 크기가 사전 빌드 인덱스를 불충분하게 만듦 |
| Accept-header content negotiation | 소비자가 single-URL negotiation을 요구함 |
| Authoring UI | 절대 — authoring은 CAW-04 비-목표(PRODUCT-BRIEF §10) |
| Public write API / 계정 | 범위 밖(read-only public 표면) |

## Open Questions

- 정적 artifact의 Hosting/CDN target — TODO(open-question: pin deploy target).
- M1 → M2의 주기 — TODO(open-question: depends on upstream validated-entry availability).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의

- runbook을 phase 대역(`RB-0XX`…`RB-5XX`)으로 번호 매기라; 각 단위를 작고 재개 가능하게 유지하라.
- gate(P1)와 re-check(P3)는 모든 runbook 순서에서 publish 경로(P4)보다 앞서야 한다.
- M1은 첫 "demo 가능" runbook checkpoint다 — 중단된 빌드가 깔끔하게 재개되도록 분할하라.

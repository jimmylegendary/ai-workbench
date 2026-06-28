# System Architecture — 컨테이너와 Public-Safe-by-Construction Boundary

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./component-boundaries_ko.md](./component-boundaries_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery_ko.md](../01-decisions/ADR-0001-product-surface-and-delivery_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md)
  - [../01-decisions/ADR-0007-api-design_ko.md](../01-decisions/ADR-0007-api-design_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04의 **컨테이너 수준 아키텍처**를 확정한다: 어떤 런타임/빌드 단위가 존재하는지, 그것들이 서로 어떻게
의존하는지, 그리고 공개 표면을 **public-safe by construction(구성상 public-safe)** 으로 만드는 구조적 불변식.
이 문서는 ADR-0001/0004/0006을 구체화하며 — content model(ADR-0002), gate 규칙(ADR-0003), storage/versioning
정체성(ADR-0005), 또는 API resource scheme(ADR-0007)을 재정의하지 **않는다**. 모듈 수준 소유권과 서비스
시그니처는 형제 문서인 [component-boundaries_ko.md](./component-boundaries_ko.md)에 있다.

CAW-04는 **독립적인 제품**이다: 자신의 core, 자신의 git content store, 자신의 deploy를 가진다. 형제 제품과 **어떤
런타임 substrate도 공유하지 않는다**; 모든 제품 간 link는 adapter가 넘어가는 import boundary이다(brief §1, §7).
그것은 아무것도 저작(author)하지 않는다 — 내부 substrate가 이미 검증한 것을, 로컬 re-check 이후에 게시할 뿐이다.

## 컨테이너

| # | Container | Kind | Responsibility | Reads | Writes |
|---|---|---|---|---|---|
| C1 | **Product Core** | library / batch process | `import → re-check → curator gate → version → publish`를 오케스트레이션. re-check + gate + versioning을 소유. Adapter 중립적. | source adapters, config, git store | git content store, audit log |
| C2 | **ContentSource adapters** | driven adapter | id/URI/version으로 upstream에서 읽기 전용 pull; provenance 태그된 `CandidateItem` 반환. v1: `Caw02Knowledge`, `Caw03SkillsRegistry`. Stubs: wiki, curated bundle. | upstream products (over a boundary) | — (returns to core) |
| C3 | **Git Content Store** | data (files) | Source of truth: markdown/MDX + YAML frontmatter; audit-only 필드는 sidecar에. re-check **이후** core가 기록. 게시된 `(slug,semver)`는 불변. | — | by core only |
| C4 | **PublishSink adapter — Astro SSG Build** | build pipeline | `SiteAndApiSinkAdapter`: git store를 동결된 정적 artifact(HTML + JSON + raw `.md` + manifest)로 변환. 빌드 타임 `boundary === "public"` assertion 실행. | git content store | static artifact |
| C5 | **Static Artifact** | deployed files (CDN) | 사전 빌드된 파일로서의 공개 website **및** REST API. 세계의 유일한 뷰. 안쪽으로 되돌아가는 코드 경로 없음. | — | served read-only |
| C6 | **Preview/Admin surface** | internal-only app | curator에게 re-check finding + diff를 보여줌; gate를 통과한 후보를 live로 승격시키는 **유일한** 경로(C4 트리거). 결코 공개되지 않음. | git store (candidate/staging), audit log | approval events → core |
| C7 | **Audit log** | append-only data | 모든 import, re-check verdict, approval, publish/unpublish를 provenance와 함께 기록. | — | by core only |

C2–C7은 ADR-0004/0006/0007에서 확정된 adapter와 stack으로 실현된다. 미래의 sink(외부 docs host, package registry,
syndication)는 동일한 core 위의 추가적인 C4급 adapter이다(ADR-0004 §5).

## 컨테이너 다이어그램

```
        UPSTREAM (separate products — import boundary, no shared substrate)
        ┌──────────────────────┐   ┌──────────────────────────────┐
        │ CAW-02 knowledge     │   │ CAW-03 / skills registry     │
        └──────────┬───────────┘   └──────────────┬───────────────┘
   pull by id/URI/version (read-only)             │
        ┌──────────▼───────────────────────────────▼──────────────┐
        │  C2  ContentSource adapters   (provide CandidateItem +   │
        │      upstream_boundary_claim = EVIDENCE ONLY)            │
        └──────────────────────────┬──────────────────────────────┘
                                   │ CandidateItem
   ╔═══════════════════════════════▼══════════════════════════════╗
   ║  C1  PRODUCT CORE   (hexagonal; adapters cannot bypass it)    ║
   ║                                                              ║
   ║   Import → ┌───────────────┐ → Curator → Versioning →        ║
   ║            │ Re-check/Gate │   gate (C6)  (semver+digest)     ║
   ║            │ DENY-BY-DFLT  │                                  ║
   ║            └───────────────┘                                  ║
   ║   public-safe RE-CHECK is a CORE stage — NOT in any adapter   ║
   ╚════════════════╤═══════════════════════════╤═════════════════╝
                    │ write AFTER re-check       │ approval events
            ┌───────▼────────┐          ┌────────▼─────────┐
            │ C3 Git Content │          │ C6 Preview/Admin │  (internal only)
            │    Store (SoT) │◄─────────│   curator review │
            │  md/MDX+sidecar│  staging └──────────────────┘
            └───────┬────────┘
                    │ getCollection() — typed corpus
            ┌───────▼─────────────────────────────────────┐
            │ C4 PublishSink: Astro 5 SSG build            │
            │   build-time assert boundary==="public"      │
            │   strip audit-only fields (sidecar) before   │
            │   ANY serialization                          │
            └───────┬─────────────────────────────────────┘
                    │ frozen vetted files (HTML + .json + .md + index.json)
            ┌───────▼─────────────────────────────────────┐
            │ C5 Static Artifact on CDN                    │
            │   Website (HTML) + REST API (JSON/.md) + MCP │
            └───────┬─────────────────────────────────────┘
                    │ read-only
        ┌───────────▼───────────┐
        │ Readers / Agents / MCP│   (NO path back to C1/C2/C3 — see invariant)
        └───────────────────────┘
```

## 단방향 의존성 규칙

의존성은 **안쪽으로, 그 다음 파이프라인을 따라 바깥쪽으로만** 향한다; 하류의 무엇도 요청 시점에 상류로 되돌아
호출하지 않는다.

```
upstream ──► C2 source ──► C1 core ──► C3 git store ──► C4 build ──► C5 static artifact ──► public
                                          ▲
                                   C6 admin approves
```

규칙(관례가 아니라 architecture fitness로 강제됨):

1. **Adapter는 core의 port 인터페이스에 의존한다; core는 결코 구체 adapter에 의존하지 않는다**(hexagonal,
   ADR-0004). 배선은 config 주도(`caw04.config.yaml`)이다.
2. **re-check와 gate는 C1에 위치한다.** 어떤 adapter도 — source든 sink든 — 그것을 우회하여 게시할 수 없다. 모든
   adapter descriptor의 `requiresPublicSafe: true`는 스스로 비활성화할 수 없다(ADR-0004 §3).
3. **C3는 오직 C1에 의해서만, 오직 re-check 이후에만 기록된다.** build(C4)는 C3의 순수 읽기이다.
4. **C5는 아웃바운드 의존성이 없다.** 그것은 코드가 아니라 데이터이다; C1/C2/C3를 질의할 수 없다.

## Public-safe by construction

가장 중대한 가드레일(brief §11): 공개 표면에 confidential 데이터가 없을 것. 아키텍처는 계층화된 독립적 backstop으로
leak을 **구조적으로 어렵게** 만든다 — defense in depth, 각 계층에서 deny-by-default.

| Layer | Where | Property |
|---|---|---|
| L0 Upstream claim is evidence only | C2 | `upstream_boundary_claim`은 기록되되, 결코 verdict로 신뢰되지 않는다(ADR-0004). |
| L1 Core re-check | C1 | `boundary_eff`를 재계산; fail-closed(해소 불가능한 조상 ⇒ confidential); 렌더링된 공개 뷰에 대한 redaction/leak 스캔; deny-by-default. 결과는 `RecheckVerdict`(ADR-0003/0004). |
| L2 Human gate | C6 | Curator approval 필수; live로 승격시키는 유일한 경로(brief §11). |
| L3 Public projection split | C3→C4 | Audit-only provenance(`origin_ref`/`origin_version`)는 web/API로 **결코 직렬화되지 않는** **sidecar**에 위치; 테스트가 그것이 출력에 결코 나타나지 않음을 assert(ADR-0002/0006). |
| L4 Build-time invariant | C4 | 방출되는 **모든** page/JSON/`.md`에 대해 `boundary === "public"`를 assert; 아니면 **빌드를 실패시킨다**(ADR-0006). |
| L5 Frozen static artifact | C5 | 배포된 집합은 파일뿐이다 — **공개 요청에서 임의의 내부/upstream store로 되돌아가는 live 코드 경로가 없다**(ADR-0001/0006). |

핵심을 떠받치는 구조적 주장: 앞선 모든 계층이 잘못 구성되었더라도, **C5는 안쪽으로 도달할 수 없다** — 그것은 CDN
위의 동결되고 검증된 파일 집합이다. 공개 표면은 검사에 의해서만이 아니라 *시스템의 형태에 의해* 안전하다.

## Build & deploy flow

1. Core가 후보를 import(pull)하고, re-check를 실행하며, finding을 C6에서 curator에게 제시한다.
2. 승인 시, core는 불변 `(slug, semver)` + content-digest를 할당하고 public projection을 C3에 기록한다(ADR-0005).
   Audit-only 필드는 sidecar로 간다.
3. `SiteAndApiSinkAdapter`(C4)가 `astro build` → `dist/`(HTML + `.json` + `.md` + `index.json`)를 트리거한다.
   build는 L4와 public-projection 테스트를 실행한다; 실패는 deploy를 중단시킨다.
4. `dist/`가 C5로서 CDN에 배포된다. unpublish/redact는 build를 재실행하여 **410 Gone** tombstone을 방출하고 edge
   캐시를 purge한다.

Rebuild 트리거 메커니즘과 CDN purge 한계는 미해결: TODO(open-question: rebuild-trigger), TODO(open-question:
cdn-purge-bound) — [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md) 참조.

## 독립성과 제품 간 boundary

- CAW-02와 CAW-03은 **별개의 제품**이다; CAW-04는 오직 C2 source adapter를 통해, id/URI/version 참조로만 그것들에
  도달한다 — 결코 공유 store/registry/runtime이 아니다(brief §1).
- CAW-04는 자신이 게시하는 모든 것의 **자체 복사본**을 보유한다(C3); upstream 철회(retraction)는 live link가 아니라
  unpublish/tombstone 경로로 처리된다(revocation에 관한 ADR-0004 미해결 질문).

## 미해결 질문

- TODO(open-question: rebuild-trigger) — approve/update/unpublish 시 C4가 어떻게 트리거되는지.
- TODO(open-question: cdn-purge-bound) — unpublish/redact 시 edge에 캐시된 공개 artifact의 time-to-purge 보장.
- TODO(open-question: import-pull-vs-push) — pull 전용 vs upstream push(C2에 영향).
- TODO(open-question: fan-in-dedup) — CAW-02와 CAW-03이 동일한 논리적 항목을 표면화할 때의 dedup/우선순위.
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의

- 임의의 구체 adapter보다 먼저 두 개의 port를 갖춘 hexagonal core(C1)를 scaffold하라.
- L3(sidecar split), L4(`boundary === "public"` assert), 그리고 public-projection 테스트를 차단 게이트로서 CI에
  배선하라 — 이것들은 선택적 lint가 아니라 구조적 backstop이다.
- C5를 순수 정적 배포 대상으로 유지하라; 런타임 endpoint를 추가하자는 어떤 제안도 ADR-0001 Option C를 재개시킨다.
- 모듈 소유권과 서비스 시그니처: [component-boundaries_ko.md](./component-boundaries_ko.md) 참조.
</content>

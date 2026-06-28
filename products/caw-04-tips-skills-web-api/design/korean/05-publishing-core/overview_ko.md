# Publishing Core — Overview

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./publish-gate-and-public-safe_ko.md](./publish-gate-and-public-safe_ko.md)
  - [./import-and-recheck_ko.md](./import-and-recheck_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../06-interfaces/](../06-interfaces/) (port contract — adapter 세부)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **publishing core가 무엇인지** — 검증되고 upstream에서 import된 candidate를 published, versioned,
public-safe 아티팩트로 바꾸는 CAW-04의 hexagonal 심장부 — 를 설명하고, `05-publishing-core/` 및 runbook이 구축할
core 소스 트리에 대한 **folder map**을 제공한다. gate policy를 다시 결정하지 않으며
(see [publish-gate-and-public-safe_ko.md](./publish-gate-and-public-safe_ko.md)), import/재검사 메커니즘
(see [import-and-recheck_ko.md](./import-and-recheck_ko.md)), content model(ADR-0002), 저장/버전 관리
(ADR-0005), web/API 스택(ADR-0006/0007)도 결정하지 않는다. 이 문서는 그것들을 묶는 지도다.

## core란 무엇인가
publishing core는 세 surface(공개 웹사이트, 공개 REST API, 내부 preview/admin — ADR-0001) 뒤에, 그리고 두 port
(`ContentSourceAdapter` in, `PublishSinkAdapter` out — ADR-0004) 사이에 위치하는
**제품 소유, 프레임워크 비종속** 도메인이다. 아무것도 저작하지 않는다(brief §10). 이미 검증된 콘텐츠를 명시적
boundary를 가로질러 **import**하고, public-safety를 위해 **재검사**하고, **curator 승인**을 위해 보류하고,
**버전 부여 + freeze**한 뒤, `PublishableItem`을 sink에 넘긴다.

core는 CAW-04의 단 하나의 정의적 속성을 구현한다: **public-safe by construction.** 두 가지 누출 방지 통제 —
public-safe 재검사와 publish gate — 는 *core 내부에* 있으며 결코 adapter에 있지 않으므로, 어떤
source나 sink도 스스로 우회할 수 없다(ADR-0004 §2/§3). static-artifact 배포 모델(ADR-0006)은 publish된 출력이
**어떤 내부 store로도 돌아가는 live path가 없음**을 뜻한다: 바이트가 서빙 가능해질 무렵이면 이미 gate를 통과하고
freeze된 상태다.

### 파이프라인 (한 방향, deny-by-default)
```
ContentSourceAdapter.fetch()           # adapter: read-only, returns a CandidateItem (untrusted)
        │
        ▼
[CORE] import re-check  ── reject/quarantine ─▶  audit + stop   # public-safe re-check (defense in depth)
        │  (CandidateItem → candidate, findings attached)
        ▼
[CORE] preview/admin hold              # candidate visible ONLY on internal surface, never public
        │
        ▼
[CORE] publish gate G1..G8             # total, side-effect-free decision; default branch = REJECT
        │  (G8 = explicit human approve event)
        ▼
[CORE] version + freeze                # semver identity + content-digest immutability (ADR-0005)
        │  (PublishableItem: boundary=public, provenance attached, approved)
        ▼
PublishSinkAdapter.publish()           # adapter: SiteAndApi (HTML + JSON + raw md), MCP view
```
모든 화살표는 **fail-closed**다: 불확정적이거나 미검증이거나 파싱 불가능한 것은 멈추고 제외된다
(ADR-0003 principle 2). gating 이후 결과가 비어 있으면 degraded publish가 아니라 no-op이다.

## core 책임 vs. 다른 곳에 있는 것
| Concern | Owner | Where |
|---|---|---|
| upstream 콘텐츠 읽기(CAW-02/CAW-03), id/URI/version으로 참조 | Adapter (driven) | `ContentSourceAdapter` — ADR-0004; [../06-interfaces/](../06-interfaces/) |
| trust boundary에서의 public-safe 재검사 | **Core** | [import-and-recheck_ko.md](./import-and-recheck_ko.md) |
| `publish_decision()` gate G1–G8 | **Core** | [publish-gate-and-public-safe_ko.md](./publish-gate-and-public-safe_ko.md) |
| 내부 surface에서의 curator 승인(G8) | **Core** + preview/admin surface | ADR-0001; gate doc |
| Versioning, freeze, content-digest, tombstone | **Core** + store | ADR-0005 |
| Append-only hash-chained audit ledger | **Core** | gate doc §Audit |
| HTML / JSON / raw md / SKILL.md / MCP emit | Adapter (driven) | `SiteAndApiSinkAdapter` — ADR-0006/0007 |
| Boundary/visibility 어휘 | **Core (own copy)** | CAW-02로부터 의미만 재사용, 공유 아님 — ADR-0003 |

두 port가 외부로의 **유일한** seam이다; 이를 배선하는 registry는 config 기반이며 adapter가 재검사,
human gate, boundary policy를 override하게 결코 둘 수 없다(ADR-0004 §4).

## `pub.safe` 라이브러리 — 단 하나의 gate
모든 누출 방지 로직은 단일 제품 내 라이브러리 `pub.safe`(CAW-02의 `kr.boundary`에 대응하는 CAW-04 버전,
공유 의존성이 아닌 **독립 복사본**)에 집중되어 있다. 노출하는 것:

```
pub.safe
├── envelope.parse(bytes) -> Envelope            # parse + semver-gate the import envelope
├── boundary.eff(graph)   -> Boundary            # lattice-max over provenance ancestors (fail-closed unknown)
├── visibility.eff(graph) -> Visibility          # private-derived check
├── redact.scan(view)     -> Hit[]               # ruleset over the RENDERED public view
├── gate.decide(item)     -> PUBLISH_OK | REJECT{reasons[]}   # total, side-effect-free; default REJECT
└── audit.append(event)   -> seq                 # hash-chained _events line
```
`pub.safe`를 우회하는 **raw import path는 없다** — agent와 사람이 동일한 검사를 거친다(ADR-0004 §2).
gate는 오직 auto-**reject**만 할 수 있다; 결코 auto-**approve**할 수 없다(ADR-0003 principle 6).

## Folder map — `design/05-publishing-core/`
| File | Decides / describes |
|---|---|
| `overview.md` (this file) | core가 무엇인지; folder + source map; 한눈에 보는 파이프라인 |
| `publish-gate-and-public-safe.md` | load-bearing gate: deny-by-default, validated-source + public-safe 필수, redaction, curator 승인, generated/unverified는 결코 publish 안 됨 |
| `import-and-recheck.md` | `ContentSourceAdapter` import + CORE public-safe 재검사; upstream boundary = 증거일 뿐; fan-in dedup/precedence; pull(v1) vs push |

## runbook이 구축할 소스 트리 (최종 코드가 아닌 빌드 가이드)
```
src/
├── core/
│   ├── pub_safe/            # the one gate library (envelope, boundary, visibility, redact, gate, audit)
│   │   ├── envelope.*       # parse + semver-gate
│   │   ├── boundary.*       # boundary_eff / visibility_eff (fail-closed)
│   │   ├── redact.*         # scan() over rendered public view + pattern lists
│   │   ├── gate.*           # publish_decision() G1..G8
│   │   └── audit.*          # hash-chained _events writer + verify_audit()
│   ├── import/              # re-check pipeline orchestration (calls pub_safe; NOT an adapter)
│   ├── pipeline/            # import → re-check → hold → gate → version → publish wiring
│   ├── model/               # CandidateItem / candidate / PublishableItem (ADR-0002 shapes)
│   └── registry/            # config-driven adapter registry + preflight (ADR-0004 §3/§4)
├── ports/
│   ├── content_source.*     # ContentSourceAdapter interface
│   └── publish_sink.*       # PublishSinkAdapter interface
├── adapters/
│   ├── source/              # Caw02Knowledge*, Caw03SkillsRegistry*, + stubs (wiki, curated bundle)
│   └── sink/                # SiteAndApi*, + stubs (docs host, package registry, syndication)
└── content/                 # CAW-04's OWN git store (written AFTER the re-check) — ADR-0005
    └── {tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
```
`src/content/` 아래의 store가 **source of truth**다(ADR-0005). core는 재검사가 통과한 **후에만** 거기에 쓰며;
sink는 그것으로**부터** static artifact를 빌드한다. 공개 아티팩트에서 어떤 내부 store로도 돌아가는 live read
path는 없다.

## core 불변식 (테스트로 집행)
| # | Invariant | Enforced by |
|---|---|---|
| I1 | `internal`/`confidential`/`private`-derived 항목은 결코 sink에 도달하지 않음 | gate G2/G3; negative-heavy + mutation 테스트 (ADR-0003) |
| I2 | 어떤 raw import path도 `pub.safe`를 우회하지 않음 | single import entrypoint; registry preflight (ADR-0004 §3) |
| I3 | audit 전용 provenance(`origin_ref`/`origin_version`)는 web/API로 결코 직렬화되지 않음 | sidecar split (ADR-0002); 직렬화 테스트 |
| I4 | publish된 `(slug, semver)`는 영원히 freeze됨; 편집 = 새 version | content-digest immutability (ADR-0005) |
| I5 | 모든 publish에는 명시적 human approve 이벤트(G8)가 있음 | gate; audit `approved_by` |
| I6 | `active` adapter는 결코 `stub`이 아님 | registry preflight (ADR-0004 §3) |

## Open Questions
- TODO(open-question: import bundle이 로컬 `boundary_eff` 재계산을 위해 전체 provenance ancestor graph를
  보내는가, 아니면 leaf + declared boundary만 보내는가? — ADR-0003/0004; I1에 영향.)
- TODO(open-question: 재검증/revocation 주기 — upstream source가 confidential로 재분류되어 unpublish해야 함을
  core가 어떻게 알게 되는지 — ADR-0003.)
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (pub.safe library):** negative-heavy하고 mutation-tested된 스위트로 단일 gate 라이브러리를 구축한다 —
  기본 분기를 `PUBLISH_OK`로 약화시키면 스위트가 깨져야 한다.
- **RB (core pipeline):** `import → re-check → hold → gate → version → publish`를 배선한다; 어느 단계도 건너뛸 수 없다.
- **RB (registry + preflight):** config 기반 배선; `active`한 `stub` 거부; secret은 env ref만.
- **RB (sidecar split test):** audit 전용 provenance가 어떤 web/API 직렬화에도 나타나지 않음을 단언한다(I3).

# ADR-0004: trust boundary에서의 public-safe re-check를 갖춘 ports & adapters를 통한 import

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§7 import boundaries, §8 open interfaces)
  - [../02-research/import-and-ports.md](../02-research/import-and-ports_ko.md) (이 ADR이 비준하는 research)
  - [./ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (이 port들이 호출하는 gate 정책)
  - [./ADR-0002-content-model.md](./ADR-0002-content-model_ko.md) (`CandidateItem`/`PublishableItem` 형태)
  - [./ADR-0005-storage-and-versioning.md](./ADR-0005-storage-and-versioning_ko.md) (re-check된 항목이 도착 + freeze되는 곳)
  - [./ADR-0007-api-design.md](./ADR-0007-api-design_ko.md) (v1 sink: website + REST + MCP)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) (TODO)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

CAW-04는 public read/API publishing 레이어다. 그 자체로는 아무것도 저작하지 않는다; **그 런타임을 공유하지 않는** 형제 제품들 — CAW-02(knowledge, 별도 제품)와 CAW-03 / skills registry(별도 제품) — 로부터 이미 검증된 콘텐츠를 **import**하여 세상에 **publish**한다(brief §1, §7). 작용하는 힘(forces):

- **공유 기반 없음**(brief §1). 모든 제품 간 링크는 명시적 import boundary 위의 adapter여야 한다 — id/URI/version으로 참조하되, 공유 저장소나 registry는 절대 아님. CAW-04는 자신이 publish하는 것의 자체 복사본을 보유한다.
- **이질적이고 증가하는 source와 sink**(brief §8): v1 = CAW-02 + CAW-03 in, website + REST out; 미래 = 내부 wiki / 큐레이션된 번들 in, 외부 docs 호스트 / 패키지 registry / 신디케이션 out. 하나를 추가하는 것은 core 편집이 아니라 "adapter 파일 하나 + config 블록 하나 채우기"여야 한다.
- **upstream `public-safe`는 주장이지, 판결이 아니다**(brief §7, §11). 단 하나의 가장 위험한 실패는 기밀 노하우를 공개 표면으로 누출하는 것이다; seam은 그것을 구조적으로 어렵게 만들어야 한다.
- **Jimmy가 모든 publish를 승인한다**(brief §11). human gate와 안전 re-check는 어떤 adapter도 자가-우회할 수 없는 core에 살아야 한다.

## Options considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Hexagonal core + 2 driven ports(`ContentSourceAdapter`, `PublishSinkAdapter`) + config registry; core 내 public-safe re-check** | source/sink를 자유롭게 교체; gate 우회 불가; fake로 테스트 가능; CAW-03 백본과 일치(독립 복사본) | 선행 계약 설계; 간접성; 일부 upstream 로직을 로컬에서 재구현 | **Chosen** — brief §8이 ports & adapters를 의무화 |
| 직접 point-to-point importer(CAW-02 importer 하나, CAW-03 importer 하나) | 지금은 추상화 덜함 | re-check + gate 로직이 importer마다 중복; 새 source = 새 core 경로; 우회 위험 | Rejected — seam 누출, 취약 |
| CAW-02/CAW-03에서 import한 공유 클라이언트 라이브러리 | upstream boundary 코드 재사용 | 공유 런타임 기반 생성(brief §1 위반); release 주기 결합 | Rejected — 독립성 계약 |
| upstream `public_safe` 플래그 신뢰, 얇은 pass-through | 저렴 | 단일 upstream 오분류가 public에 누출을 출하; defense in depth 없음 | Rejected — brief §7/§11 |

## Decision

**hexagonal(ports & adapters)** core에 **두 개의 driven port**, **config-driven registry**, 그리고 모든 import가 건너는 **core-resident public-safe re-check**를 채택한다.

1. **두 개의 port(typed, tech-agnostic 인터페이스; 언어는 [ADR-0006](./ADR-0006-web-stack_ko.md)/[ADR-0007](./ADR-0007-api-design_ko.md)에서 확정):**
   - `ContentSourceAdapter` — `capabilities`, `discover(query) -> CandidateRef[]`, `fetch(ref) -> CandidateItem`, `health()`. 읽기 전용; upstream을 id/URI/version으로 참조; provenance-tagged `CandidateItem`(payload + `upstream_boundary_claim` + `source_ref` + `upstream_metadata`)을 반환. re-check의 존재를 절대 알지 못함.
   - `PublishSinkAdapter` — `capabilities`, `canAccept(item) -> Acceptance`, `publish(item, ctx) -> PublishReceipt`, `unpublish(ref, ctx) -> PublishReceipt`. `unpublish`는 first-class(brief §3 uc4). `PublishableItem`(re-check됨, curator-approved, versioned, `boundary=public`, provenance 부착)만 소비.
2. **public-safe re-check는 core 단계이지, 절대 adapter에 있지 않다**(load-bearing; CAW-02의 `kr.boundary`에 대응하는 CAW-04 아날로그, 독립 복사본). 파이프라인은 `import → re-check → curator gate → version → publish`다. re-check는 [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md) gate의 import 시점 강제다: provenance 존재, **재계산된** `boundary_eff == public`(fail-closed: 해결 불가능한 조상 ⇒ confidential), visibility가 private-derived 아님, rendered public view에 대한 redaction/leak scan, claim/source 분리, schema 적합성. 결과는 typed `RecheckVerdict { decision: publish|quarantine|reject, findings[], boundary, evidence_ref }`다. **Deny-by-default:** public-safe로 긍정적으로 확인되지 않은 것은 무엇이든 publish되지 않는다. 실패한 re-check는 upstream이 public-safe로 표시했더라도 항목을 막는다. 그것을 우회하는 **raw import 경로는 없다** — agent와 사람이 같은 검사를 사용한다.
3. **Capability descriptor + preflight.** 각 adapter는 `AdapterCapabilities`(`port`, `id`, `version`, `provides`/`accepts`, `features`, `requiresConfig`, `requiresPublicSafe: true` — 자가-비활성화 불가, `maturity`)를 지닌다. 어떤 I/O 전에든 core는 활성 adapter를 resolve하고, descriptor를 읽고, wiring을 검증한다(sink가 파이프라인이 방출하는 것을 `accepts`하는지; source가 content model이 필요로 하는 것을 `provides`하는지; 필요한 config/auth가 존재하는지; **어떤 `active` adapter도 `stub`이 아닌지**). 실패는 publish 도중이 아니라 여기서 실행 가능한 메시지로 보고된다.
4. **Config-driven registry — wiring이 바뀌는 유일한 장소.** `caw04.config.yaml`은 port당 한 블록을 가진다; adapter는 등록되며(절대 하드코딩 아님), `active` 리스트로 선택되고; source는 **fan-in**(여러 source)을 허용한다. Secret은 **env ref만**(공유 기반 없음). `profiles.recheck`(임계값 / 패턴 리스트)는 어떤 adapter가 아니라 core에 산다; registry는 adapter가 re-check, human gate, 또는 boundary 정책을 override하도록 절대 허용할 수 없다.
5. **v1의 문서화된 stub**(brief §8). 미래 adapter는 다음으로 출하된다: 실제 인터페이스, `NotImplemented` 본문, `maturity="stub"`을 가진 descriptor, 그리고 config 예시 — 등록되고 discoverable하지만 **기본적으로 config-disabled**; preflight는 `active`인 `stub` 실행을 거부하고 구현할 파일을 가리킨다. 필요한 stub: source `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`; sink `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter`. v1 구체 adapter: `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`, `SiteAndApiSinkAdapter`(+ sink로서의 MCP view, [ADR-0007](./ADR-0007-api-design_ko.md)).

## Consequences

- **쉬운 점:** adapter 하나 + config 블록 하나를 작성해 source/sink 추가; seam test(새 통합이 adapter 파일 하나 + config 블록 하나만 건드림)가 regression 검사다. core는 fake만으로 테스트 가능.
- **쉬운 점:** leak surface가 하나의 core 단계다. negative-heavy 테스트 스위트(upstream이 public-safe로 표시했지만 confidential 패턴을 지닌 항목은 **막히고 + 격리되어야 함**, 발견 사항 로깅됨)가 brief §11 guardrail을 보호한다.
- **어려운 점 / 비용:** CAW-04가 일부 boundary 로직을 로컬에서 재구현(의도적 — 재사용보다 독립성). 패턴 리스트는 공유 의존성 **없이** 유지되고 CAW-02와 교리적으로 정렬되어야 한다.
- **어려운 점:** CAW-02 + CAW-03의 fan-in은 dedup/precedence + provenance 보존 merge 규칙이 필요(open question).
- **후속 작업:** [ADR-0005](./ADR-0005-storage-and-versioning_ko.md)가 re-check된 항목이 도착 + freeze되는 곳을 정의; [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md)이 이 re-check가 강제하는 gate 규칙을 소유; `SiteAndApiSinkAdapter`는 [ADR-0006](./ADR-0006-web-stack_ko.md) + [ADR-0007](./ADR-0007-api-design_ko.md)으로 실현됨.

## Open questions / revisit triggers

- TODO(open-question: 정확한 public-safe re-check rule set + `profiles.recheck`에서 임계값이 사는 곳; 공유 기반이 되지 않으면서 CAW-02의 boundary와 얼마나 정렬되는가). [ADR-0003](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md)과 공동으로 비준됨.
- TODO(open-question: 두 source adapter가 같은 논리적 항목을 surface할 때 dedup/precedence + provenance merge).
- TODO(open-question: import가 **pull**(CAW-04가 `discover()`를 poll)인가 vs **push**(upstream이 알림)인가 — 현재 draft는 pull-only; source port에 영향).
- TODO(open-question: adapter discovery 메커니즘 — built-in registry만 vs entry-point/manifest — 그리고 adapter↔port SemVer/compat 정책).
- TODO(open-question: upstream이 source 항목을 재검증하거나 **철회(retract)**할 때, CAW-04는 어떻게 알고 gate를 재실행하는가 — provenance ref가 liveness/revocation 검사를 포함하는가). [ADR-0005](./ADR-0005-storage-and-versioning_ko.md)의 unpublish와 연결.
- **Revisit trigger:** 새 source/sink가 core 편집을 강제한다면, 계약이 누출되는 것이다 — 이 ADR을 다시 연다.

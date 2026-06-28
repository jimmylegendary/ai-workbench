# 범위 & 비목표(Non-Goals) — CAW-03 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision_ko.md](./vision_ko.md), [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md), [../01-decisions/ADR-0005-ports-and-adapters_ko.md](../01-decisions/ADR-0005-ports-and-adapters_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

**CAW-03 v1**을 둘러싼 명확한 경계로, 이것이 PaperOrchestra 위의 얇은 거버넌스 harness로 유지되고, 재구현된 논문 파이프라인이나 성급한 통합 프로젝트가 되지 않도록 한다.

## 범위 내 (v1)

| Area | v1 commitment |
| --- | --- |
| Harness core | governed operation의 op-manifest; 하나의 core, 얇은 surface ([ADR-0001](../01-decisions/ADR-0001-product-surface_ko.md)) |
| Writing engine | v1 `WritingEngineAdapter`로 **PaperOrchestra**를 wrap (subprocess) ([ADR-0002](../01-decisions/ADR-0002-writing-engine-integration_ko.md)) |
| Evidence gate + claim ledger | imported CAW-02 ledger 위의 type별 구성 가능한 gate; generated-text-never-evidence ([ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md)) |
| Input assembly | gated claim + CAW-01 result ref로부터 engine-neutral input 구축 |
| Patent path | `PatentEngine` port + v1 baseline adapter + patent-first interlock ([ADR-0004](../01-decisions/ADR-0004-patent-drafting_ko.md)) |
| Ports & adapters | 5개 port + config registry + capability preflight + **documented stub** ([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters_ko.md)) |
| Novelty + paper ladder | harness-decides-novelty; citation_pool + CAW-05 import 재사용; P1/P2/P3 ([ADR-0006](../01-decisions/ADR-0006-paper-ladder-and-novelty_ko.md)) |
| Confidentiality | CAW-02 boundary×visibility 상속; public-safe export ([ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md)) |
| Surfaces | API + MCP + CLI + 최소한의 review/status UI |
| Data | CAW-03 자체 거버넌스 데이터(file/SQLite); CAW-01/02는 id/URI로 참조 |

## 범위 밖 / 명시적 비목표 (v1)

- **writing 파이프라인 재구축** — outline/plots/lit-review/section-writing/refinement은 PaperOrchestra에 남는다.
- **internal wiki / experiment-server connector 구현** — **port + documented stub만** 정의한다.
- **자율 venue submission 또는 patent filing** — 사람(특허의 경우 counsel)의 gate가 필수이다.
- **knowledge repository(CAW-02) 또는 simulation run(CAW-01) 소유** — 참조할 뿐 절대 복제하지 않는다.
- **논문 prior-art 재조회** — PaperOrchestra의 Semantic-Scholar로 검증된 `citation_pool`을 재사용한다.
- **법적 판단** — patentability/eligibility는 사람/counsel에게 플래그할 뿐, harness가 결정하지 않는다.
- **전체 포트폴리오 자동화** — v1은 P1/P2/P3 ladder를 추적한다; 무엇을 언제 작성하고 filing할지는 Jimmy가 결정한다.

## 보류하되 seam은 예상함

다음은 v1에서 만들지 **않지만** port가 이를 배제해서는 안 된다: internal wiki source+sink, experiment-server source, live prior-art/patent search adapter, venue-submission 및 patent-filing sink, 대체 writing engine. 각각은 stub adapter(interface + not-implemented 마커 + config 예시)로 출시된다.

## 가드레일 (상속됨)

- public-facing 출력에 confidential 데이터 금지; public 출력은 public-safe source에서만.
- public-source 연구를 internal Samsung/SAIT claim과 절대 혼동하지 말 것.
- generated summary는 evidence가 아니다; source/claim/evidence/conclusion을 분리해 유지.

## 미해결 질문

Jurisdiction & patent-first 기본값, claim-typing 자동 대 사람, PaperOrchestra 버전 pinning — [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

## runbook에 대한 함의

각 비목표는 해당 runbook에서 "만들지 말 것 / stub만" 가드가 된다; 범위 내 표는 v1 완성도 체크리스트이다.

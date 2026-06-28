# 비전 — Paper & Patent Writing Harness (CAW-03)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [scope-and-non-goals_ko.md](./scope-and-non-goals_ko.md), [personas-and-use-cases_ko.md](./personas-and-use-cases_ko.md), [../05-harness-core/overview_ko.md](../05-harness-core/overview_ko.md), [../01-decisions/ADR-0002-writing-engine-integration_ko.md](../01-decisions/ADR-0002-writing-engine-integration_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

**CAW-03**의 북극성(north star): 검증된 claim과 evidence를 **논문과 특허**로 변환하는 evidence-gated **harness**로, 기존 writing engine를 *감싸고(wrapping)* 그 engine에 없는 거버넌스를 더한다. 이 문서는 제품이 *왜* 존재하는지, 그리고 첫 번째 신뢰할 만한 버전이 무엇을 입증하는지를 기술한다. 스키마나 빌드 단계를 명시하지는 **않는다**.

## 명제: 논문 작성 챗봇이 아니라 harness

어려운 "논문 작성" 작업은 이미 **PaperOrchestra**로 존재한다(outline → plots → Semantic-Scholar로 검증된 literature review → section writing → refinement → autoraters → PDF). CAW-03는 이를 다시 만들지 **않는다**. 대신 그 주위를 둘러싸는 **거버넌스 harness**이다:

> evidence로 뒷받침되는 claim만 draft에 들어갈 수 있고, 결과는 실제 run으로 추적되며, 기밀성이 강제되고, 특허는 자체 경로를 갖고, 프로그램의 논문 포트폴리오가 계획되고 gating된다.

CAW-03는 **trust ladder(신뢰 사다리)의 최상단**에 위치한다 — 신뢰할 만하고 evidence로 뒷받침되는 입력을 소비하며, trust ladder를 성급하게 끌고 가지 않는다([CAW-01](../../../caw-01-simulation-control-plane/)이 신뢰할 만한 projection을 1개 이상 산출할 때까지 보류).

## 가치의 단위

하나의 **governed artifact(거버넌스된 산출물)**:

```
gated claim set  →  assembled engine inputs  →  draft (engine)  →  review  →  (paper PDF | patent draft)
```

이때 provenance(출처)가 처음부터 끝까지 보존된다(draft된 모든 수치/figure는 CAW-01 result와 CAW-02 claim+evidence로 역추적된다).

## CAW-03가 engine 위에 더하는 것 (거버넌스 delta)

| Capability | Source |
| --- | --- |
| Evidence gate + claim ledger (P1/P2/P3 타이핑) | new (imported [CAW-02](../../../caw-02-knowledge-repository/) ledger 위에) |
| Patent drafting 경로 + patent-first interlock | new (별도 `PatentEngine` port) |
| Novelty / claim-boundary + paper ladder | new (+ CAW-05 radar import) |
| Confidentiality filter (public-safe / counsel) | CAW-02 boundary 의미론을 상속 |
| Drafting / plots / lit-review / refinement / PDF | **PaperOrchestra** (wrapped, swappable) |

## 설계상 개방형 통합

CAW-03는 **ports & adapters**로 구축된다([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters_ko.md)). 입력, writing engine, 특허, novelty 신호, publish 대상은 모두 typed port 뒤의 adapter이다. v1은 CAW-01/CAW-02(source), PaperOrchestra(engine), LaTeX/PDF(sink), CAW-05(novelty)를 연결한다. 향후 connector — **internal wiki**, **internal experiment-server**, venue submission, patent filing — 는 **documented stub**로 출시되므로, 나중에 실제 connector를 연결하려면 core를 바꾸는 게 아니라 adapter 하나를 채우면 된다.

## 첫 번째 vertical slice (Milestone 1)

가장 작은 신뢰할 만한 것: **evidence-gated 논문 하나**를 처음부터 끝까지 산출 —
CAW-02 claim+evidence 번들 + CAW-01 results를 import → claim을 gate → engine inputs 조립 → PaperOrchestra로 draft → review → PDF 방출 — provenance와 confidentiality filter를 적용한 상태로. 특허와 향후 connector stub은 그 다음이다.

## 설계 성향

워크벤치의 나머지와 마찬가지로: **챗봇이 아니라 control-plane 느낌** — gate 상태, blocked claim, novelty/특허 플래그, review/score, 그리고 다음의 정직한 액션을 보여준다.

## 미해결 질문

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적한다(특히 PaperOrchestra의 비대화형 호출과 jurisdiction/patent-first 기본값).

## runbook에 대한 함의

Milestone 1은 첫 번째 runbook 시퀀스(ports → adapters → gate → assembly → engine → review → PDF)의 acceptance chain이다.

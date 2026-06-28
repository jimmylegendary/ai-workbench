# 시스템 아키텍처 — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries_ko.md](./component-boundaries_ko.md), [data-flow_ko.md](./data-flow_ko.md), [../05-harness-core/ports-and-adapters_ko.md](../05-harness-core/ports-and-adapters_ko.md), [../01-decisions/ADR-0005-ports-and-adapters_ko.md](../01-decisions/ADR-0005-ports-and-adapters_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

컨테이너 뷰: harness core, 다섯 개의 port와 adapter registry, v1 adapter들과 향후 stub들, 그리고
단방향 의존성 규칙을 다룬다. 모듈 시그니처는 [component-boundaries_ko.md](./component-boundaries_ko.md)에 있다.

## 단방향 의존성 규칙

```
surfaces (API/MCP/CLI/UI)  →  harness core (op-manifest + governance)  →  PORTS  →  adapters
```

core는 port에만 의존한다. adapter는 **governance를 약화시킬 수 없다**(gate는 core에서, adapter 호출 전/주변에서 실행된다).
CAW-01/CAW-02/CAW-05에는 오직 adapter를 통해서만 도달한다([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters_ko.md)).

## 컨테이너 다이어그램

```
┌───────────────────────────────────────────────────────────────────────┐
│  SURFACES (thin):  API   ·   MCP   ·   CLI   ·   review/status UI        │
└───────────────────────────────┬───────────────────────────────────────┘
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│  HARNESS CORE  (op-manifest of governed ops)                            │
│   Import/Ledger · Gate · Assembly · Draft-orchestration · Patent ·      │
│   Novelty/Ladder · Review · Publish        + Adapter Registry/Preflight │
│   + governance store (claim refs, artifacts, ladder, manifest, config)  │
└───┬───────────────┬───────────────┬───────────────┬───────────────┬────┘
    ▼ Source        ▼ WritingEngine ▼ PatentEngine  ▼ Sink/Publish   ▼ Novelty/Radar
 ┌─────────┐    ┌──────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
 │CAW-02   │    │PaperOrchestra│  │patent v1   │  │LaTeX / PDF │  │CAW-05 radar│
 │CAW-01   │    │ (subprocess) │  │ adapter    │  │            │  │+citation_pool
 │(v1)     │    └──────────────┘  └────────────┘  └────────────┘  └────────────┘
 │stubs:   │    stubs: other       stubs: ext      stubs: wiki      stubs: live
 │ wiki,   │     engines           patent tools    publish, venue   prior-art
 │ exp-srv │                                       submission,      search
 └─────────┘                                       patent filing
```

## 컨테이너

| Container | 책임 |
| --- | --- |
| **Surfaces** | 표현/전송 계층만 담당; op-manifest op으로 매핑; human-gate op은 확인을 요구한다. |
| **Harness core** | 모든 governed 로직: gate, assembly, orchestration, patent path, novelty/ladder, review, publish, 기밀성(confidentiality). governance store와 adapter registry를 소유한다. |
| **SourceAdapter(s)** | claim+evidence 번들과 result ref를 제공한다. v1: CAW-02, CAW-01. Stubs: 내부 wiki, experiment-server. |
| **WritingEngineAdapter** | 논문 작성. v1: PaperOrchestra(CAW-03 workspace 위에서 동작하는 subprocess). 교체 가능. |
| **PatentEngineAdapter** | 특허 작성(별도 path). v1 baseline adapter. |
| **Sink/PublishAdapter** | 출력물. v1: LaTeX/PDF 파일. Stubs: wiki publish, venue submission, patent filing. |
| **Novelty/RadarAdapter** | 관련 연구(related-work) + 위협 신호. v1: citation_pool 재사용 + CAW-05 import. Stubs: live prior-art search. |

## TS ⇆ engine 경계(seam)

PaperOrchestra는 CAW-03가 소유한 workspace 위에서 **subprocess**로 실행된다. core는 engine-neutral한 입력
번들을 전달하고 그 출력물(LaTeX/PDF/BibTeX/scores)과 provenance(figure_id ↔ result_id)를 수집한다
([../05-harness-core/writing-engine-adapter-paperorchestra_ko.md](../05-harness-core/writing-engine-adapter-paperorchestra_ko.md)).

## 횡단 관심사(Cross-cutting)

- **adapter보다 먼저 실행되는 governance:** gate([ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md))와 patent-first interlock([ADR-0004](../01-decisions/ADR-0004-patent-drafting_ko.md))는 core에서 실행되므로 어떤 adapter도 이를 우회할 수 없다.
- **기밀성(Confidentiality):** CAW-02에서 상속한 boundary×visibility를 import 시점과 export 시점에 적용한다([ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md)).
- **Provenance:** 작성된 모든 artifact는 자신의 gated claim과 CAW-01 result를 id/URI로 참조한다.

## 미해결 질문(Open questions)

PaperOrchestra의 non-interactive entrypoint(subprocess 모드에서 그 LLM/web/vision 단계를 누가 실행하는가) —
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북에 대한 함의

Phase-0에서는 core + ports + registry(fake 포함)를 구축한다. 이후 단계에서 v1 adapter들과 문서화된 stub들을 추가한다.

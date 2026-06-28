# PRODUCT BRIEF — Paper & Patent Writing Harness (CAW-03)

> **CAW-03**의 단일 진실 공급원. 모든 디자인 문서 + runbook은 이 brief와 일관성을 유지해야 한다.
> 어떤 문서가 brief와 모순되면 brief가 우선한다. 내부 사실을 날조하지 말 것; 미지의 것은
> `08-research-plan/open-questions.md`에 기록할 것.

## 0. 단 하나의 엄격한 제약
우리는 여기서 제품을 빌드하지 않는다. 우리는 AI 빌더가 실행할 상세한 설계 + 빌드 지침(runbook)을 작성한다 —
구체적인 기능, 방법론, 명명된 도구, 그리고 도구별 runbook. 코드는 빌더가 작성한다.

## 1. 정체성 & 독립성
- **제품:** Paper & Patent Writing Harness (CAW-03).
- **한 줄 설명:** 검증된 claim, evidence, 시뮬레이션 결과, artifact를 **논문과 특허**로 바꾸는 evidence-gated
  **harness**(자유 형식의 "논문 써줘" 챗봇이 아님)이며, **플러그 가능한 writing engine을 wrap**하고 그 엔진이
  제공하지 않는 거버넌스를 추가한다.
- `ai-workbench` 6개 제품군 안의 **독립적이고 standalone한 제품**. 자체 core, data, deploy를 가진다. **공유 런타임
  기반이 없다.** 모든 인바운드/아웃바운드 데이터는 명시적인 **import/export boundary**와 **adapter**를 거친다.
- **위치:** trust ladder(신뢰 사다리)의 최상단에 위치한다 — 신뢰성 있고 evidence로 뒷받침되는 입력을 소비하며,
  trust ladder를 성급하게 추동하지 않는다. (CAW-01이 ≥1개의 신뢰성 있는 projection을 생산할 때까지 보류.)

## 2. wrap: PaperOrchestra가 writing engine이다 (재구현하지 말 것)
무거운 "논문 쓰기" 작업은 **PaperOrchestra**(기존의 5-agent 파이프라인:
outline → plotting → literature-review (Semantic Scholar로 검증된 BibTeX + Intro/Related Work) →
section-writing → content-refinement, 더불어 paper-autoraters와 agent-research-aggregator)에 위임된다.
- PaperOrchestra는 **WritingEngine port**(adapter) 뒤에 위치한다. 기본 엔진이지만 **교체 가능**하다.
- CAW-03은 drafting/plotting/lit-review/refinement 파이프라인을 재설계하거나 재구현하지 않는다. CAW-03은
  엔진의 입력을 준비하고, draft에 무엇이 들어올 수 있는지를 거버닝하며, 특허를 처리하고, 출력을 후처리/발행한다.

## 3. 거버넌스 델타 (CAW-03이 실제로 추가하는 것)
items/03에서 PaperOrchestra가 제공하지 **않는** 모듈들:
- **Claim ledger** — claim의 권위 있는 목록으로, 각각 타입이 지정되고(P1/P2 method/tool vs P3 future-device)
  evidence에 연결된다. (CAW-02에서 import; CAW-03은 knowledge repo를 재소유하지 않는다.)
- **Evidence completeness gate** — claim이 논문/특허 draft에 들어오기 전에 통과해야 하는 최소 **evidence gate**.
  evidence가 불충분하거나 없는 claim은 draft될 수 없다. 생성된 텍스트는 결코 evidence가 아니다.
- **Novelty / claim-boundary checker** — novel 대 threatened (related-work + CAW-05 radar 신호 사용);
  어떤 claim이 발행 전에 **patent-first handling**이 필요한지.
- **Result registry reference + figure/table manifest** — 시뮬레이터 결과(CAW-01에서)를 엔진이 렌더링할
  figure/table에 연결; CAW-03은 registry를 참조할 뿐, run을 소유하지 않는다.
- **Patent drafting module** — 논문 drafting과 분리된 별도 경로: claim, prior-art search, patentability,
  patent-first gating. (PaperOrchestra는 논문 전용이다.)
- **Paper ladder (P1/P2/P3) + portfolio** — 프로그램 논문 시퀀스와 논문별 readiness gate를 계획/추적.
- **Confidentiality filter** — public-source-assisted 대 internal-review-required; 내부 Samsung/SAIT를 결코 누출하지 않음.
- **Review checklist** — "submission-ready" 전의 gate.

## 4. 입력 & 출력 (import/export boundary)
- **CAW-02에서 import:** 인용된 **claim + evidence 번들** (drafting을 위한 주된 진실 공급원).
- **CAW-01에서 import:** **run evidence / projection / result registry ref** → figure/table/result.
- **엔진 입력을 빌드하는 adapter:** CAW-03은 PaperOrchestra의 입력(idea.md, experimental_log.md,
  template.tex, conference_guidelines.md, figures)을 손으로 쓴 파일이 아니라 **import된 번들로부터** 조립한다.
  (이는 PaperOrchestra의 `agent-research-aggregator`의 "흩어진 로그 → 입력"을 "workbench → 입력"으로 일반화한 것이다.)
- **Export / publish:** LaTeX + 컴파일된 PDF (논문); 특허 draft 문서; review/score 보고서.

## 5. 열린 통합 인터페이스 (필수 설계 속성 — seam을 열어둘 것, 아직 connector를 빌드하지 말 것)
CAW-03은 미래 통합이 재설계 없이 plug-in될 수 있도록 **ports & adapters**로, 일반화되고
**config-driven/customizable**하게 설계되어야 한다. 지금은 port를 정의하고, v1 adapter만 구현한다.

| Port | v1 adapter (구현됨) | 미래 adapter (v1에서는 PORT만 — seam을 설계하고 stub) |
| --- | --- | --- |
| **SourceAdapter** (claim/evidence/result가 어디서 오는가) | CAW-02 번들 import, CAW-01 result import | **내부 company wiki**, **내부 experiment-server infra**, 흩어진 agent log, 임의의 사용자 제공 번들 |
| **WritingEngineAdapter** (drafting) | PaperOrchestra | 다른 writing engine |
| **PatentEngineAdapter** (특허 drafting) | v1 baseline 특허 drafter | 외부 특허 도구 |
| **Sink/PublishAdapter** (출력이 어디로 가는가) | LaTeX/PDF 파일 | **내부 wiki publish**, venue/conference 제출, 특허 출원 시스템 |
| **Novelty/RadarAdapter** (related-work + threat 신호) | related-work tracker; CAW-05 import | 라이브 prior-art/특허 검색 서비스 |

seam에 대한 설계 규칙:
- 각 port는 **capability/config descriptor**를 가진 typed interface다; adapter는 **registered**되고
  하드코딩이 아니라 config로 선택된다.
- "미래" adapter는 **문서화된 stub**(interface + not-implemented 마커 + config 예시)으로 출하되어, 나중에
  실제 connector를 연결하는 것이 core를 바꾸는 것이 아니라 하나의 adapter를 채우는 일이 되도록 한다.
- core/harness 로직은 오직 port에만 의존하며, 결코 구체적인 adapter에 의존하지 않는다 (CAW-01/02/wiki/exp-server는
  모두 동일한 SourceAdapter 계약 뒤의 adapter일 뿐이다).

## 6. 핵심 도메인 (the heart)
- **Artifact lifecycle:** `claim(s) → evidence gate → draft (engine) → review checklist → (paper PDF | patent draft)`,
  provenance가 끝에서 끝까지 보존되고 artifact별 status/state machine을 가진다.
- **Paper 대 patent:** 공유된 front(claim/evidence 선택, novelty)를 가지되 별개의 drafting + gate를 가진다; 일부 claim은
  **patent-first**다(발행 전에 출원).
- **일반화:** harness는 engine/source/sink에 비종속적이다; PaperOrchestra + CAW-01/02 + LaTeX는 v1 wiring일 뿐이다.

## 7. 데이터 (CAW-03 자체의, 최소한의)
- CAW-03은 **claim ledger 스냅샷/ref**, **draft + artifact lifecycle/state**, **paper-ladder plan**,
  **figure/table manifest**, **review/score result**, **adapter/config registry**를 저장한다. CAW-02 claim/evidence와
  CAW-01 result는 id/URI로 참조한다(중복 저장하지 않음). 큰 artifact(PDF, trace)는 path로 참조한다.
- 저장 방향: 가볍고, file/SQLite-friendly하며, 다른 제품들과 일관성 있게(ADR에서 결정).

## 8. 내려야 할 결정 (각각 ADR을 가짐)
- 제품 surface (harness 제어: API + MCP + CLI + 최소한의 리뷰/상태 UI).
- **PaperOrchestra 통합 / WritingEngine port** (CAW-03이 어떻게 호출하는지; 입력 조립; 출력 캡처).
- **Evidence gate & claim ledger** (최소 gate; claim 타입 지정 P1/P2/P3; provenance).
- **Patent drafting module** (paper 대 patent 차이; patent-first handling).
- **Ports & adapters 아키텍처** (열린 SourceAdapter/Sink/Engine/Novelty seam; config-driven registry). ← load-bearing
- **Paper ladder & novelty 거버넌스** (P1/P2/P3 + threatened-claim handling; CAW-05 import).
- **Confidentiality / boundary** (public-safe 대 internal-review; CAW-02 boundary 의미론 재사용).
- **Artifact lifecycle & storage**.

## 9. 비목표 (v1)
- writing 파이프라인 재구현 (PaperOrchestra가 엔진이다).
- wiki / experiment-server connector 구현 (PORT만 정의 + stub).
- venue로의 자율 제출 또는 자율 특허 출원 (human gate 필요).
- knowledge repository(CAW-02)나 simulation run(CAW-01) 소유.
- 완전한 연속적 paper-portfolio 자동화; v1은 ladder를 추적하고, 결정은 Jimmy가 한다.

## 10. 가드레일 (상속됨, 모든 제품)
- public-facing 출력에 confidential한 회사 데이터를 넣지 않음; public 출력은 public-safe 소스에서만.
- public-source 연구를 내부 Samsung/SAIT claim과 결코 혼동하지 않음.
- source, claim, evidence, 생성된 결론을 분리해 유지; 생성된 요약은 evidence가 아니다.
- 광범위한 플랫폼 scaffolding보다 workflow 의미론을 입증하는 작은 vertical slice를 선호.
- 자동 생성은 proposal/draft 생성이다; 전략적 + 발행/출원 결정의 reviewer는 Jimmy다.

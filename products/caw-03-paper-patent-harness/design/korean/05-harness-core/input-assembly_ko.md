# Input Assembly — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [evidence-gate-and-claim-ledger_ko.md](./evidence-gate-and-claim-ledger_ko.md), [writing-engine-adapter-paperorchestra_ko.md](./writing-engine-adapter-paperorchestra_ko.md), [../02-research/paperorchestra-integration_ko.md](../02-research/paperorchestra-integration_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

CAW-03이 `GatedClaimSet` + CAW-01 result ref를 writing engine이 소비하는 **engine-neutral 입력 번들**로 변환하는 방법. 이는 PaperOrchestra의 `agent-research-aggregator`를 "흩어진 로그 → 입력"에서 "workbench → 입력"으로 일반화한 것이다.

## 규칙: 조립 전 gate

`GatedClaimSet`에 있는 claim만 조립될 수 있다. 조립은 gate를 거치지 않은 어떤 claim도 **거부(refuse)** 한다 ([evidence-gate-and-claim-ledger_ko.md](./evidence-gate-and-claim-ledger_ko.md)). 수치/결과는 **result-ref로 뒷받침된다**(각 figure/value는 자신의 CAW-01 `result_id`를 담는다).

## engine-neutral 입력 번들

정규화된 중간 표현(CAW-03이 이 schema를 소유)으로, 어떤 `WritingEngineAdapter`든 자신의 네이티브 입력으로 매핑할 수 있다:

```jsonc
{
  "idea": { "title": "...", "thesis": "...", "claims": [ {claim_id, type, statement, evidence_refs[]} ] },
  "experimental_log": [ { "result_id": "...(CAW-01)", "metric": "...", "value": "...", "provenance": "..." } ],
  "figures": [ { "figure_id": "...", "result_id": "...(CAW-01)", "caption": "..." } ],
  "template": "...(venue template ref)",
  "conference_guidelines": "...(venue ref)",
  "boundary": "public|internal|confidential"
}
```

PaperOrchestra adapter의 경우 이는 그 엔진의 `idea.md`, `experimental_log.md`, `template.tex`, `conference_guidelines.md`, 그리고 figures로 매핑된다 ([writing-engine-adapter-paperorchestra_ko.md](./writing-engine-adapter-paperorchestra_ko.md)).

## Confidentiality

번들은 artifact의 confidentiality track에서 구성되며, 해당 track보다 상위의 콘텐츠는 엔진이 보기 전에 제외된다 ([../04-data-layer/confidentiality-and-provenance_ko.md](../04-data-layer/confidentiality-and-provenance_ko.md)).

## Provenance

조립된 각 값은 자신의 `claim_id` + `result_id`를 유지하므로, 산출된 draft는 end-to-end로 재구성 가능하고 `FigureTableManifest`는 figure를 CAW-01 결과에 바인딩할 수 있다.

## 미해결 질문

정규화된 IdeaDoc/ExpLog schema의 정확한 형태(비-PaperOrchestra 엔진이 재사용할 수 있도록); PlotOn/PlotOff 전반에서 신뢰할 수 있는 figure_id↔result_id 바인딩 — [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## runbook에 대한 함의

assembly runbook은 engine-neutral schema + gate-before-assemble + result-ref 바인딩을 구현한다; engine adapter는 이를 PaperOrchestra 입력으로 매핑한다.

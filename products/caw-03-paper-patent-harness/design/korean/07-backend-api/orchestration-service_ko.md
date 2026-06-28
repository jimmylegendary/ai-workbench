# Orchestration Service — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../05-harness-core/writing-engine-adapter-paperorchestra.md](../05-harness-core/writing-engine-adapter-paperorchestra_ko.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle_ko.md), [api-surface.md](./api-surface_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

draft를 처음부터 끝까지 실행한다: 엔진 subprocess를 구동하고, 출력 + provenance를 캡처하며, artifact lifecycle을 진행시키고, patent-first interlock을 강제한다.

## Draft run (paper)

```
draftPaper(artifactId):
  1. load Artifact (must be `assembled`)              → else error
  2. resolve WritingEngineAdapter via registry (preflight)
  3. materialize EngineInputs into workspace/<run>/   (confidentiality track applied)
  4. adapter.draft(inputs, workspace)                 → subprocess (PaperOrchestra)
  5. capture DraftResult (LaTeX/PDF/BibTeX/scores) + provenance (figure_id↔result_id)
  6. persist EngineRun + FigureTableManifest; Artifact → `drafted`
```

## Draft run (patent)

`PatentEngineAdapter`를 통해 동일한 형태로 진행된다; Artifact는 patent tail로 분기하며, patent에 민감한 claim에 대해 `InterlockState`를 설정한다 ([../05-harness-core/patent-drafting-module.md](../05-harness-core/patent-drafting-module_ko.md)).

## Interlock enforcement

`publish`는 artifact의 `GatedClaimSet`에 있는 모든 claim을 확인한다; 하나라도 `InterlockState=held`이면 사유와 함께 **거부(deny)**한다.

## Failure & retry

실패한 subprocess는 artifact를 `drafting`→`failed` 상태로 남긴다; retry는 새로운 `EngineRun`을 생성한다 (run별 출력은 불변). `workspace/<run>/`는 성공 시 정리된다.

## Sync vs async

장시간 엔진 실행은 blocking call이 아니라 **job-handle/poll** contract가 필요할 수 있다 — TODO(open-question), WritingEngine port signature에 영향을 준다.

## Open questions

PaperOrchestra의 non-interactive 실행 (그 LLM/web/vision 단계를 누가 실행하는가); job-handle vs sync — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## Implications for runbooks

orchestration runbook은 엔진 adapter를 둘러싼 run lifecycle, 캡처, provenance, interlock enforcement를 구현한다.

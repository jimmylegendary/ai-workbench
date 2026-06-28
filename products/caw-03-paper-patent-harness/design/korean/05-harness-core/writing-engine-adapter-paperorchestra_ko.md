# WritingEngine Adapter — PaperOrchestra — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [input-assembly.md](./input-assembly_ko.md), [ports-and-adapters.md](./ports-and-adapters_ko.md), [../02-research/paperorchestra-integration.md](../02-research/paperorchestra-integration_ko.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

`WritingEngineAdapter` port와 그 v1 구현체인 **PaperOrchestra**를 subprocess 모드로 호출합니다. CAW-03은
파이프라인을 다시 만들지 않습니다. 입력을 공급하고 출력 및 provenance(출처)를 포착할 뿐입니다.

## port

```ts
interface WritingEngineAdapter {
  capabilities(): EngineDescriptor      // name, version, input/output schema, modes
  draft(inputs: EngineInputs, workspace: Path): DraftResult
}
type DraftResult = { latexPath, pdfPath, bibPath, scores, provenance: FigureResultMap }
```

core는 오직 이 port에만 의존하며, PaperOrchestra는 다른 엔진으로 교체할 수 있습니다.

## PaperOrchestra v1 adapter

- **호출:** CAW-03이 소유하는 `workspace/`를 대상으로 한 subprocess(엔진이 입력을 읽고 그곳에 산출물을 기록).
- **입력 매핑:** 엔진 중립적 번들 → PaperOrchestra 입력(`idea.md`, `experimental_log.md`,
  `template.tex`, `conference_guidelines.md`, figures) — [input-assembly.md](./input-assembly_ko.md) 참조.
- **사용하는 파이프라인:** PaperOrchestra의 outline → plotting → literature-review (Semantic Scholar) → section-writing →
  content-refinement, + paper-autoraters (scores). CAW-03은 이를 port 뒤의 블랙박스로 취급합니다.
- **출력 포착:** LaTeX, PDF, BibTeX, autorater scores → `EngineRun` + `Artifact.output_ref`로 기록.
- **Provenance:** PaperOrchestra의 `figure_id`를 포착하여 CAW-01의 `result_id`(FigureTableManifest)에 바인딩.
- **citation_pool 재사용:** PaperOrchestra의 Semantic-Scholar 검증 `citation_pool.json`은 novelty에서 재사용되며
  ([paper-ladder-and-novelty.md](./paper-ladder-and-novelty_ko.md)) 재조회하지 않습니다.

## 버전 고정(Version pinning)

`EngineDescriptor.version`은 PaperOrchestra 모음과 그 `outline.json`/`citation_pool.json` 스키마를 고정합니다.
registry preflight는 호환되지 않는 엔진을 거부합니다.

## 기밀성(Confidentiality)

adapter는 항상 해당 artifact의 confidentiality track에 있는 번들만 받습니다. 중간 엔진 산출물
(outline.json 등)은 `workspace/`에서 그 track을 상속합니다.

## 미해결 질문(Open questions)

PaperOrchestra의 비대화형 entrypoint(누가 그 LLM/web/vision 단계를 headless로 실행하는가), 중간 산출물이
저장 전에 confidentiality 필터를 거쳐야 하는지 여부 — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의

engine-adapter 런북은 subprocess 호출, 입력 매핑, 출력+provenance 포착, version-pin preflight를 구현합니다.
PaperOrchestra 자체는 수정하지 않습니다.

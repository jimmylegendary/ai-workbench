# RB-020: PaperOrchestra WritingEngine 어댑터

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-012, RB-002]
- Implements design: [../../05-harness-core/writing-engine-adapter-paperorchestra_ko.md](../../05-harness-core/writing-engine-adapter-paperorchestra_ko.md), [../../01-decisions/ADR-0002-writing-engine-integration_ko.md](../../01-decisions/ADR-0002-writing-engine-integration_ko.md)
- Produces: WritingEngineAdapter port 뒤에 위치하는 `adapters/writing-engine/v1/paperorchestra`

## 목표

PaperOrchestra를 v1 `WritingEngineAdapter`로 감싸고, `workspace/`를 대상으로 **subprocess** 모드에서 호출하며,
engine-neutral 번들을 PaperOrchestra 입력으로 매핑하고 출력 + provenance(출처 정보)를 포착한다. **PaperOrchestra를 수정하지 말 것.**

## 사전 조건
- [ ] RB-012 (engine-neutral 입력), RB-002 (ports/registry). OQ-01 (비대화형 entrypoint) + OQ-02 (버전 고정)를 해결한다.

## 단계
1. **Do:** 어댑터의 `capabilities()`를 구현한다 (EngineDescriptor: 고정된 PaperOrchestra 버전 + 스키마).
   **Verify:** `test:` registry preflight가 버전을 고정/검증한다.
2. **Do:** engine-neutral 번들 → PaperOrchestra 입력(`idea.md`, `experimental_log.md`, `template.tex`, `conference_guidelines.md`, figures)을 `workspace/<run>/`로 매핑한다.
   **Verify:** `test:` 매핑이 fixture에 대해 기대되는 PO 입력 파일을 생성한다.
3. **Do:** PaperOrchestra를 subprocess로 호출한다 (해석된 entrypoint); `latex/pdf/bib/scores`를 포착한다.
   **Verify:** `cmd:` fixture 실행이 PDF + scores를 생성한다 (또는 CI에서 mocking된 PO).
4. **Do:** provenance를 포착한다: PO `figure_id` → CAW-01 `result_id`를 FigureTableManifest에 바인딩한다.
   **Verify:** `test:` T6 — figure_id↔result_id가 왕복(round-trip)된다.

## 수용 기준
- [ ] PaperOrchestra가 어댑터(subprocess)를 통해 실행되고, 출력 + scores가 포착된다.
- [ ] 버전이 preflight를 통해 고정되고, provenance manifest가 구축되며, PaperOrchestra는 수정되지 않는다.

## 롤백 / 안전성
어댑터만 해당하므로 revert로 롤백한다. PO는 블랙박스이므로 절대 fork하지 않는다.

## 인계(Hand-off)
RB-021이 이 어댑터를 중심으로 전체 draft 실행 + lifecycle을 오케스트레이션한다.

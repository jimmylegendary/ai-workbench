# 데이터 흐름(Data Flow) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture_ko.md), [../05-harness-core/input-assembly.md](../05-harness-core/input-assembly_ko.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle_ko.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

harness를 관통하는 종단 간(end-to-end) 흐름: paper 초안 작성, patent 분기, 그리고 patent-first interlock. 저장소(storage)는 `04-*`에서 다루며, engine 이음매(seam)는 `05-harness-core/writing-engine-adapter-paperorchestra.md`에서 다룬다.

## Flow A — evidence-gated paper

```
SourceAdapter(CAW-02 bundle + CAW-01 results)
  │ import_bundle
  ▼
build_ledger  → ClaimLedger (refs to CAW-02; never re-owned)
  │ gate_claims(profile)             ← GATE in core: P1/P2/P3 thresholds; generated text != evidence; FAIL-CLOSED
  ▼
GatedClaimSet ── blocked claims → backlog
  │ assemble_inputs                  ← gate-before-assemble; numbers result-ref-backed
  ▼
EngineInputs (engine-neutral: idea/experimental_log/template/figures)
  │ draft_paper → WritingEngineAdapter = PaperOrchestra (subprocess over CAW-03 workspace)
  ▼
DraftResult (LaTeX/PDF/BibTeX/scores) + provenance (figure_id ↔ result_id)
  │ review (checklist) → publish(sinkRef)   ← confidentiality filter + patent-first interlock
  ▼
PublishOutcome (PDF / wiki / submission)   (v1 sink: LaTeX/PDF)
```

## Flow B — patent 분기

```
GatedClaimSet (same front as Flow A)
  │ draft_patent → PatentEngineAdapter (NOT PaperOrchestra)
  ▼
PatentDraft (claims/spec/prior-art) — counsel confidentiality tier
  │ review → human/counsel filing gate (no autonomous filing)
```

## Flow C — patent-first interlock

```
run_novelty → NoveltyFindings → mark claim patent-sensitive
  ▼
publish(paper containing that claim)  → DEFAULT-DENY
  ▼
cleared only after the patent gate releases the interlock
```

## 거버넌스는 core에 있다

gate, interlock, confidentiality는 adapter 호출을 **감싸며** core 서비스에서 실행된다. adapter는 이를 우회할 수 없다([component-boundaries.md](./component-boundaries_ko.md)).

## 출처 추적(Provenance)

초안에 작성된 모든 수치/figure는 CAW-01 result와 CAW-02 claim+evidence로의 역참조(back-reference)를 갖는다. artifact는 자신의 `GatedClaimSet`과 engine 실행을 기록한다.

## 미해결 질문(Open questions)

PaperOrchestra의 PlotOn/PlotOff 모드 전반에서 figure_id ↔ result_id를 신뢰성 있게 바인딩하는 문제; 동기 vs 비동기 engine 실행 — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북에 대한 함의(Implications for runbooks)

Flow A는 Milestone-1 체인이며, Flow B/C는 patent + interlock 런북을 이끈다.

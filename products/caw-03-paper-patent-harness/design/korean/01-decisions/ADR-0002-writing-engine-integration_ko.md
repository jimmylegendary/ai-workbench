# ADR-0002: Writing-engine 통합 — swap 가능한 WritingEngine port 뒤의 PaperOrchestra

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth; §2 래핑, §4 입력 조립)
  - [../02-research/paperorchestra-integration.md](../02-research/paperorchestra-integration_ko.md) (pipeline, I/O contract, 입력 조립 매핑)
  - [ADR-0001-product-surface.md](ADR-0001-product-surface_ko.md) (`draft` op)
  - [ADR-0003-evidence-gate-and-claim-ledger.md](ADR-0003-evidence-gate-and-claim-ledger_ko.md) (gate는 조립 *전에* 실행됨)
  - [ADR-0005-ports-and-adapters.md](ADR-0005-ports-and-adapters_ko.md) (이것이 구현하는 port + registry)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle_ko.md) (`drafting` 상태가 `adapter_id`+`engine_version`을 기록)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
**CAW-03이 기본 writing engine으로서 PaperOrchestra(PO)를 재구축하지 않고 어떻게 구동하는지**를, 타입이 지정되고 swap 가능한 `WritingEngineAdapter` port 뒤에서 결정한다: 호출 메커니즘, PO의 `(I, E, T, G, F)` 입력을 **import된 governed bundle로부터**(직접 작성한 파일이 아니라) 구축하는 입력 조립, 그리고 출력 캡처 + provenance 이어받기. evidence gate 규칙(ADR-0003), patent 경로(PatentEngine은 별도 port), publish/sink, registry 메커닉(ADR-0005)은 결정하지 **않는다** — 이들을 소비한다. PO 내부(프롬프트, autorater rubric)는 블랙박스다; 우리는 그 I/O를 제약할 뿐 구현은 제약하지 않는다(브리프 §2: 재구축하지 말 것).

## Context
- 브리프(§2)는 무거운 drafting 작업을 **PaperOrchestra**로 고정한다(5-에이전트 파이프라인: outline → plotting → literature-review(Semantic Scholar 검증 BibTeX + Intro/Related Work) → section-writing → content-refinement, 더해 paper-autoraters와 agent-research-aggregator). CAW-03은 입력을 준비하고, 진입을 governance하고, 출력을 캡처한다; 파이프라인을 재설계하지 **않는다**.
- PO는 **WritingEngine port** 뒤에 놓여야 하고 **swap 가능**해야 한다(브리프 §2, §5): harness 코어는 오직 port에만 의존하며 PO에 직접 의존하지 않는다. PO는 v1 기본 adapter다.
- PO의 입력 튜플은 `workspace/inputs/`에 있는 `(I=idea.md, E=experimental_log.md, T=template.tex, G=conference_guidelines.md, F=figures/)`다; 출력은 `workspace/`에 떨어진다(연구 문서 §2에 정확한 파일 contract 있음).
- 두 가지 PO 사실이 governance를 형성한다(연구 §1): (a) `experimental_log.md`의 `## 2. Raw Numeric Data`에 있는 값은 Step-5 hallucination 검사의 **ground truth**다 — 따라서 CAW-03은 CAW-01 result ref로부터 *정확하고 추적 가능한* 숫자를 그곳에 넣어야 한다; (b) Step-3가 이미 Semantic Scholar를 통해 citation을 검증한다 — 따라서 Novelty port는 PO의 `citation_pool.json`을 재유도하지 않고 소비한다.
- 브리프(§4)는 PO 입력이 **import된 CAW-02 claim+evidence bundle + CAW-01 result ref로부터 조립**될 것을 요구하며, PO의 `agent-research-aggregator`("scattered logs → inputs")를 "governed workbench → inputs"로 일반화한다.

## Options considered

### A. 호출 메커니즘
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **A. Skill 호출 (in-host 에이전트가 PO skill을 실행)** | PO의 병렬성, vision, web search 재사용; LLM/tooling 재배선 불필요 | CAW-03 런타임을 skill 가능 host에 결합; sandbox/audit가 더 어려움 | Config flag (`invocation_mode=skill`) |
| **B. 준비된 `workspace/` 위의 Subprocess** | 프로세스 격리; 언어 무관; 단계별 로깅/체크포인트; auditable | CAW-03이 단계 순서/병렬성/재시도를 조율; LLM 단계는 여전히 에이전트 runner 필요 | **v1 default** (auditability) |
| 파이프라인을 CAW-03에서 재구현 | 완전한 제어 | 브리프 §2(재구축 금지) 직접 위반 | Rejected |

### B. port가 엔진에 넘기는 것
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **엔진-중립적 `EngineInputs`**(정규화된 idea/log/template/guidelines/figures + ProvenanceMap)를 adapter가 PO의 파일로 렌더링 | 엔진 swap이 조립을 바꾸지 않음; provenance 양방향 | 정의할 정규화 레이어 하나 | **Chosen** |
| 엔진에 raw CAW-02 bundle을 넘김 | 코드 적음 | 모든 엔진을 CAW-02 스키마에 결합; 엔진마다 조립 로직 중복 | Rejected |
| 손으로 쓴 PO 입력 파일 | 사소함 | 브리프 §4 위반(파일이 아니라 bundle로부터 조립); provenance 없음 | Rejected |

### C. `experimental_log.md`의 숫자
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **엄격: 모든 numeric cell이 CAW-01 result-registry ref로 추적** | PO Step-5 hallucination 검사 + evidence gate 충족; 재현 가능 | result-ref → table-cell 매핑 필요 | **Chosen** |
| bundle의 자유 텍스트 숫자 | 쉬움 | ref 없는 숫자가 draft될 수 있음; gate 위반(ADR-0003 §1) | Rejected |

### D. Citation
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **PO의 S2 검증 pool을 신뢰; Novelty port에 공급** | 중복 fetch 없음; PO가 이미 검증(Levenshtein>70, temporal cutoff, dedup) | PO에 대한 trust boundary | **Chosen**; 분쟁 시에만 재검증 |
| CAW-03에서 모든 citation 재검증 | 독립적 | PO의 lit-review 재구현; S2 부하 두 배 | Rejected |

## Decision
**PaperOrchestra는 v1 `WritingEngineAdapter`로서, CAW-03 소유 workspace 위에서 subprocess 모드로 호출되며, gated claim + result ref로부터 조립된 엔진-중립적 입력 bundle을 공급받고, 양방향 provenance를 가진다.**

1. **Port (ADR-0005 §3.2).** harness 코어는 capability descriptor(`EngineDescriptor`: name/version, `invocation_modes`, `generates_figures`/`supports_figures_in`, `emits_citations`, `emits_scores`, `output_formats`, 필수/선택 입력)와 메서드 `describe() / validate() / draft() / score()`(연구 문서 §4)를 가진 `WritingEngineAdapter`에만 의존한다. 능력은 코어에서 분기되지 않고 **descriptor를 통해 협상**된다: figure 생성이 없는 엔진은 `generates_figures=False`로 설정하면 preflight가 `figures` 제공을 요구하거나 실패한다.
2. **호출: workspace 위의 subprocess(v1 default), config flag 뒤의 skill-mode.** 두 모드 모두 동일한 port를 충족한다; 코어는 타입 지정 `EngineResult`만 보며 어느 쪽이 실행됐는지 결코 알지 못한다(`EngineConfig.invocation_mode`). CAW-03은 **workspace contract**를 소유한다: `workspace/inputs/`를 구축하고, Step 1–5를 실행하고(2‖3 병렬), `workspace/` 출력을 읽어들이고, PO의 `provenance.json`을 기록. subprocess는 CLI/CI의 auditable한 default(ADR-0001)다; skill-mode는 에이전트 host용이다.
3. **입력 조립 (래핑의 핵심).** adapter의 `assemble_inputs`는 import된 bundle로부터 엔진-중립적 `EngineInputs`를 구축한 뒤 연구 §5 매핑에 따라 PO의 `(I, E, T, G, F)`를 렌더링한다:
   - `idea.md` ← CAW-02 method/tool (P1/P2) claim statement (Problem/Hypothesis/Methodology/Contribution; claim이 수식을 담으면 Dense, 아니면 Sparse);
   - `experimental_log.md` §1 ← run-config 메타데이터; §2 ← **CAW-01 result ref → markdown 표, 모든 cell이 `result_id`로 추적되고, 숫자는 verbatim, "Table N" 참조 없음**; §3 ← evidence가 연결된 정성적 findings, 과거 시제, citation/URL 없음;
   - `template.tex` ← paper-ladder venue target에 따른 CAW-03 template registry; `conference_guidelines.md` ← venue registry(page limit + deadline → `cutoff_date`); `figures/` ← 선택적 사전 렌더 CAW-01 figure(PlotOn), 없으면 비움(PO PlotOff).
4. **조립 불변식 (엔진 실행 전에 강제).**
   - **Gate-before-assemble** (ADR-0003 §6): 조립은 `draftable`/`draftable_with_label` claim으로만 필터링하고, 요청된 claim이 blocked면 gate 리포트와 함께 **요란하게 실패(fail loud)**한다 — PO는 ungated claim을 결코 보지 않는다.
   - **Confidentiality-before-assemble** (confidentiality 문서 §2): internal-review-required span은 파일에 도달하기 전에 public-target 조립에서 차단된다.
   - **Provenance는 양방향**: assembler가 쓰는 모든 span은 `claim_id`/`result_id` → 입력 위치를 `ProvenanceMap`에 기록하여, `final/paper.tex`의 어떤 문장/숫자든 gated claim이나 CAW-01 result로 재추적된다. PO 자체의 `provenance.json`(입력 해시)은 교차 확인되지만 그것만으로는 충분하지 않다.
5. **출력 캡처.** `draft()`는 `EngineResult`를 반환한다: `paper_tex_path`, `paper_pdf_path`, `bibtex_path`, `citation_pool`(→ Novelty port + provenance), `figure_manifest`(figure_id → path, caption, source result_id), `scores`(refinement worklog + 선택적 autoraters), `outline`(coverage 검사용), `engine_provenance`, `status`. `score()`는 review checklist(ADR-0001 `run_review`)를 위해 paper-autoraters를 래핑한다.
6. **draft 후 coverage 검사.** `outline.json`의 `section_plan`/`plotting_plan`을 gated claim set과 교차 참조하여 이 논문에 의도된 모든 claim이 커버됨을 확인; 렌더된 모든 figure가 `result_registry_ref`에 1:1 매핑됨(뒷받침 run 없는 figure는 없음).
7. **Swap 규칙.** `EngineResult`(LaTeX/PDF + provenance)를 반환하는 모든 엔진은 port를 충족한다; PO를 엔진 X로 바꾸는 것은 config에서 `[adapters.engine] active`를 전환하는 것이다(ADR-0005 §4) — gate, 조립 contract, lifecycle은 손대지 않는다. `NullWritingEngineAdapter` stub은 두 번째 엔진이 코어 편집 없이 adapter 하나 추가로 배선됨을 보이는 문서화된 증거로 출시된다.

## Consequences
- **쉬움:** config로 엔진 swap/업그레이드; PO의 병렬성/검증/vision을 재구축 없이 재사용; draft된 모든 숫자와 citation이 추적 가능; Step-5 hallucination 검사가 구조적으로 충족됨.
- **쉬움:** Novelty port(ADR-0005 §3.5)는 S2를 재질의하지 않고 PO의 검증된 `citation_pool.json`을 재사용한다.
- **어려움 / 비용:** CAW-03은 subprocess 모드에서 PO 단계 순서/병렬성/재시도를 조율하고 PO의 LLM/web/vision 단계를 위한 에이전트 runner를 제공(또는 shell out)해야 함; 엔진-중립적 `EngineInputs` 정규화는 유지해야 하는 실재 레이어; PO 버전 어긋남(outline.json / citation_pool.json 스키마 drift)은 `EngineDescriptor.version`으로 pin해야 함.
- **후속 runbook:** (1) engine port + `PaperOrchestraAdapter`(subprocess 우선), `validate_inputs.py` + 5단계 + autoraters 래핑; (2) 입력 assembler(연구 §5 매핑 → 채워진 `workspace/inputs/` + ProvenanceMap); (3) workspace driver(실행, 2‖3 병렬, §2.2 출력 캡처, provenance 교차 확인); (4) coverage + review gate; (5) `NullWritingEngineAdapter` stub.

## Open questions / revisit triggers
- TODO(open-question: subprocess 모드에서 PO의 LLM/web/vision 단계를 누가 실행하는가 — CAW-03이 에이전트 runner를 내장하는가, 아니면 비대화형 PO CLI entrypoint를 shell하는가? 그런 entrypoint가 존재하는지 확인.) [../02-research/paperorchestra-integration.md](../02-research/paperorchestra-integration_ko.md) §Open 및 [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: PO가 `outline.json`/`citation_pool.json` 스키마를 바꿀 때의 PO skill-suite versioning/compat 정책 — `EngineDescriptor.version`이 어떻게 이를 pin하는가?)
- TODO(open-question: `EngineInputs.IdeaDoc`/`ExpLog`의 정확한 정규화 스키마 — markdown으로 렌더되는 CAW-03 중간 JSON을 표준화하여 비-PO 엔진이 재사용하도록?)
- TODO(open-question: figure provenance — PO `captions.json`은 `figure_id`로 키잉; PlotOn/PlotOff 전반에서 `figure_id`를 CAW-01 `result_id`로 신뢰성 있게 되묶기.)
- TODO(open-question: 엔진 run은 동기 `draft()`인가, 아니면 job-handle/poll contract인가? ADR-0005 §Open 및 ADR-0001 장기 실행 op 질문 교차 참조.)
- **Revisit trigger:** 엔진을 swap하는 것이 evidence gate나 입력 조립 contract의 편집을 강제한다면, port가 누수되고 있으므로 재검토해야 한다.

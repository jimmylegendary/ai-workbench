# PaperOrchestra 통합 (WritingEngine port)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [./ports-and-adapters.md](./ports-and-adapters-architecture_ko.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-03이 **PaperOrchestra(PO)를 재구축하지 않고 기본 WritingEngine으로 구동하는 방법**과, PO를 타입이 지정된 `WritingEngineAdapter` port 뒤에서 **교체 가능(swappable)** 하게 만드는 방법을 결정한다. 구체적으로 (a) PO의 pipeline, 정확한 입력/출력, 호출 모드, (b) PO가 구현하는 `WritingEngineAdapter` port 표면, 그리고 (c) 가져온(import) CAW-02 claim+evidence 번들과 CAW-01 result 참조를 PO의 `(I, E, T, G, F)` 입력 튜플로 변환하는 **입력 조립 매핑(input-assembly mapping)** 을 명세한다.

다음은 다루지 **않는다**: evidence gate 로직(별도 ADR), patent 작성(별도 `PatentEngineAdapter`), publish/sink, claim-ledger 스키마. PO 내부(prompts, autorater rubrics)는 port 뒤의 블랙박스로 취급한다 — 우리는 구현이 아니라 입출력만을 제약한다.

## 1. PaperOrchestra pipeline (우리가 감싸는 엔진)

PO(Song et al., 2026, arXiv:2604.05018)는 기존의 내부 skill 모음이다: 5-agent pipeline에 두 개의 보조 skill이 더해진 형태다. CAW-03은 이를 호출할 뿐, 수정하지 않는다.

| Step | Skill | Cost (calls) | Reads | Writes |
|---|---|---|---|---|
| 0 | (orchestrator scaffold) | — | `workspace/inputs/*` | `tex_profile.json`, validated workspace |
| 1 | `outline-agent` | 1 | `idea.md`, `experimental_log.md`, `template.tex`, `conference_guidelines.md` | `outline.json` (plotting_plan, intro_related_work_plan, section_plan) |
| 2 | `plotting-agent` | ~20–30 | `outline.json`, `idea.md`, `experimental_log.md`, `inputs/figures/` | `figures/<id>.png`, `figures/captions.json` |
| 3 | `literature-review-agent` | ~20–30 | `outline.json`, `conference_guidelines.md`, `idea.md`, `experimental_log.md` | `citation_pool.json`, `refs.bib`, `drafts/intro_relwork.tex` |
| 4 | `section-writing-agent` | 1 | `outline.json`, `idea.md`, `experimental_log.md`, `drafts/intro_relwork.tex`, `citation_pool.json`, `refs.bib`, `figures/`, `captions.json`, `tex_profile.json` | `drafts/paper.tex` |
| 5 | `content-refinement-agent` | ~5–7 (~3 iters) | `drafts/paper.tex`, `conference_guidelines.md`, `experimental_log.md`, `citation_pool.json`/`refs.bib` | `refinement/iterN/*`, `worklog.json`, `final/paper.tex`, `final/paper.pdf` |
| aux | `paper-autoraters` | varies | a paper (+ refs / a second paper) | `f1_report.json`, lit-review-quality JSON, SxS winner JSON |
| aux | `agent-research-aggregator` | 2+ | scattered agent caches / a directory | `inputs/idea.md`, `inputs/experimental_log.md`, `ara/*` |

래핑에 중요한 참고 사항:
- **Step 2와 3은 병렬로 실행된다**(서로 독립적). Step 3이 벽시계 시간(wall-time)의 하한을 결정한다(Semantic Scholar 1 QPS).
- **검증은 실제로 수행된다:** Step 3은 모든 후보를 Semantic Scholar로 검증한다(Levenshtein 제목 비율 > 70, `conference_guidelines.md`에서 가져온 temporal cutoff, `paperId` 기준 중복 제거). 이는 PO 자체의 related-work 근거 확보 과정으로 — CAW-03의 Novelty/Radar port는 이를 다시 도출하지 않고 `citation_pool.json`을 소비한다.
- **수치적 ground truth:** `experimental_log.md`의 `## 2. Raw Numeric Data`에 있는 값들이 Step 5의 hallucination 검사를 위한 ground truth가 된다. 따라서 CAW-03의 evidence gate는 CAW-01 result 참조에서 가져온 *정확한* 숫자를 이곳에 안착시켜야 한다 — 이 지점이 거버넌스와 엔진이 만나는 이음새(seam)다.
- **`agent-research-aggregator`는 CAW-03이 일반화하는 선례다:** PO에는 이미 "흩어진 로그 → `(I,E)`" adapter가 있다. CAW-03의 `SourceAdapter` + 입력 조립기는 동일한 아이디어를 "거버넌스가 적용된 workbench 번들 → `(I,E)`"로 승격한 것이며, 이 aggregator는 또 하나의 `SourceAdapter`(흩어진 로그 변형)가 된다.

## 2. 정확한 입력 / 출력 계약

PO의 입력 튜플은 `workspace/inputs/`에 있는 `(I, E, T, G, F)`이고, 출력은 `workspace/`에 안착한다.

### 2.1 입력 계약 (CAW-03이 만들어내야 하는 것)

| File | Symbol | Req | Format / required structure | CAW-03 must guarantee |
|---|---|---|---|---|
| `inputs/idea.md` | I | yes | Markdown; Sparse 또는 Dense 변형. 섹션: Problem Statement, Core Hypothesis, Proposed Methodology, Expected Contribution | CAW-02 claim 번들(method/tool claims P1/P2)에서 조립; confidentiality 필터 적용 |
| `inputs/experimental_log.md` | E | yes | Markdown; 엄격히 3개 섹션: `## 1. Experimental Setup`, `## 2. Raw Numeric Data`(markdown 표, "Table N" 참조 없음), `## 3. Qualitative Observations`(과거 시제, 자기 완결적, 인용/URL 없음) | 숫자는 CAW-01 result 참조에서 가져옴; 100% 정확; 모든 숫자가 result id로 추적 가능 |
| `inputs/template.tex` | T | yes | Conference LaTeX template; 빈 `\section{}` 자리표시자; preamble은 verbatim 보존 | paper-ladder venue 타깃에서 선택; CAW-03이 template registry 제공 |
| `inputs/conference_guidelines.md` | G | yes | Markdown: page limit, 필수 섹션, format, 제출 마감일(`cutoff_date`를 결정) | venue 타깃별 선택; 마감일이 novelty/temporal cutoff를 결정 |
| `inputs/figures/` | F | no | PNG/PDF 사전 존재 figures(`PlotOn`); 비어 있으면 PO가 모두 생성(`PlotOff`) | 선택: CAW-01 result registry의 사전 렌더링된 figures를 path로 제공 |

### 2.2 출력 계약 (CAW-03이 포착하는 것)

| Artifact | Format | CAW-03 use |
|---|---|---|
| `final/paper.tex` | LaTeX | 주요 산출물 → Sink/Publish port |
| `final/paper.pdf` | compiled PDF | 산출물; review-checklist 입력; path로 저장 |
| `refs.bib` | BibTeX | artifact와 함께 저장; provenance |
| `citation_pool.json` | JSON (검증된 S2 메타데이터, `paperId`, `match_score`, `discovered_for`) | Novelty/Radar port + provenance에 공급 |
| `figures/*.png`, `captions.json` | PNG + JSON | Figure/table 매니페스트; result 참조로의 provenance |
| `outline.json` | JSON | 감사 추적; CAW-03이 claim의 섹션/figure 커버리지를 검증하게 함 |
| `refinement/worklog.json`, `iterN/{review,score}.json` | JSON | Review/score 보고서; 라이프사이클 상태 증거 |
| `provenance.json` | JSON (input sha256/bytes) | CAW-03 자체 provenance ledger와 교차 확인 |
| (autoraters) `f1_report.json`, lit-quality JSON, SxS JSON | JSON | "submission-ready" 이전 review checklist gate |

## 3. CAW-03이 PO를 호출하는 방법

두 가지 실행 가능한 호출 모드가 있다. CAW-03은 동일한 adapter 뒤에서 둘 다 지원하므로, 선택은 코드가 아니라 config가 된다.

| Mode | Mechanism | Pros | Cons | Fit |
|---|---|---|---|---|
| **A. Skill invocation (in-host)** | CAW-03 호스트 에이전트가 PO skill(`paper-orchestra` orchestrator → sub-skills)을 in-process로 실행 | PO의 병렬성, vision, 웹 검색 재사용; LLM/도구 재배선 불필요 | CAW-03 런타임이 skill 실행 가능한 호스트에 결합됨; sandbox화가 더 어려움 | CAW-03이 에이전트 호스트로 실행될 때의 v1 기본값 |
| **B. Subprocess pipeline** | CAW-03이 준비된 `workspace/`에 대해 PO scripts/steps를 shell로 실행하고 파일을 포착 | 프로세스 격리; 언어 무관; step별 로깅/checkpoint 용이 | CAW-03이 step 순서, 병렬성, 재시도를 직접 orchestration해야 함; LLM step에는 여전히 에이전트 runner 필요 | headless/CI 빌드의 v1 기본값; 거버넌스 감사 가능성 측면에서 선호 |

**결정(제안):** `WritingEngineAdapter`는 **두 모드 모두** 동일한 port를 충족하도록 정의된다. v1은 PO adapter를 감사 가능한 기본값인 **mode B(workspace 기반 subprocess)** 로 제공하며, mode A는 config flag로 둔다. harness 코어는 어느 모드가 실행되었는지 결코 알지 못한다 — port의 타입이 지정된 결과만 본다. (ADR-0002 참조.)

어느 쪽이든 CAW-03은 **workspace 계약**을 소유한다: `workspace/inputs/`를 구축하고, PO를 호출한 뒤, 2.2에 나열된 `workspace/` 출력을 읽어 들이고, `provenance.json`을 자체 ledger에 대해 기록한다.

## 4. `WritingEngineAdapter` port

PO가 구현하고 다른 엔진도 구현할 수 있는 타입이 지정된 인터페이스다. 작성은 엔진 무관(engine-agnostic)이며, harness는 이 port에만 의존한다(PRODUCT-BRIEF §5). 의사 타입(언어는 architecture ADR에서 결정 예정):

```python
# Capability/config descriptor — adapters are registered and selected by config, not hard-coded.
class EngineDescriptor:
    name: str                      # "paperorchestra"
    version: str                   # pins arXiv:2604.05018 skill-suite rev
    invocation_modes: list[str]    # ["subprocess", "skill"]
    supports_figures_in: bool      # consumes pre-rendered figures (PlotOn)
    generates_figures: bool        # can render from data (PlotOff)
    emits_citations: bool          # produces verified citation_pool + bibtex
    emits_scores: bool             # produces autorater/refinement scores
    output_formats: list[str]      # ["latex", "pdf", "bibtex"]
    required_inputs: list[str]     # ["idea","experimental_log","template","guidelines"]
    optional_inputs: list[str]     # ["figures"]

class EngineInputs:                # normalized, engine-neutral input bundle
    idea: IdeaDoc                  # structured -> rendered to idea.md
    experimental_log: ExpLog       # structured -> rendered to experimental_log.md
    template_ref: TemplateRef      # venue template id/path -> template.tex
    guidelines: GuidelinesDoc      # venue rules -> conference_guidelines.md
    figures: list[FigureRef]       # optional pre-rendered, by path
    provenance: ProvenanceMap      # claim_id/result_id -> input span (for back-tracing)

class EngineResult:
    paper_tex_path: Path
    paper_pdf_path: Path
    bibtex_path: Path
    citation_pool: list[Citation]  # verified refs (paperId, key, discovered_for)
    figure_manifest: list[Figure]  # figure_id -> path, caption, source result_id
    scores: ScoreReport            # refinement worklog + optional autorater scores
    outline: dict                  # section/figure plan, for coverage checks
    engine_provenance: dict        # PO provenance.json (input hashes)
    status: EngineStatus           # ok | partial | failed + per-step diagnostics

class WritingEngineAdapter(Protocol):
    def describe(self) -> EngineDescriptor: ...
    def validate(self, inputs: EngineInputs) -> ValidationReport: ...   # pre-flight (maps PO validate_inputs.py)
    def draft(self, inputs: EngineInputs, *, config: EngineConfig) -> EngineResult: ...
    def score(self, paper: PaperRef, *, refs: BibRef | None = None) -> ScoreReport: ...  # maps paper-autoraters
```

PO로의 매핑:
- `describe()`는 위 descriptor를 반환한다(PO는 두 모드, PlotOn/PlotOff, citations, scores를 모두 지원).
- `validate()`는 `scripts/validate_inputs.py` + `check_tex_packages.py`를 감싼다.
- `draft()`는 `EngineInputs`를 `workspace/inputs/`로 렌더링하고, Steps 1–5를 실행한 뒤, §2.2 출력을 `EngineResult`로 읽어 들인다. `EngineConfig`는 `invocation_mode`, `plot_mode`, `iter_cap`, 병렬성, S2 cache path를 담는다.
- `score()`는 review checklist를 위해 `paper-autoraters`(Citation F1, Lit-Review Quality, SxS)를 감싼다.

**Swap 규칙:** `EngineResult`(LaTeX/PDF + provenance)를 반환하는 모든 엔진은 이 port를 충족한다. figure 생성을 지원하지 않는 엔진은 단순히 `generates_figures=False`로 설정한다; 그러면 harness는 `figures`가 제공되기를 요구한다(또는 pre-flight를 실패시킨다) — capability는 코어에서 분기되는 것이 아니라 descriptor를 통해 협상된다.

## 5. 입력 조립 매핑 (거버넌스 번들 → PO 입력)

이것이 래핑의 핵심이다: CAW-03은 가져온 CAW-02 claim+evidence 번들과 CAW-01 result 참조로부터 `(I, E, T, G, F)`를 **조립**한다 — 결코 손으로 작성한 파일에서가 아니다(PRODUCT-BRIEF §4). 이는 PO의 `agent-research-aggregator`(흩어진 로그 → `(I,E)`)를 "거버넌스가 적용된 workbench → `(I,E,T,G,F)`"로 일반화한 것이다.

| PO input | Assembled from | Mapping rule | Governance touchpoint |
|---|---|---|---|
| `idea.md` (Problem / Hypothesis / Methodology / Contribution) | CAW-02 claim 번들: method/tool claims (P1/P2), 그 진술 + 근거(rationale) | claim을 주제별로 그룹화 → Problem/Hypothesis; method 유형 claims → Methodology(claim에 수식이 있으면 Dense, 아니면 Sparse); contribution claims → Expected Contribution | **evidence-gate를 통과한** claim만 진입; **confidentiality 필터**가 internal-only span을 제거하거나 internal-review 태그를 요구 |
| `experimental_log.md §1 Setup` | CAW-02 evidence 번들 컨텍스트 + CAW-01 run config 참조 | Datasets/metrics/baselines/impl-details를 result registry 메타데이터에서 읽음 | public-safe 표현; 내부 Samsung/SAIT 인프라를 절대 명시하지 않음 |
| `experimental_log.md §2 Raw Numeric Data` | CAW-01 result registry 참조(id/URI로) → markdown 표 | 각 표 셀이 result id로 추적됨; 숫자는 verbatim 복사, "Table N" 참조 없음 | **Evidence gate**: result 참조가 없는 숫자는 방출될 수 없음; 생성된 텍스트는 결코 evidence가 아님 |
| `experimental_log.md §3 Qualitative Observations` | CAW-02 evidence-linked 정성적 발견 | 과거 시제의 자기 완결적 진술로 변환; 인용/URL 제거 | confidentiality 필터; provenance는 파일이 아니라 `ProvenanceMap`에 보존 |
| `template.tex` | paper-ladder venue 타깃을 키로 한 CAW-03 template registry | 타깃 venue로 선택; claim 내용 없음 | — |
| `conference_guidelines.md` | CAW-03 venue registry | Page limit + 마감일(→ `cutoff_date`) + 필수 섹션 | 마감일이 Novelty/Radar temporal cutoff에 공급됨 |
| `figures/` (선택) | CAW-01 result registry의 사전 렌더링된 figures(path로) | figure가 이미 존재할 때 제공; 아니면 비워 둠(PO `PlotOff`) | Figure 매니페스트가 각 figure를 result id로 연결 |

조립 불변식(invariants):
- **Provenance는 양방향이다.** 조립기가 쓰는 모든 span은 `claim_id`/`result_id` → 입력 위치를 `ProvenanceMap`에 기록하므로, CAW-03은 `final/paper.tex`의 어떤 문장/숫자든 gated claim이나 CAW-01 result로 역추적할 수 있다. PO 자체의 `provenance.json`(input hashes)은 교차 확인되지만, 그 자체만으로는 충분하지 않다.
- **조립 이전에 gate.** evidence gate는 조립 *이전에* claim 번들에서 실행된다; gate를 통과하지 못한 claim은 결코 `idea.md`/`experimental_log.md`로 렌더링되지 않는다. 이로써 "증거가 불충분한 claim은 작성될 수 없다"(PRODUCT-BRIEF §3)가 사후 점검이 아니라 구조적으로 참이 된다.
- **조립 이전에 confidentiality.** confidentiality 필터는 각 span에서 실행된다; internal-review가 요구되는 내용은 public 타깃 조립에서 차단된다.
- **draft 이후 coverage 점검.** CAW-03은 `outline.json`의 `section_plan`/`plotting_plan`을 claim 집합과 교차 참조하여, 이 논문을 위해 의도된 모든 gated claim이 실제로 커버되었는지 확인한다.

## 6. Tradeoffs

| Decision | Option A | Option B | Lean |
|---|---|---|---|
| 호출 | Skill (in-host) | workspace 기반 Subprocess | v1은 **B**(감사 가능성, 격리); A는 config 뒤에 |
| Figure 출처 | PO가 생성(PlotOff) | CAW-01 figures 제공(PlotOn) | 논문별 config; result registry에 canonical figure가 있으면 PlotOn |
| Citations | PO의 S2 검증 pool 신뢰 | CAW-03에서 재검증 | **PO 신뢰**, pool을 Novelty port에 공급; 분쟁 시에만 재검증 |
| E의 숫자 | 번들의 자유 텍스트 | 엄격한 result-ref → 표 셀 | **엄격**(Step-5 hallucination 검사 + evidence gate에 의해 요구됨) |

## Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

- `TODO(open-question: PO skill-suite versioning — how does the EngineDescriptor.version pin a specific PO rev, and what is the compatibility policy when PO updates its outline.json / citation_pool.json schemas?)`
- `TODO(open-question: in subprocess mode, who runs the LLM/web/vision steps that PO sub-skills require — does CAW-03 embed an agent runner, or shell out to a PO CLI entrypoint? Confirm a non-interactive PO entrypoint exists.)`
- `TODO(open-question: how are PO's Semantic-Scholar-verified citations reconciled with the Novelty/Radar port and CAW-05 threat signals without double-fetching?)`
- `TODO(open-question: exact normalized schema for EngineInputs.IdeaDoc/ExpLog — do we standardize a CAW-03 intermediate JSON that renders to markdown, so non-PO engines reuse it?)`
- `TODO(open-question: figure provenance — PO captions.json keys by figure_id; how do we bind figure_id back to a CAW-01 result_id reliably across PlotOn/PlotOff?)`
- `TODO(open-question: confidentiality on intermediate artifacts — citation_pool.json/outline.json may echo internal phrasing; do they need the same filter as the inputs before storage?)`

## 런북(runbooks)에 대한 함의

- **RB (engine port):** `WritingEngineAdapter` 타입 + descriptor registry를 정의하고, `validate_inputs.py`, 5개 steps, `paper-autoraters`를 감싸는 `PaperOrchestraAdapter`(subprocess 모드 우선)를 구현한다. 수용 기준: fixture `EngineInputs`가 비어 있지 않은 `paper_tex_path`, `citation_pool`, `scores`를 가진 `EngineResult`를 산출한다.
- **RB (input assembler):** CAW-02 번들 + CAW-01 result 참조로부터 채워진 `workspace/inputs/`로의 §5 매핑을 구현하고, `ProvenanceMap`을 방출한다. 수용 기준: `experimental_log.md`의 모든 숫자 셀이 result_id를 가지며; gate를 통과하지 못한/confidential span이 없으며; 왕복(round-trip) provenance가 해소된다.
- **RB (workspace driver):** workspace를 scaffold/검증하고, Steps 1–5를 실행하며(2‖3 병렬), §2.2 출력을 포착하고, `provenance.json`을 교차 확인한다. 수용 기준: fixture에서 정상(green) `final/paper.pdf` + 채워진 worklog.
- **RB (coverage + review gate):** `outline.json`을 claim 집합과 비교하고; review checklist를 위해 autoraters를 실행한다. 수용 기준: coverage 보고서 + score 보고서가 artifact 라이프사이클 상태에 첨부됨.
- **이음새 stub:** `NullWritingEngineAdapter`(descriptor + not-implemented `draft`)를, 코어를 편집하지 않고 adapter 하나를 추가함으로써 두 번째 엔진이 연결됨을 증명하는 문서화된 예시로 제공한다.

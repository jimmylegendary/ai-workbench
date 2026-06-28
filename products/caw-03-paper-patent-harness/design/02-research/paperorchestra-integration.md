# PaperOrchestra Integration (the WritingEngine port)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [./ports-and-adapters.md](./ports-and-adapters-architecture.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc decides **how CAW-03 drives PaperOrchestra (PO) as the default WritingEngine** without rebuilding it,
and how PO is made **swappable** behind a typed `WritingEngineAdapter` port. It specifies (a) PO's pipeline,
exact inputs/outputs, and invocation modes; (b) the `WritingEngineAdapter` port surface PO implements; and
(c) the **input-assembly mapping** that converts imported CAW-02 claim+evidence bundles and CAW-01 result refs
into PO's `(I, E, T, G, F)` input tuple.

It does NOT cover: the evidence gate logic (separate ADR), patent drafting (separate `PatentEngineAdapter`),
publish/sink, or the claim-ledger schema. PO internals (prompts, autorater rubrics) are treated as a black box
behind the port — we constrain its I/O, not its implementation.

## 1. PaperOrchestra pipeline (the engine we wrap)

PO (Song et al., 2026, arXiv:2604.05018) is an existing internal skill suite: a 5-agent pipeline plus two
auxiliary skills. CAW-03 calls it; CAW-03 does not modify it.

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

Notes that matter for the wrap:
- **Steps 2 and 3 run in parallel** (independent); Step 3 sets the wall-time floor (Semantic Scholar 1 QPS).
- **Verification is real:** Step 3 verifies every candidate via Semantic Scholar (Levenshtein title ratio > 70,
  temporal cutoff from `conference_guidelines.md`, dedup by `paperId`). This is PO's own related-work grounding —
  CAW-03's Novelty/Radar port consumes `citation_pool.json` rather than re-deriving it.
- **Numeric ground truth:** values in `experimental_log.md` `## 2. Raw Numeric Data` become the ground truth for
  Step 5's hallucination check. CAW-03's evidence gate must therefore land *accurate* numbers here, sourced from
  CAW-01 result refs — this is the seam where governance meets the engine.
- **`agent-research-aggregator` is the precedent CAW-03 generalizes:** PO already has a "scattered logs → `(I,E)`"
  adapter. CAW-03's `SourceAdapter` + input-assembler is the same idea promoted to "governed workbench bundles →
  `(I,E)`", and the aggregator becomes just one more `SourceAdapter` (scattered-logs variant).

## 2. Exact input / output contract

PO's input tuple is `(I, E, T, G, F)` in `workspace/inputs/`; outputs land in `workspace/`.

### 2.1 Input contract (what CAW-03 must produce)

| File | Symbol | Req | Format / required structure | CAW-03 must guarantee |
|---|---|---|---|---|
| `inputs/idea.md` | I | yes | Markdown; Sparse or Dense variant. Sections: Problem Statement, Core Hypothesis, Proposed Methodology, Expected Contribution | Assembled from CAW-02 claim bundle (method/tool claims P1/P2); confidentiality-filtered |
| `inputs/experimental_log.md` | E | yes | Markdown; strict 3 sections: `## 1. Experimental Setup`, `## 2. Raw Numeric Data` (markdown tables, no "Table N" refs), `## 3. Qualitative Observations` (past tense, self-contained, no citations/URLs) | Numbers sourced from CAW-01 result refs; 100% accurate; every number traceable to a result id |
| `inputs/template.tex` | T | yes | Conference LaTeX template; empty `\section{}` placeholders; preamble preserved verbatim | Selected from paper-ladder venue target; CAW-03 ships a template registry |
| `inputs/conference_guidelines.md` | G | yes | Markdown: page limit, mandatory sections, format, submission deadline (drives `cutoff_date`) | Selected per venue target; deadline drives novelty/temporal cutoff |
| `inputs/figures/` | F | no | PNG/PDF pre-existing figures (`PlotOn`); empty → PO generates all (`PlotOff`) | Optional: pre-rendered figures from CAW-01 result registry by path |

### 2.2 Output contract (what CAW-03 captures)

| Artifact | Format | CAW-03 use |
|---|---|---|
| `final/paper.tex` | LaTeX | Primary deliverable → Sink/Publish port |
| `final/paper.pdf` | compiled PDF | Deliverable; review-checklist input; stored by path |
| `refs.bib` | BibTeX | Stored with artifact; provenance |
| `citation_pool.json` | JSON (verified S2 metadata, `paperId`, `match_score`, `discovered_for`) | Feeds Novelty/Radar port + provenance |
| `figures/*.png`, `captions.json` | PNG + JSON | Figure/table manifest; provenance back to result refs |
| `outline.json` | JSON | Audit trail; lets CAW-03 verify section/figure coverage of claims |
| `refinement/worklog.json`, `iterN/{review,score}.json` | JSON | Review/score report; lifecycle state evidence |
| `provenance.json` | JSON (input sha256/bytes) | Cross-checked against CAW-03's own provenance ledger |
| (autoraters) `f1_report.json`, lit-quality JSON, SxS JSON | JSON | Review checklist gate before "submission-ready" |

## 3. How CAW-03 invokes PO

Two viable invocation modes; CAW-03 supports both behind the same adapter so the choice is config, not code.

| Mode | Mechanism | Pros | Cons | Fit |
|---|---|---|---|---|
| **A. Skill invocation (in-host)** | CAW-03 host agent runs PO skills (`paper-orchestra` orchestrator → sub-skills) in-process | Reuses PO's parallelism, vision, web search; no re-plumbing of LLM/tooling | Couples CAW-03 runtime to a skill-capable host; harder to sandbox | v1 default when CAW-03 runs as an agent host |
| **B. Subprocess pipeline** | CAW-03 shells the PO scripts/steps over a prepared `workspace/`, captures files | Process isolation; language-agnostic; easy to log/checkpoint per step | CAW-03 must orchestrate step ordering, parallelism, retries itself; LLM steps still need an agent runner | v1 default for headless/CI builds; preferred for governance auditability |

**Decision (proposed):** the `WritingEngineAdapter` is defined so **both** modes satisfy the same port. v1 ships
the PO adapter in **mode B (subprocess over a workspace)** as the auditable default, with mode A as a config flag.
The harness core never knows which mode ran — it only sees the port's typed result. (See ADR-0002.)

Either way, CAW-03 owns the **workspace contract**: it builds `workspace/inputs/`, invokes PO, then reads back the
`workspace/` outputs listed in 2.2 and records `provenance.json` against its own ledger.

## 4. The `WritingEngineAdapter` port

A typed interface PO implements and other engines can implement. Drafting is engine-agnostic; the harness depends
only on this port (PRODUCT-BRIEF §5). Pseudo-typed (language TBD in architecture ADR):

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

Mapping to PO:
- `describe()` returns the descriptor above (PO supports both modes, PlotOn/PlotOff, citations, scores).
- `validate()` wraps `scripts/validate_inputs.py` + `check_tex_packages.py`.
- `draft()` renders `EngineInputs` into `workspace/inputs/`, runs Steps 1–5, reads back §2.2 outputs into
  `EngineResult`. `EngineConfig` carries `invocation_mode`, `plot_mode`, `iter_cap`, parallelism, S2 cache path.
- `score()` wraps `paper-autoraters` (Citation F1, Lit-Review Quality, SxS) for the review checklist.

**Swap rule:** any engine returning an `EngineResult` (LaTeX/PDF + provenance) satisfies the port. An engine that
lacks figure generation simply sets `generates_figures=False`; the harness then requires `figures` to be supplied
(or fails the pre-flight) — capability is negotiated via the descriptor, not branched in the core.

## 5. Input-assembly mapping (governed bundles → PO inputs)

This is the heart of the wrap: CAW-03 **assembles** `(I, E, T, G, F)` from imported CAW-02 claim+evidence bundles
and CAW-01 result refs — never from hand-written files (PRODUCT-BRIEF §4). This generalizes PO's
`agent-research-aggregator` (scattered logs → `(I,E)`) into "governed workbench → `(I,E,T,G,F)`".

| PO input | Assembled from | Mapping rule | Governance touchpoint |
|---|---|---|---|
| `idea.md` (Problem / Hypothesis / Methodology / Contribution) | CAW-02 claim bundle: method/tool claims (P1/P2), their statements + rationale | Group claims by topic → Problem/Hypothesis; method-typed claims → Methodology (Dense if claims carry equations, else Sparse); contribution claims → Expected Contribution | Only **evidence-gate-passing** claims enter; **confidentiality filter** strips internal-only spans / requires internal-review tag |
| `experimental_log.md §1 Setup` | CAW-02 evidence bundle context + CAW-01 run config refs | Datasets/metrics/baselines/impl-details read from result registry metadata | Public-safe phrasing; never name internal Samsung/SAIT infra |
| `experimental_log.md §2 Raw Numeric Data` | CAW-01 result registry refs (by id/URI) → markdown tables | Each table cell traces to a result id; numbers copied verbatim, no "Table N" refs | **Evidence gate**: a number with no result ref cannot be emitted; generated text is never evidence |
| `experimental_log.md §3 Qualitative Observations` | CAW-02 evidence-linked qualitative findings | Convert to past-tense, self-contained statements; drop citations/URLs | Confidentiality filter; provenance kept in `ProvenanceMap`, not in the file |
| `template.tex` | CAW-03 template registry, keyed by paper-ladder venue target | Select by target venue; no claim content | — |
| `conference_guidelines.md` | CAW-03 venue registry | Page limit + deadline (→ `cutoff_date`) + mandatory sections | Deadline feeds Novelty/Radar temporal cutoff |
| `figures/` (optional) | CAW-01 result registry pre-rendered figures by path | Supply when figures already exist; else leave empty (PO `PlotOff`) | Figure manifest links each figure back to a result id |

Assembly invariants:
- **Provenance is bidirectional.** Every span the assembler writes records `claim_id`/`result_id` → input location
  in `ProvenanceMap`, so CAW-03 can re-trace any sentence/number in `final/paper.tex` back to a gated claim or a
  CAW-01 result. PO's own `provenance.json` (input hashes) is cross-checked but is not sufficient on its own.
- **Gate-before-assemble.** The evidence gate runs on the claim bundle *before* assembly; ungated claims are never
  rendered into `idea.md`/`experimental_log.md`. This keeps "a claim with insufficient evidence cannot be drafted"
  (PRODUCT-BRIEF §3) structurally true, not a post-hoc check.
- **Confidentiality-before-assemble.** The confidentiality filter runs on each span; internal-review-required
  content is blocked from public-target assemblies.
- **Coverage check after draft.** CAW-03 cross-references `outline.json` `section_plan`/`plotting_plan` against the
  claim set to confirm every gated claim intended for this paper is actually covered.

## 6. Tradeoffs

| Decision | Option A | Option B | Lean |
|---|---|---|---|
| Invocation | Skill (in-host) | Subprocess over workspace | **B** for v1 (auditability, isolation); A behind config |
| Figure source | PO generates (PlotOff) | Supply CAW-01 figures (PlotOn) | Config per paper; PlotOn when result registry has canonical figures |
| Citations | Trust PO's S2-verified pool | Re-verify in CAW-03 | **Trust PO**, feed pool to Novelty port; re-verify only on dispute |
| Numbers in E | Free-text from bundle | Strict result-ref → table cell | **Strict** (required by Step-5 hallucination check + evidence gate) |

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

- `TODO(open-question: PO skill-suite versioning — how does the EngineDescriptor.version pin a specific PO rev, and what is the compatibility policy when PO updates its outline.json / citation_pool.json schemas?)`
- `TODO(open-question: in subprocess mode, who runs the LLM/web/vision steps that PO sub-skills require — does CAW-03 embed an agent runner, or shell out to a PO CLI entrypoint? Confirm a non-interactive PO entrypoint exists.)`
- `TODO(open-question: how are PO's Semantic-Scholar-verified citations reconciled with the Novelty/Radar port and CAW-05 threat signals without double-fetching?)`
- `TODO(open-question: exact normalized schema for EngineInputs.IdeaDoc/ExpLog — do we standardize a CAW-03 intermediate JSON that renders to markdown, so non-PO engines reuse it?)`
- `TODO(open-question: figure provenance — PO captions.json keys by figure_id; how do we bind figure_id back to a CAW-01 result_id reliably across PlotOn/PlotOff?)`
- `TODO(open-question: confidentiality on intermediate artifacts — citation_pool.json/outline.json may echo internal phrasing; do they need the same filter as the inputs before storage?)`

## Implications for runbooks

- **RB (engine port):** define `WritingEngineAdapter` types + descriptor registry; implement `PaperOrchestraAdapter`
  (subprocess mode first) wrapping `validate_inputs.py`, the 5 steps, and `paper-autoraters`. Acceptance: a fixture
  `EngineInputs` produces an `EngineResult` with non-empty `paper_tex_path`, `citation_pool`, and `scores`.
- **RB (input assembler):** implement the §5 mapping from a CAW-02 bundle + CAW-01 result refs to a populated
  `workspace/inputs/`, emitting a `ProvenanceMap`. Acceptance: every numeric cell in `experimental_log.md` carries a
  result_id; ungated/confidential spans are absent; round-trip provenance resolves.
- **RB (workspace driver):** scaffold/validate workspace, run Steps 1–5 (2‖3 parallel), capture §2.2 outputs,
  cross-check `provenance.json`. Acceptance: green `final/paper.pdf` + populated worklog on the fixture.
- **RB (coverage + review gate):** compare `outline.json` against the claim set; run autoraters for the
  review checklist. Acceptance: coverage report + score report attached to the artifact lifecycle state.
- **Stub the seam:** ship a `NullWritingEngineAdapter` (descriptor + not-implemented `draft`) as the documented
  example proving a second engine wires in by adding one adapter, not editing the core.

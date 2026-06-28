# ADR-0002: Writing-engine integration — PaperOrchestra behind a swappable WritingEngine port

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth; §2 the wrap, §4 input assembly)
  - [../02-research/paperorchestra-integration.md](../02-research/paperorchestra-integration.md) (pipeline, I/O contract, input-assembly mapping)
  - [ADR-0001-product-surface.md](ADR-0001-product-surface.md) (the `draft` op)
  - [ADR-0003-evidence-gate-and-claim-ledger.md](ADR-0003-evidence-gate-and-claim-ledger.md) (gate runs *before* assembly)
  - [ADR-0005-ports-and-adapters.md](ADR-0005-ports-and-adapters.md) (the port + registry this implements)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle.md) (`drafting` state records `adapter_id`+`engine_version`)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide **how CAW-03 drives PaperOrchestra (PO) as the default writing engine without rebuilding it**, behind a
typed, swappable `WritingEngineAdapter` port: the invocation mechanism, the input-assembly that builds PO's
`(I, E, T, G, F)` inputs **from imported governed bundles** (not hand-written files), and the output capture +
provenance carry-through. It does NOT decide the evidence gate rules (ADR-0003), the patent path (PatentEngine is a
separate port), the publish/sink, or the registry mechanics (ADR-0005) — it consumes those. PO internals (prompts,
autorater rubrics) are a black box; we constrain its I/O, not its implementation (brief §2: do NOT rebuild it).

## Context
- The brief (§2) fixes the heavy drafting work to **PaperOrchestra** (5-agent pipeline: outline → plotting →
  literature-review (Semantic Scholar-verified BibTeX + Intro/Related Work) → section-writing → content-refinement,
  plus paper-autoraters and agent-research-aggregator). CAW-03 prepares inputs, governs entry, captures outputs;
  it does **not** redesign the pipeline.
- PO must sit behind a **WritingEngine port** and be **swappable** (brief §2, §5): the harness core depends only on
  the port, never on PO directly. PO is the v1 default adapter.
- PO's input tuple is `(I=idea.md, E=experimental_log.md, T=template.tex, G=conference_guidelines.md, F=figures/)`
  in `workspace/inputs/`; outputs land in `workspace/` (research doc §2 has the exact file contract).
- Two PO facts shape governance (research §1): (a) values in `experimental_log.md` `## 2. Raw Numeric Data` are the
  **ground truth** for Step-5 hallucination checks — so CAW-03 must land *accurate, traceable* numbers there from
  CAW-01 result refs; (b) Step-3 already verifies citations via Semantic Scholar — so the Novelty port consumes
  PO's `citation_pool.json` rather than re-deriving it.
- The brief (§4) requires that PO inputs are **assembled from imported CAW-02 claim+evidence bundles + CAW-01 result
  refs**, generalizing PO's `agent-research-aggregator` ("scattered logs → inputs") into "governed workbench →
  inputs".

## Options considered

### A. Invocation mechanism
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **A. Skill invocation (in-host agent runs PO skills)** | Reuses PO parallelism, vision, web search; no re-plumbing of LLM/tooling | Couples CAW-03 runtime to a skill-capable host; harder to sandbox/audit | Config flag (`invocation_mode=skill`) |
| **B. Subprocess over a prepared `workspace/`** | Process isolation; language-agnostic; per-step logging/checkpoint; auditable | CAW-03 orchestrates step order/parallelism/retries; LLM steps still need an agent runner | **v1 default** (auditability) |
| Reimplement the pipeline in CAW-03 | Full control | Directly violates brief §2 (do NOT rebuild) | Rejected |

### B. What the port hands the engine
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Engine-neutral `EngineInputs` (normalized idea/log/template/guidelines/figures + ProvenanceMap)** rendered into PO's files by the adapter | Engine swap doesn't change assembly; provenance bidirectional | One normalization layer to define | **Chosen** |
| Hand the engine raw CAW-02 bundles | Less code | Couples every engine to CAW-02's schema; assembly logic duplicated per engine | Rejected |
| Hand-written PO input files | Trivial | Violates brief §4 (assemble from bundles, not files); no provenance | Rejected |

### C. Numbers in `experimental_log.md`
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Strict: every numeric cell traces to a CAW-01 result-registry ref** | Satisfies PO Step-5 hallucination check + the evidence gate; replayable | Needs the result-ref → table-cell mapping | **Chosen** |
| Free-text numbers from the bundle | Easy | A number with no ref can be drafted; breaks the gate (ADR-0003 §1) | Rejected |

### D. Citations
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Trust PO's S2-verified pool; feed it to the Novelty port** | No double-fetch; PO already verifies (Levenshtein>70, temporal cutoff, dedup) | Trust boundary on PO | **Chosen**; re-verify only on dispute |
| Re-verify every citation in CAW-03 | Independent | Re-implements PO's lit-review; double S2 load | Rejected |

## Decision
**PaperOrchestra is the v1 `WritingEngineAdapter`, invoked in subprocess mode over a CAW-03-owned workspace, fed by
an engine-neutral input bundle assembled from gated claims + result refs, with bidirectional provenance.**

1. **The port (ADR-0005 §3.2).** The harness core depends only on `WritingEngineAdapter` with a capability
   descriptor (`EngineDescriptor`: name/version, `invocation_modes`, `generates_figures`/`supports_figures_in`,
   `emits_citations`, `emits_scores`, `output_formats`, required/optional inputs) and the methods
   `describe() / validate() / draft() / score()` (research doc §4). Capability is **negotiated via the descriptor**,
   not branched in the core: an engine lacking figure generation sets `generates_figures=False` and preflight then
   requires `figures` be supplied or fails.
2. **Invocation: subprocess over a workspace (v1 default), skill-mode behind a config flag.** Both modes satisfy the
   same port; the core only sees the typed `EngineResult` and never knows which ran (`EngineConfig.invocation_mode`).
   CAW-03 owns the **workspace contract**: build `workspace/inputs/`, run Steps 1–5 (2‖3 in parallel), read back the
   `workspace/` outputs, and record PO's `provenance.json`. Subprocess is the auditable default for CLI/CI
   (ADR-0001); skill-mode is for an agent host.
3. **Input assembly (the heart of the wrap).** The adapter's `assemble_inputs` builds the engine-neutral
   `EngineInputs` from the imported bundle, then renders PO's `(I, E, T, G, F)` per the research §5 mapping:
   - `idea.md` ← CAW-02 method/tool (P1/P2) claim statements (Problem/Hypothesis/Methodology/Contribution; Dense if
     claims carry equations, else Sparse);
   - `experimental_log.md` §1 ← run-config metadata; §2 ← **CAW-01 result refs → markdown tables, every cell traced
     to a `result_id`, numbers verbatim, no "Table N" refs**; §3 ← evidence-linked qualitative findings, past tense,
     no citations/URLs;
   - `template.tex` ← CAW-03 template registry by paper-ladder venue target; `conference_guidelines.md` ← venue
     registry (page limit + deadline → `cutoff_date`); `figures/` ← optional pre-rendered CAW-01 figures (PlotOn),
     else empty (PO PlotOff).
4. **Assembly invariants (enforced before the engine runs).**
   - **Gate-before-assemble** (ADR-0003 §6): assembly filters to `draftable`/`draftable_with_label` claims only and
     **fails loud** with the gate report if a requested claim is blocked — PO never sees an ungated claim.
   - **Confidentiality-before-assemble** (confidentiality doc §2): internal-review-required spans are blocked from
     public-target assemblies before they reach a file.
   - **Provenance is bidirectional**: every span the assembler writes records `claim_id`/`result_id` → input
     location in a `ProvenanceMap`, so any sentence/number in `final/paper.tex` re-traces to a gated claim or CAW-01
     result. PO's own `provenance.json` (input hashes) is cross-checked but not sufficient alone.
5. **Output capture.** `draft()` returns an `EngineResult`: `paper_tex_path`, `paper_pdf_path`, `bibtex_path`,
   `citation_pool` (→ Novelty port + provenance), `figure_manifest` (figure_id → path, caption, source result_id),
   `scores` (refinement worklog + optional autoraters), `outline` (for the coverage check), `engine_provenance`,
   `status`. `score()` wraps paper-autoraters for the review checklist (ADR-0001 `run_review`).
6. **Coverage check after draft.** Cross-reference `outline.json` `section_plan`/`plotting_plan` against the gated
   claim set to confirm every claim intended for this paper is covered; every rendered figure maps 1:1 to a
   `result_registry_ref` (no figure without a backing run).
7. **Swap rule.** Any engine returning an `EngineResult` (LaTeX/PDF + provenance) satisfies the port; swapping PO
   for engine X is flipping `[adapters.engine] active` in config (ADR-0005 §4) — the gate, assembly contract, and
   lifecycle are untouched. A `NullWritingEngineAdapter` stub ships as the documented proof a second engine wires in
   by adding one adapter, not editing the core.

## Consequences
- **Easy:** swap or upgrade the engine via config; PO's parallelism/verification/vision are reused, not rebuilt;
  every drafted number and citation is traceable; the Step-5 hallucination check is satisfied by construction.
- **Easy:** the Novelty port (ADR-0005 §3.5) reuses PO's verified `citation_pool.json` instead of re-querying S2.
- **Hard / cost:** CAW-03 must orchestrate PO step ordering/parallelism/retries in subprocess mode and supply (or
  shell out to) an agent runner for PO's LLM/web/vision steps; the engine-neutral `EngineInputs` normalization is a
  real layer to maintain; PO version skew (outline.json / citation_pool.json schema drift) must be pinned via
  `EngineDescriptor.version`.
- **Follow-on runbooks:** (1) engine port + `PaperOrchestraAdapter` (subprocess first), wrapping `validate_inputs.py`
  + the 5 steps + autoraters; (2) input assembler (research §5 mapping → populated `workspace/inputs/` + ProvenanceMap);
  (3) workspace driver (run, 2‖3 parallel, capture §2.2 outputs, cross-check provenance); (4) coverage + review gate;
  (5) `NullWritingEngineAdapter` stub.

## Open questions / revisit triggers
- TODO(open-question: in subprocess mode, who runs PO's LLM/web/vision steps — does CAW-03 embed an agent runner or
  shell a non-interactive PO CLI entrypoint? confirm such an entrypoint exists.) See [../02-research/paperorchestra-integration.md](../02-research/paperorchestra-integration.md) §Open and [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: PO skill-suite versioning/compat policy when PO changes its `outline.json`/`citation_pool.json`
  schemas — how does `EngineDescriptor.version` pin it?)
- TODO(open-question: exact normalized schema for `EngineInputs.IdeaDoc`/`ExpLog` — standardize a CAW-03 intermediate
  JSON that renders to markdown so non-PO engines reuse it?)
- TODO(open-question: figure provenance — PO `captions.json` keys by `figure_id`; bind `figure_id` back to a CAW-01
  `result_id` reliably across PlotOn/PlotOff.)
- TODO(open-question: are engine runs sync `draft()` or a job-handle/poll contract? cross-ref ADR-0005 §Open and
  ADR-0001 long-running-op question.)
- **Revisit trigger:** if swapping the engine would force an edit to the evidence gate or input-assembly contract,
  the port is leaking and must be revisited.

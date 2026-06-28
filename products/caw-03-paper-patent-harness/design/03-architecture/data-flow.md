# Data Flow — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture.md), [../05-harness-core/input-assembly.md](../05-harness-core/input-assembly.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

End-to-end flows through the harness: paper drafting, the patent branch, and the patent-first interlock. Storage is
in `04-*`; the engine seam in `05-harness-core/writing-engine-adapter-paperorchestra.md`.

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

## Flow B — patent branch

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

## Governance is in the core

Gate, interlock, and confidentiality run in core services **around** adapter calls — an adapter cannot bypass them
([component-boundaries.md](./component-boundaries.md)).

## Provenance

Every drafted number/figure carries a back-reference to a CAW-01 result and a CAW-02 claim+evidence; the artifact
records its `GatedClaimSet` and engine run.

## Open questions

Reliable figure_id ↔ result_id binding across PaperOrchestra PlotOn/PlotOff modes; sync vs async engine run — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Flow A is the Milestone-1 chain; Flow B/C drive the patent + interlock runbooks.

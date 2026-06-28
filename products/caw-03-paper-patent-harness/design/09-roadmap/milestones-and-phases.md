# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [./dependency-graph.md](./dependency-graph.md)
  - [./risks-and-mitigations.md](./risks-and-mitigations.md)
  - [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface.md)
  - [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration.md)
  - [../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md)
  - [../01-decisions/ADR-0004-patent-drafting.md](../01-decisions/ADR-0004-patent-drafting.md)
  - [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters.md)
  - [../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc sequences the build of CAW-03 into **phases** that map one-to-one to runbook
folders (`10-runbooks/phase-N-*`), and fixes **Milestone 1** as the first end-to-end
evidence-gated *paper* produced by wrapping PaperOrchestra. It defines **entry/exit
criteria** per phase so an AI builder can resume cleanly after a budget interruption.
It does NOT define the DAG edge-by-edge (see [dependency-graph.md](./dependency-graph.md))
or enumerate risks (see [risks-and-mitigations.md](./risks-and-mitigations.md)).

## Phasing principle

- **Slice vertically, govern from day one.** Every phase leaves the tree green
  (compiling, lint-passing, ops-manifest valid) so an interrupted build resumes from the
  last accepted runbook — see [DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS.md).
- **Ports before adapters; governance before engine; engine before publish.** This is the
  load-bearing ordering enforced by the DAG.
- **Milestone 1 is paper-only.** Patent path, novelty governance, and future-connector
  stubs land in later phases. The *seams* for all of them exist from Phase 1 (ADR-0005),
  but only paper adapters are implemented for M1.

## Phase → runbook-folder map

| Phase | Runbook folder | Theme | Milestone |
| --- | --- | --- | --- |
| 0 | `phase-0-foundations` | Repo, storage, ops-manifest skeleton, config registry | — |
| 1 | `phase-1-ports-registry` | Five driven ports + capability descriptors + preflight + documented stubs | — |
| 2 | `phase-2-gate-and-ledger` | CAW-02 ledger import, claim typing, evidence gate (fail-closed) | — |
| 3 | `phase-3-assembly` | CAW-01 result import, engine-neutral input bundle, figure↔result provenance | — |
| 4 | `phase-4-writing-engine` | PaperOrchestra WritingEngineAdapter (subprocess), output capture | — |
| 5 | `phase-5-review-publish` | Review checklist op + LaTeX/PDF Sink + public-safe export | **M1** |
| 6 | `phase-6-novelty-ladder` | CAW-05 Novelty/Radar adapter, P1/P2/P3 ladder, threatened flagging | M2 |
| 7 | `phase-7-patent` | PatentEngine port + baseline drafter + patent-first publish interlock | M3 |
| 8 | `phase-8-surfaces` | Full API + MCP + CLI + minimal review/status UI hardening | M4 |
| 9 | `phase-9-stubs-future` | Wiki / experiment-server / venue / filing connector stubs fleshed as adapters | M5 |

> Phases 0–5 are the critical path to M1. Phases 6–9 are parallelizable once M1's core
> ports/registry exist.

## Milestone 1 — first evidence-gated paper (the headline)

**Definition of done:** an operator runs the harness on a single artifact and gets a
compiled, public-safe PDF whose every claim passed the evidence gate, with provenance
preserved from CAW-02 claim → CAW-01 result → figure in the PDF.

The M1 op-chain (each is a governed op from the ADR-0001 manifest; each is the *only* way
to perform its action):

```
import_bundle      # CAW-02 SourceAdapter -> referenced claim ledger
  -> build_ledger  # typed claims P1/P2/P3, evidence links (refs only, never re-owned)
  -> gate_claims   # evidence gate, fail-closed; blocked claims -> backlog
  -> assemble_inputs   # GATED claims + CAW-01 result refs -> engine-neutral bundle
  -> draft_paper       # WritingEngineAdapter (PaperOrchestra, subprocess)
  -> review            # review checklist op (human gate)
  -> publish/export    # LaTeX/PDF Sink, public-safe only
```

**M1 explicitly excludes:** patent path, CAW-05 novelty import, paper-ladder portfolio
automation, and any future connector. Their ports exist; their adapters do not.

**M1 invariant checks (must hold):**
- Generated text is NEVER accepted as evidence (gate rejects it categorically).
- A claim that fails the gate cannot reach `assemble_inputs` (precondition blocks it).
- Export is public-safe: confidentiality boundary inherited verbatim from CAW-02 (ADR-0007).
- Bidirectional provenance `figure_id ↔ result_id` round-trips in the figure/table manifest.

## Entry / exit criteria per phase

### Phase 0 — Foundations
- **Entry:** PRODUCT-BRIEF + ADRs accepted; empty repo.
- **Exit:** ops-manifest stub lists all governed ops as not-implemented; SQLite/file storage
  schema for CAW-03-owned data (ledger refs, artifact state, manifests, registry) compiles;
  config registry loads. Tree green.

### Phase 1 — Ports & registry
- **Entry:** Phase 0 exit.
- **Exit:** all five driven ports (Source, WritingEngine, PatentEngine, Sink/Publish,
  Novelty/Radar) defined as typed interfaces with **capability descriptors**; config-driven
  registry resolves a port→adapter; **preflight** rejects an adapter whose descriptor lacks a
  required capability; every future adapter present as a **documented stub** (interface +
  not-implemented marker + config example). Core depends only on ports.

### Phase 2 — Gate & ledger
- **Entry:** Phase 1 exit (SourceAdapter contract exists).
- **Exit:** `import_bundle` pulls a CAW-02 bundle by id/URI (referenced, not copied);
  `build_ledger` types claims P1/P2 vs P3; `gate_claims` enforces a profile-configurable,
  type-specific evidence gate that is **fail-closed** and whose one non-relaxable invariant is
  "generated text is never evidence"; blocked claims persist as backlog. Unit-tested.

### Phase 3 — Assembly
- **Entry:** Phase 2 exit; CAW-01 result-import path stubbed in SourceAdapter.
- **Exit:** `assemble_inputs` produces an **engine-neutral input bundle** from GATED claims +
  CAW-01 result refs; figure/table manifest records `figure_id ↔ result_id`; gate is a hard
  **precondition** (un-gated claims cannot enter). No engine-specific fields leak into the bundle.

### Phase 4 — Writing engine
- **Entry:** Phase 3 exit.
- **Exit:** PaperOrchestra runs as the v1 WritingEngineAdapter in **subprocess** mode over a
  CAW-03-owned workspace; `draft_paper` consumes the neutral bundle and captures outputs
  (LaTeX, figures, citation_pool) back into the artifact; adapter swappable (no core change to
  drop in another engine). PaperOrchestra is NOT modified.

### Phase 5 — Review & publish  → **Milestone 1**
- **Entry:** Phase 4 exit.
- **Exit:** `review` checklist op gates submission-readiness (human reviewer); `publish/export`
  emits LaTeX + compiled PDF through the Sink adapter with public-safe filtering; M1 invariant
  checks above all pass on a real artifact. **M1 reached.**

### Phase 6 — Novelty & ladder  → M2
- **Entry:** M1.
- **Exit:** Novelty/Radar adapter imports CAW-05 radar; harness (not engine) decides novelty,
  reusing PaperOrchestra's Semantic-Scholar-verified citation_pool as paper prior-art without
  re-querying (ADR-0006); P1/P2/P3 paper-ladder plan tracked; threatened / patent-sensitive
  claims flagged.

### Phase 7 — Patent  → M3
- **Entry:** M2 (shared front / GatedClaimSet exists).
- **Exit:** PatentEngine port + v1 baseline patent drafter (config-selected, parallel to
  WritingEngine); `draft_patent` path live; **patent-first publish interlock** (default-deny)
  blocks `publish/export` for patent-sensitive claims until human/counsel gate clears;
  provisional-first strategy (TODO(open-question: jurisdiction)). PaperOrchestra never drafts a patent.

### Phase 8 — Surfaces  → M4
- **Entry:** M3.
- **Exit:** API + MCP + CLI + minimal review/status UI all four surfaces drive the *same*
  finite op-manifest; no surface can bypass a governed op.

### Phase 9 — Future connector stubs  → M5
- **Entry:** M4.
- **Exit:** wiki publish, internal experiment-server source, venue submission, patent-filing
  stubs each upgradable by filling one adapter — core untouched (ADR-0005 design rule verified).

## Open questions
- Patent jurisdiction / provisional-first sequencing — TODO(open-question: see ../08-research-plan/open-questions.md).
- Whether a stricter pre-filing/counsel confidentiality tier is its own phase or folds into Phase 7 (ADR-0007).
- M1 acceptance corpus: which single CAW-02 bundle + CAW-01 run set is the canonical smoke test — TODO(open-question).

## Implications for runbooks
- One runbook folder per phase; runbook numbers `RB-NXX` match phase N.
- The M1 op-chain maps to one runbook per op in phases 2–5; each leaves the tree green.
- Phase 1 must ship stubs for *all* future adapters so later phases are "fill one adapter" units.

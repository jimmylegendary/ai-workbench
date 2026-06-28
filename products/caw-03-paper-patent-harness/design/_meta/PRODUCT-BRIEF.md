# PRODUCT BRIEF — Paper & Patent Writing Harness (CAW-03)

> Single source of truth for **CAW-03**. Every design doc + runbook must stay consistent with this brief.
> If a doc contradicts the brief, the brief wins. Do not fabricate internal facts; capture unknowns in
> `08-research-plan/open-questions.md`.

## 0. The one hard constraint
We are NOT building the product here. We write the detailed design + build instructions (runbooks) an AI builder
executes — concrete features, methodology, named tools, and tool-specific runbooks. The builder writes the code.

## 1. Identity & independence
- **Product:** Paper & Patent Writing Harness (CAW-03).
- **One-liner:** an evidence-gated **harness** (not a free-form "write a paper" chatbot) that turns verified
  claims, evidence, simulation results, and artifacts into **papers and patents**, by **wrapping a pluggable
  writing engine** and adding governance the engine does not provide.
- **Independent, standalone product** in the `ai-workbench` family of 6. Its own core, data, deploy. **No shared
  runtime substrate.** All inbound/outbound data crosses explicit **import/export boundaries** and **adapters**.
- **Position:** sits at the TOP of the trust ladder — it consumes credible, evidence-backed inputs; it does not
  drive the trust ladder prematurely. (Deferred until CAW-01 has produced ≥1 credible projection.)

## 2. The wrap: PaperOrchestra is the writing engine (do NOT rebuild it)
The heavy "write the paper" work is delegated to **PaperOrchestra** (the existing 5-agent pipeline:
outline → plotting → literature-review (Semantic Scholar-verified BibTeX + Intro/Related Work) →
section-writing → content-refinement, plus the paper-autoraters and the agent-research-aggregator).
- PaperOrchestra sits behind a **WritingEngine port** (an adapter). It is the DEFAULT engine but is **swappable**.
- CAW-03 does NOT redesign or reimplement the drafting/plotting/lit-review/refinement pipeline. CAW-03 prepares
  the engine's inputs, governs what may enter a draft, handles patents, and post-processes/publishes outputs.

## 3. The governance delta (what CAW-03 actually adds)
The modules from items/03 that PaperOrchestra does NOT provide:
- **Claim ledger** — the authoritative list of claims, each typed (P1/P2 method/tool vs P3 future-device) and
  linked to evidence. (Imported from CAW-02; CAW-03 does not re-own the knowledge repo.)
- **Evidence completeness gate** — the minimum **evidence gate** a claim must pass before it may enter a paper/
  patent draft. A claim with insufficient/no evidence cannot be drafted. Generated text is never evidence.
- **Novelty / claim-boundary checker** — novel vs threatened (uses related-work + CAW-05 radar signals);
  which claims need **patent-first handling** before publication.
- **Result registry reference + figure/table manifest** — links simulator results (from CAW-01) to figures/tables
  the engine will render; CAW-03 references the registry, it does not own the runs.
- **Patent drafting module** — a SEPARATE path from paper drafting: claims, prior-art search, patentability,
  patent-first gating. (PaperOrchestra is papers-only.)
- **Paper ladder (P1/P2/P3) + portfolio** — plan/track the program paper sequence and per-paper readiness gates.
- **Confidentiality filter** — public-source-assisted vs internal-review-required; never leak internal Samsung/SAIT.
- **Review checklist** — gate before "submission-ready".

## 4. Inputs & outputs (import/export boundaries)
- **Import from CAW-02:** cited **claim + evidence bundles** (the primary source of truth for drafting).
- **Import from CAW-01:** **run evidence / projections / result registry refs** → figures/tables/results.
- **Adapter that builds engine inputs:** CAW-03 assembles PaperOrchestra's inputs (idea.md, experimental_log.md,
  template.tex, conference_guidelines.md, figures) **from the imported bundles**, not from hand-written files.
  (This generalizes PaperOrchestra's `agent-research-aggregator` "scattered logs → inputs" into "workbench → inputs".)
- **Export / publish:** LaTeX + compiled PDF (papers); patent draft documents; review/score reports.

## 5. Open integration interfaces (REQUIRED design property — leave seams open, do NOT build connectors yet)
CAW-03 must be designed as **ports & adapters**, generalized and **config-driven/customizable**, so future
integrations plug in WITHOUT redesign. Define the ports now; implement only the v1 adapters.

| Port | v1 adapter (implemented) | Future adapters (PORT ONLY in v1 — design the seam, stub it) |
| --- | --- | --- |
| **SourceAdapter** (where claims/evidence/results come from) | CAW-02 bundle import, CAW-01 result import | **internal company wiki**, **internal experiment-server infra**, scattered agent logs, arbitrary user-supplied bundle |
| **WritingEngineAdapter** (drafting) | PaperOrchestra | other writing engines |
| **PatentEngineAdapter** (patent drafting) | a v1 baseline patent drafter | external patent tooling |
| **Sink/PublishAdapter** (where outputs go) | LaTeX/PDF files | **internal wiki publish**, venue/conference submission, patent-filing systems |
| **Novelty/RadarAdapter** (related-work + threat signals) | related-work tracker; CAW-05 import | live prior-art/patent search services |

Design rules for the seams:
- Each port is a typed interface with a **capability/config descriptor**; adapters are **registered** and
  selected by config, not hard-coded.
- A "future" adapter ships as a **documented stub** (interface + a not-implemented marker + config example), so
  wiring the real connector later is filling in one adapter, not changing the core.
- The core/harness logic depends only on ports, never on a concrete adapter (CAW-01/02/wiki/exp-server are all
  just adapters behind the same SourceAdapter contract).

## 6. Core domain (the heart)
- **Artifact lifecycle:** `claim(s) → evidence gate → draft (engine) → review checklist → (paper PDF | patent draft)`,
  with provenance preserved end to end and a status/state machine per artifact.
- **Paper vs patent:** shared front (claim/evidence selection, novelty) but distinct drafting + gates; some claims
  are **patent-first** (file before publish).
- **Generalization:** the harness is engine/source/sink-agnostic; PaperOrchestra + CAW-01/02 + LaTeX are just the
  v1 wiring.

## 7. Data (CAW-03's own, minimal)
- CAW-03 stores the **claim ledger snapshot/refs**, **draft + artifact lifecycle/state**, **paper-ladder plan**,
  **figure/table manifest**, **review/score results**, and **adapter/config registry**. It references (does not
  duplicate) CAW-02 claims/evidence and CAW-01 results by id/URI. Large artifacts (PDFs, traces) by path.
- Storage direction: lightweight, file/SQLite-friendly, consistent with the other products (decide in ADR).

## 8. Decisions to make (each gets an ADR)
- Product surface (harness control: API + MCP + CLI + minimal review/status UI).
- **PaperOrchestra integration / WritingEngine port** (how CAW-03 invokes it; input assembly; output capture).
- **Evidence gate & claim ledger** (the minimum gate; claim typing P1/P2/P3; provenance).
- **Patent drafting module** (paper vs patent differences; patent-first handling).
- **Ports & adapters architecture** (the open SourceAdapter/Sink/Engine/Novelty seams; config-driven registry). ← load-bearing
- **Paper ladder & novelty governance** (P1/P2/P3 + threatened-claim handling; CAW-05 import).
- **Confidentiality / boundary** (public-safe vs internal-review; reuse CAW-02 boundary semantics).
- **Artifact lifecycle & storage**.

## 9. Non-goals (v1)
- Rebuilding the writing pipeline (PaperOrchestra is the engine).
- Implementing the wiki / experiment-server connectors (define + stub the PORTS only).
- Autonomous submission to venues or autonomous patent filing (human gate required).
- Owning the knowledge repository (CAW-02) or the simulation runs (CAW-01).
- Full continual paper-portfolio automation; v1 tracks the ladder, Jimmy decides.

## 10. Guardrails (inherited, all products)
- No confidential company data in public-facing outputs; public outputs from public-safe sources only.
- Never conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate; generated summaries are not evidence.
- Prefer small vertical slices that prove workflow semantics over broad platform scaffolding.
- Automatic generation is proposal/draft generation; Jimmy is the reviewer for strategic + publish/file decisions.

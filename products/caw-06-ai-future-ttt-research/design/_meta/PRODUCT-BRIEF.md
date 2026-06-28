# PRODUCT BRIEF — AI Future / TTT Research Automation (CAW-06)

> Single source of truth for **CAW-06**. Every design doc + runbook must stay consistent with this brief.
> If a doc contradicts the brief, the brief wins. Capture unknowns in `08-research-plan/open-questions.md`.

## 0. The one hard constraint
We are NOT building the product here. We write the detailed design + build instructions (runbooks) an AI builder
executes — concrete features, methodology, named tools, tool-specific runbooks. The builder writes the code.

## 1. Identity & independence
- **Product:** AI Future / TTT Research Automation (CAW-06).
- **One-liner:** automates **technology scouting → claim extraction → hypothesis generation → small experiment
  planning → result logging → implication mapping** around the future of AI — with **TTT (test-time training /
  test-time compute)** as the lead theme — connecting public research to concrete, company-relevant experiments
  without overclaiming.
- **Independent, standalone product** in the `ai-workbench` family of 6. Own core, data, deploy. **No shared
  runtime substrate.** It ingests public research (and imports TTT signals from CAW-05) and **exports** to other
  products across explicit boundaries.
- **Strategic framing:** TTT is a **candidate future WORKLOAD AXIS** for the simulation control plane (CAW-01).
  Inference that **writes back** — weight updates, gradients, optimizer state, write traffic, updated-weight reuse
  — could create a **memory axis not captured by read-dominant LLM serving profiles**. CAW-06's job is to turn
  that hypothesis into checkable experiments and a **writeback-traffic schema** that bridges into CAW-01's IR.

## 2. Problem & value
- **Problem:** future-AI / TTT claims are uncertain and easy to over- or under-claim; they rarely get connected to
  concrete experiments or to memory-system implications; failures are lost.
- **Unit of value:** one **tracked research thread** — `source → claim → hypothesis → small experiment → result
  (incl. failure) → implication` — with provenance and explicit uncertainty.
- **Why separate:** hypothesis tracking + small-experiment running + implication mapping is its own discipline,
  distinct from the simulator (CAW-01), the knowledge repo (CAW-02), and the radar (CAW-05).

## 3. Users & top use cases
- **Personas:** Jimmy (researcher/reviewer), the team, AI agents (the `ExperimentScout`).
- **Top use cases:**
  1. `ExperimentScout`: discover TTT sources → extract claims → generate hypotheses (uncertainty-tagged).
  2. Plan a **minimal reproduction / toy experiment** for a checkable claim; log the result (incl. failure).
  3. Map a finding's **implications** (AI services, education, dev platforms, models, hardware, memory-centric systems).
  4. Produce **writeback-traffic schema fields** for a TTT variant → export to CAW-01's IR (L0/L1 bridge).
  5. Import a TTT **radar signal from CAW-05** → open a research thread.
  6. Export a verified claim+evidence to CAW-02 (knowledge) / a future-workload open question to CAW-01.

## 4. Product surface(s)
- **Primary:** the **ExperimentScout pipeline** (scheduled/triggered) + a **CLI** and **MCP** to run/inspect it.
- **Outputs:** research-thread records, a **small-experiment ledger**, hypothesis cards, implication maps, and
  **writeback-traffic schema** artifacts.
- One product core behind all surfaces; no shared substrate.

## 5. Core domain (the heart)
- **ExperimentScout workflow:** source discovery → claim extraction → hypothesis generation → minimal-reproduction
  planning → result logging → implication mapping (the 6 stages from items/06).
- **Hypothesis representation (no overclaim):** hypotheses carry explicit **status/uncertainty** (hypothesis /
  supported / refuted / inconclusive), evidence links, and never present a hypothesis as a settled claim.
- **Small-experiment ledger:** minimal reproductions / toy experiments with config + result + verdict; **failures
  are first-class and kept useful** (negative results recorded, not discarded).
- **Writeback-traffic schema (the CAW-01 bridge):** schema fields modeling TTT write traffic — write bandwidth,
  write endurance, near-memory update/optimization, updated-state residency, capacity/bandwidth-ratio changes over
  context/update frequency — designed to connect to CAW-01's L0/L1 memory-annotated IR. *(Can write traffic be
  modeled at L0/L1 before full syntorch/vLLM integration? — a core design question.)*
- **Memory-centric hypothesis (to investigate, not settled):** TTT-class workloads may need memory-device
  properties different from read-dominant inference-serving assumptions.

## 6. Core research themes (seed; 5–10 tracked)
TTT / test-time training variants that update weights or state during inference; test-time compute & its memory
traffic; near-memory / in-memory update; optimizer-state residency; updated-weight reuse; writeback bandwidth/
endurance implications. *(Verify which TTT variants actually write back in the first research run.)*

## 7. Data
- CAW-06's OWN store. Direction: markdown/JSON + a small experiment/result ledger (consistent with the family);
  large experiment artifacts by path. Every item carries provenance, uncertainty/status, and `boundary`. Decide
  specifics in ADR.

## 8. Import / export boundaries (to other independent products)
- **Imports:** public research sources; **TTT radar signals from CAW-05**.
- **Exports:** **writeback-traffic schema + future-workload open questions → CAW-01**; **claims+evidence → CAW-02**;
  (optionally) novelty cues → CAW-03. All explicit file/API boundaries between independent products — no shared store.

## 9. Open integration interfaces (design the seams; build only v1)
Ports & adapters so sources, experiment runners, and export targets plug in without redesign:
- **SourceAdapter:** v1 = arXiv/Semantic Scholar + CAW-05 signal import; stubs = others.
- **ExperimentRunnerAdapter:** v1 = a minimal local toy-experiment runner; stubs = external compute / HW.
- **ExportAdapter:** v1 = CAW-01 (writeback schema/open questions), CAW-02 (claims); stubs = others.
- Config-driven registry + documented stubs (same pattern as CAW-03/04/05).

## 10. Decisions to make (each gets an ADR)
- Product surface (ExperimentScout pipeline + CLI + MCP) and outputs.
- **Hypothesis representation & uncertainty** (no overclaim). ← load-bearing
- **Small-experiment ledger** (minimal reproductions; failures-useful; reproducibility).
- **Writeback-traffic schema** + the CAW-01 L0/L1 bridge. ← load-bearing
- Source/claim ingestion (+ CAW-05 import) + ports.
- Implication mapping.
- Storage + scheduling/automation.
- Export boundaries to CAW-01/CAW-02.

## 11. Non-goals (v1)
- Large-scale training or running real TTT at scale (v1 = minimal reproductions / toy experiments only).
- Asserting settled claims about future AI (everything carries explicit uncertainty).
- Becoming the simulator (CAW-01), the knowledge repo (CAW-02), or the radar (CAW-05) — it exports to them.
- Full syntorch/vLLM integration (v1 may model writeback traffic at L0/L1 abstractly first).

## 12. Guardrails (inherited, all products)
- No confidential company data in public-facing outputs; only legally/ToS-safe sources ingested.
- Never conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate; generated summaries are not evidence; a
  hypothesis is never presented as a settled claim.
- Prefer small vertical slices (one checkable TTT claim → toy experiment → implication) over broad scaffolding.
- Automatic scouting is proposal/hypothesis generation; Jimmy is the reviewer for strategic decisions.

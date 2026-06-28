# Personas & Use Cases — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision.md](./vision.md), [scope-and-non-goals.md](./scope-and-non-goals.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Who CAW-03 serves and the concrete walkthroughs it must support. Each use case ends in a governed artifact with
provenance, or an explicit gate/block.

## Personas

| Persona | Goal | Needs from CAW-03 |
| --- | --- | --- |
| **Author (Jimmy)** | Turn evidence into papers/patents fast, defensibly | Gated drafting, novelty/ladder view, one-command engine run |
| **IP / counsel reviewer** | Protect patentable ideas before disclosure | Patent-first interlock, counsel confidentiality tier, ready-for-filing handoff |
| **Reviewer (Jimmy)** | Approve publish/file decisions | Evidence completeness, review checklist, score readout, blocked-claim backlog |
| **AI agent** | Drive the harness programmatically | Stable op-manifest via MCP/CLI; cannot bypass the gate |

## Use cases

### UC-1 — Evidence-gated paper (the vertical slice)
1. `import_bundle` a CAW-02 cited claim+evidence bundle + CAW-01 result refs.
2. `build_ledger` → `gate_claims` (P1/P2/P3 thresholds; generated text rejected as evidence).
3. `assemble_inputs` → engine-neutral bundle (idea/experimental_log/figures) from **gated** claims only.
4. `draft_paper` via PaperOrchestra (subprocess) → LaTeX/PDF + scores; provenance figure↔result preserved.
5. `review` checklist → `publish/export` (public-safe).
**Done when:** a PDF exists whose claims all passed the gate and trace to evidence.

### UC-2 — Patent path
1. Same front (gated claim set), but `draft_patent` via the `PatentEngine` adapter (not PaperOrchestra).
2. Patent-specific structure (claims, spec, prior-art); counsel confidentiality tier.
**Done when:** a patent draft is ready for the human/counsel filing gate.

### UC-3 — Patent-first interlock
1. A claim is flagged **patent-sensitive** (novelty/claim-boundary).
2. Any attempt to `publish` a paper containing it is **default-denied** until the patent gate clears.
**Done when:** publish is blocked with a clear reason; clears only after the interlock is released.

### UC-4 — Novelty / ladder planning
1. `run_novelty` using PaperOrchestra's `citation_pool` + imported CAW-05 radar signals.
2. Classify claims novel vs threatened; place on the P1/P2/P3 ladder.
**Done when:** the ladder shows per-paper readiness + threatened/patent flags.

### UC-5 — Future connector via stub (no redesign)
1. Operator configures a `SourceAdapter`/`Sink` for the **internal wiki** (today: a documented stub).
2. The harness selects it by config; capability preflight reports "not implemented" safely.
**Done when:** wiring the real connector later is implementing one adapter — the core is untouched.

## Anti-use-cases (v1)

Free-form "write me a paper" without gated claims; autonomous submission/filing; editing CAW-01/CAW-02 data.

## Open questions

Claim-typing authority (auto vs human), counsel tier definition — [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

UC-1 is the Milestone-1 acceptance; UC-2/UC-3 drive the patent runbooks; UC-5 drives the ports/stub runbooks.
